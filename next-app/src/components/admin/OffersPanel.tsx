'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OFFER_FILTERS,
  OFFER_FILTER_LABELS,
  OFFER_STATUS_LABELS,
  OWNER_NOTE_MAX,
  displayBuyerName,
  formatOfferDeadline,
  offerDeleteBlock,
  hoursLeft,
  percentOfListed,
  shippingMethodLabel,
  type OfferFilter,
  type OfferStatus,
} from '@/lib/offers';
import { formatCheckoutCurrency } from '@/lib/checkout-pricing';
import AdminModal from '@/components/admin/AdminModal';
import { AppIcon } from '@/components/AppIcon';

/**
 * Admin → Offers (site shop "Make an Offer", owner mockups v2 + v3, 2026-10-15).
 * Open offers first, soonest deadline on top. Accept charges the held money at
 * once (paid order, item SOLD); Counter releases the hold and emails a private
 * Buy-now link; Decline releases the hold. Counter and Decline each take an
 * optional message to the buyer (signed "— Chris"), kept on the offer.
 *
 * ONE card, two layouts (mockup v3): a row on a computer, and on a phone a
 * single column in the order the owner decides in — what, how much, how long,
 * who — then the buttons. The layout is CSS grid areas, so the content is the
 * same on both.
 *
 * Delete (owner mockup v4, 2026-10-15): a red trash-can on every FINISHED offer
 * and "Delete all N" on a finished tab, each with a pop-up — the Buy Receipts
 * log's pattern. Open offers and live counters never get one; the server
 * re-checks with the same rule (lib/offers.ts → offerDeleteBlock).
 */

type AdminOffer = {
  id: string;
  product_id: string;
  status: OfferStatus;
  amount: number;
  listed_price: number | null;
  shipping_method: string;
  total: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  message: string | null;
  expires_at: string | null;
  counter_amount: number | null;
  counter_note: string | null;
  counter_expires_at: string | null;
  order_id: string | null;
  decided_at: string | null;
  last_error: string | null;
  hold_status: string;
  created_at: string;
  product_title: string;
  product_inventory_number: string | null;
  product_image: string | null;
  product_listed_price: number | null;
  product_available: boolean;
  order_number: string | null;
};

type Panel = { id: string; kind: 'accept' | 'counter' | 'decline' } | null;
type Deleting = { ids: string[]; title: string; first: string | null; body: string; confirm: string } | null;

/** The tab's own word for the bulk button: "Delete all 6 declined". */
const DELETE_NOUN: Partial<Record<OfferFilter, string>> = {
  accepted: 'accepted',
  declined: 'declined',
  expired: 'expired',
  all: 'finished',
};
type Notice = { ok: boolean; text: string; link?: string } | null;

const BORDER = 'var(--color-outline-variant)';

function MessageBox({ id, first, value, onChange }: { id: string; first: string; value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label className="form-label mt-3" htmlFor={id}>Message to {first} (optional)</label>
      <textarea
        id={id}
        className="form-field offer-message-box"
        rows={3}
        maxLength={OWNER_NOTE_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        Goes in the email, signed &ldquo;— Chris&rdquo;. Up to {OWNER_NOTE_MAX} characters.
      </p>
    </>
  );
}

export default function OffersPanel({ adminBasePath }: { adminBasePath: string }) {
  const [filter, setFilter] = useState<OfferFilter>('open');
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (which: OfferFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/offers?filter=${which}`);
      const data = await res.json().catch(() => null);
      if (data?.setupNeeded) setSetupMessage(String(data.message ?? 'Run the offers SQL first.'));
      else setSetupMessage(null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not load offers.');
      setOffers(Array.isArray(data?.offers) ? data.offers as AdminOffer[] : []);
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Could not load offers.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => { await load(filter); };
    void run();
  }, [filter, load]);

  function openPanel(id: string, kind: 'accept' | 'counter' | 'decline') {
    setPanel({ id, kind });
    setCounterAmount('');
    setNote('');
  }

  function askDeleteOne(offer: AdminOffer) {
    const name = displayBuyerName(offer.customer_name);
    const decided = offer.decided_at ? ` ${formatOfferDeadline(offer.decided_at).replace(/,.*$/, '').replace(/^\w+ /, '')}` : '';
    const paid = (offer.status === 'accepted' || offer.status === 'counter_bought') && offer.order_id;
    setDeleteError(null);
    setDeleting({
      ids: [offer.id],
      title: 'Delete this offer?',
      first: `${name} · ${formatCheckoutCurrency(offer.amount)} · ${OFFER_STATUS_LABELS[offer.status]}${decided}`,
      body: paid
        ? `It is removed from Offers for good. ${offer.order_number ? `Order ${offer.order_number}` : 'The paid order'} stays under Orders with its payment and receipt — only the offer record goes.`
        : 'It is removed from Offers for good. It cannot be undone, and the buyer is not told — they already got their email.',
      confirm: 'Delete this offer',
    });
  }

  function askDeleteAll(ids: string[], anyPaid: boolean) {
    const noun = DELETE_NOUN[filter] ?? 'finished';
    setDeleteError(null);
    setDeleting({
      ids,
      title: `Delete all ${ids.length} ${noun} offer${ids.length === 1 ? '' : 's'}?`,
      first: filter === 'all'
        ? 'Every finished offer on the All tab — open offers and live counters are skipped.'
        : `Every offer on the ${OFFER_FILTER_LABELS[filter]} tab right now.`,
      body: `They are removed from Offers for good. It cannot be undone; no buyer is told.${anyPaid ? ' Their paid orders stay under Orders.' : ''}`,
      confirm: `Delete all ${ids.length}`,
    });
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/admin/offers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: deleting.ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Could not delete.');
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setNotice({
        ok: true,
        text: `Deleted ${data.deleted} offer${data.deleted === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped — still open, a live counter, or a PayPal release still going through.` : ''}`,
      });
      setDeleting(null);
      await load(filter);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function act(offer: AdminOffer, action: 'accept' | 'decline' | 'counter' | 'resend-counter') {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/offers/${encodeURIComponent(offer.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount: counterAmount, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'That did not work.');
      const first = displayBuyerName(offer.customer_name).split(' ')[0];
      if (action === 'accept') {
        setNotice({
          ok: !data.itemConflict,
          text: data.itemConflict
            ? `Charged, but the item had already sold — order ${data.orderNumber} is flagged for a refund. See Orders.`
            : `Accepted — ${first} was charged ${formatCheckoutCurrency(offer.total)}. Order ${data.orderNumber} is paid and the item is SOLD; ${first} gets the receipt.`,
          link: `${adminBasePath}/orders/${data.orderId}`,
        });
      } else if (action === 'decline') {
        setNotice({ ok: true, text: `Declined — ${first}'s hold was released and they were emailed${note.trim() ? ' your message' : ''}.` });
      } else {
        setNotice({
          ok: data.emailed !== false,
          text: data.emailed === false
            ? `Counter saved and ${first}'s hold released, but the email did not send. Send them this link yourself:`
            : action === 'resend-counter'
              ? `A fresh Buy-now link was emailed to ${first} (the old one no longer works).`
              : `Counter sent — ${first}'s hold was released and they were emailed a Buy-now link for 72 hours${note.trim() ? ' with your message' : ''}.`,
          link: data.link,
        });
      }
      setPanel(null);
      setCounterAmount('');
      setNote('');
      await load(filter);
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'That did not work.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {setupMessage && (
        <div className="mb-4 border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-primary-container)', background: '#fffbe8', color: 'var(--color-on-surface)' }}>
          {setupMessage} Until then no item shows Make an Offer.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Offer filter">
        {OFFER_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => { setFilter(value); setPanel(null); }}
            className="border px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.12em]"
            style={filter === value
              ? { background: '#1a1c1c', color: '#fff', borderColor: '#1a1c1c' }
              : { background: '#fff', color: 'var(--color-on-surface)', borderColor: BORDER }}
          >
            {OFFER_FILTER_LABELS[value]}
          </button>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 border px-4 py-3 text-sm"
          style={{ borderColor: notice.ok ? '#9cc2a8' : 'var(--color-error)', background: notice.ok ? '#f4f8f5' : 'var(--color-error-container)', color: 'var(--color-on-surface)' }}
        >
          {notice.text}
          {notice.link && (
            <>
              {' '}
              {notice.link.startsWith('http') ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <code className="break-all text-xs">{notice.link}</code>
                  <button type="button" className="outline-button text-[0.6rem]" onClick={() => { void navigator.clipboard?.writeText(notice.link ?? ''); }}>
                    Copy link
                  </button>
                </span>
              ) : (
                <a href={notice.link} className="font-bold underline" style={{ color: 'var(--color-primary)' }}>Open the order</a>
              )}
            </>
          )}
        </div>
      )}

      {!loading && filter === 'open' && offers.length > 0 && (
        <p className="offer-delete-note mb-3 border bg-white px-3 py-2 text-xs" style={{ borderColor: BORDER, color: 'var(--color-on-surface-variant)' }}>
          Open offers can&apos;t be deleted — PayPal is holding the buyer&apos;s money. <strong>Decline</strong> releases it; then you can delete it from Declined.
        </p>
      )}
      {!loading && filter === 'countered' && offers.length > 0 && (
        <p className="offer-delete-note mb-3 border bg-white px-3 py-2 text-xs" style={{ borderColor: BORDER, color: 'var(--color-on-surface-variant)' }}>
          A counter can be deleted once its Buy-now link expires — it then moves to Expired.
        </p>
      )}
      {!loading && DELETE_NOUN[filter] && (() => {
        const deletable = offers.filter((offer) => !offerDeleteBlock(offer));
        if (deletable.length === 0) return null;
        const noun = DELETE_NOUN[filter];
        return (
          <div className="offer-bulk-bar mb-3 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            <span>
              {deletable.length} {noun} offer{deletable.length === 1 ? '' : 's'}
              {filter === 'all' && deletable.length < offers.length ? ' (open offers and live counters are skipped)' : ''}
            </span>
            <button
              type="button"
              className="outline-button text-xs"
              style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
              disabled={busy || deleteBusy}
              onClick={() => askDeleteAll(deletable.map((offer) => offer.id), deletable.some((offer) => Boolean(offer.order_id)))}
            >
              <AppIcon name="delete" className="text-[1rem]" aria-hidden="true" />
              {filter === 'all' ? `Delete all ${deletable.length} finished` : `Delete all ${deletable.length}`}
            </button>
          </div>
        );
      })()}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Loading offers…</p>
      ) : offers.length === 0 ? (
        <p className="border bg-white px-4 py-8 text-center text-sm" style={{ borderColor: BORDER, color: 'var(--color-on-surface-variant)' }}>
          {filter === 'open' ? 'No open offers right now.' : `No ${OFFER_FILTER_LABELS[filter].toLowerCase()} offers.`}
        </p>
      ) : (
        <div className="grid gap-3">
          {offers.map((offer) => {
            const listed = offer.product_listed_price ?? offer.listed_price;
            const pct = percentOfListed(offer.amount, listed);
            const open = offer.status === 'open';
            const countered = offer.status === 'countered';
            const left = open ? hoursLeft(offer.expires_at) : countered ? hoursLeft(offer.counter_expires_at) : 0;
            const urgent = open && left < 12;
            const name = displayBuyerName(offer.customer_name);
            const first = name.split(' ')[0];
            const panelOpen = panel?.id === offer.id;
            const clockTone = open ? (urgent ? 'urgent' : 'open') : countered ? 'countered' : 'closed';
            return (
              <div key={offer.id} className="offer-card border bg-white" style={{ borderColor: BORDER }} data-panel={panelOpen ? 'open' : 'closed'} data-deletable={offerDeleteBlock(offer) ? 'false' : 'true'}>
                <div className="offer-grid">
                  {offer.product_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="offer-thumb" src={offer.product_image} alt="" width={64} height={64} />
                  ) : (
                    <div className="offer-thumb" style={{ background: 'var(--color-surface-container)' }} />
                  )}

                  <div className="offer-title min-w-0">
                    <p className="font-bold leading-snug" style={{ color: 'var(--color-on-surface)' }}>{offer.product_title}</p>
                    {offer.product_inventory_number && (
                      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>#{offer.product_inventory_number}</p>
                    )}
                  </div>

                  <div className="offer-money text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <div className="offer-money-top">
                      <span className="offer-amount" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}>{formatCheckoutCurrency(offer.amount)}</span>
                      {listed != null && pct != null && (
                        <span className="offer-pct"><strong style={{ color: 'var(--color-on-surface)' }}>{pct}%</strong> of {formatCheckoutCurrency(listed)}</span>
                      )}
                    </div>
                    <p className="offer-sub">
                      {shippingMethodLabel(offer.shipping_method)} · {open
                        ? <>PayPal is holding <strong>{formatCheckoutCurrency(offer.total)}</strong></>
                        : offer.status === 'accepted' || offer.status === 'counter_bought'
                          ? <>charged {formatCheckoutCurrency(offer.status === 'counter_bought' ? (offer.counter_amount ?? offer.total) : offer.total)}{offer.status === 'counter_bought' ? ' + shipping/tax' : ''}</>
                          : <>hold released</>}
                    </p>
                  </div>

                  <div className="offer-clock text-xs" data-tone={clockTone}>
                    {open ? (
                      <p><span className="offer-clock-label">⏱ {left} h left</span> · answer by {formatOfferDeadline(offer.expires_at)}</p>
                    ) : countered ? (
                      <p><span className="offer-clock-label">Countered {formatCheckoutCurrency(offer.counter_amount ?? 0)}</span> · link {left} h left, until {formatOfferDeadline(offer.counter_expires_at)}</p>
                    ) : (
                      <>
                        <p>
                          <span className="offer-clock-label">
                            {OFFER_STATUS_LABELS[offer.status]}
                            {offer.status === 'counter_bought' && offer.counter_amount ? ` · ${formatCheckoutCurrency(offer.counter_amount)}` : ''}
                          </span>
                          {offer.decided_at && <> · {formatOfferDeadline(offer.decided_at)}</>}
                        </p>
                        {offer.order_id && (
                          <p><a href={`${adminBasePath}/orders/${offer.order_id}`} className="font-bold underline" style={{ color: 'var(--color-primary)' }}>{offer.order_number ?? 'Open the order'}</a></p>
                        )}
                        {offer.status === 'failed' && offer.last_error && <p style={{ color: 'var(--color-error)' }}>{offer.last_error}</p>}
                        {offer.hold_status === 'release_failed' && <p style={{ color: 'var(--color-error)' }}>PayPal has not released the hold yet — retried every 15 minutes.</p>}
                      </>
                    )}
                  </div>

                  <div className="offer-buyer text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <span className="offer-buyer-name">{name}</span>
                    <span className="offer-sep"> · </span>
                    <a href={`tel:${offer.customer_phone}`} className="underline">{offer.customer_phone}</a>
                    <span className="offer-sep"> · </span>
                    <a href={`mailto:${offer.customer_email}`} className="underline offer-email">{offer.customer_email}</a>
                    {offer.message && <p className="offer-quote">&ldquo;{offer.message}&rdquo;</p>}
                    {offer.counter_note && (offer.status !== 'open') && (
                      <p className="offer-quote offer-your-note"><strong>Your message:</strong> {offer.counter_note}</p>
                    )}
                  </div>

                  {(open || (countered && left > 0)) && (
                    <div className="offer-actions">
                      {open && (
                        <>
                          <button type="button" className="gold-button offer-accept" disabled={busy} onClick={() => openPanel(offer.id, 'accept')}>
                            Accept &amp; charge<span className="offer-phone-only">&nbsp;{formatCheckoutCurrency(offer.total)}</span>
                          </button>
                          <button type="button" className="outline-button" disabled={busy} onClick={() => openPanel(offer.id, 'counter')}>Counter</button>
                          <button type="button" className="outline-button" disabled={busy} onClick={() => openPanel(offer.id, 'decline')}>Decline</button>
                        </>
                      )}
                      {countered && (
                        <button type="button" className="outline-button offer-accept" disabled={busy} onClick={() => void act(offer, 'resend-counter')}>Send the link again</button>
                      )}
                    </div>
                  )}

                  {/* A trash-can on a finished offer only (mockup v4) — the same
                      red outline + icon as the Buy Receipts log. */}
                  {!offerDeleteBlock(offer) && (
                    <button
                      type="button"
                      className="outline-button offer-trash"
                      style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                      disabled={busy || deleteBusy}
                      aria-label={`Delete the offer from ${name}`}
                      title="Delete"
                      onClick={() => askDeleteOne(offer)}
                    >
                      <AppIcon name="delete" className="text-[1rem]" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {panelOpen && panel.kind === 'accept' && (
                  <div className="offer-panel" style={{ borderColor: '#e9c349', background: '#fffbea' }}>
                    <strong>Accept {formatCheckoutCurrency(offer.amount)} from {name}?</strong>{' '}
                    PayPal charges <strong>{formatCheckoutCurrency(offer.total)}</strong> now. The item is marked <strong>SOLD</strong>, a paid order is created and {first} gets the receipt. Any other open offer on this item is declined and released.
                    {!offer.product_available && <p className="mt-1" style={{ color: 'var(--color-error)' }}>This item is no longer marked available — accepting will close the offer instead.</p>}
                    <div className="offer-panel-buttons">
                      <button type="button" className="gold-button" disabled={busy} onClick={() => void act(offer, 'accept')}>
                        {busy ? 'Charging…' : `Yes, accept and charge ${formatCheckoutCurrency(offer.total)}`}
                      </button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {panelOpen && panel.kind === 'counter' && (
                  <div className="offer-panel" style={{ borderColor: '#9cc2a8', background: '#f4f8f5' }}>
                    <strong>Counter {first}&apos;s {formatCheckoutCurrency(offer.amount)}</strong>
                    <label className="form-label mt-3" htmlFor={`counter-amount-${offer.id}`}>Your price</label>
                    <span className="relative block" style={{ maxWidth: 220 }}>
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: 'var(--color-primary)' }}>$</span>
                      <input
                        id={`counter-amount-${offer.id}`}
                        className="form-field"
                        inputMode="decimal"
                        aria-label="Counter-offer amount"
                        style={{ paddingLeft: '1.6rem' }}
                        value={counterAmount}
                        onChange={(event) => setCounterAmount(event.target.value)}
                      />
                    </span>
                    {listed != null && <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Between {formatCheckoutCurrency(offer.amount)} and today&apos;s {formatCheckoutCurrency(listed)}.</p>}
                    <MessageBox id={`counter-note-${offer.id}`} first={first} value={note} onChange={setNote} />
                    <p className="mt-2">
                      Sending this <strong>releases {first}&apos;s {formatCheckoutCurrency(offer.total)} hold</strong> and emails a private link: <strong>Buy now</strong> at your price, good for <strong>72 hours</strong>. {first} pays the normal way and the sale completes by itself. Until someone pays, the item stays for sale to everyone.
                    </p>
                    <div className="offer-panel-buttons">
                      <button type="button" className="gold-button" disabled={busy || !counterAmount.trim()} onClick={() => void act(offer, 'counter')}>
                        {busy ? 'Sending…' : 'Send counter-offer'}
                      </button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {panelOpen && panel.kind === 'decline' && (
                  <div className="offer-panel" style={{ borderColor: BORDER, background: '#fafaf8' }}>
                    <strong>Decline {first}&apos;s {formatCheckoutCurrency(offer.amount)}?</strong> The {formatCheckoutCurrency(offer.total)} hold is released and {first} gets a polite email.
                    <MessageBox id={`decline-note-${offer.id}`} first={first} value={note} onChange={setNote} />
                    <div className="offer-panel-buttons">
                      <button type="button" className="gold-button" disabled={busy} onClick={() => void act(offer, 'decline')}>{busy ? 'Declining…' : 'Yes, decline and send'}</button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleting && (
        <AdminModal title={deleting.title} onClose={() => { if (!deleteBusy) setDeleting(null); }}>
          <div className="grid gap-3">
            {deleting.first && <p className="text-sm font-semibold">{deleting.first}</p>}
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>{deleting.body}</p>
            {deleteError && <p role="alert" className="text-sm" style={{ color: 'var(--color-error)' }}>{deleteError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="outline-button text-xs" disabled={deleteBusy} onClick={() => setDeleting(null)}>
                {deleting.ids.length === 1 ? 'Keep it' : 'Keep them'}
              </button>
              <button
                type="button"
                className="gold-button text-xs offer-delete-confirm"
                style={{ background: 'var(--color-error)', boxShadow: 'none' }}
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? 'Deleting…' : deleting.confirm}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        An accepted offer opens its new order under Orders. If PayPal ever refuses the charge, the offer reads &ldquo;Payment failed&rdquo; and nothing is marked sold.
      </p>

      <style jsx>{`
        /* Computer: one row — photo · title over buyer · money · clock · buttons. */
        .offer-card {
          padding: 1rem;
        }
        .offer-grid {
          display: grid;
          grid-template-columns: 64px minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) auto;
          grid-template-areas:
            'thumb title money clock actions'
            'thumb buyer money clock actions';
          column-gap: 1rem;
          row-gap: 0.25rem;
          align-items: center;
        }
        .offer-thumb { grid-area: thumb; width: 64px; height: 64px; object-fit: cover; align-self: start; }
        .offer-title { grid-area: title; align-self: end; }
        .offer-buyer { grid-area: buyer; align-self: start; min-width: 0; }
        .offer-money { grid-area: money; }
        .offer-clock { grid-area: clock; }
        .offer-actions { grid-area: actions; display: grid; gap: 0.4rem; min-width: 150px; }
        .offer-card { position: relative; }
        .offer-trash { grid-area: actions; justify-self: end; padding-left: 0.7rem; padding-right: 0.7rem; }
        .offer-amount { font-size: 1.5rem; font-weight: 700; white-space: nowrap; line-height: 1.15; }
        .offer-money-top { display: flex; flex-direction: column; }
        .offer-pct { white-space: nowrap; }
        .offer-sub { margin-top: 0.1rem; }
        .offer-clock-label { font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
        .offer-clock[data-tone='open'] .offer-clock-label { color: #8a6a00; }
        .offer-clock[data-tone='urgent'] .offer-clock-label { color: var(--color-error); }
        .offer-clock[data-tone='countered'] .offer-clock-label { color: #16653c; }
        .offer-clock[data-tone='closed'] .offer-clock-label { color: var(--color-on-surface-variant); }
        .offer-buyer-name { color: var(--color-on-surface); }
        .offer-email { overflow-wrap: anywhere; }
        .offer-quote { margin-top: 0.35rem; font-style: italic; }
        .offer-your-note { font-style: normal; }
        .offer-phone-only { display: none; }
        .offer-panel { margin-top: 0.75rem; border: 1px solid; padding: 0.75rem 1rem; font-size: 0.875rem; }
        .offer-panel-buttons { margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .offer-panel :global(.offer-message-box) { width: 100%; min-height: 5rem; resize: vertical; }

        /* Phone (mockup v3): one column — what, how much, how long, who — then
           the buttons. The amount gets the full width, so it never wraps. */
        @media (max-width: 860px) {
          .offer-card { padding: 0; }
          .offer-grid {
            grid-template-columns: 56px minmax(0, 1fr);
            grid-template-areas:
              'thumb title'
              'money money'
              'clock clock'
              'buyer buyer'
              'actions actions';
            column-gap: 0.75rem;
            row-gap: 0;
            align-items: start;
          }
          .offer-thumb { width: 56px; height: 56px; margin: 0.875rem 0 0 0.875rem; }
          .offer-title { align-self: start; padding: 0.875rem 0.875rem 0.75rem 0; font-size: 0.95rem; }
          .offer-money { padding: 0 0.875rem 0.75rem; font-size: 0.8rem; }
          .offer-money-top { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
          .offer-amount { font-size: 1.9rem; }
          .offer-pct { text-align: right; }
          .offer-sub { margin-top: 0.25rem; }
          .offer-clock {
            margin: 0 0.875rem 0.75rem;
            padding: 0.5rem 0.7rem;
            border: 1px solid #e3e0d8;
            background: #f3f3f1;
            font-size: 0.8rem;
          }
          .offer-clock[data-tone='open'] { background: #fff7dd; border-color: #ecd58a; }
          .offer-clock[data-tone='urgent'] { background: #fdeceb; border-color: #f2b8b5; }
          .offer-clock[data-tone='countered'] { background: #f4f8f5; border-color: #9cc2a8; }
          .offer-buyer { border-top: 1px solid #eee; padding: 0.75rem 0.875rem; font-size: 0.85rem; }
          .offer-buyer-name { display: block; font-weight: 800; }
          .offer-buyer a { display: block; margin-top: 0.2rem; color: var(--color-primary); }
          .offer-sep { display: none; }
          .offer-quote {
            margin-top: 0.6rem;
            padding: 0.5rem 0.65rem;
            background: #f6f4ee;
            border-left: 3px solid #d8c78f;
          }
          .offer-actions {
            border-top: 1px solid #eee;
            padding: 0.75rem 0.875rem 0.875rem;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem;
            min-width: 0;
          }
          .offer-actions :global(.offer-accept) { grid-column: 1 / -1; }
          .offer-phone-only { display: inline; }
          /* An open message box takes the buttons' place, as drawn. */
          .offer-card[data-panel='open'] .offer-actions { display: none; }
          .offer-panel { margin: 0 0.875rem 0.875rem; padding: 0.75rem; }
          .offer-panel-buttons { display: grid; }
          /* The trash-can sits in the card's top-right corner (mockup v4). */
          .offer-trash { position: absolute; top: 0.75rem; right: 0.75rem; width: 2.2rem; height: 2.2rem; padding: 0; }
          .offer-card[data-deletable='true'] .offer-title { padding-right: 3.25rem; }
        }
      `}</style>
    </div>
  );
}
