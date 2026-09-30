import { describe, expect, it, vi } from 'vitest';
import {
  runSocialPublishBatchInBackground,
  runSocialPublishInBackground,
} from '@/lib/social-background-publish';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('background social publishing', () => {
  it('continues a bounded Instagram processing response until publication is durable', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ state: 'publishing', message: 'Still processing.' }))
      .mockResolvedValueOnce(jsonResponse({ state: 'published', message: 'Published to Instagram.', permalink: 'https://example.com/post' }));
    const progress: string[] = [];

    const result = await runSocialPublishInBackground('instagram', 'item-10', {
      fetcher,
      retryDelayMs: 0,
      onProgress: ({ message }) => progress.push(message),
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith('/api/admin/instagram/sync', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ productId: 'item-10', action: 'publish' }),
    }));
    expect(progress).toContain('Still processing.');
    expect(result).toEqual({ message: 'Published to Instagram.', permalink: 'https://example.com/post' });
  });

  it('does not retry an Instagram provider-quota or other non-processing response', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      state: 'pending',
      message: "Instagram's 24-hour publishing limit is reached.",
    }));

    await expect(runSocialPublishInBackground('instagram', 'item-10', { fetcher, retryDelayMs: 0 }))
      .rejects.toThrow("Instagram's 24-hour publishing limit is reached.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('surfaces channel API failures for the persistent error notification', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: 'Facebook token needs attention.' }, 422));

    await expect(runSocialPublishInBackground('facebook', 'item-10', { fetcher, retryDelayMs: 0 }))
      .rejects.toThrow('Facebook token needs attention.');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('publishes a selected channel batch sequentially in the supplied queue order', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ state: 'published', message: 'Published first.' }))
      .mockResolvedValueOnce(jsonResponse({ state: 'published', message: 'Published second.' }));
    const started: string[] = [];
    const completed: string[] = [];

    const results = await runSocialPublishBatchInBackground([
      { channel: 'facebook', productId: 'item-1' },
      { channel: 'facebook', productId: 'item-2' },
    ], {
      fetcher,
      retryDelayMs: 0,
      onItemStart: (item) => started.push(item.productId),
      onItemComplete: (item) => completed.push(item.productId),
    });

    expect(started).toEqual(['item-1', 'item-2']);
    expect(completed).toEqual(['item-1', 'item-2']);
    expect(results.map((result) => result.message)).toEqual(['Published first.', 'Published second.']);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).productId))
      .toEqual(['item-1', 'item-2']);
  });

  it('stops a selected batch at the first failed post instead of publishing later items', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ state: 'published', message: 'Published first.' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Second post failed.' }, 422));

    await expect(runSocialPublishBatchInBackground([
      { channel: 'instagram', productId: 'item-1' },
      { channel: 'instagram', productId: 'item-2' },
      { channel: 'instagram', productId: 'item-3' },
    ], { fetcher, retryDelayMs: 0 })).rejects.toThrow('Second post failed.');

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).productId))
      .toEqual(['item-1', 'item-2']);
  });
});
