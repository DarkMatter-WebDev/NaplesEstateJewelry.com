import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPaperReceipt, paperDateLine, paperReceiptDocument, type PaperReceiptOrder } from '../order-receipt-paper';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '../order-invoice-email';

// The one-page paper receipt + the in-store email fixes (owner, 2026-10-21).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ring = { inventory_number: '212', title_snapshot: '14K Sapphire & Diamond Halo Ring', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 3.1, price_snapshot: 1150, quantity: 1, discount: 0, image_snapshot: 'https://x.supabase.co/storage/v1/object/public/product-images/products/r.webp' };
const chain = { inventory_number: null, title_snapshot: '14K rope chain', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 18.4, price_snapshot: 1460, quantity: 1, discount: 0, image_snapshot: null };

const inStore: PaperReceiptOrder = {
  order_number: 'NEJ-20261021-AB12C', customer_name: 'Jane Rivera', customer_email: 'jane.r@example.com', customer_phone: '(239) 555-0134',
  subtotal: 2610, tax: 156.6, shipping_fee: 0, discount: 0, total: 2766.6,
  payment_status: 'paid', fulfillment_status: 'picked_up', payment_method: 'in_store_zettle', shipping_method: 'pickup', shipping_address: null,
  created_at: '2026-10-21T19:42:00Z', // 3:42 PM in Naples
  order_items: [ring, chain] as PaperReceiptOrder['order_items'],
};

describe('buildPaperReceipt', () => {
  it('prints an in-store sale as a RECEIPT with the date, how it was paid and the items', () => {
    const { body, title } = buildPaperReceipt(inStore, { hoursLine: 'Mon–Fri 11am–3pm, or by appointment' });
    expect(title).toBe('Receipt NEJ-20261021-AB12C');
    expect(body).toContain('>RECEIPT<');
    expect(body).toContain('PAID IN FULL');
    expect(body).toContain('October 21, 2026 · 3:42 PM');
    expect(body).toContain('In store · Card · Zettle');
    expect(body).toContain('Picked up in store');
    expect(body).toContain('#212 · Gold · 14K · 3.1 g');
    expect(body).toContain('Gold · 14K · 18.4 g');
    expect(body).not.toMatch(/No inventory/);
    expect(body).toContain('Subtotal · 2 items');
    expect(body).toContain('Total paid');
    expect(body).not.toContain('Shipping');
    expect(body).toContain('Showroom: Mon–Fri 11am–3pm, or by appointment');
    expect(body).toContain('<img src="https://x.supabase.co/storage/v1/object/public/product-images/products/r.webp"');
  });

  it('prints an unpaid order as an INVOICE with the amount due', () => {
    const { body } = buildPaperReceipt({ ...inStore, payment_status: 'unpaid', fulfillment_status: 'pending', payment_method: 'invoice' }, { invoiceNumber: 'INV-20261021-AB12C' });
    expect(body).toContain('>INVOICE<');
    expect(body).toContain('UNPAID');
    expect(body).toContain('INV-20261021-AB12C');
    expect(body).toContain('Bill to');
    expect(body).toContain('Not paid yet');
    expect(body).toContain('Total due');
    expect(body).toContain('Pickup at the showroom');
  });

  it('shows the ship-to address, shipping, discounts and quantities', () => {
    const { body } = buildPaperReceipt({
      ...inStore,
      shipping_method: 'shipping', fulfillment_status: 'pending', shipping_fee: 99, discount: 50,
      shipping_address: { line1: '2840 Peachtree Rd NW', city: 'Atlanta', state: 'GA', postal_code: '30305' },
      order_items: [{ ...ring, quantity: 2, discount: 100 }] as PaperReceiptOrder['order_items'],
    });
    expect(body).toContain('Ship to</div>2840 Peachtree Rd NW<br>Atlanta, GA 30305');
    expect(body).toContain('<span>Shipping</span>');
    expect(body).toContain('<span>Discount</span>');
    expect(body).toContain('Qty 2 × $1,150.00');
    expect(body).toContain('<s>$2,300.00</s>$2,200.00');
    expect(body).toContain('Subtotal · 2 items');
  });

  it('escapes what was typed, keeps every style under .nej-paper and prints on letter paper', () => {
    const { body, css } = buildPaperReceipt({ ...inStore, customer_name: '<script>x</script>', order_items: [{ ...chain, title_snapshot: 'A & B <b>' }] as PaperReceiptOrder['order_items'] });
    expect(body).not.toContain('<script>');
    expect(body).toContain('A &amp; B &lt;b&gt;');
    for (const rule of css.split('\n')) expect(rule.startsWith('.nej-paper')).toBe(true);
    const doc = paperReceiptDocument(buildPaperReceipt(inStore));
    expect(doc).toContain('@page{size:letter;margin:0.5in}');
    expect(paperDateLine('nonsense')).toBe('');
  });
});

describe('the in-store receipt email (2026-10-21)', () => {
  const emailOrder = (extra: Record<string, unknown>) => ({
    id: 'o1', ...inStore, order_status: 'completed', order_items: [ring, chain], ...extra,
  }) as unknown as InvoiceEmailOrder;

  it('says how and when it was paid, and drops shipping and the pickup block for a piece carried out', () => {
    const c = buildInvoiceEmailContent(emailOrder({}), null, { pickupHours: 'Mon–Fri' });
    expect(c.note).toBe('Paid in full by Card · Zettle on October 21, 2026 — thank you.');
    expect(c.pickup).toBeNull();
    expect(c.html).not.toContain('Shipping method:');
    expect(c.html).not.toContain('>Shipping<');
    expect(c.text).not.toContain('Shipping:');
    expect(c.html).not.toContain('No inventory');
    expect(c.text).toContain('- 14K rope chain - $1,460.00');
    expect(c.contactNote).toBe('Call or text us at (239) 404-8505 with any questions.');
  });

  it('keeps shipping on a SHIPPED in-store sale, and leaves web orders as they were', () => {
    const shipped = buildInvoiceEmailContent(emailOrder({ shipping_method: 'shipping', shipping_fee: 99 }), null);
    expect(shipped.html).toContain('Shipping method:');
    expect(shipped.html).toContain('>Shipping<');
    const web = buildInvoiceEmailContent(emailOrder({ payment_method: 'paypal', fulfillment_status: 'pending' }), null, { pickupHours: 'Mon–Fri' });
    expect(web.note).toBe('Your payment has been received in full — thank you.');
    expect(web.pickup).not.toBeNull();
    expect(web.html).toContain('Shipping method:');
  });
});

describe('print wiring', () => {
  it('Print Invoice and Record & print use the paper, printed in a frame (no pop-up)', () => {
    const page = read('src', 'app', '[locale]', 'admin', 'orders', '[id]', 'invoice', 'page.tsx');
    expect(page).toContain('buildPaperReceipt(');
    expect(page).not.toContain('buildInvoiceEmailContent(');
    const client = read('src', 'app', '[locale]', 'admin', 'orders', '[id]', 'invoice', 'PrintInvoiceClient.tsx');
    expect(client).toContain('printPaperInFrame(');
    expect(client).not.toContain('window.open');
    const form = read('src', 'components', 'admin', 'InStoreSaleForm.tsx');
    expect(form).toContain('Record &amp; print receipt'.replace('&amp;', '&'));
    expect(form).toContain('printPaperInFrame(');
    expect(read('src', 'app', 'api', 'admin', 'in-store-sales', 'route.ts')).toContain('loadPaperReceipt(service, orderId)');
  });
});

describe('no photo, no box (owner, 2026-10-21)', () => {
  it('the paper shows a photo only where one was added, and drops the column when none was', () => {
    const mixed = buildPaperReceipt(inStore).body;
    expect(mixed.match(/<img src="https:/g)?.length).toBe(1);
    expect(mixed).toContain('<td class="ph"></td>');
    expect(mixed).not.toContain('noimg');
    const none = buildPaperReceipt({ ...inStore, order_items: [chain] as PaperReceiptOrder['order_items'] }).body;
    expect(none).not.toContain('class="ph"');
    expect(none).toContain('<thead><tr><th></th><th>Item</th>');
  });

  it('the email draws no box for a row without a picture, but keeps its space so the titles line up', () => {
    const c = buildInvoiceEmailContent({ id: 'o1', ...inStore, order_status: 'completed', order_items: [ring, chain] } as unknown as InvoiceEmailOrder, null);
    expect(c.html.match(/<img src="https:\/\/x\.supabase\.co/g)?.length).toBe(1);
    expect(c.html).not.toContain('width:58px;height:58px;border:1px solid #eadfbd;background:#fbfaf5;"></div>');
    // Both rows carry the 72 px photo cell (owner, 2026-10-21: a flush-left row was confusing on a phone).
    expect(c.html.match(/<td width="72" valign="top"/g)?.length).toBe(2);
    const none = buildInvoiceEmailContent({ id: 'o1', ...inStore, order_status: 'completed', order_items: [chain] } as unknown as InvoiceEmailOrder, null);
    expect(none.html).not.toContain('<td width="72"');
  });
});
