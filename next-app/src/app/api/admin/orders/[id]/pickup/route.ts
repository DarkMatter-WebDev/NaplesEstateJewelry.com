import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/admin-auth';
import { BUY_RECEIPT_ID_BUCKET } from '@/lib/buy-receipts';
import {
  isMissingPickupTable,
  isOrderId,
  isPickupOrder,
  normalizePickupDetails,
  ORDER_PICKUP_COLUMNS,
  ORDER_PICKUP_SQL_FILE,
  ORDER_PICKUP_TABLE,
  orderPickupIdPhotoPath,
  orderPickupSignaturePath,
  type OrderPickupRow,
} from '@/lib/order-pickup';
import { loadPickupOrder, sendPickupEmail } from '@/lib/order-pickup-server';
import { encodeProductImageToWebp, PRODUCT_IMAGE_MAX_UPLOAD_BYTES, toOwnedBuffer } from '@/lib/product-image-encode';

/**
 * Log Pickup (owner, 2026-11-21): one request saves the whole pickup.
 *
 * POST multipart:
 *   details    JSON — who, ID type, ID last 4, sign method, signed name, email box, removePhoto
 *   photo      optional — the ID photo (webcam or file; the browser already shrank it)
 *   signature  optional — the finger signature (PNG from the signing screen)
 *
 * First save: the row is created, `picked_up_at` stamped, the order marked
 * Picked Up, and — with the email box ticked — the buyer emailed their copy.
 * Later saves (Edit Pickup, Customer Signs Again) update the row; the pickup
 * time never moves and no email goes unless asked through `pickup/email`.
 *
 * ⛔ PRIVATE files: the `buy-receipt-ids` bucket under `order-pickups/<id>/`,
 * re-encoded to WebP and CHECKED to be WebP before the name and contentType
 * claim it (AGENTS.md → Optimization defaults). A replaced file is removed
 * after the row points at the new one; a failed save removes what it uploaded.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

const SIGNATURE_MAX_EDGE_PX = 1400;
const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

const notFound = () => NextResponse.json({ error: 'Order not found.' }, { status: 404 });

async function encodeIdPhoto(file: File): Promise<Buffer<ArrayBuffer>> {
  const encoded = await encodeProductImageToWebp(Buffer.from(await file.arrayBuffer()), { quality: 82 });
  const produced = await sharp(encoded.buffer).metadata();
  if (produced.format !== 'webp') throw new Error(`encoder produced ${produced.format ?? 'unknown'}`);
  return toOwnedBuffer(encoded.buffer);
}

async function encodeSignature(file: File): Promise<Buffer<ArrayBuffer>> {
  const encoded = toOwnedBuffer(
    await sharp(Buffer.from(await file.arrayBuffer()))
      .trim({ threshold: 1 })
      .resize(SIGNATURE_MAX_EDGE_PX, SIGNATURE_MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ lossless: true })
      .toBuffer(),
  );
  const produced = await sharp(encoded).metadata();
  if (produced.format !== 'webp') throw new Error(`encoder produced ${produced.format ?? 'unknown'}`);
  return encoded;
}

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isOrderId(id)) return notFound();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Nothing was received.' }, { status: 400 });
  let rawDetails: unknown = null;
  try {
    rawDetails = JSON.parse(String(form.get('details') ?? 'null'));
  } catch {
    return NextResponse.json({ error: 'The pickup details could not be read.' }, { status: 400 });
  }
  const photo = form.get('photo');
  const signature = form.get('signature');
  const newPhoto = photo instanceof File && photo.size > 0 ? photo : null;
  const newSignature = signature instanceof File && signature.size > 0 ? signature : null;
  if (newPhoto && newPhoto.size > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That ID photo is too large. Take it again or choose a smaller one.' }, { status: 413 });
  }
  if (newSignature && newSignature.size > SIGNATURE_MAX_BYTES) {
    return NextResponse.json({ error: 'The signature could not be read. Clear it and sign again.' }, { status: 413 });
  }

  const order = await loadPickupOrder(admin.supabase, id);
  if (!order || order.deleted_at) return notFound();
  if (!isPickupOrder(order)) {
    return NextResponse.json({ error: 'Only Local Pickup orders have a pickup log.' }, { status: 409 });
  }

  const checked = normalizePickupDetails(rawDetails, order.customer_name);
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const details = checked.value;

  const { data: currentData, error: currentError } = await admin.supabase
    .from(ORDER_PICKUP_TABLE)
    .select(ORDER_PICKUP_COLUMNS)
    .eq('order_id', id)
    .maybeSingle();
  if (currentError) {
    if (isMissingPickupTable(currentError)) {
      return NextResponse.json({ error: `The pickup log needs ${ORDER_PICKUP_SQL_FILE} run in Supabase first.` }, { status: 503 });
    }
    console.error('[order-pickup] read failed', currentError.message);
    return NextResponse.json({ error: 'Could not read the pickup. Try again.' }, { status: 500 });
  }
  const current = (currentData as unknown as OrderPickupRow | null) ?? null;

  const digital = details.sign_method === 'digital';
  if (digital && !newSignature && !current?.signature_path) {
    return NextResponse.json({ error: 'The customer has not signed yet. Open the signing screen and have them sign.' }, { status: 400 });
  }

  let photoBuffer: Buffer<ArrayBuffer> | null = null;
  let signatureBuffer: Buffer<ArrayBuffer> | null = null;
  try {
    if (newPhoto) photoBuffer = await encodeIdPhoto(newPhoto);
  } catch (error) {
    console.error('[order-pickup] id photo encode failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'That ID photo is not a picture we can read. Try another one.' }, { status: 400 });
  }
  try {
    if (newSignature && digital) signatureBuffer = await encodeSignature(newSignature);
  } catch (error) {
    console.error('[order-pickup] signature encode failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'The signature could not be read. Clear it and sign again.' }, { status: 400 });
  }

  const bucket = admin.supabase.storage.from(BUY_RECEIPT_ID_BUCKET);
  const uploaded: string[] = [];
  async function store(path: string, buffer: Buffer<ArrayBuffer>): Promise<boolean> {
    const { error } = await bucket.upload(path, buffer, { contentType: 'image/webp', cacheControl: '0', upsert: false });
    if (error) {
      console.error('[order-pickup] upload failed', error.message);
      return false;
    }
    uploaded.push(path);
    return true;
  }

  const photoPath = photoBuffer ? orderPickupIdPhotoPath(id, crypto.randomUUID()) : null;
  const signaturePath = signatureBuffer ? orderPickupSignaturePath(id, crypto.randomUUID()) : null;
  if ((photoPath && photoBuffer && !(await store(photoPath, photoBuffer)))
    || (signaturePath && signatureBuffer && !(await store(signaturePath, signatureBuffer)))) {
    if (uploaded.length) await bucket.remove(uploaded);
    return NextResponse.json({ error: 'The photo or signature could not be stored. Nothing was saved — try again.' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const keepPhoto = details.removePhoto ? null : current?.id_photo_path ?? null;
  const row = {
    order_id: id,
    picked_up_by: details.picked_up_by,
    picked_up_by_buyer: details.picked_up_by_buyer,
    id_type: details.id_type,
    id_last4: details.id_last4,
    id_photo_path: photoPath ?? keepPhoto,
    sign_method: details.sign_method,
    signature_path: digital ? signaturePath ?? current?.signature_path ?? null : null,
    signed_name: digital ? details.signed_name : null,
    signed_at: digital ? (signaturePath ? now : current?.signed_at ?? now) : null,
    picked_up_at: current?.picked_up_at ?? now,
    updated_by_email: admin.user.email ?? null,
    ...(current ? {} : { logged_by_email: admin.user.email ?? null }),
  };

  const { data: saved, error: saveError } = await admin.supabase
    .from(ORDER_PICKUP_TABLE)
    .upsert(row, { onConflict: 'order_id' })
    .select(ORDER_PICKUP_COLUMNS)
    .single();
  if (saveError || !saved) {
    if (uploaded.length) await bucket.remove(uploaded);
    console.error('[order-pickup] save failed', saveError?.message);
    if (isMissingPickupTable(saveError)) {
      return NextResponse.json({ error: `The pickup log needs ${ORDER_PICKUP_SQL_FILE} run in Supabase first.` }, { status: 503 });
    }
    return NextResponse.json({ error: 'The pickup could not be saved. Try again.' }, { status: 500 });
  }
  let pickup = saved as unknown as OrderPickupRow;

  // Files the row no longer points at.
  const stale = [current?.id_photo_path, current?.signature_path].filter(
    (path): path is string => Boolean(path) && path !== pickup.id_photo_path && path !== pickup.signature_path,
  );
  if (stale.length) {
    const { error: removeError } = await bucket.remove(stale);
    if (removeError) console.error('[order-pickup] old files not removed', removeError.message);
  }

  // Logging a pickup marks the order Picked Up (the Fulfillment card's own email is not sent).
  let fulfillmentStatus = order.fulfillment_status;
  if (order.fulfillment_status !== 'picked_up') {
    const { error: orderError } = await admin.supabase.from('orders').update({ fulfillment_status: 'picked_up' }).eq('id', id);
    if (orderError) console.error('[order-pickup] order not marked picked up', orderError.message);
    else fulfillmentStatus = 'picked_up';
  }

  let email = null;
  let emailError: string | null = null;
  if (!current && details.email) {
    const sent = await sendPickupEmail({
      supabase: admin.supabase,
      order,
      pickup,
      sentBy: { id: admin.user.id, email: admin.user.email ?? null },
    });
    if (sent.ok) {
      pickup = sent.pickup;
      email = sent.email;
    } else {
      emailError = sent.error;
    }
  }

  return NextResponse.json({ pickup, fulfillmentStatus, email, emailError });
}
