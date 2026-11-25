'use client';

import { useEffect, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import { emailFrameDocument, REBUILT_NOTE, type EmailCopyResponse } from '@/lib/email-copies';

/**
 * The email-viewer pop-up (owner, 2026-11-21, mockup 2: "click the record in
 * email history and see the email that went out to them in a popup modal").
 * Used by an order's Email History and a buy receipt's "Emailed to …" line.
 *
 * To / From / Subject / Sent on top, then the email itself in a SANDBOXED
 * frame (no `allow-scripts`; links open in a new tab), or its plain text.
 * A row sent before copies were kept comes back `rebuilt` and says so; one
 * that cannot be rebuilt shows why.
 */

export const EMAIL_FROM_LINE = 'Naples Estate Jewelry <noreply@naplesestatejewelry.com> · replies go to info@naplesestatejewelry.com';

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: EmailCopyResponse };

export default function EmailCopyViewer({
  title,
  url,
  to,
  subject,
  sentLabel,
  onClose,
  fromLine = EMAIL_FROM_LINE,
  sentTerm = 'Sent',
}: {
  /** "Pickup Receipt", "Update — Shipped", "Seller's copy" … */
  title: string;
  /** The viewer API for this one email; null = a row added on this page before its id was known. */
  url: string | null;
  to: string;
  subject: string | null;
  /** "Sat, Nov 21, 2026 · 2:15 PM · by admin@…" */
  sentLabel: string;
  onClose: () => void;
  /** The From line; Admin → Follow-ups sends as "Chris at Naples Estate Jewelry". */
  fromLine?: string;
  /** "Sent" — or "Sends" for a follow-up still in the queue (a preview). */
  sentTerm?: string;
}) {
  const [loaded, setLoaded] = useState<Loaded>(url ? { state: 'loading' } : { state: 'error', message: 'This email was just sent. Reload the page to view it.' });
  const [view, setView] = useState<'email' | 'text'>('email');

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as EmailCopyResponse & { error?: string };
        if (cancelled) return;
        if (!res.ok) setLoaded({ state: 'error', message: data.error ?? 'The email could not be loaded.' });
        else setLoaded({ state: 'ready', data });
      } catch {
        if (!cancelled) setLoaded({ state: 'error', message: 'Could not reach the server. Check the connection and try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const ready = loaded.state === 'ready' && 'html' in loaded.data ? loaded.data : null;
  const shownSubject = subject ?? ready?.subject ?? null;
  const muted = { color: 'var(--color-on-surface-variant)' } as const;

  return (
    <AdminModal title={title} onClose={onClose} maxWidth="max-w-3xl">
      <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 border-b px-4 py-3 text-[13px]" style={{ borderColor: 'var(--color-outline-variant)', background: '#fcfbf7' }}>
        <dt className="font-semibold" style={muted}>To</dt>
        <dd className="break-words">{to}</dd>
        <dt className="font-semibold" style={muted}>From</dt>
        <dd className="break-words">{fromLine}</dd>
        {shownSubject && (
          <>
            <dt className="font-semibold" style={muted}>Subject</dt>
            <dd className="break-words">{shownSubject}</dd>
          </>
        )}
        <dt className="font-semibold" style={muted}>{sentTerm}</dt>
        <dd className="break-words">{sentLabel}</dd>
      </dl>

      <div className="px-4 pb-4 pt-3">
        {loaded.state === 'loading' && <p className="py-10 text-center text-sm" style={muted}>Loading the email…</p>}
        {loaded.state === 'error' && <p role="alert" className="py-8 text-center text-sm font-semibold" style={{ color: 'var(--color-error)' }}>{loaded.message}</p>}
        {loaded.state === 'ready' && 'missing' in loaded.data && (
          <p className="rounded px-3 py-3 text-sm" style={{ background: '#fdf1e7', color: '#8a3b12' }}>{loaded.data.reason}</p>
        )}
        {ready && (
          <>
            {ready.rebuilt && (
              <p className="mb-3 rounded px-3 py-2 text-[12.5px] leading-snug" style={{ background: '#fdf1e7', color: '#8a3b12' }}>⚠ {REBUILT_NOTE}</p>
            )}
            <div className="mb-2 flex justify-end">
              <div className="inline-flex overflow-hidden rounded-full border" style={{ borderColor: 'var(--color-outline-variant)' }} role="tablist" aria-label="Show the email as">
                {(['email', 'text'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => setView(option)}
                    className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-[#fbf6e6] focus-visible:outline focus-visible:outline-2"
                    style={view === option ? { background: 'var(--color-primary)', color: '#fff' } : { color: 'var(--color-primary)' }}
                  >
                    {option === 'email' ? 'Email' : 'Plain text'}
                  </button>
                ))}
              </div>
            </div>
            {view === 'email' ? (
              <iframe
                title={`Email: ${shownSubject ?? title}`}
                srcDoc={emailFrameDocument(ready.html)}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="block w-full border"
                style={{ height: 'min(62vh, 640px)', borderColor: '#e6ddc4', background: '#fff' }}
              />
            ) : (
              <pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words border p-3 text-[12.5px] leading-relaxed" style={{ borderColor: '#e6ddc4', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
                {ready.text || '(This email has no plain-text part.)'}
              </pre>
            )}
          </>
        )}
        <div className="mt-3 flex justify-end">
          <button type="button" className="outline-button text-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </AdminModal>
  );
}
