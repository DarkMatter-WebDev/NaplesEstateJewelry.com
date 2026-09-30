import { describe, expect, it } from 'vitest';
import {
  calculateFlSalesTax,
  chargesFlSalesTax,
  FL_TAX_RATE,
  formatCheckoutCurrency,
  isFloridaState,
  round2,
} from '@/lib/checkout-pricing';

describe('checkout currency display', () => {
  it('shows whole-dollar and sub-dollar amounts to exact cent precision', () => {
    expect(formatCheckoutCurrency(1)).toBe('$1.00');
    expect(formatCheckoutCurrency(0.06)).toBe('$0.06');
    expect(formatCheckoutCurrency(1.06)).toBe('$1.06');
  });

  it('matches the authoritative cents rounding for a one-dollar Florida order', () => {
    const subtotal = round2(1);
    const tax = round2(subtotal * FL_TAX_RATE);
    const total = round2(subtotal + tax);

    expect(formatCheckoutCurrency(subtotal)).toBe('$1.00');
    expect(formatCheckoutCurrency(tax)).toBe('$0.06');
    expect(formatCheckoutCurrency(total)).toBe('$1.06');
  });
});

describe('Florida checkout tax jurisdiction', () => {
  it('taxes local pickup and Florida shipping, but not out-of-state shipping', () => {
    expect(chargesFlSalesTax('local-pickup', 'NY')).toBe(true);
    expect(chargesFlSalesTax('priority-insured', 'FL')).toBe(true);
    expect(chargesFlSalesTax('priority-insured', 'NY')).toBe(false);
  });

  it('continues to recognize normalized and legacy Florida state values', () => {
    expect(isFloridaState('FL')).toBe(true);
    expect(isFloridaState('Florida')).toBe(true);
    expect(isFloridaState('Floridda')).toBe(false);
  });

  it('includes charged shipping in the Florida taxable base', () => {
    const subtotal = 100;
    const shipping = 45;
    const tax = calculateFlSalesTax(subtotal, shipping);

    expect(tax).toBe(8.7);
    expect(round2(subtotal + tax + shipping)).toBe(153.7);
  });
});
