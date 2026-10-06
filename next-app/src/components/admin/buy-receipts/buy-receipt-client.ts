'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BUY_RECEIPT_ID_BUCKET,
  type BuyReceiptCopies,
  type BuyReceiptDraft,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { CUSTOMER_MODE_API } from '@/lib/buy-receipt-customer-mode';
import { THUMBPRINT_MAX_EDGE_PX } from '@/lib/buy-receipt-thumbprint';
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

export type CreateReceiptResult =
  | { receipt: BuyReceiptRow; emailed: boolean; emailError: string | null; mailingList: 'added' | 'failed' | null }
  | { error: string };

/**
 * `emailCopy` asks the server to email the seller their copy as part of the
 * save; `mailingList` asks it to add the seller's email to the mailing list
 * (the "Mailing list" box is ticked — by the owner on the form, or by the
 * seller in customer input mode).
 */
export async function createReceipt(
  draft: BuyReceiptDraft,
  duplicatedFrom: string | null,
  emailCopy = false,
  mailingList = false,
): Promise<CreateReceiptResult> {
  try {
    const res = await fetch('/api/admin/buy-receipts', json('POST', { ...draft, duplicatedFrom, emailCopy, mailingList }));
    const data = (await res.json().catch(() => ({}))) as {
      receipt?: BuyReceiptRow;
      error?: string;
      emailed?: boolean;
      emailError?: string | null;
      mailingList?: string | null;
    };
    if (!res.ok || !data.receipt) return { error: data.error ?? 'Could not save the receipt.' };
    return {
      receipt: data.receipt,
      emailed: data.emailed === true,
      emailError: data.emailError ?? null,
      mailingList: data.mailingList === 'added' || data.mailingList === 'failed' ? data.mailingList : null,
    };
  } catch {
    return { error: OFFLINE };
  }
}

/** Customer input mode: lock this browser before the tablet is handed over. */
export async function startCustomerMode(): Promise<{ locked: true } | { error: string }> {
  try {
    const res = await fetch(CUSTOMER_MODE_API, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { locked?: boolean; error?: string };
    if (!res.ok || data.locked !== true) return { error: data.error ?? 'Could not start customer input mode.' };
    return { locked: true };
  } catch {
    return { error: OFFLINE };
  }
}

export type EndCustomerModeResult =
  | { unlocked: true }
  | { error: string; reason: 'wrong' | 'wait' | 'signed-out' | 'offline'; waitSeconds?: number };

/** Customer input mode: the staff code, checked on the server. Only a right code unlocks the browser. */
export async function endCustomerMode(code: string): Promise<EndCustomerModeResult> {
  try {
    const res = await fetch(CUSTOMER_MODE_API, json('DELETE', { code }));
    const data = (await res.json().catch(() => ({}))) as { locked?: boolean; error?: string; waitSeconds?: number };
    if (res.ok && data.locked === false) return { unlocked: true };
    if (res.status === 429) {
      return { error: data.error ?? 'Too many tries. Wait half a minute, then try again.', reason: 'wait', waitSeconds: data.waitSeconds ?? 30 };
    }
    if (res.status === 401) return { error: 'The sign-in on this device has ended. Sign in again, then enter the code.', reason: 'signed-out' };
    if (res.status === 403) return { error: data.error ?? 'That code is not right.', reason: 'wrong' };
    return { error: data.error ?? 'The code could not be checked. Try again.', reason: 'offline' };
  } catch {
    return { error: OFFLINE, reason: 'offline' };
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

export function removeThumbprint(id: string): Promise<ReceiptResult> {
  return call(`/api/admin/buy-receipts/${id}/thumbprint`, { method: 'DELETE' }, 'Could not remove the thumbprint.');
}

export function uploadThumbprint(id: string, print: Blob): Promise<ReceiptResult> {
  const form = new FormData();
  form.append('print', print, 'seller-thumbprint.png');
  return call(`/api/admin/buy-receipts/${id}/thumbprint`, { method: 'POST', body: form }, 'The thumbprint did not upload.');
}

/**
 * A saved print (the reader's program writes BMP) → a PNG the server can read.
 *
 * The server's encoder cannot open a BMP, and the browser can. PNG because it
 * is lossless: nothing is taken out of the ridges on the way. A chosen file
 * larger than the reader's own picture is scaled down to `THUMBPRINT_MAX_EDGE_PX`.
 * Throws when the file is not a picture this browser can open.
 */
export async function prepareThumbprint(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, THUMBPRINT_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    // A print with see-through parts must not come out black on paper.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    // `toBlob` may quietly produce another type; the upload is named .png, so check.
    if (!blob || blob.type !== 'image/png') throw new Error('not a PNG');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** A link to the private ID photo (or thumbprint — same bucket) that works for ten minutes, or null. */
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
/** The printed thumbprint is about an inch wide; the reader's own 300 × 400 passes through untouched. */
const THUMBPRINT_PRINT_MAX_EDGE = 800;

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
export function printableIdPhoto(path: string | null | undefined): Promise<PrintableIdPhoto | null> {
  return printablePicture(path, ID_PRINT_MAX_EDGE);
}

/** The seller's thumbprint prepared for printing, the same way and for the same reasons. */
export function printableThumbprint(path: string | null | undefined): Promise<PrintableIdPhoto | null> {
  return printablePicture(path, THUMBPRINT_PRINT_MAX_EDGE);
}

async function printablePicture(path: string | null | undefined, maxEdge: number): Promise<PrintableIdPhoto | null> {
  const signed = await signedIdPhotoUrl(path);
  if (!signed) return null;
  try {
    const response = await fetch(signed);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
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

/** The signed link for a receipt's ID photo (or its thumbprint — same bucket), refreshed when the path changes. */
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
