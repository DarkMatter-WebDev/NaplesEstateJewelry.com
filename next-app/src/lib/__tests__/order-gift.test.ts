import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  GIFT_MESSAGE_MAX,
  giftNotesFallback,
  giftReceiptNote,
  giftReceivedLine,
  normalizeGift,
} from '@/lib/order-gift';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '@/lib/order-invoice-email';

describe('normalizeGift', () => {
  it('is no gift unless the box was ticked', () => {
    expect(normalizeGift(null, true)).toEqual({ gift: null });
    expect(normalizeGift({ isGift: false, recipientFirst: 'Mary', recipientLast: 'Smith' }, true)).toEqual({ gift: null });
    expect(normalizeGift({ isGift: 'true' }, true)).toEqual({ gift: null });
  });

  it('a shipped gift needs the recipient’s first and last name', () => {
    expect(normalizeGift({ isGift: true, recipientFirst: 'Mary', recipientLast: '' }, true)).toHaveProperty('error');
    expect(normalizeGift({ isGift: true, recipientFirst: '  Mary ', recipientLast: ' Smith ', message: ' Happy anniversary! ' }, true))
      .toEqual({ gift: { recipientName: 'Mary Smith', message: 'Happy anniversary!' } });
  });

  it('a pickup gift carries a message only', () => {
    expect(normalizeGift({ isGift: true, recipientFirst: 'Mary', recipientLast: 'Smith', message: 'For you' }, false))
      .toEqual({ gift: { recipientName: null, message: 'For you' } });
    expect(normalizeGift({ isGift: true, message: '   ' }, false)).toEqual({ gift: { recipientName: null, message: null } });
  });

  it('caps the message and keeps line breaks tidy', () => {
    const result = normalizeGift({ isGift: true, message: `Line one\r\n\r\n\r\n\r\nLine two  ${'x'.repeat(400)}` }, false);
    if (!('gift' in result) || !result.gift) throw new Error('expected a gift');
    expect(result.gift.message!.length).toBeLessThanOrEqual(GIFT_MESSAGE_MAX);
    expect(result.gift.message!.startsWith('Line one\n\nLine two x')).toBe(true);
  });
});

describe('gift wording', () => {
  const gift = { recipientName: 'Mary Smith', message: 'Happy anniversary!' };

  it('keeps the gift on the order when the columns are missing', () => {
    expect(giftNotesFallback(gift, null)).toBe('🎁 GIFT for Mary Smith — message: “Happy anniversary!” — print a gift slip, no prices in the box.');
    expect(giftNotesFallback({ recipientName: null, message: null }, 'Leave at door')).toBe('🎁 GIFT — print a gift slip, no prices in the box.\n\nLeave at door');
  });

  it('tells the buyer and the Order Received screen who it goes to', () => {
    expect(giftReceiptNote(gift)).toContain('A gift for Mary Smith. Your message: “Happy anniversary!”.');
    expect(giftReceivedLine(gift, false)).toContain('Gift for Mary Smith');
    expect(giftReceivedLine({ recipientName: null, message: null }, true)).toContain('sin precios');
  });

  it('puts the gift line on the buyer’s paid receipt email', () => {
    const order = {
      id: 'o1', order_number: 'NEJ-1', customer_name: 'Jane Doe', customer_email: 'j@example.com',
      subtotal: 100, tax: 6, shipping_fee: 0, discount: 0, total: 106,
      payment_status: 'paid', fulfillment_status: 'pending', order_status: 'open',
      payment_method: 'paypal', shipping_method: 'shipping', shipping_address: null,
      created_at: '2026-10-29T12:00:00Z', order_items: [],
    } as unknown as InvoiceEmailOrder;
    const content = buildInvoiceEmailContent(order, null, { gift });
    expect(content.note).toContain('A gift for Mary Smith');
    expect(content.text).toContain('A gift for Mary Smith');
    expect(buildInvoiceEmailContent(order, null).note).not.toContain('gift');
  });
});

describe('gift slip', () => {
  it('never loads or prints a price or the buyer’s contact details', () => {
    for (const file of ['page.tsx', 'GiftSlipClient.tsx']) {
      const source = readFileSync(
        path.join(process.cwd(), 'src/app/[locale]/admin/orders/[id]/gift-slip', file),
        'utf8',
      );
      expect(source).not.toMatch(/price_snapshot|subtotal|\btotal\b|formatCurrency|customer_email|customer_phone|shipping_address/);
    }
  });
});
