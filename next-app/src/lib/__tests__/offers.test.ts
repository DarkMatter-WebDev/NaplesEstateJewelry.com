import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  COUNTER_WINDOW_HOURS,
  OFFER_FILTERS,
  OFFER_STATUSES,
  OFFER_WINDOW_HOURS,
  buyerEmailForStatus,
  bulkAcceptsOffersMessage,
  cleanOfferText,
  displayBuyerName,
  parseBulkAcceptsOffers,
  computeOfferTotals,
  counterAmountProblem,
  counterExpiresAt,
  formatOfferDeadline,
  hoursLeft,
  isCounterLive,
  isOfferLive,
  mentionsOffers,
  offerDeleteBlock,
  offerAmountMessage,
  offerAmountProblem,
  offerExpiresAt,
  offerPayPalReference,
  ownerOfferTextBody,
  parseOfferAmount,
  percentOfListed,
  statusesForFilter,
} from '../offers';
import { buildOfferBuyerEmail, buildOwnerOfferEmail } from '../offer-emails';
import { coerceProductAutofill, PRODUCT_AUTOFILL_FIELD_KEYS } from '../ai-product-schema';

vi.mock('@/lib/spot-price', () => ({
  fetchSpotData: async () => ({ gold: 4000, silver: 50, platinum: 1000, palladium: 1000, source: 'live' }),
}));

// Some sources are CRLF (create-order), most are LF — compare in one form.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('offer amounts', () => {
  it('parses what a buyer types', () => {
    expect(parseOfferAmount('1,100')).toBe(1100);
    expect(parseOfferAmount('$1,100.50')).toBe(1100.5);
    expect(parseOfferAmount(' 950 ')).toBe(950);
    expect(parseOfferAmount(875)).toBe(875);
    expect(parseOfferAmount('')).toBeNull();
    expect(parseOfferAmount('abc')).toBeNull();
    expect(parseOfferAmount('12.345')).toBeNull();
    expect(parseOfferAmount('-5')).toBeNull();
    expect(parseOfferAmount(0)).toBeNull();
  });

  it('only requires an amount below the price — no floor (owner ruling)', () => {
    expect(offerAmountProblem(null, 1240)).toBe('missing');
    expect(offerAmountProblem(0.5, 1240)).toBe('too_low');
    expect(offerAmountProblem(1240, 1240)).toBe('not_below_price');
    expect(offerAmountProblem(1300, 1240)).toBe('not_below_price');
    expect(offerAmountProblem(1, 1240)).toBeNull();
    expect(offerAmountProblem(1100, 1240)).toBeNull();
    expect(offerAmountMessage('not_below_price', 1240, false)).toContain('$1,240.00');
    expect(offerAmountMessage('not_below_price', 1240, true)).toContain('carrito');
  });

  it('a counter sits strictly between the offer and today’s price', () => {
    expect(counterAmountProblem(null, 1100, 1240)).toBe('missing');
    expect(counterAmountProblem(1100, 1100, 1240)).toBe('not_above_offer');
    expect(counterAmountProblem(1240, 1100, 1240)).toBe('not_below_price');
    expect(counterAmountProblem(1175, 1100, 1240)).toBeNull();
    expect(percentOfListed(1100, 1240)).toBe(89);
    expect(percentOfListed(950, 1240)).toBe(77);
    expect(percentOfListed(950, null)).toBeNull();
  });
});

describe('what an offer holds', () => {
  it('matches the mockup: pickup, Florida shipping, out-of-state shipping', () => {
    expect(computeOfferTotals(1100, 'local-pickup', null)).toEqual({ subtotal: 1100, shippingFee: 0, tax: 66, total: 1166 });
    expect(computeOfferTotals(1100, 'priority-insured', 'FL')).toEqual({ subtotal: 1100, shippingFee: 59, tax: 69.54, total: 1228.54 });
    expect(computeOfferTotals(1100, 'priority-insured', 'OH')).toEqual({ subtotal: 1100, shippingFee: 59, tax: 0, total: 1159 });
    expect(computeOfferTotals(1175, 'local-pickup', null)?.total).toBe(1245.5);
  });

  it('refuses an unknown or unavailable delivery method', () => {
    expect(computeOfferTotals(1100, 'drone', 'FL')).toBeNull();
    expect(computeOfferTotals(6000, 'express-overnight-insured', 'FL')).toBeNull();
    expect(computeOfferTotals(0, 'local-pickup', null)).toBeNull();
  });

  it('agrees to the cent with the checkout’s own order draft at the agreed price', async () => {
    const { buildOrderDraft, isOrderDraftError } = await import('../checkout-pricing');
    const product = {
      id: 'ring-1', category: 'Gold', metal_type: 'Gold', metal_variant: 'yellow_gold', title: '10K Band',
      item_year: 1970, price_mode: 'manual', purity: 10, weight_grams: 11.2, inventory_number: 212, sku: null,
      gram_weight: 11.2, pricing_multiplier: null, status: 'available', images: [], image_urls: [],
      manual_price_label: '$1,240', asking_price: null, quantity: 1,
    };
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: [product], error: null }) }) }) };
    for (const [method, state] of [['local-pickup', null], ['priority-insured', 'FL'], ['priority-insured', 'TX']] as const) {
      const draft = await buildOrderDraft(client as never, [{ productId: 'ring-1', quantity: 1 }], method, state, null, {
        unitPriceOverride: { productId: 'ring-1', unitPrice: 1100 },
      });
      expect(isOrderDraftError(draft)).toBe(false);
      if (isOrderDraftError(draft)) return;
      const totals = computeOfferTotals(1100, method, state);
      expect(draft.items[0].price_snapshot).toBe(1100);
      expect(totals).toEqual({ subtotal: draft.subtotal, shippingFee: draft.shippingFee, tax: draft.tax, total: draft.total });
    }
    // Without the override the same item is priced at its label.
    const plain = await buildOrderDraft(client as never, ['ring-1'], 'local-pickup', null);
    expect(isOrderDraftError(plain) ? null : plain.items[0].price_snapshot).toBe(1240);
  });
});

describe('the 72-hour clocks', () => {
  const t0 = new Date('2026-10-15T19:12:00Z');

  it('an offer and a counter each run 72 hours — PayPal’s full guaranteed hold', () => {
    expect(OFFER_WINDOW_HOURS).toBe(72);
    expect(COUNTER_WINDOW_HOURS).toBe(72);
    expect(offerExpiresAt(t0).toISOString()).toBe('2026-10-18T19:12:00.000Z');
    expect(counterExpiresAt(t0).toISOString()).toBe('2026-10-18T19:12:00.000Z');
  });

  it('counts whole hours down and never below zero', () => {
    const expires = offerExpiresAt(t0).toISOString();
    expect(hoursLeft(expires, t0)).toBe(72);
    expect(hoursLeft(expires, new Date('2026-10-16T02:00:00Z'))).toBe(65);
    expect(hoursLeft(expires, new Date('2026-10-20T00:00:00Z'))).toBe(0);
    expect(hoursLeft(null, t0)).toBe(0);
  });

  it('only an open offer inside its window can be answered', () => {
    const expires = offerExpiresAt(t0).toISOString();
    expect(isOfferLive({ status: 'open', expires_at: expires }, t0)).toBe(true);
    expect(isOfferLive({ status: 'open', expires_at: expires }, new Date('2026-10-18T19:12:00Z'))).toBe(false);
    expect(isOfferLive({ status: 'countered', expires_at: expires }, t0)).toBe(false);
    expect(isCounterLive({ status: 'countered', counter_expires_at: expires }, t0)).toBe(true);
    expect(isCounterLive({ status: 'counter_bought', counter_expires_at: expires }, t0)).toBe(false);
    expect(isCounterLive({ status: 'countered', counter_expires_at: null }, t0)).toBe(false);
  });

  it('writes the deadline in Eastern time, the way the mockup reads', () => {
    expect(formatOfferDeadline('2026-10-18T19:12:00Z')).toBe('Sun Oct 18, 3:12 PM');
    expect(formatOfferDeadline(null)).toBe('');
  });
});

describe('statuses, filters, emails', () => {
  it('the filters cover every status a person can see, and All hides the never-held ones', () => {
    const all = statusesForFilter('all');
    expect(all).not.toContain('pending');
    expect(all).not.toContain('abandoned');
    for (const status of OFFER_STATUSES.filter((s) => s !== 'pending' && s !== 'abandoned')) {
      expect(OFFER_FILTERS.filter((f) => f !== 'all').some((f) => statusesForFilter(f).includes(status))).toBe(true);
    }
    expect(statusesForFilter('accepted')).toEqual(['accepted', 'counter_bought']);
  });

  it('a buyer is emailed for open, declined, expired, sold, countered — never for a failed charge', () => {
    expect(buyerEmailForStatus('open')).toBe('received');
    expect(buyerEmailForStatus('declined')).toBe('declined');
    expect(buyerEmailForStatus('expired')).toBe('expired');
    expect(buyerEmailForStatus('item_sold')).toBe('item_sold');
    expect(buyerEmailForStatus('countered')).toBe('countered');
    expect(buyerEmailForStatus('failed')).toBeNull();
    expect(buyerEmailForStatus('accepted')).toBeNull();
    expect(buyerEmailForStatus('counter_bought')).toBeNull();
  });

  it('the PayPal reference is never a bare uuid (the webhook reads a uuid as an ORDER id)', () => {
    const ref = offerPayPalReference('6a1f2c3d-1111-4222-8333-944455556666');
    expect(ref).toBe('offer-6a1f2c3d-1111-4222-8333-944455556666');
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)).toBe(false);
  });

  const base = {
    isEs: false,
    customerName: 'Mary Smith',
    productTitle: '10K Yellow Gold Wide Band Ring',
    productUrl: 'https://naplesestatejewelry.com/shop/ring-1',
    amount: 1100,
    total: 1166,
    expiresAt: '2026-10-18T19:12:00Z',
  } as const;

  it('the received email says held, not charged, and the deadline', () => {
    const email = buildOfferBuyerEmail({ ...base, kind: 'received' });
    expect(email.subject).toBe('We received your offer of $1,100.00');
    expect(email.text).toContain('$1,166.00');
    expect(email.text).toContain("You'll only be charged if we accept");
    expect(email.text).toContain('Sun Oct 18, 3:12 PM');
    expect(email.html).not.toMatch(/reply to this/i);
    const es = buildOfferBuyerEmail({ ...base, kind: 'received', isEs: true });
    expect(es.subject).toBe('Recibimos su oferta de $1,100.00');
  });

  it('declined / expired / sold emails all say the hold was released', () => {
    for (const kind of ['declined', 'expired', 'item_sold'] as const) {
      expect(buildOfferBuyerEmail({ ...base, kind }).text).toContain("hold has been released — you were not charged");
    }
  });

  it('a decline carries the owner’s message, quoted and signed; without one it is the plain email', () => {
    const withNote = buildOfferBuyerEmail({ ...base, kind: 'declined', ownerNote: 'The lowest I can go is $45.' });
    expect(withNote.text).toContain('"The lowest I can go is $45." — Chris');
    expect(withNote.html).toContain('&ldquo;The lowest I can go is $45.&rdquo; — Chris');
    expect(withNote.text.indexOf('— Chris')).toBeLessThan(withNote.text.indexOf('hold has been released'));
    const plain = buildOfferBuyerEmail({ ...base, kind: 'declined' });
    expect(plain.text).not.toContain('— Chris');
    // Only a decline shows the note: an expired or sold email never does.
    expect(buildOfferBuyerEmail({ ...base, kind: 'expired', ownerNote: 'x note' }).text).not.toContain('x note');
    const escaped = buildOfferBuyerEmail({ ...base, kind: 'declined', ownerNote: '<b>hi</b>' });
    expect(escaped.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('the email footer: the website, then the address on its own unbroken line, both centred', () => {
    const { html } = buildOfferBuyerEmail({ ...base, kind: 'declined' });
    const footer = html.slice(html.lastIndexOf('border-top:1px solid #eadfbd'));
    expect(footer).toContain('text-align:center;');
    expect(footer).toMatch(/<div><a href="[^"]+"[^>]*>NaplesEstateJewelry\.com<\/a><\/div>\s*<div style="white-space:nowrap;">6240 Shirley St/);
    expect(footer).not.toContain('&middot;');
  });

  it('the card shows a typed-lowercase name with capitals and leaves real capitals alone', () => {
    expect(displayBuyerName('christopher surette')).toBe('Christopher Surette');
    expect(displayBuyerName('  mary   smith ')).toBe('Mary Smith');
    expect(displayBuyerName('Tom McDonald')).toBe('Tom McDonald');
    expect(displayBuyerName('ANNA deLuca')).toBe('ANNA deLuca');
  });

  it('the counter email carries the private Buy-now link and the price', () => {
    const email = buildOfferBuyerEmail({
      ...base,
      kind: 'countered',
      counterAmount: 1175,
      ownerNote: 'I can do $1,175.',
      counterUrl: 'https://naplesestatejewelry.com/offer/counter/TOKEN',
      counterExpiresAt: '2026-10-18T20:05:00Z',
    });
    expect(email.subject).toBe('A counter-offer on 10K Yellow Gold Wide Band Ring');
    expect(email.text).toContain('Buy now at $1,175.00: https://naplesestatejewelry.com/offer/counter/TOKEN');
    expect(email.html).toContain('https://naplesestatejewelry.com/offer/counter/TOKEN');
    expect(email.text).toContain('released the hold');
  });

  it('the owner gets the amount, percent, contact and deadline — by email and by text', () => {
    const email = buildOwnerOfferEmail({
      offerId: 'x', productTitle: '10K Yellow Gold Wide Band Ring', inventoryNumber: '212', amount: 1100, listedPrice: 1240,
      total: 1166, shippingMethod: 'local-pickup', customerName: 'Mary Smith', customerEmail: 'mary@example.com',
      customerPhone: '(239) 555-0148', message: 'Pick up this week', expiresAt: '2026-10-18T19:12:00Z',
      adminUrl: 'https://naplesestatejewelry.com/admin/offers',
    });
    expect(email.subject).toBe('New offer: $1,100.00 on 10K Yellow Gold Wide Band Ring');
    expect(email.text).toContain('(89%)');
    expect(email.text).toContain('Answer by Sun Oct 18, 3:12 PM');
    const text = ownerOfferTextBody({
      amount: 1100, title: '10K Yellow Gold Wide Band Ring', inventoryNumber: '212', listedPrice: 1240,
      customerName: 'Mary Smith', shippingMethod: 'local-pickup', expiresAt: '2026-10-18T19:12:00Z',
      adminUrl: 'https://naplesestatejewelry.com/admin/offers',
    });
    expect(text).toBe('NEJ offer: $1,100.00 on 10K Yellow Gold Wide Band Ring (#212), listed $1,240.00. Mary Smith, pickup. Answer by Sun Oct 18, 3:12 PM: https://naplesestatejewelry.com/admin/offers');
  });

  it('cleans free text', () => {
    expect(cleanOfferText('  hello\n\nthere  ', 500)).toBe('hello there');
    expect(cleanOfferText('', 500)).toBeNull();
    expect(cleanOfferText('x'.repeat(600), 500)).toHaveLength(500);
  });
});

describe('the AI assistant and "Accept offers"', () => {
  it('only words about offers count', () => {
    expect(mentionsOffers('asking 1240, and allow offers on this one')).toBe(true);
    expect(mentionsOffers('turn on make offer')).toBe(true);
    expect(mentionsOffers('no offers on this')).toBe(true);
    expect(mentionsOffers('acepto ofertas')).toBe(true);
    expect(mentionsOffers('the seller offered it to me in 1990')).toBe(false);
    expect(mentionsOffers('14k cuban link, 22 inches')).toBe(false);
    expect(mentionsOffers(null)).toBe(false);
  });

  it('is a schema field the coercion keeps as a boolean', () => {
    expect(PRODUCT_AUTOFILL_FIELD_KEYS).toContain('accepts_offers');
    expect(coerceProductAutofill({ fields: { accepts_offers: true } }).fields.accepts_offers).toBe(true);
    expect(coerceProductAutofill({ fields: { accepts_offers: false } }).fields.accepts_offers).toBe(false);
    expect(coerceProductAutofill({ fields: {} }).fields.accepts_offers).toBeNull();
  });

  it('the route drops the AI value unless the admin just mentioned offers, and the prompt says so', () => {
    const route = read('src', 'app', 'api', 'admin', 'ai-product-fill', 'route.ts');
    expect(route).toContain('if (!mentionsOffers(transcript)) draft.fields.accepts_offers = null;');
    const prompt = read('src', 'lib', 'ai-product-provider.ts');
    expect(prompt).toContain('- accepts_offers:');
    expect(prompt).toContain('Never decide it yourself from the photos, the price');
  });
});

describe('PayPal: hold now, charge on accept', () => {
  it('builds an AUTHORIZE order only when asked; the checkout stays CAPTURE byte-for-byte', async () => {
    const { buildPayPalOrderRequest, payPalCreateRequestId, parsePayPalAuthorizeResponse } = await import('../paypal');
    const input = {
      currency: 'USD', subtotal: 1100, tax: 66, shipping: 0, total: 1166,
      items: [{ name: 'Ring', quantity: '1', unitAmount: 1100 }], referenceId: 'ref',
    };
    expect(buildPayPalOrderRequest(input).intent).toBe('CAPTURE');
    expect(buildPayPalOrderRequest({ ...input, intent: 'AUTHORIZE' }).intent).toBe('AUTHORIZE');
    expect(payPalCreateRequestId(input)).toBe(payPalCreateRequestId({ ...input, intent: 'CAPTURE' }));
    expect(payPalCreateRequestId(input)).not.toBe(payPalCreateRequestId({ ...input, intent: 'AUTHORIZE' }));
    const parsed = parsePayPalAuthorizeResponse({
      status: 'COMPLETED',
      purchase_units: [{ payments: { authorizations: [{ id: 'AUTH1', status: 'CREATED', amount: { value: '1166.00', currency_code: 'USD' }, create_time: '2026-10-15T19:12:00Z' }] } }],
    });
    expect(parsed).toMatchObject({ status: 'CREATED', authorizationId: 'AUTH1', amount: 1166, currency: 'USD', createTime: '2026-10-15T19:12:00Z' });
  });

  it('the offer buttons load their own SDK copy (intent=authorize) under a separate namespace', () => {
    const button = read('src', 'components', 'offers', 'PayPalOfferButton.tsx');
    expect(button).toContain("intent: 'authorize'");
    expect(button).toContain("script.setAttribute('data-namespace', 'paypalOffer')");
    expect(button).toContain('window.paypalOffer.Buttons(');
    expect(button).not.toContain('window.paypal.Buttons(');
  });
});

describe('source guards', () => {
  it('the product page shows Make an Offer only on a purchasable item with the box ticked', () => {
    const page = read('src', 'app', '[locale]', 'shop', '[id]', 'page.tsx');
    expect(page).toContain('{isPurchasable && p.accepts_offers === true && (');
    expect(page).toContain("'accepts_offers',\n];");
    expect(page).toContain('/offer/${encodeURIComponent(p.id)}');
  });

  it('a counter-offer pays through the normal checkout route, one item, no discount', () => {
    const route = read('src', 'app', 'api', 'paypal', 'create-order', 'route.ts');
    expect(route).toContain('findCounterByToken(service, counterToken)');
    expect(route).toContain('const discountResolver = counterOfferId ? null : makeDiscountResolver(');
    expect(route.match(/draftOptions,\n/g)?.length).toBe(2);
    expect(route).toContain("orderLines[0].quantity === 1");
  });

  it('every paid order settles offers (both capture paths go through finalizePaidOrder)', () => {
    const finalize = read('src', 'lib', 'order-finalize.ts');
    expect(finalize).toContain("await import('@/lib/offers-server')");
    expect(finalize).toContain('settleOffersAfterPaidOrder(service, order.id)');
  });

  it('accept writes the order through the checkout RPCs and never charges an expired offer', () => {
    const server = read('src', 'lib', 'offers-server.ts');
    const accept = server.slice(server.indexOf('export async function acceptOffer('));
    expect(accept.indexOf("service.rpc('create_paypal_order'")).toBeGreaterThan(0);
    expect(accept.indexOf('capturePayPalAuthorization(')).toBeGreaterThan(accept.indexOf("service.rpc('create_paypal_order'"));
    expect(accept.indexOf("service.rpc('capture_paypal_order'")).toBeGreaterThan(accept.indexOf('capturePayPalAuthorization('));
    expect(accept.indexOf('if (!isOfferLive(offer))')).toBeLessThan(accept.indexOf('capturePayPalAuthorization('));
    expect(server).toContain('referenceId: offerPayPalReference(offerId)');
  });

  it('a failed product read closes no offer (it would otherwise release every hold)', () => {
    const server = read('src', 'lib', 'offers-server.ts');
    const close = server.slice(server.indexOf('async function closeOffersOnUnavailableProducts('));
    expect(close.slice(0, 1200)).toContain("console.error('Offer close: product read failed — nothing closed.', loadError);\n    return 0;");
    expect(close.slice(0, 1200)).not.toContain('.catch(() => new Map');
  });

  it('the SQL keeps offers private, lets visitors read the box, and schedules the sweep', () => {
    const sql = read('..', 'supabase', 'make-offer-2026-10.sql');
    expect(sql).toContain('grant select (accepts_offers) on public.products to anon, authenticated;');
    expect(sql).toContain('revoke all on public.product_offers from anon, authenticated;');
    expect(sql).toContain("'nej-offers-sweep'");
    expect(sql).toContain("where name = 'TEXT_ALERTS_CRON_SECRET'");
    expect(sql).toContain('add column if not exists offer_id uuid');
  });

  it('the admin: an Offers column right after Price, the editor box, the menu, requireAdmin', () => {
    const shell = read('src', 'components', 'admin', 'AdminShell.tsx');
    const priceIndex = shell.indexOf("{ label: 'Price', sortKey: 'currentPrice'");
    const offersIndex = shell.indexOf("{ label: 'Offers', sortKey: 'offers'");
    const statusIndex = shell.indexOf("{ label: 'Status', sortKey: 'status'");
    expect(priceIndex).toBeGreaterThan(0);
    expect(offersIndex).toBeGreaterThan(priceIndex);
    expect(statusIndex).toBeGreaterThan(offersIndex);
    expect(shell).toContain('checked={editing.accepts_offers === true}');
    expect(shell).toContain("setField('accepts_offers', 'Accept offers'");
    const header = read('src', 'components', 'admin', 'AdminHeader.tsx');
    expect(header).toContain('<AdminOffersLink');
    const list = read('src', 'app', 'api', 'admin', 'offers', 'route.ts');
    const action = read('src', 'app', 'api', 'admin', 'offers', '[id]', 'route.ts');
    for (const source of [list, action]) {
      expect(source.indexOf('await requireAdmin()')).toBeGreaterThan(0);
      expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('createServiceClient()', source.indexOf('await requireAdmin()')));
    }
    expect(read('src', 'app', '[locale]', 'admin', 'offers', 'page.tsx')).toContain('<AdminHeader');
  });

  it('bulk "Set all accept offers / no offers": the body, the message, the route, the window', () => {
    expect(parseBulkAcceptsOffers({ productIds: ['a', 'b', 'a', ' ', 7], enabled: true })).toEqual({ productIds: ['a', 'b'], enabled: true });
    expect(parseBulkAcceptsOffers({ productIds: ['a'] })).toEqual({ error: 'Say whether offers go on or off.' });
    expect(parseBulkAcceptsOffers({ productIds: [], enabled: false })).toEqual({ error: 'Select at least one item.' });
    expect('error' in parseBulkAcceptsOffers({ productIds: Array.from({ length: 1001 }, (_, i) => `p${i}`), enabled: true })).toBe(true);
    expect(bulkAcceptsOffersMessage(true, 3, 0)).toBe('Accept offers is on for 3 items — each shows Make an Offer on its page.');
    expect(bulkAcceptsOffersMessage(false, 1, 0)).toBe('Accept offers is off for 1 item — no Make an Offer button.');
    expect(bulkAcceptsOffersMessage(false, 4, 2)).toBe('Accept offers is off for 4 items — no Make an Offer button. 2 open offers stay open until you answer them in Offers.');

    const route = read('src', 'app', 'api', 'admin', 'offers', 'accepts', 'route.ts');
    expect(route.indexOf('await requireAdmin()')).toBeGreaterThan(0);
    expect(route.indexOf('await requireAdmin()')).toBeLessThan(route.indexOf('createServiceClient()'));
    expect(route).toContain('.update({ accepts_offers: parsed.enabled })');
    expect(route).toContain("revalidatePath(`/es/shop/${id}`);");

    const modal = read('src', 'components', 'admin', 'SelectedProductsActionsModal.tsx');
    expect(modal).toContain('title="Set all accept offers"');
    expect(modal).toContain('title="Set all no offers"');
    expect(modal).toContain("onChoose('site-offers-on')");
    expect(modal).toContain("onChoose('site-offers-off')");
    const shell = read('src', 'components', 'admin', 'AdminShell.tsx');
    expect(shell).toContain("void setSiteOffersForSelected(action === 'site-offers-on');");
    expect(shell).toContain("fetch('/api/admin/offers/accepts'");
  });

  it('Decline and Counter take the same optional message, kept on the offer (counter_note)', () => {
    const action = read('src', 'app', 'api', 'admin', 'offers', '[id]', 'route.ts');
    expect(action).toContain('await declineOffer(service, id, { note: body?.note })');
    expect(action).toContain('await counterOffer(service, id, { amount: body?.amount, note: body?.note })');
    const server = read('src', 'lib', 'offers-server.ts');
    const decline = server.slice(server.indexOf('export async function declineOffer('));
    expect(decline.slice(0, 900)).toContain("counter_note: cleanOfferText(input.note, OWNER_NOTE_MAX),");
    expect(server).toContain('ownerNote: offer.counter_note,');
    const panel = read('src', 'components', 'admin', 'OffersPanel.tsx');
    expect(panel).toContain('<MessageBox id={`counter-note-${offer.id}`}');
    expect(panel).toContain('<MessageBox id={`decline-note-${offer.id}`}');
    expect(panel).toContain('Message to {first} (optional)');
    expect(panel).toContain('Yes, decline and send');
    expect(panel).toContain('<strong>Your message:</strong> {offer.counter_note}');
  });

  it('the phone card: one column in the mockup’s order, the amount never in the photo column', () => {
    const panel = read('src', 'components', 'admin', 'OffersPanel.tsx');
    expect(panel).toContain("'thumb title'\n              'money money'\n              'clock clock'\n              'buyer buyer'\n              'actions actions';");
    expect(panel).toContain('.offer-amount { font-size: 1.5rem; font-weight: 700; white-space: nowrap;');
    expect(panel).toContain('Accept &amp; charge<span className="offer-phone-only">');
    expect(panel).toContain('const name = displayBuyerName(offer.customer_name);');
  });

  it('delete: open offers, live counters and unreleased holds are protected; finished ones can go', () => {
    const now = new Date('2026-10-15T20:00:00Z');
    const later = '2026-10-17T20:00:00Z';
    const past = '2026-10-14T20:00:00Z';
    expect(offerDeleteBlock({ status: 'open', hold_status: 'held' }, now)).toMatch(/holding the buyer's money/);
    expect(offerDeleteBlock({ status: 'pending', hold_status: 'none' }, now)).not.toBeNull();
    expect(offerDeleteBlock({ status: 'countered', hold_status: 'released', counter_expires_at: later }, now)).toMatch(/link is still live/);
    expect(offerDeleteBlock({ status: 'countered', hold_status: 'released', counter_expires_at: past }, now)).toBeNull();
    expect(offerDeleteBlock({ status: 'declined', hold_status: 'release_failed' }, now)).toMatch(/not released this hold/);
    for (const status of ['accepted', 'counter_bought', 'declined', 'expired', 'counter_expired', 'item_sold', 'failed', 'abandoned']) {
      const hold = status === 'accepted' ? 'captured' : 'released';
      expect(offerDeleteBlock({ status, hold_status: hold }, now)).toBeNull();
    }
  });

  it('delete: the server re-checks every row, the route is admin-only, the page uses the same rule', () => {
    const server = read('src', 'lib', 'offers-server.ts');
    const del = server.slice(server.indexOf('export async function deleteOffers('));
    expect(del.slice(0, 2000)).toContain('const reason = offerDeleteBlock(');
    expect(del.slice(0, 2000)).toContain(".not('status', 'in', '(open,pending)')");
    const route = read('src', 'app', 'api', 'admin', 'offers', 'route.ts');
    const handler = route.slice(route.indexOf('export async function DELETE('));
    expect(handler.indexOf('await requireAdmin()')).toBeGreaterThan(0);
    expect(handler.indexOf('await requireAdmin()')).toBeLessThan(handler.indexOf('createServiceClient()'));
    const panel = read('src', 'components', 'admin', 'OffersPanel.tsx');
    expect(panel).toContain('{!offerDeleteBlock(offer) && (');
    expect(panel).toContain('const deletable = offers.filter((offer) => !offerDeleteBlock(offer));');
    expect(panel).toContain("method: 'DELETE'");
    expect(panel).toContain("{deleting.ids.length === 1 ? 'Keep it' : 'Keep them'}");
    expect(panel).toContain("Open offers can&apos;t be deleted");
  });

  it('the sweep is guarded by the cron secret', () => {
    const sweep = read('src', 'app', 'api', 'admin', 'offers', 'sweep', 'route.ts');
    expect(sweep).toContain("req.headers.get('x-cron-secret') !== secret");
  });
});
