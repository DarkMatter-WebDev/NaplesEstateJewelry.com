import { beforeEach, describe, expect, it, vi } from 'vitest';

// /api/paypal/capture-order on a declined card (2026-10-28): PayPal answers the
// capture with 422 INSTRUMENT_DECLINED and the order lookup shows a DECLINED
// capture WITH an id. The route must answer `card_declined` (buyer may try
// another card) — never the "status unknown, do not pay again" lock — and never
// touch the database beyond the order read.

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true), getClientIp: () => '127.0.0.1' }));
vi.mock('@/lib/order-finalize', () => ({ finalizePaidOrder: vi.fn(), notifyItemConflict: vi.fn() }));
vi.mock('@/lib/product-status-hooks', () => ({ scheduleProductStatusHooks: vi.fn() }));

const writes: string[] = [];
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'order-1', order_number: 'NEJ-TEST-1', total: 1302, payment_status: 'unpaid',
              paypal_capture_id: null, payment_response: null, user_id: null,
              customer_name: 'Test', customer_email: 't@example.com',
              subtotal: 1243, tax: 0, shipping_fee: 59, discount: 0,
            },
            error: null,
          }),
        }),
      }),
      update: () => { writes.push(`update:${table}`); throw new Error('no writes expected'); },
    }),
    rpc: (name: string) => { writes.push(`rpc:${name}`); throw new Error('no rpc expected'); },
  }),
}));

const captureMock = vi.fn();
const lookupMock = vi.fn();
const orderMock = vi.fn();
vi.mock('@/lib/paypal', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/paypal')>();
  return {
    ...real,
    paypalConfigured: () => true,
    capturePayPalOrder: (...args: unknown[]) => captureMock(...args),
    getPayPalOrderCapture: (...args: unknown[]) => lookupMock(...args),
    getPayPalOrder: (...args: unknown[]) => orderMock(...args),
  };
});

function declineError() {
  return Object.assign(new Error('PayPal capture failed: failed business validation.'), {
    paypalStatus: 422,
    raw: {
      name: 'UNPROCESSABLE_ENTITY',
      details: [{ issue: 'INSTRUMENT_DECLINED' }],
      debug_id: 'dbg-1',
    },
  });
}

async function post(extra: Record<string, unknown> = {}) {
  const { POST } = await import('@/app/api/paypal/capture-order/route');
  const res = await POST(new Request('http://localhost/api/paypal/capture-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paypalOrderId: 'PP-1', ...extra }),
  }));
  return { status: res.status, body: await res.json() };
}

describe('capture-order on a declined card', () => {
  beforeEach(() => {
    captureMock.mockReset();
    lookupMock.mockReset();
    orderMock.mockReset();
    writes.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('answers card_declined — not the "do not pay again" lock — when the lookup shows a DECLINED capture with an id', async () => {
    captureMock.mockRejectedValue(declineError());
    lookupMock.mockResolvedValue({ status: 'DECLINED', captureId: 'CAP-DECLINED', capturedAmount: null, capturedCurrency: null, raw: {} });
    const { status, body } = await post();
    expect(status).toBe(402);
    expect(body).toMatchObject({ code: 'card_declined', orderId: 'order-1' });
    expect(body.paymentStatusUnknown).toBeUndefined();
    expect(body.paymentCaptured).toBeUndefined();
    expect(writes).toEqual([]);
    // The decline reason is logged on its own readable line.
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .find((call) => call[0] === 'PayPal capture issue:');
    expect(String(logged?.[1])).toContain('INSTRUMENT_DECLINED');
    expect(String(logged?.[1])).toContain('dbg-1');
  });

  it('still answers card_declined when the follow-up lookup itself fails', async () => {
    captureMock.mockRejectedValue(declineError());
    lookupMock.mockRejectedValue(new Error('lookup down'));
    const { status, body } = await post();
    expect(status).toBe(402);
    expect(body.code).toBe('card_declined');
  });

  it('keeps the "status unknown" lock for a PENDING capture that is not a decline', async () => {
    captureMock.mockRejectedValue(Object.assign(new Error('timeout'), { raw: null }));
    lookupMock.mockResolvedValue({ status: 'PENDING', captureId: 'CAP-PENDING', capturedAmount: null, capturedCurrency: null, raw: {} });
    const { status, body } = await post();
    expect(status).toBe(502);
    expect(body.paymentStatusUnknown).toBe(true);
    expect(body.code).toBeUndefined();
  });

  it('answers card_declined when PayPal returns a DECLINED capture without throwing', async () => {
    captureMock.mockResolvedValue({ status: 'DECLINED', captureId: 'CAP-2', capturedAmount: null, capturedCurrency: null, raw: {} });
    const { status, body } = await post();
    expect(status).toBe(402);
    expect(body.code).toBe('card_declined');
  });

  // Card form / Google Pay (2026-10-28): a failed bank security check is a
  // decline — the capture is never even attempted.
  it('refuses to capture a card whose 3-D Secure check failed', async () => {
    orderMock.mockResolvedValue({
      payment_source: { card: { authentication_result: { liability_shift: 'NO', three_d_secure: { enrollment_status: 'Y', authentication_status: 'N' } } } },
    });
    const { status, body } = await post({ paymentMethod: 'card' });
    expect(status).toBe(402);
    expect(body.code).toBe('card_declined');
    expect(captureMock).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('captures as before when no 3-D Secure check ran (the usual US card)', async () => {
    orderMock.mockResolvedValue({ payment_source: { card: { last_digits: '1111' } } });
    captureMock.mockResolvedValue({ status: 'DECLINED', captureId: 'CAP-3', capturedAmount: null, capturedCurrency: null, raw: {} });
    await post({ paymentMethod: 'card' });
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it('a failed 3-D Secure lookup does not block the capture', async () => {
    orderMock.mockRejectedValue(new Error('PayPal order lookup failed (500).'));
    captureMock.mockResolvedValue({ status: 'DECLINED', captureId: 'CAP-4', capturedAmount: null, capturedCurrency: null, raw: {} });
    await post({ paymentMethod: 'google_pay' });
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it('PayPal-button and Apple Pay captures skip the lookup', async () => {
    captureMock.mockResolvedValue({ status: 'DECLINED', captureId: 'CAP-5', capturedAmount: null, capturedCurrency: null, raw: {} });
    await post({ paymentMethod: 'paypal' });
    await post({ paymentMethod: 'apple_pay' });
    await post();
    expect(orderMock).not.toHaveBeenCalled();
  });
});
