'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppIcon } from '@/components/AppIcon';
import PayPalOfferButton, { type OfferHeld } from '@/components/offers/PayPalOfferButton';
import PayPalCheckoutButton from '@/components/checkout/PayPalCheckoutButton';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import { addressWithLandmark } from '@/lib/business-location';
import { formatCheckoutCurrency, FL_TAX_RATE_LABEL, isFloridaState } from '@/lib/checkout-pricing';
import {
  CHECKOUT_SHIPPING_OPTIONS,
  DEFAULT_SHIPPING_METHOD,
  getCheckoutShippingFee,
  isShippingMethodAvailable,
} from '@/lib/checkout-shipping';
import {
  OFFER_MESSAGE_MAX,
  OFFER_WINDOW_HOURS,
  computeOfferTotals,
  offerAmountMessage,
  offerAmountProblem,
  parseOfferAmount,
} from '@/lib/offers';
import { isUnitedStatesCountry, normalizeUsState, normalizeUsZip, US_STATES } from '@/lib/us-address';
import { normalizePhoneNumber } from '@/lib/phone';
import { composeFullName, formatFullName } from '@/lib/person-name';

/**
 * The buyer's side of "Make an Offer" (owner, 2026-10-15, mockup v2), two modes:
 *  - `offer`: /offer/[id] — the offer amount, contact, pickup or shipping, and
 *    the PayPal buttons in HOLD mode (PayPalOfferButton). The binding box says
 *    an accepted offer is charged automatically.
 *  - `counter`: /offer/counter/[token] — the owner's counter-offer price for
 *    that one piece, paid at once through the NORMAL checkout route
 *    (PayPalCheckoutButton + /api/paypal/create-order with the token).
 * Totals come from computeOfferTotals — the checkout's own arithmetic.
 */

const GOLD = '#735c00';

export type OfferItem = {
  id: string;
  title: string;
  image: string | null;
  listedPrice: number;
};

export type CounterDetails = {
  token: string;
  amount: number;
  until: string;
  note: string | null;
  prefill: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    shippingMethod: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postal_code: string;
  };
};

type Customer = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

export default function OfferCheckoutClient({
  mode,
  locale,
  paypalClientId,
  pickupHoursLine,
  item,
  counter,
}: {
  mode: 'offer' | 'counter';
  locale: string;
  paypalClientId: string | null;
  pickupHoursLine: string;
  item: OfferItem;
  counter?: CounterDetails;
}) {
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';
  const productHref = `${prefix}/shop/${encodeURIComponent(item.id)}`;
  const prefill = counter?.prefill;

  const [amountText, setAmountText] = useState('');
  const [message, setMessage] = useState('');
  const [shippingMethod, setShippingMethod] = useState<string>(prefill?.shippingMethod || 'local-pickup');
  const [customer, setCustomer] = useState<Customer>({
    first_name: prefill?.first_name ?? '',
    last_name: prefill?.last_name ?? '',
    email: prefill?.email ?? '',
    phone: prefill?.phone ?? '',
    address_line1: prefill?.address_line1 ?? '',
    address_line2: prefill?.address_line2 ?? '',
    city: prefill?.city ?? '',
    state: prefill?.state ?? '',
    postal_code: prefill?.postal_code ?? '',
    country: 'United States',
  });
  const [agreed, setAgreed] = useState(false);
  const [held, setHeld] = useState<OfferHeld | null>(null);
  const [paidOrder, setPaidOrder] = useState<string | null>(null);

  // The short success screen replaces a long form while the page is still
  // scrolled to the PayPal button: on a phone the buyer landed on the footer
  // with "Offer sent" and the watch-your-email note above the screen
  // (measured 2026-10-18: heading 574 px above the top). Start them at the top.
  useEffect(() => {
    if (held || paidOrder) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [held, paidOrder]);
  const orderIdRef = useRef<string | null>(null);

  const amount = mode === 'counter' ? counter?.amount ?? null : parseOfferAmount(amountText);
  const amountProblem = mode === 'counter' ? null : offerAmountProblem(amount, item.listedPrice);
  // The shipping tier keys off the merchandise value: the offer once typed,
  // the listed price until then.
  const tierBase = amount ?? item.listedPrice;
  const effectiveMethod = isShippingMethodAvailable(shippingMethod, tierBase) ? shippingMethod : DEFAULT_SHIPPING_METHOD;
  const needsShipping = effectiveMethod !== 'local-pickup';
  const totals = amount != null ? computeOfferTotals(amount, effectiveMethod, customer.state) : null;

  const composedName = composeFullName(customer.first_name, customer.last_name);
  const normalizedPhone = normalizePhoneNumber(customer.phone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim());
  const addressOk = !needsShipping || (
    customer.address_line1.trim() !== ''
    && customer.city.trim() !== ''
    && normalizeUsState(customer.state) !== null
    && normalizeUsZip(customer.postal_code) !== null
    && isUnitedStatesCountry(customer.country)
  );

  const missing = [
    mode === 'offer' && amountProblem ? (isEs ? 'Su oferta' : 'Your offer') : null,
    customer.first_name.trim() === '' ? (isEs ? 'Nombre' : 'First Name') : null,
    customer.last_name.trim() === '' ? (isEs ? 'Apellido' : 'Last Name') : null,
    !emailOk ? (isEs ? 'Correo electrónico' : 'Email') : null,
    normalizedPhone === null ? (isEs ? 'Teléfono válido' : 'Valid Phone Number') : null,
    needsShipping && !addressOk ? (isEs ? 'Dirección de envío completa' : 'Complete shipping address') : null,
    !agreed ? (isEs ? 'la casilla de confirmación' : 'the confirmation box') : null,
  ].filter((label): label is string => Boolean(label));
  const ready = missing.length === 0 && totals !== null;

  const customerPayload = {
    name: composedName ?? formatFullName(customer.first_name, customer.last_name),
    email: customer.email.trim(),
    phone: normalizedPhone ?? customer.phone,
    address_line1: customer.address_line1,
    address_line2: customer.address_line2,
    city: customer.city,
    state: customer.state,
    postal_code: customer.postal_code,
    country: customer.country,
  };

  if (held) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <AppIcon name="check_circle" style={{ fontSize: '44px', color: GOLD }} />
        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-4" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          {isEs ? 'Oferta enviada' : 'Offer sent'}
        </h1>
        <p className="mb-3" style={{ color: 'var(--color-on-surface)' }}>
          {isEs
            ? `Le responderemos antes del ${held.deadline}. Retuvimos ${formatCheckoutCurrency(held.total)} — solo se le cobrará si aceptamos.`
            : `We'll answer by ${held.deadline}. We've held ${formatCheckoutCurrency(held.total)} — you'll only be charged if we accept.`}
        </p>
        {/* Owner, 2026-10-18 (mockup 2): email is where the answer arrives
            (offer texts were shelved) — say so, centred, with the address. */}
        <div className="offer-watch-note">
          <AppIcon name="mail" style={{ fontSize: '22px', color: GOLD }} aria-hidden="true" />
          <p className="font-bold">{isEs ? 'Esté atento a su correo electrónico.' : 'Keep an eye on your email.'}</p>
          <p>
            {isEs ? 'Nuestra respuesta llegará a ' : 'Our answer goes to '}
            <strong className="offer-watch-email">{customer.email.trim()}</strong>
            {isEs ? ' — normalmente respondemos en menos de una hora.' : ' — we usually reply within an hour.'}
          </p>
          <p className="offer-watch-spam">
            {isEs ? '¿No la ve? Revise la carpeta de spam o correo no deseado.' : 'Not there? Check your spam or junk folder.'}
          </p>
        </div>
        <a href={`${prefix}/shop`} className="gold-button">{isEs ? 'Volver a la tienda' : 'Back to Shop'}</a>
        <style jsx>{`
          .offer-watch-note {
            display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
            max-width: 30rem; margin: 1.1rem auto 2rem; padding: 0.85rem 1rem;
            background: #fff7dd; border: 1px solid #ecd58a; text-align: center;
            font-size: 0.9rem; line-height: 1.5; color: var(--color-on-surface);
          }
          .offer-watch-email { overflow-wrap: anywhere; }
          .offer-watch-spam { margin-top: 0.25rem; font-size: 0.8rem; color: var(--color-on-surface-variant); }
        `}</style>
      </div>
    );
  }

  if (paidOrder) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <AppIcon name="check_circle" style={{ fontSize: '44px', color: GOLD }} />
        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-4" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          {isEs ? 'Pedido recibido' : 'Order Received'}
        </h1>
        <p className="mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs ? 'Su pago se completó. Le enviamos el recibo por correo electrónico.' : 'Your payment went through. Your receipt is on its way to your email.'}
        </p>
        <p className="mb-8 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>{paidOrder}</p>
        <a href={`${prefix}/shop`} className="gold-button">{isEs ? 'Volver a la tienda' : 'Back to Shop'}</a>
      </div>
    );
  }

  const setField = (key: keyof Customer) => (event: { target: { value: string } }) =>
    setCustomer((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="offer-page">
      <div className="offer-shell">
        <Link href={productHref} className="hover-underline-grow text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
          {isEs ? '< Volver a la pieza' : '< Back to the piece'}
        </Link>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mt-2 mb-5" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          {mode === 'offer' ? (isEs ? 'Hacer una oferta' : 'Make an Offer') : (isEs ? 'Su contraoferta' : 'Your counter-offer')}
        </h1>

        <div className="offer-layout">
          <div className="offer-main">
            <section className="offer-card">
              <div className="offer-item">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" width={72} height={72} />
                ) : null}
                <div>
                  <p className="font-bold" style={{ color: 'var(--color-on-surface)' }}>{item.title}</p>
                  {mode === 'offer' ? (
                    <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {isEs ? 'Precio actual' : 'Listed at'} <strong>{formatCheckoutCurrency(item.listedPrice)}</strong> · {isEs ? 'pieza única' : 'one of a kind'}
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                      <strong style={{ color: GOLD }}>{isEs ? 'Precio acordado' : 'Agreed price'} {formatCheckoutCurrency(counter?.amount ?? 0)}</strong>{' '}
                      <s>{formatCheckoutCurrency(item.listedPrice)}</s>
                      <br />
                      {isEs ? `Su precio de contraoferta · hasta el ${counter?.until}` : `Your counter-offer price · until ${counter?.until}`}
                    </p>
                  )}
                </div>
              </div>

              {mode === 'offer' && (
                <>
                  <label className="form-label mt-4" htmlFor="offer-amount">{isEs ? 'Su oferta' : 'Your offer'} *</label>
                  <div className="offer-money">
                    <span aria-hidden="true">$</span>
                    <input
                      id="offer-amount"
                      className="form-field"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={amountText}
                      aria-invalid={amountText.trim() !== '' && amountProblem !== null}
                      onChange={(event) => setAmountText(event.target.value)}
                    />
                  </div>
                  <p className="text-xs mt-1" style={{ color: amountText.trim() !== '' && amountProblem ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}>
                    {amountText.trim() !== '' && amountProblem
                      ? offerAmountMessage(amountProblem, item.listedPrice, isEs)
                      : (isEs
                          ? `Debe ser menor que ${formatCheckoutCurrency(item.listedPrice)}. Si aceptamos, se le cobra este monto más envío e impuestos.`
                          : `Must be below ${formatCheckoutCurrency(item.listedPrice)}. If we accept, you'll be charged this amount plus shipping and tax.`)}
                  </p>
                  <label className="form-label mt-4" htmlFor="offer-message">{isEs ? 'Mensaje (opcional)' : 'Message (optional)'}</label>
                  <textarea
                    id="offer-message"
                    className="form-field"
                    rows={2}
                    maxLength={OFFER_MESSAGE_MAX}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </>
              )}
              {mode === 'counter' && counter?.note && (
                <p className="mt-3 text-sm italic" style={{ color: 'var(--color-on-surface)' }}>&ldquo;{counter.note}&rdquo; — Chris</p>
              )}
            </section>

            <section className="offer-card">
              <h2 className="offer-h2">{isEs ? 'Recogida o envío' : 'Pickup or shipping'}</h2>
              <div role="radiogroup" aria-label={isEs ? 'Método de entrega' : 'Delivery method'} className="offer-methods">
                {CHECKOUT_SHIPPING_OPTIONS.filter((option) => isShippingMethodAvailable(option.value, tierBase)).map((option) => {
                  const fee = getCheckoutShippingFee(option.value, tierBase) ?? 0;
                  const selected = effectiveMethod === option.value;
                  const description = option.value === 'local-pickup'
                    ? (isEs
                        ? `Recogida en persona en ${addressWithLandmark(true)}. ${pickupHoursLine}.`
                        : `In-person pickup at ${addressWithLandmark(false)}. ${pickupHoursLine}.`)
                    : option.value === 'express-overnight-insured'
                      ? (isEs ? 'Entrega al día siguiente, totalmente asegurada.' : 'Next-day delivery, fully insured.')
                      : (isEs ? 'Envío totalmente asegurado con firma de entrega.' : 'Fully insured shipping with delivery signature.');
                  return (
                    <label key={option.value} className="offer-method" data-selected={selected ? 'true' : 'false'}>
                      <input
                        type="radio"
                        name="offer-delivery-method"
                        value={option.value}
                        checked={selected}
                        onChange={() => setShippingMethod(option.value)}
                        style={{ accentColor: GOLD, width: '1.05rem', height: '1.05rem', flexShrink: 0, marginTop: '0.15rem' }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-bold text-sm" style={{ color: 'var(--color-on-surface)' }}>{isEs ? option.labelEs : option.labelEn}</span>
                          <span className="font-bold text-sm" style={{ color: GOLD }}>{formatCheckoutCurrency(fee)}</span>
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>{description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="offer-card">
              <h2 className="offer-h2">{isEs ? 'Sus datos' : 'Your details'}</h2>
              <div className="responsive-form-grid">
                <div>
                  <label className="form-label" htmlFor="offer-first-name">{isEs ? 'Nombre' : 'First Name'} *</label>
                  <input id="offer-first-name" className="form-field" autoComplete="given-name" value={customer.first_name} onChange={setField('first_name')} />
                </div>
                <div>
                  <label className="form-label" htmlFor="offer-last-name">{isEs ? 'Apellido' : 'Last Name'} *</label>
                  <input id="offer-last-name" className="form-field" autoComplete="family-name" value={customer.last_name} onChange={setField('last_name')} />
                </div>
              </div>
              <div className="responsive-form-grid">
                <div>
                  <label className="form-label" htmlFor="offer-email">{isEs ? 'Correo electrónico' : 'Email'} *</label>
                  <input id="offer-email" type="email" className="form-field" autoComplete="email" value={customer.email} onChange={setField('email')} aria-describedby={mode === 'offer' ? 'offer-email-hint' : undefined} />
                  {mode === 'offer' && (
                    <p id="offer-email-hint" className="offer-email-hint">
                      <AppIcon name="mail" style={{ fontSize: '14px', color: GOLD, flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
                      <span>{isEs ? 'Le respondemos por correo electrónico — normalmente en menos de una hora.' : 'Our answer comes by email — usually within an hour.'}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label" htmlFor="offer-phone">{isEs ? 'Teléfono' : 'Phone'} *</label>
                  <input
                    id="offer-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="(239) 555-0123"
                    className="form-field"
                    autoComplete="tel"
                    aria-invalid={customer.phone.trim() !== '' && normalizedPhone === null}
                    value={customer.phone}
                    onChange={setField('phone')}
                  />
                </div>
              </div>
              {needsShipping && (
                <div className="offer-address">
                  <div>
                    <label className="form-label" htmlFor="offer-address1">{isEs ? 'Dirección' : 'Street Address'} *</label>
                    <input id="offer-address1" className="form-field" autoComplete="address-line1" value={customer.address_line1} onChange={setField('address_line1')} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="offer-address2">{isEs ? 'Apartamento, suite, etc. (opcional)' : 'Apartment, suite, etc. (optional)'}</label>
                    <input id="offer-address2" className="form-field" autoComplete="address-line2" value={customer.address_line2} onChange={setField('address_line2')} />
                  </div>
                  <div className="responsive-form-grid">
                    <div>
                      <label className="form-label" htmlFor="offer-city">{isEs ? 'Ciudad' : 'City'} *</label>
                      <input id="offer-city" className="form-field" autoComplete="address-level2" value={customer.city} onChange={setField('city')} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="offer-state">{isEs ? 'Estado' : 'State'} *</label>
                      <select id="offer-state" className="form-field" autoComplete="address-level1" value={customer.state} onChange={setField('state')}>
                        <option value="">{isEs ? 'Seleccione un estado' : 'Select a state'}</option>
                        {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="responsive-form-grid">
                    <div>
                      <label className="form-label" htmlFor="offer-zip">{isEs ? 'Código postal' : 'ZIP Code'} *</label>
                      <input
                        id="offer-zip"
                        className="form-field"
                        autoComplete="postal-code"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="12345"
                        value={customer.postal_code}
                        onChange={(event) => setCustomer((current) => ({ ...current, postal_code: normalizeUsZip(event.target.value) ?? event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="offer-country">{isEs ? 'País' : 'Country'}</label>
                      <input id="offer-country" readOnly className="form-field" value="United States" />
                    </div>
                  </div>
                </div>
              )}
              <FormPrivacyNotice locale={locale} />
            </section>
          </div>

          <aside className="offer-aside">
            <div className="offer-card offer-summary">
              <h2 className="offer-h2">
                {mode === 'offer' ? (isEs ? 'Si aceptamos' : 'If we accept') : (isEs ? 'Su pedido' : 'Your order')}
              </h2>
              <table className="offer-totals">
                <tbody>
                  <tr>
                    <td>{mode === 'offer' ? (isEs ? 'Su oferta' : 'Your offer') : (isEs ? 'Artículo' : 'Item')}</td>
                    <td>{amount != null ? formatCheckoutCurrency(amount) : '—'}</td>
                  </tr>
                  <tr>
                    <td>{effectiveMethod === 'local-pickup' ? (isEs ? 'Recogida local' : 'Local Pickup') : (isEs ? 'Envío' : 'Shipping')}</td>
                    <td>{totals ? formatCheckoutCurrency(totals.shippingFee) : '—'}</td>
                  </tr>
                  <tr>
                    <td>
                      {effectiveMethod === 'local-pickup' || isFloridaState(customer.state)
                        ? (isEs ? `Impuesto FL ${FL_TAX_RATE_LABEL}` : `FL sales tax ${FL_TAX_RATE_LABEL}`)
                        : (isEs ? 'Impuesto' : 'Sales tax')}
                    </td>
                    <td>{totals ? formatCheckoutCurrency(totals.tax) : '—'}</td>
                  </tr>
                  <tr className="offer-sum">
                    <td>{mode === 'offer' ? (isEs ? 'Retenido hoy, cobrado si aceptamos' : 'Held today, charged if accepted') : 'Total'}</td>
                    <td>{totals ? formatCheckoutCurrency(totals.total) : '—'}</td>
                  </tr>
                </tbody>
              </table>

              <label className="offer-agree" htmlFor="offer-agree">
                <input
                  id="offer-agree"
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  style={{ accentColor: GOLD, width: '1.05rem', height: '1.05rem', flexShrink: 0, marginTop: '0.15rem' }}
                />
                <span>
                  {mode === 'offer'
                    ? (isEs
                        ? `Entiendo que esta oferta es vinculante: si Naples Estate Jewelry la acepta dentro de ${OFFER_WINDOW_HOURS} horas, el monto retenido se cobra automáticamente. Si se rechaza o no se responde, la retención se libera y no se me cobra.`
                        : `I understand this offer is binding: if Naples Estate Jewelry accepts within ${OFFER_WINDOW_HOURS} hours, the held amount is charged automatically. If it is declined or not answered, the hold is released and I am not charged.`)
                    : (isEs
                        ? 'Confirmo que he revisado mi pedido y que mis datos de contacto y dirección de envío son correctos.'
                        : 'I confirm that I have reviewed my order and that my contact details and shipping address are correct.')}
                </span>
              </label>

              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                {isEs ? 'Al continuar, acepta nuestras ' : 'By continuing, you agree to our '}
                <Link href={`${prefix}/returns-refunds`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>{isEs ? 'Devoluciones' : 'Returns & Refunds'}</Link>
                {', '}
                <Link href={`${prefix}/terms`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>{isEs ? 'Términos' : 'Terms'}</Link>
                {isEs ? ' y ' : ' and '}
                <Link href={`${prefix}/privacy`} className="font-bold underline underline-offset-2" style={{ color: GOLD }}>{isEs ? 'Privacidad' : 'Privacy Policy'}</Link>.
              </p>

              {!paypalClientId ? (
                <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                  {isEs ? 'El pago en línea no está disponible ahora. Llámenos al (239) 404-8505.' : 'Online payment is unavailable right now. Please call (239) 404-8505.'}
                </p>
              ) : mode === 'offer' ? (
                <PayPalOfferButton
                  clientId={paypalClientId}
                  amount={totals?.total ?? null}
                  ready={ready}
                  isEs={isEs}
                  missingFields={missing}
                  getPayload={() => ({
                    productId: item.id,
                    amount: amount ?? 0,
                    shippingMethod: effectiveMethod,
                    customer: customerPayload,
                    message,
                    locale,
                  })}
                  onHeld={setHeld}
                />
              ) : (
                <PayPalCheckoutButton
                  clientId={paypalClientId}
                  amount={totals?.total ?? null}
                  ready={ready}
                  isEs={isEs}
                  missingFields={missing.filter((label) => label !== (isEs ? 'la casilla de confirmación' : 'the confirmation box'))}
                  needsInfoConfirmation={!agreed}
                  getPayload={() => ({
                    items: [{ id: item.id, quantity: 1 }],
                    customer: { ...customerPayload, notes: '' },
                    shippingMethod: effectiveMethod,
                    orderId: orderIdRef.current,
                    counterToken: counter?.token ?? null,
                    locale,
                    quotedTotal: totals?.total ?? null,
                  })}
                  onOrderId={(id) => { orderIdRef.current = id; }}
                  onSuccess={({ orderNumber }) => setPaidOrder(orderNumber)}
                />
              )}
              {mode === 'offer' && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {isEs
                    ? 'Su banco puede mostrar una retención pendiente hasta que respondamos.'
                    : 'Your bank may show a pending hold until we answer.'}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .offer-page {
          min-height: 100vh;
          padding: 2.5rem 0 4rem;
          background:
            linear-gradient(180deg, rgba(255, 253, 248, 0.94) 0%, rgba(249, 247, 239, 0.98) 46%, #f9f7ef 100%),
            radial-gradient(circle at top right, rgba(212, 175, 55, 0.18), transparent 34%);
        }
        .offer-shell {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding-inline: clamp(1rem, 4vw, 2rem);
        }
        .offer-layout {
          display: grid;
          gap: 1.25rem;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .offer-layout {
            grid-template-columns: minmax(0, 1fr) minmax(20rem, 24rem);
            gap: 1.5rem;
          }
          .offer-summary {
            position: sticky;
            top: 5.5rem;
          }
        }
        .offer-main,
        .offer-aside {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-width: 0;
        }
        .offer-card {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          padding: clamp(1.1rem, 2.6vw, 1.5rem);
          border: 1px solid rgba(216, 208, 194, 0.94);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 14px 36px rgba(75, 60, 24, 0.07);
        }
        .offer-h2 {
          margin: 0;
          font-family: var(--font-headline);
          font-size: 1.3rem;
          color: var(--color-on-surface);
        }
        .offer-email-hint {
          display: flex;
          gap: 0.35rem;
          align-items: flex-start;
          margin-top: 0.35rem;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--color-on-surface-variant);
        }
        .offer-item {
          display: flex;
          gap: 0.85rem;
          align-items: center;
        }
        .offer-item img {
          width: 72px;
          height: 72px;
          object-fit: cover;
          border: 1px solid var(--color-outline-variant);
          flex-shrink: 0;
        }
        .offer-money {
          position: relative;
        }
        .offer-money span {
          position: absolute;
          left: 0.8rem;
          top: 50%;
          transform: translateY(-50%);
          font-family: var(--font-headline);
          font-size: 1.25rem;
          color: ${GOLD};
        }
        .offer-money input {
          padding-left: 1.9rem;
          font-family: var(--font-headline);
          font-size: 1.35rem;
          font-weight: 700;
          color: ${GOLD};
        }
        .offer-methods {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .offer-method {
          display: flex;
          gap: 0.75rem;
          padding: 0.9rem 1rem;
          border: 1px solid rgba(216, 208, 194, 0.94);
          border-radius: var(--radius-lg);
          background: rgba(255, 253, 248, 0.9);
          cursor: pointer;
        }
        .offer-method[data-selected='true'] {
          border-color: #b5890c;
          box-shadow: 0 0 0 1px #b5890c inset;
        }
        .offer-address {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .offer-totals {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          color: var(--color-on-surface);
        }
        .offer-totals td {
          padding: 0.3rem 0;
        }
        .offer-totals td:last-child {
          text-align: right;
          white-space: nowrap;
        }
        .offer-totals .offer-sum td {
          padding-top: 0.65rem;
          border-top: 1px solid var(--color-outline-variant);
          font-weight: 800;
          font-size: 1rem;
        }
        .offer-agree {
          display: flex;
          align-items: flex-start;
          gap: 0.7rem;
          padding: 0.8rem 0.9rem;
          border: 1px solid #e9c349;
          border-radius: var(--radius-lg);
          background: #fffbea;
          font-size: 0.78rem;
          line-height: 1.5;
          color: var(--color-on-surface);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
