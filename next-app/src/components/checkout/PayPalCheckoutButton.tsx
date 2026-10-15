'use client';

import { useEffect, useRef, useState } from 'react';
import { checkoutErrorMessageForCode, composeUnknownErrorMessage, isAvailabilityError } from '@/lib/checkout-error-messages';
import type { OrderQuote } from '@/lib/checkout-pricing';
import { AppIcon } from '@/components/AppIcon';

type PayPalButtonsActions = { resolve: () => Promise<void>; reject: () => Promise<void> };
type PayPalButtonsConfig = {
  style?: Record<string, unknown>;
  onClick?: (data: Record<string, unknown>, actions: PayPalButtonsActions) => Promise<void> | void;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
};

type PayPalNamespace = {
  Buttons: (config: PayPalButtonsConfig) => {
    render: (container: HTMLElement) => Promise<void>;
    close?: () => void;
  };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

const sdkPromises: Record<string, Promise<void> | undefined> = {};

function loadPayPalSdk(clientId: string, currency: string): Promise<void> {
  const key = `${clientId}:${currency}`;
  if (typeof window !== 'undefined' && window.paypal) return Promise.resolve();
  const existing = sdkPromises[key];
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      'client-id': clientId,
      currency,
      intent: 'capture',
      components: 'buttons',
      'disable-funding': 'paylater,credit',
    });
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      delete sdkPromises[key];
      reject(new Error('Failed to load PayPal SDK'));
    };
    document.body.appendChild(script);
  });
  sdkPromises[key] = promise;
  return promise;
}

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
};

// Count of consecutive *unknown* PayPal errors (the SDK's onError with no reason
// we can pin down — e.g. a card declined in PayPal's hosted card form). Kept in
// sessionStorage so "they were sent back a second time" is detected even if the
// card flow did a full-page redirect back to us. Cleared on a completed payment.
const UNKNOWN_ERROR_COUNT_KEY = 'nej-checkout-unknown-errors';
const CAPTURE_RECOVERY_KEY = 'nej-checkout-capture-recovery';
const CAPTURE_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;

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
  ready,
  isEs,
  missingFields,
  needsInfoConfirmation,
  getPayload,
  onOrderId,
  onSuccess,
  onAvailabilityIssue,
  onPriceChange,
}: {
  clientId: string;
  currency?: string;
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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('idle');
  const [captureRecoveryRequired, setCaptureRecoveryRequired] = useState(false);
  // Inline red reminder shown when the buyer clicks pay before completing the
  // required fields / confirmation checkbox (replaces the old full-screen modal).
  const [missingHint, setMissingHint] = useState<{ fields: string[]; needsConfirm: boolean } | null>(null);

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
  const missingFieldsRef = useRef(missingFields);
  const needsInfoConfirmationRef = useRef(needsInfoConfirmation);
  const onAvailabilityIssueRef = useRef(onAvailabilityIssue);
  const captureRecoveryRequiredRef = useRef(captureRecoveryRequired);
  // Set when createOrder/onApprove already showed a specific message, so the
  // PayPal SDK's follow-up onError doesn't clobber it with the generic one.
  const handledErrorRef = useRef(false);
  useEffect(() => {
    getPayloadRef.current = getPayload;
    onOrderIdRef.current = onOrderId;
    onSuccessRef.current = onSuccess;
    isEsRef.current = isEs;
    readyRef.current = ready;
    missingFieldsRef.current = missingFields;
    needsInfoConfirmationRef.current = needsInfoConfirmation;
    onAvailabilityIssueRef.current = onAvailabilityIssue;
    onPriceChangeRef.current = onPriceChange;
    captureRecoveryRequiredRef.current = captureRecoveryRequired;
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

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal) return;
    const container = containerRef.current;
    let closed = false;

    const buttons = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'paypal' },
      // Validate contact details before opening the PayPal window. The buttons are
      // always visible; if the form isn't filled, reject the click and prompt.
      onClick: (_data, actions) => {
        if (captureRecoveryRequiredRef.current) {
          const saved = readCaptureRecovery();
          if (saved && saved.cartKey !== cartKey(getPayloadRef.current())) {
            clearCaptureRecovery();
            captureRecoveryRequiredRef.current = false;
            setCaptureRecoveryRequired(false);
            setMessage(null);
            return actions.resolve();
          }
          setMessage(
            isEsRef.current
              ? 'PayPal ya capturó este pago y la actualización del pedido sigue pendiente. No envíe el pago otra vez; contáctenos si necesita ayuda.'
              : 'PayPal already captured this payment and the order update is still pending. Do not submit payment again; contact us if you need help.',
          );
          setMissingHint(null);
          return actions.reject();
        }
        if (!readyRef.current) {
          setMissingHint({ fields: missingFieldsRef.current, needsConfirm: needsInfoConfirmationRef.current });
          return actions.reject();
        }
        setMissingHint(null);
        setMessage(null);
        handledErrorRef.current = false;
        return actions.resolve();
      },
      createOrder: async () => {
        setMessage(null);
        handledErrorRef.current = false;
        setPaymentStage('awaiting-approval');
        try {
          const res = await fetch('/api/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getPayloadRef.current()),
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
          if (data.orderId) {
            createdOrderIdRef.current = data.orderId as string;
            onOrderIdRef.current(data.orderId);
          }
          return data.paypalOrderId as string;
        } catch (err) {
          setPaymentStage('idle');
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
      },
      onApprove: async (data) => {
        // The buyer approved (hit Pay Now) in the PayPal window — capture the
        // payment now so the sale completes here, then the parent shows the
        // order confirmation screen.
        setPaymentStage('processing');
        try {
          const res = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paypalOrderId: data.orderID }),
          });
          const result = await res.json().catch(() => null);
          if (!res.ok || !result?.success) {
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
              setPaymentStage('idle');
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
              return;
            }
            throw new Error(result?.error ?? 'capture failed');
          }
          // Paid — this order must never be cancelled by a later unmount.
          createdOrderIdRef.current = null;
          clearCaptureRecovery();
          clearUnknownErrorCount(); // fresh slate: their next checkout starts un-escalated
          onSuccessRef.current({ orderId: result.orderId, orderNumber: result.orderNumber });
        } catch (err) {
          setPaymentStage('idle');
          handledErrorRef.current = true;
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
        }
      },
      onCancel: () => {
        setPaymentStage('idle');
        if (captureRecoveryRequiredRef.current) return;
        // Buyer closed / cancelled the PayPal window before approving. Cancel the
        // unpaid order that create-order already wrote so it doesn't linger in the
        // admin as an open sale. Keep the id: an immediate retry reuses this order.
        cancelAbandonedOrder(createdOrderIdRef.current);
        setMessage(
          isEsRef.current
            ? 'Pago cancelado. Puede intentarlo de nuevo cuando esté listo.'
            : 'Payment canceled. You can try again whenever you are ready.',
        );
      },
      onError: () => {
        setPaymentStage('idle');
        // createOrder / onApprove already showed a specific reason — don't clobber it.
        if (handledErrorRef.current) {
          handledErrorRef.current = false;
          return;
        }
        // Truly-unknown PayPal failure (e.g. a card declined in PayPal's hosted
        // card form). We can't see the reason, so we re-check stock in parallel
        // (in case that's it) and give card guidance that escalates the second
        // time the buyer is bounced back with no clearer cause.
        onAvailabilityIssueRef.current?.();
        const attempt = bumpUnknownErrorCount();
        setMessage(composeUnknownErrorMessage(attempt, isEsRef.current));
      },
    });

    buttons.render(container).catch(() => {
      if (!closed) setSdkError(true);
    });

    return () => {
      closed = true;
      try {
        buttons.close?.();
      } catch {
        /* ignore */
      }
      container.innerHTML = '';
    };
  }, [sdkReady]);

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

  return (
    <div>
      {missingHint && !ready && (
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
      )}
      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          aria-busy={paymentStage !== 'idle'}
          style={{
            opacity: sdkReady && (!ready || captureRecoveryRequired) ? 0.5 : 1,
            transition: 'opacity 150ms ease',
          }}
        />
        {/* Until the buyer is ready, an invisible overlay swallows the click so
            the PayPal flow never starts (no popup flash / jolt) — it just shows
            the reminder. Removed once ready, so real clicks reach the button. */}
        {sdkReady && (!ready || captureRecoveryRequired) && (
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
              setMissingHint({ fields: missingFields, needsConfirm: needsInfoConfirmation });
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
      {paymentStage === 'awaiting-approval' && (
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
      {message && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
