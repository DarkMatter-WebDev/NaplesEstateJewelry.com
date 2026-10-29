'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startRouteProgress } from '@/components/layout/RouteProgressBar';
import CheckoutGate, { hasChosenGuestCheckout, rememberGuestCheckout } from '@/components/checkout/CheckoutGate';
import { useCart, type CartItem } from '@/context/CartContext';
import OrderSummary, { OrderTotals, computeOrderTotals } from '@/components/checkout/OrderSummary';
import type { OrderQuote } from '@/lib/checkout-pricing';
import { addressWithLandmark } from '@/lib/business-location';
import PayPalCheckoutButton from '@/components/checkout/PayPalCheckoutButton';
import DiscountCodeField from '@/components/checkout/DiscountCodeField';
import type { AppliedDiscount } from '@/lib/discount-codes';
import StockAlertBanner from '@/components/cart/StockAlertBanner';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import { createClient } from '@/lib/supabase/client';
import { normalizeManualPriceLabel, parseManualPriceLabelValue } from '@/lib/pricing';
import { productImagePaddingForImage } from '@/types/product';
import { useHideSoldItemPrices } from '@/hooks/useHideSoldItemPrices';
import { findUnavailableCartItems } from '@/lib/cart-availability';
import {
  CHECKOUT_SHIPPING_OPTIONS,
  DEFAULT_SHIPPING_METHOD,
  EXPRESS_SHIPPING_MAX_SUBTOTAL,
  getCheckoutShippingFee,
  getShippingServiceNote,
  isShippingMethodAvailable,
} from '@/lib/checkout-shipping';
import { chargesFlSalesTax, formatCheckoutCurrency } from '@/lib/checkout-pricing';
import CheckoutTaxExempt, { type CheckoutExemptionChoice } from '@/components/checkout/CheckoutTaxExempt';
import {
  isUnitedStatesCountry,
  normalizeUsState,
  normalizeUsZip,
  US_STATES,
} from '@/lib/us-address';
import { normalizePhoneNumber } from '@/lib/phone';
import { composeFullName, formatFullName, parseFullName } from '@/lib/person-name';
import { AppIcon } from '@/components/AppIcon';

const GOLD = '#735c00';

// Single-page two-column checkout (owner request 2026-08-04, modelled on a
// mainstream retail checkout): everything the buyer must decide sits in the
// left column (Shipping, then Payment), while a sticky right rail carries the
// order summary, the totals, and the pay controls. This replaced the earlier
// four-step wizard. With PayPal's capture-on-approve design, "place order" IS
// the Pay Now inside PayPal's window, so the PayPal buttons sit directly under
// the total — the buyer always sees the final amount before paying.

type CartProductInfo = Pick<
  CartItem,
  | 'description'
  | 'priceLabel'
  | 'description_es'
  | 'public_notes'
  | 'image_padding'
  | 'category'
  | 'metal_type'
  | 'metal_variant'
  | 'purity'
  | 'weight_grams'
  | 'gram_weight'
  | 'product_type'
  | 'jewelry_type'
  | 'chain_type'
  | 'length'
  | 'brand'
  | 'tags'
  | 'tags_es'
  | 'gender'
>;

interface CustomerInfo {
  // Collected as two fields since 2026-08-22 and composed into the single
  // `customer_name` the order stores. A buyer previously typed her first name
  // here and her surname into Phone, because Phone was the next box and there
  // was nowhere else a surname belonged. See `lib/person-name.ts`.
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  notes: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

// `pickupHoursLine` is the admin-editable hours sentence, formatted server-side
// on the checkout page (this is a client component, so it cannot read the
// schedule itself without a second Supabase round-trip and a default-hours
// flash before hydration).
export default function CheckoutClient({ locale, paypalClientId, pickupHoursLine }: { locale: string; paypalClientId?: string | null; pickupHoursLine: string }) {
  const { items, remove, clear, setQuantity, refreshAvailability, stockAlerts, dismissStockAlerts, openDrawer } = useCart();
  const router = useRouter();
  const isEs = locale === 'es';
  const hideSoldItemPrices = useHideSoldItemPrices(true);
  const prefix = isEs ? '/es' : '';
  const [customer, setCustomer] = useState<CustomerInfo>({
    first_name: '', last_name: '', email: '', phone: '', notes: '',
    address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: 'United States',
  });
  const [shippingMethod, setShippingMethod] = useState<string>(DEFAULT_SHIPPING_METHOD);
  // Previewed discount, for display only — the code string is what gets sent
  // with the order and the server recomputes the amount from it.
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  // Tax-exempt (components/checkout/CheckoutTaxExempt.tsx): the approved
  // request token or "use my saved certificate", and whether payment waits
  // while a certificate is being read or approved. The server decides.
  const [exemption, setExemption] = useState<CheckoutExemptionChoice>(null);
  const [exemptBusy, setExemptBusy] = useState(false);
  const onExemptionChange = useCallback((choice: CheckoutExemptionChoice, busy: boolean) => {
    setExemption((current) => (JSON.stringify(current) === JSON.stringify(choice) ? current : choice));
    setExemptBusy(busy);
  }, []);
  // Authoritative live prices from /api/checkout/quote, TAGGED with the cart
  // state they were computed for. Storing the tag lets `quote` below be a
  // derived value: a quote whose tag no longer matches the current cart is
  // simply not used, so the summary can never render figures belonging to a
  // cart the buyer has already changed.
  const [quoteState, setQuoteState] = useState<{ key: string; quote: OrderQuote } | null>(null);
  // Set when the server refuses an order because the buyer's total had moved.
  const [priceChange, setPriceChange] = useState<{ from: number; to: number } | null>(null);
  const [infoConfirmed, setInfoConfirmed] = useState(false);
  // For Local Pickup the address is optional and hidden behind an accordion the
  // buyer can expand if they want to provide it. (Ignored when shipping is
  // selected — the address is required and always shown then.)
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [productInfoById, setProductInfoById] = useState<Record<string, CartProductInfo>>({});
  // On a successful capture we snapshot the order (items + shipping + contact) so
  // the confirmation screen can render a complete, printable summary — the cart is
  // cleared right after, and a guest has no account to look the order up in later.
  const [createdOrder, setCreatedOrder] = useState<{
    orderNumber: string;
    items: CartItem[];
    shippingMethod: string;
    customer: CustomerInfo;
  } | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  // Internal order id from the first create-order call, reused if the buyer
  // cancels the PayPal window and tries again (so we don't create a duplicate order).
  const orderIdRef = useRef<string | null>(null);
  // Cart+shipping fingerprint the order was created for. If the buyer edits the
  // cart or switches shipping after cancelling PayPal, the old order's totals no
  // longer apply — forget it so the retry creates a fresh order. (The server
  // re-validates this too; clearing here just avoids a doomed reuse attempt.)
  const orderPayloadKeyRef = useRef<string | null>(null);

  // Guest checkout: no account required. Offer an optional sign-in only to
  // visitors who aren't already signed in.
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setIsGuest(!data.user)).catch(() => {});
  }, []);

  // Entry sign-in/guest gate, for buyers who reach this page WITHOUT passing
  // the cart drawer's gate — a bookmark, a restored tab, a Back out of PayPal.
  // Anyone arriving through the drawer has already answered and
  // `rememberGuestCheckout()` recorded it, so they are never asked twice.
  //
  // Starts dismissed and is re-enabled on mount (sessionStorage is unavailable
  // during SSR, so this must not participate in hydration).
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  useEffect(() => {
    // Deferred callback (PriceUpdateTicker's pattern) — satisfies
    // react-hooks/set-state-in-effect while still only opening post-hydration.
    const timer = window.setTimeout(() => {
      if (!hasChosenGuestCheckout()) setAuthPromptOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const dismissAuthPrompt = () => {
    setAuthPromptOpen(false);
    rememberGuestCheckout();
  };

  // Re-check live stock when the checkout page loads (and whenever the cart
  // changes), so an item that sold out while it sat in the cart is caught here —
  // and flagged — before the buyer pays, rather than surfacing as an opaque
  // PayPal error. `items` is passed explicitly (and is the dep) because on the
  // hydration commit it's fresher than the context's effect-updated ref. It
  // converges: refreshAvailability only re-sets items when something actually
  // changed, so the reference stabilizes after at most one update.
  useEffect(() => {
    if (items.length > 0) void refreshAvailability(items);
  }, [items, refreshAvailability]);

  // Shipping fees are tiered on the merchandise subtotal, and Express is not
  // offered at $5,000+ (USPS insurance cap). Rather than mutating the stored
  // selection, derive the effective method each render: an unavailable
  // selection (a cart edit crossed the $5,000 boundary) falls back to the
  // default. The raw choice is preserved, so shrinking the cart restores it;
  // the server rejects an unavailable method regardless.
  const cartSubtotal = items.reduce((sum, item) => {
    const unit = parseManualPriceLabelValue(item.priceLabel);
    if (unit === null) return sum;
    return sum + unit * Math.max(1, Math.floor(item.purchaseQuantity ?? 1));
  }, 0);
  const effectiveShippingMethod = isShippingMethodAvailable(shippingMethod, cartSubtotal)
    ? shippingMethod
    : DEFAULT_SHIPPING_METHOD;

  // The discount code is part of the key: applying or removing one changes the
  // amount due, so a previously created order must not be reused for it. (The
  // server independently rejects a stale reuse, but invalidating here avoids a
  // pointless round trip and keeps the two checks in agreement.)
  const cartPayloadKey = `${items
    .map((item) => `${item.id}:${Math.max(1, Math.floor(item.purchaseQuantity ?? 1))}`)
    .sort()
    .join(',')}|${effectiveShippingMethod}|${appliedDiscount?.code ?? ''}`;

  // Invalidate the reusable order id when the cart or shipping method changes
  // after the order was created (buyer cancelled PayPal, then edited things).
  useEffect(() => {
    if (orderIdRef.current && orderPayloadKeyRef.current !== cartPayloadKey) {
      orderIdRef.current = null;
      orderPayloadKeyRef.current = null;
    }
  }, [cartPayloadKey]);

  const needsShipping = effectiveShippingMethod !== 'local-pickup';
  const normalizedShippingState = normalizeUsState(customer.state);
  const normalizedShippingZip = normalizeUsZip(customer.postal_code);
  // Checked for shape, not just presence: a buyer once tabbed out of Full Name
  // and typed her surname here, and the order went through with an unreachable
  // `customer_phone`. See `lib/phone.ts`.
  const normalizedPhone = normalizePhoneNumber(customer.phone);
  const composedName = composeFullName(customer.first_name, customer.last_name);
  const contactReady =
    composedName !== null && customer.email.trim() !== '' && normalizedPhone !== null;
  const shippingAddressReady =
    !needsShipping ||
    (customer.address_line1.trim() !== '' &&
      customer.city.trim() !== '' &&
      normalizedShippingState !== null &&
      normalizedShippingZip !== null &&
      isUnitedStatesCountry(customer.country));
  // An item that's gone sold out (or over-requested) can't be paid for — block
  // checkout with a clear message instead of letting it fail at PayPal.
  const unavailableItems = findUnavailableCartItems(items);
  const hasUnavailableItem = unavailableItems.length > 0;
  const payReady = items.length > 0 && contactReady && shippingAddressReady && infoConfirmed && !hasUnavailableItem && !exemptBusy;

  const missingFieldLabels = [
    exemptBusy ? (isEs ? 'Aprobación de exención (o cancélela)' : 'Tax-exempt approval (or cancel it)') : null,
    needsShipping && customer.address_line1.trim() === '' ? (isEs ? 'Dirección' : 'Street Address') : null,
    needsShipping && customer.city.trim() === '' ? (isEs ? 'Ciudad' : 'City') : null,
    needsShipping && normalizedShippingState === null ? (isEs ? 'Estado válido de EE. UU.' : 'Valid U.S. State') : null,
    needsShipping && normalizedShippingZip === null ? (isEs ? 'Código postal válido de EE. UU.' : 'Valid U.S. ZIP Code') : null,
    needsShipping && !isUnitedStatesCountry(customer.country) ? (isEs ? 'Dirección en Estados Unidos' : 'United States Address') : null,
    customer.first_name.trim() === '' ? (isEs ? 'Nombre' : 'First Name') : null,
    customer.last_name.trim() === '' ? (isEs ? 'Apellido' : 'Last Name') : null,
    normalizedPhone === null ? (isEs ? 'Teléfono válido' : 'Valid Phone Number') : null,
    customer.email.trim() === '' ? (isEs ? 'Correo electrónico' : 'Email') : null,
    // The confirmation checkbox is surfaced separately (needsInfoConfirmation) so
    // the pay reminder can spell out "check the box" clearly.
  ].filter((label): label is string => Boolean(label));

  function buildPayPalPayload() {
    return {
      items: items.map((item) => ({ id: item.id, quantity: Math.max(1, Math.floor(item.purchaseQuantity ?? 1)) })),
      customer: {
        // The two fields are joined here into the single value `orders` has
        // always stored. The server re-checks it and is the authority.
        name: composedName ?? formatFullName(customer.first_name, customer.last_name),
        email: customer.email,
        // Canonical form, so the order row reads the same regardless of how the
        // buyer punctuated it. The server re-normalizes and is the authority.
        phone: normalizedPhone ?? customer.phone,
        notes: customer.notes,
        // Always send the address the buyer entered (captured as a contact record
        // on the order). The server only *requires* a complete address when the
        // shipping method needs one — see `needsShipping` on the route.
        address_line1: customer.address_line1,
        address_line2: customer.address_line2,
        city: customer.city,
        state: customer.state,
        postal_code: customer.postal_code,
        country: customer.country,
      },
      shippingMethod: effectiveShippingMethod,
      // Only the CODE is sent. The server re-reads it and recomputes the
      // discount from its own subtotal, so no amount crosses the wire.
      discountCode: appliedDiscount?.code ?? null,
      // The total currently on screen. The server NEVER charges this — it only
      // compares, and refuses with `price_changed` if its own figure differs,
      // so the buyer can never be billed an amount they were not shown.
      quotedTotal: displayedTotals.total,
      // Only the approved request's token, or "use my saved certificate". The
      // server re-checks both before it drops any tax.
      taxExempt: exemption,
      orderId: orderIdRef.current,
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function prefillCustomerInfo() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name, email, phone')
        .eq('id', user.id)
        .maybeSingle();

      const metadata = user.user_metadata ?? {};
      // `profiles` already stores the two parts separately, so prefer them and
      // fall back to splitting a stored full name only when they're absent.
      const composedName = profile?.full_name || metadata.full_name || metadata.name || '';
      const parsedName = parseFullName(composedName);
      const knownFirstName = profile?.first_name || parsedName.first;
      const knownLastName = profile?.last_name || parsedName.last;
      const knownEmail = profile?.email ?? user.email ?? metadata.email ?? '';
      const knownPhone = profile?.phone ?? user.phone ?? metadata.phone ?? metadata.phone_number ?? '';

      if (cancelled) return;
      setCustomer((current) => ({
        ...current,
        first_name: current.first_name || String(knownFirstName || ''),
        last_name: current.last_name || String(knownLastName || ''),
        email: current.email || String(knownEmail || ''),
        phone: current.phone || String(knownPhone || ''),
      }));
    }

    prefillCustomerInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missingProductInfoIds = items
      .filter((item) => (
        parseManualPriceLabelValue(item.priceLabel) == null
      ) || (
        !item.description &&
        !item.description_es &&
        !item.public_notes
      ) || (
        item.image_padding === undefined
      ) || (
        !item.category &&
        !item.metal_variant &&
        !item.purity &&
        !item.length &&
        !item.chain_type &&
        !item.product_type &&
        !item.jewelry_type
      ))
      .map((item) => item.id);

    if (missingProductInfoIds.length === 0) return;

    async function loadCartProductInfo() {
      const supabase = createClient();
      const { data } = await supabase
        .from('products')
        .select('id, description, description_es, public_notes, image_padding, image_padding_by_image, category, metal_type, metal_variant, purity, weight_grams, gram_weight, product_type, jewelry_type, chain_type, length, brand, tags, tags_es, gender, price_mode, manual_price_label')
        .in('id', missingProductInfoIds);

      if (cancelled || !data) return;
      setProductInfoById((current) => ({
        ...current,
        ...Object.fromEntries(data.map((product) => {
          const cartItem = items.find((item) => item.id === product.id);
          return [
            product.id,
            {
            description: product.description,
            priceLabel:
              product.price_mode === 'manual'
                ? (normalizeManualPriceLabel(product.manual_price_label) ?? cartItem?.priceLabel ?? '')
                : (cartItem?.priceLabel ?? ''),
            description_es: product.description_es,
            public_notes: product.public_notes,
            image_padding: productImagePaddingForImage(product.image_padding, product.image_padding_by_image, cartItem?.image, 0),
            category: product.category,
            metal_type: product.metal_type,
            metal_variant: product.metal_variant,
            purity: product.purity,
            weight_grams: product.weight_grams,
            gram_weight: product.gram_weight,
            product_type: product.product_type,
            jewelry_type: product.jewelry_type,
            chain_type: product.chain_type,
            length: product.length,
            brand: product.brand,
            tags: product.tags,
            tags_es: product.tags_es,
            gender: product.gender,
          },
          ];
        })),
      }));
    }

    loadCartProductInfo();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const summaryItems = items.map((item) => ({
    ...item,
    ...productInfoById[item.id],
  }));

  // Re-quote whenever anything that moves the price changes. Keeping the
  // display fresh is what stops the server-side drift guard firing on nearly
  // every checkout, which would train buyers to click through it.
  const quoteKey = `${items
    .map((i) => `${i.id}:${Math.max(1, Math.floor(i.purchaseQuantity ?? 1))}`)
    .sort()
    .join(',')}|${effectiveShippingMethod}|${normalizeUsState(customer.state) ?? ''}|${appliedDiscount?.code ?? ''}|${
    // An approved token counts only for the email it was approved for, so the
    // email joins the key only while an exemption is in play.
    exemption ? `${exemption.token ?? 'saved'}:${customer.email.trim().toLowerCase()}` : ''}`;

  // Only honour a quote computed for the CURRENT cart. Falls back to the
  // stored labels for the moment between a change and its fresh quote.
  const quote = quoteState?.key === quoteKey ? quoteState.quote : null;

  // The figures the buyer is looking at RIGHT NOW. Derived from the same
  // function the summary renders from, so `quotedTotal` and the on-screen total
  // cannot disagree by construction.
  const displayedTotals = computeOrderTotals({
    items: summaryItems,
    shippingMethod: effectiveShippingMethod,
    shippingState: customer.state,
    hideSoldItemPrices,
    appliedDiscount,
    quote,
    taxExempt: Boolean(exemption),
  });
  const taxApplies = cartSubtotal > 0 && chargesFlSalesTax(effectiveShippingMethod, customer.state);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (items.length === 0) return;
      try {
        const res = await fetch('/api/checkout/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map((i) => ({ id: i.id, quantity: Math.max(1, Math.floor(i.purchaseQuantity ?? 1)) })),
            shippingMethod: effectiveShippingMethod,
            shippingState: customer.state,
            discountCode: appliedDiscount?.code ?? null,
            email: customer.email || null,
            taxExempt: exemption,
          }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => null);
        // A failed quote leaves the cart-label fallback in place rather than
        // blanking the summary. The order route still recomputes authoritatively,
        // and the drift guard still refuses to charge an unshown amount.
        if (res.ok && data?.quote) {
          setQuoteState({ key: quoteKey, quote: data.quote as OrderQuote });
        }
      } catch {
        /* keep the previous figures */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  // The PayPal approval round-trip swaps this page's content (full form ->
  // success screen) without a real navigation, so the browser keeps whatever
  // scroll position the buyer had before leaving for PayPal. Reset to the top
  // when the confirmation screen takes over.
  useEffect(() => {
    if (createdOrder) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [createdOrder]);

  if (createdOrder) {
    const needsShippingReceipt = createdOrder.shippingMethod !== 'local-pickup';
    const c = createdOrder.customer;
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center">
          <AppIcon name="check_circle"  style={{ fontSize: '44px', color: GOLD }} />
          <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-4" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
            {isEs ? 'Pedido recibido' : 'Order Received'}
          </h1>
          <p className="mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs ? 'Su pedido fue enviado correctamente.' : 'Your order was submitted successfully.'}
          </p>
          <p className="mb-6 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
            {createdOrder.orderNumber}
          </p>
        </div>

        <div className="no-print flex flex-wrap justify-center gap-3">
          {/* Plain anchor (not Link) forces a full navigation, so the shop grid is
              guaranteed to reflect the item(s) just purchased as sold rather than
              serving a router-cached page from before the purchase completed. */}
          <a href={`${prefix}/shop`} className="gold-button">
            {isEs ? 'Volver a la tienda' : 'Back to Shop'}
          </a>
          <button type="button" className="outline-button" onClick={() => setShowOrderDetails((v) => !v)}>
            {isGuest
              ? (isEs ? 'Ver e imprimir detalles' : 'View & Print Order Details')
              : (isEs ? 'Ver detalles del pedido' : 'View Order Details')}
          </button>
        </div>

        {showOrderDetails && (
          <div className="mt-10">
            <div className="checkout-receipt-print">
              <div className="mb-5 border-b pb-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
                <p className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                  Naples Estate Jewelry
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  (239) 404-8505 · naplesestatejewelry.com
                </p>
                <p className="mt-3 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  <strong>{isEs ? 'Pedido' : 'Order'}:</strong> {createdOrder.orderNumber}
                </p>
              </div>

              <OrderSummary
                items={createdOrder.items}
                isEs={isEs}
                prefix={prefix}
                shippingMethod={createdOrder.shippingMethod}
                shippingState={c.state}
                variant="expanded"
              />

              <div className="mt-5 grid gap-4 sm:grid-cols-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                    {isEs ? 'Contacto' : 'Contact'}
                  </p>
                  <p style={{ color: 'var(--color-on-surface)' }}>{formatFullName(c.first_name, c.last_name)}</p>
                  <p>{c.email}</p>
                  <p>{c.phone}</p>
                </div>
                {(needsShippingReceipt || c.address_line1.trim() !== '') && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                      {needsShippingReceipt ? (isEs ? 'Envío a' : 'Ship To') : (isEs ? 'Dirección' : 'Address')}
                    </p>
                    <p style={{ color: 'var(--color-on-surface)' }}>{c.address_line1}</p>
                    {c.address_line2 && <p>{c.address_line2}</p>}
                    <p>{[c.city, c.state, c.postal_code].filter(Boolean).join(', ')}</p>
                    <p>{c.country}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="no-print mt-6 flex justify-center">
              <button type="button" className="gold-button" onClick={() => window.print()}>
                <AppIcon name="print"  aria-hidden="true" style={{ fontSize: '17px', lineHeight: 1 }} />
                {isEs ? 'Imprimir' : 'Print'}
              </button>
            </div>
          </div>
        )}

        <style>{`
          @media print {
            header, footer, .no-print { display: none !important; }
          }
        `}</style>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center px-6 py-16">
        <AppIcon name="shopping_cart"  style={{ fontSize: '44px', color: 'var(--color-outline-variant)' }} />
        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-4" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          {isEs ? 'Su carrito está vacío' : 'Your Cart Is Empty'}
        </h1>
        <p className="mb-8" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Agregue un artículo antes de proceder al pago.' : 'Add an item before proceeding to checkout.'}
        </p>
        <Link href={`${prefix}/shop`} className="gold-button">
          {isEs ? 'Ver tienda' : 'Browse Shop'}
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* ⚠️ OUTSIDE `.checkout-page`, deliberately. The gate is
          `position: fixed`, and `.checkout-page` carries
          `data-customer-reveal="visible"` whose transform/filter/will-change
          make it a containing block for fixed descendants — nested inside it,
          `inset: 0` resolved to the 2409px page instead of the viewport and
          the card sat 1114px down an 812px phone screen. Do not move it in. */}
      {isGuest && authPromptOpen && (
        <CheckoutGate
          isEs={isEs}
          prefix={prefix}
          checkoutHref={`${prefix}/checkout`}
          // The buyer is already ON checkout — "Continue as Guest" IS the way
          // out, so a Cancel beside it would just be a second button doing the
          // same thing. Tapping the backdrop does the same as guest.
          showCancel={false}
          onClose={dismissAuthPrompt}
          onGuest={dismissAuthPrompt}
          onNavigate={(href) => {
            setAuthPromptOpen(false);
            startRouteProgress(href);
            router.push(href);
          }}
        />
      )}

    <div className="checkout-page">
      <div className="checkout-shell">
      <section className="checkout-hero">
        {/* The cart is a drawer, not a route — so "Back to cart" reopens it
            over this page rather than navigating away and losing progress. */}
        <button
          type="button"
          onClick={openDrawer}
          className="hover-underline-grow text-xs font-bold uppercase tracking-widest"
          style={{ color: GOLD, fontFamily: 'var(--font-label)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {isEs ? '< Volver al carrito' : '< Back to cart'}
        </button>
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold mt-1 mb-0 md:mt-4 md:mb-3" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          {isEs ? 'Finalizar Compra' : 'Checkout'}
        </h1>
        <p className="hidden md:block text-sm md:text-base" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Complete sus datos para finalizar la compra de los artículos de su carrito.' : 'Complete your details to check out the items in your cart.'}
        </p>
      </section>

      <StockAlertBanner alerts={stockAlerts} isEs={isEs} onDismiss={dismissStockAlerts} />

      <div className="checkout-layout">
        <div className="checkout-main">

        {/* ------------------------------ Shipping ------------------------------ */}
        <section className="checkout-contact-panel">
          <div className="checkout-panel-heading">
            <AppIcon name="inventory_2"  aria-hidden="true" />
            <div>
              <h2>{isEs ? 'Envío' : 'Shipping'}</h2>
            </div>
          </div>
          {isGuest && (
            <p className="text-xs mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs ? '¿Ya tiene cuenta? ' : 'Have an account? '}
              <Link
                href={`${prefix}/account/sign-in?next=${prefix}/checkout`}
                style={{ color: GOLD, fontWeight: 700 }}
              >
                {isEs ? 'Inicie sesión' : 'Sign in'}
              </Link>
              {isEs ? ' para un pago más rápido — opcional.' : ' for faster checkout — optional.'}
            </p>
          )}

          {/* Delivery method comes FIRST (owner request 2026-08-04): it decides
              whether a shipping address is required at all, so asking it before
              the address stops a Local Pickup buyer from filling in an address
              they never needed. */}
          <div className="checkout-subhead" style={{ marginTop: 0 }}>
            {isEs ? 'Método de entrega' : 'Delivery method'}
          </div>
          <div role="radiogroup" aria-label={isEs ? 'Método de entrega' : 'Delivery method'} className="checkout-delivery-options">
            {CHECKOUT_SHIPPING_OPTIONS
              .filter((option) => isShippingMethodAvailable(option.value, cartSubtotal))
              .map((option) => {
                const fee = getCheckoutShippingFee(option.value, cartSubtotal) ?? 0;
                const selected = effectiveShippingMethod === option.value;
                // Local Pickup names the actual place. It said only "in the
                // Naples area" until 2026-08-17, so a buyer chose it without
                // ever being shown where they would be driving.
                const description = option.value === 'local-pickup'
                  ? (isEs
                      ? `Recogida en persona en ${addressWithLandmark(true)}. ${pickupHoursLine}. No se necesita dirección de envío.`
                      : `In-person pickup at ${addressWithLandmark(false)}. ${pickupHoursLine}. No shipping address needed.`)
                  : option.value === 'express-overnight-insured'
                    ? (isEs ? 'Entrega al día siguiente, totalmente asegurada.' : 'Next-day delivery, fully insured.')
                    : (isEs ? 'Envío totalmente asegurado con firma de entrega.' : 'Fully insured shipping with delivery signature.');
                return (
                  <label key={option.value} className="checkout-delivery-option" data-selected={selected ? 'true' : 'false'}>
                    <input
                      type="radio"
                      name="checkout-delivery-method"
                      value={option.value}
                      checked={selected}
                      onChange={() => setShippingMethod(option.value)}
                      style={{ accentColor: GOLD, width: '1.05rem', height: '1.05rem', flexShrink: 0, marginTop: '0.15rem' }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-sm" style={{ color: 'var(--color-on-surface)' }}>
                          {isEs ? option.labelEs : option.labelEn}
                        </span>
                        <span className="font-bold text-sm" style={{ color: GOLD }}>{formatCheckoutCurrency(fee)}</span>
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>{description}</span>
                    </span>
                  </label>
                );
              })}
          </div>
          {getShippingServiceNote(effectiveShippingMethod, cartSubtotal, isEs) && (
            <p className="text-xs leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
              {getShippingServiceNote(effectiveShippingMethod, cartSubtotal, isEs)}
            </p>
          )}
          {cartSubtotal >= EXPRESS_SHIPPING_MAX_SUBTOTAL && (
            <p className="text-xs leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'El envío nocturno no está disponible para pedidos de $5,000 o más (límite de seguro del transportista).'
                : 'Overnight shipping is unavailable for orders of $5,000 or more (carrier insurance limit).'}
            </p>
          )}

          <div className="checkout-subhead">
            {isEs ? 'Datos de contacto' : 'Contact details'}
          </div>
          {/* Field ORDER is load-bearing, not cosmetic. Phone used to sit
              directly after the name — side by side on desktop, immediately
              below it on mobile — so a buyer who had just typed her first name
              met a box where her surname was the natural next thing to type,
              and one did exactly that. Last Name now occupies that position.
              Keep Phone away from the name fields. */}
          <div className="responsive-form-grid">
            <div>
              <label className="form-label" htmlFor="checkout-first-name">{isEs ? 'Nombre' : 'First Name'} *</label>
              <input
                id="checkout-first-name"
                required
                className="form-field"
                autoComplete="given-name"
                value={customer.first_name}
                onChange={(e) => setCustomer({ ...customer, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="checkout-last-name">{isEs ? 'Apellido' : 'Last Name'} *</label>
              <input
                id="checkout-last-name"
                required
                className="form-field"
                autoComplete="family-name"
                value={customer.last_name}
                onChange={(e) => setCustomer({ ...customer, last_name: e.target.value })}
              />
            </div>
          </div>
          <div className="responsive-form-grid">
            <div>
              <label className="form-label" htmlFor="checkout-email">{isEs ? 'Correo electrónico' : 'Email'} *</label>
              <input id="checkout-email" required type="email" className="form-field" autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
            </div>
            <div>
              <label className="form-label" htmlFor="checkout-phone">{isEs ? 'Teléfono' : 'Phone'} *</label>
              <input
                id="checkout-phone"
                required
                type="tel"
                inputMode="tel"
                placeholder="(239) 555-0123"
                className="form-field"
                autoComplete="tel"
                // Only once they've typed something — an untouched empty field
                // is incomplete, not wrong.
                aria-invalid={customer.phone.trim() !== '' && normalizedPhone === null}
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="checkout-address-fields">
            {needsShipping ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Dirección' : 'Address'}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {isEs
                    ? 'Enviaremos su pedido a esta dirección. ¿Prefiere recogerlo en persona? Elija Recogida local arriba.'
                    : 'We’ll ship your order to this address. Prefer to pick it up in person? Choose Local Pickup above.'}
                </p>
              </div>
            ) : (
              // Local pickup: address isn't needed, so tuck it behind an accordion
              // the buyer can open if they'd still like to add one.
              <button
                type="button"
                onClick={() => setAddressExpanded((open) => !open)}
                aria-expanded={addressExpanded}
                aria-controls="checkout-address-inputs"
                className="checkout-address-toggle"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  border: '1px solid rgba(216, 208, 194, 0.94)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255, 253, 248, 0.9)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Dirección (opcional)' : 'Address (optional)'}
                </span>
                <AppIcon name={addressExpanded ? 'expand_less' : 'expand_more'}  aria-hidden="true" style={{ fontSize: '20px', color: GOLD, lineHeight: 1 }} />
              </button>
            )}
            {(needsShipping || addressExpanded) && (
              <div id="checkout-address-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label" htmlFor="checkout-address1">{isEs ? 'Dirección' : 'Street Address'}{needsShipping ? ' *' : ''}</label>
                  <input id="checkout-address1" required={needsShipping} className="form-field" autoComplete="address-line1" value={customer.address_line1} onChange={(e) => setCustomer({ ...customer, address_line1: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="checkout-address2">{isEs ? 'Apartamento, suite, etc. (opcional)' : 'Apartment, suite, etc. (optional)'}</label>
                  <input id="checkout-address2" className="form-field" autoComplete="address-line2" value={customer.address_line2} onChange={(e) => setCustomer({ ...customer, address_line2: e.target.value })} />
                </div>
                <div className="responsive-form-grid">
                  <div>
                    <label className="form-label" htmlFor="checkout-city">{isEs ? 'Ciudad' : 'City'}{needsShipping ? ' *' : ''}</label>
                    <input id="checkout-city" required={needsShipping} className="form-field" autoComplete="address-level2" value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="checkout-state">{isEs ? 'Estado' : 'State'}{needsShipping ? ' *' : ''}</label>
                    <select
                      id="checkout-state"
                      required={needsShipping}
                      className="form-field"
                      autoComplete="address-level1"
                      value={customer.state}
                      onChange={(e) => setCustomer({ ...customer, state: e.target.value })}
                    >
                      <option value="">{isEs ? 'Seleccione un estado' : 'Select a state'}</option>
                      {US_STATES.map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="responsive-form-grid">
                  <div>
                    <label className="form-label" htmlFor="checkout-zip">{isEs ? 'Código postal' : 'ZIP / Postal Code'}{needsShipping ? ' *' : ''}</label>
                    <input
                      id="checkout-zip"
                      required={needsShipping}
                      className="form-field"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      maxLength={10}
                      pattern="[0-9]{5}(-[0-9]{4})?"
                      placeholder="12345"
                      value={customer.postal_code}
                      aria-invalid={needsShipping && customer.postal_code.trim() !== '' && normalizedShippingZip === null}
                      aria-describedby={
                        needsShipping && customer.postal_code.trim() !== '' && normalizedShippingZip === null
                          ? 'checkout-zip-error'
                          : undefined
                      }
                      onChange={(e) => {
                        const entered = e.target.value;
                        setCustomer({
                          ...customer,
                          postal_code: normalizeUsZip(entered) ?? entered,
                        });
                      }}
                    />
                    {needsShipping && customer.postal_code.trim() !== '' && normalizedShippingZip === null && (
                      <p id="checkout-zip-error" role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>
                        {isEs
                          ? 'Ingrese un código postal de EE. UU. válido (12345 o 12345-6789).'
                          : 'Enter a valid U.S. ZIP code (12345 or 12345-6789).'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="form-label" htmlFor="checkout-country">{isEs ? 'País' : 'Country'}</label>
                    <input
                      id="checkout-country"
                      readOnly
                      className="form-field"
                      autoComplete="country-name"
                      value="United States"
                      aria-describedby="checkout-country-note"
                    />
                    <p id="checkout-country-note" className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {isEs ? 'Actualmente solo enviamos dentro de Estados Unidos.' : 'We currently ship only within the United States.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <FormPrivacyNotice locale={locale} />
        </section>
        </div>

        {/* --------------------------- Order summary --------------------------- */}
        <aside className="checkout-aside">
          <div className="checkout-summary-card">
            <div className="checkout-summary-head">
              <h2 className="checkout-summary-title">
                {isEs ? 'Resumen del pedido' : 'Order summary'}
              </h2>
              <button
                type="button"
                onClick={openDrawer}
                className="checkout-recap-edit"
                style={{ marginTop: 0 }}
              >
                {isEs ? 'Editar carrito' : 'Edit cart'}
              </button>
            </div>

            {/* Items sit at the TOP of the summary, above the totals — the
                standard checkout order (Shopify/Stripe): the buyer confirms
                what they're buying, then what it costs, then pays. */}
            <div className="checkout-summary-items">
              <OrderSummary
                items={summaryItems}
                isEs={isEs}
                prefix={prefix}
                shippingMethod={effectiveShippingMethod}
                shippingState={customer.state}
                onRemove={remove}
                onSetQuantity={setQuantity}
                variant="expanded"
                showAvailability
                hideSoldItemPrices={hideSoldItemPrices}
                showTotals={false}
                bare
                heading={null}
                quote={quote}
              />
            </div>

            {/* Sits between the items and the totals so the discount row it
                produces appears directly below the subtotal it modifies. */}
            <DiscountCodeField
              items={summaryItems}
              shippingMethod={effectiveShippingMethod}
              shippingState={customer.state}
              email={customer.email}
              isEs={isEs}
              applied={appliedDiscount}
              onApplied={setAppliedDiscount}
              onCleared={() => setAppliedDiscount(null)}
            />

            {priceChange && (
              <div
                role="status"
                className="text-xs leading-relaxed"
                style={{
                  padding: '0.7rem 0.8rem',
                  border: '1px solid color-mix(in srgb, #735c00 45%, transparent)',
                  background: 'color-mix(in srgb, #735c00 8%, transparent)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--color-on-surface)',
                }}
              >
                <strong>{isEs ? 'El precio se actualizó.' : 'The price updated.'}</strong>{' '}
                {isEs
                  ? 'Los precios de los metales cambian durante el día. Su total cambió de '
                  : 'Metal prices move through the day. Your total changed from '}
                <strong>{formatCheckoutCurrency(priceChange.from)}</strong>
                {isEs ? ' a ' : ' to '}
                <strong>{formatCheckoutCurrency(priceChange.to)}</strong>.{' '}
                <strong>{isEs ? 'NO se le ha cobrado' : 'You have not been charged'}</strong>
                {isEs
                  ? ' — revise el resumen actualizado y marque la casilla de confirmación para continuar.'
                  : ' — review the updated summary and tick the confirmation box to continue.'}
              </div>
            )}

            <OrderTotals
              items={summaryItems}
              isEs={isEs}
              shippingMethod={effectiveShippingMethod}
              shippingState={customer.state}
              hideSoldItemPrices={hideSoldItemPrices}
              appliedDiscount={appliedDiscount}
              quote={quote}
              taxExempt={Boolean(exemption)}
            />

            <CheckoutTaxExempt
              isEs={isEs}
              locale={locale}
              taxApplies={taxApplies}
              customer={{
                name: formatFullName(customer.first_name, customer.last_name),
                email: customer.email,
                phone: normalizedPhone ?? customer.phone,
              }}
              cart={{
                items: items.map((i) => ({ id: i.id, quantity: Math.max(1, Math.floor(i.purchaseQuantity ?? 1)) })),
                shippingMethod: effectiveShippingMethod,
                shippingState: customer.state,
                discountCode: appliedDiscount?.code ?? null,
              }}
              onChange={onExemptionChange}
            />

            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs ? 'Al realizar un pedido, confirma que ha leído y acepta nuestras ' : 'By placing an order, you confirm you have read and agree to our '}
              <Link href={`${prefix}/returns-refunds`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>
                {isEs ? 'Devoluciones' : 'Returns & Refunds'}
              </Link>
              {', '}
              <Link href={`${prefix}/shipping`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>
                {isEs ? 'Envíos' : 'Shipping'}
              </Link>
              {', '}
              <Link href={`${prefix}/terms`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>
                {isEs ? 'Términos' : 'Terms'}
              </Link>
              {isEs ? ' y ' : ', and '}
              <Link href={`${prefix}/privacy`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>
                {isEs ? 'Privacidad' : 'Privacy Policy'}
              </Link>
              .
            </p>

            <div className="checkout-confirm-box">
              <input
                type="checkbox"
                id="checkout-confirm-info"
                checked={infoConfirmed}
                onChange={(e) => setInfoConfirmed(e.target.checked)}
                style={{ accentColor: GOLD, width: '1.05rem', height: '1.05rem', flexShrink: 0, cursor: 'pointer', marginTop: '0.15rem' }}
              />
              <label
                htmlFor="checkout-confirm-info"
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-on-surface)', cursor: 'pointer' }}
              >
                {isEs
                  ? 'Confirmo que he revisado mi pedido y que mis datos de contacto y dirección de envío son correctos.'
                  : 'I confirm that I have reviewed my order and that my contact details and shipping address are correct.'}
              </label>
            </div>

            {hasUnavailableItem ? (
              <div
                role="alert"
                className="flex items-start gap-2 text-sm"
                style={{
                  padding: '0.75rem 0.85rem',
                  border: '1px solid color-mix(in srgb, var(--color-error) 45%, transparent)',
                  background: 'color-mix(in srgb, var(--color-error) 9%, transparent)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--color-error)',
                  fontWeight: 600,
                }}
              >
                <AppIcon name="error"  aria-hidden="true" style={{ fontSize: '1.15rem', lineHeight: 1.25, flexShrink: 0 }} />
                <span>
                  {isEs
                    ? `Ya no está disponible: ${unavailableItems.map((i) => i.title_es || i.title).join(', ')}. Elimínelo de su pedido para continuar con el pago.`
                    : `No longer available: ${unavailableItems.map((i) => i.title).join(', ')}. Please remove it from your order to continue to payment.`}
                </span>
              </div>
            ) : paypalClientId ? (
              <PayPalCheckoutButton
                clientId={paypalClientId}
                amount={displayedTotals.total}
                ready={payReady}
                isEs={isEs}
                missingFields={missingFieldLabels}
                needsInfoConfirmation={!infoConfirmed}
                getPayload={buildPayPalPayload}
                onOrderId={(id) => {
                  orderIdRef.current = id;
                  orderPayloadKeyRef.current = cartPayloadKey;
                }}
                // A create-order/capture error can mean an item just sold out — re-check
                // live stock so the summary + this button reflect it immediately.
                onAvailabilityIssue={() => { void refreshAvailability(); }}
                // The server refused because the total moved. Nothing was
                // charged and no order exists. Show the new figures and make
                // the buyer re-confirm before payment can start again.
                onPriceChange={({ quotedTotal, quote: freshQuote }) => {
                  // Tagged with the current cart so it is honoured immediately.
                  setQuoteState({ key: quoteKey, quote: freshQuote });
                  setPriceChange({ from: quotedTotal, to: freshQuote.total });
                  setInfoConfirmed(false);
                  // A stale reusable order id would re-submit the old amount.
                  orderIdRef.current = null;
                  orderPayloadKeyRef.current = null;
                }}
                onSuccess={({ orderNumber }) => {
                  // Snapshot the order for the printable confirmation, THEN clear the
                  // cart (clearing empties `items`, so capture the summary first).
                  setCreatedOrder({ orderNumber, items: summaryItems, shippingMethod: effectiveShippingMethod, customer });
                  clear();
                }}
              />
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                {isEs
                  ? 'El pago en línea no está disponible en este momento. Llámenos al (239) 404-8505.'
                  : 'Online payment is unavailable right now. Please call us at (239) 404-8505.'}
              </p>
            )}
          </div>
        </aside>
      </div>
      </div>

      <style jsx>{`
        .checkout-page {
          /* var(--app-vh), NOT svh. svh does not do what it promises in an
             in-app browser: all three viewport units collapse to one number
             there and that number tracks the chrome. This is a page
             min-height, so on the measured 124px of travel it moved the
             document by 124px under a buyer mid-checkout. vh stays as the
             legacy fallback. (No backticks in this comment - it is inside a
             styled-jsx template literal.) */
          min-height: 100vh;
          min-height: var(--app-vh);
          padding: 3rem 0 4rem;
          background:
            linear-gradient(180deg, rgba(255, 253, 248, 0.94) 0%, rgba(249, 247, 239, 0.98) 46%, #f9f7ef 100%),
            radial-gradient(circle at top right, rgba(212, 175, 55, 0.18), transparent 34%);
        }
        .checkout-shell {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding-inline: clamp(1rem, 4vw, 2rem);
        }
        /* Two columns from 1024px: decisions on the left, money on the right.
           Below that they stack, summary last, so a phone reads the form first
           and lands on the pay controls at the end. */
        .checkout-layout {
          display: grid;
          gap: 1.25rem;
          /* Columns STRETCH to the row height on purpose: the summary card is
             sticky, and a sticky element only travels within its containing
             block. A content-sized (align-items:start) rail would give it zero
             travel and it would scroll away like static content. */
          align-items: stretch;
        }
        @media (min-width: 1024px) {
          .checkout-layout {
            grid-template-columns: minmax(0, 1fr) minmax(20rem, 23rem);
            gap: 1.5rem;
          }
        }
        .checkout-main {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-width: 0;
        }
        .checkout-aside {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-width: 0;
        }
        @media (min-width: 1024px) {
          .checkout-summary-card {
            position: sticky;
            top: 5.5rem;
            /* A sticky box taller than the viewport pins its top and leaves its
               bottom permanently unreachable — which would strand the pay
               button on a long cart. Bounding the card to the viewport and
               letting it scroll internally keeps every control reachable. */
            max-height: calc(100svh - 7rem);
            overflow-y: auto;
          }
        }
        .checkout-summary-card {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          padding: clamp(1.1rem, 2.4vw, 1.4rem);
          border: 1px solid rgba(216, 208, 194, 0.94);
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 14px 36px rgba(75, 60, 24, 0.07);
        }
        .checkout-summary-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .checkout-summary-title {
          margin: 0;
          font-family: var(--font-headline);
          font-size: 1.35rem;
          color: var(--color-on-surface);
        }
        /* One scroll region only — the rail itself (see .checkout-aside). A
           second nested scroller here would fight it for wheel events. */
        .checkout-summary-items {
          padding-bottom: 0.9rem;
          border-bottom: 1px solid rgba(216, 208, 194, 0.94);
        }
        .checkout-subhead {
          margin-top: 0.35rem;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: ${GOLD};
          font-family: var(--font-label);
        }
        .checkout-method-card {
          display: flex;
          gap: 0.75rem;
          padding: 0.9rem 1rem;
          border: 1px solid rgba(216, 208, 194, 0.94);
          border-radius: var(--radius-lg);
          background: rgba(255, 253, 248, 0.9);
        }
        .checkout-method-card[data-selected='true'] {
          border-color: #b5890c;
          box-shadow: 0 0 0 1px #b5890c inset;
        }
        .checkout-method-mark {
          display: inline-flex;
          width: 2rem;
          height: 2rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(212, 175, 55, 0.14);
          color: ${GOLD};
        }
        .checkout-hero {
          margin-bottom: 1.5rem;
          padding: clamp(1.25rem, 3vw, 2rem);
          border: 1px solid rgba(216, 208, 194, 0.86);
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 18px 48px rgba(75, 60, 24, 0.08);
        }
        @media (max-width: 640px) {
          .checkout-page {
            padding: 1.25rem 0 3rem;
          }
          .checkout-hero {
            margin-bottom: 0.85rem;
            padding: 0.75rem 1.1rem;
          }
        }
        .checkout-delivery-options {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .checkout-delivery-option {
          display: flex;
          gap: 0.75rem;
          padding: 0.9rem 1rem;
          border: 1px solid rgba(216, 208, 194, 0.94);
          border-radius: var(--radius-lg);
          background: rgba(255, 253, 248, 0.9);
          cursor: pointer;
        }
        .checkout-delivery-option[data-selected='true'] {
          border-color: #b5890c;
          box-shadow: 0 0 0 1px #b5890c inset;
        }
        .checkout-confirm-box {
          display: flex;
          align-items: flex-start;
          gap: 0.7rem;
          padding: 0.8rem 0.9rem;
          border: 1px solid rgba(216, 208, 194, 0.94);
          border-radius: var(--radius-lg);
          background: rgba(255, 253, 248, 0.9);
        }
        .checkout-recap-edit {
          margin-top: 0.35rem;
          padding: 0;
          border: none;
          background: none;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #735c00;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
          font-family: var(--font-label);
        }
        .checkout-address-fields {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .checkout-contact-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: clamp(1.25rem, 3vw, 1.75rem);
          border: 1px solid rgba(216, 208, 194, 0.94);
          background: rgba(255, 255, 255, 0.86);
          box-shadow: 0 14px 36px rgba(75, 60, 24, 0.07);
        }
        .checkout-panel-heading {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding-bottom: 0.35rem;
        }
        .checkout-panel-heading > .app-icon {
          display: inline-flex;
          width: 2.5rem;
          height: 2.5rem;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(212, 175, 55, 0.12);
          color: ${GOLD};
        }
        .checkout-panel-heading h2 {
          margin: 0.15rem 0 0;
          font-family: var(--font-headline);
          font-size: clamp(1.25rem, 2.4vw, 1.75rem);
          color: var(--color-on-surface);
        }
      `}</style>
    </div>
    </>
  );
}
