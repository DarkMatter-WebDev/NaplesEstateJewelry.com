import { describe, expect, it } from 'vitest';
import blockedProbes, {
  config,
} from '../../../netlify/edge-functions/blocked-probes';

describe('blocked probe edge response', () => {
  it('covers the retired and sensitive probe paths', () => {
    expect(config.path).toEqual(expect.arrayContaining([
      '/wp-admin',
      '/wp-admin/*',
      '/wp-login.php',
      '/xmlrpc.php',
      '/.env',
      '/.env*',
      '/config.json',
      '/.git',
      '/.git/*',
    ]));
  });

  it('returns a cacheable, non-indexable 410 response', async () => {
    const response = blockedProbes();

    expect(response.status).toBe(410);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, noarchive');
    await expect(response.text()).resolves.toBe('Gone\n');
  });
});
