'use client';

import { printableIdPhoto } from '@/components/admin/buy-receipts/buy-receipt-client';
import { createClient } from '@/lib/supabase/client';
import { BUY_RECEIPT_ID_BUCKET } from '@/lib/buy-receipts';
import { paperReceiptDocument, type PaperReceipt } from '@/lib/order-receipt-paper';
import { orderPickupFolder, privateImagePaths, withPrivateImages, type OrderPickupRow, type PickupDetailsInput } from '@/lib/order-pickup';
import { printPaperInFrame } from '@/lib/print-paper';

/**
 * Browser-side calls for the Local Pickup log (`lib/order-pickup.ts`): saving,
 * emailing, and printing a pickup paper with its private pictures filled in.
 */

const OFFLINE = 'Could not reach the server. Check the connection and try again.';

export type PickupEmailEntry = {
  id?: string | null;
  email_type: string;
  recipient: string;
  subject: string;
  status: string | null;
  sent_by_email: string | null;
  created_at: string;
};

export type SavePickupResult =
  | { pickup: OrderPickupRow; fulfillmentStatus: string | null; email: PickupEmailEntry | null; emailError: string | null }
  | { error: string };

export async function savePickup(
  orderId: string,
  details: PickupDetailsInput,
  files: { photo?: Blob | null; signature?: Blob | null } = {},
): Promise<SavePickupResult> {
  const form = new FormData();
  form.append('details', JSON.stringify(details));
  if (files.photo) form.append('photo', files.photo, 'pickup-id.jpg');
  if (files.signature) form.append('signature', files.signature, 'signature.png');
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/pickup`, { method: 'POST', body: form });
    const data = (await res.json().catch(() => ({}))) as Partial<Extract<SavePickupResult, { pickup: OrderPickupRow }>> & { error?: string };
    if (!res.ok || !data.pickup) return { error: data.error ?? 'The pickup could not be saved. Try again.' };
    return { pickup: data.pickup, fulfillmentStatus: data.fulfillmentStatus ?? null, email: data.email ?? null, emailError: data.emailError ?? null };
  } catch {
    return { error: OFFLINE };
  }
}

export async function emailPickup(orderId: string): Promise<{ pickup: OrderPickupRow; email: PickupEmailEntry } | { error: string }> {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/pickup/email`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { pickup?: OrderPickupRow; email?: PickupEmailEntry; error?: string };
    if (!res.ok || !data.pickup || !data.email) return { error: data.error ?? 'The pickup copy could not be emailed.' };
    return { pickup: data.pickup, email: data.email };
  } catch {
    return { error: OFFLINE };
  }
}

/**
 * A paper whose private pictures (ID photo, signature) are swapped for
 * print-ready ones held in memory. `release` frees them after printing.
 * A picture that cannot be fetched drops out rather than blocking the print.
 */
export async function fillPrivatePaper(paper: PaperReceipt): Promise<{ paper: PaperReceipt; release: () => void }> {
  const paths = privateImagePaths(paper.body);
  if (paths.length === 0) return { paper, release: () => undefined };
  const pictures = await Promise.all(paths.map(async (path) => [path, await printableIdPhoto(path)] as const));
  const links = new Map<string, string>();
  for (const [path, picture] of pictures) if (picture) links.set(path, picture.url);
  return {
    paper: { ...paper, body: withPrivateImages(paper.body, links) },
    release: () => pictures.forEach(([, picture]) => picture?.release()),
  };
}

/** Print a pickup paper on THIS computer (or iPad): the normal print dialog. */
export async function printPickupHere(paper: PaperReceipt): Promise<void> {
  const filled = await fillPrivatePaper(paper);
  try {
    await printPaperInFrame(paperReceiptDocument(filled.paper));
  } finally {
    // The frame lingers a minute (Safari returns from print() at once); keep the pictures as long.
    window.setTimeout(filled.release, 60_000);
  }
}

/**
 * Delete Forever on an order also takes its pickup files (ID photo, signature)
 * out of the private bucket — the row itself goes with the order (cascade).
 * Best effort: a failure is logged, never blocks the delete.
 */
export async function removeOrderPickupFiles(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    const supabase = createClient();
    await supabase.auth.getSession();
    const bucket = supabase.storage.from(BUY_RECEIPT_ID_BUCKET);
    const paths: string[] = [];
    for (const orderId of orderIds) {
      const folder = orderPickupFolder(orderId);
      const { data } = await bucket.list(folder, { limit: 100 });
      for (const file of data ?? []) paths.push(`${folder}/${file.name}`);
    }
    if (paths.length > 0) {
      const { error } = await bucket.remove(paths);
      if (error) console.error('[order-pickup] files not removed', error.message);
    }
  } catch (error) {
    console.error('[order-pickup] files not removed', error instanceof Error ? error.message : error);
  }
}
