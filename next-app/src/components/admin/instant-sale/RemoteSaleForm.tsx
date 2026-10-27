'use client';

import { useState } from 'react';
import TaxExemptSaleBox, {
  newTaxExemptBox,
  taxExemptApplies,
  taxExemptPayload,
  taxExemptProblem,
} from '@/components/admin/instant-sale/TaxExemptSaleBox';
import Link from 'next/link';
import type { SpotData } from '@/types/product';
import { formatCurrency } from '@/types/sales';
import { round2 } from '@/lib/checkout-pricing';
import {
  IN_STORE_SHIPPING_LABELS,
  inStoreTableShippingFee,
  parseInStorePrice,
  parseInStoreShippingFee,
  type InStoreShippingChoice,
} from '@/lib/in-store-sale';
import {
  CHECK_PAYABLE_TO,
  PAY_BY_PHONE,
  REMOTE_LINK_DAYS,
  REMOTE_LINK_DAYS_DEFAULT,
  REMOTE_MESSAGE_MAX,
  ZELLE_PAY_TO,
  remoteTotals,
  type RemoteDraftForm,
  type RemoteInvoiceCardData,
  type RemoteLinkDays,
} from '@/lib/remote-sale';
import { normalizeUsState } from '@/lib/us-address';
import SaleItemsEditor, { newSaleItem, saleItemLabel, saleItemPayload, saleItemsProblem, type InStoreProduct, type SaleItemDraft } from './SaleItemsEditor';
import SaleDeliverySection, { EMPTY_SALE_ADDRESS, type DeliveryMethod, type SaleAddressDraft } from './SaleDeliverySection';
import RemoteInvoiceCard from './RemoteInvoiceCard';

const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

function Optional() {
  return <span style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.06em' }}> optional</span>;
}

/** A stored draft's items → the editor's cards; a listed piece no longer for sale comes back unpicked. */
function itemsFromDraft(form: RemoteDraftForm | null, products: InStoreProduct[]): { items: SaleItemDraft[]; gone: number[] } {
  if (!form || form.items.length === 0) return { items: [newSaleItem()], gone: [] };
  const gone: number[] = [];
  const items = form.items.map((item, index) => {
    const selected = item.mode === 'listed' && item.productId ? products.find((p) => p.id === item.productId) ?? null : null;
    if (item.mode === 'listed' && item.productId && !selected) gone.push(index + 1);
    return {
      ...newSaleItem(),
      mode: item.mode,
      selected,
      title: item.title,
      metal: item.metal,
      gramWeight: item.gramWeight,
      purity: item.purity,
      price: selected || item.mode === 'unlisted' ? item.price : '',
      photoUrl: item.photoUrl,
    };
  });
  return { items, gone };
}

function savedAtLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

/**
 * Admin → Instant Sale → Remote sale (owner, mockup v2, 2026-10-21): the
 * items, what is known about the customer, pickup or ship, the ways to pay —
 * then "Email invoice". The invoice becomes an unpaid order at once; the
 * customer pays through the private link (PayPal or card) or by Zelle / check
 * (then "Record payment" on its card). Rules: `lib/remote-sale.ts`.
 */
export default function RemoteSaleForm({
  adminBasePath,
  products,
  spotData,
  draft = null,
  draftMissing = false,
}: {
  adminBasePath: string;
  products: InStoreProduct[];
  spotData: SpotData | null;
  /** "Continue" on a saved draft (owner, 2026-10-21 "Save draft"). */
  draft?: { id: string; form: RemoteDraftForm; updatedAt: string } | null;
  /** `?draft=` named a draft that no longer exists (sent or deleted). */
  draftMissing?: boolean;
}) {
  const start = draft?.form ?? null;
  const [restored] = useState(() => itemsFromDraft(start, products));
  const [items, setItems] = useState<SaleItemDraft[]>(restored.items);
  const [firstName, setFirstName] = useState(start?.customer.firstName ?? '');
  const [lastName, setLastName] = useState(start?.customer.lastName ?? '');
  const [email, setEmail] = useState(start?.customer.email ?? '');
  const [phone, setPhone] = useState(start?.customer.phone ?? '');
  const [delivery, setDelivery] = useState<DeliveryMethod>(start?.delivery.method ?? 'pickup');
  const [mailingOn, setMailingOn] = useState(start?.delivery.mailingOn ?? false);
  const [address, setAddress] = useState<SaleAddressDraft>(start?.delivery.address ?? EMPTY_SALE_ADDRESS);
  const [shipping, setShipping] = useState<InStoreShippingChoice>(start?.delivery.shipping ?? 'insured');
  const [customFee, setCustomFee] = useState(start?.delivery.customFee ?? '');
  const [payOnline, setPayOnline] = useState(start?.pay.online ?? true);
  const [payZelle, setPayZelle] = useState(start?.pay.zelle ?? true);
  const [payCheck, setPayCheck] = useState(start?.pay.check ?? false);
  const [payPhone, setPayPhone] = useState(start?.pay.phone ?? false);
  const [linkDays, setLinkDays] = useState<RemoteLinkDays>(start?.linkDays ?? REMOTE_LINK_DAYS_DEFAULT);
  const [message, setMessage] = useState(start?.message ?? '');
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(draft?.updatedAt ?? null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftNote, setDraftNote] = useState<{ text: string; ok: boolean } | null>(
    draftMissing
      ? { text: 'That draft is gone — it was sent or deleted. This is a new remote sale.', ok: false }
      : restored.gone.length > 0
        ? { text: `Item ${restored.gone.join(', ')}: the listed piece is no longer for sale — pick another or remove it.`, ok: false }
        : null,
  );
  // "Tax-exempt sale" (owner, 2026-10-27). Not kept in a saved draft: tick it when sending.
  const [taxBox, setTaxBox] = useState(newTaxExemptBox);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ invoice: RemoteInvoiceCardData; emailed: boolean; emailError: string | null } | null>(null);

  const prices = items.map((item) => parseInStorePrice(item.price));
  const priceValue = prices.every((value) => value != null) ? round2(prices.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  const shipped = delivery === 'ship';
  const showAddress = shipped || mailingOn;
  const addressTyped = showAddress && Object.values(address).some((value) => value.trim());
  const stateCode = addressTyped ? normalizeUsState(address.state) : null;
  const shippingFee = !shipped
    ? 0
    : shipping === 'custom'
      ? parseInStoreShippingFee(customFee)
      : priceValue != null ? inStoreTableShippingFee(shipping, priceValue) : null;
  // The route's rule (lib/remote-sale.ts): no address yet = drawn with Florida tax.
  const exempt = taxExemptApplies(taxBox);
  const totals = priceValue != null && shippingFee != null ? remoteTotals(priceValue, { method: delivery, shippingFee }, shipped ? stateCode : null, exempt) : null;
  const outOfStateTotal = !exempt && shipped && !stateCode && totals ? round2(totals.subtotal + totals.shippingFee) : null;

  /** The form as typed — what "Save draft" keeps (`sanitizeRemoteDraft` on the server). */
  function draftForm(): RemoteDraftForm {
    return {
      items: items.map((item) => ({
        mode: item.mode,
        productId: item.selected?.id ?? null,
        title: item.title,
        metal: item.metal,
        gramWeight: item.gramWeight,
        purity: item.purity,
        price: item.price,
        photoUrl: item.photoUrl,
      })),
      customer: { firstName, lastName, email, phone },
      delivery: { method: delivery, mailingOn, address, shipping, customFee },
      pay: { online: payOnline, zelle: payZelle, check: payCheck, phone: payPhone },
      linkDays,
      message,
    };
  }

  function showDraftAddress(id: string | null) {
    try {
      window.history.replaceState(null, '', id ? `${window.location.pathname}?draft=${id}` : window.location.pathname);
    } catch {
      /* the address bar is a convenience; the draft is saved either way */
    }
  }

  async function saveDraft() {
    if (draftBusy || busy) return;
    if (items.some((item) => item.photoUploading)) { setDraftNote({ text: 'Wait for the photo to finish uploading, then save.', ok: false }); return; }
    setDraftBusy(true);
    setDraftNote(null);
    try {
      const send = (id: string | null) => fetch(id ? `/api/admin/remote-sales/drafts/${id}` : '/api/admin/remote-sales/drafts', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: draftForm() }),
      });
      let res = await send(draftId);
      let data = await res.json().catch(() => ({}));
      // Sent or deleted on another device: keep this typing as a new draft.
      if (res.status === 404 && draftId) {
        res = await send(null);
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok || !data.id) { setDraftNote({ text: data.error ?? 'Could not save the draft.', ok: false }); return; }
      setDraftId(data.id);
      setDraftSavedAt(data.updatedAt ?? new Date().toISOString());
      showDraftAddress(data.id);
      setDraftNote({ text: 'Draft saved. Continue it from Instant Sale on any device.', ok: true });
    } catch {
      setDraftNote({ text: 'Could not reach the server. The draft was not saved — try again.', ok: false });
    } finally {
      setDraftBusy(false);
    }
  }

  function clearAll() {
    setDraftId(null); setDraftSavedAt(null); setDraftNote(null); showDraftAddress(null);
    setItems([newSaleItem()]);
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setDelivery('pickup'); setMailingOn(false); setAddress(EMPTY_SALE_ADDRESS); setShipping('insured'); setCustomFee('');
    setPayOnline(true); setPayZelle(true); setPayCheck(false); setPayPhone(false); setLinkDays(REMOTE_LINK_DAYS_DEFAULT); setMessage('');
    setTaxBox(newTaxExemptBox());
    setError(null); setSent(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const problem = saleItemsProblem(items);
    if (problem) { setError(problem.charAt(0).toUpperCase() + problem.slice(1)); return; }
    if (!totals) {
      setError(shipping === 'custom' ? 'Enter the shipping charge, e.g. 25.' : 'Express overnight is not offered at $5,000 and up. Pick another shipping charge.');
      return;
    }
    if (!payOnline && !payZelle && !payCheck && !payPhone) { setError('Tick at least one way for the customer to pay.'); return; }
    const exemptProblem = taxExemptProblem(taxBox);
    if (exemptProblem) { setError(exemptProblem); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/remote-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(saleItemPayload),
          customer: { firstName, lastName, phone, email },
          delivery: {
            method: delivery,
            address: showAddress ? { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.zip } : null,
            shipping,
            shippingFee: customFee,
          },
          pay: { online: payOnline, zelle: payZelle, check: payCheck, phone: payPhone },
          linkDays,
          message,
          taxExempt: taxExemptPayload(taxBox),
          draftId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.invoice) { setError(data.error ?? 'Could not send the invoice.'); return; }
      // The invoice replaced the draft (the route deleted it).
      setDraftId(null); setDraftSavedAt(null); setDraftNote(null); showDraftAddress(null);
      setSent({ invoice: data.invoice, emailed: Boolean(data.emailed), emailError: data.emailError ?? null });
      window.scrollTo({ top: 0 });
    } catch {
      setError('Could not reach the server. Nothing was sent — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-xl mx-auto grid gap-4" role="status">
        <div className="text-center grid gap-2 justify-items-center pt-2">
          <span className="w-14 h-14 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{sent.emailed ? 'Invoice sent' : 'Invoice saved — not emailed yet'}</h2>
          <span className="text-xs" style={hintStyle}>
            {sent.emailed ? <>To {sent.invoice.email} · </> : null}Order <strong>{sent.invoice.orderNumber}</strong> · unpaid
          </span>
          {!sent.emailed && <span className="text-xs" style={{ color: 'var(--color-error)' }}>{sent.emailError ?? 'The email did not go out.'} Press Resend email below.</span>}
        </div>
        <RemoteInvoiceCard invoice={sent.invoice} adminBasePath={adminBasePath} />
        <div className="grid gap-2 pt-1">
          <button type="button" className="gold-button text-xs" onClick={clearAll}>New remote sale</button>
          <Link href={`${adminBasePath}/instant-sale`} className="outline-button text-xs">Back to Instant Sale</Link>
        </div>
      </div>
    );
  }

  const check = (checked: boolean, onChange: (value: boolean) => void, title: React.ReactNode, detail?: React.ReactNode) => (
    <label className="flex gap-2.5 items-start text-sm leading-snug cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-[18px] h-[18px] mt-0.5 flex-shrink-0" style={{ accentColor: 'var(--color-primary)' }} />
      <span>
        {title}
        {detail && <span className="block text-xs mt-0.5" style={hintStyle}>{detail}</span>}
      </span>
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.25fr_1fr] items-start">
      <div className="grid gap-4">
        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>1. Items</h2>
            {items.length > 1 && <span className="text-xs" style={hintStyle}>{items.length} items{priceValue != null ? ` · ${formatCurrency(priceValue)}` : ''}</span>}
          </div>
          <SaleItemsEditor
            items={items}
            setItems={setItems}
            products={products}
            spotData={spotData}
            priceLabel="Price (before tax)"
            listedNote="stays for sale until paid"
          />
        </section>

        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>2. Customer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label} style={labelStyle}>First name</span><input className="form-field" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" required /></label>
            <label className="block"><span className={label} style={labelStyle}>Last name</span><input className="form-field" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" required /></label>
            <label className="block">
              <span className={label} style={labelStyle}>Email</span>
              <input className="form-field" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" required />
              <span className="mt-1 block text-xs" style={hintStyle}>The invoice goes here.</span>
            </label>
            <label className="block">
              <span className={label} style={labelStyle}>Cell<Optional /></span>
              <input className="form-field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(239) 555-0134" autoComplete="off" />
              <span className="mt-1 block text-xs" style={hintStyle}>Left blank, the customer fills it in when paying.</span>
            </label>
          </div>
          <TaxExemptSaleBox box={taxBox} onChange={(next) => { setTaxBox(next); setError(null); }} />
        </section>

        <SaleDeliverySection
          variant="remote"
          delivery={delivery}
          onDelivery={(value) => { setDelivery(value); setError(null); }}
          mailingOn={mailingOn}
          onMailingOn={setMailingOn}
          address={address}
          onAddress={(patch) => setAddress((current) => ({ ...current, ...patch }))}
          shipping={shipping}
          onShipping={setShipping}
          customFee={customFee}
          onCustomFee={setCustomFee}
          priceValue={priceValue}
          itemCount={items.length}
        />

        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={cardStyle}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>4. How they can pay</h2>
          {check(
            payOnline,
            setPayOnline,
            <><strong>Pay online link</strong> — PayPal or any debit / credit card, through the site&apos;s own PayPal checkout.</>,
            'They confirm their name, cell and address, then pay. The items are marked sold, the listings end and the receipt goes out — the same as a web sale.',
          )}
          {check(payZelle, setPayZelle, <><strong>Zelle</strong> to {ZELLE_PAY_TO}</>, 'They put the order number in the memo; then press Record payment on the invoice.')}
          {check(payCheck, setPayCheck, <><strong>Check</strong> payable to {CHECK_PAYABLE_TO}, mailed or brought in</>)}
          {check(payPhone, setPayPhone, <><strong>Call to pay by card</strong> — {PAY_BY_PHONE}</>)}
          <div className="grid gap-3 sm:grid-cols-2">
            {payOnline && (
              <label className="block">
                <span className={label} style={labelStyle}>Link good for</span>
                <select className="form-field" value={linkDays} onChange={(e) => setLinkDays(Number(e.target.value) as RemoteLinkDays)}>
                  {REMOTE_LINK_DAYS.map((days) => <option key={days} value={days}>{days} days</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="block">
            <span className={label} style={labelStyle}>Message to the customer<Optional /></span>
            <textarea className="form-field" rows={3} value={message} maxLength={REMOTE_MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} placeholder="Here is the invoice for the pieces we talked about. Thank you!" />
            <span className="mt-1 block text-xs" style={hintStyle}>Shown in the email, signed &ldquo;— Chris&rdquo;.</span>
          </label>
        </section>
      </div>

      <div className="grid gap-4 lg:sticky lg:top-6">
        <section className="rounded-[1.25rem] border p-5 grid gap-3" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Invoice total</h2>
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
            {exempt ? (
              <span>FL sales tax · <strong style={{ color: '#16653c' }}>exempt</strong> <span className="text-xs" style={hintStyle}>(any address)</span></span>
            ) : (
            <span>
              {totals && totals.tax === 0 ? 'FL sales tax' : 'FL sales tax · 6%'}
              {shipped && <span className="text-xs" style={hintStyle}>{totals && totals.tax === 0 ? ` · none, ships to ${stateCode}` : stateCode ? ' (FL address)' : ' (until an address is in)'}</span>}
            </span>
            )}
            <span>{totals ? formatCurrency(totals.tax) : '—'}</span>
          </div>
          <div className="flex justify-between border-t pt-3 text-2xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)' }}><span>Total</span><span>{totals ? formatCurrency(totals.total) : '—'}</span></div>
          {outOfStateTotal != null && (
            <span className="text-xs" style={hintStyle}>Out of Florida: <strong>{formatCurrency(outOfStateTotal)}</strong>, no tax. The customer sees the right one once the address is in.</span>
          )}
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" role="alert" style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>{error}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" className="outline-button text-xs" onClick={() => void saveDraft()} disabled={busy || draftBusy}>{draftBusy ? 'Saving…' : 'Save draft'}</button>
            <button type="submit" className="gold-button text-xs flex-1" disabled={busy || draftBusy}>{busy ? 'Sending…' : totals ? `Email invoice · ${formatCurrency(totals.total)}` : 'Email invoice'}</button>
          </div>
          {draftNote && (
            <span className="text-xs" role={draftNote.ok ? 'status' : 'alert'} style={{ color: draftNote.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>{draftNote.text}</span>
          )}
          <span className="text-xs" style={hintStyle}>
            {draftId && draftSavedAt ? <>Draft · saved {savedAtLabel(draftSavedAt)}. </> : null}
            Becomes an <strong>unpaid order</strong> in Orders the moment it is sent; a draft does not.
          </span>
          <button type="button" className="text-xs underline justify-self-start" style={hintStyle} onClick={clearAll} disabled={busy || draftBusy}>
            {draftId ? 'Start a new remote sale (the draft stays saved)' : 'Clear the form'}
          </button>
        </section>
        <section className="rounded-[1.25rem] border bg-white p-5 grid gap-2" style={cardStyle}>
          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>On record</h2>
          <span className="text-xs" style={hintStyle}>
            Nothing is held: listed items stay for sale until someone pays, the same as a counter-offer. If one sells first, the payment page says so and takes no money.
            Paid online, the invoice closes by itself; paid by Zelle or check, press <strong>Record payment</strong> on its card under Instant Sale.
          </span>
        </section>
      </div>
    </form>
  );
}
