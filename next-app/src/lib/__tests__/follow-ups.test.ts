import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buyerReadiness,
  computeSendAt,
  DEFAULT_FOLLOW_UP_SETTINGS,
  DEFAULT_FOLLOW_UP_TEMPLATES,
  findUnknownToken,
  firstNameOf,
  formatFollowUpTime,
  itemPhrase,
  nextMorningAfter,
  nextSlotAtOrAfter,
  relativeDayWord,
  renderFollowUp,
  settingsFromRow,
  settingsPatchToRow,
  step2SendAt,
  templateFor,
  thankedRecently,
  type BuyerOrderState,
  type FollowUpRenderInput,
  type FollowUpTemplateKey,
} from '@/lib/follow-ups';

// Eastern time in November 2026 is EST (UTC−5) after Sun Nov 1.
const et = (local: string) => new Date(`${local}-05:00`);
const etDst = (local: string) => new Date(`${local}-04:00`);

describe('send times (Naples time)', () => {
  it('next morning = 10 AM the day after the visit', () => {
    // Tue Nov 24, 2:40 PM → Wed Nov 25, 10:00 AM
    expect(nextMorningAfter(et('2026-11-24T14:40:00')).toISOString()).toBe(et('2026-11-25T10:00:00').toISOString());
    // a 9 PM visit still goes the next morning
    expect(nextMorningAfter(et('2026-11-24T21:00:00')).toISOString()).toBe(et('2026-11-25T10:00:00').toISOString());
  });

  it('a Saturday visit goes Monday (no Sunday emails)', () => {
    expect(nextMorningAfter(et('2026-11-28T15:00:00')).toISOString()).toBe(et('2026-11-30T10:00:00').toISOString());
  });

  it('crosses the end of daylight time correctly (Sat Oct 31 → Mon Nov 2, 10 AM EST)', () => {
    expect(nextMorningAfter(etDst('2026-10-31T12:00:00')).toISOString()).toBe('2026-11-02T15:00:00.000Z');
  });

  it('next slot: before 10 → today 10; after 10 → tomorrow; Sunday → Monday', () => {
    expect(nextSlotAtOrAfter(et('2026-11-24T08:15:00')).toISOString()).toBe(et('2026-11-24T10:00:00').toISOString());
    expect(nextSlotAtOrAfter(et('2026-11-24T10:00:00')).toISOString()).toBe(et('2026-11-24T10:00:00').toISOString());
    expect(nextSlotAtOrAfter(et('2026-11-24T10:01:00')).toISOString()).toBe(et('2026-11-25T10:00:00').toISOString());
    expect(nextSlotAtOrAfter(et('2026-11-29T08:00:00')).toISOString()).toBe(et('2026-11-30T10:00:00').toISOString());
  });

  it('a time already past (found late / backfill) becomes the next 10 AM — never a 9 PM burst', () => {
    const now = et('2026-11-24T21:05:00');
    // receipt from 3 days ago: its "next morning" is long past
    expect(computeSendAt(et('2026-11-21T13:00:00'), 'next_morning', now).toISOString()).toBe(et('2026-11-25T10:00:00').toISOString());
  });

  it('hour delays that land at night or on a Sunday move to the next 10 AM', () => {
    const now = et('2026-11-24T21:00:00');
    // 24 h after Tue 9 PM = Wed 9 PM → Thu 10 AM
    expect(computeSendAt(now, '24h', now).toISOString()).toBe(et('2026-11-26T10:00:00').toISOString());
    // 24 h after Tue 2 PM = Wed 2 PM (inside hours) → as is
    expect(computeSendAt(et('2026-11-24T14:00:00'), '24h', et('2026-11-24T14:00:00')).toISOString()).toBe(et('2026-11-25T14:00:00').toISOString());
    // 24 h after Sat 2 PM = Sun 2 PM → Mon 10 AM
    expect(computeSendAt(et('2026-11-28T14:00:00'), '24h', et('2026-11-28T14:00:00')).toISOString()).toBe(et('2026-11-30T10:00:00').toISOString());
  });

  it('step 2: sellers ~6 months, buyers 30 days after the thank-you, at a 10 AM', () => {
    const sent = et('2026-11-25T10:00:00');
    const buyer = step2SendAt(sent, 'buyer');
    expect(buyer.toISOString()).toBe(et('2026-12-25T10:00:00').toISOString());
    const seller = step2SendAt(sent, 'seller');
    expect(seller.getTime() - sent.getTime()).toBeGreaterThanOrEqual(182 * 86_400_000);
    expect(seller.getTime() - sent.getTime()).toBeLessThan(185 * 86_400_000);
  });

  it('formats times in Naples time', () => {
    expect(formatFollowUpTime(et('2026-11-25T10:00:00'))).toMatch(/^Wed Nov 25(, 2026)?, 10:00 AM$/);
  });
});

describe('the words', () => {
  it('relative day: today / yesterday / on Monday / recently (and Spanish)', () => {
    const send = et('2026-11-25T10:00:00');
    expect(relativeDayWord(et('2026-11-25T09:00:00'), send, 'en')).toBe('today');
    expect(relativeDayWord(et('2026-11-24T16:00:00'), send, 'en')).toBe('yesterday');
    expect(relativeDayWord(et('2026-11-23T16:00:00'), send, 'en')).toBe('on Monday');
    expect(relativeDayWord(et('2026-11-10T16:00:00'), send, 'en')).toBe('recently');
    expect(relativeDayWord(et('2026-11-24T16:00:00'), send, 'es')).toBe('ayer');
    expect(relativeDayWord(et('2026-11-23T16:00:00'), send, 'es')).toBe('el lunes');
    expect(relativeDayWord(null, send, 'en')).toBe('recently');
  });

  it('first names: ID-read capitals become normal; mixed case is kept', () => {
    expect(firstNameOf('MARGARET ELLISON')).toBe('Margaret');
    expect(firstNameOf("mary-ann o'neil")).toBe('Mary-Ann');
    expect(firstNameOf('DeShawn Smith')).toBe('DeShawn');
    expect(firstNameOf('  ')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it('item phrase', () => {
    expect(itemPhrase(['14K rope chain, 20"'], 'en')).toBe('14K rope chain, 20"');
    expect(itemPhrase(['14K rope chain', 'Ring', 'Pin'], 'en')).toBe('14K rope chain and 2 more pieces');
    expect(itemPhrase(['Anillo', 'Broche'], 'es')).toBe('Anillo y 1 pieza más');
    expect(itemPhrase([], 'en')).toBe('piece');
  });
});

const baseInput: FollowUpRenderInput = {
  audience: 'seller',
  language: 'en',
  name: 'MARGARET ELLISON',
  eventAt: et('2026-11-24T14:40:00'),
  sendAt: et('2026-11-25T10:00:00'),
  item: null,
  phone: '(239) 404-8505',
  reviewUrl: 'https://naplesestatejewelry.com/review?f=11111111-2222-3333-4444-555555555555',
  unsubscribeUrl: 'https://naplesestatejewelry.com/unsubscribe?email=m%40example.com',
  businessName: 'Naples Estate Jewelry',
  mailingAddress: '6240 Shirley St, Ste 104, Naples, FL 34109',
};

describe('renderFollowUp (style A)', () => {
  it('fills the seller thank-you', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], baseInput);
    expect(out.subject).toBe('Thank you, Margaret');
    expect(out.text).toContain('Hi Margaret,');
    expect(out.text).toContain('Thank you for coming in yesterday');
    expect(out.text).toContain('share your experience on Google (https://naplesestatejewelry.com/review?f=11111111-2222-3333-4444-555555555555)');
    expect(out.html).toContain('href="https://naplesestatejewelry.com/review?f=11111111-2222-3333-4444-555555555555"');
    expect(out.html).toContain('>share your experience on Google</a>');
    expect(out.html).toContain('Unsubscribe</a>');
    expect(out.html).toContain("You&#039;re receiving this because you sold to us.");
    expect(out.html).toContain('6240 Shirley St');
  });

  it('with no name: "Hi there," and a subject without a dangling comma', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['buyer-1-en'], { ...baseInput, audience: 'buyer', name: null, item: '14K rope chain' });
    expect(out.subject).toBe('Thank you — I hope you love it');
    expect(out.text).toContain('Hi there,');
    expect(out.text).toContain('Thank you for buying your 14K rope chain from us.');
    expect(out.html).toContain('because you bought from us');
  });

  it('Spanish with no name: "Hola:" and "Gracias"', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-es'], { ...baseInput, language: 'es', name: '' });
    expect(out.subject).toBe('Gracias');
    expect(out.text.startsWith('Hola:')).toBe(true);
    expect(out.text).toContain('Gracias por visitarnos ayer');
    expect(out.html).toContain('compartir su experiencia en Google</a>');
    expect(out.html).toContain('Cancelar suscripción');
  });

  it('escapes what people typed (names, items) — never raw HTML', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['buyer-1-en'], { ...baseInput, audience: 'buyer', name: '<b>Eve</b>', item: '<img src=x onerror=alert(1)>' });
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out.html).not.toContain('<b>Eve');
  });

  it('the signature line renders as the serif "Chris"', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], baseInput);
    expect(out.html).toMatch(/Thank you again,<br \/><span style="font-family:Georgia[^"]*">Chris<\/span>/);
  });
});

describe("Google's review policy (no gating, review only in step 1)", () => {
  const keys = Object.keys(DEFAULT_FOLLOW_UP_TEMPLATES) as FollowUpTemplateKey[];

  it('no default email asks "if you enjoyed / loved / were happy"', () => {
    for (const key of keys) {
      const { subject, body } = DEFAULT_FOLLOW_UP_TEMPLATES[key];
      expect(`${subject}\n${body}`, key).not.toMatch(/if you (enjoyed|loved|liked|were happy|had a (good|great))|si (le gustó|disfrutó|quedó contento)/i);
    }
  });

  it('the review link is in step 1 only', () => {
    for (const key of keys) {
      const hasLink = DEFAULT_FOLLOW_UP_TEMPLATES[key].body.includes('{review_link}');
      expect(hasLink, key).toBe(key.includes('-1-'));
    }
  });

  it('every default uses only known fill-in words', () => {
    for (const key of keys) {
      const { subject, body } = DEFAULT_FOLLOW_UP_TEMPLATES[key];
      expect(findUnknownToken(`${subject}\n${body}`), key).toBeNull();
    }
  });
});

describe('settings', () => {
  it('defaults: auto-send on, both thank-yous on, both step 2s off, next morning', () => {
    const settings = settingsFromRow(null);
    expect(settings).toMatchObject({ autoSend: true, sellerStep1: true, buyerStep1: true, sellerStep2: false, buyerStep2: false, sellerDelay: 'next_morning', buyerDelay: 'next_morning' });
  });

  it('validates a PATCH', () => {
    expect(settingsPatchToRow({ autoSend: false }, DEFAULT_FOLLOW_UP_SETTINGS)).toEqual({ row: { auto_send: false } });
    expect(settingsPatchToRow({ sellerDelay: '48h' }, DEFAULT_FOLLOW_UP_SETTINGS)).toEqual({ row: { seller_delay: '48h' } });
    expect(settingsPatchToRow({ sellerDelay: '1h' }, DEFAULT_FOLLOW_UP_SETTINGS)).toEqual({ error: 'Pick a delay from the list.' });
    expect(settingsPatchToRow({ autoSend: 'yes' }, DEFAULT_FOLLOW_UP_SETTINGS)).toHaveProperty('error');
    expect(settingsPatchToRow({}, DEFAULT_FOLLOW_UP_SETTINGS)).toEqual({ error: 'Nothing to save.' });
  });

  it('saves an edited email, refuses an unknown fill-in word, and resets', () => {
    const saved = settingsPatchToRow({ template: { key: 'seller-1-en', value: { subject: 'Thanks {first_name}', body: 'Hi {first_name},\n\nThanks!' } } }, DEFAULT_FOLLOW_UP_SETTINGS);
    expect(saved).toEqual({ row: { templates: { 'seller-1-en': { subject: 'Thanks {first_name}', body: 'Hi {first_name},\n\nThanks!' } } } });
    expect(settingsPatchToRow({ template: { key: 'seller-1-en', value: { subject: 'Hi {firstname}', body: 'x' } } }, DEFAULT_FOLLOW_UP_SETTINGS))
      .toEqual({ error: '{firstname} is not a fill-in word. Use one from the list under the box.' });
    expect(settingsPatchToRow({ template: { key: 'seller-9-en', value: null } }, DEFAULT_FOLLOW_UP_SETTINGS)).toEqual({ error: 'Unknown email.' });
    const withEdit = settingsFromRow({ templates: { 'seller-1-en': { subject: 'S', body: 'B' } } });
    expect(templateFor(withEdit, 'seller', 1, 'en')).toEqual({ subject: 'S', body: 'B' });
    expect(templateFor(withEdit, 'seller', 1, 'es')).toBe(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-es']);
    expect(settingsPatchToRow({ template: { key: 'seller-1-en', value: null } }, withEdit)).toEqual({ row: { templates: {} } });
  });
});

describe('buyer readiness', () => {
  const now = et('2026-11-24T15:00:00');
  const order = (patch: Partial<BuyerOrderState>): BuyerOrderState => ({
    paymentStatus: 'paid',
    orderStatus: 'open',
    fulfillmentStatus: 'pending',
    shippingMethod: 'pickup',
    deletedAt: null,
    createdAt: et('2026-11-24T11:00:00').toISOString(),
    pickedUpAt: null,
    trackingCreatedAt: null,
    deliveredAt: null,
    ...patch,
  });

  it('in-store (picked up at the sale) → ready, thanked for the sale time', () => {
    const result = buyerReadiness(order({ fulfillmentStatus: 'picked_up' }), now, { firstLook: true, waitingSince: null });
    expect(result).toEqual({ kind: 'ready', eventAt: et('2026-11-24T11:00:00') });
  });

  it('pickup logged → the pickup-log time', () => {
    const result = buyerReadiness(order({ fulfillmentStatus: 'picked_up', pickedUpAt: et('2026-11-24T13:30:00').toISOString() }), now, { firstLook: false, waitingSince: null });
    expect(result).toEqual({ kind: 'ready', eventAt: et('2026-11-24T13:30:00') });
  });

  it('not picked up yet / not shipped yet → waiting', () => {
    expect(buyerReadiness(order({}), now, { firstLook: true, waitingSince: null })).toEqual({ kind: 'waiting', reason: 'pickup' });
    expect(buyerReadiness(order({ shippingMethod: 'shipping', fulfillmentStatus: 'packed' }), now, { firstLook: true, waitingSince: null })).toEqual({ kind: 'waiting', reason: 'shipping' });
  });

  it('shipped → waits for Delivered; delivered → ready at the delivery time', () => {
    const shipped = order({ shippingMethod: 'shipping', fulfillmentStatus: 'shipped', trackingCreatedAt: et('2026-11-23T12:00:00').toISOString() });
    expect(buyerReadiness(shipped, now, { firstLook: false, waitingSince: null })).toEqual({ kind: 'waiting', reason: 'delivery' });
    const delivered = { ...shipped, deliveredAt: '2026-11-24T13:12:00-05:00' };
    expect(buyerReadiness(delivered, now, { firstLook: false, waitingSince: null })).toEqual({ kind: 'ready', eventAt: new Date('2026-11-24T13:12:00-05:00') });
  });

  it('shipped but the carrier never says Delivered → ready 7 days after shipping', () => {
    const shipped = order({ shippingMethod: 'shipping', fulfillmentStatus: 'shipped', trackingCreatedAt: et('2026-11-15T12:00:00').toISOString() });
    expect(buyerReadiness(shipped, now, { firstLook: false, waitingSince: null })).toEqual({ kind: 'ready', eventAt: et('2026-11-22T12:00:00') });
  });

  it('refunded / cancelled / deleted → cancelled', () => {
    expect(buyerReadiness(order({ paymentStatus: 'refunded' }), now, { firstLook: false, waitingSince: null }).kind).toBe('cancelled');
    expect(buyerReadiness(order({ orderStatus: 'cancelled' }), now, { firstLook: false, waitingSince: null }).kind).toBe('cancelled');
    expect(buyerReadiness(order({ fulfillmentStatus: 'cancelled' }), now, { firstLook: false, waitingSince: null }).kind).toBe('cancelled');
    expect(buyerReadiness(order({ deletedAt: now.toISOString() }), now, { firstLook: false, waitingSince: null }).kind).toBe('cancelled');
  });
});

describe('90-day rule', () => {
  const at = et('2026-11-24T10:00:00');
  it('finds a thank-you inside 90 days, ignores older ones', () => {
    expect(thankedRecently([et('2026-10-01T10:00:00').toISOString()], at)?.toISOString()).toBe(et('2026-10-01T10:00:00').toISOString());
    expect(thankedRecently([et('2026-08-20T10:00:00').toISOString(), null], at)).toBeNull();
  });
});

describe('wiring', () => {
  const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');

  it('the admin top bar links Follow-ups right after Buyers', () => {
    const header = src('components/admin/AdminHeader.tsx');
    expect(header.indexOf('/follow-ups`')).toBeGreaterThan(header.indexOf('/buyers`'));
    expect(header.indexOf('/follow-ups`')).toBeLessThan(header.indexOf('AdminMessagesLink\n'));
  });

  it('/review counts the click and still redirects to Google', () => {
    const route = src('app/review/route.ts');
    expect(route).toContain("searchParams.get('f')");
    expect(route).toContain('recordReviewClick');
    expect(route).toContain('NextResponse.redirect(GOOGLE_REVIEW_URL, 302)');
  });

  it('an unsubscribe from any marketing email also stops follow-ups', () => {
    expect(src('lib/marketing.ts')).toContain('recordFollowUpUnsubscribe');
  });

  it('the sweep is guarded by the existing cron secret (no new env var)', () => {
    const route = src('app/api/admin/follow-ups/sweep/route.ts');
    expect(route).toContain('TEXT_ALERTS_CRON_SECRET');
    const sql = readFileSync(join(process.cwd(), '..', 'supabase', 'follow-ups-2026-11.sql'), 'utf8');
    expect(sql).toContain("'nej-follow-ups-sweep'");
    expect(sql).toContain('/api/admin/follow-ups/sweep');
    expect(sql).toContain("name = 'TEXT_ALERTS_CRON_SECRET'");
  });
});
