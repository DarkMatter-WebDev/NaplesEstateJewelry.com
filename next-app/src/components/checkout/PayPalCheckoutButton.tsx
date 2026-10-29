'use client';

import { useEffect, useRef, useState } from 'react';
import { checkoutErrorMessageForCode, composeUnknownErrorMessage, isAvailabilityError } from '@/lib/checkout-error-messages';
import { formatCheckoutCurrency, type OrderQuote } from '@/lib/checkout-pricing';
import { buildCardBillingAddress, cardFieldsProblem, EMPTY_BILLING_FORM, isPickupMethod, type BillingForm } from '@/lib/card-billing';
import { AppIcon } from '@/components/AppIcon';
import CardBillingInputs from '@/components/checkout/CardBillingInputs';
import {
  CARD_FIELD_STYLE,
  loadGooglePayJs,
  loadPayPalSdk,
  type ApplePayConfig,
  type GooglePayConfig,
  type GooglePaymentAuthorizationResult,
  type GooglePaymentsClient,
  type PayPalBillingAddress,
  type PayPalButtonsConfig,
  type PayPalButtonsInstance,
  type PayPalCardField,
  type PayPalCardFieldsConfig,
  type PayPalCardFieldsInstance,
  type PayPalGooglePay,
} from './paypal-sdk';

// Fire-and-forget: tell the server to soft-cancel the unpaid order the buyer
// just abandoned. `keepalive` lets the request survive a page/tab teardown.
function cancelAbandonedOrder(orderId: string | null) {
  if (!orderId) return;
  try {
    void fetch('/api/paypal/cancel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore — best effort */
  }
}

export type PayPalPayload = {
  items: { id: string; quantity: number }[];
  customer: Record<string, unknown>;
  shippingMethod: string;
  orderId: string | null;
  /** A counter-offer's private Buy-now token (lib/offers.ts) — the agreed price for its one item. */
  counterToken?: string | null;
  locale?: string;
  /** The total on screen; the server only compares it (`price_changed`), never charges it. */
  quotedTotal?: number | null;
};

/** How the buyer is paying. Sent with the capture so the server knows to check a card's 3-D Secure result. */
type PaymentMethod = 'paypal' | 'card' | 'apple_pay' | 'google_pay';
type CaptureOutcome = 'paid' | 'declined' | 'stopped';

// Count of consecutive *unknown* PayPal errors (the SDK's onError with no reason
// we can pin down — e.g. a card declined in PayPal's hosted card form). Kept in
// sessionStorage so "they were sent back a second time" is detected even if the
// card flow did a full-page redirect back to us. Cleared on a completed payment.
const UNKNOWN_ERROR_COUNT_KEY = 'nej-checkout-unknown-errors';
const CAPTURE_RECOVERY_KEY = 'nej-checkout-capture-recovery';
const CAPTURE_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const STORE_NAME = 'Naples Estate Jewelry';
/** PayPal's buttons and the wallet buttons share one height so the stack reads as a set. */
const WALLET_BUTTON_HEIGHT = 45;

type CaptureRecovery = {
  orderId: string | null;
  cartKey: string;
  reason: 'captured' | 'unknown' | 'conflict';
  createdAt: number;
};

type PaymentStage = 'idle' | 'awaiting-approval' | 'processing';

function cartKey(payload: PayPalPayload): string {
  return JSON.stringify(
    payload.items
      .map((item) => [item.id, item.quantity] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function readCaptureRecovery(): CaptureRecovery | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CAPTURE_RECOVERY_KEY) ?? 'null') as CaptureRecovery | null;
    if (!parsed || Date.now() - parsed.createdAt > CAPTURE_RECOVERY_TTL_MS) {
      sessionStorage.removeItem(CAPTURE_RECOVERY_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCaptureRecovery(payload: PayPalPayload, orderId: string | null, reason: CaptureRecovery['reason']): void {
  try {
    sessionStorage.setItem(CAPTURE_RECOVERY_KEY, JSON.stringify({
      orderId,
      cartKey: cartKey(payload),
      reason,
      createdAt: Date.now(),
    } satisfies CaptureRecovery));
  } catch {
    /* ignore - current-page state still blocks another submission */
  }
}

function clearCaptureRecovery(): void {
  try {
    sessionStorage.removeItem(CAPTURE_RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}

function readUnknownErrorCount(): number {
  try {
    return Number(sessionStorage.getItem(UNKNOWN_ERROR_COUNT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function bumpUnknownErrorCount(): number {
  const next = readUnknownErrorCount() + 1;
  try {
    sessionStorage.setItem(UNKNOWN_ERROR_COUNT_KEY, String(next));
  } catch {
    /* ignore — private mode / storage disabled */
  }
  return next;
}

function clearUnknownErrorCount(): void {
  try {
    sessionStorage.removeItem(UNKNOWN_ERROR_COUNT_KEY);
  } catch {
    /* ignore */
  }
}

export default function PayPalCheckoutButton({
  clientId,
  currency = 'USD',
  amount = null,
  ready,
  isEs,
  missingFields,
  needsInfoConfirmation,
  getPayload,
  onOrderId,
  onSuccess,
  onAvailabilityIssue,
  onPriceChange,
  createOrderUrl = '/api/paypal/create-order',
  cancelOnAbandon = true,
}: {
  clientId: string;
  currency?: string;
  /** The total on screen. Apple Pay / Google Pay show it in their sheet and the
   *  card form's Pay button names it; without it the wallets stay hidden. */
  amount?: number | null;
  ready: boolean;
  isEs: boolean;
  /** Labels of required *form fields* that are currently empty, in form order
   *  (the confirmation checkbox is tracked separately via needsInfoConfirmation). */
  missingFields: string[];
  /** True when the "confirm my information" checkbox is not yet checked. */
  needsInfoConfirmation: boolean;
  getPayload: () => PayPalPayload;
  onOrderId: (orderId: string) => void;
  onSuccess: (result: { orderId: string; orderNumber: string }) => void;
  /** Called when an error may be caused by an item selling out (create-order
   *  rejection, capture conflict, or a generic PayPal error) so the parent can
   *  re-check live stock and update the summary. */
  onAvailabilityIssue?: () => void;
  /** Called when the server refused the order because the displayed total no
   *  longer matches the chargeable one. Nothing was charged — the server
   *  rejects before creating an order or a PayPal order. */
  onPriceChange?: (info: { quotedTotal: number; quote: OrderQuote }) => void;
  /** Where the PayPal order is opened. A remote-sale invoice's pay page (2026-10-21) passes its own route. */
  createOrderUrl?: string;
  /** false on an invoice: closing the PayPal window must never cancel the invoice's order. */
  cancelOnAbandon?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const googlePayContainerRef = useRef<HTMLDivElement>(null);
  const cardNumberRef = useRef<HTMLDivElement>(null);
  const cardExpiryRef = useRef<HTMLDivElement>(null);
  const cardCvvRef = useRef<HTMLDivElement>(null);
  const cardNameRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('idle');
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>('paypal');
  const [captureRecoveryRequired, setCaptureRecoveryRequired] = useState(false);
  // Inline red reminder shown when the buyer clicks pay before completing the
  // required fields / confirmation checkbox (replaces the old full-screen modal).
  // `at` = which pay control asked, so the reminder shows next to it.
  const [missingHint, setMissingHint] = useState<{ fields: string[]; needsConfirm: boolean; at: 'top' | 'card' } | null>(null);
  // Advanced Checkout (2026-10-28): each piece appears only once PayPal (and the
  // buyer's device) says it can be used here.
  const [cardEligible, setCardEligible] = useState(false);
  const [applePayConfig, setApplePayConfig] = useState<ApplePayConfig | null>(null);
  const [googlePayReady, setGooglePayReady] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<BillingForm>(EMPTY_BILLING_FORM);

  // Keep the latest callbacks/getters in refs so the PayPal Buttons instance
  // (initialized once) always reads current cart + contact state.
  const getPayloadRef = useRef(getPayload);
  const onOrderIdRef = useRef(onOrderId);
  const onSuccessRef = useRef(onSuccess);
  const onPriceChangeRef = useRef(onPriceChange);
  // Internal order id created by the most recent create-order call. Used to
  // cancel the lingering unpaid order if the buyer abandons the PayPal window.
  const createdOrderIdRef = useRef<string | null>(null);
  const isEsRef = useRef(isEs);
  const readyRef = useRef(ready);
  const amountRef = useRef(amount);
  const missingFieldsRef = useRef(missingFields);
  const needsInfoConfirmationRef = useRef(needsInfoConfirmation);
  const onAvailabilityIssueRef = useRef(onAvailabilityIssue);
  const captureRecoveryRequiredRef = useRef(captureRecoveryRequired);
  const paymentStageRef = useRef(paymentStage);
  // Set when createOrder/onApprove already showed a specific message, so the
  // PayPal SDK's follow-up onError doesn't clobber it with the generic one.
  const handledErrorRef = useRef(false);
  // After a decline the next attempt must use a NEW PayPal order: the declined
  // one would come straight back (same request id) with its cached decline.
  const freshPayPalOrderRef = useRef(false);
  const createOrderUrlRef = useRef(createOrderUrl);
  const cancelOnAbandonRef = useRef(cancelOnAbandon);
  const cardFieldsRef = useRef<PayPalCardFieldsInstance | null>(null);
  const cardFieldPartsRef = useRef<PayPalCardField[]>([]);
  const googlePayRef = useRef<{ client: GooglePaymentsClient; config: GooglePayConfig; googlepay: PayPalGooglePay } | null>(null);
  // The Google Pay order the sheet approved, finished after the sheet closes.
  const pendingGooglePayRef = useRef<{ orderId: string; needsPayerAction: boolean } | null>(null);
  useEffect(() => {
    createOrderUrlRef.current = createOrderUrl;
    cancelOnAbandonRef.current = cancelOnAbandon;
    getPayloadRef.current = getPayload;
    onOrderIdRef.current = onOrderId;
    onSuccessRef.current = onSuccess;
    isEsRef.current = isEs;
    readyRef.current = ready;
    amountRef.current = amount;
    missingFieldsRef.current = missingFields;
    needsInfoConfirmationRef.current = needsInfoConfirmation;
    onAvailabilityIssueRef.current = onAvailabilityIssue;
    onPriceChangeRef.current = onPriceChange;
    captureRecoveryRequiredRef.current = captureRecoveryRequired;
    paymentStageRef.current = paymentStage;
  });

  function changeStage(stage: PaymentStage) {
    paymentStageRef.current = stage;
    setPaymentStage(stage);
  }

  // The checks every pay control runs before anything starts: a payment that
  // already went through blocks a second one, and the form must be complete.
  function canStartPayment(at: 'top' | 'card'): boolean {
    if (captureRecoveryRequiredRef.current) {
      const saved = readCaptureRecovery();
      if (saved && saved.cartKey !== cartKey(getPayloadRef.current())) {
        clearCaptureRecovery();
        captureRecoveryRequiredRef.current = false;
        setCaptureRecoveryRequired(false);
        setMessage(null);
      } else {
        setMessage(
          isEsRef.current
            ? 'PayPal ya capturó este pago y la actualización del pedido sigue pendiente. No envíe el pago otra vez; contáctenos si necesita ayuda.'
            : 'PayPal already captured this payment and the order update is still pending. Do not submit payment again; contact us if you need help.',
        );
        setMissingHint(null);
        return false;
      }
    }
    if (!readyRef.current) {
      setMissingHint({ fields: missingFieldsRef.current, needsConfirm: needsInfoConfirmationRef.current, at });
      return false;
    }
    setMissingHint(null);
    setMessage(null);
    setCardError(null);
    handledErrorRef.current = false;
    return true;
  }

  function showDeclined() {
    changeStage('idle');
    handledErrorRef.current = true;
    freshPayPalOrderRef.current = true;
    setMessage(checkoutErrorMessageForCode('card_declined', isEsRef.current));
  }

  async function createOrderForPayment(method: PaymentMethod): Promise<string> {
    setActiveMethod(method);
    setMessage(null);
    handledErrorRef.current = false;
    changeStage(method === 'paypal' ? 'awaiting-approval' : 'processing');
    try {
      const res = await fetch(createOrderUrlRef.current, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getPayloadRef.current(),
          ...(freshPayPalOrderRef.current ? { newPayPalOrder: true } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.paypalOrderId) {
        // Carry the server's machine-readable rejection code (if any) so the
        // catch below can show precise bilingual guidance for it.
        throw Object.assign(new Error(data?.error ?? 'create-order failed'), {
          checkoutCode: typeof data?.code === 'string' ? data.code : undefined,
          // Carried through so the page can show old -> new and force a
          // fresh confirmation. Nothing was charged; the server refused
          // before creating anything.
          priceChange: data?.code === 'price_changed' && data?.quote
            ? { quotedTotal: Number(data.quotedTotal), quote: data.quote }
            : undefined,
        });
      }
      freshPayPalOrderRef.current = false;
      if (data.orderId) {
        createdOrderIdRef.current = data.orderId as string;
        onOrderIdRef.current(data.orderId);
      }
      return data.paypalOrderId as string;
    } catch (err) {
      changeStage('idle');
      handledErrorRef.current = true; // a specific message is shown below; onError must not overwrite it
      const serverMsg = err instanceof Error ? err.message : '';
      const checkoutCode = err instanceof Error
        ? (err as Error & { checkoutCode?: string }).checkoutCode
        : undefined;
      const priceChange = err instanceof Error
        ? (err as Error & { priceChange?: { quotedTotal: number; quote: OrderQuote } }).priceChange
        : undefined;
      if (priceChange) {
        // Hand the new figures to the page so the summary updates and the
        // confirmation checkbox is cleared — the buyer must actively agree
        // to the new total before any payment can start.
        onPriceChangeRef.current?.(priceChange);
      }
      const codedMessage = checkoutErrorMessageForCode(checkoutCode, isEsRef.current);
      if (codedMessage) {
        // A precise, non-stock rejection (Express over $5,000, spot outage,
        // price confirmation) — show its own guidance; no stock re-check.
        setMessage(codedMessage);
      } else if (isAvailabilityError(serverMsg)) {
        // An item sold out (or dropped below the requested quantity) before we
        // could start payment. Re-check live stock so the summary flags it.
        onAvailabilityIssueRef.current?.();
        setMessage(
          isEsRef.current
            ? 'Un artículo de su pedido ya no está disponible o tiene poco stock. Revise la disponibilidad en su resumen de arriba y ajuste su carrito.'
            : 'An item in your order is no longer available or is low on stock. Check the availability in your order summary above and adjust your cart.',
        );
      } else {
        setMessage(
          isEsRef.current
            ? 'No se pudo iniciar el pago. Verifique su carrito e intente de nuevo.'
            : 'Could not start payment. Please check your cart and try again.',
        );
      }
      throw err;
    }
  }

  // Capture the approved PayPal order on our server and finish the sale. Every
  // way of paying ends here, so a decline, a pending capture and an item won by
  // another buyer read the same whichever button the buyer used.
  async function captureAndFinish(paypalOrderId: string, method: PaymentMethod): Promise<CaptureOutcome> {
    changeStage('processing');
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalOrderId, paymentMethod: method }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result?.success) {
        if (result?.code === 'card_declined') {
          // Declined at capture — nothing charged. Say so, and leave the
          // buttons live: the next tap reuses this same order (the order id
          // is kept; only its PayPal order is replaced), so no extra order is
          // created and no window opens until the buyer chooses to pay again.
          showDeclined();
          return 'declined';
        }
        if (result?.paymentCaptured || result?.paymentStatusUnknown) {
          const recoveryReason: CaptureRecovery['reason'] = result?.itemConflict
            ? 'conflict'
            : result?.paymentCaptured
              ? 'captured'
              : 'unknown';
          saveCaptureRecovery(
            getPayloadRef.current(),
            result?.orderId ?? createdOrderIdRef.current,
            recoveryReason,
          );
          createdOrderIdRef.current = null;
          changeStage('idle');
          setCaptureRecoveryRequired(true);
          captureRecoveryRequiredRef.current = true;
          handledErrorRef.current = true;
          if (result?.itemConflict) {
            onAvailabilityIssueRef.current?.();
            setMessage(
              isEsRef.current
                ? 'PayPal capturó su pago, pero otro cliente compró el artículo primero. No vuelva a pagar; nuestro equipo lo contactará para el reembolso.'
                : 'PayPal captured your payment, but another buyer purchased the item first. Do not pay again; our team will contact you about the refund.',
            );
          } else if (result?.paymentCaptured) {
            setMessage(
              isEsRef.current
                ? 'PayPal capturó su pago, pero la actualización del pedido sigue pendiente. No vuelva a pagar. Nuestro equipo puede confirmar el pedido con la referencia de PayPal.'
                : 'PayPal captured your payment, but the order update is still pending. Do not pay again. Our team can confirm the order from the PayPal reference.',
            );
          } else {
            setMessage(
              isEsRef.current
                ? 'PayPal no pudo confirmar el estado del pago. No vuelva a enviarlo hasta que nuestro equipo lo revise.'
                : 'PayPal could not confirm the payment status. Do not submit it again until our team reviews it.',
            );
          }
          return 'stopped';
        }
        throw new Error(result?.error ?? 'capture failed');
      }
      // Paid — this order must never be cancelled by a later unmount.
      createdOrderIdRef.current = null;
      clearCaptureRecovery();
      clearUnknownErrorCount(); // fresh slate: their next checkout starts un-escalated
      onSuccessRef.current({ orderId: result.orderId, orderNumber: result.orderNumber });
      return 'paid';
    } catch (err) {
      changeStage('idle');
      handledErrorRef.current = true;
      freshPayPalOrderRef.current = true;
      const serverMsg = err instanceof Error ? err.message : '';
      if (isAvailabilityError(serverMsg)) {
        // Payment captured but the item was won by another buyer first — the
        // server flagged it for a refund. Show that, and re-check stock.
        onAvailabilityIssueRef.current?.();
        setMessage(
          isEsRef.current
            ? 'Uno o más artículos de su pedido fueron comprados por otro cliente justo antes. Nuestro equipo lo contactará para un reembolso completo.'
            : 'Sorry — one or more items in your order were just purchased by another buyer. Our team will contact you to process a full refund.',
        );
      } else {
        setMessage(
          isEsRef.current
            ? 'No pudimos confirmar su pago. Si se le cobró, contáctenos y lo resolveremos.'
            : 'We could not confirm your payment. If you were charged, contact us and we will resolve it.',
        );
      }
      return 'stopped';
    }
  }

  // The functions above read only refs and state setters, so the SDK callbacks
  // (created once per SDK load) reach them through this ref.
  const flowRef = useRef({ canStartPayment, createOrderForPayment, captureAndFinish, showDeclined, changeStage });
  useEffect(() => {
    flowRef.current = { canStartPayment, createOrderForPayment, captureAndFinish, showDeclined, changeStage };
  });

  useEffect(() => {
    const saved = readCaptureRecovery();
    if (!saved || saved.cartKey !== cartKey(getPayloadRef.current())) return;
    setCaptureRecoveryRequired(true);
    setMessage(
      isEsRef.current
        ? 'El estado de este pago requiere confirmación. No vuelva a enviarlo; contáctenos si necesita ayuda.'
        : 'This payment needs confirmation. Do not submit it again; contact us if you need help.',
    );
  }, []);

  useEffect(() => {
    let active = true;
    loadPayPalSdk(clientId, currency)
      .then(() => { if (active) setSdkReady(true); })
      .catch(() => { if (active) setSdkError(true); });
    return () => { active = false; };
  }, [clientId, currency]);

  // The card boxes' callbacks. One shape for the eligibility probe and the real form.
  function cardFieldsConfig(): PayPalCardFieldsConfig {
    return {
      style: CARD_FIELD_STYLE,
      createOrder: () => flowRef.current.createOrderForPayment('card'),
      onApprove: async (data) => {
        const outcome = await flowRef.current.captureAndFinish(data.orderID, 'card');
        // Declined: empty the number / date / code so another card can be typed.
        if (outcome === 'declined') {
          for (const part of cardFieldPartsRef.current.slice(0, 3)) {
            try { part.clear?.(); } catch { /* ignore */ }
          }
        }
      },
      onError: () => onCardError(),
    };
  }

  // A card failure PayPal reports itself (the bank said no while PayPal
  // confirmed the card, a 3-D Secure check that failed, …). If create-order or
  // the capture already explained it, keep that message.
  function onCardError() {
    flowRef.current.changeStage('idle');
    if (handledErrorRef.current) return;
    flowRef.current.showDeclined();
  }

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal) return;
    const paypal = window.paypal;
    const container = containerRef.current;
    let closed = false;

    // Is the card form available to this account? A throwaway instance answers;
    // the real one is created with the boxes (effect below).
    let cardOk = false;
    try {
      cardOk = Boolean(paypal.CardFields?.(cardFieldsConfig()).isEligible());
    } catch {
      cardOk = false;
    }
    setCardEligible(cardOk);

    const baseConfig: Omit<PayPalButtonsConfig, 'fundingSource' | 'style'> = {
      // Validate contact details before opening the PayPal window. The buttons are
      // always visible; if the form isn't filled, reject the click and prompt.
      onClick: (_data, actions) => (flowRef.current.canStartPayment('top') ? actions.resolve() : actions.reject()),
      createOrder: () => flowRef.current.createOrderForPayment('paypal'),
      onApprove: async (data) => {
        // The buyer approved (hit Pay Now) in the PayPal window — capture the
        // payment now so the sale completes here, then the parent shows the
        // order confirmation screen.
        await flowRef.current.captureAndFinish(data.orderID, 'paypal');
      },
      onCancel: () => {
        flowRef.current.changeStage('idle');
        if (captureRecoveryRequiredRef.current) return;
        // Buyer closed / cancelled the PayPal window before approving. Cancel the
        // unpaid order that create-order already wrote so it doesn't linger in the
        // admin as an open sale. Keep the id: an immediate retry reuses this order.
        if (cancelOnAbandonRef.current) cancelAbandonedOrder(createdOrderIdRef.current);
        setMessage(
          isEsRef.current
            ? 'Pago cancelado. Puede intentarlo de nuevo cuando esté listo.'
            : 'Payment canceled. You can try again whenever you are ready.',
        );
      },
      onError: () => {
        flowRef.current.changeStage('idle');
        // createOrder / onApprove already showed a specific reason — don't clobber it.
        if (handledErrorRef.current) {
          handledErrorRef.current = false;
          return;
        }
        // Truly-unknown PayPal failure (e.g. a card declined in PayPal's hosted
        // card form). We can't see the reason, so we re-check stock in parallel
        // (in case that's it) and give card guidance that escalates the second
        // time the buyer is bounced back with no clearer cause.
        freshPayPalOrderRef.current = true;
        onAvailabilityIssueRef.current?.();
        const attempt = bumpUnknownErrorCount();
        setMessage(composeUnknownErrorMessage(attempt, isEsRef.current));
      },
    };

    // One button per way of paying: PayPal (gold), Venmo (phones that have it),
    // and PayPal's own "Debit or Credit Card" button ONLY when our card form is
    // not available — never both.
    const funding = paypal.FUNDING;
    const sources: Array<string | undefined> = funding
      ? [funding.PAYPAL, funding.VENMO, ...(cardOk ? [] : [funding.CARD])].filter(Boolean)
      : [undefined];
    const instances: PayPalButtonsInstance[] = [];
    for (const fundingSource of sources) {
      const button = paypal.Buttons({
        ...baseConfig,
        ...(fundingSource ? { fundingSource } : {}),
        style: fundingSource === funding?.PAYPAL || !fundingSource
          ? { layout: 'vertical', color: 'gold', shape: 'pill', label: 'paypal', height: WALLET_BUTTON_HEIGHT }
          : { layout: 'vertical', shape: 'pill', height: WALLET_BUTTON_HEIGHT },
      } as PayPalButtonsConfig);
      if (fundingSource && button.isEligible && !button.isEligible()) continue;
      const slot = document.createElement('div');
      container.appendChild(slot);
      instances.push(button);
      button.render(slot).catch(() => {
        if (!closed && instances.length === 1) setSdkError(true);
      });
    }

    return () => {
      closed = true;
      for (const button of instances) {
        try {
          button.close?.();
        } catch {
          /* ignore */
        }
      }
      container.innerHTML = '';
    };
    // cardFieldsConfig reads only refs; the SDK instance is created once per load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  // The card boxes: PayPal draws each one as a secure iframe in our layout.
  useEffect(() => {
    if (!cardEligible || !window.paypal?.CardFields) return;
    const slots = [cardNumberRef.current, cardExpiryRef.current, cardCvvRef.current, cardNameRef.current];
    if (slots.some((slot) => !slot)) return;
    let cardFields: PayPalCardFieldsInstance;
    try {
      cardFields = window.paypal.CardFields(cardFieldsConfig());
      if (!cardFields.isEligible()) return;
    } catch {
      return;
    }
    const es = isEsRef.current;
    const parts = [
      cardFields.NumberField({ placeholder: es ? 'Número de tarjeta' : 'Card number' }),
      cardFields.ExpiryField({ placeholder: es ? 'MM / AA' : 'MM / YY' }),
      cardFields.CVVField({ placeholder: 'CVV' }),
      cardFields.NameField({ placeholder: es ? 'Nombre en la tarjeta' : 'Name on card' }),
    ];
    cardFieldsRef.current = cardFields;
    cardFieldPartsRef.current = parts;
    parts.forEach((part, index) => {
      part.render(slots[index] as HTMLElement).catch(() => setCardEligible(false));
    });
    return () => {
      cardFieldsRef.current = null;
      cardFieldPartsRef.current = [];
      for (const part of parts) {
        try { void part.close?.(); } catch { /* ignore */ }
      }
      for (const slot of slots) if (slot) slot.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardEligible]);

  // Apple Pay: Safari on a device with Apple Pay set up, and PayPal says yes.
  useEffect(() => {
    if (!sdkReady || !window.paypal?.Applepay || !window.ApplePaySession) return;
    try {
      if (!window.ApplePaySession.canMakePayments()) return;
    } catch {
      return;
    }
    let active = true;
    window.paypal.Applepay().config()
      .then((config) => { if (active && config.isEligible) setApplePayConfig(config); })
      .catch(() => {});
    return () => { active = false; };
  }, [sdkReady]);

  // Google Pay: Google's own button, drawn once PayPal and Google both say yes.
  useEffect(() => {
    if (!sdkReady || !window.paypal?.Googlepay) return;
    const paypal = window.paypal;
    const slot = googlePayContainerRef.current;
    let active = true;
    (async () => {
      await loadGooglePayJs();
      const PaymentsClient = window.google?.payments?.api?.PaymentsClient;
      if (!active || !PaymentsClient || !paypal.Googlepay || !slot) return;
      const googlepay = paypal.Googlepay();
      const config = await googlepay.config();
      if (!active || !config.isEligible) return;
      const client = new PaymentsClient({
        environment: 'PRODUCTION',
        paymentDataCallbacks: {
          onPaymentAuthorized: (paymentData: { paymentMethodData: unknown }) => onGooglePayAuthorized(paymentData),
        },
      });
      const readiness = await client.isReadyToPay({
        apiVersion: config.apiVersion,
        apiVersionMinor: config.apiVersionMinor,
        allowedPaymentMethods: config.allowedPaymentMethods,
      });
      if (!active || !readiness.result) return;
      googlePayRef.current = { client, config, googlepay };
      const button = client.createButton({
        onClick: () => startGooglePay(),
        allowedPaymentMethods: config.allowedPaymentMethods,
        buttonColor: 'black',
        buttonType: 'buy',
        buttonSizeMode: 'fill',
        buttonRadius: Math.round(WALLET_BUTTON_HEIGHT / 2),
        buttonLocale: isEsRef.current ? 'es' : 'en',
      });
      slot.replaceChildren(button);
      setGooglePayReady(true);
    })().catch(() => { /* Google Pay simply stays hidden */ });
    return () => {
      active = false;
      googlePayRef.current = null;
      if (slot) slot.innerHTML = '';
      setGooglePayReady(false);
    };
    // onGooglePayAuthorized / startGooglePay read only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  function walletAmount(): string | null {
    const value = amountRef.current;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value.toFixed(2) : null;
  }

  function startApplePay() {
    if (paymentStageRef.current !== 'idle') return;
    const ApplePaySession = window.ApplePaySession;
    const total = walletAmount();
    if (!applePayConfig || !total || !ApplePaySession || !window.paypal?.Applepay) return;
    if (!flowRef.current.canStartPayment('top')) return;
    const applepay = window.paypal.Applepay();
    let session;
    try {
      // Created synchronously inside the tap — Safari refuses a sheet opened later.
      session = new ApplePaySession(4, {
        countryCode: applePayConfig.countryCode,
        currencyCode: currency,
        merchantCapabilities: applePayConfig.merchantCapabilities,
        supportedNetworks: applePayConfig.supportedNetworks,
        requiredBillingContactFields: ['postalAddress'],
        total: { label: STORE_NAME, type: 'final', amount: total },
      });
    } catch {
      setMessage(isEsRef.current
        ? 'Apple Pay no está disponible ahora. Pague con PayPal o con tarjeta.'
        : 'Apple Pay is not available right now. Please pay with PayPal or by card.');
      return;
    }
    let authorized = false;
    session.onvalidatemerchant = (event) => {
      applepay.validateMerchant({ validationUrl: event.validationURL, displayName: STORE_NAME })
        .then((result) => session.completeMerchantValidation(result.merchantSession))
        .catch(() => {
          session.abort();
          setMessage(isEsRef.current
            ? 'Apple Pay no está disponible ahora. Pague con PayPal o con tarjeta.'
            : 'Apple Pay is not available right now. Please pay with PayPal or by card.');
        });
    };
    session.onpaymentauthorized = (event) => {
      authorized = true;
      void (async () => {
        let orderId: string;
        try {
          orderId = await flowRef.current.createOrderForPayment('apple_pay');
        } catch {
          // The reason (sold out, price changed, …) is already on the page.
          session.completePayment(ApplePaySession.STATUS_FAILURE);
          return;
        }
        try {
          await applepay.confirmOrder({ orderId, token: event.payment.token, billingContact: event.payment.billingContact });
        } catch {
          session.completePayment(ApplePaySession.STATUS_FAILURE);
          flowRef.current.showDeclined();
          return;
        }
        session.completePayment(ApplePaySession.STATUS_SUCCESS);
        await flowRef.current.captureAndFinish(orderId, 'apple_pay');
      })();
    };
    session.oncancel = () => {
      if (!authorized) flowRef.current.changeStage('idle');
    };
    session.begin();
  }

  function startGooglePay() {
    if (paymentStageRef.current !== 'idle') return;
    const google = googlePayRef.current;
    const total = walletAmount();
    if (!google || !total) return;
    if (!flowRef.current.canStartPayment('top')) return;
    pendingGooglePayRef.current = null;
    google.client.loadPaymentData({
      apiVersion: google.config.apiVersion,
      apiVersionMinor: google.config.apiVersionMinor,
      allowedPaymentMethods: google.config.allowedPaymentMethods,
      merchantInfo: google.config.merchantInfo,
      transactionInfo: {
        countryCode: google.config.countryCode ?? 'US',
        currencyCode: currency,
        totalPriceStatus: 'FINAL',
        totalPrice: total,
        totalPriceLabel: isEsRef.current ? 'Total' : 'Total',
      },
      callbackIntents: ['PAYMENT_AUTHORIZATION'],
    })
      .then(async () => {
        // The sheet closed on SUCCESS: finish here (the bank's own check first, if it asked for one).
        const pending = pendingGooglePayRef.current;
        pendingGooglePayRef.current = null;
        if (!pending) return;
        if (pending.needsPayerAction) {
          try {
            await google.googlepay.initiatePayerAction({ orderId: pending.orderId });
          } catch {
            flowRef.current.showDeclined();
            return;
          }
        }
        await flowRef.current.captureAndFinish(pending.orderId, 'google_pay');
      })
      .catch(() => {
        // Closed the sheet, or Google could not open it: nothing was charged.
        if (paymentStageRef.current !== 'idle' && !pendingGooglePayRef.current) flowRef.current.changeStage('idle');
      });
  }

  async function onGooglePayAuthorized(paymentData: { paymentMethodData: unknown }): Promise<GooglePaymentAuthorizationResult> {
    const google = googlePayRef.current;
    const es = isEsRef.current;
    if (!google) {
      return { transactionState: 'ERROR', error: { intent: 'PAYMENT_AUTHORIZATION', reason: 'OTHER_ERROR', message: es ? 'Intente de nuevo.' : 'Please try again.' } };
    }
    let orderId: string;
    try {
      orderId = await flowRef.current.createOrderForPayment('google_pay');
    } catch {
      return {
        transactionState: 'ERROR',
        error: { intent: 'PAYMENT_AUTHORIZATION', reason: 'OTHER_ERROR', message: es ? 'No se pudo iniciar el pago. Vea el mensaje en la página.' : 'We could not start this payment. See the message on the page.' },
      };
    }
    try {
      const result = await google.googlepay.confirmOrder({ orderId, paymentMethodData: paymentData.paymentMethodData });
      if (result?.status === 'APPROVED' || result?.status === 'PAYER_ACTION_REQUIRED') {
        pendingGooglePayRef.current = { orderId, needsPayerAction: result.status === 'PAYER_ACTION_REQUIRED' };
        return { transactionState: 'SUCCESS' };
      }
    } catch {
      /* fall through to the decline below */
    }
    flowRef.current.showDeclined();
    return {
      transactionState: 'ERROR',
      error: { intent: 'PAYMENT_AUTHORIZATION', reason: 'PAYMENT_DATA_INVALID', message: es ? 'Pago rechazado. No se le ha cobrado.' : 'Payment declined. You have not been charged.' },
    };
  }

  // The card's billing address: the shipping address when the box is ticked,
  // the boxes the buyer typed when it is not, or just the ZIP for local pickup.
  function cardBillingAddress(): { value: PayPalBillingAddress } | { error: string } {
    const payload = getPayloadRef.current();
    return buildCardBillingAddress({
      shippingMethod: payload.shippingMethod,
      customer: payload.customer,
      billingSame,
      billing,
      isEs: isEsRef.current,
    });
  }

  async function payByCard() {
    if (paymentStageRef.current !== 'idle') return;
    const cardFields = cardFieldsRef.current;
    if (!cardFields) return;
    if (!canStartPayment('card')) return;
    try {
      const problem = cardFieldsProblem(await cardFields.getState(), isEsRef.current);
      if (problem) {
        setCardError(problem);
        return;
      }
    } catch {
      /* PayPal validates again on submit */
    }
    const billingAddress = cardBillingAddress();
    if ('error' in billingAddress) {
      setCardError(billingAddress.error);
      return;
    }
    changeStage('processing');
    setActiveMethod('card');
    try {
      await cardFields.submit({ billingAddress: billingAddress.value });
    } catch {
      onCardError();
    }
  }

  if (sdkError) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-error)' }}>
        {isEs
          ? 'No se pudo cargar PayPal. Actualice la página o intente más tarde.'
          : 'PayPal could not load. Please refresh the page or try again later.'}
      </p>
    );
  }

  // Compose the reminder shown when the buyer tries to pay before they're ready —
  // leads with the confirmation checkbox (the most-missed step) and lists any empty
  // form fields.
  function reminderMessage(hint: { fields: string[]; needsConfirm: boolean }): string {
    const parts: string[] = [];
    if (hint.needsConfirm) {
      parts.push(isEs
        ? 'marque la casilla de arriba para confirmar que su información es correcta'
        : 'check the box above to confirm your information is correct');
    }
    if (hint.fields.length > 0) {
      parts.push(isEs
        ? `complete: ${hint.fields.join(', ')}`
        : `complete: ${hint.fields.join(', ')}`);
    }
    if (parts.length === 0) {
      return isEs ? 'Complete los datos requeridos para pagar.' : 'Complete the required details to pay.';
    }
    const joined = parts.join(isEs ? '; y ' : '; and ');
    return isEs ? `Antes de pagar, ${joined}.` : `Before you can pay, please ${joined}.`;
  }

  const blocked = sdkReady && (!ready || captureRecoveryRequired);
  const busy = paymentStage !== 'idle';
  const showWallets = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  const pickup = isPickupMethod(getPayload().shippingMethod);
  const reminder = (at: 'top' | 'card') => missingHint && missingHint.at === at && !ready && (
    <div
      role="alert"
      className="mb-2 flex items-start gap-2 text-sm"
      style={{
        padding: '0.6rem 0.75rem',
        border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)',
        background: 'color-mix(in srgb, var(--color-error) 9%, transparent)',
        borderRadius: 'var(--radius-lg)',
        color: 'var(--color-error)',
        fontWeight: 600,
      }}
    >
      <AppIcon name="error"  aria-hidden="true" style={{ fontSize: '1.15rem', lineHeight: 1.25, flexShrink: 0 }} />
      <span>{reminderMessage(missingHint)}</span>
    </div>
  );
  const messageLine = message && (
    <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>
      {message}
    </p>
  );

  return (
    <div>
      {reminder('top')}
      <div style={{ position: 'relative' }}>
        <div
          aria-busy={busy}
          style={{
            opacity: blocked ? 0.5 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          {/* Apple Pay (Safari) — drawn by Safari itself from the CSS in globals.css. */}
          {applePayConfig && showWallets && (
            <button
              type="button"
              className="apple-pay-button"
              lang={isEs ? 'es' : 'en'}
              aria-label={isEs ? 'Comprar con Apple Pay' : 'Buy with Apple Pay'}
              disabled={busy}
              onClick={startApplePay}
              style={{ height: WALLET_BUTTON_HEIGHT, marginBottom: 10 }}
            />
          )}
          {/* Google Pay (Chrome / Android) — Google's own button. */}
          <div
            ref={googlePayContainerRef}
            style={{
              display: googlePayReady && showWallets ? 'block' : 'none',
              height: WALLET_BUTTON_HEIGHT,
              marginBottom: 10,
            }}
          />
          {/* PayPal, Venmo (and the card button only when the card form is unavailable). */}
          <div ref={containerRef} className="paypal-button-stack" />
        </div>
        {/* Until the buyer is ready, an invisible overlay swallows the click so
            the PayPal flow never starts (no popup flash / jolt) — it just shows
            the reminder. Removed once ready, so real clicks reach the button. */}
        {blocked && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={captureRecoveryRequired
              ? (isEs ? 'El pago ya fue capturado' : 'Payment already captured')
              : (isEs ? 'Complete los datos requeridos para pagar' : 'Complete the required details before paying')}
            onClick={() => {
              if (captureRecoveryRequired) {
                const saved = readCaptureRecovery();
                if (saved && saved.cartKey !== cartKey(getPayloadRef.current())) {
                  clearCaptureRecovery();
                  captureRecoveryRequiredRef.current = false;
                  setCaptureRecoveryRequired(false);
                  setMessage(null);
                  return;
                }
                setMessage(
                  isEs
                    ? 'PayPal ya capturó este pago. No lo envíe otra vez.'
                    : 'PayPal already captured this payment. Do not submit it again.',
                );
                return;
              }
              setMissingHint({ fields: missingFields, needsConfirm: needsInfoConfirmation, at: 'top' });
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'not-allowed',
              zIndex: 5,
            }}
          />
        )}
      </div>
      {!sdkReady && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Cargando PayPal…' : 'Loading PayPal…'}
        </p>
      )}
      {sdkReady && !ready && !captureRecoveryRequired && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs
            ? 'Complete los datos requeridos para continuar al pago.'
            : 'Complete the required details to continue to payment.'}
        </p>
      )}
      {paymentStage === 'awaiting-approval' && activeMethod === 'paypal' && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs
            ? 'Complete sus datos de pago en la ventana segura de PayPal. Su pago no se procesará hasta que los revise y los envíe. Para cancelar, cierre la ventana de PayPal con la × en la esquina.'
            : 'Complete your payment details in the secure PayPal window. Your payment will not be processed until you review and submit them. To cancel, close the PayPal window using the × in the corner.'}
        </p>
      )}
      {paymentStage === 'processing' && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs
            ? 'Procesando su pago… Mantenga esta página abierta.'
            : 'Processing your payment… Please keep this page open.'}
        </p>
      )}
      {cardEligible ? (
        <div className="paypal-card-form">
          <div className="paypal-card-form__or">
            <span>{isEs ? 'o pague con tarjeta' : 'or pay by card'}</span>
          </div>
          <span className="form-label">{isEs ? 'Número de tarjeta' : 'Card number'}</span>
          <div ref={cardNumberRef} className="paypal-card-form__field" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="form-label">{isEs ? 'Vencimiento' : 'Expiration'}</span>
              <div ref={cardExpiryRef} className="paypal-card-form__field" />
            </div>
            <div>
              <span className="form-label">{isEs ? 'Código de seguridad' : 'Security code'}</span>
              <div ref={cardCvvRef} className="paypal-card-form__field" />
            </div>
          </div>
          <span className="form-label">{isEs ? 'Nombre en la tarjeta' : 'Name on card'}</span>
          <div ref={cardNameRef} className="paypal-card-form__field" />
          <CardBillingInputs
            idPrefix="card-billing"
            pickup={pickup}
            billingSame={billingSame}
            onBillingSameChange={setBillingSame}
            billing={billing}
            onBillingChange={setBilling}
            isEs={isEs}
          />
          {cardError && (
            <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>{cardError}</p>
          )}
          {messageLine}
          <div className="mt-3">{reminder('card')}</div>
          <button
            type="button"
            className="gold-button w-full justify-center"
            disabled={busy}
            onClick={() => { void payByCard(); }}
            style={{ minHeight: WALLET_BUTTON_HEIGHT, opacity: blocked || busy ? 0.6 : 1 }}
          >
            {busy && activeMethod === 'card'
              ? (isEs ? 'Procesando…' : 'Processing…')
              : typeof amount === 'number' && amount > 0
                ? `${isEs ? 'Pagar' : 'Pay'} ${formatCheckoutCurrency(amount)}`
                : (isEs ? 'Pagar con tarjeta' : 'Pay by card')}
          </button>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs
              ? 'Los pagos con tarjeta los procesa PayPal de forma segura: los datos de su tarjeta van directo a PayPal y nunca pasan por nuestro servidor. Si su banco le pide confirmar la compra, esa verificación aparece aquí mismo.'
              : 'Card payments are processed securely by PayPal — your card details go straight to PayPal and never touch our server. If your bank asks you to confirm the purchase, that check appears right here.'}
          </p>
        </div>
      ) : messageLine}
    </div>
  );
}
