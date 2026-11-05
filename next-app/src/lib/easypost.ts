import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';

// EasyPost Tracker + Webhook REST calls (owner, 2026-11-05: chosen as the
// cheapest long-term option — works with the USPS labels printed through
// PayPal; $0.01–$0.03 per shipment per easypost.com/pricing).
//
// Facts checked against docs.easypost.com on 2026-11-05:
// - Auth: HTTP Basic, the API key as the username, empty password.
// - POST /v2/trackers {tracker:{tracking_code, carrier?}} — carrier optional
//   (auto-detect); the same code + carrier within three months returns the
//   ORIGINAL tracker (no duplicate).
// - Webhook events: {object:"Event", description:"tracker.updated", result: Tracker}.
//   Signed in `X-Hmac-Signature` = "hmac-sha256-hex=" + hex HMAC-SHA256 of the
//   body, key = webhook_secret NFKD-normalised (easypost-node validateWebhook).
//   EasyPost retries a failed delivery up to six times and wants a 2xx within
//   seven seconds.
// - Times in tracking_details carry the scan's local offset when known, else Z.

const API_BASE = 'https://api.easypost.com/v2';
const REQUEST_TIMEOUT_MS = 12_000;

export interface EasyPostTrackingLocation {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
}

export interface EasyPostTrackingDetail {
  message?: string | null;
  description?: string | null;
  status?: string | null;
  status_detail?: string | null;
  datetime?: string | null;
  tracking_location?: EasyPostTrackingLocation | null;
}

export interface EasyPostTracker {
  id: string;
  object?: string;
  mode?: string;
  tracking_code?: string;
  status?: string | null;
  status_detail?: string | null;
  carrier?: string | null;
  public_url?: string | null;
  tracking_details?: EasyPostTrackingDetail[] | null;
}

export interface EasyPostWebhook {
  id: string;
  mode?: string;
  url?: string;
  disabled_at?: string | null;
}

export class EasyPostError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'EasyPostError';
    this.status = status;
  }
}

export function easyPostApiKey(): string | null {
  return process.env.EASYPOST_API_KEY?.trim() || null;
}

export function easyPostWebhookSecret(): string | null {
  return process.env.EASYPOST_WEBHOOK_SECRET?.trim() || null;
}

/** True when the site can register packages and send the delivery emails. */
export function isDeliveryTrackingConfigured(): boolean {
  return Boolean(easyPostApiKey());
}

/** EasyPost test keys start "EZTK", production keys "EZAK". */
export function easyPostKeyMode(key: string | null = easyPostApiKey()): 'test' | 'production' | 'unknown' | null {
  if (!key) return null;
  if (key.startsWith('EZTK')) return 'test';
  if (key.startsWith('EZAK')) return 'production';
  return 'unknown';
}

async function easyPostRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = easyPostApiKey();
  if (!key) throw new EasyPostError('EASYPOST_API_KEY is not set.', 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (data as { error?: { message?: string } } | null)?.error?.message
        ?? `EasyPost request failed (${response.status}).`;
      throw new EasyPostError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof EasyPostError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new EasyPostError('EasyPost did not answer in time.', 504);
    }
    throw new EasyPostError(error instanceof Error ? error.message : 'EasyPost request failed.', 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Register a package. With a carrier first; if EasyPost rejects that pairing
 * (a carrier string it does not know, a typo in the owner's carrier box), once
 * more without it so EasyPost auto-detects from the number.
 */
export async function createTracker(trackingCode: string, carrier: string | null): Promise<EasyPostTracker> {
  const body = (withCarrier: boolean) => ({
    tracker: withCarrier && carrier ? { tracking_code: trackingCode, carrier } : { tracking_code: trackingCode },
  });
  try {
    return await easyPostRequest<EasyPostTracker>('/trackers', { method: 'POST', body: body(true) });
  } catch (error) {
    if (carrier && error instanceof EasyPostError && error.status >= 400 && error.status < 500) {
      return easyPostRequest<EasyPostTracker>('/trackers', { method: 'POST', body: body(false) });
    }
    throw error;
  }
}

export function retrieveTracker(trackerId: string): Promise<EasyPostTracker> {
  return easyPostRequest<EasyPostTracker>(`/trackers/${encodeURIComponent(trackerId)}`);
}

export async function listWebhooks(): Promise<EasyPostWebhook[]> {
  const data = await easyPostRequest<{ webhooks?: EasyPostWebhook[] }>('/webhooks');
  return data.webhooks ?? [];
}

/** Create the webhook for `url`, or update the existing one (also re-enables a disabled one). */
export async function upsertWebhook(url: string, webhookSecret: string): Promise<EasyPostWebhook> {
  const existing = (await listWebhooks()).find((hook) => hook.url === url);
  if (existing) {
    return easyPostRequest<EasyPostWebhook>(`/webhooks/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      body: { webhook: { webhook_secret: webhookSecret } },
    });
  }
  return easyPostRequest<EasyPostWebhook>('/webhooks', {
    method: 'POST',
    body: { webhook: { url, webhook_secret: webhookSecret } },
  });
}

/**
 * `X-Hmac-Signature` check, the same algorithm as easypost-node's
 * validateWebhook — including its fix-up that rewrites integer "weight"
 * values to "N.0" before hashing. Both the raw body and the fixed-up body are
 * accepted, so either way EasyPost signs it, it verifies.
 */
export function verifyEasyPostSignature(rawBody: string, header: string | null, secret: string | null): boolean {
  if (!header || !secret) return false;
  const key = Buffer.from(secret.normalize('NFKD'), 'utf8');
  const bodies = [rawBody];
  const corrected = rawBody.replace(/("weight":\s*)(\d+)(\s*)(?=,|\})/g, '$1$2.0');
  if (corrected !== rawBody) bodies.push(corrected);

  const actual = Buffer.from(header.trim(), 'utf8');
  return bodies.some((body) => {
    const digest = `hmac-sha256-hex=${createHmac('sha256', key).update(body, 'utf8').digest('hex')}`;
    const expected = Buffer.from(digest, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}
