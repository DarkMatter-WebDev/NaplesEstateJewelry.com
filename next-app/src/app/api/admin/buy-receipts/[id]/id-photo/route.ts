import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/admin-auth';
import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_ID_BUCKET,
  buyReceiptIdPhotoPath,
  isReceiptId,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { PRODUCT_IMAGE_MAX_UPLOAD_BYTES, encodeProductImageToWebp } from '@/lib/product-image-encode';

/**
 * The photo of the seller's ID (driver license), kept with the receipt.
 *
 * ⛔ PRIVATE. It goes to the `buy-receipt-ids` bucket (admin-only Storage
 * policies), the row stores the object PATH, and it is only ever shown through
 * a short-lived signed link. Never the public `product-images` bucket, never a
 * public link, never an email attachment.
 *
 * POST (multipart, field `photo`): the browser has already downsized it; sharp
 * re-encodes to WebP here and the result is CHECKED to be WebP before the name
 * and contentType claim it (AGENTS.md → Optimization defaults). A replace
 * uploads under a new name and then removes the old object, so no orphan is
 * left behind. DELETE removes the photo.
 *
 * Not cached as immutable like product photos: `cacheControl: '0'`.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

// A Response body can be read once, so these are built per request, never shared.
const notFound = () => NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
const voidLocked = () =>
  NextResponse.json({ error: 'A void receipt cannot be changed. Duplicate it instead.' }, { status: 409 });

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const form = await req.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No photo was received.' }, { status: 400 });
  }
  if (file.size > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That photo is too large. Take it again or choose a smaller one.' }, { status: 413 });
  }

  const { data: current } = await admin.supabase
    .from('buy_receipts')
    .select('id, status, seller_id_photo_path')
    .eq('id', id)
    .maybeSingle();
  if (!current) return notFound();
  if (current.status === 'void') return voidLocked();

  let encoded;
  try {
    encoded = await encodeProductImageToWebp(Buffer.from(await file.arrayBuffer()), { quality: 82 });
    // Verify, do not assume: the stored name and contentType say WebP.
    const produced = await sharp(encoded.buffer).metadata();
    if (produced.format !== 'webp') throw new Error(`encoder produced ${produced.format ?? 'unknown'}`);
  } catch (error) {
    console.error('[buy-receipts] id photo encode failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'That file is not a photo we can read. Try another one.' }, { status: 400 });
  }

  const path = buyReceiptIdPhotoPath(id, crypto.randomUUID());
  const bucket = admin.supabase.storage.from(BUY_RECEIPT_ID_BUCKET);
  const { error: uploadError } = await bucket.upload(path, encoded.buffer, {
    contentType: 'image/webp',
    cacheControl: '0',
    upsert: false,
  });
  if (uploadError) {
    console.error('[buy-receipts] id photo upload failed', uploadError.message);
    return NextResponse.json({ error: 'The photo could not be stored. The receipt itself is saved.' }, { status: 502 });
  }

  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({ seller_id_photo_path: path, updated_by_email: admin.user.email ?? null })
    .eq('id', id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();
  if (error || !data) {
    // The row does not point at the new object, so take it back out.
    await bucket.remove([path]);
    console.error('[buy-receipts] id photo link failed', error?.message);
    return NextResponse.json({ error: 'The photo could not be attached. The receipt itself is saved.' }, { status: 500 });
  }

  const previous = current.seller_id_photo_path;
  if (previous && previous !== path) {
    const { error: removeError } = await bucket.remove([previous]);
    if (removeError) console.error('[buy-receipts] old id photo not removed', previous, removeError.message);
  }

  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}

export async function DELETE(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const { data: current } = await admin.supabase
    .from('buy_receipts')
    .select('id, status, seller_id_photo_path')
    .eq('id', id)
    .maybeSingle();
  if (!current) return notFound();
  if (current.status === 'void') return voidLocked();

  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({ seller_id_photo_path: null, print_copies_with_id: 0, updated_by_email: admin.user.email ?? null })
    .eq('id', id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();
  if (error || !data) {
    console.error('[buy-receipts] id photo unlink failed', error?.message);
    return NextResponse.json({ error: 'Could not remove the photo.' }, { status: 500 });
  }

  if (current.seller_id_photo_path) {
    const { error: removeError } = await admin.supabase.storage
      .from(BUY_RECEIPT_ID_BUCKET)
      .remove([current.seller_id_photo_path]);
    if (removeError) console.error('[buy-receipts] id photo not removed', current.seller_id_photo_path, removeError.message);
  }

  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}
