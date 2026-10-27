'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CartItem } from '@/context/CartContext';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import {
  calculateDiscountAmount,
  calculateFlSalesTax,
  chargesFlSalesTax,
  FL_TAX_RATE_LABEL,
  formatCheckoutCurrency,
  round2,
} from '@/lib/checkout-pricing';
import { formatDiscountValue, type AppliedDiscount } from '@/lib/discount-codes';
import type { OrderQuote } from '@/lib/checkout-pricing';
import { parseManualPriceLabelValue } from '@/lib/pricing';
import {
  CHECKOUT_SHIPPING_OPTIONS,
  DEFAULT_SHIPPING_METHOD,
  EXPRESS_SHIPPING_MAX_SUBTOTAL,
  getCheckoutShippingFee,
  getCheckoutShippingOption,
  getShippingServiceNote,
  isShippingMethodAvailable,
} from '@/lib/checkout-shipping';
import {
  inferProductJewelryType,
  formatProductItemYear,
  isProductPurchasable,
  isProductSold,
  normalizeProductQuantity,
  productJewelryTypeLabel,
  productLengthSizeDisplay,
  productImagePaddingBackground,
  productMetalVariantLabel,
} from '@/types/product';
import { AppIcon } from '@/components/AppIcon';

const AVAILABLE_GREEN = '#2e7d32';

const GOLD = '#735c00';
const BORDER = '#d8d0c2';

function parsePrice(label: string): number | null {
  return parseManualPriceLabelValue(label);
}

function purchaseQty(item: CartItem): number {
  return Math.max(1, normalizeProductQuantity(item.purchaseQuantity));
}

/**
 * The one place checkout money is derived for display. Both the item-list
 * summary and the standalone totals card read from this, so a change to the
 * estimate can never land on one surface and not the other. The server
 * recomputes all of it authoritatively at order time (checkout-pricing.ts).
 */
export function computeOrderTotals({
  items,
  shippingMethod,
  shippingState,
  hideSoldItemPrices = false,
  appliedDiscount = null,
  quote = null,
  taxExempt = false,
}: {
  items: CartItem[];
  shippingMethod: string;
  shippingState?: string;
  hideSoldItemPrices?: boolean;
  /** Discount previewed by /api/checkout/discount-code. Display only — the
   *  server recomputes it from the code at order time. */
  appliedDiscount?: AppliedDiscount | null;
  /** An approved Florida tax-exempt certificate is in play (lib/tax-exempt.ts).
   *  Display only until the quote confirms it — the server decides. */
  taxExempt?: boolean;
  /**
   * Authoritative figures from /api/checkout/quote. When present these are
   * rendered VERBATIM rather than recomputed from the cart's stored price
   * labels — 64% of the catalog is spot-linked, so a label captured at
   * add-to-cart time drifts from the chargeable price as metal moves.
   *
   * The buyer must see the number they will be charged; deriving it a second
   * time on the client is exactly how the two got to disagree.
   */
  quote?: OrderQuote | null;
}) {
  if (quote) {
    const selected = getCheckoutShippingOption(shippingMethod) ?? CHECKOUT_SHIPPING_OPTIONS[0];
    return {
      subtotal: quote.subtotal,
      discount: quote.discount,
      shipping: quote.shippingFee,
      tax: quote.tax,
      total: quote.total,
      hasUnknown: false,
      selectedShipping: selected,
      taxExempted: (quote.taxExempted ?? 0) > 0,
    };
  }
  const lineTotals = items.map((i) => {
    if (hideSoldItemPrices && isProductSold(i.status)) return null;
    const unit = parsePrice(i.priceLabel);
    return unit === null ? null : unit * purchaseQty(i);
  });
  const knownLineTotals = lineTotals.filter((p): p is number => p !== null);
  const hasUnknown = knownLineTotals.length < lineTotals.length;
  const subtotal = round2(knownLineTotals.reduce((a, b) => a + b, 0));
  const selectedShipping = getCheckoutShippingOption(shippingMethod) ?? CHECKOUT_SHIPPING_OPTIONS[0];
  // Value-based tier fee. Fall back to the default method's fee while the
  // parent snaps an unavailable selection (Express at $5,000+) back to default.
  const shipping = getCheckoutShippingFee(selectedShipping.value, subtotal)
    ?? getCheckoutShippingFee(DEFAULT_SHIPPING_METHOD, subtotal)
    ?? 0;
  // Recomputed from the code's terms against THIS subtotal rather than reusing
  // the previewed amount, so editing the cart after applying a code updates the
  // figure instead of showing a stale one. Mirrors the server's order of
  // operations exactly: shipping tier off the pre-discount subtotal, tax on the
  // discounted merchandise plus shipping.
  const discount = appliedDiscount
    ? calculateDiscountAmount(appliedDiscount.type, appliedDiscount.value, subtotal)
    : 0;
  const discountedMerchandise = round2(subtotal - discount);
  const owedTax = chargesFlSalesTax(shippingMethod, shippingState)
    ? calculateFlSalesTax(discountedMerchandise, shipping)
    : 0;
  const taxExempted = taxExempt && owedTax > 0;
  const tax = taxExempted ? 0 : owedTax;
  const total = round2(discountedMerchandise + tax + shipping);
  return { subtotal, discount, shipping, tax, total, hasUnknown, selectedShipping, taxExempted };
}

/**
 * Totals rows on their own, for the checkout page's sticky summary card where
 * the item list lives in a separate panel. Mirrors the row order used inside
 * OrderSummary: Subtotal -> Shipping method -> Shipping Cost -> Tax -> Total.
 */
export function OrderTotals({
  items,
  isEs,
  shippingMethod,
  shippingState,
  hideSoldItemPrices = false,
  appliedDiscount = null,
  quote = null,
  taxExempt = false,
}: {
  items: CartItem[];
  isEs: boolean;
  shippingMethod: string;
  shippingState?: string;
  hideSoldItemPrices?: boolean;
  appliedDiscount?: AppliedDiscount | null;
  quote?: OrderQuote | null;
  taxExempt?: boolean;
}) {
  const { subtotal, discount, shipping, tax, total, hasUnknown, selectedShipping, taxExempted } = computeOrderTotals({
    items,
    shippingMethod,
    shippingState,
    hideSoldItemPrices,
    appliedDiscount,
    quote,
    taxExempt,
  });
  const serviceNote = getShippingServiceNote(selectedShipping.value, subtotal, isEs);

  return (
    <div className="checkout-totals" style={{ fontFamily: 'var(--font-label)' }}>
      <div className="checkout-total-row">
        <span>Subtotal</span>
        <span>{subtotal > 0 ? formatCheckoutCurrency(subtotal) : '-'}{hasUnknown ? '*' : ''}</span>
      </div>
      {/* Discount sits directly under Subtotal because it comes off merchandise
          before shipping and tax are worked out. */}
      {discount > 0 && appliedDiscount && (
        <div className="checkout-total-row">
          <span>
            {isEs ? 'Descuento' : 'Discount'} ({appliedDiscount.code}
            {appliedDiscount.type === 'percent'
              ? ` · ${formatDiscountValue('percent', appliedDiscount.value, isEs)}`
              : ''}
            )
          </span>
          <span style={{ color: '#2e7d32' }}>-{formatCheckoutCurrency(discount)}</span>
        </div>
      )}
      <div className="checkout-total-row">
        <span>{isEs ? 'Envío' : 'Shipping'}</span>
        <span style={{ color: 'var(--color-on-surface)', textAlign: 'right' }}>
          {isEs ? selectedShipping.labelEs : selectedShipping.labelEn}
        </span>
      </div>
      <div className="checkout-total-row">
        <span>{isEs ? 'Costo de envío' : 'Shipping Cost'}</span>
        <span>{formatCheckoutCurrency(shipping)}</span>
      </div>
      {/* Tax renders AFTER shipping (owner request 2026-07-31): Florida tax is
          charged on merchandise + charged shipping, so listing it below the
          shipping cost makes that base visually obvious. */}
      <div className="checkout-total-row">
        <span>
          {taxExempted
            ? <>{isEs ? 'Impuesto FL · ' : 'FL Sales Tax · '}<strong style={{ color: '#16653c' }}>{isEs ? 'exento' : 'exempt'}</strong></>
            : tax > 0
              ? (isEs ? `Impuesto FL (${FL_TAX_RATE_LABEL})` : `FL Sales Tax (${FL_TAX_RATE_LABEL})`)
              : (isEs ? 'Impuesto FL' : 'FL Sales Tax')}
        </span>
        <span>{subtotal > 0 ? formatCheckoutCurrency(tax) : '-'}</span>
      </div>
      <div className="checkout-total-row checkout-total-row--grand">
        <span>{isEs ? 'Total a pagar' : 'Total due'}</span>
        <span style={{ color: GOLD }}>{subtotal > 0 ? formatCheckoutCurrency(total) : '-'}</span>
      </div>
      {serviceNote && (
        <p className="checkout-total-note">{serviceNote}</p>
      )}
      {hasUnknown && (
        <p className="checkout-total-note">
          * {isEs ? 'Algunos artículos requieren confirmación de precio.' : 'Some items require price confirmation.'}
        </p>
      )}
    </div>
  );
}

export default function OrderSummary({
  items,
  isEs,
  prefix,
  shippingMethod,
  shippingState,
  onShippingMethodChange,
  onRemove,
  onSetQuantity,
  variant = 'compact',
  showAvailability = false,
  hideSoldItemPrices = false,
  showTotals = true,
  heading,
  headingAction,
  bare = false,
  appliedDiscount = null,
  quote = null,
}: {
  items: CartItem[];
  isEs: boolean;
  prefix: string;
  shippingMethod: string;
  /** Buyer's entered shipping-address state, if collected — used so the estimate
   *  matches the authoritative server tax calc (FL tax only for pickup or an
   *  in-state address; out-of-state shipments aren't taxed). */
  shippingState?: string;
  onShippingMethodChange?: (value: string) => void;
  onRemove?: (id: string) => void;
  onSetQuantity?: (id: string, quantity: number) => void;
  variant?: 'compact' | 'expanded';
  /** Show each item's live availability (In stock / N available / Sold out).
   *  On for the live checkout summary; off for the printed confirmation snapshot. */
  showAvailability?: boolean;
  /** Mask prices for sold items on live customer-facing summaries. */
  hideSoldItemPrices?: boolean;
  /** Off when the totals live in a separate card (the checkout summary panel). */
  showTotals?: boolean;
  /** Override the panel heading text; null omits the heading row entirely
   *  (for use inside a card that already provides its own title). */
  heading?: string | null;
  /** Optional control rendered opposite the heading (e.g. "Edit cart"). */
  headingAction?: React.ReactNode;
  /** Drop the panel's own border/background — for use inside another card. */
  bare?: boolean;
  /** Previewed discount, for display only. See computeOrderTotals. */
  appliedDiscount?: AppliedDiscount | null;
  /** Authoritative live figures from /api/checkout/quote. */
  quote?: OrderQuote | null;
}) {
  const { subtotal, discount, shipping, tax, total, hasUnknown, selectedShipping } = computeOrderTotals({
    items,
    shippingMethod,
    shippingState,
    hideSoldItemPrices,
    appliedDiscount,
    quote,
  });
  // Per-line prices come from the quote too, so a line and the subtotal above
  // it can never tell the buyer two different stories.
  const quotedUnitPrice = (productId: string): number | null => {
    const line = quote?.items.find((i) => i.productId === productId);
    return line ? line.unitPrice : null;
  };
  const serviceNote = getShippingServiceNote(selectedShipping.value, subtotal, isEs);

  const expanded = variant === 'expanded';

  return (
    <aside
      className={bare ? '' : `border ${expanded ? 'p-4 md:p-6' : 'p-4 md:p-5 lg:sticky lg:top-24'}`}
      style={bare ? undefined : {
        borderColor: BORDER,
        background: expanded ? 'rgba(255, 255, 255, 0.9)' : 'var(--color-surface-container-lowest)',
        boxShadow: expanded ? '0 16px 42px rgba(75, 60, 24, 0.08)' : undefined,
      }}
    >
      {heading !== null && (
        <div className={expanded ? 'mb-3 flex flex-row items-baseline justify-between gap-2' : ''}>
          <h2 className={`${expanded ? 'text-base' : 'text-sm'} font-bold uppercase tracking-widest ${expanded ? '' : 'mb-4'}`} style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
            {heading ?? (isEs ? 'Resumen' : 'Order Summary')}
          </h2>
          {headingAction ?? (expanded && (
            <p className="text-xs flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
              {items.length} {isEs ? (items.length === 1 ? 'artículo' : 'artículos') : (items.length === 1 ? 'item' : 'items')}
            </p>
          ))}
        </div>
      )}
      <div className={`${expanded ? 'grid gap-3' : 'flex flex-col gap-3'} ${showTotals ? (expanded ? 'mb-4' : 'mb-5') : ''}`}>
        {items.map((item) => (
          <SummaryRow
            key={item.id}
            item={item}
            isEs={isEs}
            prefix={prefix}
            onRemove={onRemove ? () => onRemove(item.id) : undefined}
            onSetQuantity={onSetQuantity ? (qty) => onSetQuantity(item.id, qty) : undefined}
            expanded={expanded}
            showAvailability={showAvailability}
            hideSoldItemPrices={hideSoldItemPrices}
            quotedUnitPrice={quotedUnitPrice(item.id)}
          />
        ))}
      </div>
      {showTotals && (
      <div className={`${expanded ? 'ml-auto max-w-md rounded-2xl bg-[rgba(255,253,248,0.78)] px-3.5 py-3 shadow-[0_12px_34px_rgba(38,28,6,0.05)]' : ''} flex flex-col gap-1 text-xs border-t pt-3`} style={{ borderColor: BORDER, fontFamily: 'var(--font-label)', color: 'var(--color-on-surface-variant)' }}>
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{subtotal > 0 ? formatCheckoutCurrency(subtotal) : '-'}{hasUnknown ? '*' : ''}</span>
        </div>
        {discount > 0 && appliedDiscount && (
          <div className="flex justify-between">
            <span>
              {isEs ? 'Descuento' : 'Discount'} ({appliedDiscount.code}
              {appliedDiscount.type === 'percent'
                ? ` · ${formatDiscountValue('percent', appliedDiscount.value, isEs)}`
                : ''}
              )
            </span>
            <span style={{ color: '#2e7d32' }}>-{formatCheckoutCurrency(discount)}</span>
          </div>
        )}
        {onShippingMethodChange ? (
          <div className="flex items-center justify-between gap-2 pt-2">
            <span>{isEs ? 'Envío' : 'Shipping'}</span>
            <select
              value={selectedShipping.value}
              onChange={(e) => onShippingMethodChange(e.target.value)}
              aria-label={isEs ? 'Método de envío' : 'Shipping method'}
              className="max-w-[62%] rounded-md border px-2 py-1 text-xs font-bold"
              style={{
                borderColor: BORDER,
                background: 'var(--color-background)',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-label)',
                outline: 'none',
              }}
            >
              {CHECKOUT_SHIPPING_OPTIONS
                .filter((option) => isShippingMethodAvailable(option.value, subtotal))
                .map((option) => {
                  const optionFee = getCheckoutShippingFee(option.value, subtotal) ?? 0;
                  return (
                    <option key={option.value} value={option.value}>
                      {`${isEs ? option.labelEs : option.labelEn} — ${formatCheckoutCurrency(optionFee)}`}
                    </option>
                  );
                })}
            </select>
          </div>
        ) : (
          <div className="flex justify-between pt-2">
            <span>{isEs ? 'Envío' : 'Shipping'}</span>
            <span style={{ color: 'var(--color-on-surface)' }}>
              {isEs ? selectedShipping.labelEs : selectedShipping.labelEn}
            </span>
          </div>
        )}
        {serviceNote && (
          <p className="text-[0.65rem] leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
            {serviceNote}
          </p>
        )}
        {onShippingMethodChange && subtotal >= EXPRESS_SHIPPING_MAX_SUBTOTAL && (
          <p className="text-[0.65rem] leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs
              ? 'El envío nocturno no está disponible para pedidos de $5,000 o más (límite de seguro del transportista).'
              : 'Overnight shipping is unavailable for orders of $5,000 or more (carrier insurance limit).'}
          </p>
        )}
        <div className="flex justify-between">
          <span>{isEs ? 'Costo de envío' : 'Shipping Cost'}</span>
          <span>{formatCheckoutCurrency(shipping)}</span>
        </div>
        {/* Tax renders AFTER shipping (owner request 2026-07-31): Florida tax
            is charged on merchandise + charged shipping, so listing it below
            the shipping cost makes that base visually obvious. */}
        <div className="flex justify-between">
          <span>
            {tax > 0
              ? (isEs ? `Impuesto FL (${FL_TAX_RATE_LABEL})` : `FL Sales Tax (${FL_TAX_RATE_LABEL})`)
              : (isEs ? 'Impuesto FL' : 'FL Sales Tax')}
          </span>
          <span>{subtotal > 0 ? formatCheckoutCurrency(tax) : '-'}</span>
        </div>
        <div className="flex justify-between pt-2 mt-2 font-bold text-base" style={{ borderTop: `1px solid ${BORDER}`, color: 'var(--color-on-surface)' }}>
          <span>{isEs ? 'Total estimado' : 'Est. Total'}</span>
          <span style={{ color: GOLD }}>{subtotal > 0 ? formatCheckoutCurrency(total) : '-'}</span>
        </div>
      </div>
      )}
    </aside>
  );
}

function SummaryRow({
  item,
  isEs,
  prefix,
  onRemove,
  onSetQuantity,
  expanded = false,
  showAvailability = false,
  hideSoldItemPrices = false,
  quotedUnitPrice = null,
}: {
  item: CartItem;
  isEs: boolean;
  prefix: string;
  onRemove?: () => void;
  onSetQuantity?: (quantity: number) => void;
  expanded?: boolean;
  showAvailability?: boolean;
  hideSoldItemPrices?: boolean;
  /** Live unit price from the server quote; overrides the cart's stored label. */
  quotedUnitPrice?: number | null;
}) {
  const title = isEs && item.title_es ? item.title_es : item.title;
  const circa = formatProductItemYear(item.item_year);
  const specs = buildSpecLine(item, isEs);
  const imageFrameBackground = productImagePaddingBackground(item.image_padding);
  const image = normalizeLegacyLocalImageUrl(item.image);
  const qty = purchaseQty(item);
  const stockCap = Math.max(1, normalizeProductQuantity(item.stockQuantity));
  const purchasable = isProductPurchasable(item.status, item.stockQuantity);
  const soldPriceHidden = hideSoldItemPrices && isProductSold(item.status);
  // Prefer the server's live figure. The stored label is only a fallback for
  // surfaces with no quote (the printed confirmation snapshot, the cart drawer).
  const unitPrice = quotedUnitPrice ?? parsePrice(item.priceLabel);
  const unitPriceLabel = quotedUnitPrice != null
    ? formatCheckoutCurrency(quotedUnitPrice)
    : item.priceLabel;
  const lineTotal = unitPrice === null ? null : unitPrice * qty;
  return (
    <div className={`flex gap-3 items-start ${expanded ? 'rounded-2xl border p-2 md:gap-3 md:p-2.5' : ''}`} style={expanded ? { borderColor: BORDER, background: 'rgba(255, 253, 248, 0.76)' } : undefined}>
      <Link
        href={`${prefix}/shop/${item.id}`}
        className={`relative flex-shrink-0 overflow-hidden rounded-xl ${expanded ? 'h-16 w-16 md:h-20 md:w-20' : 'w-14 h-14'}`}
        style={{ background: imageFrameBackground }}
      >
        {image
          ? <Image src={image} alt={title} fill sizes={expanded ? '(max-width: 768px) 64px, 80px' : '56px'} className="object-contain" unoptimized={image.startsWith('/assets/')} />
          : <div className="w-full h-full flex items-center justify-center text-xs opacity-40">Photo</div>}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <Link
            href={`${prefix}/shop/${item.id}`}
            className={`${expanded ? 'text-[0.8rem] md:text-sm line-clamp-2' : 'text-xs line-clamp-2'} hover-underline-grow font-bold leading-snug`}
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            {title}
          </Link>
          <p className={`${expanded ? 'text-xs' : 'text-[0.68rem]'} flex-shrink-0 font-bold`} style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
            {soldPriceHidden ? (isEs ? 'Vendido' : 'Sold') : unitPriceLabel}
            {!soldPriceHidden && qty > 1 && lineTotal !== null && (
              <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>
                {' '}× {qty} = {formatCheckoutCurrency(lineTotal)}
              </span>
            )}
          </p>
          {expanded && (circa || specs) && (
            <p className="mt-0.5 truncate text-[0.7rem] font-bold uppercase tracking-wide" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
              {circa && <span className="normal-case">Ca. {circa}</span>}
              {circa && specs && ' · '}
              {specs}
            </p>
          )}
          {showAvailability && !purchasable && (
            <p className="mt-0.5 text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Agotado — ya no disponible' : 'Sold out — no longer available'}
            </p>
          )}
          {showAvailability && purchasable && stockCap <= 1 && (
            <p className="mt-0.5 text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: AVAILABLE_GREEN, fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Disponible' : 'In stock'}
            </p>
          )}
          {onSetQuantity && stockCap > 1 ? (
            <div className="mt-1.5 flex items-center gap-2">
              <QuantityStepper
                value={qty}
                max={stockCap}
                onChange={onSetQuantity}
                isEs={isEs}
              />
              <span className="text-[0.62rem] font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                {stockCap} {isEs ? 'en stock' : 'in stock'}
              </span>
            </div>
          ) : qty > 1 ? (
            <p className="mt-0.5 text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Cantidad' : 'Qty'}: {qty}
            </p>
          ) : null}
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center transition-colors hover:text-[color:var(--color-error)]"
          style={{ color: 'var(--color-on-surface-variant)' }}
          aria-label={isEs ? `Eliminar ${title}` : `Remove ${title}`}
          title={isEs ? 'Eliminar' : 'Remove'}
        >
          <AppIcon name="close"  aria-hidden="true" style={{ fontSize: '18px' }} />
        </button>
      )}
    </div>
  );
}

export function QuantityStepper({
  value,
  max,
  onChange,
  isEs,
}: {
  value: number;
  max: number;
  onChange: (quantity: number) => void;
  isEs: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(1, n));
  const btn: React.CSSProperties = {
    width: '1.6rem',
    height: '1.6rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: `1px solid ${BORDER}`,
    background: 'var(--color-background)',
    color: GOLD,
    lineHeight: 1,
  };
  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label={isEs ? 'Cantidad' : 'Quantity'}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        className="checkout-quantity-button"
        style={{ ...btn, opacity: value <= 1 ? 0.4 : 1, cursor: value <= 1 ? 'not-allowed' : 'pointer' }}
        aria-label={isEs ? 'Disminuir cantidad' : 'Decrease quantity'}
      >
        <AppIcon name="remove"  aria-hidden="true" style={{ fontSize: '15px' }} />
      </button>
      <span
        className="text-sm font-bold tabular-nums"
        style={{ minWidth: '1.4rem', textAlign: 'center', color: 'var(--color-on-surface)', fontFamily: 'var(--font-label)' }}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="checkout-quantity-button"
        style={{ ...btn, opacity: value >= max ? 0.4 : 1, cursor: value >= max ? 'not-allowed' : 'pointer' }}
        aria-label={isEs ? 'Aumentar cantidad' : 'Increase quantity'}
      >
        <AppIcon name="add"  aria-hidden="true" style={{ fontSize: '15px' }} />
      </button>
    </div>
  );
}

function buildSpecLine(item: CartItem, isEs: boolean): string | null {
  const category = item.category ?? (item.purity && item.purity > 24 ? 'Silver' : 'Gold');
  const jewelryType = inferProductJewelryType({
    title: item.title,
    title_es: item.title_es,
    chain_type: item.chain_type ?? null,
    tags: item.tags ?? [],
    tags_es: item.tags_es ?? [],
    jewelry_type: item.jewelry_type ?? null,
    product_type: item.product_type ?? null,
  });
  const purity = formatPurity(item.purity, category, isEs);
  const metal = item.metal_variant ? productMetalVariantLabel(item.metal_variant, category, isEs ? 'es' : 'en') : null;
  const length = productLengthSizeDisplay({
    length: item.length ?? null,
    tags: item.tags ?? [],
    jewelry_type: item.jewelry_type ?? null,
    product_type: item.product_type ?? null,
    title: item.title,
    title_es: item.title_es,
    chain_type: item.chain_type ?? null,
    tags_es: item.tags_es ?? [],
  });
  const weight = formatWeight(item.gram_weight ?? item.weight_grams ?? null);
  const productType = productJewelryTypeLabel(jewelryType, isEs ? 'es' : 'en');
  const parts = [
    purity,
    metal,
    productType,
    item.chain_type,
    length,
    weight,
    item.brand,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);

  const uniqueParts = parts.filter((part, index) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index);
  return uniqueParts.length > 0 ? uniqueParts.join(' · ') : null;
}

function formatPurity(purity: number | null | undefined, category: CartItem['category'], isEs: boolean): string | null {
  if (!purity) return null;
  if (category === 'Silver' && purity >= 100) {
    return purity === 925 ? `925 ${isEs ? 'esterlina' : 'sterling'}` : `${purity}`;
  }
  return `${purity}K`;
}

function formatWeight(weight: number | null | undefined): string | null {
  if (!weight) return null;
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: weight % 1 === 0 ? 0 : 2,
  }).format(weight)}g`;
}
