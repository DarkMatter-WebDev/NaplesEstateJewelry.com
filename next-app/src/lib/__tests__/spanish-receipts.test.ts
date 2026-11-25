import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  metalIn,
  normalizeOrderLanguage,
  orderDateTimeLine,
  paidByLinesIn,
  paymentMethodLabelIn,
  printLanguage,
  spanishExpectedDay,
  spanishScanDate,
  tradeInReceiptLineEs,
} from '@/lib/order-language';
import { buildPaperReceipt, type PaperReceiptOrder } from '@/lib/order-receipt-paper';
import { buildInvoiceEmailContent, formatPickupHours, type InvoiceEmailOrder } from '@/lib/order-invoice-email';
import { buildDeliveryUpdateEmailContent, buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';
import { buildPickupPaper, PICKUP_STATEMENT, PICKUP_STATEMENT_ES, type OrderPickupRow, type PickupPaperOrder } from '@/lib/order-pickup';
import { buildPickupEmail } from '@/lib/order-pickup-email';
import { remoteOtherWays, remotePayUrl } from '@/lib/remote-sale';
import { DEFAULT_STORE_HOURS } from '@/lib/business-location';

// Spanish receipts (owner, 2026-11-21, mockup 1: "Yes, build it" — all six picks).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const LISTED_ID = '6b1f0c1e-1111-4f5b-9c33-1d2e3f4a5b6c';
const credit = { method: 'trade_credit', amount: 900, reference: 'BUY-00142' };
const trade = { buy_receipt_id: 'r1', receipt_number: 'BUY-00142', description: '14K scrap · 18.2 g', value: 900 };

const sale: PaperReceiptOrder = {
  order_number: 'NEJ-20261121-7KQ2M', customer_name: 'María Alvarez', customer_email: 'maria@example.com', customer_phone: '(239) 555-0134',
  subtotal: 2650, tax: 159, shipping_fee: 0, discount: 0, total: 2809,
  payment_status: 'paid', fulfillment_status: 'picked_up', payment_method: 'in_store_split', shipping_method: 'pickup', shipping_address: null,
  created_at: '2026-11-21T19:42:00Z', // 2:42 PM in Naples
  split_payments: [credit, { method: 'zettle', amount: 1909 }], trade_in: trade,
  order_items: [
    { product_id: LISTED_ID, inventory_number: '1043', title_snapshot: '18K Diamond Solitaire Ring', item_year_snapshot: null, metal_snapshot: 'Yellow Gold', purity_snapshot: '18K', gram_weight_snapshot: 3.1, price_snapshot: 2500, quantity: 1, discount: 0, image_snapshot: null },
    { product_id: null, inventory_number: null, title_snapshot: '14K rope chain', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 2, price_snapshot: 150, quantity: 1, discount: 0, image_snapshot: null },
  ] as PaperReceiptOrder['order_items'],
};
const titles = new Map([[LISTED_ID, 'Anillo solitario de diamante en oro de 18K']]);

describe('the language value', () => {
  it('anything but exactly "es" is English — older orders print as before (pick 4)', () => {
    expect(normalizeOrderLanguage('es')).toBe('es');
    for (const value of ['en', 'ES', '', null, undefined, 'fr']) expect(normalizeOrderLanguage(value)).toBe('en');
  });
  it('a print page follows ?lang=, else the order', () => {
    expect(printLanguage('es', 'en')).toBe('es');
    expect(printLanguage('en', 'es')).toBe('en');
    expect(printLanguage(undefined, 'es')).toBe('es');
    expect(printLanguage('xx', 'en')).toBe('en');
  });
});

describe('Spanish words', () => {
  it('dates are built by hand, in Naples time', () => {
    expect(orderDateTimeLine('2026-11-21T19:42:00Z', 'es')).toBe('21 de noviembre de 2026 · 2:42 p. m.');
    expect(orderDateTimeLine('2026-11-21T14:05:00Z', 'es')).toBe('21 de noviembre de 2026 · 9:05 a. m.');
    expect(orderDateTimeLine('2026-11-21T19:42:00Z', 'en')).toMatch(/^November 21, 2026 · 2:42\sPM$/);
    expect(spanishExpectedDay('2026-11-24')).toBe('martes, 24 de noviembre');
    expect(spanishScanDate('Thu, Nov 12')).toBe('jueves, 12 de noviembre');
    expect(spanishScanDate('whatever')).toBe('whatever');
  });
  it('how it was paid', () => {
    expect(paidByLinesIn(sale, 'es')).toEqual(['En tienda · Crédito por intercambio · BUY-00142 $900.00', 'En tienda · Tarjeta · Zettle $1,909.00']);
    expect(paidByLinesIn(sale, 'en')).toEqual(['In store · Trade-in credit · BUY-00142 $900.00', 'In store · Card · Zettle $1,909.00']);
    expect(paymentMethodLabelIn('in_store_cash', 'es')).toBe('En tienda · Efectivo');
    expect(paymentMethodLabelIn('remote_zelle', 'es')).toBe('Factura · Zelle');
    expect(paymentMethodLabelIn('paypal', 'es')).toBe('PayPal');
  });
  it('metals translate; anything unknown prints as stored', () => {
    expect(metalIn('Yellow Gold', 'es')).toBe('Oro amarillo');
    expect(metalIn('Gold', 'es')).toBe('Oro');
    expect(metalIn('Unobtainium', 'es')).toBe('Unobtainium');
    expect(metalIn('Gold', 'en')).toBe('Gold');
  });
  it('the trade-in line keeps what was typed', () => {
    expect(tradeInReceiptLineEs(trade)).toBe('Su intercambio: 14K scrap · 18.2 g (recibo BUY-00142, $900.00).');
  });
});

describe('the one-page paper', () => {
  it('English is byte-for-byte what it was (no language = English)', () => {
    expect(buildPaperReceipt(sale, { hoursLine: 'x' })).toEqual(buildPaperReceipt(sale, { hoursLine: 'x', language: 'en', spanishTitles: titles }));
  });
  it('Spanish: every word the site prints; a listed piece uses its Spanish title; typed text as typed', () => {
    const { body, title } = buildPaperReceipt(sale, { hoursLine: 'lun–sáb 10–4', language: 'es', spanishTitles: titles });
    expect(title).toBe('Recibo NEJ-20261121-7KQ2M');
    for (const text of ['RECIBO', 'PAGADO', 'Pedido NEJ-20261121-7KQ2M', '21 de noviembre de 2026 · 2:42 p. m.', 'Vendido a', 'Forma de pago', 'Entrega', 'Recogido en la tienda',
      'Artículo', 'Precio', 'Subtotal · 2 artículos', 'Impuesto de ventas de FL · 6%', 'Total pagado', 'Su intercambio:', '¡Gracias!', '/es/order-lookup', 'Salón: lun–sáb 10–4',
      'Anillo solitario de diamante en oro de 18K', '14K rope chain', 'Oro amarillo']) {
      expect(body, text).toContain(text);
    }
    for (const text of ['RECEIPT', 'Sold to', 'Paid by', 'Total paid', 'Thank you', '18K Diamond Solitaire Ring']) expect(body, text).not.toContain(text);
  });
});

describe('the receipt email', () => {
  const order = { id: 'o1', ...sale, order_status: 'completed' } as unknown as InvoiceEmailOrder;
  it('English is unchanged', () => {
    expect(buildInvoiceEmailContent(order, null)).toEqual(buildInvoiceEmailContent(order, null, { language: 'en' }));
  });
  it('Spanish subject, greeting, note, footer', () => {
    const email = buildInvoiceEmailContent(order, null, { language: 'es', spanishTitles: titles });
    expect(email.subject).toBe('Recibo del pedido NEJ-20261121-7KQ2M de Naples Estate Jewelry');
    expect(email.greeting).toBe('Hola, María Alvarez:');
    expect(email.note).toBe('Pagado en su totalidad con Crédito por intercambio · BUY-00142 $900.00 y Tarjeta · Zettle $1,909.00 el 21 de noviembre de 2026. ¡Gracias! Su intercambio: 14K scrap · 18.2 g (recibo BUY-00142, $900.00).');
    expect(email.items[0].title).toBe('Anillo solitario de diamante en oro de 18K');
    expect(email.html).toContain('Pagado en su totalidad');
    expect(email.html).toContain('/es/order-lookup');
    expect(email.text).toContain('PAGO RECIBIDO');
    expect(email.text).not.toContain('Thank you');
  });
  it('a Spanish web pickup order gets the pickup block in Spanish', () => {
    const web = { ...order, payment_method: 'paypal', fulfillment_status: 'pending' } as unknown as InvoiceEmailOrder;
    const email = buildInvoiceEmailContent(web, null, { language: 'es', pickupHours: formatPickupHours(DEFAULT_STORE_HOURS, 'es') });
    expect(email.pickup?.label).toBe('Lugar de recogida');
    expect(email.pickup?.hoursLabel).toBe('Horario');
    expect(email.pickup?.byAppointment).toBe('o con cita');
    expect(email.note).toBe('Recibimos su pago completo. ¡Gracias! Su intercambio: 14K scrap · 18.2 g (recibo BUY-00142, $900.00).');
  });
});

describe('fulfillment and delivery emails', () => {
  const shipped = { order_number: 'NEJ-1', customer_name: 'María', shipping_carrier: 'USPS', tracking_number: '9405511206200000000000' };
  it('English is unchanged', () => {
    expect(buildFulfillmentUpdateEmailContent(shipped, 'shipped', { deliveryUpdates: true })).toEqual(buildFulfillmentUpdateEmailContent(shipped, 'shipped', { deliveryUpdates: true, language: 'en' }));
    const scan = { when: { date: 'Thu, Nov 12', time: '2:14 PM' }, place: 'Naples, FL 34102', where: 'Front door' };
    expect(buildDeliveryUpdateEmailContent(shipped, 'delivered', scan)).toEqual(buildDeliveryUpdateEmailContent(shipped, 'delivered', scan, 'en'));
  });
  it('Spanish subjects and words', () => {
    expect(buildFulfillmentUpdateEmailContent(shipped, 'picked_up', { language: 'es' }).subject).toBe('Novedades de su pedido NEJ-1 de Naples Estate Jewelry');
    const ship = buildFulfillmentUpdateEmailContent(shipped, 'shipped', { deliveryUpdates: true, language: 'es' });
    expect(ship.subject).toBe('Su pedido NEJ-1 fue enviado');
    expect(ship.html).toContain('Rastrear su paquete');
    expect(ship.html).toContain('Número de rastreo');
    const scan = { when: { date: 'Thu, Nov 12', time: '2:14 PM' }, place: 'Naples, FL 34102', where: 'Front door' };
    const delivered = buildDeliveryUpdateEmailContent(shipped, 'delivered', scan, 'es');
    expect(delivered.subject).toBe('Su pedido NEJ-1 fue entregado');
    expect(delivered.text).toContain('Entregado: jueves, 12 de noviembre · 2:14 p. m.');
    expect(delivered.html).toContain('Déjenos una reseña');
    const expected = buildDeliveryUpdateEmailContent(shipped, 'expected_delivery', { when: null, place: null, where: null, expectedDate: '2026-11-24' }, 'es');
    expect(expected.subject).toBe('Su pedido NEJ-1 llegará el martes, 24 de noviembre');
    expect(buildDeliveryUpdateEmailContent(shipped, 'out_for_delivery', scan, 'es').subject).toBe('Su pedido NEJ-1 salió a reparto');
  });
});

describe('pickup paper and email', () => {
  const order: PickupPaperOrder = {
    order_number: 'NEJ-2', customer_name: 'María Alvarez', customer_email: 'maria@example.com', customer_phone: '(239) 555-0134', created_at: '2026-11-18T20:05:00Z',
    order_items: [{ inventory_number: '1043', title_snapshot: '14K band', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 4.2, quantity: 1, image_snapshot: null }],
  };
  const row = {
    order_id: '0b9d2f1e-6c1a-4f5b-9c33-1d2e3f4a5b6c', picked_up_by: 'María Alvarez', picked_up_by_buyer: true, id_type: 'Driver license', id_last4: '4821', id_photo_path: null,
    sign_method: 'paper', signature_path: null, signed_name: null, signed_at: null, picked_up_at: '2026-11-21T19:14:00Z', emailed_at: null, emailed_to: null,
    logged_by_email: null, updated_by_email: null, created_at: '2026-11-21T19:14:00Z', updated_at: '2026-11-21T19:14:00Z',
  } as unknown as OrderPickupRow;
  it('Spanish order: the customer copy in Spanish; the store copy English + the Spanish statement under it', () => {
    const [store, customer] = buildPickupPaper(order, row, { language: 'es', hoursLineEs: 'x' }).body.split('<div class="nej-pickup-sheet">').slice(1);
    expect(customer).toContain('COPIA DEL CLIENTE');
    expect(customer).toContain('RECOGIDA');
    expect(customer).toContain(PICKUP_STATEMENT_ES.slice(0, 40));
    expect(customer).not.toContain(PICKUP_STATEMENT.slice(0, 40));
    expect(customer).toContain('/es/returns-refunds');
    expect(store).toContain('STORE COPY');
    expect(store).toContain(PICKUP_STATEMENT.slice(0, 40));
    expect(store).toContain(PICKUP_STATEMENT_ES.slice(0, 40));
    expect(store).toContain('ID shown at pickup');
  });
  it('English orders print as before', () => {
    expect(buildPickupPaper(order, row, {})).toEqual(buildPickupPaper(order, row, { language: 'en', hoursLineEs: 'x' }));
    expect(buildPickupEmail(order, row)).toEqual(buildPickupEmail(order, row, 'en'));
  });
  it('the Spanish pickup email', () => {
    const email = buildPickupEmail(order, row, 'es');
    expect(email.subject).toBe('Su recibo de recogida — Pedido NEJ-2');
    expect(email.text).toContain('Devoluciones:');
    expect(email.html).not.toContain('4821');
  });
});

describe('remote sale invoice', () => {
  it('a Spanish invoice links to the Spanish pay page, with Spanish ways to pay', () => {
    expect(remotePayUrl('https://x.com/', 'tok')).toBe('https://x.com/pay/tok');
    expect(remotePayUrl('https://x.com/', 'tok', true)).toBe('https://x.com/es/pay/tok');
    expect(remoteOtherWays({ online: false, zelle: true, check: false, phone: true }, 'NEJ-3', true)[0]).toMatch(/^Zelle a .+: escriba NEJ-3 en la nota\.$/);
  });
});

describe('where the language is set and read', () => {
  it('website checkout sends the page locale and both create-order paths save it', () => {
    expect(read('src', 'components', 'checkout', 'CheckoutClient.tsx')).toContain("locale: isEs ? 'es' : 'en',");
    const route = read('src', 'app', 'api', 'paypal', 'create-order', 'route.ts');
    expect(route.match(/saveOrderLanguage\(service, (order\.id|orderId), normalizeOrderLanguage\(body\.locale\)\)/g)?.length).toBe(2);
    expect(read('src', 'app', 'api', 'pay', '[token]', 'create-order', 'route.ts')).toContain("saveOrderLanguage(service, order.id, isEs ? 'es' : 'en')");
    expect(read('src', 'lib', 'offers-server.ts')).toContain("saveOrderLanguage(service, orderId, offer.locale === 'es' ? 'es' : 'en')");
  });
  it('the counter forms send it, and the trade follows the buy receipt', () => {
    for (const file of ['in-store-sales', 'remote-sales']) {
      expect(read('src', 'app', 'api', 'admin', file, 'route.ts'), file).toContain('normalizeOrderLanguage((body as Record<string, unknown> | null)?.receiptLanguage)');
    }
    expect(read('src', 'app', 'api', 'admin', 'trade-in-sales', 'route.ts')).toContain('normalizeOrderLanguage(receipt.seller_language)');
  });
  it('the column is read on its own query, so a missing column never breaks a receipt', () => {
    const server = read('src', 'lib', 'order-language-server.ts');
    expect(server).toContain(".select('customer_language').eq('id', orderId)");
    for (const file of ['src/lib/order-receipt-paper-server.ts', 'src/lib/order-invoice-mailer.ts', 'src/app/[locale]/admin/orders/[id]/invoice/page.tsx']) {
      expect(read(file), file).not.toContain("'customer_language'");
    }
  });
  it('every customer email sender reads the order language', () => {
    for (const file of [
      'src/lib/order-invoice-mailer.ts',
      'src/app/api/admin/orders/[id]/email-update/route.ts',
      'src/lib/order-tracking-server.ts',
      'src/lib/order-pickup-server.ts',
      'src/lib/remote-sale-server.ts',
    ]) {
      expect(read(file), file).toContain('loadOrderLanguage(');
    }
  });
});
