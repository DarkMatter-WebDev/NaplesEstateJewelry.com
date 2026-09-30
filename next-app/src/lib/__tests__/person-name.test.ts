import { describe, expect, it } from 'vitest';
import {
  composeFullName,
  formatFullName,
  isCompletePersonName,
  normalizePersonName,
  parseFullName,
} from '@/lib/person-name';

describe('checkout name composition', () => {
  it('joins the two checkout fields into the stored name', () => {
    expect(composeFullName('Sara', 'Catlett')).toBe('Sara Catlett');
    expect(composeFullName('  Sara  ', '  Catlett  ')).toBe('Sara Catlett');
    expect(composeFullName('Mary Jane', 'Watson')).toBe('Mary Jane Watson');
  });

  it('refuses to compose when either field is missing — the bug this exists for', () => {
    // The real 2026-08-22 order: a first name only, with the surname typed into
    // the phone field instead.
    expect(composeFullName('Sara', '')).toBeNull();
    expect(composeFullName('', 'Catlett')).toBeNull();
    expect(composeFullName('Sara', '   ')).toBeNull();
    expect(composeFullName('Sara', '.')).toBeNull();
    expect(composeFullName('Sara', '123')).toBeNull();
    expect(composeFullName(null, undefined)).toBeNull();
  });

  it('accepts unusual but real names rather than judging their shape', () => {
    // A false positive here is a lost customer. Only a genuinely absent second
    // part may be rejected.
    for (const [first, last] of [
      ['Mary-Jane', 'Watson'],
      ['Juan', 'de la Cruz'],
      ["Seán", "O'Brien"],
      ['J', 'Catlett'],
      ['Sara', 'C'],
      ['李', '小龙'],
      ['Björn', 'Ásgeirsson'],
    ] as const) {
      expect(composeFullName(first, last), `${first} ${last}`).toBe(`${first} ${last}`);
    }
  });

  it('validates a composed name server-side', () => {
    expect(normalizePersonName('Sara Catlett')).toBe('Sara Catlett');
    expect(normalizePersonName('  Sara   Catlett ')).toBe('Sara Catlett');
    expect(normalizePersonName('Juan de la Cruz')).toBe('Juan de la Cruz');
    expect(normalizePersonName('Sara')).toBeNull();
    expect(normalizePersonName('')).toBeNull();
    expect(normalizePersonName('Sara .')).toBeNull();
    expect(normalizePersonName(null)).toBeNull();
    expect(isCompletePersonName('Sara Catlett')).toBe(true);
    expect(isCompletePersonName('Sara')).toBe(false);
  });

  it('formats for display without rejecting a partial name', () => {
    // The receipt renders what was captured; it does not re-litigate it.
    expect(formatFullName('Sara', 'Catlett')).toBe('Sara Catlett');
    expect(formatFullName('Sara', '')).toBe('Sara');
    expect(formatFullName('', '')).toBe('');
  });

  it('splits a stored full name for prefill, keeping multi-word surnames whole', () => {
    expect(parseFullName('Sara Catlett')).toEqual({ first: 'Sara', last: 'Catlett' });
    expect(parseFullName('Juan de la Cruz')).toEqual({ first: 'Juan', last: 'de la Cruz' });
    expect(parseFullName('  Sara   Catlett  ')).toEqual({ first: 'Sara', last: 'Catlett' });
    expect(parseFullName('Sara')).toEqual({ first: 'Sara', last: '' });
    expect(parseFullName('')).toEqual({ first: '', last: '' });
  });

  it('round-trips a composed name back through prefill', () => {
    const stored = composeFullName('Sara', 'Catlett');
    expect(stored).not.toBeNull();
    const { first, last } = parseFullName(stored);
    expect(composeFullName(first, last)).toBe(stored);
  });
});
