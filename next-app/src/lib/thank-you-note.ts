/**
 * "Note for the thank-you email" (owner, 2026-11-25): an optional line the
 * owner types on a buy receipt or an order — e.g. "her late mother's ring" —
 * that only the AI writing the thank-you's opening reads
 * (`lib/follow-up-opening.ts`).
 *
 * ⛔ INTERNAL ONLY (owner: "make sure it never prints on either paper copy of
 * the receipt, so the customer doesn't see it when signing"). Stored in its own
 * column `thank_you_note` (supabase/follow-ups-ai-openings-2026-11.sql), read
 * and written ONLY through `lib/thank-you-note-server.ts` on its own query. It
 * is never in BUY_RECEIPT_COLUMNS or the order's detail select, so no paper,
 * print host, Print Station, receipt email, invoice, print-out or gift slip
 * can reach it. A test fails if any of them names it.
 *
 * Not the receipt's "Notes" field — that one PRINTS on the receipt and goes in
 * the seller's emailed copy.
 */

export const THANK_YOU_NOTE_MAX = 300;
export const THANK_YOU_NOTES_SQL_FILE = 'supabase/follow-ups-ai-openings-2026-11.sql';

export type ThankYouNoteKind = 'buy_receipt' | 'order';
export type ThankYouNoteState = { ready: boolean; note: string };

export function isThankYouNoteKind(value: unknown): value is ThankYouNoteKind {
  return value === 'buy_receipt' || value === 'order';
}

/** One line of plain text, or empty (= no note). */
export function normalizeThankYouNote(raw: unknown): { value: string | null } | { error: string } {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { value: null };
  if (text.length > THANK_YOU_NOTE_MAX) return { error: `Keep the note under ${THANK_YOU_NOTE_MAX} characters.` };
  return { value: text };
}
