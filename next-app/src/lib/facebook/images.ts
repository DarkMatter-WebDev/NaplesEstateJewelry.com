import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedRect } from '@/lib/instagram/backdrop';
import {
  buildRenditions,
  deleteRenditions,
  isCardRenditionPath,
  type BuiltRenditions,
} from '@/lib/instagram/images';
import type { CardContent } from '@/lib/instagram/card';

/**
 * Facebook rendition pipeline — the same engine as Instagram's (square
 * backdrop-matched JPEGs led by the generated card), bound to a Facebook-only
 * Storage prefix.
 *
 * The engine is shared on purpose: it is OUR image code (sharp + the card
 * renderer), not a marketplace API client, and the whole point of the card
 * pipeline is that a product presents identically on every channel. What is
 * NOT shared is the objects themselves — re-preparing an Instagram post
 * deletes its previous renditions, and if Facebook referenced those same
 * paths its next publish would 404 exactly when Meta fetched them.
 *
 * This prefix is registered with the Storage GC reference scan alongside
 * facebook_posts.rendition_paths (see /api/admin/storage-gc).
 */
export const FACEBOOK_RENDITION_PREFIX = 'facebook-renditions';

export { deleteRenditions, isCardRenditionPath };
export type { CardContent };

export async function buildFacebookRenditions(params: {
  service: SupabaseClient;
  productId: string;
  imageUrls: string[];
  crops?: Record<string, NormalizedRect> | null;
  card: CardContent;
  cardSourceUrl?: string | null;
  cardBackground?: string | null;
}): Promise<BuiltRenditions> {
  return buildRenditions({ ...params, pathPrefix: FACEBOOK_RENDITION_PREFIX });
}
