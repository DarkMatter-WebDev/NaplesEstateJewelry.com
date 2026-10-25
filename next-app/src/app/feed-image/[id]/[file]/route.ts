import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fetchImageBytes } from '@/lib/instagram/images';
import { toOwnedBuffer } from '@/lib/product-image-encode';
import { feedImageToken, parseFeedImageFile, productFeedImages } from '@/lib/meta-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Longest edge sent to Meta (its catalog minimum is 500 px; 1024+ recommended). */
const MAX_EDGE_PX = 1600;

/**
 * A product photo as JPEG for the Meta catalog (2026-10-25; see
 * lib/meta-feed.ts). Only addresses the feed issued resolve: the token must
 * equal the hash of the photo currently stored at that position, so this can
 * never be pointed at an arbitrary URL, and a replaced photo 404s at its old
 * address. A good answer is immutable and cached for a year by the CDN.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
): Promise<Response> {
  const { id, file } = await params;
  const parsed = parseFeedImageFile(file);
  if (!parsed) return new Response('Not found', { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: row, error } = await supabase
    .from('products')
    .select('image_urls, images')
    .eq('id', id)
    .maybeSingle();
  if (error) return new Response('Source unavailable', { status: 503 });

  const source = row ? productFeedImages(row)[parsed.index] : undefined;
  if (!source || feedImageToken(source) !== parsed.token) {
    return new Response('Not found', { status: 404 });
  }

  let jpeg: Buffer<ArrayBuffer>;
  try {
    const bytes = await fetchImageBytes(source);
    jpeg = toOwnedBuffer(await sharp(bytes)
      .rotate()
      .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer());
  } catch {
    return new Response('Image unavailable', { status: 502 });
  }

  return new Response(jpeg, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Robots-Tag': 'noindex',
    },
  });
}
