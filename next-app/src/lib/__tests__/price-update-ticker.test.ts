import { describe, expect, it } from 'vitest';
import {
  formatRemaining,
  formatUpdateTime,
} from '@/components/shop/PriceUpdateTicker';

describe('price update ticker', () => {
  it('formats a countdown deterministically once the client timer starts', () => {
    const nextUpdateAt = 1_000_000;
    const initialNow = 700_001;

    expect(formatRemaining(nextUpdateAt - initialNow)).toBe('5:00');
    expect(formatRemaining(nextUpdateAt - initialNow)).toBe('5:00');
  });

  it('clamps expired countdowns at zero', () => {
    expect(formatRemaining(-1)).toBe('0:00');
  });

  it('formats the update clock in the Naples business time zone', () => {
    const nextUpdateAt = Date.UTC(2026, 6, 28, 5, 5);

    expect(formatUpdateTime(nextUpdateAt, 'en')).toBe('1:05 AM');
    expect(formatUpdateTime(nextUpdateAt, 'es')).toBe('1:05 a.m.');
  });
});
