'use client';

import { useState } from 'react';
import { THANK_YOU_NOTE_MAX, THANK_YOU_NOTES_SQL_FILE, type ThankYouNoteKind, type ThankYouNoteState } from '@/lib/thank-you-note';

/**
 * "Note for the thank-you email — internal only, never printed" (owner,
 * 2026-11-25). On a saved buy receipt (its page + the after-save panel) and on
 * an order's page. ⛔ It lives OUTSIDE the paper: nothing here is part of
 * BuyReceiptSheet, a print or an email (lib/thank-you-note.ts).
 */
export default function ThankYouNoteCard({
  kind,
  id,
  initial,
  compact = false,
}: {
  kind: ThankYouNoteKind;
  id: string;
  initial: ThankYouNoteState;
  /** The order page's narrower card style. */
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(initial.note);
  const [text, setText] = useState(initial.note);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const changed = text.trim() !== saved.trim();

  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/thank-you-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, note: text }),
      });
      const data = (await response.json().catch(() => ({}))) as { note?: string; error?: string };
      if (!response.ok) {
        setMessage({ text: data.error ?? 'Could not save the note.', ok: false });
      } else {
        setSaved(data.note ?? '');
        setText(data.note ?? '');
        setMessage({ text: data.note ? 'Saved. The thank-you email will use it.' : 'Note removed.', ok: true });
      }
    } catch {
      setMessage({ text: 'Could not reach the server. Try again.', ok: false });
    }
    setBusy(false);
  }

  return (
    <section
      // print:hidden — even a Ctrl+P of the whole admin page leaves it off the paper.
      className={`grid gap-2 border bg-white print:hidden ${compact ? 'p-4' : 'p-4 sm:p-5'}`}
      style={{ borderColor: 'var(--color-outline-variant)', borderRadius: compact ? undefined : '1.25rem' }}
      aria-label="Note for the thank-you email"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold" style={{ color: 'var(--color-on-surface)' }}>Note for the thank-you email</span>
        <span className="rounded-[3px] px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.06em]" style={{ background: '#efe9da', color: '#5c5341' }}>
          Internal only · never printed
        </span>
      </div>
      {!initial.ready ? (
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Run <code>{THANK_YOU_NOTES_SQL_FILE}</code> in Supabase to use this box.
        </p>
      ) : (
        <>
          <textarea
            className="form-field"
            rows={2}
            maxLength={THANK_YOU_NOTE_MAX}
            value={text}
            placeholder={kind === 'buy_receipt' ? "e.g. her late mother's ring · first time selling · moving to Ohio" : 'e.g. a gift for her daughter · anniversary'}
            onChange={(event) => setText(event.target.value)}
            aria-label="Note for the thank-you email"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-[11.5px] leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
              Optional. Only the AI that writes the opening of the thank-you email reads it. Never on the receipt, a print-out or an email as written. Leave blank and it words it from the items.
            </span>
            <button type="button" className="outline-button text-xs" disabled={busy || !changed} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save note'}
            </button>
          </div>
          {message && (
            <p role={message.ok ? 'status' : 'alert'} className="text-xs" style={{ color: message.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
              {message.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
