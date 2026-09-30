import 'server-only';

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FacebookApiError,
  type FacebookAccessTokenMetadata,
  fetchFacebookAccessTokenMetadata,
  fetchPageProfile,
  isFacebookPostReadPermissionError,
  verifyPagePostReadAccess,
} from './client';

/**
 * Facebook Page token lifecycle.
 *
 * Meta can issue either finite or non-expiring Page tokens depending on how
 * the upstream User/System User token was obtained. Candidate tokens are
 * inspected before storage; short-lived tokens are rejected and any longer
 * finite expiry is recorded truthfully for the operator.
 */

export const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID ?? '1551269126645242';
export const FACEBOOK_MIN_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function facebookAppAccessToken(): string {
  const secret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!secret) {
    throw new FacebookApiError({
      status: 503,
      code: 'token_inspection_not_configured',
      operatorMessage:
        'Facebook token lifetime validation is not configured. Add FACEBOOK_APP_SECRET to the server environment before connecting a Page.',
      retryable: false,
    });
  }
  return `${FACEBOOK_APP_ID}|${secret}`;
}

export function facebookTokenInspectionConfigured(): boolean {
  return Boolean(FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET?.trim());
}

export function assessFacebookAccessTokenMetadata(params: {
  metadata: FacebookAccessTokenMetadata;
  expectedAppId?: string;
  now?: Date;
}): { tokenExpiresAt: string | null } {
  const { metadata, expectedAppId = FACEBOOK_APP_ID, now = new Date() } = params;

  if (metadata.is_valid !== true) {
    throw new FacebookApiError({
      status: 401,
      code: 'invalid_token',
      operatorMessage: 'Facebook reports that this Page token is not valid. Generate a fresh token and try again.',
      retryable: false,
    });
  }

  if (metadata.app_id && metadata.app_id !== expectedAppId) {
    throw new FacebookApiError({
      status: 409,
      code: 'wrong_app',
      operatorMessage:
        'That Page token was generated for a different Meta app. Generate it with the Naples Estate Jewelry Social app.',
      retryable: false,
    });
  }

  const finiteExpiries = [metadata.expires_at, metadata.data_access_expires_at]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .map((value) => value * 1000);
  const expiresAtMs = finiteExpiries.length > 0 ? Math.min(...finiteExpiries) : null;

  if (expiresAtMs !== null && expiresAtMs - now.getTime() < FACEBOOK_MIN_TOKEN_LIFETIME_MS) {
    const expiresAt = new Date(expiresAtMs);
    const alreadyExpired = expiresAtMs <= now.getTime();
    throw new FacebookApiError({
      status: 400,
      code: alreadyExpired ? 'invalid_token' : 'short_lived_token',
      operatorMessage: alreadyExpired
        ? 'That Facebook Page token has already expired. Generate a fresh long-lived Page token.'
        : `That Facebook Page token expires on ${expiresAt.toISOString()}. Generate a long-lived Page token with at least 30 days remaining.`,
      retryable: false,
    });
  }

  return {
    tokenExpiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Token encryption at rest (AES-256-GCM), identical scheme to Instagram/Etsy/
// eBay. FACEBOOK_TOKEN_ENC_KEY can be any non-empty string — we SHA-256 it to
// a stable 32-byte key. Local and production share one Supabase database, so
// the key MUST be byte-identical in .env.local and Netlify.
// ---------------------------------------------------------------------------
function encryptionKey(): Buffer {
  const raw = process.env.FACEBOOK_TOKEN_ENC_KEY;
  if (!raw) throw new Error('FACEBOOK_TOKEN_ENC_KEY is not configured.');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptToken(enc: string): string {
  const [ivB64, tagB64, dataB64] = enc.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted token.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

export function facebookTokenEncryptionConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_TOKEN_ENC_KEY);
}

// ---------------------------------------------------------------------------
// Connection-aware helpers
// ---------------------------------------------------------------------------

/**
 * Validate a token the owner just pasted and resolve the Page it belongs to.
 * Never persists anything: callers decide what to store.
 *
 * The most likely operator mistake is pasting a USER token instead of a PAGE
 * token — both start with "EAA" and both pass a bare /me probe. Page nodes
 * carry a `category` field and user nodes do not, so that distinction is the
 * check, and the error says exactly what to go back and copy.
 */
export async function verifyPastedPageToken(token: string): Promise<{
  pageId: string;
  pageName: string | null;
  tokenExpiresAt: string | null;
}> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste the Facebook Page access token before saving.');

  const profile = await fetchPageProfile(trimmed);
  if (!profile?.id) {
    throw new FacebookApiError({
      status: 0,
      code: 'invalid_token',
      operatorMessage: 'That token did not resolve to a Facebook account.',
      retryable: false,
    });
  }

  if (!profile.category) {
    throw new FacebookApiError({
      status: 0,
      code: 'invalid_token',
      operatorMessage:
        'That is a User token, not a Page token. In the Graph API Explorer, switch "User or Page" to your Page and copy that token instead.',
      retryable: false,
    });
  }

  try {
    await verifyPagePostReadAccess(String(profile.id), trimmed);
  } catch (err) {
    if (isFacebookPostReadPermissionError(err)) {
      throw new FacebookApiError({
        status: 403,
        code: 'missing_read_permission',
        operatorMessage:
          'That Page token cannot read posts. Generate it with pages_read_engagement so published statuses can be refreshed.',
        retryable: false,
      });
    }
    throw err;
  }

  const metadata = await fetchFacebookAccessTokenMetadata(trimmed, facebookAppAccessToken());
  const lifetime = assessFacebookAccessTokenMetadata({ metadata });

  return {
    pageId: String(profile.id),
    pageName: profile.name ?? null,
    tokenExpiresAt: lifetime.tokenExpiresAt,
  };
}

/**
 * Decrypt the stored token for use in an API call. Returns null when there is
 * nothing usable, so callers fail closed rather than attempting an
 * unauthenticated write. There is no Facebook refresh endpoint in this owner
 * flow; a finite token's exact expiration is tracked and a rejected/expired
 * token requires a fresh validated paste.
 */
export async function ensurePageAccessToken(
  service: SupabaseClient,
): Promise<{ accessToken: string; pageId: string } | null> {
  const { data: connection } = await service
    .from('facebook_connection')
    .select('status, page_id, access_token_enc')
    .eq('id', 1)
    .maybeSingle();

  if (!connection?.access_token_enc || !connection.page_id) return null;

  let accessToken: string;
  try {
    accessToken = decryptToken(connection.access_token_enc);
  } catch {
    return null;
  }

  return { accessToken, pageId: String(connection.page_id) };
}

/**
 * Mark the connection as needing a fresh paste. Called by sync paths when
 * Facebook rejects the stored token — the page-token equivalent of Instagram's
 * expiry handling. This covers expiration as well as explicit invalidation.
 */
export async function markNeedsReauth(service: SupabaseClient): Promise<void> {
  await service
    .from('facebook_connection')
    .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
    .eq('id', 1);
}
