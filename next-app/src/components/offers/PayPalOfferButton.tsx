'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import CardBillingInputs from '@/components/checkout/CardBillingInputs';
import {
  CARD_FIELD_STYLE,
  type PayPalButtonsConfig,
  type PayPalButtonsInstance,
  type PayPalCardField,
  type PayPalCardFieldsConfig,
  type PayPalCardFieldsInstance,
} from '@/components/checkout/paypal-sdk';
import { buildCardBillingAddress, cardFieldsProblem, EMPTY_BILLING_FORM, isPickupMethod, type BillingForm } from '@/lib/card-billing';
import { formatCheckoutCurrency } from '@/lib/checkout-pricing';
import { OFFER_WINDOW_HOURS, offerDeclinedMessage } from '@/lib/offers';

/**
 * The pay box for a site OFFER (lib/offers.ts). Unlike the checkout's
 * PayPalCheckoutButton, the buyer's approval only HOLDS the money: the SDK is
 * loaded with intent=authorize, /api/offers creates the AUTHORIZE order and
 * /api/offers/authorize turns the approval into the hold. Nothing is charged
 * until the owner accepts.
 *
 * Since 2026-10-29 (owner's mockup) it matches the checkout pay box: the gold
 * PayPal button, then card boxes on our page with a gold "Send offer · Hold $…"
 * button. PayPal's own card button shows ONLY when the card boxes are not
 * available. No Venmo, Apple Pay or Google Pay on offers: PayPal does not
 * document a hold for them (wallets wait for one real test — `TASKS.md`).
 *
 * ⚠️ Its own SDK copy under a separate namespace (`window.paypalOffer`). The
 * checkout's loader reuses `window.paypal` when it exists, and an SDK loaded
 * with intent=authorize there would turn a later checkout into a hold.
 */

type PayPalOfferNamespace = {
  Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance;
  CardFields?: (config: PayPalCardFieldsConfig) => PayPalCardFieldsInstance;
  FUNDING?: Record<string, string>;
};

declare global {
  interface Window {
    paypalOffer?: PayPalOfferNamespace;
  }
}

/** Same height as the checkout's buttons so the two pay boxes read alike. */
const BUTTON_HEIGHT = 45;

let sdkPromise: Promise<void> | null = null;

function loadOfferSdk(clientId: string): Promise<void> {
  if (typeof window !== 'undefined' && window.paypalOffer) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      'client-id': clientId,
      currency: 'USD',
      intent: 'authorize',
      // card-fields = the card boxes (Advanced Checkout, 2026-10-28); a card can be held.
      components: 'buttons,card-fields',
      // No Pay Later; no Venmo on offers (owner, 2026-10-29).
      'disable-funding': 'paylater,credit,venmo',
    });
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.setAttribute('data-namespace', 'paypalOffer');
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Failed to load PayPal SDK'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

export type OfferPayload = {
  productId: string;
  amount: number;
  shippingMethod: string;
  customer: Record<string, unknown>;
  message: string;
  locale: string;
};

export type OfferHeld = { total: number; amount: number; deadline: string };

type HoldMethod = 'paypal' | 'card';
type HoldOutcome = 'held' | 'declined' | 'failed';

export default function PayPalOfferButton({
  clientId,
  amount = null,
  ready,
  isEs,
  missingFields,
  getPayload,
  onHeld,
}: {
  clientId: string;
  /** The total that will be held — named on the card button. */
  amount?: number | null;
  ready: boolean;
  isEs: boolean;
  /** What still has to be filled in / ticked, in form order. */
  missingFields: string[];
  getPayload: () => OfferPayload;
  onHeld: (result: OfferHeld) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardNumberRef = useRef<HTMLDivElement>(null);
  const cardExpiryRef = useRef<HTMLDivElement>(null);
  const cardCvvRef = useRef<HTMLDivElement>(null);
  const cardNameRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [stage, setStage] = useState<'idle' | 'approving' | 'holding'>('idle');
  const [activeMethod, setActiveMethod] = useState<HoldMethod>('paypal');
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<{ fields: string[]; at: 'top' | 'card' } | null>(null);
  const [cardEligible, setCardEligible] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<BillingForm>(EMPTY_BILLING_FORM);

  const readyRef = useRef(ready);
  const missingRef = useRef(missingFields);
  const getPayloadRef = useRef(getPayload);
  const onHeldRef = useRef(onHeld);
  const isEsRef = useRef(isEs);
  const stageRef = useRef(stage);
  const handledRef = useRef(false);
  const cardFieldsRef = useRef<PayPalCardFieldsInstance | null>(null);
  const cardFieldPartsRef = useRef<PayPalCardField[]>([]);
  useEffect(() => {
    readyRef.current = ready;
    missingRef.current = missingFields;
    getPayloadRef.current = getPayload;
    onHeldRef.current = onHeld;
    isEsRef.current = isEs;
    stageRef.current = stage;
  });

  function changeStage(next: 'idle' | 'approving' | 'holding') {
    stageRef.current = next;
    setStage(next);
  }

  function canStart(at: 'top' | 'card'): boolean {
    if (!readyRef.current) {
      setHint({ fields: missingRef.current, at });
      return false;
    }
    setHint(null);
    setMessage(null);
    setCardError(null);
    handledRef.current = false;
    return true;
  }

  // Opens the offer (a pending row + a PayPal AUTHORIZE order). Every try is a
  // new offer with a new PayPal order, so a declined card never comes back cached.
  async function createOffer(method: HoldMethod): Promise<string> {
    setActiveMethod(method);
    changeStage(method === 'paypal' ? 'approving' : 'holding');
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getPayloadRef.current()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.paypalOrderId) throw new Error(data?.error ?? 'offer failed');
      return data.paypalOrderId as string;
    } catch (err) {
      changeStage('idle');
      handledRef.current = true;
      setMessage(err instanceof Error && err.message !== 'offer failed'
        ? err.message
        : (isEsRef.current ? 'No se pudo iniciar la oferta. Intente de nuevo.' : 'Could not start the offer. Please try again.'));
      throw err;
    }
  }

  // The buyer approved: turn it into the hold and open the offer for the owner.
  async function hold(paypalOrderId: string, method: HoldMethod): Promise<HoldOutcome> {
    changeStage('holding');
    try {
      const res = await fetch('/api/offers/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalOrderId, paymentMethod: method }),
      });
      const result = await res.json().catch(() => null);
      if (result?.code === 'card_declined') {
        changeStage('idle');
        handledRef.current = true;
        setMessage(offerDeclinedMessage(isEsRef.current));
        return 'declined';
      }
      if (!res.ok || !result?.success) throw new Error(result?.error ?? 'hold failed');
      onHeldRef.current({ total: Number(result.total), amount: Number(result.amount), deadline: String(result.deadline ?? '') });
      return 'held';
    } catch (err) {
      changeStage('idle');
      handledRef.current = true;
      setMessage(err instanceof Error && err.message !== 'hold failed'
        ? err.message
        : (isEsRef.current
            ? 'No pudimos confirmar la retención de PayPal. Si ve un cargo pendiente, llámenos al (239) 404-8505.'
            : 'We could not confirm the PayPal hold. If you see a pending charge, call (239) 404-8505.'));
      return 'failed';
    }
  }

  // A card PayPal refused itself (the bank said no, a failed 3-D Secure, …).
  // If our server already explained it, keep that message.
  function onCardError() {
    changeStage('idle');
    if (handledRef.current) return;
    handledRef.current = true;
    setMessage(offerDeclinedMessage(isEsRef.current));
  }

  // The SDK callbacks are created once per load; they reach the latest functions here.
  const flowRef = useRef({ canStart, createOffer, hold, onCardError, changeStage });
  useEffect(() => {
    flowRef.current = { canStart, createOffer, hold, onCardError, changeStage };
  });

  function cardFieldsConfig(): PayPalCardFieldsConfig {
    return {
      style: CARD_FIELD_STYLE,
      createOrder: () => flowRef.current.createOffer('card'),
      onApprove: async (data) => {
        const outcome = await flowRef.current.hold(data.orderID, 'card');
        // Declined: empty the number / date / code so another card can be typed.
        if (outcome === 'declined') {
          for (const part of cardFieldPartsRef.current.slice(0, 3)) {
            try { part.clear?.(); } catch { /* ignore */ }
          }
        }
      },
      onError: () => flowRef.current.onCardError(),
    };
  }

  useEffect(() => {
    let active = true;
    loadOfferSdk(clientId)
      .then(() => { if (active) setSdkReady(true); })
      .catch(() => { if (active) setSdkError(true); });
    return () => { active = false; };
  }, [clientId]);

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypalOffer) return;
    const container = containerRef.current;
    let closed = false;

    // Can this account hold a card in our own boxes? A throwaway instance answers.
    let cardOk = false;
    try {
      cardOk = Boolean(window.paypalOffer.CardFields?.(cardFieldsConfig()).isEligible());
    } catch {
      cardOk = false;
    }
    setCardEligible(cardOk);

    const funding = window.paypalOffer.FUNDING;
    const sources: Array<string | undefined> = funding
      ? [funding.PAYPAL, ...(cardOk ? [] : [funding.CARD])].filter(Boolean)
      : [undefined];
    const instances: PayPalButtonsInstance[] = [];
    for (const fundingSource of sources) {
      const button = window.paypalOffer.Buttons({
        ...(fundingSource ? { fundingSource } : {}),
        style: fundingSource === funding?.PAYPAL || !fundingSource
          ? { layout: 'vertical', color: 'gold', shape: 'pill', label: 'paypal', height: BUTTON_HEIGHT }
          : { layout: 'vertical', shape: 'pill', height: BUTTON_HEIGHT },
        onClick: (_data, actions) => (flowRef.current.canStart('top') ? actions.resolve() : actions.reject()),
        createOrder: () => flowRef.current.createOffer('paypal'),
        onApprove: async (data) => { await flowRef.current.hold(data.orderID, 'paypal'); },
        onCancel: () => {
          flowRef.current.changeStage('idle');
          setMessage(isEsRef.current
            ? 'Oferta cancelada. No se retuvo nada. Puede intentarlo de nuevo.'
            : 'Offer cancelled. Nothing was held. You can try again.');
        },
        onError: () => {
          flowRef.current.changeStage('idle');
          if (handledRef.current) {
            handledRef.current = false;
            return;
          }
          setMessage(isEsRef.current
            ? 'PayPal no completó la oferta. Si usó una tarjeta, revise los datos e intente de nuevo, o llámenos al (239) 404-8505.'
            : 'PayPal did not complete the offer. If you used a card, check its details and try again, or call (239) 404-8505.');
        },
      });
      if (fundingSource && button.isEligible && !button.isEligible()) continue;
      const slot = document.createElement('div');
      container.appendChild(slot);
      instances.push(button);
      button.render(slot).catch(() => { if (!closed && instances.length === 1) setSdkError(true); });
    }
    return () => {
      closed = true;
      for (const button of instances) {
        try { button.close?.(); } catch { /* ignore */ }
      }
      container.innerHTML = '';
    };
    // cardFieldsConfig reads only refs; the SDK instance is created once per load.
  }, [sdkReady]);

  // The card boxes: PayPal draws each one as a secure iframe in our layout.
  useEffect(() => {
    if (!cardEligible || !window.paypalOffer?.CardFields) return;
    const slots = [cardNumberRef.current, cardExpiryRef.current, cardCvvRef.current, cardNameRef.current];
    if (slots.some((slot) => !slot)) return;
    let cardFields: PayPalCardFieldsInstance;
    try {
      cardFields = window.paypalOffer.CardFields(cardFieldsConfig());
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
  }, [cardEligible]);

  async function holdByCard() {
    if (stageRef.current !== 'idle') return;
    const cardFields = cardFieldsRef.current;
    if (!cardFields) return;
    if (!canStart('card')) return;
    try {
      const problem = cardFieldsProblem(await cardFields.getState(), isEs);
      if (problem) {
        setCardError(problem);
        return;
      }
    } catch {
      /* PayPal validates again on submit */
    }
    const payload = getPayloadRef.current();
    const billingAddress = buildCardBillingAddress({
      shippingMethod: payload.shippingMethod,
      customer: payload.customer,
      billingSame,
      billing,
      isEs,
    });
    if ('error' in billingAddress) {
      setCardError(billingAddress.error);
      return;
    }
    changeStage('holding');
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
        {isEs ? 'No se pudo cargar PayPal. Actualice la página o llámenos al (239) 404-8505.' : 'PayPal could not load. Refresh the page or call (239) 404-8505.'}
      </p>
    );
  }

  const busy = stage !== 'idle';
  const blocked = sdkReady && !ready;
  const heldAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? formatCheckoutCurrency(amount) : null;
  const reminder = (at: 'top' | 'card') => hint && hint.at === at && !ready && (
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
      <AppIcon name="error" aria-hidden="true" style={{ fontSize: '1.15rem', lineHeight: 1.25, flexShrink: 0 }} />
      <span>
        {isEs ? 'Antes de continuar, complete: ' : 'Before you continue, please complete: '}
        {hint.fields.join(', ')}.
      </span>
    </div>
  );
  const messageLine = message && (
    <p className="mt-2 text-sm" role="alert" style={{ color: 'var(--color-error)' }}>{message}</p>
  );

  return (
    <div>
      {reminder('top')}
      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          className="paypal-button-stack"
          aria-busy={busy}
          style={{ opacity: blocked ? 0.5 : 1, transition: 'opacity 150ms ease' }}
        />
        {blocked && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={isEs ? 'Complete los datos requeridos' : 'Complete the required details first'}
            onClick={() => setHint({ fields: missingFields, at: 'top' })}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'not-allowed', zIndex: 5 }}
          />
        )}
      </div>
      {!sdkReady && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Cargando PayPal…' : 'Loading PayPal…'}
        </p>
      )}
      {stage === 'approving' && activeMethod === 'paypal' && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs
            ? 'Complete el pago en la ventana de PayPal. Solo se retendrá el monto — no se le cobrará a menos que aceptemos.'
            : 'Finish in the PayPal window. The amount is only held — you are not charged unless we accept.'}
        </p>
      )}
      {stage === 'holding' && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Enviando su oferta… Mantenga esta página abierta.' : 'Sending your offer… Please keep this page open.'}
        </p>
      )}
      {cardEligible ? (
        <div className="paypal-card-form">
          <div className="paypal-card-form__or">
            <span>{isEs ? 'o retenga con una tarjeta' : 'or hold with a card'}</span>
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
            idPrefix="offer-card-billing"
            pickup={isPickupMethod(getPayload().shippingMethod)}
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
            onClick={() => { void holdByCard(); }}
            style={{ minHeight: BUTTON_HEIGHT, opacity: blocked || busy ? 0.6 : 1 }}
          >
            {busy && activeMethod === 'card'
              ? (isEs ? 'Enviando…' : 'Sending…')
              : heldAmount
                ? (isEs ? `Enviar oferta · Retener ${heldAmount}` : `Send offer · Hold ${heldAmount}`)
                : (isEs ? 'Enviar oferta' : 'Send offer')}
          </button>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs
              ? `No se cobra nada ahora. La tarjeta solo queda retenida${heldAmount ? ` por ${heldAmount}` : ''} — se cobra si aceptamos dentro de ${OFFER_WINDOW_HOURS} horas y se libera si la rechazamos o no respondemos. Los datos de su tarjeta van directo a PayPal y nunca pasan por nuestro servidor.`
              : `Nothing is charged now. The card is only held${heldAmount ? ` for ${heldAmount}` : ''} — charged if we accept within ${OFFER_WINDOW_HOURS} hours, released if we decline or don’t answer. Card details go straight to PayPal and never touch our server.`}
          </p>
        </div>
      ) : messageLine}
    </div>
  );
}
