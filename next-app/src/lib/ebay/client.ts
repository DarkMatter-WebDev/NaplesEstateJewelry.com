import 'server-only';
import { XMLParser } from 'fast-xml-parser';
import type { EbayOrder } from '@/lib/marketplace-sales';
import { MARKETPLACE_TIMEOUT_MS, isFetchTimeoutError, timeoutLabel } from '@/lib/marketplace-timeout';

// Fetch wrapper for eBay's REST APIs. Modeled on next-app/src/lib/etsy/client.ts's
// shape (throttle + backoff + typed error + redacted logging) — never imports
// from it. See ebay-sync-plan/rest-endpoints-used.md and
// ebay-sync-plan/10-rate-limits-and-quotas.md.
//
// NOTE ON VERIFICATION (BUILD-PROMPT.md hard rule 8): this build environment
// has no network access to developer.ebay.com (WebFetch timed out repeatedly)
// and no eBay keyset credentials, so the endpoint hosts/paths/header formats
// below are pinned from well-established, stable eBay Sell API conventions
// (unchanged for years) plus the plan's own prior research — not a fresh live
// fetch of the OpenAPI contract. Flagged TODO(ebay-verify) at every point the
// plan itself already flagged uncertainty; everything else should be spot
// checked against developer.ebay.com by whoever has real credentials before
// the first production sync.

function isSandbox(): boolean {
  return process.env.EBAY_ENV === 'sandbox';
}

export const EBAY_API_BASE = isSandbox() ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
export const EBAY_AUTH_BASE = isSandbox() ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
// TODO(ebay-verify): sandbox auth host assumed to follow eBay's standard
// env-prefix convention (auth.sandbox.ebay.com); the plan's
// rest-endpoints-used.md only confirms the production host (auth.ebay.com).
export const EBAY_TOKEN_URL = `${EBAY_API_BASE}/identity/v1/oauth2/token`;
const EBAY_TRADING_API_URL = `${EBAY_API_BASE}/ws/api.dll`;

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

export function requireEbayClientId(): string {
  const value = process.env.EBAY_CLIENT_ID;
  if (!value) throw new Error('EBAY_CLIENT_ID is not configured.');
  return value;
}

export function requireEbayClientSecret(): string {
  const value = process.env.EBAY_CLIENT_SECRET;
  if (!value) throw new Error('EBAY_CLIENT_SECRET is not configured.');
  return value;
}

/** Basic base64(client_id:client_secret) — used on every token-endpoint call (confidential client, no PKCE). */
export function basicAuthHeader(): string {
  const raw = `${requireEbayClientId()}:${requireEbayClientSecret()}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

interface EbayErrorDetailEntry {
  errorId?: number;
  domain?: string;
  category?: string;
  message?: string;
  parameters?: Array<{ name?: string; value?: string }>;
}

export class EbayApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly operatorMessage: string;
  readonly retryable: boolean;
  readonly errorId?: number;
  readonly category?: string;
  readonly detail: unknown; // redacted response detail — safe to store in a sync-log row

  constructor(opts: {
    status: number;
    code: string;
    operatorMessage: string;
    retryable: boolean;
    errorId?: number;
    category?: string;
    detail?: unknown;
  }) {
    super(opts.operatorMessage);
    this.name = 'EbayApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.operatorMessage = opts.operatorMessage;
    this.retryable = opts.retryable;
    this.errorId = opts.errorId;
    this.category = opts.category;
    this.detail = opts.detail;
  }
}

interface EbayErrorEnvelope {
  errors?: Array<{
    errorId?: number;
    domain?: string;
    category?: string;
    message?: string;
    longMessage?: string;
    parameters?: Array<{ name?: string; value?: string }>;
  }>;
}

// Allowlist only — never a raw dump of the response body (11-error-handling.md:
// "never log Authorization material; detail is built from an allowlist of
// response fields, not a raw dump").
function redactDetail(body: EbayErrorEnvelope | null): EbayErrorDetailEntry[] | null {
  if (!body?.errors?.length) return null;
  return body.errors.map((entry) => ({
    errorId: entry.errorId,
    domain: entry.domain,
    category: entry.category,
    message: typeof (entry.longMessage ?? entry.message) === 'string' ? (entry.longMessage ?? entry.message)!.slice(0, 500) : undefined,
    // eBay's own field-name/value validation hints (e.g. which aspect or
    // policy field was rejected) — not secret, and often the only place the
    // *specific* reason behind a generic top-level message shows up.
    parameters: Array.isArray(entry.parameters)
      ? entry.parameters.map((p) => ({ name: p.name, value: typeof p.value === 'string' ? p.value.slice(0, 200) : p.value }))
      : undefined,
  }));
}

function mapErrorResponse(status: number, body: EbayErrorEnvelope | null): EbayApiError {
  const first = body?.errors?.[0];
  const errorId = first?.errorId;
  const category = first?.category;
  const message = first?.longMessage || first?.message || `eBay API error (HTTP ${status}).`;
  const detail = redactDetail(body);

  if (status === 429 || errorId === 2001) {
    return new EbayApiError({
      status,
      code: 'rate_limited',
      operatorMessage: 'eBay is rate-limiting requests right now. Retrying automatically.',
      retryable: true,
      errorId,
      category,
      detail,
    });
  }
  if (status === 401 || errorId === 1001 || errorId === 1003) {
    return new EbayApiError({
      status,
      code: 'auth_expired',
      operatorMessage: 'eBay connection expired — click Reconnect eBay.',
      retryable: false,
      errorId,
      category,
      detail,
    });
  }
  if (errorId === 1100) {
    return new EbayApiError({
      status,
      code: 'missing_scope',
      operatorMessage: 'eBay connection is missing a required permission — reconnect eBay to grant it.',
      retryable: false,
      errorId,
      category,
      detail,
    });
  }
  if (category === 'APPLICATION' || status >= 500) {
    return new EbayApiError({
      status,
      code: 'ebay_server_error',
      operatorMessage: message,
      retryable: true,
      errorId,
      category,
      detail,
    });
  }
  return new EbayApiError({
    status,
    code: 'ebay_error',
    operatorMessage: message,
    retryable: false,
    errorId,
    category,
    detail,
  });
}

/**
 * A request that hit its time limit (see lib/marketplace-timeout.ts). Not
 * retryable — the scheduled sweeps re-read on their next run — and never
 * auth_expired/missing_scope, so it is logged per item, not as a dead connection.
 */
function ebayTimeoutError(method: string, path: string, timeoutMs: number): EbayApiError {
  return new EbayApiError({
    status: 0,
    code: 'ebay_timeout',
    operatorMessage: `eBay did not respond within ${timeoutLabel(timeoutMs)}. Try again in a minute.`,
    retryable: false,
    detail: [{ message: `${method} ${path.replace(/\?.*$/, '')}` }],
  });
}

/** `fetch` with a time limit that surfaces as a typed ebay_timeout error. Used by every eBay call. */
export async function fetchWithEbayTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  label: { method: string; path: string },
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (isFetchTimeoutError(err)) throw ebayTimeoutError(label.method, label.path, timeoutMs);
    throw err;
  }
}

// Modest throttle (min-interval gate, not a true token bucket) — mirrors
// etsy/client.ts. eBay's REST APIs don't document a hard per-second QPS cap
// at this catalog's daily-quota scale (10-rate-limits-and-quotas.md), so this
// is a courtesy pace, not a compliance requirement.
const MIN_INTERVAL_MS = 280; // ~3.5 req/s
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EbayRequestOptions {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  path: string; // absolute (https://...) or relative to EBAY_API_BASE
  accessToken?: string; // omit for application-token / unauthenticated calls
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  contentLanguage?: boolean; // required by Sell Inventory write calls (Content-Language: en-US)
  maxRetries?: number;
  /** Per-attempt time limit; default MARKETPLACE_TIMEOUT_MS.api. */
  timeoutMs?: number;
}

export interface EbayResponse<T> {
  data: T;
  headers: Headers;
}

function buildUrl(path: string, query?: EbayRequestOptions['query']): URL {
  const url = new URL(path.startsWith('http') ? path : `${EBAY_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export async function ebayFetch<T>(opts: EbayRequestOptions): Promise<EbayResponse<T>> {
  const url = buildUrl(opts.path, opts.query);
  const maxRetries = opts.maxRetries ?? 3;
  const timeoutMs = opts.timeoutMs ?? MARKETPLACE_TIMEOUT_MS.api;
  // A body read can also outlast the limit; that must surface as a timeout,
  // never as silently-null data.
  const readJson = async <R>(res: Response): Promise<R | null> =>
    (await res.json().catch((err: unknown) => {
      if (isFetchTimeoutError(err)) throw ebayTimeoutError(opts.method, opts.path, timeoutMs);
      return null;
    })) as R | null;

  // Accept-Language is required on every Sell Inventory API call (not just
  // writes) — GET calls (e.g. getOffers) have no request body, so
  // Content-Language doesn't apply to them, but eBay still validates
  // Accept-Language on the response language. Confirmed live 2026-07-09:
  // omitting it entirely produced "Invalid value for header Accept-Language."
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'en-US' };
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
  if (opts.contentLanguage) headers['Content-Language'] = 'en-US';
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  let attempt = 0;
  for (;;) {
    await throttle();
    // Fresh limit per attempt, so a retried 429/5xx gets its own window.
    const res = await fetchWithEbayTimeout(url, { method: opts.method, headers, body, cache: 'no-store' }, timeoutMs, { method: opts.method, path: opts.path });

    if (res.ok) {
      const data = res.status === 204 ? (null as T) : ((await readJson<T>(res)) as T);
      return { data, headers: res.headers };
    }

    const parsedBody = await readJson<EbayErrorEnvelope>(res);
    const error = mapErrorResponse(res.status, parsedBody);
    if (error.retryable && attempt < maxRetries) {
      const backoffMs = 2 ** attempt * 1000; // 1s -> 2s -> 4s
      const jitter = Math.random() * 250;
      await sleep(backoffMs + jitter);
      attempt += 1;
      continue;
    }
    // Log the allowlisted detail (errorId/category/message/parameters — never
    // headers or tokens) for every non-retryable failure. eBay's top-level
    // message is often a generic wrapper ("The request has errors...") with
    // the actually-actionable reason only in a per-error `parameters` entry —
    // this is the one place that gets surfaced for every call site at once.
    console.error(`ebay client: ${opts.method} ${opts.path} failed (HTTP ${res.status}):`, JSON.stringify(error.detail));
    throw error;
  }
}

/**
 * The non-personal part of an eBay order — the ONLY fields that leave
 * getOrders(). Anything about the buyer is dropped here on purpose.
 */
export function trimEbayOrder(order: EbayOrder): EbayOrder {
  return {
    orderId: String(order.orderId),
    creationDate: order.creationDate,
    orderPaymentStatus: order.orderPaymentStatus ?? null,
    cancelStatus: order.cancelStatus ? { cancelState: order.cancelStatus.cancelState ?? null } : null,
    lineItems: (order.lineItems ?? []).map((line) => ({
      lineItemId: String(line.lineItemId),
      legacyItemId: line.legacyItemId ?? null,
      sku: line.sku ?? null,
      title: line.title ?? null,
      quantity: line.quantity,
      lineItemCost: line.lineItemCost ? { value: line.lineItemCost.value, currency: line.lineItemCost.currency } : null,
    })),
  };
}

/**
 * Orders created at or after `createdAfter` (Sell Fulfillment getOrders;
 * requires `sell.fulfillment.readonly`). Follows eBay's `next` link up to
 * `maxPages`. Shape is trimmed to what lib/marketplace-sales.ts reads.
 */
export async function getOrders(params: {
  accessToken: string;
  createdAfter: Date;
  maxPages?: number;
}): Promise<EbayOrder[]> {
  type Page = { orders?: EbayOrder[]; next?: string | null };
  const orders: EbayOrder[] = [];
  const maxPages = params.maxPages ?? 5;
  let path: string | null = '/sell/fulfillment/v1/order';
  let query: EbayRequestOptions['query'] = {
    filter: `creationdate:[${params.createdAfter.toISOString()}..]`,
    limit: 200,
  };
  for (let page = 0; page < maxPages && path; page += 1) {
    const res: EbayResponse<Page> = await ebayFetch<Page>({ method: 'GET', path, accessToken: params.accessToken, query });
    // eBay sends the buyer (username, ship-to name/address/phone/email) with
    // every order. Keep only the non-personal fields the sales sweep reads, so
    // buyer data never travels past this line ("we do not persist eBay data",
    // the basis of the account-deletion opt-out, 2026-11-16).
    orders.push(...(res.data?.orders ?? []).map(trimEbayOrder));
    // `next` is an absolute URL carrying its own query string.
    path = res.data?.next ?? null;
    query = undefined;
  }
  return orders;
}

export interface EbayTradingItemStatus {
  itemId: string;
  sku: string | null;
  listingStatus: string | null;
  relistedItemId: string | null;
}

interface TradingGetItemEnvelope {
  GetItemResponse?: {
    Ack?: string;
    Item?: {
      ItemID?: string;
      SKU?: string;
      SellingStatus?: { ListingStatus?: string };
      ListingDetails?: { RelistedItemID?: string };
    };
    Errors?:
      | { ErrorCode?: string; LongMessage?: string; ShortMessage?: string }
      | Array<{ ErrorCode?: string; LongMessage?: string; ShortMessage?: string }>;
  };
}

const tradingXmlParser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

export function parseTradingGetItemResponse(xml: string): {
  ack: string;
  item: EbayTradingItemStatus | null;
  errorCode: string | null;
  errorMessage: string | null;
} {
  const parsed = tradingXmlParser.parse(xml) as TradingGetItemEnvelope;
  const response = parsed.GetItemResponse;
  const rawErrors = response?.Errors;
  const firstError = Array.isArray(rawErrors) ? rawErrors[0] : rawErrors;
  const item = response?.Item;
  return {
    ack: response?.Ack ?? '',
    item: item?.ItemID
      ? {
          itemId: item.ItemID,
          sku: item.SKU ?? null,
          listingStatus: item.SellingStatus?.ListingStatus ?? null,
          relistedItemId: item.ListingDetails?.RelistedItemID ?? null,
        }
      : null,
    errorCode: firstError?.ErrorCode ?? null,
    errorMessage: firstError?.LongMessage ?? firstError?.ShortMessage ?? null,
  };
}

/**
 * Seller-side listing status lookup. The Inventory API does not move an old
 * offer to a listing that was relisted outside that offer, while Trading
 * GetItem exposes the old listing's RelistedItemID chain.
 */
export async function ebayTradingGetItemStatus(accessToken: string, itemId: string): Promise<EbayTradingItemStatus> {
  if (!/^\d+$/.test(itemId)) {
    throw new Error('Invalid eBay listing ID.');
  }

  const body = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
  await throttle();
  const res = await fetchWithEbayTimeout(EBAY_TRADING_API_URL, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml',
    },
    body,
    cache: 'no-store',
  }, MARKETPLACE_TIMEOUT_MS.api, { method: 'POST', path: '/ws/api.dll GetItem' });
  const parsed = parseTradingGetItemResponse(await res.text());
  if (res.ok && ['SUCCESS', 'WARNING'].includes(parsed.ack.toUpperCase()) && parsed.item) {
    return parsed.item;
  }

  const status = res.status || 502;
  const message = parsed.errorMessage || `eBay Trading API error (HTTP ${status}).`;
  throw new EbayApiError({
    status,
    code: status === 401 ? 'auth_expired' : 'trading_api_error',
    operatorMessage: status === 401 ? 'eBay connection expired - click Reconnect eBay.' : message,
    retryable: status >= 500,
    detail: parsed.errorCode ? [{ errorId: parsed.errorCode, message: message.slice(0, 500) }] : null,
  });
}

// ---------------------------------------------------------------------------
// Application token (client-credentials grant) — used for Taxonomy/Metadata/
// Notification-public-key reads, which don't need a seller's user token.
// Cached in-module for the lifetime of the invocation (Netlify functions are
// short-lived, so this is deliberately simple, not distributed/persisted —
// same reasoning as the request throttle above).
// ---------------------------------------------------------------------------
const APP_TOKEN_SCOPE = 'https://api.ebay.com/oauth/api_scope';
let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getApplicationToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt - 60_000 > Date.now()) {
    return cachedAppToken.token;
  }

  const res = await fetchWithEbayTimeout(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: APP_TOKEN_SCOPE }).toString(),
    cache: 'no-store',
  }, MARKETPLACE_TIMEOUT_MS.token, { method: 'POST', path: '/identity/v1/oauth2/token (application)' });

  const parsed = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!res.ok || !parsed?.access_token) {
    throw new EbayApiError({
      status: res.status,
      code: 'app_token_failed',
      operatorMessage: parsed?.error_description || 'Could not obtain an eBay application token.',
      retryable: res.status >= 500,
    });
  }

  cachedAppToken = {
    token: parsed.access_token,
    expiresAt: Date.now() + (parsed.expires_in ?? 7200) * 1000,
  };
  return cachedAppToken.token;
}
