'use client';

import { useMemo, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import {
  computeEditTotals,
  describeChanges,
  EDIT_LIMITS,
  editStateFromOrder,
  orderEditRules,
  SHIPPING_METHOD_LABELS,
  type EditableAddress,
  type EditItem,
  type OrderEditState,
  type OrderRowForEdit,
  type ShippingMethodValue,
} from '@/lib/order-edit';
import type { AddableProduct } from '@/lib/order-edit-server';
import { formatCurrency } from '@/types/sales';
import { paymentMethodLabel } from '@/lib/in-store-sale';

/**
 * Admin → Orders → "✎ Edit order" (owner, 2026-11-24 (11), mockup 2, option B).
 * Details on any order; money only while unpaid; the shipping fee also on paid
 * non-PayPal single-payment orders; Trade-in money always locked
 * (lib/order-edit.ts). The window previews the new totals and the change list;
 * the server re-checks everything on Save.
 */

const SMALL = { padding: '0.45rem 0.9rem', fontSize: '0.6rem', letterSpacing: '0.1em' } as const;
const MUTED = { color: 'var(--color-on-surface-variant)' } as const;
const GROUP = 'mb-1 text-[0.62rem] font-bold uppercase tracking-[0.18em]';

let keySeq = 0;
type Row = EditItem & { key: string };
const withKey = (item: EditItem): Row => ({ ...item, key: `row-${keySeq += 1}` });
function stripKey(row: Row): EditItem {
  const item: Partial<Row> = { ...row };
  delete item.key;
  return item as EditItem;
}

export default function EditOrderWindow({
  order,
  gift,
  taxExempt,
  onClose,
  onSaved,
}: {
  order: OrderRowForEdit & { id: string; order_number: string };
  gift: { recipientName: string | null; message: string | null } | null;
  taxExempt: boolean;
  onClose: () => void;
  /** After a save: the change list, any warnings, whether the email went. */
  onSaved: (result: { changes: number; warnings: string[]; emailed: string | null; historySaved: boolean }) => void;
}) {
  const source = useMemo(() => ({ ...order, tax_exempt: taxExempt }), [order, taxExempt]);
  const before = useMemo(() => editStateFromOrder(source, gift), [source, gift]);
  const rules = useMemo(() => orderEditRules(source), [source]);
  const [draft, setDraft] = useState<OrderEditState>(before);
  const [rows, setRows] = useState<Row[]>(() => before.items.map(withKey));
  const [emailCustomer, setEmailCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ state: 'closed' } | { state: 'loading' } | { state: 'open'; products: AddableProduct[]; query: string } | { state: 'error'; message: string }>({ state: 'closed' });

  const after: OrderEditState = { ...draft, items: rows.map(stripKey) };
  const changes = describeChanges(before, after);
  const totals = computeEditTotals({ items: after.items, orderDiscount: after.orderDiscount, shippingFee: after.shippingFee, chargesTax: after.chargesTax, taxExempt });
  const paidTotal = Number(order.total) || 0;
  const docLabel = rules.paid ? 'receipt' : 'invoice';

  function set<K extends keyof OrderEditState>(key: K, value: OrderEditState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function setAddress(key: 'shippingAddress' | 'billingAddress', patch: Partial<EditableAddress>) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }
  function setRow(key: string, patch: Partial<EditItem>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function openPicker() {
    setPicker({ state: 'loading' });
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/edit`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { products?: AddableProduct[]; error?: string };
      if (!res.ok || !data.products) setPicker({ state: 'error', message: data.error ?? 'Could not load the listings.' });
      else setPicker({ state: 'open', products: data.products, query: '' });
    } catch {
      setPicker({ state: 'error', message: 'Could not reach the server.' });
    }
  }

  function addListed(product: AddableProduct) {
    if (rows.some((row) => row.productId === product.id && !row.removed)) {
      setError(`"${product.title}" is already on this order.`);
      return;
    }
    setRows((current) => [...current, withKey({ id: null, productId: product.id, title: product.title, price: product.price, quantity: 1, discount: 0, bullion: false, removed: false, inventoryNumber: product.inventoryNumber })]);
    setPicker({ state: 'closed' });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(after),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; changes?: unknown[]; warnings?: string[]; historySaved?: boolean };
      if (!res.ok) {
        setError(data.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      let emailed: string | null = null;
      const recipient = (after.customerEmail || order.customer_email || '').trim();
      if (emailCustomer && recipient) {
        const sent = await fetch(`/api/admin/orders/${order.id}/email-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient, itemDiscounts: {} }),
        });
        emailed = sent.ok ? recipient : null;
        if (!sent.ok) (data.warnings ??= []).push(`Saved, but the corrected ${docLabel} was not emailed.`);
      }
      onSaved({ changes: data.changes?.length ?? 0, warnings: data.warnings ?? [], emailed, historySaved: data.historySaved !== false });
    } catch {
      setError('Could not reach the server. Nothing was saved.');
      setBusy(false);
    }
  }

  const lockNote = (text: string) => (
    <p className="mt-2 flex gap-2 rounded border px-3 py-2 text-[12.5px] leading-snug" style={{ background: '#f3efe2', borderColor: '#e2d8b8', color: '#5b4b10' }}>
      <span aria-hidden>🔒</span>
      <span>{text}</span>
    </p>
  );

  const field = (label: string, value: string, onChange: (value: string) => void, opts: { max?: number; type?: string; placeholder?: string } = {}) => (
    <label className="block">
      <span className="form-label">{label}</span>
      <input className="form-field" type={opts.type ?? 'text'} value={value} maxLength={opts.max} placeholder={opts.placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );

  const addressBlock = (key: 'shippingAddress' | 'billingAddress', title: string) => {
    const a = draft[key];
    return (
      <fieldset className="mt-2">
        <legend className="form-label">{title}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="form-field sm:col-span-2" placeholder="Street" value={a.line1} maxLength={EDIT_LIMITS.addressField} onChange={(e) => setAddress(key, { line1: e.target.value })} />
          <input className="form-field sm:col-span-2" placeholder="Apt / Suite (optional)" value={a.line2} maxLength={EDIT_LIMITS.addressField} onChange={(e) => setAddress(key, { line2: e.target.value })} />
          <input className="form-field" placeholder="City" value={a.city} maxLength={EDIT_LIMITS.addressField} onChange={(e) => setAddress(key, { city: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="form-field" placeholder="State" value={a.state} maxLength={EDIT_LIMITS.addressField} onChange={(e) => setAddress(key, { state: e.target.value })} />
            <input className="form-field" placeholder="ZIP" value={a.postalCode} maxLength={20} onChange={(e) => setAddress(key, { postalCode: e.target.value })} />
          </div>
        </div>
      </fieldset>
    );
  };

  const filtered = picker.state === 'open'
    ? picker.products.filter((p) => {
      const q = picker.query.trim().toLowerCase();
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || (p.inventoryNumber ?? '').includes(q);
    }).slice(0, 12)
    : [];

  return (
    <AdminModal title={`Edit order · ${order.order_number}`} onClose={() => { if (changes.length === 0 || window.confirm('Close without saving your changes?')) onClose(); }} maxWidth="max-w-5xl">
      <div className="grid md:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5 px-4 py-4 md:border-r" style={{ borderColor: '#ece8de' }}>
          <section>
            <h3 className={GROUP} style={{ color: 'var(--color-primary)' }}>Customer</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {field('Name', draft.customerName, (v) => set('customerName', v), { max: EDIT_LIMITS.name })}
              {field('Email', draft.customerEmail, (v) => set('customerEmail', v), { max: 200, type: 'email' })}
              {field('Phone', draft.customerPhone, (v) => set('customerPhone', v), { max: EDIT_LIMITS.phone, type: 'tel' })}
            </div>
            {rules.paid && draft.customerEmail.trim().toLowerCase() !== before.customerEmail.trim().toLowerCase() && (
              <p className="mt-1 text-xs" style={MUTED}>Changing the email also moves them on the Buyers and Follow-ups lists.</p>
            )}
          </section>

          <section>
            <h3 className={GROUP} style={{ color: 'var(--color-primary)' }}>Delivery</h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery">
              {(['pickup', 'shipping', 'local_delivery'] as ShippingMethodValue[]).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={draft.shippingMethod === value} onClick={() => set('shippingMethod', value)}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  style={draft.shippingMethod === value ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: '#fbf6e6', fontWeight: 600 } : { borderColor: 'var(--color-outline-variant)', color: '#555', background: 'white' }}>
                  {SHIPPING_METHOD_LABELS[value]}
                </button>
              ))}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]">
              <div>{addressBlock('shippingAddress', draft.shippingMethod === 'pickup' ? 'Address (optional)' : 'Ship to')}</div>
              <label className="block">
                <span className="form-label">Shipping fee</span>
                <input className="form-field" type="number" min="0" step="0.01" value={String(draft.shippingFee)} disabled={!rules.shippingFeeAllowed}
                  onChange={(e) => set('shippingFee', Math.max(0, Number(e.target.value) || 0))} />
              </label>
            </div>
            {!rules.shippingFeeAllowed && rules.shippingLockReason && lockNote(rules.shippingLockReason)}
            {rules.paid && rules.shippingFeeAllowed && draft.shippingFee !== before.shippingFee && (
              <p className="mt-1 text-xs" style={{ color: '#8a3b12' }}>This order is paid: the new total ({formatCurrency(totals.total)}) will not match what was collected ({formatCurrency(paidTotal)}). Collect or give back the difference yourself.</p>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Billing address</summary>
              {addressBlock('billingAddress', 'Billing address')}
            </details>
          </section>

          <section>
            <h3 className={GROUP} style={{ color: 'var(--color-primary)' }}>Items</h3>
            <ul className="space-y-2">
              {rows.map((row) => {
                const was = row.id ? before.items.find((item) => item.id === row.id) : undefined;
                const renamed = was && was.title.trim() !== row.title.trim();
                return (
                  <li key={row.key} className="rounded border px-3 py-2" style={{ borderColor: 'var(--color-outline-variant)', opacity: row.removed ? 0.55 : 1 }}>
                    <label className="block">
                      <span className="form-label">{row.id ? 'Name' : row.productId ? 'Added listing' : 'Added item'}</span>
                      <input className="form-field" value={row.title} maxLength={EDIT_LIMITS.title} disabled={row.removed} onChange={(e) => setRow(row.key, { title: e.target.value })}
                        style={renamed ? { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 3px rgba(115,92,0,.1)' } : undefined} />
                    </label>
                    <div className="mt-2 grid grid-cols-[1fr_4.5rem_1fr_auto] items-end gap-2 sm:grid-cols-[8rem_4.5rem_7rem_auto]">
                      <label className="block"><span className="form-label">Price</span>
                        <input className="form-field" type="number" min="0" step="0.01" value={String(row.price)} disabled={!rules.moneyAllowed || row.removed} onChange={(e) => setRow(row.key, { price: Number(e.target.value) || 0 })} /></label>
                      <label className="block"><span className="form-label">Qty</span>
                        <input className="form-field" type="number" min="1" max={EDIT_LIMITS.quantity} step="1" value={String(row.quantity)} disabled={!rules.moneyAllowed || row.removed} onChange={(e) => setRow(row.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></label>
                      <label className="block"><span className="form-label">Line disc.</span>
                        <input className="form-field" type="number" min="0" step="0.01" value={String(row.discount)} disabled={!rules.moneyAllowed || row.removed} onChange={(e) => setRow(row.key, { discount: Math.max(0, Number(e.target.value) || 0) })} /></label>
                      {rules.moneyAllowed && (
                        row.removed ? (
                          <button type="button" className="outline-button" style={SMALL} onClick={() => setRow(row.key, { removed: false })}>Undo</button>
                        ) : (
                          <button type="button" aria-label={`Remove ${row.title}`} title="Remove this item" onClick={() => (row.id ? setRow(row.key, { removed: true }) : setRows((current) => current.filter((r) => r.key !== row.key)))}
                            className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-transform hover:-translate-y-px active:translate-y-0" style={{ borderColor: '#e3c4c0', color: 'var(--color-error)' }}>✕</button>
                        )
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px]" style={MUTED}>
                      {row.removed && 'Will be removed. '}
                      {renamed && <>was <s style={{ color: 'var(--color-error)' }}>{was?.title}</s>{row.inventoryNumber ? ' · ' : ''}</>}
                      {row.inventoryNumber ? `listing #${row.inventoryNumber}` : ''}
                      {row.bullion && ' · Bullion — not taxed'}
                    </p>
                  </li>
                );
              })}
            </ul>
            {rules.moneyAllowed ? (
              <div className="mt-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="outline-button" style={SMALL} onClick={() => void openPicker()} disabled={picker.state === 'loading'}>
                    {picker.state === 'loading' ? 'Loading…' : '+ Add a listed piece'}
                  </button>
                  <button type="button" className="outline-button" style={SMALL} onClick={() => setRows((current) => [...current, withKey({ id: null, productId: null, title: '', price: 0, quantity: 1, discount: 0, bullion: false, removed: false })])}>
                    + Add another item (typed)
                  </button>
                </div>
                {picker.state === 'error' && <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--color-error)' }}>{picker.message}</p>}
                {picker.state === 'open' && (
                  <div className="mt-2 rounded border p-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
                    <input className="form-field" autoFocus placeholder="Search listings by name or number" value={picker.query} onChange={(e) => setPicker({ ...picker, query: e.target.value })} />
                    <ul className="mt-1 max-h-60 overflow-y-auto">
                      {filtered.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => addListed(p)} className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-[#fbf6e6]">
                            <span>{p.title}<span className="block text-xs" style={MUTED}>#{p.inventoryNumber ?? '—'}</span></span>
                            <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(p.price)}</span>
                          </button>
                        </li>
                      ))}
                      {filtered.length === 0 && <li className="px-2 py-2 text-xs" style={MUTED}>No available listing matches.</li>}
                    </ul>
                    <button type="button" className="mt-1 text-xs font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--color-primary)' }} onClick={() => setPicker({ state: 'closed' })}>Close the list</button>
                  </div>
                )}
              </div>
            ) : (
              rules.moneyLockReason && lockNote(rules.moneyLockReason)
            )}
          </section>

          <section>
            <h3 className={GROUP} style={{ color: 'var(--color-primary)' }}>{before.isGift ? 'Gift & notes' : 'Notes'}</h3>
            {before.isGift && (
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                {field('Gift recipient', draft.giftRecipient, (v) => set('giftRecipient', v), { max: EDIT_LIMITS.name })}
                {field('Gift message', draft.giftMessage, (v) => set('giftMessage', v), { max: EDIT_LIMITS.giftMessage })}
              </div>
            )}
            <label className="block">
              <span className="form-label">Customer&rsquo;s note</span>
              <textarea className="form-field" rows={2} maxLength={EDIT_LIMITS.notes} value={draft.customerNotes} onChange={(e) => set('customerNotes', e.target.value)} />
            </label>
          </section>
        </div>

        <div className="space-y-4 px-4 py-4" style={{ background: '#fcfbf7' }}>
          <section>
            <h3 className={GROUP} style={{ color: 'var(--color-primary)' }}>{rules.moneyAllowed ? 'Totals (worked out again)' : 'Totals'}</h3>
            {rules.moneyAllowed && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="block"><span className="form-label">Order discount</span>
                  <input className="form-field" type="number" min="0" step="0.01" value={String(draft.orderDiscount)} onChange={(e) => set('orderDiscount', Math.max(0, Number(e.target.value) || 0))} /></label>
                <label className="flex items-end gap-2 pb-2 text-xs font-semibold">
                  <input type="checkbox" checked={draft.chargesTax && !taxExempt} disabled={taxExempt} onChange={(e) => set('chargesTax', e.target.checked)} style={{ accentColor: 'var(--color-primary)', width: '1rem', height: '1rem' }} />
                  {taxExempt ? 'Tax exempt' : 'Charge FL sales tax (6%)'}
                </label>
              </div>
            )}
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt style={MUTED}>Subtotal</dt><dd>{formatCurrency(totals.subtotal)}</dd>
              {totals.discount > 0 && (<><dt style={MUTED}>Discount</dt><dd>−{formatCurrency(totals.discount)}</dd></>)}
              <dt style={MUTED}>Shipping</dt><dd>{formatCurrency(totals.shippingFee)}</dd>
              <dt style={MUTED}>{taxExempt ? 'Tax · exempt' : 'FL sales tax'}</dt><dd>{formatCurrency(totals.tax)}</dd>
              <dt className="border-t pt-2 font-bold" style={{ borderColor: 'var(--color-outline-variant)' }}>{rules.paid ? 'Paid' : 'New total'}</dt>
              <dd className="border-t pt-2 text-base font-bold" style={{ borderColor: 'var(--color-outline-variant)' }}>{formatCurrency(rules.paid && totals.total === paidTotal ? paidTotal : totals.total)}</dd>
            </dl>
            <p className="mt-1 text-xs" style={MUTED}>
              {Math.abs(totals.total - paidTotal) < 0.005 ? `Total before: ${formatCurrency(paidTotal)} · no change` : `Total before: ${formatCurrency(paidTotal)} → ${formatCurrency(totals.total)}`}
            </p>
            {rules.paid && !rules.moneyAllowed && lockNote(`Paid ${formatCurrency(paidTotal)}${order.payment_method ? ` by ${paymentMethodLabel(order.payment_method)}` : ''}. ${rules.shippingFeeAllowed ? 'Only the shipping fee can change the amount.' : 'Amounts cannot change here.'}`)}
          </section>

          <section>
            <h3 className={GROUP} style={{ color: 'var(--color-primary)' }}>What will change</h3>
            {changes.length === 0 ? (
              <p className="text-sm" style={MUTED}>Nothing yet.</p>
            ) : (
              <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px] leading-snug">
                {changes.map((change, index) => (
                  <li key={index}><b>{change.label}</b>: {change.before} → {change.after}</li>
                ))}
              </ol>
            )}
          </section>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} style={{ accentColor: 'var(--color-primary)', width: '1rem', height: '1rem', marginTop: 2 }} />
            <span>Email the corrected {docLabel} to {(draft.customerEmail || order.customer_email || 'the customer').trim()}</span>
          </label>
          {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--color-error)' }}>{error}</p>}
        </div>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-white px-4 py-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
        <span className="text-xs" style={MUTED}>Saved changes are listed in Change history.</span>
        <span className="flex gap-2">
          <button type="button" className="outline-button" style={SMALL} disabled={busy} onClick={() => { if (changes.length === 0 || window.confirm('Close without saving your changes?')) onClose(); }}>Cancel</button>
          <button type="button" className="gold-button" style={SMALL} disabled={busy || changes.length === 0} aria-busy={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </span>
      </div>
    </AdminModal>
  );
}
