import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { idReadIsEmpty } from '@/lib/buy-receipt-id-read';
import { IdReadUnreadableImageError, readIdPhotoWithAi } from '@/lib/buy-receipt-id-read-provider';
import { PRODUCT_IMAGE_MAX_UPLOAD_BYTES } from '@/lib/product-image-encode';

/**
 * "Fill form from ID" (owner, 2026-10-09): the photo of the seller's ID is
 * read by the AI and the printed details come back for the form's empty boxes.
 *
 * POST (multipart, field `photo`) → `{ fields }`. Called by the New receipt
 * form the moment a photo is taken or chosen, and only while its box is ticked.
 *
 * ⛔ Nothing is stored and nothing read off the card is logged. The photo is
 * held in memory for the one request; it reaches Storage later, through
 * `[id]/id-photo`, when the receipt is saved. A failure here never costs the
 * photo or the receipt — the boxes simply stay empty.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const UNREADABLE = 'The ID could not be read. Type the details in.';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No photo was received.' }, { status: 400 });
  }
  if (file.size > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That photo is too large to read. Type the details in.' }, { status: 413 });
  }

  try {
    const fields = await readIdPhotoWithAi(Buffer.from(await file.arrayBuffer()));
    if (idReadIsEmpty(fields)) return NextResponse.json({ error: UNREADABLE }, { status: 422 });
    return NextResponse.json({ fields });
  } catch (error) {
    if (error instanceof IdReadUnreadableImageError) {
      return NextResponse.json({ error: UNREADABLE }, { status: 400 });
    }
    // The provider's own message only (a status, a timeout): never anything from the card.
    console.error('[buy-receipts] id read failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: UNREADABLE }, { status: 502 });
  }
}
