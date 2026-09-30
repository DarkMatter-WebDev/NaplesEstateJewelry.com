import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    createServiceClient.mockReset();
  });

  it('allows a request only when the shared counter allows it', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createServiceClient.mockReturnValue({ rpc });

    await expect(checkRateLimit('test:192.0.2.1', 5, 60)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'test:192.0.2.1',
      p_max: 5,
      p_window_seconds: 60,
    });
  });

  it('fails closed when the service client is unavailable', async () => {
    createServiceClient.mockImplementation(() => {
      throw new Error('missing credentials');
    });

    await expect(checkRateLimit('test:192.0.2.1', 5, 60)).resolves.toBe(false);
  });

  it('fails closed when the shared counter returns an error', async () => {
    createServiceClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('database unavailable') }),
    });

    await expect(checkRateLimit('test:192.0.2.1', 5, 60)).resolves.toBe(false);
  });
});

describe('getClientIp', () => {
  it('prefers Netlify client IP metadata over forwarded headers', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-nf-client-connection-ip': '192.0.2.10',
        'x-forwarded-for': '198.51.100.20, 198.51.100.21',
      },
    });

    expect(getClientIp(request)).toBe('192.0.2.10');
  });
});
