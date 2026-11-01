import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  FacebookApiError,
  fetchFacebookAccessTokenMetadata,
  fetchRecentPagePosts,
  facebookPostReadCandidates,
  findSingleRecentFacebookPostByExactMessage,
  isFacebookPhotoAlreadyPostedError,
  isFacebookPostMissingError,
  isFacebookPostReadPermissionError,
  redactFacebookSecrets,
} from '../client';

function apiError(params: {
  code?: number;
  subcode?: number;
  message?: string;
  operatorCode?: string;
}) {
  return new FacebookApiError({
    status: 400,
    code: params.operatorCode ?? 'OAuthException',
    operatorMessage: params.message ?? 'Unsupported get request.',
    retryable: false,
    detail: { code: params.code ?? 100, subcode: params.subcode ?? null },
  });
}

describe('isFacebookPostMissingError', () => {
  it('recognizes Meta object-not-found subcode 33', () => {
    expect(isFacebookPostMissingError(apiError({ subcode: 33 }))).toBe(true);
  });

  it('recognizes strict code-100 missing-object wording without a subcode', () => {
    expect(
      isFacebookPostMissingError(
        apiError({ message: 'Unsupported get request. Object does not exist or cannot be loaded.' }),
      ),
    ).toBe(true);
  });

  it('does not classify token or unrelated Graph errors as a missing post', () => {
    expect(isFacebookPostMissingError(apiError({ code: 190, operatorCode: 'invalid_token' }))).toBe(false);
    expect(isFacebookPostMissingError(new Error('network failed'))).toBe(false);
  });
});

describe('isFacebookPostReadPermissionError', () => {
  it('recognizes Meta code 10 and the named Page read permission', () => {
    expect(isFacebookPostReadPermissionError(apiError({ code: 10 }))).toBe(true);
    expect(
      isFacebookPostReadPermissionError(
        apiError({ code: 200, message: "This endpoint requires 'pages_read_engagement'." }),
      ),
    ).toBe(true);
  });

  it('does not confuse a missing post with a missing read permission', () => {
    expect(isFacebookPostReadPermissionError(apiError({ code: 100, subcode: 33 }))).toBe(false);
  });
});

describe('facebookPostReadCandidates', () => {
  it('adds the public Page actor id from a Facebook post permalink', () => {
    expect(
      facebookPostReadCandidates(
        '1236201566238924_122109265335368300',
        'https://www.facebook.com/122109252633368300/posts/122109265335368300',
      ),
    ).toEqual([
      '1236201566238924_122109265335368300',
      '122109252633368300_122109265335368300',
    ]);
  });

  it('does not derive ids from non-Facebook or malformed permalinks', () => {
    expect(
      facebookPostReadCandidates('stored_post', 'https://example.com/123/posts/456'),
    ).toEqual(['stored_post']);
    expect(facebookPostReadCandidates('stored_post', 'not a url')).toEqual(['stored_post']);
  });
});

describe('Facebook interrupted-publish recovery', () => {
  it('recognizes Meta\'s consumed-photo retry error', () => {
    expect(isFacebookPhotoAlreadyPostedError('These photos were already posted.')).toBe(true);
    expect(isFacebookPhotoAlreadyPostedError(new Error('Network unavailable.'))).toBe(false);
  });

  it('accepts only one exact caption match created after the photo checkpoint', () => {
    const since = new Date('2026-08-03T00:19:00Z');
    const matching = {
      id: 'page_post',
      message: 'Exact prepared caption',
      created_time: '2026-08-03T00:20:07Z',
      permalink_url: 'https://www.facebook.com/page/posts/post',
    };
    expect(findSingleRecentFacebookPostByExactMessage([matching], matching.message, since)).toEqual(matching);
    expect(findSingleRecentFacebookPostByExactMessage([
      matching,
      { ...matching, id: 'duplicate_post' },
    ], matching.message, since)).toBeNull();
    expect(findSingleRecentFacebookPostByExactMessage([
      { ...matching, created_time: '2026-08-03T00:18:59Z' },
    ], matching.message, since)).toBeNull();
  });

  it('reads recent Page posts with the checkpoint boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'page_post' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRecentPagePosts({
      pageId: 'page-id',
      accessToken: 'EAAcandidateTokenExample1234567890',
      since: new Date('2026-08-03T00:19:00Z'),
    })).resolves.toEqual([{ id: 'page_post' }]);
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('/page-id/feed');
    expect(requestUrl).toContain('since=1785716340');
    vi.unstubAllGlobals();
  });
});

describe('Facebook token inspection', () => {
  it('reads Meta debug-token metadata with a server-only App token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            app_id: 'app-id',
            expires_at: 0,
            is_valid: true,
            type: 'PAGE',
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchFacebookAccessTokenMetadata('EAAcandidateTokenExample1234567890', 'app-id|app-secret'),
    ).resolves.toMatchObject({ app_id: 'app-id', expires_at: 0, is_valid: true });

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('/debug_token');
    expect(requestUrl).toContain('input_token=EAAcandidateTokenExample1234567890');
    expect(requestUrl).toContain('access_token=app-id%7Capp-secret');
    vi.unstubAllGlobals();
  });

  it('redacts both candidate and App access tokens from Meta error text', () => {
    expect(
      redactFacebookSecrets(
        'input_token=EAAcandidateTokenExample1234567890&access_token=app-id|app-secret',
      ),
    ).toBe('input_token=[redacted]&access_token=[redacted]');
  });
});
