import type { SupabaseClient } from '@supabase/supabase-js';
// TYPE-ONLY on purpose. discount-codes.ts imports calculateDiscountAmount from
// this file at runtime; a runtime import back would be a module cycle. `import
// type` is erased at emit, so this stays one-directional.
import type { AppliedDiscount, DiscountValidationResult } from '@/lib/discount-codes';
import type { Product } from '@/types/product';
import { isProductPurchasable, normalizeProductQuantity } from '@/types/product';
import { fetchSpotData } from '@/lib/spot-price';
import { getProductImages, getProductMetal, getProductWeight, getSnapshotPrice } from '@/lib/sales';
import { getCheckoutShippingFee, isCheckoutShippingMethod } from '@/lib/checkout-shipping';

// Authoritative checkout pricing. This is the single source of truth for tax,
// shipping, and the per-item snapshot prices — the frontend never sends amounts.
// FL_TAX_RATE is THE one source of truth for the rate — cart/checkout/admin all
// import it so the displayed and charged rate can never drift apart again.
export const FL_TAX_RATE = 0.06;
// Human label for the rate, kept next to it so the two never disagree.
export const FL_TAX_RATE_LABEL = '6%';

export function isFloridaState(state: string | null | undefined): boolean {
  const normalized = (state ?? '').trim().toLowerCase().replace(/\.$/, '');
  return normalized === 'fl' || normalized === 'fla' || normalized === 'florida';
}

// `shippingMethod` is the raw checkout value, not the DB-normalized value.
export function chargesFlSalesTax(
  shippingMethod: string,
  shippingState: string | null | undefined,
): boolean {
  return shippingMethod === 'local-pickup' || isFloridaState(shippingState);
}

/** Round to whole cents. Used so order amounts and the PayPal breakdown agree. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * THE discount calculation, for both code types. Resolves to a dollar amount
 * rounded to cents and CLAMPED to the merchandise subtotal.
 *
 * The clamp is load-bearing, not defensive tidiness: a $100 fixed code against
 * an $80 order must take $80, never $100. Without it the order carries a
 * negative merchandise total, which breaks the $0/negative rejection rule
 * (CODE-D01) below and produces a PayPal breakdown that cannot sum.
 *
 * Applies to MERCHANDISE ONLY — shipping and tax are computed after it, and the
 * shipping tier keys off the PRE-discount subtotal (the insured value of what is
 * actually in the box does not change because the buyer paid less for it).
 *
 * Lives here rather than in discount-codes.ts so that module can import it
 * alongside round2 without creating an import cycle; it is re-exported there.
 */
export function calculateDiscountAmount(
  type: 'percent' | 'fixed',
  value: number,
  subtotal: number,
): number {
  if (!(subtotal > 0) || !(value > 0)) return 0;
  const raw = type === 'percent' ? (subtotal * value) / 100 : value;
  return round2(Math.min(Math.max(raw, 0), subtotal));
}

/** Owner policy: Florida tax applies to taxable merchandise plus charged shipping. */
export function calculateFlSalesTax(taxableMerchandise: number, shippingFee = 0): number {
  const taxableBase = Math.max(0, taxableMerchandise) + Math.max(0, shippingFee);
  return round2(taxableBase * FL_TAX_RATE);
}

/** Display checkout amounts to the same cent precision used for payment. */
export function formatCheckoutCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export const CHECKOUT_PRODUCT_COLUMNS = [
  'id',
  'category',
  'metal_type',
  'metal_variant',
  'title',
  'item_year',
  'price_mode',
  'purity',
  'weight_grams',
  'inventory_number',
  'sku',
  'gram_weight',
  'pricing_multiplier',
  'status',
  'images',
  'image_urls',
  'manual_price_label',
  'asking_price',
  'quantity',
].join(', ');

const CHECKOUT_PRODUCT_COLUMNS_WITHOUT_ITEM_YEAR = CHECKOUT_PRODUCT_COLUMNS
  .split(', ')
  .filter((column) => column !== 'item_year' && column !== 'quantity')
  .join(', ');

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

export type CheckoutOrderItem = {
  product_id: string;
  inventory_number: string;
  title_snapshot: string;
  item_year_snapshot: number | null;
  metal_snapshot: string;
  purity_snapshot: string | null;
  gram_weight_snapshot: number | null;
  // Unit price for one unit of the item. The line total is price_snapshot * quantity.
  price_snapshot: number;
  quantity: number;
  image_snapshot: string | null;
};

// A requested cart line: which product and how many units of it the buyer wants.
export type OrderLine = { productId: string; quantity: number };

// Accept either the legacy string[] of product ids (each treated as quantity 1)
// or the quantity-aware line shape. Normalizes to unique lines with a positive
// integer quantity, dropping blanks.
export function normalizeOrderLines(input: string[] | OrderLine[]): OrderLine[] {
  const byId = new Map<string, number>();
  for (const entry of input) {
    const productId = typeof entry === 'string' ? entry : String(entry?.productId ?? '');
    if (!productId) continue;
    const rawQty = typeof entry === 'string' ? 1 : Number(entry?.quantity);
    const quantity = Number.isFinite(rawQty) ? Math.max(1, Math.floor(rawQty)) : 1;
    byId.set(productId, (byId.get(productId) ?? 0) + quantity);
  }
  return Array.from(byId, ([productId, quantity]) => ({ productId, quantity }));
}

export type OrderDraft = {
  items: CheckoutOrderItem[];
  subtotal: number;
  /** Dollars taken off merchandise. 0 when no code was applied. */
  discount: number;
  /** Which code produced `discount`, for the order snapshot. */
  appliedDiscount: AppliedDiscount | null;
  tax: number;
  shippingFee: number;
  total: number;
};

/**
 * Resolves a discount against the authoritative subtotal. Supplied by the
 * caller (the route) rather than looked up here, because the discount_codes
 * table is admin-only and needs the service client, while this function is
 * given the request-scoped client. Returning null means "no code was offered".
 */
export type DiscountResolver = (subtotal: number) => Promise<DiscountValidationResult | null>;

/**
 * Machine-readable reason for a rejected order draft. The client maps these to
 * precise bilingual guidance instead of pattern-matching the English message
 * (which previously showed sold-out copy for the Express-over-$5,000 case and
 * dropped the call-us instruction for outage/price-confirmation cases).
 */
/**
 * Does the total the buyer is LOOKING AT differ from the total we would charge?
 *
 * Why this exists: 64% of the available catalog is `spot-multiplier`, priced as
 * `melt x multiplier` from the live metal feed at order time. The cart stores
 * the price LABEL captured when the item was added, the product page it came
 * from is ISR-cached (300s), and the feed behind that is cached (300s) — so the
 * displayed figure trails the chargeable one by however long the item sat in
 * the cart. Measured on one real bracelet: $6,462.72 in the morning, $6,393.39
 * a few hours later. Same code, same product, $69.33 apart.
 *
 * ⚠️ **`quotedTotal` is NEVER charged.** The server always charges its own
 * computed price; this value only decides whether to stop and ask the buyer to
 * re-confirm. That is what makes it safe to accept an unsigned price-shaped
 * number from the client: a malicious caller claiming it displayed $1 earns a
 * pointless confirmation prompt and cannot talk the price down. Charging the
 * client's figure would require a signed quote and a tolerance band — a
 * different and much larger feature.
 *
 * Compared in whole CENTS. Both sides are rounded upstream, but float equality
 * would still fire on `1066.5500000000002 !== 1066.55`.
 *
 * A missing/unparseable quote is "no opinion", not drift — an older client or a
 * dropped field must not be blocked by a check it cannot satisfy.
 */
export function quotedTotalHasDrifted(
  quotedTotal: unknown,
  authoritativeTotal: number,
): boolean {
  if (quotedTotal === null || quotedTotal === undefined || quotedTotal === '') return false;
  const quoted = Number(quotedTotal);
  if (!Number.isFinite(quoted)) return false;
  return Math.round(quoted * 100) !== Math.round(authoritativeTotal * 100);
}

/** Authoritative figures returned by the quote endpoint and by a drift rejection. */
export type OrderQuote = {
  items: { productId: string; unitPrice: number; quantity: number; title: string }[];
  subtotal: number;
  discount: number;
  tax: number;
  shippingFee: number;
  total: number;
};

/** Project an order draft into the wire shape shared by /quote and the guard. */
export function toOrderQuote(draft: OrderDraft): OrderQuote {
  return {
    items: draft.items.map((item) => ({
      productId: item.product_id,
      unitPrice: item.price_snapshot,
      quantity: item.quantity,
      title: item.title_snapshot,
    })),
    subtotal: draft.subtotal,
    discount: draft.discount,
    tax: draft.tax,
    shippingFee: draft.shippingFee,
    total: draft.total,
  };
}

export type OrderDraftErrorCode =
  | 'unavailable'
  | 'express_unavailable'
  | 'spot_unavailable'
  | 'call_to_purchase'
  // The buyer's screen and the authoritative total disagree — metal spot moved
  // while the item sat in the cart. Never charged; the buyer re-confirms.
  | 'price_changed'
  // The buyer applied a discount code that is no longer usable by the time they
  // paid (deactivated, expired, or its redemption cap filled while they shopped).
  // Rejecting is deliberate: silently charging full price would surprise someone
  // who is looking at a discounted total on screen.
  | 'discount_invalid';

export type OrderDraftError = { error: string; status: number; code?: OrderDraftErrorCode };

export function isOrderDraftError(value: OrderDraft | OrderDraftError): value is OrderDraftError {
  return (value as OrderDraftError).error !== undefined;
}

/**
 * Load the products for a cart, verify they are all still purchasable, and build
 * the order item snapshots + authoritative totals. Returns an error shape (with
 * an HTTP status) instead of throwing so route handlers can respond directly.
 */
export type OrderDraftOptions = {
  /**
   * An agreed price that replaces the live price of ONE product — a site offer
   * the owner accepted, or a counter-offer the buyer is paying (lib/offers.ts).
   * The caller has already proved the buyer is entitled to it; this function
   * only applies it. Everything else (availability, stock, shipping tier, tax)
   * runs exactly as for any order, keyed off the agreed price.
   */
  unitPriceOverride?: { productId: string; unitPrice: number } | null;
};

export async function buildOrderDraft(
  supabase: SupabaseClient,
  lines: string[] | OrderLine[],
  shippingMethod: string,
  shippingState?: string | null,
  resolveDiscount?: DiscountResolver | null,
  options: OrderDraftOptions = {},
): Promise<OrderDraft | OrderDraftError> {
  const override = options.unitPriceOverride && options.unitPriceOverride.unitPrice > 0
    ? options.unitPriceOverride
    : null;
  const orderLines = normalizeOrderLines(lines);
  if (orderLines.length === 0) {
    return { error: 'Cart is empty', status: 400 };
  }

  const productIds = orderLines.map((line) => line.productId);
  const quantityByProductId = new Map(orderLines.map((line) => [line.productId, line.quantity]));

  // Whitelist the shipping method before loading anything. An unknown value
  // must never silently resolve to a $0 fee while still being recorded as a
  // shipped order. The tier fee itself is resolved AFTER the subtotal is
  // computed, because fees are keyed to the order's merchandise value.
  if (!isCheckoutShippingMethod(shippingMethod)) {
    return { error: 'Invalid shipping method.', status: 400 };
  }

  const [productResult, spotData] = await Promise.all([
    supabase.from('products').select(CHECKOUT_PRODUCT_COLUMNS).in('id', productIds),
    fetchSpotData(),
  ]);

  let products: unknown[] | null = productResult.data as unknown[] | null;
  let productsError = productResult.error;
  if (isMissingItemYearColumnError(productsError)) {
    const fallback = await supabase
      .from('products')
      .select(CHECKOUT_PRODUCT_COLUMNS_WITHOUT_ITEM_YEAR)
      .in('id', productIds);
    products = (fallback.data as unknown[] | null)?.map((product) => ({
      ...(product as Record<string, unknown>),
      item_year: null,
      quantity: 1,
    })) ?? null;
    productsError = fallback.error;
  }

  if (productsError) {
    return { error: productsError.message, status: 500 };
  }

  const typedProducts = (products ?? []) as unknown as Product[];
  if (typedProducts.length !== productIds.length) {
    return { error: 'One or more cart items could not be found', status: 400 };
  }

  const unavailable = typedProducts.filter((product) => !isProductPurchasable(product.status, product.quantity));
  if (unavailable.length > 0) {
    return {
      error: `Unavailable item: ${unavailable.map((product) => product.title).join(', ')}`,
      status: 409,
      code: 'unavailable',
    };
  }

  // Reject any line whose requested quantity exceeds live stock. This is the
  // snapshot gate; the capture RPC re-checks under a row lock before selling.
  const overstocked = typedProducts.filter(
    (product) => (quantityByProductId.get(product.id) ?? 1) > normalizeProductQuantity(product.quantity),
  );
  if (overstocked.length > 0) {
    return {
      error: `Not enough stock for: ${overstocked
        .map((product) => `${product.title} (only ${normalizeProductQuantity(product.quantity)} available)`)
        .join(', ')}. Please lower the quantity.`,
      status: 409,
      code: 'unavailable',
    };
  }

  // If the live metal feed is down, fetchSpotData() returns a hardcoded fallback
  // spot (spot-price.ts). That is fine for *display*, but must never set the
  // chargeable price of a spot-linked item — the fallback can diverge sharply from
  // the real market and would let a buyer lock in an off-market price during an
  // outage. Manual fixed-price items are unaffected because their chargeable
  // amount comes from the saved Price Label.
  if (spotData.source === 'fallback') {
    // An agreed (offer) price does not come from the feed, so an outage does
    // not stop it.
    const spotLinked = typedProducts.filter(
      (product) => product.price_mode !== 'manual' && product.id !== override?.productId,
    );
    if (spotLinked.length > 0) {
      return {
        error: `Live metal pricing is temporarily unavailable, so these items can't be purchased online right now: ${spotLinked
          .map((product) => product.title)
          .join(', ')}. Please call (239) 404-8505 to complete your purchase.`,
        status: 503,
        code: 'spot_unavailable',
      };
    }
  }

  const items: CheckoutOrderItem[] = typedProducts.map((product) => ({
    product_id: product.id,
    inventory_number:
      product.inventory_number != null ? String(product.inventory_number) : product.sku ?? product.id,
    title_snapshot: product.title,
    item_year_snapshot: product.item_year,
    metal_snapshot: getProductMetal(product),
    purity_snapshot: product.purity ? String(product.purity) : null,
    gram_weight_snapshot: getProductWeight(product),
    // Round each unit price to cents so the snapshot, the order total, and the
    // PayPal amount breakdown all reconcile exactly (PayPal rejects a breakdown
    // whose parts don't sum to the total).
    price_snapshot: round2(
      product.id === override?.productId ? override.unitPrice : getSnapshotPrice(product, spotData),
    ),
    quantity: quantityByProductId.get(product.id) ?? 1,
    image_snapshot: getProductImages(product)[0] ?? null,
  }));

  // Never let a $0 (or negative) line item reach checkout. A snapshot price of 0
  // means the item has no usable price — an unparsable manual label ("Contact
  // for price") or a spot item missing weight/purity. These
  // must be handled by a phone call, not sold online for nothing. (CODE-D01)
  const invalidPriced = items.filter((item) => !(item.price_snapshot > 0));
  if (invalidPriced.length > 0) {
    return {
      error: `This item isn't available for online purchase yet: ${invalidPriced
        .map((item) => item.title_snapshot)
        .join(', ')}. Please call (239) 404-8505 to buy it.`,
      status: 409,
      code: 'call_to_purchase',
    };
  }

  const subtotal = round2(items.reduce((sum, item) => sum + item.price_snapshot * item.quantity, 0));

  // Value-based tier fee. A whitelisted method can still be unavailable at
  // this subtotal (Express at $5,000+ exceeds USPS's insurance cap) — reject
  // with a clear message rather than substituting a different service.
  const shippingFee = getCheckoutShippingFee(shippingMethod, subtotal);
  if (shippingFee === null) {
    return {
      error: 'Express Overnight shipping is not available for orders of $5,000 or more. Please select the fully insured standard shipping option.',
      status: 400,
      code: 'express_unavailable',
    };
  }

  // Discount resolves AFTER the shipping fee deliberately. The tier and the
  // $5,000 Express cutoff key off the PRE-discount subtotal, because they price
  // insurance on the value of the goods in the box — which a discount does not
  // change. Moving this above getCheckoutShippingFee would let a code drop an
  // order under the cutoff and ship over-value goods on the cheaper service.
  const discountResult = resolveDiscount ? await resolveDiscount(subtotal) : null;
  if (discountResult && !discountResult.ok) {
    return {
      error: 'The discount code on this order is no longer valid. Please remove it and try again.',
      status: 409,
      code: 'discount_invalid',
    };
  }
  const appliedDiscount = discountResult?.ok ? discountResult.discount : null;
  const discount = appliedDiscount?.amount ?? 0;

  // Merchandise-only base. calculateDiscountAmount already clamped the discount
  // to the subtotal, so this can never go negative.
  const discountedMerchandise = round2(subtotal - discount);

  // Florida taxes the DISCOUNTED merchandise plus charged shipping — a discount
  // reduces the taxable base, which is the standard treatment.
  const tax = chargesFlSalesTax(shippingMethod, shippingState)
    ? calculateFlSalesTax(discountedMerchandise, shippingFee)
    : 0;
  const total = round2(discountedMerchandise + tax + shippingFee);

  return { items, subtotal, discount, appliedDiscount, tax, shippingFee, total };
}
