import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeShippingService } from '../shipping-service';
import { EXPRESS_SHIPPING_TIERS, STANDARD_SHIPPING_TIERS } from '../checkout-shipping';

describe('describeShippingService — the fee identifies the service', () => {
  it("Arthur's order: $570 merchandise + $29 fee = standard Insured Shipping (Priority Mail)", () => {
    const s = describeShippingService({ shipping_method: 'shipping', shipping_fee: 29, subtotal: 570 });
    expect(s.kind).toBe('priority');
    expect(s.label).toBe('Insured Shipping (Standard)');
    expect(s.detail).toContain('USPS Priority Mail');
  });

  it('the same subtotal with the express fee = Express Overnight', () => {
    const s = describeShippingService({ shipping_method: 'shipping', shipping_fee: '55', subtotal: '570' });
    expect(s.kind).toBe('express');
    expect(s.detail).toContain('Priority Mail Express');
  });

  it('standard at $5,000+ is Registered Mail, with the 2–10 day promise', () => {
    const s = describeShippingService({ shipping_method: 'shipping', shipping_fee: 99, subtotal: 6000 });
    expect(s.kind).toBe('registered');
    expect(s.detail).toContain('2–10 business days');
  });

  it('pickup and local delivery need no postage', () => {
    expect(describeShippingService({ shipping_method: 'pickup', shipping_fee: 0, subtotal: 100 })).toMatchObject({ kind: 'pickup', detail: null });
    expect(describeShippingService({ shipping_method: 'local_delivery', shipping_fee: 0, subtotal: 100 }).kind).toBe('local_delivery');
  });

  it('a fee that matches no tier is reported honestly, never guessed', () => {
    const s = describeShippingService({ shipping_method: 'shipping', shipping_fee: 12, subtotal: 570 });
    expect(s.kind).toBe('unknown');
    expect(s.detail).toContain('$12.00');
    expect(describeShippingService({ shipping_method: 'shipping', shipping_fee: null, subtotal: 570 }).kind).toBe('unknown');
  });

  it('no subtotal band has the same fee for both services (the fingerprint stays unique)', () => {
    const probes = [0, 50, 100, 249, 250, 599, 600, 999, 1000, 2499, 2500, 4999];
    for (const subtotal of probes) {
      const std = STANDARD_SHIPPING_TIERS.find((t) => subtotal >= t.min && (t.max === null || subtotal < t.max))?.fee;
      const exp = EXPRESS_SHIPPING_TIERS.find((t) => subtotal >= t.min && (t.max === null || subtotal < t.max))?.fee;
      expect(std).not.toBe(exp);
    }
  });

  it('the admin order page and the print view show the service, not just "Shipping"', () => {
    const panel = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'OrderDetailPanel.tsx'), 'utf8');
    const print = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'admin', 'orders', '[id]', 'print', 'PrintOrderClient.tsx'), 'utf8');
    expect(panel).toContain('describeShippingService(');
    expect(print).toContain('describeShippingService(');
  });
});
