import 'server-only';

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InstagramApiError, fetchInstagramProfile, redactInstagramSecrets } from './client';

/**
 * Instagram token lifecycle.
 *
 * Unlike Etsy/eBay there is no redirect OAuth dance here (see the header of
 * supabase/instagram-sync.sql for why): the owner pastes a long-lived token
 * generated in the Meta App Dashboard, and this module keeps it alive forever.
 *
 * Meta's rules we encode:
 *   * A long-lived Instagram User token lasts 60 days.
 *   * It can be refreshed only when it is at least 24h old and not yet expired.
 *   * A refresh returns a NEW token, also valid 60 days from the refresh.
 * An expired token cannot be refreshed — it needs a fresh paste, which is why
 * the scheduled refresh runs weekly rather than at the last minute.
 */

const INSTAGRAM_REFRESH_ENDPOINT = 'https://graph.instagram.com/refresh_access_token';
const INSTAGRAM_EXCHANGE_ENDPOINT = 'https://graph.instagram.com/access_token';

/**
 * Refresh once the token is inside this window of expiring.
 *
 * 14 days, not 7 (2026-09-14): the keep-warm job fires once a week (pg_cron,
 * Mon 12:15 UTC), so a 7-day window gave exactly ONE scheduled attempt before
 * expiry — one transient Meta/network failure and the token died before the
 * next Monday, forcing a manual re-paste. 14 days guarantees two attempts.
 */
export const INSTAGRAM_REFRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Meta refuses to refresh a token younger than this. */
export const INSTAGRAM_MIN_REFRESH_AGE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Token encryption at rest (AES-256-GCM), identical scheme to Etsy/eBay.
// INSTAGRAM_TOKEN_ENC_KEY can be any non-empty string the owner sets in
// Netlify — we SHA-256 it to a stable 32-byte key so the operator never has to
// think about byte lengths or encodings.
// ---------------------------------------------------------------------------
function encryptionKey(): Buffer {
  const raw = process.env.INSTAGRAM_TOKEN_ENC_KEY;
  if (!raw) throw new Error('INSTAGRAM_TOKEN_ENC_KEY is not configured.');
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

export function instagramTokenEncryptionConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_TOKEN_ENC_KEY);
}

// ---------------------------------------------------------------------------
// Token endpoints
// ---------------------------------------------------------------------------

interface TokenEndpointResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

async function callTokenEndpoint(url: URL, operation: string): Promise<TokenEndpointResponse> {
  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: 'no-store' });
  } catch (err) {
    throw new InstagramApiError({
      status: 0,
      code: 'network_error',
      operatorMessage: redactInstagramSecrets(
        err instanceof Error ? err.message : `Network error during ${operation}.`,
      ),
      retryable: true,
    });
  }

  const body = (await res.json().catch(() => null)) as
    | (TokenEndpointResponse & { error?: { message?: string; code?: number } })
    | null;

  if (!res.ok || !body?.access_token) {
    throw new InstagramApiError({
      status: res.status,
      code: res.status === 400 || res.status === 401 ? 'invalid_token' : 'token_request_failed',
      operatorMessage: redactInstagramSecrets(
        body?.error?.message ?? `Instagram rejected the ${operation} request.`,
      ),
      retryable: false,
      detail: { code: body?.error?.code ?? null },
    });
  }

  return body;
}

/**
 * Exchange a SHORT-lived token for a long-lived (60 day) one. Only needed if
 * the owner pastes a short-lived token; a dashboard-generated long-lived token
 * can be stored directly. Requires the Instagram app secret.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) throw new Error('INSTAGRAM_APP_SECRET is not configured.');

  const url = new URL(INSTAGRAM_EXCHANGE_ENDPOINT);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', secret);
  url.searchParams.set('access_token', shortLivedToken);

  const body = await callTokenEndpoint(url, 'long-lived token exchange');
  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in ?? 60 * 24 * 60 * 60,
  };
}

/** Refresh a long-lived token, yielding a new one valid 60 days from now. */
export async function refreshLongLivedToken(currentToken: string): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  const url = new URL(INSTAGRAM_REFRESH_ENDPOINT);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', currentToken);

  const body = await callTokenEndpoint(url, 'token refresh');
  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in ?? 60 * 24 * 60 * 60,
  };
}

// ---------------------------------------------------------------------------
// Refresh decision logic (pure — unit tested)
// ---------------------------------------------------------------------------

export type RefreshDecision =
  | { action: 'refresh' }
  | { action: 'skip'; reason: 'too_young' | 'not_due' | 'no_token' }
  | { action: 'reauth'; reason: 'expired' };

/**
 * Decide whether a stored token should be refreshed right now.
 *
 * Kept pure and separate from I/O so every branch (expired, too young to
 * refresh, not yet due, due) is unit-testable without touching the network.
 */
export function decideTokenRefresh(params: {
  hasToken: boolean;
  expiresAt: Date | null;
  refreshedAt: Date | null;
  now: Date;
}): RefreshDecision {
  const { hasToken, expiresAt, refreshedAt, now } = params;
  if (!hasToken) return { action: 'skip', reason: 'no_token' };

  // An expired token cannot be refreshed; only a new paste recovers it.
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { action: 'reauth', reason: 'expired' };
  }

  // Meta rejects refreshes for tokens younger than 24 hours.
  if (refreshedAt && now.getTime() - refreshedAt.getTime() < INSTAGRAM_MIN_REFRESH_AGE_MS) {
    return { action: 'skip', reason: 'too_young' };
  }

  // Unknown expiry: refresh so we establish a known-good expiry going forward.
  if (!expiresAt) return { action: 'refresh' };

  if (expiresAt.getTime() - now.getTime() <= INSTAGRAM_REFRESH_WINDOW_MS) {
    return { action: 'refresh' };
  }

  return { action: 'skip', reason: 'not_due' };
}

// ---------------------------------------------------------------------------
// Connection-aware helpers
// ---------------------------------------------------------------------------

export interface StoredConnectionToken {
  accessTokenEnc: string | null;
  expiresAt: string | null;
  refreshedAt: string | null;
}

/**
 * Validate a token the owner just pasted and resolve the account it belongs to.
 * Never persists anything: callers decide what to store.
 */
export async function verifyPastedToken(token: string): Promise<{
  igUserId: string;
  username: string | null;
  accountType: string | null;
}> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste the Instagram access token before saving.');

  const profile = await fetchInstagramProfile(trimmed);
  if (!profile?.id) {
    throw new InstagramApiError({
      status: 0,
      code: 'invalid_token',
      operatorMessage: 'That token did not resolve to an Instagram account.',
      retryable: false,
    });
  }

  return {
    igUserId: String(profile.id),
    username: profile.username ?? null,
    accountType: profile.account_type ?? null,
  };
}

/**
 * Decrypt the stored token for use in an API call, refreshing it first when it
 * is close to expiry. Returns null when there is nothing usable, so callers
 * fail closed rather than attempting an unauthenticated write.
 */
export async function ensureFreshAccessToken(
  service: SupabaseClient,
): Promise<{ accessToken: string; igUserId: string } | null> {
  const { data: connection } = await service
    .from('instagram_connection')
    .select('status, ig_user_id, access_token_enc, token_expires_at, token_refreshed_at')
    .eq('id', 1)
    .maybeSingle();

  if (!connection?.access_token_enc || !connection.ig_user_id) return null;

  let accessToken: string;
  try {
    accessToken = decryptToken(connection.access_token_enc);
  } catch {
    return null;
  }

  const decision = decideTokenRefresh({
    hasToken: true,
    expiresAt: connection.token_expires_at ? new Date(connection.token_expires_at) : null,
    refreshedAt: connection.token_refreshed_at ? new Date(connection.token_refreshed_at) : null,
    now: new Date(),
  });

  if (decision.action === 'reauth') {
    await service
      .from('instagram_connection')
      .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
      .eq('id', 1);
    return null;
  }

  if (decision.action === 'refresh') {
    try {
      const refreshed = await refreshLongLivedToken(accessToken);
      accessToken = refreshed.accessToken;
      const now = new Date();
      await service
        .from('instagram_connection')
        .update({
          access_token_enc: encryptToken(refreshed.accessToken),
          token_expires_at: new Date(now.getTime() + refreshed.expiresInSeconds * 1000).toISOString(),
          token_refreshed_at: now.toISOString(),
          status: 'connected',
          updated_at: now.toISOString(),
        })
        .eq('id', 1);
    } catch (err) {
      // A failed refresh is not fatal while the current token is still valid —
      // keep using it and let the next scheduled run try again.
      const isAuthFailure = err instanceof InstagramApiError && err.code === 'invalid_token';
      if (isAuthFailure) {
        await service
          .from('instagram_connection')
          .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
          .eq('id', 1);
        return null;
      }
    }
  }

  return { accessToken, igUserId: String(connection.ig_user_id) };
}

/** Mark a token rejected by a normal Graph request as needing reconnection. */
export async function markNeedsReauth(service: SupabaseClient): Promise<void> {
  await service
    .from('instagram_connection')
    .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
    .eq('id', 1);
}
