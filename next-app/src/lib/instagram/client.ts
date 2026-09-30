import 'server-only';

/**
 * Thin fetch wrapper for the Instagram Graph API ("Instagram API with Instagram
 * Login" variant — graph.instagram.com, Instagram User access tokens, no
 * Facebook Page involved).
 *
 * Deliberately does NOT import from lib/etsy or lib/ebay: each marketplace
 * integration owns its own client so a change to one can never destabilise
 * another. The shape is copied, the code is not shared.
 */

const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com';
export const INSTAGRAM_GRAPH_VERSION = 'v23.0';

/** Meta caps carousels at 10 children. */
export const INSTAGRAM_MAX_CAROUSEL_ITEMS = 10;
/**
 * Product photos per post. Every carousel leads with a generated card, so one
 * of Meta's ten slots is always spoken for.
 */
export const INSTAGRAM_MAX_PHOTO_ITEMS = INSTAGRAM_MAX_CAROUSEL_ITEMS - 1;
/** Meta caps captions at 2,200 characters. */
export const INSTAGRAM_MAX_CAPTION_CHARS = 2200;
/** Meta caps hashtags at 30 per post. */
export const INSTAGRAM_MAX_HASHTAGS = 30;
/** Unpublished containers expire 24h after creation. */
export const INSTAGRAM_CONTAINER_TTL_MS = 24 * 60 * 60 * 1000;

export class InstagramApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly operatorMessage: string;
  readonly retryable: boolean;
  readonly detail: Record<string, unknown> | null;

  constructor(params: {
    status: number;
    code: string;
    operatorMessage: string;
    retryable: boolean;
    detail?: Record<string, unknown> | null;
  }) {
    super(params.operatorMessage);
    this.name = 'InstagramApiError';
    this.status = params.status;
    this.code = params.code;
    this.operatorMessage = params.operatorMessage;
    this.retryable = params.retryable;
    this.detail = params.detail ?? null;
  }
}

/**
 * Meta uses error 100/subcode 33 when published media no longer resolves. The
 * message is intentionally not sufficient on its own because it can also
 * mention permissions; reconciliation must separately verify the account.
 */
export function isInstagramMediaMissingError(err: unknown): boolean {
  if (!(err instanceof InstagramApiError)) return false;
  const metaCode = err.detail?.code;
  const metaSubcode = err.detail?.subcode;
  return (
    metaCode === 100 &&
    (metaSubcode === 33 ||
      /unsupported get request|does not exist|cannot be loaded/i.test(err.operatorMessage))
  );
}

/**
 * Access tokens must never reach a log line or an operator-facing message.
 * Everything that gets logged or surfaced goes through this first.
 */
export function redactInstagramSecrets(value: string): string {
  return value
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/IG[A-Za-z0-9_-]{20,}/g, '[redacted-token]');
}

type MetaErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

/** Meta transient/rate-limit codes worth retrying rather than failing closed. */
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

function isRetryable(status: number, body: MetaErrorBody | null): boolean {
  if (status === 429 || status >= 500) return true;
  const code = body?.error?.code;
  return typeof code === 'number' && RETRYABLE_META_CODES.has(code);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface InstagramFetchParams {
  path: string;
  accessToken: string;
  method?: 'GET' | 'POST' | 'DELETE';
  /** Query string params (GET/DELETE) or form body params (POST). */
  params?: Record<string, string | number | boolean | undefined>;
  /** Total attempts including the first. */
  maxAttempts?: number;
}

/**
 * One Instagram Graph API call with bounded backoff.
 *
 * The access token is always sent in the request body/query rather than a
 * header because Meta's endpoints expect `access_token`; it is stripped from
 * every error surface by redactInstagramSecrets.
 */
export async function instagramFetch<T>(params: InstagramFetchParams): Promise<T> {
  const { path, accessToken, method = 'GET', params: extra = {}, maxAttempts = 3 } = params;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}${normalizedPath}`);

  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue;
    payload[key] = String(value);
  }

  let lastError: InstagramApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res: Response;
    const init: RequestInit = { method, cache: 'no-store' };

    if (method === 'POST') {
      const body = new URLSearchParams({ ...payload, access_token: accessToken });
      init.body = body;
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    } else {
      for (const [key, value] of Object.entries(payload)) url.searchParams.set(key, value);
      url.searchParams.set('access_token', accessToken);
    }

    try {
      res = await fetch(url.toString(), init);
    } catch (err) {
      lastError = new InstagramApiError({
        status: 0,
        code: 'network_error',
        operatorMessage: redactInstagramSecrets(
          err instanceof Error ? err.message : 'Network error calling Instagram.',
        ),
        retryable: true,
      });
      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      throw lastError;
    }

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (res.ok) return (body ?? {}) as T;

    const errorBody = body as MetaErrorBody | null;
    const retryable = isRetryable(res.status, errorBody);
    const metaMessage = errorBody?.error?.message ?? `Instagram returned HTTP ${res.status}.`;

    lastError = new InstagramApiError({
      status: res.status,
      code:
        res.status === 401 || res.status === 403
          ? 'invalid_token'
          : errorBody?.error?.type ?? 'instagram_request_failed',
      operatorMessage: redactInstagramSecrets(metaMessage),
      retryable,
      detail: {
        code: errorBody?.error?.code ?? null,
        subcode: errorBody?.error?.error_subcode ?? null,
        // fbtrace_id is what Meta support asks for when escalating a failure.
        fbtrace_id: errorBody?.error?.fbtrace_id ?? null,
      },
    });

    if (!retryable || attempt >= maxAttempts) throw lastError;
    await sleep(500 * attempt);
  }

  throw lastError ?? new InstagramApiError({
    status: 0,
    code: 'unknown',
    operatorMessage: 'Instagram request failed.',
    retryable: false,
  });
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers
// ---------------------------------------------------------------------------

export interface InstagramProfile {
  id: string;
  username?: string;
  account_type?: string;
  media_count?: number;
}

/** Identify the account a token belongs to (also our token liveness probe). */
export async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  return instagramFetch<InstagramProfile>({
    path: '/me',
    accessToken,
    params: { fields: 'id,username,account_type,media_count' },
  });
}

export interface PublishingLimit {
  quota_usage: number;
  config?: { quota_total?: number; quota_duration?: number };
}

/**
 * Remaining publish quota in the rolling 24h window (Meta allows 100 posts;
 * a carousel counts as one). Checked before bulk/drip runs so we never burn a
 * run against a limit we could have seen coming.
 */
export async function fetchPublishingLimit(
  igUserId: string,
  accessToken: string,
): Promise<{ used: number; total: number }> {
  const res = await instagramFetch<{ data?: PublishingLimit[] }>({
    path: `/${igUserId}/content_publishing_limit`,
    accessToken,
    params: { fields: 'quota_usage,config' },
  });
  const entry = res.data?.[0];
  return {
    used: entry?.quota_usage ?? 0,
    total: entry?.config?.quota_total ?? 100,
  };
}

/** Create one carousel child container (an image that is not posted on its own). */
export async function createCarouselItemContainer(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  altText?: string | null;
}): Promise<string> {
  const res = await instagramFetch<{ id: string }>({
    path: `/${params.igUserId}/media`,
    accessToken: params.accessToken,
    method: 'POST',
    params: {
      image_url: params.imageUrl,
      is_carousel_item: true,
      alt_text: params.altText ?? undefined,
    },
  });
  return res.id;
}

/** Create the parent carousel container that ties the children together. */
export async function createCarouselContainer(params: {
  igUserId: string;
  accessToken: string;
  childrenIds: string[];
  caption: string;
}): Promise<string> {
  const res = await instagramFetch<{ id: string }>({
    path: `/${params.igUserId}/media`,
    accessToken: params.accessToken,
    method: 'POST',
    params: {
      media_type: 'CAROUSEL',
      children: params.childrenIds.join(','),
      caption: params.caption,
    },
  });
  return res.id;
}

/** Create a single-image container (used when a product has exactly one photo). */
export async function createImageContainer(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
  altText?: string | null;
}): Promise<string> {
  const res = await instagramFetch<{ id: string }>({
    path: `/${params.igUserId}/media`,
    accessToken: params.accessToken,
    method: 'POST',
    params: {
      image_url: params.imageUrl,
      caption: params.caption,
      alt_text: params.altText ?? undefined,
    },
  });
  return res.id;
}

/** Publish a prepared container. Returns the permanent media id. */
export async function publishContainer(params: {
  igUserId: string;
  accessToken: string;
  containerId: string;
}): Promise<string> {
  const res = await instagramFetch<{ id: string }>({
    path: `/${params.igUserId}/media_publish`,
    accessToken: params.accessToken,
    method: 'POST',
    params: { creation_id: params.containerId },
  });
  return res.id;
}

export interface InstagramMedia {
  id: string;
  permalink?: string;
  media_type?: string;
  caption?: string;
  timestamp?: string;
}

/** Read back a published post — our proof that publishing actually worked. */
export async function fetchMedia(mediaId: string, accessToken: string): Promise<InstagramMedia> {
  return instagramFetch<InstagramMedia>({
    path: `/${mediaId}`,
    accessToken,
    params: { fields: 'id,permalink,media_type,caption,timestamp' },
  });
}

/** Comment on our own media — used for the "SOLD" marker. */
export async function createComment(params: {
  mediaId: string;
  accessToken: string;
  message: string;
}): Promise<string> {
  const res = await instagramFetch<{ id: string }>({
    path: `/${params.mediaId}/comments`,
    accessToken: params.accessToken,
    method: 'POST',
    params: { message: params.message },
  });
  return res.id;
}

/**
 * Container status. A container must reach FINISHED before it can be published;
 * IN_PROGRESS means Meta is still fetching/processing the image.
 */
export async function fetchContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<{ status_code: string; status?: string }> {
  return instagramFetch<{ status_code: string; status?: string }>({
    path: `/${containerId}`,
    accessToken,
    params: { fields: 'status_code,status' },
  });
}
