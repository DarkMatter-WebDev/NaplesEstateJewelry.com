import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('refundPayPalCapture', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PAYPAL_CLIENT_ID = 'client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'client-secret';
    process.env.PAYPAL_ENV = 'sandbox';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a cent-formatted partial refund with the stable request id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'REFUND-123',
        status: 'COMPLETED',
        amount: { value: '45.25', currency_code: 'USD' },
      }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { refundPayPalCapture } = await import('@/lib/paypal');
    const result = await refundPayPalCapture({
      captureId: 'CAPTURE/123',
      amount: 45.25,
      requestId: 'refund-order123-7025',
    });

    expect(result).toMatchObject({ id: 'REFUND-123', status: 'COMPLETED', amount: 45.25, currency: 'USD' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE%2F123/refund');
    expect((options.headers as Record<string, string>)['PayPal-Request-Id']).toBe('refund-order123-7025');
    expect(JSON.parse(String(options.body))).toEqual({
      amount: { value: '45.25', currency_code: 'USD' },
    });
  });
});
