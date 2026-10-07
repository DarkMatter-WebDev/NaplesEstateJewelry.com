'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { formatUsPhone } from '@/lib/subscriber-phone';
import { DEFAULT_DEAL_MESSAGE, DEAL_MESSAGE_MAX, DEAL_TITLE_MAX } from '@/lib/text-alerts/deal-input';
import { DEAL_PHOTO_MAX, formatPictureBytes } from '@/lib/text-alerts/deal-photos';
import { DEFAULT_SOLD_REPLY, dealText } from '@/lib/text-alerts/messages';

/**
 * Admin → Text Deals (owner mockup v2 sections 3b + 3c, 2026-09-15).
 *
 * Left: the composer (photos, price, one line, message) → Preview renders the
 * pictures on the server → Send a test to the owner's cell → Send to N.
 * Up to five photos (owner, 2026-10-07): the first is the main picture, with
 * the shop name and the price drawn on it; the rest are detail shots with a
 * small price strip — all in one text. Phones show them in a random order,
 * which is why every picture carries the price. The rules live in
 * `lib/text-alerts/deal-photos.ts`.
 * Right: the deal list; a selected deal shows its send tally and the replies
 * in clock order with the first flagged, plus Mark sold / Mark available.
 * Mark sold goes to the first reply, or — owner, 2026-10-07 — to any other
 * reply ("Mark sold" on its row, asked once more before it texts anyone), or
 * "to someone else" (a walk-in): no buyer text, everyone the deal reached is
 * told it is taken.
 * Sold sends the polite one-liner to anyone who answers late (wording
 * editable, owner's call 2026-09-15).
 */
type Deal = {
  id: string;
  title: string;
  price_text: string;
  message: string;
  photo_path: string | null;
  card_path: string | null;
  status: 'draft' | 'sending' | 'sent' | 'sold';
  recipients_count: number;
  sent_at: string | null;
  sold_at: string | null;
  sold_to_phone: string | null;
  sold_reply_text: string | null;
  created_at: string;
};

type Reply = {
  id: number;
  from_phone: string;
  body: string | null;
  num_media: number;
  received_at: string;
  forwarded_at: string | null;
  forward_error: string | null;
  auto_reply_sent_at: string | null;
  name: string | null;
  first: boolean;
};

type Photo = { path: string; url: string };
type Picture = { url: string; bytes: number; main: boolean };

type Detail = { deal: Deal & { card_url: string | null; photos: Photo[]; media_urls: string[] }; tally: Record<string, number>; replies: Reply[] };

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
});
const formatWhen = (value: string | null) => (value ? dateFormatter.format(new Date(value)) : '');

const STATUS_LABEL: Record<Deal['status'], string> = { draft: 'Draft', sending: 'Sending…', sent: 'Sent', sold: 'Sold' };

async function readJson(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data;
}

export default function TextDealsManager({ configured, forwardTo }: { configured: boolean; forwardTo: string }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [confirmed, setConfirmed] = useState(0);
  const [pending, setPending] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Composer state (a draft is created on the first save so the photo has a home).
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState(DEFAULT_DEAL_MESSAGE);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pictures, setPictures] = useState<Picture[] | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [soldReply, setSoldReply] = useState(DEFAULT_SOLD_REPLY);
  const [reopenedFrom, setReopenedFrom] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const data = await readJson(await fetch('/api/admin/text-deals'));
    setDeals(data.deals ?? []);
    setConfirmed(data.confirmed ?? 0);
    setPending(data.pending ?? 0);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetail((current) => (current?.deal.id === id ? current : null));
    const data = (await readJson(await fetch(`/api/admin/text-deals/${id}`))) as Detail;
    setDetail(data);
    setSoldReply(data.deal.sold_reply_text || DEFAULT_SOLD_REPLY);
  }, []);

  // Loads run from a queued callback, not the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    queueMicrotask(() => {
      loadList().catch((err) => setNotice({ text: err instanceof Error ? err.message : 'Could not load deals.', ok: false }));
    });
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    queueMicrotask(() => {
      loadDetail(selectedId).catch((err) => setNotice({ text: err instanceof Error ? err.message : 'Could not load the deal.', ok: false }));
    });
  }, [selectedId, loadDetail]);

  // Live text preview of what rides with the picture.
  const previewText = useMemo(() => dealText({ title: title || '…', price: price ? (price.startsWith('$') ? price : `$${price}`) : '$…', message }), [title, price, message]);

  async function saveDraft(): Promise<string> {
    const payload = { title, price, message };
    if (draftId) {
      const data = await readJson(await fetch(`/api/admin/text-deals/${draftId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
      setPictures(null);
      setDeals((current) => current.map((d) => (d.id === draftId ? data.deal : d)));
      return draftId;
    }
    const data = await readJson(await fetch('/api/admin/text-deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    setDraftId(data.deal.id);
    setDeals((current) => [data.deal, ...current]);
    return data.deal.id as string;
  }

  async function onPhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    const files = picked.slice(0, Math.max(DEAL_PHOTO_MAX - photos.length, 0));
    const leftOut = picked.length - files.length;
    if (files.length === 0) { setNotice({ text: `A deal holds up to ${DEAL_PHOTO_MAX} photos. Remove one to add another.`, ok: false }); return; }
    setBusy('photo');
    setNotice(null);
    let added = 0;
    try {
      const id = await saveDraft();
      // One photo per request, in the order picked: the first photo on a deal is the main one.
      for (const file of files) {
        setUploading(`Uploading ${added + 1} of ${files.length}…`);
        const data = await readJson(await fetch(`/api/admin/text-deals/photo?dealId=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }));
        setPhotos(data.photos ?? []);
        setPictures(null);
        added += 1;
      }
      setNotice({ text: `${added === 1 ? 'Photo' : `${added} photos`} saved.${leftOut > 0 ? ` ${leftOut} left out — a deal holds up to ${DEAL_PHOTO_MAX}.` : ''} Preview to see the price on ${photos.length + added === 1 ? 'it' : 'them'}.`, ok: leftOut === 0 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Could not upload the photo.';
      setNotice({ text: added > 0 ? `${added} of ${files.length} saved, then: ${reason}` : reason, ok: false });
    } finally {
      setUploading(null);
      setBusy(null);
    }
  }

  async function changePhotos(action: 'remove' | 'main', path: string) {
    if (!draftId) return;
    setBusy('photo');
    setNotice(null);
    try {
      const base = `/api/admin/text-deals/photo?dealId=${encodeURIComponent(draftId)}`;
      const data = await readJson(action === 'remove'
        ? await fetch(`${base}&path=${encodeURIComponent(path)}`, { method: 'DELETE' })
        : await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ main: path }) }));
      setPhotos(data.photos ?? []);
      setPictures(null);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not change the photos.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function onPreview(event?: FormEvent) {
    event?.preventDefault();
    setBusy('preview');
    setNotice(null);
    try {
      const id = await saveDraft();
      if (photos.length === 0) throw new Error('Add a photo first.');
      const data = (await readJson(await fetch('/api/admin/text-deals/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dealId: id }) }))) as { pictures: Picture[]; totalBytes: number };
      setPictures(data.pictures);
      setNotice({ text: `${data.pictures.length === 1 ? 'Picture' : `${data.pictures.length} pictures`} ready (${formatPictureBytes(data.totalBytes)}).`, ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not render the pictures.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    if (!draftId) { setNotice({ text: 'Preview first.', ok: false }); return; }
    setBusy('test');
    setNotice(null);
    try {
      const data = await readJson(await fetch(`/api/admin/text-deals/${draftId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) }));
      setNotice({ text: `Test sent to ${formatUsPhone(data.to)}.`, ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not send the test.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function onSend() {
    if (!draftId || !pictures) { setNotice({ text: 'Preview first, then send.', ok: false }); return; }
    if (!window.confirm(`Send this deal to ${confirmed} confirmed number${confirmed === 1 ? '' : 's'}?`)) return;
    setBusy('send');
    setNotice(null);
    try {
      const data = await readJson(await fetch(`/api/admin/text-deals/${draftId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }));
      setNotice({ text: data.finished ? `Sent to ${data.sent}${data.failed ? `, ${data.failed} failed` : ''}.` : `Sending: ${data.sent} so far, ${data.remaining} to go (the sweep finishes it).`, ok: true });
      const id = draftId;
      setDraftId(null); setTitle(''); setPrice(''); setMessage(DEFAULT_DEAL_MESSAGE); setPhotos([]); setPictures(null); setReopenedFrom(null);
      await loadList();
      setSelectedId(id);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not send the deal.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function setSold(action: 'sold' | 'available', soldToPhone?: string) {
    if (!detail) return;
    setBusy(action);
    setNotice(null);
    try {
      const result = await readJson(await fetch(`/api/admin/text-deals/${detail.deal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, soldToPhone, replyText: soldReply }) })) as { notified?: { winner: string; others: { sent: number; failed: number; already: number } } };
      await Promise.all([loadList(), loadDetail(detail.deal.id)]);
      if (action === 'sold') {
        const n = result.notified;
        const buyer = n?.winner === 'sent' ? 'The buyer got a confirmation text.' : n?.winner === 'already' ? 'The buyer was already texted.' : n?.winner === 'failed' ? 'The buyer text FAILED — text them yourself.' : 'Sold to someone else — nobody got the buyer text.';
        const others = n ? `${n.others.sent} other${n.others.sent === 1 ? '' : 's'} told it's taken${n.others.failed ? ` (${n.others.failed} failed)` : ''}${n.others.already ? ` (${n.others.already} already told)` : ''}.` : '';
        setNotice({ text: `Marked sold. ${buyer} ${others} Late replies get the auto-reply.`.replace(/\s+/g, ' '), ok: n?.winner !== 'failed' });
      } else {
        setNotice({ text: 'Marked available again.', ok: true });
      }
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not update the deal.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  /** "Mark sold" on a reply's row: that person is the buyer, whoever answered first. Asks once — the wrong row would text the wrong person. */
  function sellToReply(reply: Reply) {
    const who = reply.name ?? formatUsPhone(reply.from_phone);
    if (!window.confirm(`Mark sold to ${who}? They get the "It's yours" text, and everyone else who got the deal is told it is taken.`)) return;
    void setSold('sold', reply.from_phone);
  }

  async function onReopen() {
    if (!detail) return;
    setBusy('reopen');
    setNotice(null);
    try {
      const data = await readJson(await fetch(`/api/admin/text-deals/${detail.deal.id}/reopen`, { method: 'POST' }));
      const d = data.deal;
      setDraftId(d.id); setTitle(d.title); setPrice(d.price_text); setMessage(d.message);
      setPhotos(d.photos ?? []); setPictures(null);
      setReopenedFrom(detail.deal.id);
      await loadList();
      setSelectedId(null); setDetail(null);
      setNotice({ text: 'Reopened as a new draft with the same photos and price. Edit the message, Preview, then Send.', ok: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not reopen the deal.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!detail) return;
    if (!window.confirm(`Delete "${detail.deal.title}"? Its replies stay on file but lose the link to this deal. This cannot be undone.`)) return;
    setBusy('delete');
    setNotice(null);
    try {
      await readJson(await fetch(`/api/admin/text-deals/${detail.deal.id}`, { method: 'DELETE' }));
      if (draftId === detail.deal.id) { setDraftId(null); setTitle(''); setPrice(''); setMessage(DEFAULT_DEAL_MESSAGE); setPhotos([]); setPictures(null); setReopenedFrom(null); }
      setSelectedId(null); setDetail(null);
      await loadList();
      setNotice({ text: 'Deal deleted.', ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not delete the deal.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  const label = 'block text-[0.62rem] font-bold uppercase tracking-[0.2em] mb-1';
  const labelStyle = { color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' } as const;

  return (
    <>
      {notice && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm" role="status" style={{ background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <form className="rounded-[1.25rem] border bg-white p-5 grid gap-4" style={{ borderColor: 'var(--color-outline-variant)' }} onSubmit={onPreview}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{reopenedFrom ? 'Reopened deal — edit & resend' : 'New text deal'}</h2>
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{confirmed} confirmed · {pending} pending YES</span>
          </div>

          <div>
            <span className={label} style={labelStyle}>Photos · {photos.length} of {DEAL_PHOTO_MAX}</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="outline-button text-xs cursor-pointer" style={busy !== null || photos.length >= DEAL_PHOTO_MAX ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
                {uploading ?? 'Add photos'}
                <input type="file" accept="image/*" multiple onChange={onPhotos} disabled={busy !== null || photos.length >= DEAL_PHOTO_MAX} className="sr-only" />
              </label>
              <span className="text-xs" style={{ color: photos.length > 0 ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>{photos.length === 0 ? 'No photos yet' : photos.length === 1 ? '1 photo saved' : `${photos.length} photos saved`}</span>
            </div>
            {photos.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-2.5">
                {photos.map((photo, index) => (
                  <li key={photo.path} className="w-20 sm:w-[100px]">
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-black" style={index === 0 ? { border: '2px solid var(--color-primary-container)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary-container) 22%, transparent)' } : { border: '1px solid var(--color-outline-variant)' }}>
                      <img src={photo.url} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => changePhotos('remove', photo.path)} disabled={busy !== null} aria-label={`Remove photo ${index + 1}`} title="Remove" className="absolute right-1 top-1 h-[22px] w-[22px] rounded-full text-[13px] font-bold leading-[20px] text-white disabled:opacity-50" style={{ background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.75)' }}>×</button>
                      {index === 0 && <span className="absolute inset-x-0 bottom-0 py-[3px] text-center text-[0.6rem] font-bold uppercase tracking-[0.16em]" style={{ background: 'var(--color-primary-container)', color: '#171717' }}>Main</span>}
                    </div>
                    {index === 0 ? (
                      <span className="mt-1 flex justify-center whitespace-nowrap text-[0.62rem] sm:text-[0.7rem]" style={{ color: 'var(--color-on-surface-variant)' }}>Shop name + price</span>
                    ) : (
                      <button type="button" onClick={() => changePhotos('main', photo.path)} disabled={busy !== null} className="mt-1 block w-full text-center text-[0.7rem] font-bold underline disabled:opacity-50" style={{ color: 'var(--color-primary)' }}>Make main</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <span className="mt-1 block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Up to {DEAL_PHOTO_MAX}: one main picture (shop name + price) and up to {DEAL_PHOTO_MAX - 1} detail shots with a small price strip. All go out in one text.</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
            <label className="block">
              <span className={label} style={labelStyle}>Price</span>
              <input className="form-field w-full" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1460" required />
            </label>
            <label className="block">
              <span className={label} style={labelStyle}>One line</span>
              <input className="form-field w-full" value={title} maxLength={DEAL_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="14K rope chain · 22 in · 18.4 g" required />
            </label>
          </div>

          <label className="block">
            <span className={label} style={labelStyle}>Message</span>
            <textarea className="form-field w-full min-h-[72px]" value={message} maxLength={DEAL_MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} />
            <span className="mt-1 block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>&quot;Reply STOP to opt out&quot; is added automatically.</span>
          </label>

          <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}>
            <span className="font-bold">Text as it will read:</span> {previewText}
          </div>

          <div>
            <span className={label} style={labelStyle}>Pictures as they will be sent{pictures ? ` · ${pictures.length === 1 ? '1 picture' : `${pictures.length} pictures`} · ${formatPictureBytes(pictures.reduce((sum, picture) => sum + picture.bytes, 0))}${pictures.length > 1 ? ' in all' : ''}` : ''}</span>
            {pictures ? (
              <div className="grid gap-3 sm:grid-cols-[1.25fr_1fr] items-start">
                <div>
                  <img src={pictures[0].url} alt="Main picture preview" className="w-full rounded-lg border" style={{ borderColor: 'var(--color-outline-variant)' }} />
                  <span className="mt-1 block text-[0.7rem]" style={{ color: 'var(--color-on-surface-variant)' }}>1 · main picture, with the price</span>
                </div>
                {pictures.length > 1 && (
                  <div>
                    <div className="grid grid-cols-2 gap-2">
                      {pictures.slice(1).map((picture, index) => (
                        <img key={picture.url} src={picture.url} alt={`Detail shot ${index + 1} preview`} className="aspect-square w-full rounded-lg border object-cover" style={{ borderColor: 'var(--color-outline-variant)' }} />
                      ))}
                    </div>
                    <span className="mt-1 block text-[0.7rem]" style={{ color: 'var(--color-on-surface-variant)' }}>{pictures.length === 2 ? '2 · detail shot, with the price strip' : `2–${pictures.length} · detail shots, with the price strip`}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs" style={{ borderColor: 'var(--color-outline-variant)', color: 'var(--color-on-surface-variant)' }}>Preview to render</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="outline-button text-xs" disabled={busy !== null}>{busy === 'preview' ? 'Rendering…' : 'Preview'}</button>
            <button type="button" className="outline-button text-xs" onClick={onTest} disabled={busy !== null || !configured || !pictures} title={configured ? '' : 'Twilio is not configured yet'}>
              {busy === 'test' ? 'Sending…' : `Send a test to ${formatUsPhone(forwardTo)}`}
            </button>
            <button type="button" className="gold-button text-xs" onClick={onSend} disabled={busy !== null || !configured || !pictures || confirmed === 0}>
              {busy === 'send' ? 'Sending…' : `Send to ${confirmed}`}
            </button>
          </div>
        </form>

        <div className="grid gap-4 content-start">
          <div className="rounded-[1.25rem] border bg-white p-5" style={{ borderColor: 'var(--color-outline-variant)' }}>
            <h2 className="text-lg font-bold mb-3" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Deals</h2>
            {deals.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>No deals yet.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--color-outline-variant)' }}>
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <button type="button" onClick={() => setSelectedId(deal.id)} className="w-full text-left py-2 flex items-center justify-between gap-3 hover:opacity-80" style={{ color: 'var(--color-on-surface)' }}>
                      <span className="text-sm"><span className="font-semibold">{deal.price_text}</span> · {deal.title}</span>
                      <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] whitespace-nowrap" style={{ color: deal.status === 'sold' ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}>
                        {STATUS_LABEL[deal.status]}{deal.sent_at ? ` · ${formatWhen(deal.sent_at)}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {detail && selectedId === detail.deal.id && (
            <div className="rounded-[1.25rem] border bg-white p-5 grid gap-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{detail.deal.price_text} · {detail.deal.title}</h3>
                  <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {STATUS_LABEL[detail.deal.status]}{detail.deal.sent_at ? ` · sent ${formatWhen(detail.deal.sent_at)} to ${detail.deal.recipients_count}` : ''}
                    {Object.keys(detail.tally).length > 0 && ` · ${Object.entries(detail.tally).map(([k, v]) => `${v} ${k}`).join(', ')}`}
                    {detail.deal.media_urls.length > 1 && ` · ${detail.deal.media_urls.length} pictures`}
                  </p>
                </div>
                {detail.deal.card_url && <img src={detail.deal.card_url} alt="" className="w-20 rounded border" style={{ borderColor: 'var(--color-outline-variant)' }} />}
              </div>

              <div>
                <span className={label} style={labelStyle}>Replies · first one flagged · all forwarded to {formatUsPhone(forwardTo)}</span>
                {detail.replies.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>No replies yet.</p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--color-outline-variant)' }}>
                    {detail.replies.map((reply, index) => (
                      <li key={reply.id} className="py-2 grid grid-cols-[auto_1fr_auto] gap-3 items-baseline text-sm" style={reply.first ? { background: '#fffbe8', margin: '0 -0.75rem', padding: '0.5rem 0.75rem', borderLeft: '3px solid var(--color-primary-container)' } : undefined}>
                        <span className="font-semibold whitespace-nowrap">{reply.name ?? formatUsPhone(reply.from_phone)}{reply.first && <span className="ml-1 text-[0.55rem] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--color-primary)' }}>1st</span>}</span>
                        <span>{reply.body || (reply.num_media ? '(photo)' : '(empty)')}{reply.auto_reply_sent_at ? <span className="ml-1 text-xs italic" style={{ color: 'var(--color-on-surface-variant)' }}>· sold reply sent</span> : null}{reply.forward_error ? <span className="ml-1 text-xs" style={{ color: 'var(--color-error)' }}>· not forwarded</span> : null}</span>
                        <span className="flex flex-col items-end gap-1">
                          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>{formatWhen(reply.received_at)}</span>
                          {/* One per person (their first reply), and only while the deal is still open. */}
                          {(detail.deal.status === 'sent' || detail.deal.status === 'sending') && detail.replies.findIndex((r) => r.from_phone === reply.from_phone) === index && (
                            <button type="button" onClick={() => sellToReply(reply)} disabled={busy !== null} className="-my-1 whitespace-nowrap py-2 pl-3 text-[0.7rem] font-bold underline disabled:opacity-50" style={{ color: 'var(--color-primary)' }}>Mark sold</button>
                          )}
                          {detail.deal.status === 'sold' && detail.deal.sold_to_phone === reply.from_phone && detail.replies.findIndex((r) => r.from_phone === reply.from_phone) === index && (
                            <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--color-primary)' }}>Buyer</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detail.deal.status !== 'draft' && (
                <div className="grid gap-2">
                  <label className="block">
                    <span className={label} style={labelStyle}>Auto-reply to late responders</span>
                    <input className="form-field w-full" value={soldReply} onChange={(e) => setSoldReply(e.target.value)} maxLength={200} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {detail.deal.status === 'sold' ? (
                      <>
                        <button type="button" className="outline-button text-xs" onClick={() => setSold('available')} disabled={busy !== null}>Mark still available</button>
                        <button type="button" className="gold-button text-xs" onClick={onReopen} disabled={busy !== null}>{busy === 'reopen' ? 'Reopening…' : 'Reopen — edit & resend'}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="gold-button text-xs" onClick={() => setSold('sold', detail.replies.find((r) => r.first)?.from_phone)} disabled={busy !== null}>
                          {detail.replies.find((r) => r.first) ? `Mark sold to ${detail.replies.find((r) => r.first)?.name ?? formatUsPhone(detail.replies.find((r) => r.first)!.from_phone)}` : 'Mark sold'}
                        </button>
                        {/* A walk-in or a call: sold, but to none of the replies — no phone goes with it. */}
                        {detail.replies.some((r) => r.first) && (
                          <button type="button" className="outline-button text-xs" onClick={() => setSold('sold')} disabled={busy !== null}>Mark sold to someone else</button>
                        )}
                      </>
                    )}
                  </div>
                  {detail.deal.status !== 'sold' && detail.replies.some((r) => r.first) && (
                    <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Sold to a later reply? Use &quot;Mark sold&quot; on that row. Someone else = a walk-in or anyone who did not reply: nobody gets the &quot;It&apos;s yours&quot; text; everyone who got the deal, the people who replied included, is told it is taken.</span>
                  )}
                </div>
              )}
              <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy !== null || detail.deal.status === 'sending'}
                  className="rounded-full border px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] disabled:opacity-40"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', fontFamily: 'var(--font-label)', background: 'white' }}
                  title={detail.deal.status === 'sending' ? 'Wait for the send to finish' : ''}
                >
                  {busy === 'delete' ? 'Deleting…' : 'Delete deal'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
