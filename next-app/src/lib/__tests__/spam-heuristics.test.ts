import { describe, expect, it } from 'vitest';
import { checkSubmissionForSpam, countCaseTransitions, looksLikeRandomToken } from '@/lib/spam-heuristics';

/**
 * The names below are the REAL submissions the bot made on 2026-08-22, and the
 * human names are the ones most likely to trip a case-transition rule. Both
 * lists are the point of this file: the margin between them is the only thing
 * keeping a real customer's inquiry from being silently discarded.
 */

const REAL_SPAM_NAMES = [
  'eaGqGQKfZrTtwwmRJTEobY',
  'EHMSfogRxJoBUSBqBtP',
  'QaGmWrBuLLFsStrYet',
  'oEGVXGpbuRqropnmwWjYi',
  'RdMMftUuDDUnPsHVLR',
  'FrPTbrTLdNZlGMePYBRLLeY',
  'zHlOHviqXgmoGgiYaWabD',
  'xujmxSZGvFfhHrqUCPXJ',
  'IFQOrkfgRJLsNmMmOFXJW',
  'dZBLlPmHyWUaKyHNNq',
];

// Deliberately the awkward cases, not easy ones. The first block is the whole
// point: real surnames that are LONG ENOUGH to clear the length gate, so the
// case-transition threshold is the only thing standing between them and a
// silently discarded inquiry.
const REAL_HUMAN_NAMES = [
  'VanDerBeek',            // 10 chars, 5 transitions — the worst human case found
  'DeLaCruz',              // 5 transitions
  'MacPherson',            // 10 chars, 3
  'McCorquodale',          // 12 chars, 3
  'MacGillivray',          // 12 chars, 3
  'McCullough',            // 10 chars, 3
  'McLaughlin',            // 10 chars, 3
  'MacFarlane',            // 10 chars, 3
  'chris',                 // the one genuine inquiry already in the table
  'McDonald',              // 3 (under the length gate, but keep it honest)
  'MacArthur',             // 3
  'Konstantinos',          // long, but a single flip
  "O'Brien",               // punctuation must not be read as a case flip
  'van der Berg',
  'Mary-Jane Watson',
  'JOHN SMITH',            // shouty caps, no flips
  'j smith',
  'María José Rodríguez',
  'Jean-Luc Picard',
  'DeAndre Washington',    // interior capital, two tokens
  'LaTonya',               // interior capital, short
];

describe('countCaseTransitions', () => {
  it('scores the documented worked examples', () => {
    expect(countCaseTransitions('Konstantinos')).toBe(1);
    expect(countCaseTransitions("O'Brien")).toBe(1);
    expect(countCaseTransitions('McDonald')).toBe(3);
    expect(countCaseTransitions('MacArthur')).toBe(3);
    expect(countCaseTransitions('JOHN')).toBe(0);
    expect(countCaseTransitions('john')).toBe(0);
  });

  it('keeps a measured gap between the human ceiling and the spam floor', () => {
    // Human max 5, spam min 7 (measured 2026-08-22). The threshold sits at 6.
    // If either bound moves, this fails and the constant needs re-deriving —
    // which is the point.
    const spam = REAL_SPAM_NAMES.map(countCaseTransitions);
    const human = REAL_HUMAN_NAMES.filter((n) => /^[A-Za-z]+$/.test(n)).map(countCaseTransitions);
    expect(Math.min(...spam)).toBe(7);
    expect(Math.max(...human)).toBe(5);
    expect(Math.max(...human)).toBeLessThan(Math.min(...spam));
  });
});

describe('looksLikeRandomToken', () => {
  it('flags every name the bot actually used on 2026-08-22', () => {
    for (const name of REAL_SPAM_NAMES) {
      expect(looksLikeRandomToken(name), name).toBe(true);
    }
  });

  it('never flags a real name — a false positive is a lost customer', () => {
    for (const name of REAL_HUMAN_NAMES) {
      expect(looksLikeRandomToken(name), name).toBe(false);
    }
  });

  it('ignores anything with a space, however odd it looks', () => {
    // Two tokens is the strongest human signal available, so it wins outright.
    expect(looksLikeRandomToken('eaGqGQKfZr TtwwmRJTEobY')).toBe(false);
  });

  it('ignores short tokens and non-alphabetic values', () => {
    expect(looksLikeRandomToken('aBcDeF')).toBe(false);      // under the length gate
    expect(looksLikeRandomToken('aB1cD2eF3gH4')).toBe(false); // digits: not a name shape we judge
    expect(looksLikeRandomToken('')).toBe(false);
    expect(looksLikeRandomToken('   ')).toBe(false);
  });
});

describe('checkSubmissionForSpam', () => {
  it('drops on a filled honeypot', () => {
    const v = checkSubmissionForSpam({ name: 'Jane Smith', honeypot: 'anything' });
    expect(v.isSpam).toBe(true);
    expect(v.reasons).toContain('honeypot');
  });

  it('drops on a generated-looking name even with an empty honeypot', () => {
    // The case that matters: a bot POSTing JSON straight at the route never
    // sees the form, so it never fills the honeypot.
    const v = checkSubmissionForSpam({ name: 'RdMMftUuDDUnPsHVLR', honeypot: '' });
    expect(v.isSpam).toBe(true);
    expect(v.reasons).toEqual(['random-name']);
  });

  it('reports both reasons when both fire', () => {
    const v = checkSubmissionForSpam({ name: 'dZBLlPmHyWUaKyHNNq', honeypot: 'x' });
    expect(v.reasons).toEqual(['honeypot', 'random-name']);
  });

  it('passes an ordinary submission', () => {
    expect(checkSubmissionForSpam({ name: 'Chris Surette', honeypot: '' }).isSpam).toBe(false);
    expect(checkSubmissionForSpam({ name: 'chris' }).isSpam).toBe(false);
    expect(checkSubmissionForSpam({}).isSpam).toBe(false);
  });

  it('treats whitespace in the honeypot as empty', () => {
    // Some browsers/extensions will put a stray space in an autofilled field.
    expect(checkSubmissionForSpam({ name: 'Jane Smith', honeypot: '   ' }).isSpam).toBe(false);
  });
});
