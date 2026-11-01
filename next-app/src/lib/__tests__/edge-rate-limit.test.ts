import { describe, expect, it, vi } from 'vitest';
import apiRateLimit, { config } from '../../../netlify/edge-functions/api-rate-limit';

describe('Netlify API edge rate limit', () => {
  it('limits API traffic per IP and domain before continuing', async () => {
    expect(config).toEqual({
      path: '/api/*',
      rateLimit: {
        windowLimit: 180,
        windowSize: 60,
        aggregateBy: ['ip', 'domain'],
      },
    });

    const nextResponse = new Response('ok');
    const next = vi.fn().mockResolvedValue(nextResponse);
    const response = await apiRateLimit(new Request('https://example.com/api/test'), { next });

    expect(next).toHaveBeenCalledOnce();
    expect(response).toBe(nextResponse);
  });
});
