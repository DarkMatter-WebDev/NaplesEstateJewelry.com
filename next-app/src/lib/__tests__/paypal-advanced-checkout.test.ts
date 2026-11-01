import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// PayPal Advanced Checkout (owner's yes + PayPal approval, 2026-10-28): card
// boxes on our own checkout page, Apple Pay, Google Pay — still PayPal.

vi.mock('server-only', () => ({}));

let payPalCreateRequestId: typeof import('@/lib/paypal').payPalCreateRequestId;
let buildPayPalOrderRequest: typeof import('@/lib/paypal').buildPayPalOrderRequest;
let paypalThreeDSecureFailed: typeof import('@/lib/paypal').paypalThreeDSecureFailed;

beforeAll(async () => {
  ({ payPalCreateRequestId, buildPayPalOrderRequest, paypalThreeDSecureFailed } = await import('@/lib/paypal'));
});

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

const INPUT = {
  currency: 'USD',
  subtotal: 100,
  tax: 7,
  shipping: 45,
  total: 152,
  items: [{ name: 'Estate ring', quantity: '1', unitAmount: 100, sku: '28' }],
  referenceId: 'order-123',
};

describe('a retry after a decline gets a NEW PayPal order', () => {
  it('the declined order id salts the request id, never the request body', () => {
    const plain = payPalCreateRequestId(INPUT);
    const retry = payPalCreateRequestId({ ...INPUT, requestIdSalt: 'PP-DECLINED-1' });
    expect(retry).not.toBe(plain);
    expect(retry).toMatch(/^create-[0-9a-f]{31}$/);
    // Idempotent per declined order: the same retry twice is the same new order.
    expect(payPalCreateRequestId({ ...INPUT, requestIdSalt: 'PP-DECLINED-1' })).toBe(retry);
    expect(payPalCreateRequestId({ ...INPUT, requestIdSalt: 'PP-DECLINED-2' })).not.toBe(retry);
    expect(buildPayPalOrderRequest({ ...INPUT, requestIdSalt: 'PP-DECLINED-1' })).toEqual(buildPayPalOrderRequest(INPUT));
  });

  it('no salt (or a null one) keeps every existing request id byte-for-byte', () => {
    expect(payPalCreateRequestId({ ...INPUT, requestIdSalt: null })).toBe(payPalCreateRequestId(INPUT));
  });

  it('both create-order routes salt only when the checkout asks for a new order', () => {
    const site = read('src', 'app', 'api', 'paypal', 'create-order', 'route.ts');
    expect(site).toContain('const newPayPalOrder = body.newPayPalOrder === true;');
    expect(site).toContain('requestIdSalt: newPayPalOrder ? order.paypal_order_id : null');
    const payLink = read('src', 'app', 'api', 'pay', '[token]', 'create-order', 'route.ts');
    expect(payLink).toContain('body?.newPayPalOrder === true');
    expect(payLink).toContain('requestIdSalt,');
    const button = read('src', 'components', 'checkout', 'PayPalCheckoutButton.tsx');
    expect(button).toContain('...(freshPayPalOrderRef.current ? { newPayPalOrder: true } : {})');
  });
});

describe('paypalThreeDSecureFailed', () => {
  const order = (threeDS: Record<string, string> | null, where: 'card' | 'google_pay' = 'card') => {
    const card = threeDS ? { authentication_result: { three_d_secure: threeDS } } : {};
    return { payment_source: where === 'card' ? { card } : { google_pay: { card } } };
  };

  it('blocks an enrolled card whose check failed, was rejected, unavailable or not completed', () => {
    for (const status of ['N', 'R', 'U', 'C']) {
      expect(paypalThreeDSecureFailed(order({ enrollment_status: 'Y', authentication_status: status }))).toBe(true);
    }
    expect(paypalThreeDSecureFailed(order({ enrollment_status: 'Y', authentication_status: 'N' }, 'google_pay'))).toBe(true);
  });

  it('lets a passed check, a not-enrolled card and no check at all through', () => {
    expect(paypalThreeDSecureFailed(order({ enrollment_status: 'Y', authentication_status: 'Y' }))).toBe(false);
    expect(paypalThreeDSecureFailed(order({ enrollment_status: 'Y', authentication_status: 'A' }))).toBe(false);
    expect(paypalThreeDSecureFailed(order({ enrollment_status: 'N' }))).toBe(false);
    expect(paypalThreeDSecureFailed(order({ enrollment_status: 'B' }))).toBe(false);
    expect(paypalThreeDSecureFailed(order(null))).toBe(false);
    expect(paypalThreeDSecureFailed({})).toBe(false);
    expect(paypalThreeDSecureFailed(null)).toBe(false);
  });
});

describe('source guards', () => {
  it('the SDK loads the card form + wallets, with Pay Later still off and Venmo on', () => {
    const sdk = read('src', 'components', 'checkout', 'paypal-sdk.ts');
    expect(sdk).toContain("components: 'buttons,card-fields,applepay,googlepay'");
    expect(sdk).toContain("'disable-funding': 'paylater,credit'");
    expect(sdk).not.toMatch(/disable-funding[^\n]*venmo/);
  });

  it("PayPal's own card button shows only when our card form is unavailable — never both", () => {
    const button = read('src', 'components', 'checkout', 'PayPalCheckoutButton.tsx');
    expect(button).toContain('[funding.PAYPAL, funding.VENMO, ...(cardOk ? [] : [funding.CARD])]');
    expect(button).toContain('{cardEligible ? (');
  });

  it('every capture names how the buyer paid (the server checks 3-D Secure for cards)', () => {
    const button = read('src', 'components', 'checkout', 'PayPalCheckoutButton.tsx');
    expect(button).toContain('body: JSON.stringify({ paypalOrderId, paymentMethod: method })');
    for (const method of ["'card'", "'apple_pay'", "'google_pay'", "'paypal'"]) {
      expect(button).toContain(`captureAndFinish(`);
      expect(button).toContain(method);
    }
  });

  it('the decline line sits with the card boxes and says "try again above"', () => {
    const button = read('src', 'components', 'checkout', 'PayPalCheckoutButton.tsx');
    const form = button.indexOf('{cardEligible ? (');
    expect(button.indexOf('{messageLine}', form)).toBeGreaterThan(form);
    expect(button.indexOf('{messageLine}', form)).toBeLessThan(button.indexOf('onClick={() => { void payByCard(); }}'));
  });

  it('Apple Pay domain file: present, PayPal hex, octet-stream, outside the locale rewrite', () => {
    const file = read('public', '.well-known', 'apple-developer-merchantid-domain-association');
    expect(file).toMatch(/^[0-9A-F]+$/);
    expect(Buffer.from(file, 'hex').toString('utf8')).toMatch(/^\{"pspId":"/);
    const netlify = read('..', 'netlify.toml');
    expect(netlify).toMatch(/for = "\/\.well-known\/apple-developer-merchantid-domain-association"\s*\n\s*\[headers\.values\]\s*\n\s*Content-Type = "application\/octet-stream"/);
    const proxy = read('src', 'proxy.ts');
    const source = proxy.match(/'(\/\(\(\?!.*\)\.\*\))'/)?.[1];
    expect(source).toBeTruthy();
    const matcher = new RegExp(`^${source!.replace(/\\\\/g, '\\')}$`);
    expect(matcher.test('/.well-known/apple-developer-merchantid-domain-association')).toBe(false);
    expect(matcher.test('/checkout')).toBe(true);
  });

  it('both CSPs allow Google Pay (two-CSP rule)', () => {
    const config = read('next.config.ts');
    expect(config).toContain("script: 'https://pay.google.com'");
    expect(config).toContain('${GOOGLE_PAY_CSP.script}');
    expect(config).toContain('${GOOGLE_PAY_CSP.frame}');
    const csp = read('..', 'netlify.toml').match(/Content-Security-Policy = "([^"]+)"/)?.[1] ?? '';
    const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';
    expect(directive('script-src')).toContain('https://pay.google.com');
    expect(directive('connect-src')).toContain('https://pay.google.com');
    expect(directive('connect-src')).toContain('https://google.com/pay');
    expect(directive('frame-src')).toContain('https://pay.google.com');
    expect(directive('img-src')).toContain('https://www.gstatic.com');
  });
});
