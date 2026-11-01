import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { InstagramApiError, isInstagramMediaMissingError } from '../client';

function apiError(params: {
  code?: number;
  subcode?: number;
  message?: string;
  operatorCode?: string;
}) {
  return new InstagramApiError({
    status: 400,
    code: params.operatorCode ?? 'OAuthException',
    operatorMessage: params.message ?? 'Unsupported get request.',
    retryable: false,
    detail: { code: params.code ?? 100, subcode: params.subcode ?? null },
  });
}

describe('isInstagramMediaMissingError', () => {
  it('recognizes Meta object-not-found subcode 33', () => {
    expect(isInstagramMediaMissingError(apiError({ subcode: 33 }))).toBe(true);
  });

  it('recognizes strict code-100 missing-media wording without a subcode', () => {
    expect(
      isInstagramMediaMissingError(
        apiError({ message: 'Unsupported get request. Media does not exist or cannot be loaded.' }),
      ),
    ).toBe(true);
  });

  it('does not classify token or unrelated Graph errors as missing media', () => {
    expect(isInstagramMediaMissingError(apiError({ code: 190, operatorCode: 'invalid_token' }))).toBe(false);
    expect(isInstagramMediaMissingError(new Error('network failed'))).toBe(false);
  });
});
