import 'server-only';
import type { EtsyReceipt } from '@/lib/marketplace-sales';
import { MARKETPLACE_TIMEOUT_MS, isFetchTimeoutError, timeoutLabel } from '@/lib/marketplace-timeout';

// Etsy Open API v3 fetch wrapper: x-api-key + bearer auth, a client-side
// throttle well under Etsy's 5 QPS cap, and 429/5xx backoff. Modeled on
// src/lib/paypal.ts (fetch-based, no SDK dependency).
//
// See etsy-sync-plan/10-rate-limits-and-quotas.md and 11-error-handling.md.

// Confirmed 2026-07-08 against the full local OpenAPI spec (components.securitySchemes.api_key):
// the API host is openapi.etsy.com (not api.etsy.com, which the plan assumed).
export const ETSY_API_BASE = 'https://openapi.etsy.com';
export const ETSY_OAUTH_BASE = 'https://www.etsy.com';

export function etsyConfigured(): boolean {
  return Boolean(process.env.ETSY_API_KEY && process.env.ETSY_SHARED_SECRET);
}

/** Just the keystring — used as the OAuth `client_id` (authorize URL, token exchange body). */
export function requireEtsyApiKey(): string {
  const key = process.env.ETSY_API_KEY;
  if (!key) throw new Error('Etsy is not configured (ETSY_API_KEY is unset).');
  return key;
}

/**
 * The `x-api-key` HEADER value. Confirmed 2026-07-08 from the spec's own
 * securitySchemes description: "Every request to a v3 API endpoint must
 * include this data in the format `keystring:shared_secret`" — NOT the
 * keystring alone, which the plan (and this code, until this fix) assumed.
 * Getting this wrong produces Etsy's error "Shared secret is required in
 * x-api-key header" on every single call, regardless of endpoint.
 */
export function requireEtsyApiKeyHeader(): string {
  const key = requireEtsyApiKey();
  const secret = process.env.ETSY_SHARED_SECRET;
  if (!secret) throw new Error('Etsy is not configured (ETSY_SHARED_SECRET is unset).');
  return `${key}:${secret}`;
}

/**
 * Operator-facing error mapping (etsy-sync-plan/11-error-handling.md). `code`
 * is a short machine key; `operatorMessage` is what the admin UI/chip shows.
 */
export class EtsyApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly operatorMessage: string;
  readonly retryable: boolean;
  /** Redacted response detail — safe to store in etsy_sync_log.detail. */
  readonly detail: unknown;

  constructor(opts: { status: number; code: string; operatorMessage: string; retryable: boolean; detail?: unknown }) {
    super(opts.operatorMessage);
    this.name = 'EtsyApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.operatorMessage = opts.operatorMessage;
    this.retryable = opts.retryable;
    this.detail = opts.detail;
  }
}

/**
 * Etsy 400s come back in two shapes: a simple `{ error: "..." }`/`{ message }`,
 * OR — for field validation — a numeric-keyed object of `{ path, type, message }`
 * entries, e.g. `{ "0": { path: "/title/0", message: "& can only be used once" } }`
 * (confirmed live 2026-07-08). The old code only read the simple shape, so a
 * title/tag validation failure surfaced as a useless generic "Etsy request
 * failed (400)." while the real reason sat unread in the log detail.
 */
export function extractEtsyMessage(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  const fieldErrors = Object.values(body)
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).message === 'string')
    .map((v) => {
      const rawPath = typeof v.path === 'string' ? v.path : null;
      const field = rawPath ? rawPath.replace(/^\//, '').replace(/\/\d+$/, '') : null; // "/title/0" -> "title"
      return field ? `${field}: ${v.message as string}` : (v.message as string);
    });
  return fieldErrors.length ? fieldErrors.join('; ') : null;
}

function mapErrorResponse(status: number, body: Record<string, unknown> | null): EtsyApiError {
  const etsyMessage = extractEtsyMessage(body);
  const detail = body ? redactDetail(body) : null;

  if (status === 401) {
    return new EtsyApiError({ status, code: 'auth_expired', operatorMessage: 'Etsy connection expired — click Reconnect Etsy.', retryable: false, detail });
  }
  if (status === 429) {
    return new EtsyApiError({ status, code: 'rate_limited', operatorMessage: 'Etsy rate limit reached — will retry shortly.', retryable: true, detail });
  }
  if (status >= 500) {
    return new EtsyApiError({ status, code: 'etsy_server_error', operatorMessage: 'Etsy had a temporary problem — will retry.', retryable: true, detail });
  }
  if (status === 400 && /price/i.test(etsyMessage ?? '')) {
    return new EtsyApiError({ status, code: 'etsy_price_min', operatorMessage: 'Etsy rejected the price (must be at least $0.20). Fix the price and retry.', retryable: false, detail });
  }
  if (status === 403) {
    return new EtsyApiError({ status, code: 'etsy_forbidden', operatorMessage: 'Etsy rejected this action (policy or missing scope). See details and retry after fixing.', retryable: false, detail });
  }
  if (status === 404) {
    return new EtsyApiError({ status, code: 'etsy_not_found', operatorMessage: 'Etsy could not find the referenced listing/resource.', retryable: false, detail });
  }
  if (status === 409) {
    return new EtsyApiError({ status, code: 'etsy_conflict', operatorMessage: 'Etsy reports a conflicting state for this listing.', retryable: false, detail });
  }
  return new EtsyApiError({
    status,
    code: 'etsy_error',
    operatorMessage: etsyMessage ? `Etsy rejected the request: ${etsyMessage}` : `Etsy request failed (${status}).`,
    retryable: false,
    detail,
  });
}

/**
 * A request that hit its time limit (see lib/marketplace-timeout.ts). Not
 * retryable: the scheduled sweeps re-read on their next run. The wording must
 * not match isConnectionLevelEtsyError (reconnect / refresh token / shop id),
 * or one slow call would abort a whole bulk run as a connection failure.
 */
function etsyTimeoutError(method: string, path: string, timeoutMs: number): EtsyApiError {
  return new EtsyApiError({
    status: 0,
    code: 'etsy_timeout',
    operatorMessage: `Etsy did not respond within ${timeoutLabel(timeoutMs)}. Try again in a minute.`,
    retryable: false,
    detail: { method, path: path.replace(/\?.*$/, '') },
  });
}

/** `fetch` with a time limit that surfaces as a typed etsy_timeout error. Used by every Etsy call. */
export async function fetchWithEtsyTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  label: { method: string; path: string },
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (isFetchTimeoutError(err)) throw etsyTimeoutError(label.method, label.path, timeoutMs);
    throw err;
  }
}

/** Strip anything that could resemble a token/secret before it lands in a log row. */
function redactDetail(body: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (/token|secret|authorization/i.test(key)) continue;
    clone[key] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  return clone;
}

/** Redact headers before logging (never persist Authorization/token material). */
export function redactHeadersForLog(headers: Headers): Record<string, string> {
  const allow = ['x-limit-per-second', 'x-remaining-this-second', 'x-limit-per-day', 'x-remaining-this-day', 'content-type'];
  const out: Record<string, string> = {};
  for (const name of allow) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

// Token-bucket-ish throttle: a minimum gap between requests, well under Etsy's
// 5 QPS. Netlify functions are short-lived, so this mainly guards accidental
// parallelism within a single invocation (the sync engine also processes one
// product / one image at a time by design).
const MIN_INTERVAL_MS = 260; // ~3.8 req/s, headroom below the 5 QPS cap
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EtsyRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // e.g. /v3/application/shops/123/listings
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body. Mutually exclusive with `form`/`formUrlEncoded`. */
  json?: unknown;
  /** multipart/form-data body (image upload). Mutually exclusive with `json`/`formUrlEncoded`. */
  form?: FormData;
  /**
   * application/x-www-form-urlencoded body. A few endpoints (e.g.
   * updateListingProperty) declare ONLY this content type in their request
   * schema — sending JSON there is a shape mismatch, not just a style choice.
   * Mutually exclusive with `json`/`form`.
   */
  formUrlEncoded?: URLSearchParams;
  /** Bearer access token. Omit only for the public OAuth token endpoint / taxonomy reads. */
  accessToken?: string | null;
  /** Max in-invocation retries for 429/5xx (default 3, per 10-rate-limits-and-quotas.md). */
  maxRetries?: number;
  /** Per-attempt time limit; default MARKETPLACE_TIMEOUT_MS.upload for multipart, .api otherwise. */
  timeoutMs?: number;
}

export interface EtsyResponse<T> {
  data: T;
  headers: Headers;
}

function buildUrl(path: string, query?: EtsyRequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${ETSY_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Core request function. Throws EtsyApiError on any non-2xx response (after
 * retrying transient 429/5xx up to `maxRetries` times with backoff+jitter).
 */
export async function etsyFetch<T = unknown>(opts: EtsyRequestOptions): Promise<EtsyResponse<T>> {
  const apiKeyHeader = requireEtsyApiKeyHeader();
  const url = buildUrl(opts.path, opts.query);
  const method = opts.method ?? 'GET';
  const maxRetries = opts.maxRetries ?? 3;
  const timeoutMs = opts.timeoutMs ?? (opts.form ? MARKETPLACE_TIMEOUT_MS.upload : MARKETPLACE_TIMEOUT_MS.api);
  // A body read can also outlast the limit; that must surface as a timeout,
  // never as silently-null data.
  const readJson = async <R>(res: Response): Promise<R | null> =>
    (await res.json().catch((err: unknown) => {
      if (isFetchTimeoutError(err)) throw etsyTimeoutError(method, opts.path, timeoutMs);
      return null;
    })) as R | null;

  const headers: Record<string, string> = { 'x-api-key': apiKeyHeader };
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form; // fetch sets the multipart boundary Content-Type itself
  } else if (opts.formUrlEncoded) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = opts.formUrlEncoded.toString();
  }

  let attempt = 0;
  for (;;) {
    await throttle();
    // Fresh limit per attempt, so a retried 429/5xx gets its own window.
    const res = await fetchWithEtsyTimeout(url, { method, headers, body, cache: 'no-store' }, timeoutMs, { method, path: opts.path });

    if (res.ok) {
      const data = res.status === 204 ? (null as T) : ((await readJson<T>(res)) as T);
      return { data, headers: res.headers };
    }

    const parsedBody = await readJson<Record<string, unknown>>(res);
    const error = mapErrorResponse(res.status, parsedBody);

    if (error.retryable && attempt < maxRetries) {
      const backoffMs = 2 ** attempt * 1000; // 1s -> 2s -> 4s
      const jitter = Math.random() * 250;
      await sleep(backoffMs + jitter);
      attempt += 1;
      continue;
    }
    throw error;
  }
}

/**
 * The non-personal part of an Etsy receipt — the ONLY fields that leave
 * getShopReceipts(). Buyer name, address and email are dropped here.
 */
export function trimEtsyReceipt(receipt: EtsyReceipt): EtsyReceipt {
  return {
    receipt_id: receipt.receipt_id,
    status: receipt.status ?? null,
    is_paid: receipt.is_paid,
    created_timestamp: receipt.created_timestamp,
    create_timestamp: receipt.create_timestamp,
    transactions: (receipt.transactions ?? []).map((t) => ({
      transaction_id: t.transaction_id,
      listing_id: t.listing_id ?? null,
      sku: t.sku ?? null,
      title: t.title ?? null,
      quantity: t.quantity,
      price: t.price ? { amount: t.price.amount, divisor: t.price.divisor, currency_code: t.price.currency_code } : null,
    })),
  };
}

/**
 * Paid shop receipts created at or after `minCreated` (getShopReceipts;
 * requires the `transactions_r` scope). Pages through Etsy's 100-per-call
 * cap oldest-first. Shape is trimmed to what lib/marketplace-sales.ts reads.
 */
export async function getShopReceipts(params: {
  shopId: number;
  accessToken: string;
  minCreated: Date;
  maxPages?: number;
  /** Also return unpaid receipts (the fill-in of past sales reads cancellations too). Default: paid only. */
  includeUnpaid?: boolean;
}): Promise<EtsyReceipt[]> {
  const receipts: EtsyReceipt[] = [];
  const limit = 100;
  const maxPages = params.maxPages ?? 5;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await etsyFetch<{ count: number; results: EtsyReceipt[] }>({
      path: `/v3/application/shops/${params.shopId}/receipts`,
      accessToken: params.accessToken,
      query: {
        min_created: Math.floor(params.minCreated.getTime() / 1000),
        ...(params.includeUnpaid ? {} : { was_paid: true }),
        limit,
        offset: page * limit,
        sort_on: 'created',
        sort_order: 'asc',
      },
    });
    const batch = res.data?.results ?? [];
    // Etsy receipts carry the buyer's name, address and email. Keep only the
    // non-personal fields the sales sweep reads (2026-11-16, same rule as eBay).
    receipts.push(...batch.map(trimEtsyReceipt));
    if (batch.length < limit) break;
  }
  return receipts;
}

/** Convenience for uploadListingImage-style multipart POSTs. */
export async function etsyUpload<T = unknown>(
  path: string,
  form: FormData,
  accessToken: string,
): Promise<EtsyResponse<T>> {
  return etsyFetch<T>({ method: 'POST', path, form, accessToken });
}

interface EtsyTaxonomyNode {
  id: number;
  level: number;
  name: string;
  parent_id: number | null;
  children: EtsyTaxonomyNode[];
}

export interface TaxonomyLeaf {
  id: number;
  path: string;
}

/**
 * Full seller taxonomy tree, flattened to leaf nodes only (only leaves are
 * valid `taxonomy_id`s for a listing). Powers the admin category-override
 * picker (etsy-sync-plan doesn't have a great generic leaf for every product
 * type — see next-app/src/lib/etsy/mapping.ts's ETSY_TAXONOMY_MAP comments —
 * so the admin can pick the exact category per product instead). No OAuth
 * needed, just the api_key header, so this works even before the shop is
 * connected. Etsy's taxonomy essentially never changes, so this uses Next's
 * fetch cache (a day) instead of etsyFetch's no-store/throttled path.
 */
export async function fetchTaxonomyLeaves(): Promise<TaxonomyLeaf[]> {
  const res = await fetchWithEtsyTimeout(`${ETSY_API_BASE}/v3/application/seller-taxonomy/nodes`, {
    headers: { 'x-api-key': requireEtsyApiKeyHeader() },
    next: { revalidate: 86400 },
  }, MARKETPLACE_TIMEOUT_MS.api, { method: 'GET', path: '/v3/application/seller-taxonomy/nodes' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw mapErrorResponse(res.status, body);
  }
  const data = (await res.json()) as { results: EtsyTaxonomyNode[] };

  const leaves: TaxonomyLeaf[] = [];
  const walk = (nodes: EtsyTaxonomyNode[], parentPath: string | null) => {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath} > ${node.name}` : node.name;
      if (!node.children || node.children.length === 0) {
        leaves.push({ id: node.id, path });
      } else {
        walk(node.children, path);
      }
    }
  };
  walk(data.results, null);
  return leaves.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Pushes one structured listing property (Material, Gold purity, etc — the
 * same fields Etsy's own editor shows as "Suggested" chips). Confirmed live
 * 2026-07-08 against the spec's requestBody schema: this operation ONLY
 * declares application/x-www-form-urlencoded (no JSON alternative), and
 * both `value_ids` and `values` are required together — see
 * next-app/src/lib/etsy/mapping.ts's mapProperties() for what gets sent.
 * NEVER pass a guessed/derived value_id here for a scale-based property with
 * no enumerated possible_values (e.g. a length/measurement) — confirmed live
 * 2026-07-08 that Etsy accepts a wrong numeric guess with HTTP 200 and
 * silently resolves it against its own shared global value vocabulary
 * instead of rejecting it (see DECISIONS.md session 5's "Gray" incident, and
 * length-experiment.ts for the safe, dynamically-verified replacement).
 */
export async function updateListingProperty(params: {
  shopId: number;
  listingId: number;
  accessToken: string;
  propertyId: number;
  /**
   * `''` is a deliberate, narrow escape hatch (session 8) — a placeholder
   * for "no real value_id exists," never a guessed number. Confirmed live
   * that a truly empty array (zero value_ids on the wire) is rejected
   * ("Missing input parameter: [value_ids]"); `''` produces one value_ids
   * key with an empty value instead, a genuinely different request.
   */
  valueIds: (number | '')[];
  values: string[];
  scaleId?: number;
}): Promise<void> {
  const body = new URLSearchParams();
  for (const id of params.valueIds) body.append('value_ids', String(id));
  for (const value of params.values) body.append('values', value);
  if (params.scaleId != null) body.set('scale_id', String(params.scaleId));

  await etsyFetch({
    method: 'PUT',
    path: `/v3/application/shops/${params.shopId}/listings/${params.listingId}/properties/${params.propertyId}`,
    accessToken: params.accessToken,
    formUrlEncoded: body,
  });
}

export interface EtsyTaxonomyPropertyScale {
  scaleId: number;
  displayName: string;
}

export interface EtsyTaxonomyPropertyValue {
  valueId: number;
  name: string;
  /** Which scale (e.g. US/CA vs UK/AU for Ring size) this value belongs to — null for properties whose values aren't scale-scoped (e.g. Materials). */
  scaleId: number | null;
}

export interface EtsyTaxonomyProperty {
  propertyId: number;
  name: string;
  displayName: string;
  scales: EtsyTaxonomyPropertyScale[];
  /** Settable via updateListingProperty on a plain listing. */
  supportsAttributes: boolean;
  /** Settable as a per-SKU inventory variation (updateListingInventory) — irrelevant unless the property is a true buyer-selectable variation. */
  supportsVariations: boolean;
  possibleValues: EtsyTaxonomyPropertyValue[];
}

/**
 * Live property/value schema for a taxonomy node — property ids, scale ids,
 * and possible-value ids are NEVER hardcoded anywhere in this codebase;
 * they're always resolved fresh from this call for the listing's actual
 * taxonomy_id. See length-experiment.ts and DECISIONS.md (session 5's
 * "Gray" incident, session 7's rebuild) for why this matters.
 */
export async function fetchTaxonomyProperties(taxonomyId: number): Promise<EtsyTaxonomyProperty[]> {
  const res = await fetchWithEtsyTimeout(`${ETSY_API_BASE}/v3/application/seller-taxonomy/nodes/${taxonomyId}/properties`, {
    headers: { 'x-api-key': requireEtsyApiKeyHeader() },
    next: { revalidate: 86400 },
  }, MARKETPLACE_TIMEOUT_MS.api, { method: 'GET', path: '/v3/application/seller-taxonomy/nodes/{id}/properties' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw mapErrorResponse(res.status, body);
  }
  const data = (await res.json()) as {
    results: {
      property_id: number;
      name: string;
      display_name: string;
      scales?: { scale_id: number; display_name: string }[];
      supports_attributes: boolean;
      supports_variations: boolean;
      possible_values?: { value_id: number; name: string; scale_id?: number | null }[];
    }[];
  };
  return (data.results ?? []).map((property) => ({
    propertyId: property.property_id,
    name: property.name,
    displayName: property.display_name,
    scales: (property.scales ?? []).map((scale) => ({ scaleId: scale.scale_id, displayName: scale.display_name })),
    supportsAttributes: property.supports_attributes,
    supportsVariations: property.supports_variations,
    possibleValues: (property.possible_values ?? []).map((value) => ({ valueId: value.value_id, name: value.name, scaleId: value.scale_id ?? null })),
  }));
}

export interface EtsyListingPropertyValue {
  propertyId: number;
  propertyName: string | null;
  scaleId: number | null;
  scaleName: string | null;
  valueIds: number[];
  values: string[];
}

/**
 * Reads back ALL of a listing's properties. Never trust updateListingProperty's
 * HTTP success alone — the "Gray" incident (DECISIONS.md session 5) returned
 * 200 while silently storing the wrong value; this is how a write is
 * actually verified (length-experiment.ts).
 *
 * Deliberately the LIST endpoint (getListingProperties, "General Release —
 * ready for production use" per the spec), not the single-property GET
 * (getListingProperty). Confirmed live 2026-07-08 (session 8): that singular
 * endpoint's own spec description says "Development for this endpoint is in
 * progress. It will only return a 501 response" — it is NOT production-ready
 * despite being present in the spec, and produced a 404 in practice.
 * Discovered only after a real experiment run hit it; see DECISIONS.md.
 */
export async function getListingProperties(params: { shopId: number; listingId: number; accessToken: string }): Promise<EtsyListingPropertyValue[]> {
  const res = await etsyFetch<{
    count: number;
    results: {
      property_id: number;
      property_name: string | null;
      scale_id: number | null;
      scale_name: string | null;
      value_ids?: number[];
      values?: string[];
    }[];
  }>({
    path: `/v3/application/shops/${params.shopId}/listings/${params.listingId}/properties`,
    accessToken: params.accessToken,
  });
  return (res.data.results ?? []).map((property) => ({
    propertyId: property.property_id,
    propertyName: property.property_name,
    scaleId: property.scale_id,
    scaleName: property.scale_name,
    valueIds: property.value_ids ?? [],
    values: property.values ?? [],
  }));
}
