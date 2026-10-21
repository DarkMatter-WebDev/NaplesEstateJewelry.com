'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SpotData } from '@/types/product';
import { formatCurrency } from '@/types/sales';
import {
  IN_STORE_PAYMENT_LABELS,
  IN_STORE_PAYMENT_METHODS,
  IN_STORE_SHIPPING_LABELS,
  inStoreChargesTax,
  inStoreTableShippingFee,
  inStoreTotals,
  parseInStorePrice,
  parseInStoreShippingFee,
  type InStorePaymentMethod,
  type InStoreShippingChoice,
} from '@/lib/in-store-sale';
import { round2 } from '@/lib/checkout-pricing';
import { normalizeUsState } from '@/lib/us-address';
import SaleItemsEditor, {
  newSaleItem,
  saleItemLabel,
  saleItemPayload,
  saleItemsProblem,
  type InStoreProduct,
  type SaleItemDraft,
} from '@/components/admin/instant-sale/SaleItemsEditor';

import SaleDeliverySection, { type DeliveryMethod } from '@/components/admin/instant-sale/SaleDeliverySection';

export type { InStoreProduct } from '@/components/admin/instant-sale/SaleItemsEditor';

type Recorded = {
  orderId: string;
  orderNumber: string;
  receiptEmailed: boolean;
  /** Was "Email copy" ticked (with an email)? */
  emailCopy: boolean;
  summary: string[];
  total: number;
  paidBy: InStorePaymentMethod;
  customer: string;
  /** Shipped sales only: the address lines and the charge chosen. */
  shipTo: { lines: string[]; shipping: string } | null;
};

const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

function Optional() {
  return <span style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.06em' }}> optional</span>;
}

export default function InStoreSaleForm({
  adminBasePath,
  products,
  spotData,
}: {
  adminBasePath: string;
  products: InStoreProduct[];
  spotData: SpotData | null;
}) {
  const [items, setItems] = useState<SaleItemDraft[]>(() => [newSaleItem()]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // "Email copy" (owner, 2026-10-21): ticks itself when an email is typed in;
  // unticking it keeps the email on the order but sends no receipt now.
  const [emailCopy, setEmailCopy] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryMethod>('pickup');
  const [mailingOn, setMailingOn] = useState(false);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [zip, setZip] = useState('');
  const [shipping, setShipping] = useState<InStoreShippingChoice>('insured');
  const [customFee, setCustomFee] = useState('');
  const [paidBy, setPaidBy] = useState<InStorePaymentMethod>('zettle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Recorded | null>(null);

  const prices = items.map((item) => parseInStorePrice(item.price));
  // The items' total — every price typed — is what the shipping table and the tax go by.
  const priceValue = prices.every((value) => value != null) ? round2(prices.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  const subtotal = priceValue;
  const shipped = delivery === 'ship';
  const showAddress = shipped || mailingOn;
  const stateCode = normalizeUsState(shipState);
  // Same rules the route records with (lib/in-store-sale.ts). Until a valid
  // state is typed a shipment is shown taxed, so the total never drops on a typo.
  const chargesTax = shipped && stateCode ? inStoreChargesTax('ship', stateCode) : true;
  const shippingFee = !shipped
    ? 0
    : shipping === 'custom'
      ? parseInStoreShippingFee(customFee)
      : priceValue != null ? inStoreTableShippingFee(shipping, priceValue) : null;
  const totals = priceValue != null && shippingFee != null
    ? inStoreTotals(priceValue, { shippingFee, chargesTax })
    : null;

  function changeEmail(next: string) {
    if (!email.trim() && next.trim()) setEmailCopy(true);
    if (!next.trim()) setEmailCopy(false);
    setEmail(next);
  }

  function clearAll() {
    setItems([newSaleItem()]);
    setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setEmailCopy(false); setPaidBy('zettle'); setNote('');
    setDelivery('pickup'); setMailingOn(false); setLine1(''); setLine2(''); setCity(''); setShipState(''); setZip('');
    setShipping('insured'); setCustomFee('');
    setError(null); setRecorded(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const problem = saleItemsProblem(items);
    if (problem) { setError(problem.charAt(0).toUpperCase() + problem.slice(1)); return; }
    if (priceValue == null) { setError('Enter the price sold, e.g. 1460.'); return; }
    if (!totals) {
      setError(shipping === 'custom' ? 'Enter the shipping charge, e.g. 25.' : 'Express overnight is not offered at $5,000 and up. Pick another shipping charge.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/in-store-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(saleItemPayload),
          customer: { firstName, lastName, phone, email },
          emailCopy: emailCopy && Boolean(email.trim()),
          delivery: {
            method: delivery,
            address: showAddress ? { line1, line2, city, state: shipState, postalCode: zip } : null,
            shipping,
            shippingFee: customFee,
          },
          paidBy,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not record the sale.'); return; }
      setRecorded({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        receiptEmailed: Boolean(data.receiptEmailed),
        emailCopy: emailCopy && Boolean(email.trim()),
        summary: items.map((item) => (item.mode === 'listed' && item.selected ? `#${item.selected.inventory_number ?? '—'} · ${item.selected.title}` : saleItemLabel(item))),
        total: totals.total,
        paidBy,
        customer: `${firstName.trim()} ${lastName.trim()} · ${phone.trim()}`,
        shipTo: data.shipped
          ? {
            lines: [
              [line1.trim(), line2.trim()].filter(Boolean).join(', '),
              `${city.trim()}, ${stateCode ?? shipState.trim()} ${zip.trim()}`,
            ],
            shipping: shipping === 'none' ? 'No shipping charge' : `${IN_STORE_SHIPPING_LABELS[shipping]} · ${formatCurrency(totals.shippingFee)}`,
          }
          : null,
      });
    } catch {
      setError('Could not reach the server. Nothing was recorded — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (recorded) {
    return (
      <div className="max-w-md mx-auto grid gap-4" role="status">
        <div className="text-center grid gap-2 justify-items-center pt-2">
          <span className="w-14 h-14 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Sale recorded</h2>
          <span className="text-xs" style={hintStyle}>Order <strong>{recorded.orderNumber}</strong></span>
        </div>
        <div className="rounded-[1.25rem] border bg-white p-5 grid gap-2 text-sm" style={cardStyle}>
          <div className="flex justify-between gap-3">
            <span style={hintStyle}>{recorded.summary.length > 1 ? `Items · ${recorded.summary.length}` : 'Item'}</span>
            <span className="text-right">{recorded.summary.map((line, index) => <span key={`${index}-${line}`} className="block">{line}</span>)}</span>
          </div>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Customer</span><span className="text-right">{recorded.customer}</span></div>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Paid by</span><span>{IN_STORE_PAYMENT_LABELS[recorded.paidBy]}</span></div>
          {recorded.shipTo && (
            <div className="flex justify-between gap-3">
              <span style={hintStyle}>Ship to</span>
              <span className="text-right">
                {recorded.shipTo.lines.map((line) => <span key={line} className="block">{line}</span>)}
                <span className="block font-bold" style={{ color: 'var(--color-primary)' }}>{recorded.shipTo.shipping} · waiting to ship</span>
              </span>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t pt-3 text-xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)' }}><span>Total</span><span>{formatCurrency(recorded.total)}</span></div>
        </div>
        <div className="rounded-[1.25rem] border bg-white p-5 grid gap-2 text-sm" style={cardStyle}>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Receipt</span><span className="font-bold" style={{ color: recorded.receiptEmailed ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>{recorded.receiptEmailed ? 'Emailed' : 'Not emailed'}</span></div>
          {!recorded.receiptEmailed && (
            <span className="text-xs" style={hintStyle}>
              {recorded.emailCopy ? 'The receipt did not send. Open the order to send it again.' : 'Open the order to send the receipt later.'}
            </span>
          )}
        </div>
        <div className="grid gap-2 pt-1">
          <button type="button" className="gold-button text-xs" onClick={clearAll}>New sale</button>
          <Link href={`${adminBasePath}/orders/${recorded.orderId}`} className="outline-button text-xs">
            {recorded.shipTo ? 'Open order to ship it' : `Open order ${recorded.orderNumber}`}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.25fr_1fr] items-start">
      <div className="grid gap-4">
        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>1. Items</h2>
            {items.length > 1 && (
              <span className="text-xs" style={hintStyle}>{items.length} items{subtotal != null ? ` · ${formatCurrency(subtotal)}` : ''}</span>
            )}
          </div>
          <SaleItemsEditor
            items={items}
            setItems={setItems}
            products={products}
            spotData={spotData}
            priceLabel="Price sold (before tax)"
            listedNote="marketplace listings end on save"
          />
        </section>

        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>2. Customer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label} style={labelStyle}>First name</span><input className="form-field" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" required /></label>
            <label className="block"><span className={label} style={labelStyle}>Last name</span><input className="form-field" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" required /></label>
            <label className="block"><span className={label} style={labelStyle}>Cell</span><input className="form-field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(239) 555-0134" autoComplete="off" required /></label>
            <div className="block">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="in-store-email" className={label} style={{ ...labelStyle, margin: 0 }}>Email<Optional /></label>
                <label className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer" style={{ color: 'var(--color-on-surface)', opacity: email.trim() ? 1 : 0.45 }}>
                  <input
                    type="checkbox"
                    checked={emailCopy && Boolean(email.trim())}
                    disabled={!email.trim()}
                    onChange={(e) => setEmailCopy(e.target.checked)}
                    aria-label="Email a copy of the receipt to the customer"
                    className="w-[17px] h-[17px]"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  Email copy
                </label>
              </div>
              <input id="in-store-email" className="form-field mt-[0.3rem]" inputMode="email" value={email} onChange={(e) => changeEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
              <span className="mt-1 block text-xs" style={hintStyle}>
                {!email.trim()
                  ? 'Type an email to send the receipt.'
                  : emailCopy
                    ? (shipped ? 'The receipt is emailed when you record the sale; the tracking email goes here too.' : 'The receipt is emailed when you record the sale.')
                    : (shipped ? 'No receipt now — you can send it from the order. The tracking email still goes here.' : 'No receipt is emailed. You can send it later from the order.')}
              </span>
            </div>
          </div>
        </section>

        <SaleDeliverySection
          variant="in-store"
          delivery={delivery}
          onDelivery={(value) => { setDelivery(value); setError(null); }}
          mailingOn={mailingOn}
          onMailingOn={setMailingOn}
          address={{ line1, line2, city, state: shipState, zip }}
          onAddress={(patch) => {
            if (patch.line1 !== undefined) setLine1(patch.line1);
            if (patch.line2 !== undefined) setLine2(patch.line2);
            if (patch.city !== undefined) setCity(patch.city);
            if (patch.state !== undefined) setShipState(patch.state);
            if (patch.zip !== undefined) setZip(patch.zip);
          }}
          shipping={shipping}
          onShipping={setShipping}
          customFee={customFee}
          onCustomFee={setCustomFee}
          priceValue={priceValue}
          itemCount={items.length}
        />

        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>4. Paid by</h2>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2" role="group" aria-label="Paid by">
            {IN_STORE_PAYMENT_METHODS.map((method) => {
              const on = paidBy === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaidBy(method)}
                  aria-pressed={on}
                  className="rounded-full border px-4 py-2.5 text-[0.7rem] font-bold uppercase tracking-[0.08em]"
                  style={{ fontFamily: 'var(--font-label)', borderColor: on ? 'var(--color-primary)' : 'var(--color-outline-variant)', background: on ? '#fbf5dd' : '#fff', color: on ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
                >
                  {IN_STORE_PAYMENT_LABELS[method]}
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className={label} style={labelStyle}>Note<Optional /></span>
            <input className="form-field" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Traded in a ring, $200 credit applied" />
          </label>
        </section>
      </div>

      <div className="grid gap-4 lg:sticky lg:top-6">
        <section className="rounded-[1.25rem] border p-5 grid gap-3" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Total</h2>
          {items.length > 1 && items.map((item, index) => (
            <div key={item.key} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{index + 1} · {saleItemLabel(item)}</span>
              <span>{prices[index] != null ? formatCurrency(prices[index] as number) : '—'}</span>
            </div>
          ))}
          <div className={`flex justify-between text-sm${items.length > 1 ? ' border-t border-dashed pt-2' : ''}`} style={items.length > 1 ? cardStyle : undefined}>
            <span>{items.length > 1 ? `Items · ${items.length}` : 'Item'}</span>
            <span>{priceValue != null ? formatCurrency(priceValue) : '—'}</span>
          </div>
          {shipped && (
            <div className="flex justify-between text-sm">
              <span>{shipping === 'none' ? 'Shipping · no charge' : `Shipping · ${shipping === 'custom' ? 'custom' : IN_STORE_SHIPPING_LABELS[shipping].replace(' shipping', '')}`}</span>
              <span>{shippingFee != null ? formatCurrency(shippingFee) : '—'}</span>
            </div>
          )}
          <div className="flex justify-between text-sm gap-3">
            <span>
              {chargesTax ? 'FL sales tax · 6%' : 'FL sales tax'}
              {shipped && (
                <span className="text-xs" style={hintStyle}>
                  {chargesTax ? (shippingFee ? ' (item + shipping)' : '') : ` · none, ships to ${stateCode}`}
                </span>
              )}
            </span>
            <span>{totals ? formatCurrency(totals.tax) : '—'}</span>
          </div>
          <div className="flex justify-between border-t pt-3 text-2xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)' }}><span>Total</span><span>{totals ? formatCurrency(totals.total) : '—'}</span></div>
          <span className="text-xs" style={hintStyle}>
            {paidBy === 'zettle' && totals
              ? <>Collect <strong>{formatCurrency(totals.total)}</strong> on Zettle before recording.</>
              : paidBy === 'store_credit'
                ? 'Recording does not take a payment — the customer’s store credit covers it.'
                : 'Recording does not take a payment — the money is already in hand.'}
          </span>
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" role="alert" style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>{error}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" className="outline-button text-xs" onClick={clearAll} disabled={busy}>Clear</button>
            <button type="submit" className="gold-button text-xs flex-1" disabled={busy}>{busy ? 'Recording…' : totals ? `Record sale · ${formatCurrency(totals.total)}` : 'Record sale'}</button>
          </div>
        </section>
        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-2" style={cardStyle}>
          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>On record</h2>
          {shipped ? (
            <span className="text-xs" style={hintStyle}>
              An order like any web sale, marked paid and <strong>waiting to ship</strong>. Listed items are marked sold and their eBay/Etsy listings end on the next sweep. The receipt shows the Ship-to address. When you mark it <strong>Shipped</strong> in Orders and add the tracking number, the customer gets the &ldquo;Your order has shipped&rdquo; email.
            </span>
          ) : (
            <span className="text-xs" style={hintStyle}>
              An order like any web sale, marked paid and picked up. Listed items are marked sold and their eBay/Etsy listings end on the next sweep. The receipt goes out when Email copy is ticked, and the sale shows under Orders.
            </span>
          )}
        </section>
      </div>
    </form>
  );
}
