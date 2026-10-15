'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OFFER_FILTERS,
  OFFER_FILTER_LABELS,
  OFFER_STATUS_LABELS,
  formatOfferDeadline,
  hoursLeft,
  percentOfListed,
  shippingMethodLabel,
  type OfferFilter,
  type OfferStatus,
} from '@/lib/offers';
import { formatCheckoutCurrency } from '@/lib/checkout-pricing';

/**
 * Admin → Offers (site shop "Make an Offer", owner mockup v2, 2026-10-15).
 * Open offers first, soonest deadline on top. Accept charges the held money at
 * once (paid order, item SOLD); Counter releases the hold and emails a private
 * Buy-now link; Decline releases the hold. Every action asks first.
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
type Notice = { ok: boolean; text: string; link?: string } | null;

const BORDER = 'var(--color-outline-variant)';

export default function OffersPanel({ adminBasePath }: { adminBasePath: string }) {
  const [filter, setFilter] = useState<OfferFilter>('open');
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

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

  async function act(offer: AdminOffer, action: 'accept' | 'decline' | 'counter' | 'resend-counter') {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/offers/${encodeURIComponent(offer.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount: counterAmount, note: counterNote }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'That did not work.');
      const first = offer.customer_name.split(' ')[0];
      if (action === 'accept') {
        setNotice({
          ok: !data.itemConflict,
          text: data.itemConflict
            ? `Charged, but the item had already sold — order ${data.orderNumber} is flagged for a refund. See Orders.`
            : `Accepted — ${first} was charged ${formatCheckoutCurrency(offer.total)}. Order ${data.orderNumber} is paid and the item is SOLD; ${first} gets the receipt.`,
          link: `${adminBasePath}/orders/${data.orderId}`,
        });
      } else if (action === 'decline') {
        setNotice({ ok: true, text: `Declined — ${first}'s hold was released and they were emailed.` });
      } else {
        setNotice({
          ok: data.emailed !== false,
          text: data.emailed === false
            ? `Counter saved and ${first}'s hold released, but the email did not send. Send them this link yourself:`
            : action === 'resend-counter'
              ? `A fresh Buy-now link was emailed to ${first} (the old one no longer works).`
              : `Counter sent — ${first}'s hold was released and they were emailed a Buy-now link for 72 hours.`,
          link: data.link,
        });
      }
      setPanel(null);
      setCounterAmount('');
      setCounterNote('');
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
            const left = offer.status === 'open' ? hoursLeft(offer.expires_at) : offer.status === 'countered' ? hoursLeft(offer.counter_expires_at) : 0;
            const urgent = left < 12;
            const first = offer.customer_name.split(' ')[0];
            const open = offer.status === 'open';
            return (
              <div key={offer.id} className="offer-row border bg-white p-4" style={{ borderColor: BORDER }}>
                <div className="offer-row-grid">
                  {offer.product_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.product_image} alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 64, height: 64, background: 'var(--color-surface-container)' }} />
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="font-bold" style={{ color: 'var(--color-on-surface)' }}>
                      {offer.product_title}{offer.product_inventory_number ? ` · #${offer.product_inventory_number}` : ''}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {offer.customer_name} · <a href={`tel:${offer.customer_phone}`} className="underline">{offer.customer_phone}</a> · <a href={`mailto:${offer.customer_email}`} className="underline">{offer.customer_email}</a>
                    </p>
                    {offer.message && <p className="mt-1 text-xs italic" style={{ color: 'var(--color-on-surface-variant)' }}>&ldquo;{offer.message}&rdquo;</p>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}>{formatCheckoutCurrency(offer.amount)}</p>
                    {listed != null && <p>Listed now {formatCheckoutCurrency(listed)}{pct != null ? <> · <strong>{pct}%</strong></> : null}</p>}
                    <p>{shippingMethodLabel(offer.shipping_method)} · {open ? 'held' : 'total'} {formatCheckoutCurrency(offer.total)}</p>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {open ? (
                      <>
                        <p className="font-extrabold uppercase tracking-[0.1em]" style={{ color: urgent ? 'var(--color-error)' : '#8a6a00' }}>⏱ {left} h left</p>
                        <p>Answer by {formatOfferDeadline(offer.expires_at)}</p>
                      </>
                    ) : offer.status === 'countered' ? (
                      <>
                        <p className="font-extrabold uppercase tracking-[0.1em]" style={{ color: '#16653c' }}>Countered {formatCheckoutCurrency(offer.counter_amount ?? 0)}</p>
                        <p>{left} h left · link until {formatOfferDeadline(offer.counter_expires_at)}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-extrabold uppercase tracking-[0.1em]" style={{ color: offer.status === 'accepted' || offer.status === 'counter_bought' ? '#16653c' : 'var(--color-on-surface-variant)' }}>
                          {OFFER_STATUS_LABELS[offer.status]}
                          {offer.status === 'counter_bought' && offer.counter_amount ? ` · ${formatCheckoutCurrency(offer.counter_amount)}` : ''}
                        </p>
                        {offer.decided_at && <p>{formatOfferDeadline(offer.decided_at)}</p>}
                        {offer.order_id && (
                          <p><a href={`${adminBasePath}/orders/${offer.order_id}`} className="font-bold underline" style={{ color: 'var(--color-primary)' }}>{offer.order_number ?? 'Open the order'}</a></p>
                        )}
                        {offer.status === 'failed' && offer.last_error && <p style={{ color: 'var(--color-error)' }}>{offer.last_error}</p>}
                        {offer.hold_status === 'release_failed' && <p style={{ color: 'var(--color-error)' }}>PayPal has not released the hold yet — retried every 15 minutes.</p>}
                      </>
                    )}
                  </div>
                  <div className="offer-row-actions">
                    {open && (
                      <>
                        <button type="button" className="gold-button" disabled={busy} onClick={() => setPanel({ id: offer.id, kind: 'accept' })}>Accept &amp; charge</button>
                        <button
                          type="button"
                          className="outline-button"
                          disabled={busy}
                          onClick={() => { setPanel({ id: offer.id, kind: 'counter' }); setCounterAmount(''); setCounterNote(''); }}
                        >
                          Counter
                        </button>
                        <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel({ id: offer.id, kind: 'decline' })}>Decline</button>
                      </>
                    )}
                    {offer.status === 'countered' && left > 0 && (
                      <button type="button" className="outline-button" disabled={busy} onClick={() => void act(offer, 'resend-counter')}>Send the link again</button>
                    )}
                  </div>
                </div>

                {panel?.id === offer.id && panel.kind === 'accept' && (
                  <div className="mt-3 border px-4 py-3 text-sm" style={{ borderColor: '#e9c349', background: '#fffbea' }}>
                    <strong>Accept {formatCheckoutCurrency(offer.amount)} from {offer.customer_name}?</strong>{' '}
                    PayPal charges <strong>{formatCheckoutCurrency(offer.total)}</strong> now. The item is marked <strong>SOLD</strong>, a paid order is created and {first} gets the receipt. Any other open offer on this item is declined and released.
                    {!offer.product_available && <p className="mt-1" style={{ color: 'var(--color-error)' }}>This item is no longer marked available — accepting will close the offer instead.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="gold-button" disabled={busy} onClick={() => void act(offer, 'accept')}>
                        {busy ? 'Charging…' : `Yes, accept and charge ${formatCheckoutCurrency(offer.total)}`}
                      </button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {panel?.id === offer.id && panel.kind === 'counter' && (
                  <div className="mt-3 border px-4 py-3 text-sm" style={{ borderColor: '#9cc2a8', background: '#f4f8f5' }}>
                    <div className="flex flex-wrap items-center gap-3">
                      <strong>Counter {first}&apos;s {formatCheckoutCurrency(offer.amount)}</strong>
                      <span className="relative inline-block" style={{ width: 170 }}>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: 'var(--color-primary)' }}>$</span>
                        <input
                          className="form-field"
                          inputMode="decimal"
                          aria-label="Counter-offer amount"
                          style={{ paddingLeft: '1.6rem' }}
                          value={counterAmount}
                          onChange={(event) => setCounterAmount(event.target.value)}
                        />
                      </span>
                      {listed != null && <small style={{ color: 'var(--color-on-surface-variant)' }}>between {formatCheckoutCurrency(offer.amount)} and today&apos;s {formatCheckoutCurrency(listed)}</small>}
                    </div>
                    <label className="form-label mt-3" htmlFor={`counter-note-${offer.id}`}>Note to {first} (optional)</label>
                    <input id={`counter-note-${offer.id}`} className="form-field" maxLength={300} value={counterNote} onChange={(event) => setCounterNote(event.target.value)} />
                    <p className="mt-2">
                      Sending this <strong>releases {first}&apos;s {formatCheckoutCurrency(offer.total)} hold</strong> and emails a private link: <strong>Buy now</strong> at your price, good for <strong>72 hours</strong>. {first} pays the normal way and the sale completes by itself. Until someone pays, the item stays for sale to everyone.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="gold-button" disabled={busy || !counterAmount.trim()} onClick={() => void act(offer, 'counter')}>
                        {busy ? 'Sending…' : 'Send counter-offer'}
                      </button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {panel?.id === offer.id && panel.kind === 'decline' && (
                  <div className="mt-3 border px-4 py-3 text-sm" style={{ borderColor: BORDER, background: '#fafaf8' }}>
                    <strong>Decline {first}&apos;s {formatCheckoutCurrency(offer.amount)}?</strong> The {formatCheckoutCurrency(offer.total)} hold is released and {first} gets a polite &ldquo;not accepted this time&rdquo; email.
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="gold-button" disabled={busy} onClick={() => void act(offer, 'decline')}>{busy ? 'Declining…' : 'Yes, decline'}</button>
                      <button type="button" className="outline-button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        An accepted offer opens its new order under Orders. If PayPal ever refuses the charge, the offer reads &ldquo;Payment failed&rdquo; and nothing is marked sold.
      </p>

      <style jsx>{`
        .offer-row-grid {
          display: grid;
          grid-template-columns: 64px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: center;
        }
        .offer-row-actions {
          display: grid;
          gap: 0.4rem;
          min-width: 150px;
        }
        @media (max-width: 860px) {
          .offer-row-grid {
            grid-template-columns: 64px minmax(0, 1fr);
          }
          .offer-row-actions {
            grid-column: 1 / -1;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
