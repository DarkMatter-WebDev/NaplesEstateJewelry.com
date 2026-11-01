import { beforeAll, describe, expect, it } from 'vitest';
import {
  INSTAGRAM_MIN_REFRESH_AGE_MS,
  INSTAGRAM_REFRESH_WINDOW_MS,
  decideTokenRefresh,
  decryptToken,
  encryptToken,
} from '../auth';

const NOW = new Date('2026-07-31T20:00:00Z');

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('token encryption', () => {
  beforeAll(() => {
    process.env.INSTAGRAM_TOKEN_ENC_KEY = 'test-key-any-length-string';
  });

  it('round-trips a token', () => {
    const token = 'IGAAxxxxxxxxxxxxxxxxxxxxEXAMPLE';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const token = 'IGAAxxxxxxxxxxxxxxxxxxxxEXAMPLE';
    expect(encryptToken(token)).not.toBe(encryptToken(token));
  });

  it('rejects malformed ciphertext rather than returning garbage', () => {
    expect(() => decryptToken('not-a-valid-blob')).toThrow();
  });

  it('rejects a tampered payload (GCM auth tag)', () => {
    const enc = encryptToken('IGAAxxxxxxxxxxxxxxxxxxxxEXAMPLE');
    const [iv, tag, data] = enc.split('.');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    expect(() => decryptToken([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });
});

describe('decideTokenRefresh', () => {
  it('skips when there is no token', () => {
    expect(decideTokenRefresh({ hasToken: false, expiresAt: null, refreshedAt: null, now: NOW })).toEqual({
      action: 'skip',
      reason: 'no_token',
    });
  });

  it('requires re-auth once the token has expired', () => {
    const result = decideTokenRefresh({
      hasToken: true,
      expiresAt: daysFromNow(-1),
      refreshedAt: daysFromNow(-61),
      now: NOW,
    });
    expect(result).toEqual({ action: 'reauth', reason: 'expired' });
  });

  it('skips a token refreshed less than 24h ago, which Meta would reject', () => {
    const result = decideTokenRefresh({
      hasToken: true,
      expiresAt: daysFromNow(1),
      refreshedAt: new Date(NOW.getTime() - INSTAGRAM_MIN_REFRESH_AGE_MS + 60_000),
      now: NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'too_young' });
  });

  it('skips when expiry is comfortably far away', () => {
    const result = decideTokenRefresh({
      hasToken: true,
      expiresAt: daysFromNow(45),
      refreshedAt: daysFromNow(-15),
      now: NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'not_due' });
  });

  it('refreshes inside the renewal window', () => {
    const result = decideTokenRefresh({
      hasToken: true,
      expiresAt: new Date(NOW.getTime() + INSTAGRAM_REFRESH_WINDOW_MS - 60_000),
      refreshedAt: daysFromNow(-53),
      now: NOW,
    });
    expect(result).toEqual({ action: 'refresh' });
  });

  // 2026-09-14: the keep-warm job runs once a week, so the window must span two
  // runs. With 7 days a token expiring 09-30 skipped on 09-21 (9 days left) and
  // had a single attempt on 09-28 before dying.
  it('uses a 14-day window so a weekly job gets two attempts before expiry', () => {
    expect(INSTAGRAM_REFRESH_WINDOW_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(decideTokenRefresh({ hasToken: true, expiresAt: daysFromNow(9), refreshedAt: daysFromNow(-51), now: NOW }))
      .toEqual({ action: 'refresh' });
    expect(decideTokenRefresh({ hasToken: true, expiresAt: daysFromNow(15), refreshedAt: daysFromNow(-45), now: NOW }))
      .toEqual({ action: 'skip', reason: 'not_due' });
  });

  it('refreshes when expiry is unknown so a known-good expiry gets established', () => {
    const result = decideTokenRefresh({
      hasToken: true,
      expiresAt: null,
      refreshedAt: daysFromNow(-10),
      now: NOW,
    });
    expect(result).toEqual({ action: 'refresh' });
  });

  it('prefers re-auth over the too-young rule when the token is already dead', () => {
    // A token that expired but was "refreshed" recently must not be reported as
    // merely too young — that would hide a connection that needs attention.
    const result = decideTokenRefresh({
      hasToken: true,
      expiresAt: daysFromNow(-1),
      refreshedAt: new Date(NOW.getTime() - 60_000),
      now: NOW,
    });
    expect(result).toEqual({ action: 'reauth', reason: 'expired' });
  });
});
