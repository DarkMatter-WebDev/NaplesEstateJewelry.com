// Browser helpers for Admin → Instant Sale (owner, 2026-10-21).
import { prepareLeadPhotos } from '@/lib/lead-photo-prep';

/**
 * An item photo for a sale: shrunk in the browser (≤ 2048 px, the lead-form
 * tiers), then encoded to WebP and stored by the SAME route a product photo
 * uses (`/api/admin/product-images`, immutable cache header). Returns the
 * public URL, which goes on the order line as its `image_snapshot` — so the
 * Storage clean-up keeps it, and drops it after 24 h if the sale is never saved.
 */
export async function uploadSalePhoto(photo: Blob): Promise<{ url: string } | { error: string }> {
  let body: Blob = photo;
  if (photo instanceof File) {
    try {
      body = (await prepareLeadPhotos([photo])).files[0] ?? photo;
    } catch {
      body = photo;
    }
  }
  let response: Response;
  try {
    response = await fetch('/api/admin/product-images', {
      method: 'POST',
      headers: { 'content-type': body.type || 'application/octet-stream' },
      body,
    });
  } catch {
    return { error: 'The photo did not upload — the connection dropped. Try again.' };
  }
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !data?.url) return { error: data?.error ?? 'The photo did not upload. Try again.' };
  return { url: data.url };
}

/** A touch screen (iPad, phone) opens its own camera from a file input; a computer uses the webcam window. */
export function prefersNativeCamera(): boolean {
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
