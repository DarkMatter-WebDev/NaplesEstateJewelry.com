import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { DRAFT_NOT_SAVED, buyReceiptDraftColumns, normalizeBuyReceiptDraftSave } from '@/lib/buy-receipt-drafts';
import { addSellerToMailingList } from '@/lib/buy-receipt-mailing-list';
import { sendBuyReceiptEmail } from '@/lib/buy-receipt-mailer';
import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_ID_BUCKET,
  buyReceiptContentColumns,
  buyReceiptIdPhotoFolder,
  isReceiptId,
  normalizeBuyReceiptInput,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';

/**
 * GET: one receipt. PUT: edit it (owner ruling 2026-09-30: saved receipts are
 * editable). A VOID receipt is frozen — the route answers 409 and the database
 * guard trigger refuses the write as well; duplicate it instead.
 *
 * Drafts (owner, 2026-10-09): PUT with `asDraft: true` saves a draft again
 * (name only); PUT without it on a draft FINISHES it — the full check, then
 * `status = 'recorded'`, the email copy and the mailing list. DELETE removes a
 * draft like any other receipt.
 *
 * DELETE (owner, 2026-10-03: "add a delete option to the log of receipts"):
 * removes the receipt for good — recorded or void — together with its ID photo.
 * The number is never used again (identity sequence). Void is still the tool
 * for a real purchase that was reversed; this is for test and mistaken entries.
 * It needed no SQL: the table already grants DELETE to `authenticated` behind
 * the admin-only policy, `duplicated_from` is `on delete set null`, and the
 * guard trigger only watches updates.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

// A Response body can be read once, so these are built per request, never shared.
const notFound = () => NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

export async function GET(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const { data } = await admin.supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', id).maybeSingle();
  if (!data) return notFound();
  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}

export async function PUT(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const { data: current } = await admin.supabase.from('buy_receipts').select('id, status').eq('id', id).maybeSingle();
  if (!current) return notFound();
  if (current.status === 'void') {
    return NextResponse.json({ error: 'A void receipt cannot be edited. Duplicate it instead.' }, { status: 409 });
  }

  // "Save draft" again: only the name is checked, and the form as typed replaces the stored one.
  if (body?.asDraft === true) {
    if (current.status !== 'draft') {
      return NextResponse.json({ error: 'This receipt is already recorded. It cannot go back to a draft.' }, { status: 409 });
    }
    const draft = normalizeBuyReceiptDraftSave(body);
    if ('error' in draft) return NextResponse.json({ error: draft.error }, { status: 400 });
    const { data: saved, error: draftError } = await admin.supabase
      .from('buy_receipts')
      .update({ ...buyReceiptDraftColumns(draft.value), updated_by_email: admin.user.email ?? null })
      .eq('id', id)
      .eq('status', 'draft')
      .select(BUY_RECEIPT_COLUMNS)
      .single();
    if (draftError || !saved) {
      console.error('[buy-receipts] draft update failed', draftError?.message);
      return NextResponse.json({ error: DRAFT_NOT_SAVED }, { status: 500 });
    }
    return NextResponse.json({ receipt: saved as unknown as BuyReceiptRow });
  }

  const normalized = normalizeBuyReceiptInput(body);
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

  // A draft that passes the full check is FINISHED by this save: it becomes a
  // recorded receipt under the number it already has, and the stored form goes.
  const finishing = current.status === 'draft';
  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({
      ...buyReceiptContentColumns(normalized.value),
      ...(finishing ? { status: 'recorded', draft_form: null } : {}),
      updated_by_email: admin.user.email ?? null,
    })
    .eq('id', id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();

  if (error || !data) {
    console.error('[buy-receipts] update failed', error?.message);
    return NextResponse.json({ error: finishing ? 'Could not save the receipt. It is still a draft.' : 'Could not save the changes.' }, { status: 500 });
  }
  let receipt = data as unknown as BuyReceiptRow;
  if (!finishing) return NextResponse.json({ receipt });

  // Finishing is the moment the receipt is recorded, so what a new receipt does
  // on its save happens here: the seller's copy by email and the mailing list,
  // each only if its box is ticked. As there, a failure of either never costs
  // the receipt — it is reported. (Same rules as POST in ../route.ts.)
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
  let mailingList: 'added' | 'failed' | null = null;
  if (body?.mailingList === true && receipt.seller_email) {
    const added = await addSellerToMailingList({ email: receipt.seller_email, name: receipt.seller_name });
    mailingList = added.ok ? 'added' : 'failed';
  }
  return NextResponse.json({ receipt, emailed, emailError, mailingList });
}

export async function DELETE(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const { data: current } = await admin.supabase
    .from('buy_receipts')
    .select('id, receipt_number, seller_id_photo_path, seller_thumbprint_path')
    .eq('id', id)
    .maybeSingle();
  if (!current) return notFound();

  // The ID photo goes FIRST. This bucket is private and has no garbage
  // collector (the Storage GC only knows `product-images`), so a photo whose
  // row is gone would sit there for ever with nothing pointing at it. If the
  // photo cannot be removed, nothing is deleted and the owner can try again.
  // The folder is listed as well, so a leftover from an earlier failed replace
  // goes with it. The seller's thumbprint lives in the same folder and goes the
  // same way.
  const bucket = admin.supabase.storage.from(BUY_RECEIPT_ID_BUCKET);
  const folder = buyReceiptIdPhotoFolder(id);
  const { data: listed, error: listError } = await bucket.list(folder, { limit: 100 });
  if (listError) {
    console.error('[buy-receipts] delete: id photo list failed', listError.message);
    return NextResponse.json({ error: 'Could not reach the ID photo storage. Nothing was deleted.' }, { status: 502 });
  }
  const paths = new Set((listed ?? []).map((object) => `${folder}/${object.name}`));
  if (current.seller_id_photo_path) paths.add(current.seller_id_photo_path);
  if (current.seller_thumbprint_path) paths.add(current.seller_thumbprint_path);
  if (paths.size > 0) {
    const { error: removeError } = await bucket.remove([...paths]);
    if (removeError) {
      console.error('[buy-receipts] delete: id photo not removed', removeError.message);
      return NextResponse.json({ error: 'The ID photo or thumbprint could not be removed. Nothing was deleted.' }, { status: 502 });
    }
  }

  const { data: removed, error } = await admin.supabase.from('buy_receipts').delete().eq('id', id).select('id');
  if (error || !removed || removed.length === 0) {
    console.error('[buy-receipts] delete failed', current.receipt_number, error?.message);
    if (current.seller_id_photo_path || current.seller_thumbprint_path) {
      // The row is still there but its pictures are not: stop it pointing at nothing.
      // Best effort — a void row is frozen by the database guard and keeps the stale path.
      await admin.supabase
        .from('buy_receipts')
        .update({ seller_id_photo_path: null, seller_thumbprint_path: null, print_copies_with_id: 0 })
        .eq('id', id);
    }
    return NextResponse.json(
      { error: paths.size > 0 ? 'The ID photo and thumbprint were removed, but the receipt could not be deleted. Try again.' : 'Could not delete the receipt.' },
      { status: 500 },
    );
  }

  // The only trace a deleted receipt leaves: who removed which number, in the server log.
  console.info('[buy-receipts] deleted', current.receipt_number, 'by', admin.user.email ?? 'unknown');
  return NextResponse.json({ deleted: true, id, receiptNumber: current.receipt_number });
}
