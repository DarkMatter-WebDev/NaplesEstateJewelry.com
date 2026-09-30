import { describe, expect, it } from 'vitest';
import { isValidPhoneNumber, normalizePhoneNumber, phoneErrorMessage } from '@/lib/phone';

describe('phone-number normalization', () => {
  it('accepts every punctuation style a person actually types', () => {
    const canonical = '(239) 404-8505';
    for (const input of [
      '2394048505',
      '239-404-8505',
      '(239) 404-8505',
      '239.404.8505',
      '239 404 8505',
      ' (239)404-8505 ',
      '+1 (239) 404-8505',
      '1-239-404-8505',
      '12394048505',
    ]) {
      expect(normalizePhoneNumber(input), input).toBe(canonical);
    }
  });

  it('rejects a surname typed into the phone field — the bug this exists for', () => {
    // The real 2026-08-22 order: "Sara" in Full Name, "Catlett" in Phone.
    expect(normalizePhoneNumber('Catlett')).toBeNull();
    expect(normalizePhoneNumber('')).toBeNull();
    expect(normalizePhoneNumber('   ')).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber('n/a')).toBeNull();
    expect(normalizePhoneNumber('none')).toBeNull();
  });

  it('rejects digit strings that cannot ring', () => {
    expect(normalizePhoneNumber('4048505')).toBeNull(); // 7 digits, no area code
    expect(normalizePhoneNumber('239404850')).toBeNull(); // 9 digits
    expect(normalizePhoneNumber('23940485055')).toBeNull(); // 11 digits, no leading 1
    expect(normalizePhoneNumber('0000000000')).toBeNull(); // area code cannot start with 0
    expect(normalizePhoneNumber('1234567890')).toBeNull(); // area code cannot start with 1
    expect(normalizePhoneNumber('1111111111')).toBeNull(); // leading 1 stripped, 9 digits left
    expect(normalizePhoneNumber('911-404-8505')).toBeNull(); // N11 area code is reserved
    expect(normalizePhoneNumber('239-411-8505')).toBeNull(); // N11 exchange is reserved
  });

  it('keeps an explicit international number instead of rejecting it', () => {
    expect(normalizePhoneNumber('+44 20 7123 4567')).toBe('+442071234567');
    expect(normalizePhoneNumber('+52 (55) 1234-5678')).toBe('+525512345678');
    expect(normalizePhoneNumber('+44')).toBeNull(); // country code alone
    expect(normalizePhoneNumber('+4420712345678901')).toBeNull(); // past the E.164 15-digit cap
  });

  it('preserves a trailing extension rather than failing on it', () => {
    expect(normalizePhoneNumber('239-404-8505 x12')).toBe('(239) 404-8505 x12');
    expect(normalizePhoneNumber('2394048505x12')).toBe('(239) 404-8505 x12');
    expect(normalizePhoneNumber('(239) 404-8505 ext. 4021')).toBe('(239) 404-8505 x4021');
    expect(normalizePhoneNumber('(239) 404-8505 extension 7')).toBe('(239) 404-8505 x7');
    expect(normalizePhoneNumber('239-404-8505, 12')).toBe('(239) 404-8505 x12');
  });

  it('does not treat ordinary digits as an extension', () => {
    // The separator token is required, so nothing is silently sliced off a
    // plain number.
    expect(normalizePhoneNumber('239 404 8505')).toBe('(239) 404-8505');
    expect(normalizePhoneNumber('+442071234567')).toBe('+442071234567');
  });

  it('exposes the same rule as a predicate', () => {
    expect(isValidPhoneNumber('239-404-8505')).toBe(true);
    expect(isValidPhoneNumber('Catlett')).toBe(false);
  });

  it('rejects what the old per-form "10 to 15 digits" rule let through', () => {
    // MessageUsForm and /api/contact-message each carried their own copy of a
    // digit-count rule. These all satisfied it and none of them can ring.
    for (const input of ['0000000000', '1111111111', '1234567890', '123456789012345']) {
      expect(normalizePhoneNumber(input), input).toBeNull();
    }
  });

  it('gives every form one shared message in both locales', () => {
    expect(phoneErrorMessage(false)).toContain('valid phone number');
    expect(phoneErrorMessage(true)).toContain('teléfono');
    expect(phoneErrorMessage(false)).not.toBe(phoneErrorMessage(true));
  });
});
