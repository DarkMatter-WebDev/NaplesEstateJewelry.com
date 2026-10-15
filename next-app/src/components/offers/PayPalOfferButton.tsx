'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';

/**
 * The PayPal buttons for a site OFFER (lib/offers.ts). Unlike the checkout's
 * PayPalCheckoutButton, the buyer's approval only HOLDS the money: the SDK is
 * loaded with intent=authorize, /api/offers creates the AUTHORIZE order and
 * /api/offers/authorize turns the approval into the hold. Nothing is charged
 * until the owner accepts.
 *
 * ⚠️ Its own SDK copy under a separate namespace (`window.paypalOffer`). The
 * checkout's loader reuses `window.paypal` when it exists, and an SDK loaded
 * with intent=authorize there would turn a later checkout into a hold.
 */

type ButtonsActions = { resolve: () => Promise<void>; reject: () => Promise<void> };
type ButtonsConfig = {
  style?: Record<string, unknown>;
  onClick?: (data: Record<string, unknown>, actions: ButtonsActions) => Promise<void> | void;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
};
type PayPalOfferNamespace = {
  Buttons: (config: ButtonsConfig) => { render: (container: HTMLElement) => Promise<void>; close?: () => void };
};

declare global {
  interface Window {
    paypalOffer?: PayPalOfferNamespace;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadOfferSdk(clientId: string): Promise<void> {
  if (typeof window !== 'undefined' && window.paypalOffer) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      'client-id': clientId,
      currency: 'USD',
      intent: 'authorize',
      components: 'buttons',
      'disable-funding': 'paylater,credit',
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

export default function PayPalOfferButton({
  clientId,
  ready,
  isEs,
  missingFields,
  getPayload,
  onHeld,
}: {
  clientId: string;
  ready: boolean;
  isEs: boolean;
  /** What still has to be filled in / ticked, in form order. */
  missingFields: string[];
  getPayload: () => OfferPayload;
  onHeld: (result: OfferHeld) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [stage, setStage] = useState<'idle' | 'approving' | 'holding'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string[] | null>(null);

  const readyRef = useRef(ready);
  const missingRef = useRef(missingFields);
  const getPayloadRef = useRef(getPayload);
  const onHeldRef = useRef(onHeld);
  const isEsRef = useRef(isEs);
  const handledRef = useRef(false);
  useEffect(() => {
    readyRef.current = ready;
    missingRef.current = missingFields;
    getPayloadRef.current = getPayload;
    onHeldRef.current = onHeld;
    isEsRef.current = isEs;
  });

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
    const buttons = window.paypalOffer.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'paypal' },
      onClick: (_data, actions) => {
        if (!readyRef.current) {
          setHint(missingRef.current);
          return actions.reject();
        }
        setHint(null);
        setMessage(null);
        handledRef.current = false;
        return actions.resolve();
      },
      createOrder: async () => {
        setStage('approving');
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
          setStage('idle');
          handledRef.current = true;
          setMessage(err instanceof Error && err.message !== 'offer failed'
            ? err.message
            : (isEsRef.current ? 'No se pudo iniciar la oferta. Intente de nuevo.' : 'Could not start the offer. Please try again.'));
          throw err;
        }
      },
      onApprove: async (data) => {
        setStage('holding');
        try {
          const res = await fetch('/api/offers/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paypalOrderId: data.orderID }),
          });
          const result = await res.json().catch(() => null);
          if (!res.ok || !result?.success) throw new Error(result?.error ?? 'hold failed');
          onHeldRef.current({ total: Number(result.total), amount: Number(result.amount), deadline: String(result.deadline ?? '') });
        } catch (err) {
          setStage('idle');
          handledRef.current = true;
          setMessage(err instanceof Error && err.message !== 'hold failed'
            ? err.message
            : (isEsRef.current
                ? 'No pudimos confirmar la retención de PayPal. Si ve un cargo pendiente, llámenos al (239) 404-8505.'
                : 'We could not confirm the PayPal hold. If you see a pending charge, call (239) 404-8505.'));
        }
      },
      onCancel: () => {
        setStage('idle');
        setMessage(isEsRef.current
          ? 'Oferta cancelada. No se retuvo nada. Puede intentarlo de nuevo.'
          : 'Offer cancelled. Nothing was held. You can try again.');
      },
      onError: () => {
        setStage('idle');
        if (handledRef.current) {
          handledRef.current = false;
          return;
        }
        setMessage(isEsRef.current
          ? 'PayPal no completó la oferta. Si usó una tarjeta, revise los datos e intente de nuevo, o llámenos al (239) 404-8505.'
          : 'PayPal did not complete the offer. If you used a card, check its details and try again, or call (239) 404-8505.');
      },
    });
    buttons.render(container).catch(() => { if (!closed) setSdkError(true); });
    return () => {
      closed = true;
      try { buttons.close?.(); } catch { /* ignore */ }
      container.innerHTML = '';
    };
  }, [sdkReady]);

  if (sdkError) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-error)' }}>
        {isEs ? 'No se pudo cargar PayPal. Actualice la página o llámenos al (239) 404-8505.' : 'PayPal could not load. Refresh the page or call (239) 404-8505.'}
      </p>
    );
  }

  return (
    <div>
      {hint && !ready && (
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
            {hint.join(', ')}.
          </span>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          aria-busy={stage !== 'idle'}
          style={{ opacity: sdkReady && !ready ? 0.5 : 1, transition: 'opacity 150ms ease' }}
        />
        {sdkReady && !ready && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={isEs ? 'Complete los datos requeridos' : 'Complete the required details first'}
            onClick={() => setHint(missingFields)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'not-allowed', zIndex: 5 }}
          />
        )}
      </div>
      {!sdkReady && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Cargando PayPal…' : 'Loading PayPal…'}
        </p>
      )}
      {stage === 'approving' && (
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
      {message && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>{message}</p>
      )}
    </div>
  );
}
