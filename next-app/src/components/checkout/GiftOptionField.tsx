'use client';

import { GIFT_MESSAGE_MAX, GIFT_NAME_MAX } from '@/lib/order-gift';

/**
 * "🎁 This is a gift" at checkout (owner-approved mockup, 2026-10-29).
 * Rules and wording: `lib/order-gift.ts`.
 *
 * Sits right after the buyer's contact details, so the address below it reads
 * as the recipient's. Shipping: recipient's first + last name (required while
 * ticked) and an optional message. Local Pickup: message only.
 *
 * Controlled: CheckoutClient keeps the values (they go in the create-order
 * payload and the Order Received snapshot). Colours inline, like the other
 * form tick boxes — unlayered globals.css rules beat Tailwind on inputs.
 */

export interface GiftFormState {
  isGift: boolean;
  recipientFirst: string;
  recipientLast: string;
  message: string;
}

export const EMPTY_GIFT_FORM: GiftFormState = { isGift: false, recipientFirst: '', recipientLast: '', message: '' };

const GOLD = '#735c00';

export default function GiftOptionField({ value, onChange, pickup, isEs }: {
  value: GiftFormState;
  onChange: (next: GiftFormState) => void;
  pickup: boolean;
  isEs: boolean;
}) {
  const set = (patch: Partial<GiftFormState>) => onChange({ ...value, ...patch });
  const recipient = [value.recipientFirst.trim(), value.recipientLast.trim()].filter(Boolean).join(' ');

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ border: '1.5px solid #e2d6b5', background: '#fffdf8' }}
    >
      <label
        htmlFor="checkout-gift"
        className="flex cursor-pointer select-none items-start gap-3 px-4 py-3.5"
        style={{ borderBottom: value.isGift ? '1px solid #ece3c9' : undefined }}
      >
        <input
          id="checkout-gift"
          type="checkbox"
          checked={value.isGift}
          onChange={(e) => set({ isGift: e.target.checked })}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-[1.375rem] w-[1.375rem] flex-none place-items-center rounded-md text-[0.95rem] font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-[#735c00]/40"
          style={{
            border: `2px solid ${value.isGift ? GOLD : '#b5a37a'}`,
            background: value.isGift ? GOLD : 'white',
            color: 'white',
          }}
        >
          {value.isGift ? '✓' : ''}
        </span>
        <span className="text-[0.95rem] leading-snug" style={{ color: 'var(--color-on-surface)' }}>
          <span className="font-semibold">🎁 {isEs ? 'Es un regalo' : 'This is a gift'}</span>
          <span className="block text-[0.8rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
            {pickup
              ? (isEs ? 'Agregue un mensaje; no incluiremos los precios' : 'Add a message — we’ll leave out the prices')
              : (isEs ? 'Envíelo a otra persona, con su mensaje y sin precios' : 'Ship it to someone else, with your message and no prices')}
          </span>
        </span>
      </label>

      {value.isGift && (
        <div className="grid gap-3 px-4 pb-4 pt-3">
          {!pickup && (
            <div className="responsive-form-grid">
              <div>
                <label className="form-label" htmlFor="checkout-gift-first">
                  {isEs ? 'Nombre del destinatario' : 'Recipient’s first name'} *
                </label>
                <input
                  id="checkout-gift-first"
                  required
                  maxLength={GIFT_NAME_MAX}
                  className="form-field"
                  autoComplete="off"
                  value={value.recipientFirst}
                  onChange={(e) => set({ recipientFirst: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="checkout-gift-last">
                  {isEs ? 'Apellido del destinatario' : 'Recipient’s last name'} *
                </label>
                <input
                  id="checkout-gift-last"
                  required
                  maxLength={GIFT_NAME_MAX}
                  className="form-field"
                  autoComplete="off"
                  value={value.recipientLast}
                  onChange={(e) => set({ recipientLast: e.target.value })}
                />
              </div>
            </div>
          )}
          <div>
            <label className="form-label" htmlFor="checkout-gift-message">
              {isEs ? 'Mensaje de regalo (opcional)' : 'Gift message (optional)'}
            </label>
            <textarea
              id="checkout-gift-message"
              maxLength={GIFT_MESSAGE_MAX}
              rows={3}
              className="form-field"
              style={{ width: '100%', resize: 'vertical' }}
              placeholder={isEs ? 'p. ej. ¡Feliz aniversario! Con cariño, J.' : 'e.g. Happy anniversary! Love always, J.'}
              value={value.message}
              onChange={(e) => set({ message: e.target.value })}
            />
            <p className="mt-1 text-right text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {value.message.length} / {GIFT_MESSAGE_MAX}
            </p>
          </div>
          <p
            className="rounded-[10px] px-3 py-2.5 text-[0.8rem] leading-relaxed"
            style={{ border: '1px solid rgba(115, 92, 0, 0.24)', background: '#fbf5e7', color: '#4d4635' }}
          >
            {pickup
              ? (isEs
                ? <>Pondremos su mensaje en una tarjeta de regalo, <b>sin precios</b>. Su recibo se le envía por correo.</>
                : <>We’ll put your message on a gift slip — <b>no prices</b>. Your receipt is emailed to you.</>)
              : (isEs
                ? <>El paquete va a <b>{recipient || 'la persona que lo recibe'}</b> en la dirección de abajo, con una tarjeta de regalo: <b>sin precios ni sus datos</b>. Su recibo se le envía por correo. Asegurado, con firma al entregar.</>
                : <>The package goes to <b>{recipient || 'your recipient'}</b> at the address below with a gift slip — <b>no prices, none of your details</b>. Your receipt is emailed to you. Insured, signature on delivery.</>)}
          </p>
        </div>
      )}
    </div>
  );
}
