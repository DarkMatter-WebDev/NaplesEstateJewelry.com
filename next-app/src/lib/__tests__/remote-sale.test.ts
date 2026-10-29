import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECK_PAYABLE_TO,
  ZELLE_PAY_TO,
  normalizePayPageCustomer,
  normalizeRemoteSaleInput,
  payPageTotals,
  remoteChargesTax,
  remoteInvoiceState,
  remoteLinkExpiry,
  remoteOtherWays,
  remotePayUrl,
  remoteDraftHasContent,
  remoteDraftPhotoUrls,
  remoteDraftSummary,
  sanitizeRemoteDraft,
} from '../remote-sale';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '../order-invoice-email';

// Admin → Instant Sale → Remote sale (owner, mockup v2, 2026-10-21).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const customer = { firstName: 'Margaret', lastName: 'Collins', email: 'M.Collins@Example.com', phone: '' };
const ring = { kind: 'listed', productId: 'halo-ring-212', price: '1150' };
const chain = { kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1460' };
const pay = { online: true, zelle: true, check: false, phone: false };

describe('normalizeRemoteSaleInput', () => {
  it('needs an email (the invoice goes there) but not a cell', () => {
    const result = normalizeRemoteSaleInput({ items: [ring, chain], customer, pay });
    expect('value' in result && result.value).toMatchObject({
      customer: { name: 'Margaret Collins', email: 'm.collins@example.com', phone: null },
      delivery: { method: 'pickup', address: null },
      linkDays: 7,
      subtotal: 2610,
      tax: 156.6,
      total: 2766.6,
    });
    expect(normalizeRemoteSaleInput({ items: [chain], customer: { ...customer, email: '' }, pay }))
      .toEqual({ error: "Enter the customer's email — the invoice goes there." });
    expect(normalizeRemoteSaleInput({ items: [chain], customer: { ...customer, phone: '12' }, pay }))
      .toEqual({ error: 'Enter a valid cell number.' });
  });

  it('ships with or without an address; no address yet = drawn with Florida tax', () => {
    const blank = normalizeRemoteSaleInput({ items: [ring, chain], customer, pay, delivery: { method: 'ship', address: {}, shipping: 'insured' } });
    expect('value' in blank && blank.value).toMatchObject({ delivery: { method: 'ship', address: null, shippingFee: 99 }, tax: 162.54, total: 2871.54 });
    const ga = normalizeRemoteSaleInput({
      items: [ring, chain], customer, pay,
      delivery: { method: 'ship', address: { line1: '2840 Peachtree Rd NW', city: 'Atlanta', state: 'GA', postalCode: '30305' }, shipping: 'insured' },
    });
    expect('value' in ga && ga.value).toMatchObject({ tax: 0, total: 2709 });
    expect(normalizeRemoteSaleInput({ items: [chain], customer, pay, delivery: { method: 'ship', address: { city: 'Naples' }, shipping: 'insured' } }))
      .toHaveProperty('error');
  });

  it('needs at least one way to pay and a known link length', () => {
    expect(normalizeRemoteSaleInput({ items: [chain], customer, pay: { online: false, zelle: false, check: false, phone: false } }))
      .toEqual({ error: 'Tick at least one way for the customer to pay.' });
    expect(normalizeRemoteSaleInput({ items: [chain], customer, pay, linkDays: 30 })).toEqual({ error: 'Pick how long the link works.' });
    expect(normalizeRemoteSaleInput({ items: [chain], customer, pay, linkDays: 14 })).toHaveProperty('value.linkDays', 14);
    expect(normalizeRemoteSaleInput({ items: [chain], customer, pay, message: 'x'.repeat(301) })).toHaveProperty('error');
  });
});

describe('remote invoice rules', () => {
  it('taxes a pickup, a Florida address and a not-yet-known address; nothing out of state', () => {
    expect(remoteChargesTax('pickup', 'GA')).toBe(true);
    expect(remoteChargesTax('ship', null)).toBe(true);
    expect(remoteChargesTax('ship', 'FL')).toBe(true);
    expect(remoteChargesTax('ship', 'GA')).toBe(false);
    expect(payPageTotals({ subtotal: 2610, shipping_fee: 99, shipping_method: 'shipping' }, 'GA')).toMatchObject({ tax: 0, total: 2709 });
    expect(payPageTotals({ subtotal: 2610, shipping_fee: 99, shipping_method: 'shipping' }, 'FL')).toMatchObject({ tax: 162.54, total: 2871.54 });
    expect(payPageTotals({ subtotal: 2610, shipping_fee: 0, shipping_method: 'pickup' }, null)).toMatchObject({ tax: 156.6, total: 2766.6 });
    // Before the customer types a state, the page shows the email's figure (with Florida tax).
    expect(payPageTotals({ subtotal: 2610, shipping_fee: 99, shipping_method: 'shipping' }, null)).toMatchObject({ tax: 162.54, total: 2871.54 });
  });

  it('reads the invoice state from the order first, then the row', () => {
    const row = { cancelled_at: null, expires_at: '2026-10-28T12:00:00Z' };
    const now = new Date('2026-10-21T12:00:00Z');
    expect(remoteInvoiceState(row, { payment_status: 'unpaid', order_status: 'open' }, now)).toBe('open');
    expect(remoteInvoiceState(row, { payment_status: 'paid', order_status: 'completed' }, now)).toBe('paid');
    expect(remoteInvoiceState({ ...row, cancelled_at: '2026-10-22T00:00:00Z' }, { payment_status: 'unpaid', order_status: 'cancelled' }, now)).toBe('cancelled');
    expect(remoteInvoiceState(row, { payment_status: 'unpaid', order_status: 'open' }, new Date('2026-10-29T00:00:00Z'))).toBe('expired');
    expect(remoteLinkExpiry(now, 7).toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('prints the owner\'s Zelle number and check payee exactly (owner, 2026-10-21)', () => {
    expect(ZELLE_PAY_TO).toBe('(239) 304-6229');
    expect(CHECK_PAYABLE_TO).toBe('Naples Estate Jewelry');
    expect(remoteOtherWays({ online: true, zelle: true, check: true, phone: true }, 'NEJ-20261021-K7QM2')).toEqual([
      'Zelle to (239) 304-6229 — put NEJ-20261021-K7QM2 in the memo.',
      'Check payable to Naples Estate Jewelry, mailed to 6240 Shirley St, Ste 104, Naples, FL 34109, or brought to the showroom.',
      'Call (239) 404-8505 to pay by card.',
    ]);
    expect(remoteOtherWays({ online: true, zelle: false, check: false, phone: false }, 'X')).toEqual([]);
    expect(remotePayUrl('https://naplesestatejewelry.com/', 'abc_DEF-123')).toBe('https://naplesestatejewelry.com/pay/abc_DEF-123');
  });

  it('asks the payer for name, email and cell, and the address only when it ships', () => {
    const who = { first_name: 'Margaret', last_name: 'Collins', email: 'M@Example.com', phone: '239-555-0134' };
    expect(normalizePayPageCustomer(who, false)).toEqual({ value: { name: 'Margaret Collins', email: 'm@example.com', phone: '(239) 555-0134', address: null } });
    expect(normalizePayPageCustomer({ ...who, phone: '' }, false)).toEqual({ error: 'Enter a valid cell number.' });
    expect(normalizePayPageCustomer(who, true)).toHaveProperty('error');
    expect(normalizePayPageCustomer({ ...who, address_line1: '4100 Gulf Shore Blvd N', city: 'Naples', state: 'fl', postal_code: '34103' }, true))
      .toMatchObject({ value: { address: { state: 'FL', postalCode: '34103', line2: null } } });
  });
});

describe('the invoice email carries the pay link only when a remote sale sends it', () => {
  const order = {
    id: 'o1', order_number: 'NEJ-20261021-K7QM2', customer_name: 'Margaret Collins', customer_email: 'm@example.com',
    subtotal: 2610, tax: 162.54, shipping_fee: 99, discount: 0, total: 2871.54,
    payment_status: 'unpaid', fulfillment_status: 'pending', order_status: 'open', shipping_method: 'shipping', shipping_address: null,
    order_items: [{ id: 'i1', title_snapshot: '14K rope chain', price_snapshot: 1460, quantity: 1, image_snapshot: null }],
  } as unknown as InvoiceEmailOrder;
  const payment = {
    payUrl: 'https://naplesestatejewelry.com/pay/abc_DEF-123abc_DEF-123abc_DEF-12',
    payLabel: 'Pay $2,871.54 securely',
    payHint: 'PayPal or any debit / credit card · link good until Oct 28',
    taxHint: 'Shipping outside Florida? The Florida tax comes off when you enter your address.',
    otherWays: ['Zelle to (239) 304-6229 — put NEJ-20261021-K7QM2 in the memo.'],
    message: 'Margaret — here is the invoice.\nThank you!',
  };

  it('adds the message, the button, the hints and the other ways', () => {
    const content = buildInvoiceEmailContent(order, null, { payment });
    expect(content.html).toContain(`href="${payment.payUrl}"`);
    expect(content.html).toContain('Pay $2,871.54 securely');
    expect(content.html).toContain('Other ways to pay');
    expect(content.html).toContain('Zelle to <span style="white-space:nowrap;">(239) 304-6229</span>');
    expect(content.html).toContain('Margaret — here is the invoice.<br/>Thank you!<br/>— Chris');
    expect(content.text).toContain(payment.payUrl);
    expect(content.text).toContain('OTHER WAYS TO PAY');
    expect(content.intro).toBe('Here is your invoice from Naples Estate Jewelry for order NEJ-20261021-K7QM2.');
  });

  it('leaves every other invoice and receipt as it was', () => {
    const plain = buildInvoiceEmailContent(order, null);
    expect(plain.html).not.toContain('Other ways to pay');
    expect(plain.html).not.toContain('/pay/');
    const paid = buildInvoiceEmailContent({ ...order, payment_status: 'paid' } as InvoiceEmailOrder, null, { payment });
    expect(paid.html).not.toContain('/pay/');
    expect(paid.html).not.toContain('— Chris');
  });
});

describe('source guards', () => {
  it('the pay page never cancels the invoice when the PayPal window is closed', () => {
    const client = read('src', 'components', 'pay', 'PayInvoiceClient.tsx');
    expect(client).toContain('cancelOnAbandon={false}');
    expect(client).toContain('/api/pay/${encodeURIComponent(data.token)}/create-order');
    const button = read('src', 'components', 'checkout', 'PayPalCheckoutButton.tsx');
    expect(button).toContain('if (cancelOnAbandonRef.current) cancelAbandonedOrder(');
    const route = read('src', 'app', 'api', 'pay', '[token]', 'create-order', 'route.ts');
    expect(route).not.toMatch(/order_status:\s*'cancelled'/);
    // Only an unpaid order, or one whose card was declined (failed, no capture),
    // is ever restarted — never a paid or captured one (2026-10-28).
    expect(route).toContain(".in('payment_status', ['unpaid', 'failed'])");
    expect(route).toContain(".is('paypal_capture_id', null)");
    expect(route).not.toMatch(/\.in\('payment_status', \[[^\]]*'paid'/);
  });

  it('the pay page is noindex and keeps the token out of the Referer', () => {
    const page = read('src', 'app', '[locale]', 'pay', '[token]', 'page.tsx');
    expect(page).toContain('robots: { index: false, follow: false }');
    expect(page).toContain("referrer: 'no-referrer'");
  });

  it('one way to record an offline payment, shared by both sale types', () => {
    expect(read('src', 'app', 'api', 'admin', 'in-store-sales', 'route.ts')).toContain('recordOfflinePayment(');
    expect(read('src', 'app', 'api', 'admin', 'remote-sales', '[id]', 'route.ts')).toContain('recordOfflinePayment(');
    expect(read('src', 'app', 'api', 'admin', 'in-store-sales', 'route.ts')).not.toContain("rpc('capture_paypal_order'");
  });

  it('the menu says Instant Sale and the old address forwards to it', () => {
    const header = read('src', 'components', 'admin', 'AdminHeader.tsx');
    expect(header).toContain("'instant-sale': 'Instant Sale'");
    expect(header).not.toContain('In-Store Sale');
    const old = read('src', 'app', '[locale]', 'admin', 'in-store-sale', 'page.tsx');
    expect(old).toContain("redirect(locale === 'es' ? '/es/admin/instant-sale' : '/admin/instant-sale')");
    expect(existsSync(join(ROOT, 'src', 'app', '[locale]', 'admin', 'instant-sale', 'in-store', 'page.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src', 'app', '[locale]', 'admin', 'instant-sale', 'remote', 'page.tsx'))).toBe(true);
  });

  it('the invoices table is private (service role only)', () => {
    const sql = read('..', 'supabase', 'remote-sales-2026-10.sql');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on public.remote_sale_invoices from anon, authenticated');
    expect(sql).toContain('grant select, insert, update, delete on public.remote_sale_invoices to service_role');
  });
});

describe('Save draft (owner, 2026-10-21)', () => {
  const photo = 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/1729-abc.webp';

  it('cleans any stored form into one the page can load', () => {
    const form = sanitizeRemoteDraft({
      items: [
        { mode: 'listed', productId: 'halo-ring-212', price: '1150', photoUrl: photo },
        { mode: 'unlisted', title: '14K rope chain', metal: 'Platinum', price: '1460', photoUrl: 'https://evil.example/x.jpg' },
      ],
      customer: { firstName: 'Margaret', email: 'm@example.com' },
      delivery: { method: 'ship', shipping: 'drone', address: { state: 'FL' } },
      pay: { online: false, zelle: false },
      linkDays: 30,
      message: 'x'.repeat(400),
    });
    expect(form.items).toEqual([
      { mode: 'listed', productId: 'halo-ring-212', title: '', metal: 'Gold', gramWeight: '', purity: '', price: '1150', photoUrl: photo },
      { mode: 'unlisted', productId: null, title: '14K rope chain', metal: 'Gold', gramWeight: '', purity: '', price: '1460', photoUrl: null },
    ]);
    expect(form.delivery).toEqual({ method: 'ship', mailingOn: false, address: { line1: '', line2: '', city: '', state: 'FL', zip: '' }, shipping: 'insured', customFee: '' });
    // Every box off → the defaults come back (the form cannot send with none ticked).
    expect(form.pay).toEqual({ online: true, zelle: true, check: false, phone: false });
    expect(form.linkDays).toBe(7);
    expect(form.message).toHaveLength(300);
    expect(sanitizeRemoteDraft(null).items).toEqual([]);
    expect(sanitizeRemoteDraft({ items: Array.from({ length: 30 }, () => ({ mode: 'unlisted', title: 'x' })) }).items).toHaveLength(20);
  });

  it('keeps only a draft with something in it, and lists it by name and item count', () => {
    expect(remoteDraftHasContent(sanitizeRemoteDraft({}))).toBe(false);
    expect(remoteDraftHasContent(sanitizeRemoteDraft({ items: [{ mode: 'listed' }] }))).toBe(false);
    expect(remoteDraftHasContent(sanitizeRemoteDraft({ customer: { email: 'm@example.com' } }))).toBe(true);
    const form = sanitizeRemoteDraft({ customer: { firstName: ' Margaret ', lastName: 'Collins' }, items: [{ mode: 'listed', productId: 'p1' }, { mode: 'unlisted' }, { mode: 'unlisted', title: 'Chain' }] });
    expect(remoteDraftSummary(form)).toEqual({ customer_name: 'Margaret Collins', item_count: 2 });
    expect(remoteDraftSummary(sanitizeRemoteDraft({}))).toEqual({ customer_name: null, item_count: 0 });
  });

  it('names the photos a draft holds, so the Storage clean-up keeps them', () => {
    expect(remoteDraftPhotoUrls({ items: [{ photoUrl: photo }, { photoUrl: 'https://evil.example/x.jpg' }, {}] })).toEqual([photo]);
    const gc = read('src', 'app', 'api', 'admin', 'storage-gc', 'route.ts');
    expect(gc).toContain(".from('remote_sale_drafts').select('form')");
    expect(gc).toContain('remoteDraftPhotoUrls(row.form)');
  });

  it('a sent invoice replaces its draft; the drafts table is private', () => {
    expect(read('src', 'app', 'api', 'admin', 'remote-sales', 'route.ts')).toContain(".from('remote_sale_drafts').delete().eq('id', draftId)");
    expect(read('src', 'components', 'admin', 'instant-sale', 'RemoteSaleForm.tsx')).toContain('draftId,');
    const sql = read('..', 'supabase', 'remote-sales-2026-10.sql');
    expect(sql).toContain('create table if not exists public.remote_sale_drafts');
    expect(sql).toContain('revoke all on public.remote_sale_drafts from anon, authenticated');
    expect(sql).toContain('grant select, insert, update, delete on public.remote_sale_drafts to service_role');
  });
});
