'use client';

import { useState } from 'react';
import PayPalCheckoutButton from '@/components/checkout/PayPalCheckoutButton';
import { formatCheckoutCurrency, FL_TAX_RATE_LABEL } from '@/lib/checkout-pricing';
import { payPageTotals } from '@/lib/remote-sale';
import { normalizeUsState } from '@/lib/us-address';
import { normalizePhoneNumber } from '@/lib/phone';

export type PayInvoiceItem = { id: string; title: string; detail: string; image: string | null; price: number };

export type PayInvoiceData = {
  token: string;
  orderNumber: string;
  due: string;
  items: PayInvoiceItem[];
  subtotal: number;
  shippingFee: number;
  ships: boolean;
  shippingLabel: string;
  otherWays: string[];
  message: string | null;
  /** The invoice is tax-exempt (a Florida certificate is on file): no tax at any address. */
  taxExempt?: { businessName: string | null; tag: string } | null;
  prefill: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postal_code: string;
  };
};

const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

/**
 * /pay/<token> — a remote-sale invoice's private payment page (owner, mockup
 * v2 screen 5, 2026-10-21): the invoice, the customer's details (and the
 * ship-to address on a shipped invoice), the total for that address, and the
 * site's PayPal buttons (PayPal or a card). The buttons open the PayPal order
 * through `/api/pay/<token>/create-order` and capture it through the normal
 * `/api/paypal/capture-order`. Closing the PayPal window never cancels the
 * invoice (`cancelOnAbandon={false}`).
 */
export default function PayInvoiceClient({ data, locale, paypalClientId }: { data: PayInvoiceData; locale: string; paypalClientId: string | null }) {
  const isEs = locale === 'es';
  const [form, setForm] = useState(data.prefill);
  const [paid, setPaid] = useState<{ orderNumber: string } | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const stateCode = data.ships ? normalizeUsState(form.state) : null;
  const totals = payPageTotals({ subtotal: data.subtotal, shipping_fee: data.shippingFee, shipping_method: data.ships ? 'shipping' : 'pickup', tax_exempt: Boolean(data.taxExempt) }, stateCode);

  const missing: string[] = [];
  if (!form.first_name.trim()) missing.push(isEs ? 'nombre' : 'first name');
  if (!form.last_name.trim()) missing.push(isEs ? 'apellido' : 'last name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) missing.push(isEs ? 'correo electrónico' : 'email');
  if (!normalizePhoneNumber(form.phone)) missing.push(isEs ? 'celular' : 'cell');
  if (data.ships) {
    if (!form.address_line1.trim()) missing.push(isEs ? 'dirección' : 'street');
    if (!form.city.trim()) missing.push(isEs ? 'ciudad' : 'city');
    if (!stateCode) missing.push(isEs ? 'estado' : 'state');
    if (!/^\d{5}(-\d{4})?$/.test(form.postal_code.trim())) missing.push('ZIP');
  }

  if (paid) {
    return (
      <div className="max-w-xl mx-auto text-center px-6 py-16 grid gap-4 justify-items-center" role="status">
        <span className="w-14 h-14 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </span>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{isEs ? 'Pago recibido. ¡Gracias!' : 'Payment received — thank you!'}</h1>
        <p style={hintStyle}>
          {isEs ? `Pedido ${paid.orderNumber}. Su recibo va en camino a ${form.email.trim()}.` : `Order ${paid.orderNumber}. Your receipt is on its way to ${form.email.trim()}.`}
        </p>
        <p className="text-sm" style={hintStyle}>
          {data.ships
            ? (isEs ? 'Le avisaremos por correo cuando se envíe.' : 'We will email you when it ships.')
            : (isEs ? 'Puede recogerlo en el salón; llámenos al (239) 404-8505 si tiene preguntas.' : 'Pick it up at the showroom; call (239) 404-8505 with any questions.')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 grid gap-4">
      <div className="grid gap-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          {isEs ? `Factura ${data.orderNumber}` : `Invoice ${data.orderNumber}`}
        </p>
        <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{isEs ? 'Su factura' : 'Your invoice'}</h1>
        <p className="text-sm" style={hintStyle}>{isEs ? `Este enlace funciona hasta el ${data.due}.` : `This link works until ${data.due}.`}</p>
      </div>

      {data.message && (
        <div className="rounded-xl border-l-[3px] px-4 py-3 text-sm italic" style={{ borderColor: '#d4af37', background: '#fbf7e8', color: 'var(--color-on-surface)' }}>
          <span className="whitespace-pre-line">{data.message}</span>
          <span className="block">— Chris</span>
        </div>
      )}

      <section className="rounded-[1.25rem] border bg-white p-5 grid gap-2.5" style={cardStyle}>
        {data.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-[14px] border p-3" style={cardStyle}>
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-14 w-14 flex-shrink-0 rounded-lg" style={{ background: 'var(--color-surface-container-high)' }} />
            )}
            <div className="grid min-w-0 gap-0.5">
              <span className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-on-surface)' }}>{item.title}</span>
              {item.detail && <span className="text-xs" style={hintStyle}>{item.detail}</span>}
            </div>
            <span className="ml-auto whitespace-nowrap font-semibold">{formatCheckoutCurrency(item.price)}</span>
          </div>
        ))}
      </section>

      <section className="rounded-[1.25rem] border bg-white p-5 grid gap-3" style={cardStyle}>
        <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{isEs ? 'Sus datos' : 'Your details'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label} style={labelStyle}>{isEs ? 'Nombre' : 'First name'}</span><input className="form-field" value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} autoComplete="given-name" /></label>
          <label className="block"><span className={label} style={labelStyle}>{isEs ? 'Apellido' : 'Last name'}</span><input className="form-field" value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} autoComplete="family-name" /></label>
          <label className="block"><span className={label} style={labelStyle}>Email</span><input className="form-field" type="email" inputMode="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" /></label>
          <label className="block"><span className={label} style={labelStyle}>{isEs ? 'Celular' : 'Cell'}</span><input className="form-field" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(239) 555-0134" autoComplete="tel" /></label>
        </div>
        {data.ships && (
          <div className="grid gap-3 sm:grid-cols-2">
            <span className={label} style={{ ...labelStyle, gridColumn: '1 / -1', margin: '0.4rem 0 0' }}>{isEs ? 'Enviar a' : 'Ship to'}</span>
            <label className="block sm:col-span-2"><span className={label} style={labelStyle}>{isEs ? 'Dirección' : 'Street'}</span><input className="form-field" value={form.address_line1} onChange={(e) => set({ address_line1: e.target.value })} autoComplete="address-line1" /></label>
            <label className="block sm:col-span-2"><span className={label} style={labelStyle}>{isEs ? 'Apto / suite (opcional)' : 'Apt / suite (optional)'}</span><input className="form-field" value={form.address_line2} onChange={(e) => set({ address_line2: e.target.value })} autoComplete="address-line2" /></label>
            <label className="block"><span className={label} style={labelStyle}>{isEs ? 'Ciudad' : 'City'}</span><input className="form-field" value={form.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" /></label>
            <div className="grid gap-3 grid-cols-[1fr_1.3fr]">
              <label className="block"><span className={label} style={labelStyle}>{isEs ? 'Estado' : 'State'}</span><input className="form-field" value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="FL" autoComplete="address-level1" autoCapitalize="characters" /></label>
              <label className="block"><span className={label} style={labelStyle}>ZIP</span><input className="form-field" inputMode="numeric" value={form.postal_code} onChange={(e) => set({ postal_code: e.target.value })} autoComplete="postal-code" /></label>
            </div>
            <span className="text-xs sm:col-span-2" style={hintStyle}>{isEs ? 'Solo direcciones de EE. UU.' : 'U.S. addresses only.'}</span>
          </div>
        )}
      </section>

      <section className="rounded-[1.25rem] border p-5 grid gap-2.5" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
        <div className="flex justify-between text-sm"><span>{isEs ? `Artículos · ${data.items.length}` : `Items · ${data.items.length}`}</span><span>{formatCheckoutCurrency(totals.subtotal)}</span></div>
        {data.ships && <div className="flex justify-between text-sm"><span>{data.shippingLabel}</span><span>{formatCheckoutCurrency(totals.shippingFee)}</span></div>}
        {data.taxExempt && (
          <div className="text-sm" style={{ borderLeft: '3px solid #d4af37', background: '#fbf7e8', padding: '0.6rem 0.8rem', borderRadius: 10 }}>
            <strong>{isEs ? 'Venta exenta de impuesto.' : 'Tax-exempt sale.'}</strong>{' '}
            {isEs
              ? `El certificado de Florida ${data.taxExempt.tag}${data.taxExempt.businessName ? ` de ${data.taxExempt.businessName}` : ''} está registrado, así que no se cobra impuesto.`
              : `Florida certificate ${data.taxExempt.tag}${data.taxExempt.businessName ? ` for ${data.taxExempt.businessName}` : ''} is on file, so no sales tax is charged.`}
          </div>
        )}
        <div className="flex justify-between text-sm gap-3">
          {data.taxExempt ? (
            <span>{isEs ? 'Impuesto de FL · ' : 'FL sales tax · '}<strong style={{ color: '#16653c' }}>{isEs ? 'exento' : 'exempt'}</strong></span>
          ) : (
          <span>
            {isEs ? 'Impuesto de FL' : 'FL sales tax'}{totals.tax > 0 ? ` · ${FL_TAX_RATE_LABEL}` : ''}
            {data.ships && totals.tax === 0 && <span className="text-xs" style={hintStyle}>{isEs ? ` · ninguno fuera de Florida` : ' · none outside Florida'}</span>}
            {data.ships && !stateCode && <span className="text-xs" style={hintStyle}>{isEs ? ' · sale del total fuera de Florida' : ' · comes off outside Florida'}</span>}
          </span>
          )}
          <span>{formatCheckoutCurrency(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t pt-3 text-2xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)' }}>
          <span>Total</span><span>{formatCheckoutCurrency(totals.total)}</span>
        </div>
        {paypalClientId ? (
          <PayPalCheckoutButton
            clientId={paypalClientId}
            amount={totals.total}
            ready={missing.length === 0}
            isEs={isEs}
            missingFields={missing}
            needsInfoConfirmation={false}
            createOrderUrl={`/api/pay/${encodeURIComponent(data.token)}/create-order`}
            cancelOnAbandon={false}
            getPayload={() => ({
              items: [{ id: data.token, quantity: 1 }],
              customer: { ...form },
              shippingMethod: data.ships ? 'shipping' : 'pickup',
              orderId: null,
              locale,
            })}
            onOrderId={() => {}}
            onSuccess={(result) => { setPaid({ orderNumber: result.orderNumber }); window.scrollTo({ top: 0 }); }}
          />
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>{isEs ? 'El pago en línea no está disponible ahora. Llámenos al (239) 404-8505.' : 'Online payment is not available right now. Call (239) 404-8505.'}</p>
        )}
        <span className="text-xs text-center" style={hintStyle}>{isEs ? 'Pago seguro a través de PayPal. Nunca vemos el número de su tarjeta.' : 'Secure checkout through PayPal. We never see your card number.'}</span>
      </section>

      {data.otherWays.length > 0 && (
        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-1 text-sm" style={cardStyle}>
          <strong>{isEs ? 'Otras formas de pagar' : 'Other ways to pay'}</strong>
          {data.otherWays.map((line) => <span key={line} style={hintStyle}>{line}</span>)}
        </section>
      )}
    </div>
  );
}
