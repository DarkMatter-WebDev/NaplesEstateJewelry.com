import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Best-effort per-key rate limiting for unauthenticated endpoints (lead forms,
 * subscribe/unsubscribe, checkout). Backed by the `check_rate_limit` SECURITY
 * DEFINER RPC + `rate_limits` table (see supabase/rate-limiting.sql).
 *
 * Design notes:
 * - An in-memory Map is NOT used on purpose: Netlify runs many short-lived lambda
 *   instances, so a per-instance counter resets on every cold start and never sees
 *   a distributed burst. The DB counter is shared across all instances.
 * - FAILS CLOSED: an infrastructure or configuration error denies the request.
 *   Netlify edge limits provide the first layer; this shared DB counter is the
 *   authoritative second layer across all function instances.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  return (await rateLimitState(key, max, windowSeconds)) === 'ok';
}

export type RateLimitState = 'ok' | 'limited' | 'unavailable';

/**
 * The same counter, for the rare caller that must tell "over the limit" from
 * "the limiter itself could not be reached". `checkRateLimit` treats both as a
 * refusal (fails closed); a caller that reads this instead decides for itself.
 *
 * Added for the buy receipt's staff-code keypad (2026-10-03): the code is
 * already behind an admin sign-in, and a limiter outage must not leave a
 * tablet that the right code cannot unlock.
 */
export async function rateLimitState(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitState> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return 'unavailable';
  }
  try {
    const { data, error } = await service.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return 'unavailable';
    return data === false ? 'limited' : 'ok';
  } catch {
    return 'unavailable';
  }
}

/**
 * Best-effort client IP for rate-limit keying. Netlify sets
 * `x-nf-client-connection-ip`; fall back to the first `x-forwarded-for` hop.
 * Returns 'unknown' when neither is present (all such callers then share one
 * bucket, which is acceptable for a coarse abuse control).
 */
export function getClientIp(req: Request): string {
  const ip =
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0] ??
    '';
  return ip.trim() || 'unknown';
}
