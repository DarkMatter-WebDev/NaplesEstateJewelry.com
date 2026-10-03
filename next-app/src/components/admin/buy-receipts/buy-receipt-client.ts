'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BUY_RECEIPT_ID_BUCKET,
  type BuyReceiptCopies,
  type BuyReceiptDraft,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { prepareLeadPhotos } from '@/lib/lead-photo-prep';

/**
 * Browser-side calls for Admin → Buy Receipts: the admin API routes, and the
 * short-lived signed link that shows a seller's ID photo.
 */

export type ReceiptResult = { receipt: BuyReceiptRow } | { error: string };

const OFFLINE = 'Could not reach the server. Check the connection and try again.';

async function call(path: string, init: RequestInit, fallback: string): Promise<ReceiptResult> {
  try {
    const res = await fetch(path, init);
    const data = (await res.json().catch(() => ({}))) as { receipt?: BuyReceiptRow; error?: string };
    if (!res.ok || !data.receipt) return { error: data.error ?? fallback };
    return { receipt: data.receipt };
  } catch {
    return { error: OFFLINE };
  }
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export type CreateReceiptResult = { receipt: BuyReceiptRow; emailed: boolean; emailError: string | null } | { error: string };

/** `emailCopy` asks the server to email the seller their copy as part of the save. */
export async function createReceipt(
  draft: BuyReceiptDraft,
  duplicatedFrom: string | null,
  emailCopy = false,
): Promise<CreateReceiptResult> {
  try {
    const res = await fetch('/api/admin/buy-receipts', json('POST', { ...draft, duplicatedFrom, emailCopy }));
    const data = (await res.json().catch(() => ({}))) as { receipt?: BuyReceiptRow; error?: string; emailed?: boolean; emailError?: string | null };
    if (!res.ok || !data.receipt) return { error: data.error ?? 'Could not save the receipt.' };
    return { receipt: data.receipt, emailed: data.emailed === true, emailError: data.emailError ?? null };
  } catch {
    return { error: OFFLINE };
  }
}

export function emailReceipt(id: string): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}/email`, json('POST', {}), 'The receipt could not be emailed.');
}

export function updateReceipt(id: string, draft: BuyReceiptDraft): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}`, json('PUT', draft), 'Could not save the changes.');
}

export function requestPrint(id: string, copies: BuyReceiptCopies): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}/print-request`, json('POST', copies), 'Could not send it to the printer.');
}

export function markPrinted(id: string, copies: number): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}/printed`, json('POST', { copies }), 'Printed, but the log could not be updated.');
}

export function voidReceipt(id: string, reason: string): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}/void`, json('POST', { reason }), 'Could not void the receipt.');
}

export type DeleteReceiptResult = { deleted: true } | { error: string };

/** Removes the receipt and its ID photo for good. There is no way back. */
export async function deleteReceipt(id: string): Promise<DeleteReceiptResult> {
  try {
    const res = await fetch(`/api/admin/buy-receipts/${id}`, { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: string };
    if (!res.ok || data.deleted !== true) return { error: data.error ?? 'Could not delete the receipt.' };
    return { deleted: true };
  } catch {
    return { error: OFFLINE };
  }
}

export function removeIdPhoto(id: string): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}/id-photo`, { method: 'DELETE' }, 'Could not remove the photo.');
}

export function uploadIdPhoto(id: string, photo: Blob): Promise<ReceiptResult> {
  const form = new FormData();
  form.append('photo', photo, 'seller-id.jpg');
  return call(`/api/admin/buy-receipts/${id}/id-photo`, { method: 'POST', body: form }, 'The ID photo did not upload.');
}

/**
 * A chosen file (often a phone photo of several MB) → something small enough
 * for one request. Netlify cuts a request body at 6 MB; the lead forms' shrink
 * already solves exactly this, so it is reused. The server re-encodes to WebP.
 */
export async function prepareIdPhoto(file: File): Promise<Blob> {
  const prepared = await prepareLeadPhotos([file]);
  return prepared.files[0] ?? file;
}

/** A link to the private ID photo that works for ten minutes, or null. */
export async function signedIdPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = createClient();
  // Hydrate the session first, or the request goes out as anon and the bucket's policies refuse it.
  await supabase.auth.getSession();
  const { data, error } = await supabase.storage.from(BUY_RECEIPT_ID_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** The printed ID is 3.375 in wide; 1200 px is about 350 dpi at that size. */
const ID_PRINT_MAX_EDGE = 1200;

export type PrintableIdPhoto = { url: string; release: () => void };

/**
 * The ID photo prepared for PRINTING: downloaded, decoded and handed over as a
 * print-sized JPEG held in memory.
 *
 * Why not just print the signed link: the stored photo is a WebP of up to
 * 2048 px, and the browser embeds a non-JPEG in a print job as raw pixels
 * (measured 2026-09-30: a 1600 px WebP made a 4.3 MB job; a JPEG passes
 * through as it is). This also means the picture is already in memory when
 * `print()` fires, instead of depending on a hidden <img> finishing its load.
 * If anything here fails, the signed link itself is used.
 */
export async function printableIdPhoto(path: string | null | undefined): Promise<PrintableIdPhoto | null> {
  const signed = await signedIdPhotoUrl(path);
  if (!signed) return null;
  try {
    const response = await fetch(signed);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, ID_PRINT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    // `toBlob` may quietly produce another type; only a real JPEG is worth using.
    if (!blob || blob.type !== 'image/jpeg') throw new Error('not a JPEG');
    const url = URL.createObjectURL(blob);
    return { url, release: () => URL.revokeObjectURL(url) };
  } catch {
    return { url: signed, release: () => undefined };
  }
}

/** The signed link for a receipt's ID photo, refreshed when the path changes. */
export function useIdPhotoUrl(path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    signedIdPhotoUrl(path).then((url) => {
      if (!cancelled && url) setState({ path, url });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return path && state?.path === path ? state.url : null;
}
