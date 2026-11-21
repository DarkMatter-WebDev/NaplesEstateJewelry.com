// Saved copies of customer emails (owner, 2026-11-21, mockup 2: "click the
// record in email history and see the email that went out to them in a popup").
//
// Every email that is logged in an order's Email History (`order_emails`) now
// also keeps its own HTML + plain text (`body_html` / `body_text`); a buy
// receipt keeps its latest sent copy (`buy_receipts.emailed_html` / `emailed_text`).
// SQL: `supabase/email-copies-2026-11.sql`.
//
// ⛔ Saving the copy must never cost the log row or the email: before the SQL
// runs the columns do not exist, so a write that names them is retried
// without them. The email itself has always been sent before any of this.
import type { SupabaseClient } from '@supabase/supabase-js';

export const EMAIL_COPIES_SQL_FILE = 'supabase/email-copies-2026-11.sql';

export type EmailBody = { html: string; text: string };

/** Postgres / PostgREST "no such column" for one of the copy columns — the SQL has not run. */
export function isMissingCopyColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return /body_html|body_text|emailed_html|emailed_text/.test(message)
    && (error.code === '42703' || error.code === 'PGRST204' || /does not exist|could not find|column/i.test(message));
}

export type OrderEmailLogRow = {
  order_id: string;
  email_type: string;
  recipient: string;
  subject: string | null;
  status?: string | null;
  sent_by?: string | null;
  sent_by_email?: string | null;
};

/**
 * Insert an Email History row with the email's own copy. Falls back to the
 * row alone when the copy columns are missing. Best effort, like every
 * `order_emails` insert: the email has already gone.
 */
export async function logOrderEmail(
  client: SupabaseClient,
  row: OrderEmailLogRow,
  body: EmailBody,
): Promise<{ error: string | null; id: string | null }> {
  // The new row's id comes back so the page can open the email it just sent without a reload.
  const { data, error } = await client.from('order_emails').insert({ ...row, body_html: body.html, body_text: body.text }).select('id').maybeSingle();
  if (!error) return { error: null, id: (data?.id as string | undefined) ?? null };
  if (isMissingCopyColumn(error)) {
    const retry = await client.from('order_emails').insert(row).select('id').maybeSingle();
    return { error: retry.error?.message ?? null, id: (retry.data?.id as string | undefined) ?? null };
  }
  return { error: error.message, id: null };
}

/** Keep the buy receipt's latest sent email. Never fails the send; a missing column is skipped. */
export async function saveBuyReceiptEmailCopy(client: SupabaseClient, receiptId: string, body: EmailBody): Promise<void> {
  const { error } = await client.from('buy_receipts').update({ emailed_html: body.html, emailed_text: body.text }).eq('id', receiptId);
  if (error && !isMissingCopyColumn(error)) console.error('[email-copies] buy receipt copy not saved', error.message);
}

// ---- The viewer ------------------------------------------------------------

/** What the viewer API answers. `rebuilt` = this email was sent before copies were kept. */
export type EmailCopyResponse =
  | { html: string; text: string; rebuilt: boolean; subject: string | null }
  | { missing: true; reason: string };

/** The note above a rebuilt email (mockup 2). */
export const REBUILT_NOTE =
  'Rebuilt from the order as it is now. This email was sent before the site kept copies, so it may not match word for word.';

/**
 * The email as a document for a sandboxed frame: links open in a new tab
 * (the frame itself never navigates) and nothing inside can run script —
 * the frame has no `allow-scripts`.
 */
export function emailFrameDocument(html: string): string {
  const head = '<meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:#fff}</style>';
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`)
    : `<!DOCTYPE html><html><head>${head}</head><body>${html}</body></html>`;
}

const MANUAL_FULFILLMENT_STATUSES = ['pending', 'packed', 'shipped', 'picked_up', 'cancelled'] as const;
export type ManualFulfillmentStatus = (typeof MANUAL_FULFILLMENT_STATUSES)[number];

/**
 * How an email sent before copies were kept can be shown again:
 * - `invoice` / `receipt` → rebuilt from the order;
 * - a manual Fulfillment update (packed / shipped / picked up / …) → rebuilt;
 * - a pickup receipt → rebuilt from the pickup log;
 * - the AUTOMATIC delivery emails (expected date / out for delivery /
 *   delivered) → never: they printed the carrier's scan of that moment.
 */
export function rebuildPlan(emailType: string, status: string | null | undefined):
  | { kind: 'invoice' }
  | { kind: 'fulfillment'; status: ManualFulfillmentStatus }
  | { kind: 'pickup' }
  | { kind: 'none'; reason: string } {
  if (emailType === 'invoice' || emailType === 'receipt') return { kind: 'invoice' };
  if (emailType === 'pickup_receipt') return { kind: 'pickup' };
  if (emailType === 'fulfillment_update') {
    const found = MANUAL_FULFILLMENT_STATUSES.find((value) => value === status);
    if (found) return { kind: 'fulfillment', status: found };
    return {
      kind: 'none',
      reason: 'This automatic delivery email was sent before the site kept copies. It cannot be rebuilt — it showed the carrier’s scan from that moment.',
    };
  }
  return { kind: 'none', reason: 'This email was sent before the site kept copies, and this kind cannot be rebuilt.' };
}
