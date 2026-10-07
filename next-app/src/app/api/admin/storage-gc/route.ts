import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import {
  PRODUCT_IMAGES_BUCKET,
  getProductImageStoragePath,
  uniqueProductImageStoragePaths,
} from '@/lib/product-image-storage';

const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const SAMPLE_LIMIT = 25;

type StorageObject = {
  name: string;
  id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StorageBucketApi = {
  list: (
    path?: string,
    options?: {
      limit?: number;
      offset?: number;
      sortBy?: { column: string; order: 'asc' | 'desc' };
    },
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
};

function objectTimestamp(object: StorageObject): number | null {
  const raw = object.updated_at ?? object.created_at ?? object.last_accessed_at ?? null;
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function maybeSelect<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (!error) return data ?? [];
  throw new Error(`${label}: ${error.message}`);
}

async function listObjectDetails(storage: StorageBucketApi, prefix = ''): Promise<Array<{ path: string; object: StorageObject }>> {
  const rows: Array<{ path: string; object: StorageObject }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(error.message);

    const entries = (data ?? []) as StorageObject[];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const hasObjectMetadata = Boolean(entry.id || entry.metadata?.size || entry.metadata?.mimetype);
      if (hasObjectMetadata) rows.push({ path, object: entry });
      else rows.push(...await listObjectDetails(storage, path));
    }

    if (entries.length < 100) break;
    offset += entries.length;
  }

  return rows;
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const confirm = Boolean((await req.json().catch(() => null))?.confirm);

  const supabase = createServiceClient();
  let products: Array<{ images: unknown; image_urls: unknown }>;
  let orderItems: Array<{ image_snapshot: string | null }>;
  let inquiries: Array<{ uploaded_image_urls: unknown }>;
  let notifications: Array<{ image_urls: unknown }>;

  try {
    [products, orderItems, inquiries, notifications] = await Promise.all([
      maybeSelect<{ images: unknown; image_urls: unknown }>(
        'products.images,image_urls',
        supabase.from('products').select('images, image_urls'),
      ),
      maybeSelect<{ image_snapshot: string | null }>(
        'order_items.image_snapshot',
        supabase.from('order_items').select('image_snapshot'),
      ),
      maybeSelect<{ uploaded_image_urls: unknown }>(
        'inquiries.uploaded_image_urls',
        supabase.from('inquiries').select('uploaded_image_urls'),
      ),
      maybeSelect<{ image_urls: unknown }>(
        'admin_notifications.image_urls',
        supabase.from('admin_notifications').select('image_urls'),
      ),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: `Storage GC aborted before object scan: ${error instanceof Error ? error.message : 'reference read failed'}` },
      { status: 500 },
    );
  }

  const referencedPaths = new Set(uniqueProductImageStoragePaths([
    ...products.flatMap((row) => [...asStringArray(row.images), ...asStringArray(row.image_urls)]),
    ...orderItems.map((row) => row.image_snapshot),
    ...inquiries.flatMap((row) => asStringArray(row.uploaded_image_urls)),
    ...notifications.flatMap((row) => asStringArray(row.image_urls)),
  ]));

  // Instagram renditions live in this same bucket under their own prefix and
  // are referenced by instagram_posts.rendition_paths, not by any product row.
  // Without this they would read as orphans and be deleted, which would break
  // any post prepared-but-not-yet-published (its image URLs would 404 when
  // Instagram tried to fetch them). Tolerant of a missing table so the sweep
  // still works in an environment where instagram-sync.sql has not been run —
  // if the table is absent, no renditions exist either.
  const { data: instagramPosts } = await supabase
    .from('instagram_posts')
    .select('rendition_paths');
  for (const row of (instagramPosts as Array<{ rendition_paths: unknown }> | null) ?? []) {
    // Stored as bare storage paths, so they are added verbatim rather than
    // through the product-image URL parser.
    for (const path of asStringArray(row.rendition_paths)) referencedPaths.add(path);
  }

  // Facebook renditions: same contract, own prefix (facebook-renditions/) and
  // own reference column. Tolerant of a missing table for the same reason.
  const { data: facebookPosts } = await supabase
    .from('facebook_posts')
    .select('rendition_paths');
  for (const row of (facebookPosts as Array<{ rendition_paths: unknown }> | null) ?? []) {
    for (const path of asStringArray(row.rendition_paths)) referencedPaths.add(path);
  }

  // Text deals (2026-09-15): the owner's photos (WebP) and the rendered
  // pictures (JPEG) under text-deals/<deal>/. Twilio fetches the pictures by
  // URL at send time, so deleting one would break a deal mid-send. Since
  // 2026-10-07 a deal also has detail shots (`detail_photo_paths`) and their
  // pictures (`detail_media_paths`). `select('*')` on purpose: naming those
  // columns would fail the whole read where their SQL has not been run, and a
  // failed read here would mark every deal photo as an orphan.
  const { data: textDeals } = await supabase
    .from('text_deals')
    .select('*');
  for (const row of (textDeals as Array<{ photo_path: string | null; card_path: string | null; detail_photo_paths?: unknown; detail_media_paths?: unknown }> | null) ?? []) {
    if (row.photo_path) referencedPaths.add(row.photo_path);
    if (row.card_path) referencedPaths.add(row.card_path);
    for (const path of asStringArray(row.detail_photo_paths)) referencedPaths.add(path);
    for (const path of asStringArray(row.detail_media_paths)) referencedPaths.add(path);
  }

  const storage = supabase.storage.from(PRODUCT_IMAGES_BUCKET);
  const objectRows = await listObjectDetails(storage);
  const now = Date.now();
  const oldUnreferenced = objectRows.filter(({ path, object }) => {
    const timestamp = objectTimestamp(object);
    if (timestamp == null) return false;
    if (now - timestamp < ORPHAN_MIN_AGE_MS) return false;
    return !referencedPaths.has(getProductImageStoragePath(path) ?? path);
  });
  const unknownAgeCount = objectRows.filter(({ object }) => objectTimestamp(object) == null).length;

  let deletedPaths: string[] = [];
  if (confirm && oldUnreferenced.length > 0) {
    deletedPaths = oldUnreferenced.map(({ path }) => path);
    const { error } = await storage.remove(deletedPaths);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    dryRun: !confirm,
    objectCount: objectRows.length,
    referencedPathCount: referencedPaths.size,
    orphanCount: oldUnreferenced.length,
    skippedUnknownAgeCount: unknownAgeCount,
    samplePaths: oldUnreferenced.slice(0, SAMPLE_LIMIT).map(({ path }) => path),
    deletedCount: deletedPaths.length,
    deletedSamplePaths: deletedPaths.slice(0, SAMPLE_LIMIT),
  });
}
