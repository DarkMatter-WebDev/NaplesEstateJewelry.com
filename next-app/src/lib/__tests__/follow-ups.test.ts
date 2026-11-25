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
  optOutReason,
  relativeDayWord,
  renderFollowUp,
  settingsFromRow,
  settingsPatchToRow,
  step2SendAt,
  strongerOptOut,
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
    // 2026-11-24 (10): a live title ended "Braceleter -"
    expect(itemPhrase(['Marco Bicego Lariat Chain & Braceleter -'], 'en')).toBe('Marco Bicego Lariat Chain & Braceleter');
    expect(itemPhrase(['Ring, ', ' – '], 'en')).toBe('Ring');
  });

  it('cleans a stored item name at render time too (rows queued before the fix)', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['buyer-1-en'], { ...baseInput, audience: 'buyer', name: 'Mary', item: 'Lariat Chain & Bracelet -' });
    expect(out.text).toContain('Thank you for buying your Lariat Chain & Bracelet from us.');
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
  guidesUrl: 'https://naplesestatejewelry.com/guides',
};

describe("renderFollowUp (Rob's blend, 2026-11-25)", () => {
  it('fills the seller thank-you: standard opening, review button, help box below it, two cards, team sign-off', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], { ...baseInput, pieceCount: 1 });
    expect(out.subject).toBe('Thank you, Margaret');
    expect(out.text).toContain('Hi Margaret,');
    expect(out.text).toContain('It was a pleasure meeting you yesterday. Thank you for coming in and trusting us with your piece.');
    expect(out.text).not.toContain('with your jewelry'); // 2026-11-25: not every seller brings jewelry
    expect(out.text).not.toMatch(/fairly|if you have a minute/i);
    expect(out.text).toContain('Would you take a moment to share your experience?');
    expect(out.text).toContain('Share your experience on Google: https://naplesestatejewelry.com/review?f=11111111-2222-3333-4444-555555555555');
    expect(out.html).toContain('href="https://naplesestatejewelry.com/review?f=11111111-2222-3333-4444-555555555555"');
    expect(out.html).toContain('>Share your experience on Google</a>');
    // the "Here whenever you need us" box comes AFTER the review button (Rob's note)
    expect(out.html.indexOf('Here whenever you need us')).toBeGreaterThan(out.html.indexOf('Share your experience on Google'));
    expect(out.html).toContain('6240 Shirley St, Ste 104, Naples, FL 34109');
    expect(out.html).not.toContain('Sharon Lynch');
    expect(out.html).toContain('href="https://naplesestatejewelry.com/guides"');
    expect(out.html).toContain('Know someone with pieces to sell?');
    expect(out.text).toContain('and the Naples Estate Jewelry Team');
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
    expect(out.text).toContain('Fue un placer conocerle ayer. Gracias por visitarnos y por confiarnos sus piezas.');
    expect(out.html).toContain('Compartir su experiencia en Google</a>');
    expect(out.html).toContain('Aquí cuando nos necesite');
    expect(out.html).toContain('y el equipo de Naples Estate Jewelry');
    expect(out.html).toContain('Cancelar suscripción');
  });

  it('"your piece" for one receipt line, "your pieces" otherwise (or unknown)', () => {
    expect(renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], { ...baseInput, pieceCount: 1 }).text).toContain('trusting us with your piece.');
    expect(renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], { ...baseInput, pieceCount: 3 }).text).toContain('trusting us with your pieces.');
    expect(renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], baseInput).text).toContain('trusting us with your pieces.');
  });

  it("uses the AI's / owner's opening in place of the standard one, filling {when} and escaping it", () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], {
      ...baseInput,
      opening: "It was good to meet you {when}. Thank you for trusting us with your mother's <sapphire> ring.",
    });
    expect(out.text).toContain("It was good to meet you yesterday. Thank you for trusting us with your mother's <sapphire> ring.");
    expect(out.text).not.toContain('It was a pleasure meeting you');
    expect(out.html).toContain('&lt;sapphire&gt;');
    expect(out.html).not.toContain('<sapphire>');
  });

  it('an owner-edited template from before still renders ({review_link} inline, no blocks)', () => {
    const old = { subject: 'Thanks {first_name}', body: 'Hi {first_name},\n\nThanks for coming in {when}.\n\nA few words would help: {review_link}.\n\nThank you again,\nChris' };
    const out = renderFollowUp(old, baseInput);
    expect(out.html).toContain('>share your experience on Google</a>');
    expect(out.html).toContain('Naples Estate Jewelry &middot;'); // the small name · phone line comes back without a help box
  });

  it('escapes what people typed (names, items) — never raw HTML', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['buyer-1-en'], { ...baseInput, audience: 'buyer', name: '<b>Eve</b>', item: '<img src=x onerror=alert(1)>' });
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out.html).not.toContain('<b>Eve');
  });

  it('the signature line renders as the serif "Chris"', () => {
    const out = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], baseInput);
    expect(out.html).toMatch(/Thank you again,<br \/><span style="font-family:Georgia[^"]*">Chris<\/span><br \/>and the Naples Estate Jewelry Team/);
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

  it('the review is in step 1 only', () => {
    for (const key of keys) {
      const { body } = DEFAULT_FOLLOW_UP_TEMPLATES[key];
      const hasLink = body.includes('{review_link}') || body.includes('{review_button}');
      expect(hasLink, key).toBe(key.includes('-1-'));
    }
  });

  it('the review request is FIXED wording — only {opening} is written per person, and it comes before the review', () => {
    for (const key of keys.filter((k) => k.includes('-1-'))) {
      const { body } = DEFAULT_FOLLOW_UP_TEMPLATES[key];
      expect(body.indexOf('{opening}'), key).toBeGreaterThan(-1);
      expect(body.indexOf('{opening}'), key).toBeLessThan(body.indexOf('{review_button}'));
      expect(body.indexOf('{review_button}'), key).toBeLessThan(body.indexOf('{help_box}'));
    }
  });

  it('the phone number never breaks across lines in the HTML (thin phones, 2026-11-25 (4))', () => {
    const rendered = renderFollowUp(DEFAULT_FOLLOW_UP_TEMPLATES['seller-1-en'], {
      audience: 'seller', language: 'en', name: 'Margaret Ellison', eventAt: new Date('2026-11-24T17:00:00Z'), sendAt: new Date('2026-11-25T15:00:00Z'),
      item: null, phone: '(239) 404-8505', reviewUrl: 'https://example.com/r', unsubscribeUrl: 'https://example.com/u', businessName: 'Naples Estate Jewelry', mailingAddress: '6240 Shirley St',
    });
    const all = rendered.html.split('(239) 404-8505').length - 1;
    const kept = rendered.html.split('<span style="white-space:nowrap;">(239) 404-8505</span>').length - 1;
    expect(all).toBeGreaterThanOrEqual(3);
    expect(kept).toBe(all);
    expect(rendered.text).not.toContain('white-space');
  });

  it('step 1 says "questions? just reply" in the body, between the opening and the review (owner, 2026-11-25 (2))', () => {
    for (const key of keys.filter((k) => k.includes('-1-'))) {
      const { body } = DEFAULT_FOLLOW_UP_TEMPLATES[key];
      const questions = key.endsWith('-es') ? body.indexOf('Si le surge alguna pregunta') : body.indexOf('If any questions come up');
      expect(questions, key).toBeGreaterThan(body.indexOf('{opening}'));
      expect(questions, key).toBeLessThan(body.indexOf('{review_button}'));
      expect(body.slice(questions), key).toContain('{phone}');
      expect(body, key).toContain(key.startsWith('seller') ? (key.endsWith('-es') ? 'su visita o su recibo' : 'your visit or your receipt') : (key.endsWith('-es') ? 'su pedido' : 'your order'));
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

describe('opt-out labels (2026-11-24 (10): Tina Soriano read "Unsubscribed" after a hard bounce)', () => {
  it('a bounce beats an unsubscribe (a bounce also runs the unsubscribe code); the owner\'s Stop beats both', () => {
    const unsub = { kind: 'unsubscribed' as const, at: null };
    const bounced = { kind: 'bounced' as const, at: '2026-11-09T18:53:48Z' };
    const stopped = { kind: 'stopped' as const, at: '2026-11-24T10:00:00Z' };
    expect(strongerOptOut(unsub, bounced)).toBe(bounced);
    expect(strongerOptOut(bounced, unsub)).toBe(bounced);
    expect(strongerOptOut(bounced, stopped)).toBe(stopped);
    expect(strongerOptOut(undefined, unsub)).toBe(unsub);
    // same kind: the one with a date wins
    expect(strongerOptOut(unsub, { kind: 'unsubscribed', at: '2026-10-01T00:00:00Z' })).toEqual({ kind: 'unsubscribed', at: '2026-10-01T00:00:00Z' });
  });

  it('log reasons', () => {
    expect(optOutReason({ kind: 'bounced', at: null })).toBe('Email bounced — this address cannot receive mail.');
    expect(optOutReason({ kind: 'unsubscribed', at: null })).toBe('Unsubscribed.');
    expect(optOutReason({ kind: 'stopped', at: null })).toBe('Follow-ups stopped for this person.');
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

  it('reads ONLY the buy-receipt columns the service-role grant allows (never ID data)', () => {
    // 2026-11-24 (10): buy_receipts has no table grant for service_role on purpose (ID data);
    // supabase/follow-ups-receipts-grant-2026-11.sql grants SELECT on nine columns, and
    // supabase/follow-ups-ai-openings-2026-11.sql adds the item lines + the thank-you note (2026-11-25).
    const granted = new Set<string>();
    for (const file of ['follow-ups-receipts-grant-2026-11.sql', 'follow-ups-ai-openings-2026-11.sql']) {
      const grantSql = readFileSync(join(process.cwd(), '..', 'supabase', file), 'utf8');
      for (const match of grantSql.matchAll(/^grant select \(([^)]*)\) on public\.buy_receipts to service_role/gm)) {
        for (const column of match[1].split(',')) granted.add(column.trim());
      }
    }
    expect(granted.has('seller_email')).toBe(true);
    expect(granted.has('items')).toBe(true);
    for (const secret of ['seller_id_last4', 'seller_dob', 'seller_id_photo_path', 'seller_thumbprint_path', 'seller_street', 'seller_id_type', 'payments', 'notes']) {
      expect(granted.has(secret), secret).toBe(false);
    }

    const server = src('lib/follow-ups-server.ts') + '\n' + src('lib/follow-up-opening-server.ts') + '\n' + src('lib/follow-up-items-server.ts');
    const receiptConstant = /const RECEIPT_COLUMNS = '([^']+)'/.exec(server)![1];
    const used: string[] = [];
    // every .from('buy_receipts').select(...) and every filter on it
    for (const match of server.matchAll(/from\('buy_receipts'\)([\s\S]*?)(?:;|\n\s*\]|\),\n)/g)) {
      const chain = match[1];
      for (const select of chain.matchAll(/\.select\((RECEIPT_COLUMNS|'([^']*)')/g)) {
        used.push(...(select[1] === 'RECEIPT_COLUMNS' ? receiptConstant : select[2]).split(','));
      }
      for (const filter of chain.matchAll(/\.(?:eq|neq|not|gte|gt|ilike|order|in)\('([a-z_]+)'/g)) used.push(filter[1]);
    }
    // selectIn(client, 'buy_receipts', '<columns>', '<key>', …)
    for (const match of server.matchAll(/selectIn<[^>]*>\(client, 'buy_receipts', '([^']+)', '([^']+)'/g)) {
      used.push(...match[1].split(','), match[2]);
    }
    const columns = [...new Set(used.map((c) => c.trim()).filter(Boolean))];
    expect(columns.length).toBeGreaterThan(5); // positive control: the scan found the reads
    expect(columns.filter((c) => !granted.has(c))).toEqual([]);
  });

  it('"View items" is read-only, admin-gated, and on every Upcoming line (2026-11-25)', () => {
    const route = src('app/api/admin/follow-ups/[id]/items/route.ts');
    expect(route).toContain('requireAdmin()');
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    const loader = src('lib/follow-up-items-server.ts');
    expect(loader).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    for (const secret of ['seller_id_last4', 'seller_dob', 'seller_id_photo_path', 'seller_thumbprint_path', 'seller_street', 'payments', 'notes']) {
      expect(loader, secret).not.toContain(secret);
    }
    const manager = src('components/admin/follow-ups/FollowUpsManager.tsx');
    expect(manager).toContain('onViewItems={(row) => setItemsFor(row)}');
    expect(manager).toContain('View items');
    expect(src('components/admin/follow-ups/FollowUpItemsModal.tsx')).toContain('AdminModal');
  });

  it('People → Thank-you box: preview first, prepared rows are HELD, send confirms (2026-11-25 (15))', () => {
    const server = src('lib/follow-ups-server.ts');
    // one rule picks the visit for the box, the preview and the send
    expect(server).toContain('async function personThankYouTarget(');
    expect(server.match(/personThankYouTarget\(client, normalized\)/g)?.length).toBeGreaterThanOrEqual(3);
    // a row prepared for a preview is not_sent with no send time — the sweep only ever sends 'scheduled'
    expect(server).toMatch(/prepared \? \{ status: 'not_sent' as const, send_at: null, reason: PREPARED_REASON \}/);
    expect(server).toMatch(/\.eq\('status', 'scheduled'\)[\s\S]{0,200}\.lte\('send_at'|\.lte\('send_at'[\s\S]{0,200}\.eq\('status', 'scheduled'\)/);
    expect(server).toContain("const allowed = options.manual ? ['scheduled', 'waiting', 'failed', 'skipped', 'not_sent'] : ['scheduled'];");
    const route = src('app/api/admin/follow-ups/people/route.ts');
    expect(route).toContain("body?.action === 'prepare'");
    const people = src('components/admin/follow-ups/FollowUpPeople.tsx');
    expect(people).toContain('Preview the email');
    expect(people).toContain('Send this thank-you to ${person.email} now?');
    expect(people).toContain('<ItemLines');
    expect(people).not.toContain('Send a thank-you now');
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
