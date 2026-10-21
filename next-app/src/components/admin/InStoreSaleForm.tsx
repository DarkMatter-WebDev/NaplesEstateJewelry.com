'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product, SpotData } from '@/types/product';
import { formatCurrency } from '@/types/sales';
import { getProductImages, getSnapshotPrice } from '@/lib/sales';
import {
  IN_STORE_METALS,
  IN_STORE_PAYMENT_LABELS,
  IN_STORE_PAYMENT_METHODS,
  IN_STORE_SHIPPING_CHOICES,
  IN_STORE_SHIPPING_FEE_MAX,
  IN_STORE_SHIPPING_LABELS,
  IN_STORE_TITLE_MAX,
  inStoreChargesTax,
  inStoreTableShippingFee,
  inStoreTotals,
  parseInStorePrice,
  parseInStoreShippingFee,
  type InStoreMetal,
  type InStorePaymentMethod,
  type InStoreShippingChoice,
} from '@/lib/in-store-sale';
import { normalizeUsState } from '@/lib/us-address';

/** The columns the page loads for the search list — enough to price and describe a row. */
export type InStoreProduct = Pick<
  Product,
  | 'id' | 'title' | 'status' | 'quantity' | 'inventory_number' | 'category' | 'metal_variant' | 'purity'
  | 'gram_weight' | 'weight_grams' | 'price_mode' | 'pricing_multiplier' | 'manual_price_label' | 'asking_price'
  | 'sold_price' | 'image_urls' | 'images'
>;

type Mode = 'listed' | 'unlisted';
type DeliveryMethod = 'pickup' | 'ship';

type Recorded = {
  orderId: string;
  orderNumber: string;
  receiptEmailed: boolean;
  summary: string;
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

const MAX_MATCHES = 6;

function matchesQuery(product: InStoreProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const number = product.inventory_number != null ? String(product.inventory_number) : '';
  if (/^#?\d+$/.test(q)) return number === q.replace('#', '');
  return product.title.toLowerCase().includes(q) || number === q;
}

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
  const [mode, setMode] = useState<Mode>('listed');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<InStoreProduct | null>(null);
  const [title, setTitle] = useState('');
  const [metal, setMetal] = useState<InStoreMetal>('Gold');
  const [gramWeight, setGramWeight] = useState('');
  const [purity, setPurity] = useState('');
  const [price, setPrice] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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

  const matches = useMemo(
    () => (selected ? [] : products.filter((p) => matchesQuery(p, query)).slice(0, MAX_MATCHES)),
    [products, query, selected],
  );

  const priceValue = parseInStorePrice(price);
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

  function pickProduct(product: InStoreProduct) {
    setSelected(product);
    setQuery('');
    setPrice(String(getSnapshotPrice(product as Product, spotData) || ''));
  }

  function clearAll() {
    setSelected(null); setQuery(''); setTitle(''); setMetal('Gold'); setGramWeight(''); setPurity(''); setPrice('');
    setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setPaidBy('zettle'); setNote('');
    setDelivery('pickup'); setMailingOn(false); setLine1(''); setLine2(''); setCity(''); setShipState(''); setZip('');
    setShipping('insured'); setCustomFee('');
    setError(null); setRecorded(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (mode === 'listed' && !selected) { setError('Pick the listed item first.'); return; }
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
          item: mode === 'listed'
            ? { kind: 'listed', productId: selected?.id, price }
            : { kind: 'unlisted', title, metal, price, gramWeight, purity },
          customer: { firstName, lastName, phone, email },
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
        summary: mode === 'listed' && selected ? `#${selected.inventory_number ?? '—'} · ${selected.title}` : title,
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
          <div className="flex justify-between gap-3"><span style={hintStyle}>Item</span><span className="text-right">{recorded.summary}</span></div>
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
          {!recorded.receiptEmailed && <span className="text-xs" style={hintStyle}>Open the order to add an email and send it later.</span>}
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
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>1. Item</h2>
            <div className="inline-flex rounded-full border p-[3px] gap-[3px]" role="group" aria-label="Item source" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
              {(['listed', 'unlisted'] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMode(value); setError(null); }}
                  aria-pressed={mode === value}
                  className="rounded-full px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.12em]"
                  style={{ fontFamily: 'var(--font-label)', background: mode === value ? '#fff' : 'transparent', color: mode === value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', boxShadow: mode === value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
                >
                  {value === 'listed' ? 'Listed item' : 'Not listed'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'listed' ? (
            <>
              <label className="block">
                <span className={label} style={labelStyle}>Find by inventory # or title</span>
                <input className="form-field" type="search" inputMode="search" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="53 or ladle" autoComplete="off" />
              </label>
              {matches.length > 0 && (
                <ul className="grid gap-1" aria-label="Matches">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pickProduct(p)} className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-[var(--color-surface-container-low)]" style={cardStyle}>
                        <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>#{p.inventory_number ?? '—'}</span> · {p.title}
                        <span className="block text-xs" style={hintStyle}>{formatCurrency(getSnapshotPrice(p as Product, spotData))} · {p.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && !selected && matches.length === 0 && (
                <span className="text-xs" style={hintStyle}>No available item matches. Sold or hidden items do not show here.</span>
              )}
              {selected && (
                <div className="flex gap-3 items-center rounded-[14px] border p-3" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
                  {getProductImages(selected as Product)[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getProductImages(selected as Product)[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex-shrink-0" style={{ background: 'var(--color-surface-container-high)' }} />
                  )}
                  <div className="min-w-0 grid gap-0.5">
                    <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>#{selected.inventory_number ?? '—'} · {selected.category} · In stock</span>
                    <span className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-on-surface)' }}>{selected.title}</span>
                    <span className="text-xs" style={hintStyle}>Listed at {formatCurrency(getSnapshotPrice(selected as Product, spotData))} · marketplace listings end on save</span>
                  </div>
                  <button type="button" className="ml-auto text-xs underline flex-shrink-0" style={hintStyle} onClick={() => { setSelected(null); setPrice(''); }}>Change</button>
                </div>
              )}
              <label className="block">
                <span className={label} style={labelStyle}>Price sold (before tax)</span>
                <input className="form-field text-xl font-semibold" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1026" required />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className={label} style={labelStyle}>What sold</span>
                <input className="form-field" value={title} maxLength={IN_STORE_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="14K rope chain · 22 in · 18.4 g" required />
              </label>
              <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
                <label className="block">
                  <span className={label} style={labelStyle}>Metal</span>
                  <select className="form-field" value={metal} onChange={(e) => setMetal(e.target.value as InStoreMetal)}>
                    {IN_STORE_METALS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={label} style={labelStyle}>Price (before tax)</span>
                  <input className="form-field text-xl font-semibold" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1460" required />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={label} style={labelStyle}>Weight g<Optional /></span>
                  <input className="form-field" inputMode="decimal" value={gramWeight} onChange={(e) => setGramWeight(e.target.value)} placeholder="18.4" />
                </label>
                <label className="block">
                  <span className={label} style={labelStyle}>Purity<Optional /></span>
                  <input className="form-field" value={purity} maxLength={20} onChange={(e) => setPurity(e.target.value)} placeholder="14K" />
                </label>
              </div>
              <span className="text-xs" style={hintStyle}>Recorded on the order only. No product is created, so nothing can show in the shop.</span>
            </>
          )}
        </section>

        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>2. Customer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label} style={labelStyle}>First name</span><input className="form-field" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" required /></label>
            <label className="block"><span className={label} style={labelStyle}>Last name</span><input className="form-field" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" required /></label>
            <label className="block"><span className={label} style={labelStyle}>Cell</span><input className="form-field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(239) 555-0134" autoComplete="off" required /></label>
            <label className="block">
              <span className={label} style={labelStyle}>Email<Optional /></span>
              <input className="form-field" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
              <span className="mt-1 block text-xs" style={hintStyle}>{shipped ? 'The receipt and the tracking email go here.' : 'The receipt is emailed when this is filled in.'}</span>
            </label>
          </div>
        </section>

        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>3. Pickup or ship</h2>
            <div className="inline-flex rounded-full border p-[3px] gap-[3px]" role="group" aria-label="Pickup or ship" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
              {(['pickup', 'ship'] as DeliveryMethod[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setDelivery(value); setError(null); }}
                  aria-pressed={delivery === value}
                  className="rounded-full px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.12em]"
                  style={{ fontFamily: 'var(--font-label)', background: delivery === value ? '#fff' : 'transparent', color: delivery === value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', boxShadow: delivery === value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
                >
                  {value === 'pickup' ? 'Pickup' : 'Ship'}
                </button>
              ))}
            </div>
          </div>

          {shipped ? (
            <span className="text-[0.85rem]" style={hintStyle}>
              You ship it after the sale. The order waits under <strong>Orders → Fulfillment: Pending</strong> until you mark it shipped.
            </span>
          ) : (
            <>
              <span className="text-[0.85rem]" style={hintStyle}>The customer leaves with it. Recorded as <strong>picked up</strong>, as before.</span>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit">
                <input type="checkbox" checked={mailingOn} onChange={(e) => setMailingOn(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: 'var(--color-primary)' }} />
                Add a mailing address<span className="text-xs" style={hintStyle}>optional</span>
              </label>
            </>
          )}

          {showAddress && (
            <div className="grid gap-3 sm:grid-cols-2">
              <span className={label} style={{ ...labelStyle, gridColumn: '1 / -1', margin: 0 }}>{shipped ? 'Ship to' : 'Mailing address'}</span>
              <label className="block sm:col-span-2"><span className={label} style={labelStyle}>Street</span><input className="form-field" value={line1} maxLength={120} onChange={(e) => setLine1(e.target.value)} autoComplete="off" required={shipped} /></label>
              <label className="block sm:col-span-2"><span className={label} style={labelStyle}>Apt / suite<Optional /></span><input className="form-field" value={line2} maxLength={60} onChange={(e) => setLine2(e.target.value)} autoComplete="off" /></label>
              <label className="block"><span className={label} style={labelStyle}>City</span><input className="form-field" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} autoComplete="off" required={shipped} /></label>
              <div className="grid gap-3 grid-cols-[1fr_1.3fr]">
                <label className="block"><span className={label} style={labelStyle}>State</span><input className="form-field" value={shipState} maxLength={20} onChange={(e) => setShipState(e.target.value)} placeholder="FL" autoComplete="off" autoCapitalize="characters" required={shipped} /></label>
                <label className="block"><span className={label} style={labelStyle}>ZIP</span><input className="form-field" inputMode="numeric" value={zip} maxLength={10} onChange={(e) => setZip(e.target.value)} placeholder="34103" autoComplete="off" required={shipped} /></label>
              </div>
              <span className="text-xs sm:col-span-2" style={hintStyle}>U.S. addresses only, checked the same way as web checkout.{shipped ? '' : ' Saved on the order only — never added to a mailing list.'}</span>
            </div>
          )}

          {shipped && (
            <div className="grid gap-2">
              <span className={label} style={{ ...labelStyle, margin: 0 }}>Shipping charge</span>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2" role="group" aria-label="Shipping charge">
                {IN_STORE_SHIPPING_CHOICES.map((choice) => {
                  const on = shipping === choice;
                  const fee = choice === 'custom' ? null : priceValue != null ? inStoreTableShippingFee(choice, priceValue) : null;
                  const unavailable = choice === 'express' && priceValue != null && fee == null;
                  return (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setShipping(choice)}
                      disabled={unavailable}
                      aria-pressed={on}
                      className="rounded-full border px-4 py-2 text-[0.7rem] font-bold uppercase tracking-[0.08em] disabled:opacity-40"
                      style={{ fontFamily: 'var(--font-label)', borderColor: on ? 'var(--color-primary)' : 'var(--color-outline-variant)', background: on ? '#fbf5dd' : '#fff', color: on ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
                    >
                      {IN_STORE_SHIPPING_LABELS[choice]}
                      <span className="block text-[0.72rem] font-semibold normal-case tracking-[0.04em]">
                        {choice === 'custom' ? 'Type it' : unavailable ? 'Not at $5,000+' : fee != null ? formatCurrency(fee) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {shipping === 'custom' && (
                <label className="block sm:max-w-[12rem]">
                  <span className={label} style={labelStyle}>Shipping charge $</span>
                  <input className="form-field text-lg font-semibold" inputMode="decimal" value={customFee} onChange={(e) => setCustomFee(e.target.value)} placeholder="25" autoComplete="off" required />
                </label>
              )}
              <span className="text-xs" style={hintStyle}>
                {shipping === 'custom'
                  ? `Any amount up to ${formatCurrency(IN_STORE_SHIPPING_FEE_MAX)}.`
                  : `The website's own shipping fees${priceValue != null ? ` for a ${formatCurrency(priceValue)} item` : ''}. Express is not offered at $5,000 and up, the same as online.`}
              </span>
            </div>
          )}
        </section>

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
          <div className="flex justify-between text-sm"><span>Item</span><span>{priceValue != null ? formatCurrency(priceValue) : '—'}</span></div>
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
            {paidBy === 'zettle' && totals ? <>Collect <strong>{formatCurrency(totals.total)}</strong> on Zettle before recording.</> : 'Recording does not take a payment — the money is already in hand.'}
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
              An order like any web sale, marked paid and <strong>waiting to ship</strong>. A listed item is marked sold and its eBay/Etsy listings end on the next sweep. The receipt shows the Ship-to address. When you mark it <strong>Shipped</strong> in Orders and add the tracking number, the customer gets the &ldquo;Your order has shipped&rdquo; email.
            </span>
          ) : (
            <span className="text-xs" style={hintStyle}>
              An order like any web sale, marked paid and picked up. A listed item is marked sold and its eBay/Etsy listings end on the next sweep. The receipt goes out when an email is given, and the sale shows under Orders.
            </span>
          )}
        </section>
      </div>
    </form>
  );
}
