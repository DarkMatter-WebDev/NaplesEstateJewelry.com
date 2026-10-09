import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { DRAFT_NOT_SAVED, buyReceiptDraftColumns, normalizeBuyReceiptDraftSave } from '@/lib/buy-receipt-drafts';
import { addSellerToMailingList } from '@/lib/buy-receipt-mailing-list';
import { sendBuyReceiptEmail } from '@/lib/buy-receipt-mailer';
import {
  BUY_RECEIPT_COLUMNS,
  buyReceiptContentColumns,
  isReceiptId,
  normalizeBuyReceiptInput,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';

/**
 * Admin → Buy Receipts. POST saves a new receipt (and, with `emailCopy: true`
 * and a seller email, emails the seller their copy; with `mailingList: true`,
 * adds that email to the mailing list); GET lists / searches the log.
 * POST with `asDraft: true` saves a DRAFT instead (2026-10-09, see below).
 *
 * Runs on requireAdmin()'s request-scoped client (the `authenticated` role), so
 * the table's admin RLS policy AND its grant are what let this work — see
 * supabase/buy-receipts-2026-09.sql. Never the service role. (The mailing-list
 * sign-up is a different table with its own service-only function; it lives in
 * lib/buy-receipt-mailing-list.ts and never touches `buy_receipts`.)
 */
export const runtime = 'nodejs';

const LIST_DEFAULT = 100;
const LIST_MAX = 500;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const duplicatedFrom = isReceiptId(body?.duplicatedFrom) ? body.duplicatedFrom : null;
  const email = admin.user.email ?? null;

  // "Save draft" (owner, 2026-10-09): the seller's name is all it needs. The row
  // takes its BUY number now; the form as typed waits in `draft_form` until the
  // receipt is finished (PUT on `[id]`). Nothing is emailed and nobody joins the
  // mailing list for a draft.
  if (body?.asDraft === true) {
    const draft = normalizeBuyReceiptDraftSave(body);
    if ('error' in draft) return NextResponse.json({ error: draft.error }, { status: 400 });
    const { data: saved, error: draftError } = await admin.supabase
      .from('buy_receipts')
      .insert({
        ...buyReceiptDraftColumns(draft.value),
        status: 'draft',
        duplicated_from: duplicatedFrom,
        created_by: admin.user.id,
        created_by_email: email,
        updated_by_email: email,
      })
      .select(BUY_RECEIPT_COLUMNS)
      .single();
    if (draftError || !saved) {
      console.error('[buy-receipts] draft insert failed', draftError?.message);
      return NextResponse.json({ error: DRAFT_NOT_SAVED }, { status: 500 });
    }
    return NextResponse.json({ receipt: saved as unknown as BuyReceiptRow }, { status: 201 });
  }

  const normalized = normalizeBuyReceiptInput(body);
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .insert({
      ...buyReceiptContentColumns(normalized.value),
      duplicated_from: duplicatedFrom,
      created_by: admin.user.id,
      created_by_email: email,
      updated_by_email: email,
    })
    .select(BUY_RECEIPT_COLUMNS)
    .single();

  if (error || !data) {
    console.error('[buy-receipts] insert failed', error?.message);
    return NextResponse.json({ error: 'Could not save the receipt. Nothing was recorded.' }, { status: 500 });
  }
  let receipt = data as unknown as BuyReceiptRow;

  // "Send via email" (owner, 2026-09-30): the seller's copy goes out as the
  // receipt is saved. A failed email never costs the receipt — it is reported.
  let emailed = false;
  let emailError: string | null = null;
  if (body?.emailCopy === true) {
    if (!receipt.seller_email) {
      emailError = 'No email address was entered for the seller.';
    } else {
      const sent = await sendBuyReceiptEmail({ supabase: admin.supabase, receipt });
      if (sent.ok) {
        receipt = sent.receipt;
        emailed = true;
      } else {
        emailError = sent.error;
      }
    }
  }

  // "Add me to the mailing list" (owner, 2026-10-03): a seller ticked it on the
  // customer input screen. Done here, on the save, so an email the owner
  // corrected on the form is the one that joins. Like the emailed copy, a
  // failure never costs the receipt — it is reported.
  let mailingList: 'added' | 'failed' | null = null;
  if (body?.mailingList === true && receipt.seller_email) {
    const added = await addSellerToMailingList({ email: receipt.seller_email, name: receipt.seller_name });
    mailingList = added.ok ? 'added' : 'failed';
  }
  return NextResponse.json({ receipt, emailed, emailError, mailingList }, { status: 201 });
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const url = new URL(req.url);
  // PostgREST's or() is a comma/paren grammar: strip what would break out of it.
  const q = (url.searchParams.get('q') ?? '').replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const requested = Number(url.searchParams.get('limit') ?? LIST_DEFAULT);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), LIST_MAX) : LIST_DEFAULT;

  let query = admin.supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).order('seq', { ascending: false }).limit(limit);
  if (q) query = query.or(`receipt_number.ilike.%${q}%,seller_name.ilike.%${q}%,seller_phone.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error('[buy-receipts] list failed', error.message);
    return NextResponse.json({ error: 'Could not load the receipts.' }, { status: 500 });
  }
  return NextResponse.json({ receipts: (data ?? []) as unknown as BuyReceiptRow[] });
}
