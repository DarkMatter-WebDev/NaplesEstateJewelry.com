import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FACEBOOK_APP_ID,
  FACEBOOK_MIN_TOKEN_LIFETIME_MS,
  assessFacebookAccessTokenMetadata,
} from '../auth';
import { FacebookApiError, type FacebookAccessTokenMetadata } from '../client';

const NOW = new Date('2026-08-02T20:00:00.000Z');

function secondsFromNow(milliseconds: number): number {
  return Math.floor((NOW.getTime() + milliseconds) / 1000);
}

function metadata(
  patch: Partial<FacebookAccessTokenMetadata> = {},
): FacebookAccessTokenMetadata {
  return {
    app_id: FACEBOOK_APP_ID,
    expires_at: 0,
    data_access_expires_at: 0,
    is_valid: true,
    type: 'PAGE',
    ...patch,
  };
}

function expectFacebookCode(run: () => unknown, code: string) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(FacebookApiError);
    expect((error as FacebookApiError).code).toBe(code);
    return;
  }
  throw new Error(`Expected FacebookApiError(${code}).`);
}

describe('assessFacebookAccessTokenMetadata', () => {
  it('accepts a valid token when Meta reports no finite expiration', () => {
    expect(assessFacebookAccessTokenMetadata({ metadata: metadata(), now: NOW })).toEqual({
      tokenExpiresAt: null,
    });
  });

  it('rejects a same-day token before it can replace the connection', () => {
    expectFacebookCode(
      () =>
        assessFacebookAccessTokenMetadata({
          metadata: metadata({ expires_at: secondsFromNow(5 * 60 * 60 * 1000) }),
          now: NOW,
        }),
      'short_lived_token',
    );
  });

  it('records the earliest effective expiration for a longer-lived token', () => {
    const tokenExpiry = secondsFromNow(60 * 24 * 60 * 60 * 1000);
    const dataExpiry = secondsFromNow(45 * 24 * 60 * 60 * 1000);

    expect(
      assessFacebookAccessTokenMetadata({
        metadata: metadata({ expires_at: tokenExpiry, data_access_expires_at: dataExpiry }),
        now: NOW,
      }),
    ).toEqual({ tokenExpiresAt: new Date(dataExpiry * 1000).toISOString() });
  });

  it('rejects expired, invalid, and wrong-app tokens', () => {
    expectFacebookCode(
      () =>
        assessFacebookAccessTokenMetadata({
          metadata: metadata({ expires_at: secondsFromNow(-60_000) }),
          now: NOW,
        }),
      'invalid_token',
    );
    expectFacebookCode(
      () => assessFacebookAccessTokenMetadata({ metadata: metadata({ is_valid: false }), now: NOW }),
      'invalid_token',
    );
    expectFacebookCode(
      () =>
        assessFacebookAccessTokenMetadata({
          metadata: metadata({ app_id: 'different-app' }),
          now: NOW,
        }),
      'wrong_app',
    );
  });

  it('keeps the minimum lifetime at 30 days', () => {
    expect(FACEBOOK_MIN_TOKEN_LIFETIME_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('Facebook connection route', () => {
  it('persists the inspected expiration instead of assuming null', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'api', 'admin', 'facebook', 'connect', 'route.ts'),
      'utf8',
    );

    expect(source).toContain('token_expires_at: page.tokenExpiresAt');
    expect(source).not.toContain('token_expires_at: null');
  });
});
