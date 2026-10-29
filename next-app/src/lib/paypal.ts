// Server-side PayPal REST helper (Orders API v2). No SDK dependency — uses fetch
// against the PayPal REST endpoints. Never import this from client code: it reads
// PAYPAL_CLIENT_SECRET. The `server-only` import turns any client import into a
// build error rather than a silent secret leak.
import 'server-only';
import { createHash } from 'node:crypto';

const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE = 'https://api-m.paypal.com';

export function isPayPalSandbox(): boolean {
  return (process.env.PAYPAL_ENV ?? 'sandbox').toLowerCase() !== 'live';
}

export function paypalApiBase(): string {
  return isPayPalSandbox() ? SANDBOX_BASE : LIVE_BASE;
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured.');
  }

  // Reuse a still-valid token (PayPal tokens last ~9h); refresh 60s early.
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PayPal auth failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type PayPalLineItem = {
  name: string;
  quantity: string;
  unitAmount: number;
  sku?: string;
};

export type PayPalShippingAddress = {
  fullName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

export type CreatePayPalOrderInput = {
  currency: string;
  subtotal: number;
  tax: number;
  shipping: number;
  /** Discount code amount off merchandise. Omit or 0 when none applies. */
  discount?: number;
  total: number;
  items: PayPalLineItem[];
  /** Our internal order reference, echoed back on the PayPal order. */
  referenceId: string;
  /** Validated merchant-provided address. Omit for local pickup. */
  shippingAddress?: PayPalShippingAddress | null;
  invoiceId?: string;
  brandName?: string;
  /**
   * CAPTURE (default) = the checkout: money taken when the buyer approves.
   * AUTHORIZE = a site offer (lib/offers.ts): the buyer's approval only HOLDS
   * the amount; `capturePayPalAuthorization` charges it when the owner accepts
   * and `voidPayPalAuthorization` releases it otherwise.
   */
  intent?: 'CAPTURE' | 'AUTHORIZE';
  /**
   * Only for a retry after a declined payment (2026-10-28): the PayPal order
   * being replaced. Mixed into the PayPal-Request-Id (never the request body) so
   * the retry gets a NEW PayPal order — the same id would hand back the declined
   * order, whose capture key `capture-<id>` can return the cached decline.
   */
  requestIdSalt?: string | null;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number) {
  return round2(value).toFixed(2);
}

export type PayPalOrderResult = {
  id: string;
  status: string;
};

export function payPalCreateRequestId(input: CreatePayPalOrderInput): string {
  const request = buildPayPalOrderRequest(input);
  const hash = createHash('sha256').update(JSON.stringify(request));
  // Unsalted ids stay byte-for-byte what they always were.
  if (input.requestIdSalt) hash.update(`|retry:${input.requestIdSalt}`);
  const digest = hash.digest('hex').slice(0, 31);
  return `create-${digest}`;
}

export function buildPayPalOrderRequest(input: CreatePayPalOrderInput): Record<string, unknown> {
  const currency = input.currency;

  // PayPal requires item_total + tax_total + shipping - discount to equal
  // amount.value, and the sum of (unit_amount * quantity) to equal item_total —
  // all as 2-decimal values. We round every component to cents first and derive
  // value FROM those rounded parts, so the breakdown always reconciles exactly
  // (independent rounding of an unrounded total is what triggers PayPal's 422).
  const lineItems = input.items.map((item) => ({
    name: item.name.slice(0, 127),
    quantity: Math.max(1, Math.round(Number(item.quantity || '1'))),
    unit: round2(item.unitAmount),
    sku: item.sku,
  }));
  const itemTotal = round2(lineItems.reduce((sum, item) => sum + item.unit * item.quantity, 0));
  const taxTotal = round2(input.tax);
  const shippingTotal = round2(input.shipping);
  // Clamp to the item total: PayPal rejects a discount larger than item_total,
  // and a negative one outright.
  const discountTotal = Math.min(Math.max(round2(input.discount ?? 0), 0), itemTotal);
  const value = round2(itemTotal + taxTotal + shippingTotal - discountTotal);

  const breakdown: Record<string, unknown> = {
    item_total: { currency_code: currency, value: money(itemTotal) },
    tax_total: { currency_code: currency, value: money(taxTotal) },
    shipping: { currency_code: currency, value: money(shippingTotal) },
  };
  // Only send the key when there is a discount. An always-present "0.00"
  // changes the request hash used for payPalCreateRequestId, which would
  // invalidate the idempotency key of every existing undiscounted order.
  if (discountTotal > 0) {
    breakdown.discount = { currency_code: currency, value: money(discountTotal) };
  }

  const amount: Record<string, unknown> = {
    currency_code: currency,
    value: money(value),
    breakdown,
  };
  const purchaseUnit: Record<string, unknown> = {
    reference_id: input.referenceId,
    custom_id: input.referenceId,
    amount,
    items: lineItems.map((item) => ({
      name: item.name,
      quantity: String(item.quantity),
      unit_amount: { currency_code: currency, value: money(item.unit) },
      ...(item.sku ? { sku: item.sku.slice(0, 127) } : {}),
    })),
  };
  if (input.invoiceId) purchaseUnit.invoice_id = input.invoiceId;

  if (input.shippingAddress) {
    const shipping = input.shippingAddress;
    purchaseUnit.shipping = {
      name: { full_name: shipping.fullName.slice(0, 300) },
      address: {
        address_line_1: shipping.addressLine1.slice(0, 300),
        ...(shipping.addressLine2 ? { address_line_2: shipping.addressLine2.slice(0, 300) } : {}),
        admin_area_2: shipping.city.slice(0, 120),
        admin_area_1: shipping.state.slice(0, 300),
        postal_code: shipping.postalCode.slice(0, 60),
        country_code: shipping.countryCode,
      },
    };
  }

  return {
    // An unchanged 'CAPTURE' keeps every existing checkout request — and so its
    // payPalCreateRequestId idempotency key — byte-for-byte the same.
    intent: input.intent ?? 'CAPTURE',
    purchase_units: [purchaseUnit],
    application_context: {
      brand_name: input.brandName ?? 'Naples Estate Jewelry',
      shipping_preference: input.shippingAddress ? 'SET_PROVIDED_ADDRESS' : 'NO_SHIPPING',
      user_action: 'PAY_NOW',
    },
  };
}

export async function createPayPalOrder(input: CreatePayPalOrderInput): Promise<PayPalOrderResult> {
  const token = await getAccessToken();
  const request = buildPayPalOrderRequest(input);

  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // A retry with the same order details returns the same PayPal order. This
      // prevents an ambiguous local failure from creating a second payable order.
      'PayPal-Request-Id': payPalCreateRequestId(input),
    },
    cache: 'no-store',
    body: JSON.stringify(request),
  });

  const data = (await res.json().catch(() => null)) as
    | { id?: string; status?: string; message?: string; details?: unknown }
    | null;

  if (!res.ok || !data?.id) {
    const detail = data?.details ? ` ${JSON.stringify(data.details)}` : '';
    throw new Error(`PayPal create order failed (${res.status}): ${data?.message ?? 'unknown error'}${detail}`);
  }

  return { id: data.id, status: data.status ?? 'CREATED' };
}

export type PayPalRefundResult = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  raw: unknown;
};

export async function refundPayPalCapture(input: {
  captureId: string;
  amount: number;
  currency?: string;
  requestId: string;
}): Promise<PayPalRefundResult> {
  const token = await getAccessToken();
  const currency = input.currency ?? 'USD';
  const res = await fetch(
    `${paypalApiBase()}/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': input.requestId.slice(0, 38),
      },
      cache: 'no-store',
      body: JSON.stringify({
        amount: {
          value: money(input.amount),
          currency_code: currency,
        },
      }),
    },
  );

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data?.id) {
    const message = typeof data?.message === 'string' ? data.message : `status ${res.status}`;
    const err = new Error(`PayPal refund failed: ${message}`) as Error & {
      paypalStatus?: number;
      raw?: unknown;
    };
    err.paypalStatus = res.status;
    err.raw = data;
    throw err;
  }

  const amount = data.amount as { value?: string; currency_code?: string } | undefined;
  return {
    id: String(data.id),
    status: String(data.status ?? 'UNKNOWN'),
    amount: Number(amount?.value ?? input.amount),
    currency: String(amount?.currency_code ?? currency),
    raw: data,
  };
}

export type PayPalCaptureResult = {
  status: string;
  captureId: string | null;
  capturedAmount: number | null;
  capturedCurrency: string | null;
  raw: unknown;
};

export function parsePayPalCaptureResponse(raw: unknown): PayPalCaptureResult {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const purchaseUnits = (data.purchase_units as Array<Record<string, unknown>> | undefined) ?? [];
  const payments = (purchaseUnits[0]?.payments as Record<string, unknown> | undefined) ?? {};
  const captures = (payments.captures as Array<Record<string, unknown>> | undefined) ?? [];
  const capture = captures[0];
  const captureAmount = capture?.amount as { value?: string; currency_code?: string } | undefined;

  return {
    status: String(capture?.status ?? data.status ?? 'UNKNOWN'),
    captureId: capture?.id ? String(capture.id) : null,
    capturedAmount: captureAmount?.value != null ? Number(captureAmount.value) : null,
    capturedCurrency: captureAmount?.currency_code ?? null,
    raw,
  };
}

/**
 * PayPal error issue codes that mean the buyer's card / PayPal funding was
 * refused — nothing was charged and the buyer can simply pay another way.
 * INSTRUMENT_DECLINED = the card processor or bank declined it;
 * TRANSACTION_REFUSED = PayPal itself refused it.
 */
export const PAYPAL_DECLINE_ISSUES = ['INSTRUMENT_DECLINED', 'TRANSACTION_REFUSED'] as const;

/** The `details[].issue` codes and `debug_id` of a PayPal API error body (the thrown `err.raw`). */
export function paypalErrorInfo(raw: unknown): { issues: string[]; debugId: string | null } {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const details = Array.isArray(data.details) ? data.details as Array<Record<string, unknown>> : [];
  return {
    issues: details.map((d) => (typeof d?.issue === 'string' ? d.issue : '')).filter(Boolean),
    debugId: typeof data.debug_id === 'string' ? data.debug_id : null,
  };
}

/**
 * Was this capture a decline (no money moved)? True when PayPal's error names a
 * decline issue, or the order's capture record itself reads DECLINED / FAILED.
 * A PENDING or unreadable capture is NOT a decline — that stays "status unknown".
 */
export function isPayPalCaptureDecline(issues: string[], captureStatus: string | null | undefined): boolean {
  if (issues.some((issue) => (PAYPAL_DECLINE_ISSUES as readonly string[]).includes(issue))) return true;
  return captureStatus === 'DECLINED' || captureStatus === 'FAILED';
}

/** The raw PayPal order (GET /v2/checkout/orders/:id). */
export async function getPayPalOrder(paypalOrderId: string): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) {
    throw new Error(`PayPal order lookup failed (${res.status}).`);
  }
  return data;
}

export async function getPayPalOrderCapture(paypalOrderId: string): Promise<PayPalCaptureResult> {
  return parsePayPalCaptureResponse(await getPayPalOrder(paypalOrderId));
}

/**
 * Did the card's bank security check (3-D Secure) run and FAIL on this order?
 * Read from a card-form or Google Pay order before capture (2026-10-28).
 * PayPal's guidance: enrolled card (`enrollment_status` Y) whose authentication
 * came back N (failed), R (rejected), U (unavailable) or C (challenge not
 * completed) — do not capture. No 3-D Secure result at all (the check was not
 * required, the usual case for a US card) or Y / A = carry on.
 */
export function paypalThreeDSecureFailed(rawOrder: unknown): boolean {
  const data = rawOrder && typeof rawOrder === 'object' ? rawOrder as Record<string, unknown> : {};
  const source = (data.payment_source ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const card = source.card ?? (source.google_pay?.card as Record<string, unknown> | undefined);
  const result = card?.authentication_result as Record<string, unknown> | undefined;
  const threeDS = result?.three_d_secure as Record<string, unknown> | undefined;
  if (!threeDS) return false;
  const enrollment = String(threeDS.enrollment_status ?? '');
  const authentication = String(threeDS.authentication_status ?? '');
  if (enrollment !== 'Y') return false;
  return ['N', 'R', 'U', 'C'].includes(authentication);
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<PayPalCaptureResult> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Idempotency: a retried capture for the same PayPal order returns the
      // original result instead of erroring or double-charging.
      'PayPal-Request-Id': `capture-${paypalOrderId}`,
    },
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok || !data) {
    const message = (data?.message as string) ?? `status ${res.status}`;
    const err = new Error(`PayPal capture failed: ${message}`) as Error & { paypalStatus?: number; raw?: unknown };
    err.paypalStatus = res.status;
    err.raw = data;
    throw err;
  }

  return parsePayPalCaptureResponse(data);
}

// ---------------------------------------------------------------------------
// Authorize → capture / void (site offers, lib/offers.ts). PayPal guarantees an
// authorization's funds for a 3-day honor period; the offer window is 72 hours
// so an accepted offer is always charged inside it.
// ---------------------------------------------------------------------------

export type PayPalAuthorizationResult = {
  status: string;
  authorizationId: string | null;
  amount: number | null;
  currency: string | null;
  createTime: string | null;
  raw: unknown;
};

export function parsePayPalAuthorizeResponse(raw: unknown): PayPalAuthorizationResult {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const purchaseUnits = (data.purchase_units as Array<Record<string, unknown>> | undefined) ?? [];
  const payments = (purchaseUnits[0]?.payments as Record<string, unknown> | undefined) ?? {};
  const authorizations = (payments.authorizations as Array<Record<string, unknown>> | undefined) ?? [];
  const authorization = authorizations[0];
  const amount = authorization?.amount as { value?: string; currency_code?: string } | undefined;
  return {
    status: String(authorization?.status ?? data.status ?? 'UNKNOWN'),
    authorizationId: authorization?.id ? String(authorization.id) : null,
    amount: amount?.value != null ? Number(amount.value) : null,
    currency: amount?.currency_code ?? null,
    createTime: typeof authorization?.create_time === 'string' ? authorization.create_time : null,
    raw,
  };
}

function payPalError(prefix: string, status: number, data: Record<string, unknown> | null) {
  const details = Array.isArray(data?.details) ? data.details as Array<{ issue?: string }> : [];
  const issue = details[0]?.issue ?? (typeof data?.name === 'string' ? data.name : '');
  const message = typeof data?.message === 'string' ? data.message : `status ${status}`;
  return Object.assign(new Error(`${prefix}: ${message}${issue ? ` (${issue})` : ''}`), {
    paypalStatus: status,
    paypalIssue: issue,
    raw: data,
  });
}

/** Turn an approved AUTHORIZE order into an authorization (the hold). Idempotent. */
export async function authorizePayPalOrder(paypalOrderId: string): Promise<PayPalAuthorizationResult> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/authorize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `authorize-${paypalOrderId}`.slice(0, 108),
    },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) throw payPalError('PayPal authorize failed', res.status, data);
  return parsePayPalAuthorizeResponse(data);
}

/** Read an order's authorization back (recovery after an ambiguous authorize). */
export async function getPayPalOrderAuthorization(paypalOrderId: string): Promise<PayPalAuthorizationResult> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) throw payPalError('PayPal order lookup failed', res.status, data);
  return parsePayPalAuthorizeResponse(data);
}

/** Charge a held authorization in full (the owner accepted the offer). Idempotent. */
export async function capturePayPalAuthorization(authorizationId: string, invoiceId?: string): Promise<PayPalCaptureResult> {
  const token = await getAccessToken();
  const res = await fetch(
    `${paypalApiBase()}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-auth-${authorizationId}`.slice(0, 108),
      },
      cache: 'no-store',
      body: JSON.stringify({ final_capture: true, ...(invoiceId ? { invoice_id: invoiceId.slice(0, 127) } : {}) }),
    },
  );
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) throw payPalError('PayPal capture failed', res.status, data);
  const amount = data.amount as { value?: string; currency_code?: string } | undefined;
  return {
    status: String(data.status ?? 'UNKNOWN'),
    captureId: data.id ? String(data.id) : null,
    capturedAmount: amount?.value != null ? Number(amount.value) : null,
    capturedCurrency: amount?.currency_code ?? null,
    raw: data,
  };
}

export type PayPalVoidResult = { released: true } | { released: false; captured: boolean; error: string };

/**
 * Release a held authorization. An authorization PayPal already voided (or that
 * expired) counts as released; one that was already captured cannot be voided
 * and is reported as such so the caller never thinks a charge was undone.
 */
export async function voidPayPalAuthorization(authorizationId: string): Promise<PayPalVoidResult> {
  const token = await getAccessToken();
  const res = await fetch(
    `${paypalApiBase()}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `void-${authorizationId}`.slice(0, 108),
      },
      cache: 'no-store',
    },
  );
  if (res.ok) return { released: true };
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const error = payPalError('PayPal void failed', res.status, data);
  const issue = String(error.paypalIssue ?? '').toUpperCase();
  if (/VOIDED|EXPIRED/.test(issue)) return { released: true };
  return { released: false, captured: /CAPTURED/.test(issue), error: error.message };
}

/**
 * Verify a PayPal webhook signature using the verify-webhook-signature API.
 * Returns true only when PayPal reports SUCCESS. If PAYPAL_WEBHOOK_ID is unset
 * we cannot verify, so we reject (fail closed).
 */
export async function verifyPayPalWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const transmissionSig = headers.get('paypal-transmission-sig');
  const certUrl = headers.get('paypal-cert-url');
  const authAlgo = headers.get('paypal-auth-algo');
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return false;
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return false;
  }

  const res = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      transmission_sig: transmissionSig,
      cert_url: certUrl,
      auth_algo: authAlgo,
      webhook_id: webhookId,
      // webhook_event must be the parsed JSON object, not the raw string.
      webhook_event: JSON.parse(rawBody || '{}'),
    }),
  });

  if (!res.ok) return false;
  const data = (await res.json().catch(() => null)) as { verification_status?: string } | null;
  return data?.verification_status === 'SUCCESS';
}
