import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAvailabilityBuyerEmail, buildOwnerAvailabilityEmail } from '@/lib/offer-emails';
import {
  AVAILABILITY_LINK_HOURS,
  availabilityLinkExpiresAt,
  normalizeOfferKind,
  offerDeleteBlock,
  offerStatusLabel,
  ownerAvailabilityTextBody,
} from '@/lib/offers';
import { buildPreflightChecks as ebayPreflight } from '@/lib/ebay/mapping';
import { buildPreflightChecks as etsyPreflight } from '@/lib/etsy/mapping';
import type { Product } from '@/types/product';

/**
 * Check Availability (owner, 2026-11-05, mockup 1): a piece another dealer
 * holds — the buyer asks first (no payment), the owner answers with a private
 * Buy link at today's price or a "this piece has sold" email.
 */

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const BASE = {
  isEs: false,
  customerName: 'Margaret Ellis',
  productTitle: 'Vintage Tiffany Bracelet',
  productUrl: 'https://naplesestatejewelry.com/shop/tiffany',
};

describe('buyer emails', () => {
  it('"We’re checking on it" — never charged, answer by email', () => {
    const email = buildAvailabilityBuyerEmail({ ...BASE, kind: 'received' });
    expect(email.subject).toBe('We’re checking on Vintage Tiffany Bracelet');
    expect(email.html).toContain('Hi Margaret, thanks for asking about <strong>Vintage Tiffany Bracelet</strong>.');
    expect(email.html).toContain('You haven’t been charged anything.');
    expect(email.html).toContain('keep an eye on your inbox');
    expect(email.html).not.toMatch(/hold|PayPal is holding/i);
  });

  it('"Good news — it’s available" carries the Buy now button, the deadline and the owner’s note', () => {
    const email = buildAvailabilityBuyerEmail({
      ...BASE,
      kind: 'countered',
      price: 6009,
      ownerNote: 'Yes, the clasp is original.',
      buyUrl: 'https://naplesestatejewelry.com/offer/counter/abc',
      buyUntil: 'Sat Nov 7, 11:02 AM',
    });
    expect(email.subject).toBe('Good news — Vintage Tiffany Bracelet is available');
    expect(email.html).toContain('Buy now at $6,009.00');
    expect(email.html).toContain('href="https://naplesestatejewelry.com/offer/counter/abc"');
    expect(email.html).toContain('held just for you until <strong>Sat Nov 7, 11:02 AM</strong>');
    expect(email.html).toContain('&ldquo;Yes, the clasp is original.&rdquo; — Chris');
    expect(email.text).toContain('Buy now at $6,009.00: https://naplesestatejewelry.com/offer/counter/abc');
    expect(email.html).not.toContain('counter-offer');
  });

  it('"This piece has sold" — sorry, never charged, the note, browse the shop', () => {
    const email = buildAvailabilityBuyerEmail({ ...BASE, kind: 'declined', ownerNote: 'A similar one comes in next week.' });
    expect(email.subject).toBe('This piece has sold — Vintage Tiffany Bracelet');
    expect(email.html).toContain('it’s no longer available');
    expect(email.html).toContain('You were never charged.');
    expect(email.html).toContain('A similar one comes in next week.');
    expect(email.html).toContain('Browse the shop');
    expect(email.html).not.toMatch(/hold/i);
  });

  it('an unanswered request says so (no "sold") and sold-another-way drops the owner note', () => {
    const expired = buildAvailabilityBuyerEmail({ ...BASE, kind: 'expired', ownerNote: 'ignored' });
    expect(expired.subject).toBe('We couldn’t confirm it in time — Vintage Tiffany Bracelet');
    expect(expired.html).not.toContain('ignored');
    const sold = buildAvailabilityBuyerEmail({ ...BASE, kind: 'item_sold', ownerNote: 'ignored' });
    expect(sold.html).toContain('This piece has sold');
    expect(sold.html).not.toContain('ignored');
  });

  it('Spanish, and escapes what the buyer typed', () => {
    const es = buildAvailabilityBuyerEmail({ ...BASE, isEs: true, kind: 'received', customerName: '<b>Ana</b>' });
    expect(es.html).toContain('Lo estamos verificando');
    expect(es.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(es.html).not.toContain('<b>Ana</b>');
  });
});

describe('owner email + text', () => {
  it('names the item, the buyer and that no payment was taken; phone kept on one line', () => {
    const email = buildOwnerAvailabilityEmail({
      productTitle: 'Vintage Tiffany Bracelet',
      inventoryNumber: '26',
      listedPrice: 6009,
      customerName: 'Margaret Ellis',
      customerEmail: 'margaret@example.com',
      customerPhone: '(239) 555-0142',
      message: 'Is the clasp original?',
      adminUrl: 'https://naplesestatejewelry.com/admin/offers',
    });
    expect(email.subject).toBe('Availability check: Vintage Tiffany Bracelet');
    expect(email.html).toContain('Check with the dealer');
    expect(email.html).toContain('Vintage Tiffany Bracelet (#26)');
    expect(email.html).toContain('<span style="white-space:nowrap;">(239) 555-0142</span>');
    expect(email.html).toContain('No payment has been taken.');
    expect(email.html).toContain('Open Offers');
  });

  it('a request without a phone leaves no empty slot', () => {
    const email = buildOwnerAvailabilityEmail({
      productTitle: 'Ring', inventoryNumber: null, listedPrice: null, customerName: 'Ann Lee',
      customerEmail: 'ann@example.com', customerPhone: '', message: null, adminUrl: 'https://x/admin/offers',
    });
    expect(email.text).toContain('Ann Lee · ann@example.com');
    expect(email.text).not.toContain(' ·  · ');
  });

  it('the text is one plain line with the Offers link', () => {
    expect(ownerAvailabilityTextBody({
      title: 'Vintage Tiffany Bracelet', inventoryNumber: '26', listedPrice: 6009, customerName: 'Margaret Ellis',
      adminUrl: 'https://naplesestatejewelry.com/admin/offers',
    })).toBe('NEJ availability check: Vintage Tiffany Bracelet (#26), listed $6,009.00. Margaret Ellis. Answer: https://naplesestatejewelry.com/admin/offers');
  });
});

describe('rules', () => {
  it('the Buy link holds the piece for 48 hours', () => {
    expect(AVAILABILITY_LINK_HOURS).toBe(48);
    const sent = new Date('2026-11-05T15:00:00Z');
    expect(availabilityLinkExpiresAt(sent).toISOString()).toBe('2026-11-07T15:00:00.000Z');
  });

  it('every row is an offer unless it says availability', () => {
    expect(normalizeOfferKind('availability')).toBe('availability');
    expect(normalizeOfferKind(undefined)).toBe('offer');
    expect(normalizeOfferKind('anything')).toBe('offer');
  });

  it('the admin labels use availability words, offers keep theirs', () => {
    expect(offerStatusLabel('countered', 'availability')).toBe('Buy link sent');
    expect(offerStatusLabel('declined', 'availability')).toBe('Not available');
    expect(offerStatusLabel('countered', 'offer')).toBe('Countered');
    expect(offerStatusLabel('declined')).toBe('Declined');
  });

  it('an open request or a live Buy link cannot be deleted; no PayPal words', () => {
    const open = offerDeleteBlock({ status: 'open', kind: 'availability' });
    expect(open).toContain('Answer this request first');
    expect(open).not.toContain('PayPal');
    const live = offerDeleteBlock({ status: 'countered', kind: 'availability', counter_expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(live).toContain('48 hours');
    expect(offerDeleteBlock({ status: 'declined', kind: 'availability', hold_status: 'none' })).toBeNull();
  });
});

describe('kept off eBay and Etsy', () => {
  const product = {
    id: 'tiffany', title: '18K Gold Bracelet', status: 'available', quantity: 1, category: 'Gold', purity: 18,
    product_type: 'Bracelet', jewelry_type: 'Bracelet', price_mode: 'manual', asking_price: 6009, image_urls: ['https://x/a.webp'],
    inventory_number: 26, sku: '26', confirm_availability: true,
  } as unknown as Product;

  it('eBay pre-flight fails a "Confirm availability first" item, passes it once unticked', () => {
    const checks = ebayPreflight(product, null, null);
    expect(checks.find((check) => check.check === 'confirm_availability')?.ok).toBe(false);
    const unticked = ebayPreflight({ ...product, confirm_availability: false }, null, null);
    expect(unticked.find((check) => check.check === 'confirm_availability')?.ok).toBe(true);
  });

  it('Etsy pre-flight does the same', () => {
    const checks = etsyPreflight(product, null, null);
    expect(checks.find((check) => check.check === 'confirm_availability')?.ok).toBe(false);
    expect(etsyPreflight({ ...product, confirm_availability: null }, null, null).find((check) => check.check === 'confirm_availability')?.ok).toBe(true);
  });
});

describe('wiring guards', () => {
  it('the checkout refuses a ticked item unless it is paid through its Buy link', () => {
    const route = read('src/app/api/paypal/create-order/route.ts');
    expect(route).toContain(".eq('confirm_availability', true)");
    expect(route).toContain("code: 'check_availability_first'");
    // The guard sits after the counter-token check and skips only that path.
    expect(route.indexOf("code: 'check_availability_first'")).toBeGreaterThan(route.indexOf('counterOfferId = offer.id;'));
    expect(route).toMatch(/if \(!counterOfferId\) \{\s*const \{ data: checkFirst/);
  });

  it('the item page swaps Add to Cart for Check Availability, and its column degrades alone', () => {
    const page = read('src/app/[locale]/shop/[id]/page.tsx');
    expect(page).toContain('const checkFirst = p.confirm_availability === true;');
    expect(page).toContain('/availability/${encodeURIComponent(p.id)}');
    expect(page).toContain('No payment needed to ask.');
    expect(page).toContain('isMissingConfirmAvailabilityColumnError(result.error)');
    const shop = read('src/app/[locale]/shop/(list)/shop-page-renderer.tsx');
    expect(shop).toContain('isMissingConfirmAvailabilityColumnError(firstResult.error)');
  });

  it('shop cards and list rows never add a ticked item to the cart', () => {
    const button = read('src/components/shop/CartButton.tsx');
    expect(button).toContain('if (item.checkFirst && canPurchase && !inCart)');
    for (const file of ['src/components/shop/ProductCard.tsx', 'src/components/shop/ProductListRow.tsx']) {
      expect(read(file)).toContain('checkFirst: product.confirm_availability === true,');
    }
  });

  // Owner, 2026-11-10: "Inquire" chip, one-label button (version A), no
  // duplicate Inquire button on the item page — and the card stylesheet bug.
  it('the card button stylesheet renders from the Check Availability branch too', () => {
    const button = read('src/components/shop/CartButton.tsx');
    const branch = button.slice(
      button.indexOf('if (item.checkFirst && canPurchase && !inCart)'),
      button.indexOf("if (variant === 'detail') {\n    return (\n      <div"),
    );
    // Only the grid's first card writes the stylesheet; this branch can be that card.
    expect(branch).toContain('{includeCardStyles && <CardButtonStyles />}');
    // One label at every width — the full/compact pair printed "Check Availability Check".
    expect(branch).toContain('className="shop-card-check-label"');
    expect(branch).not.toContain('shop-card-cart-label-compact');
    expect(button).toContain('function CardButtonStyles()');
  });

  it('ticked pieces read "Inquire", never "Available", on the card, list row and item page', () => {
    const card = read('src/components/shop/ProductCard.tsx');
    expect(card).toContain('const isCheckFirst = isPurchasable && product.confirm_availability === true;');
    expect(card).toContain("{isEs ? 'Consultar' : 'Inquire'}");
    expect(card).toContain('{!isSold && !isCheckFirst && (');
    // Its own class: `shop-card-status-available` is hidden on phones.
    expect(card).toContain('shop-card-status-inquire');
    const row = read('src/components/shop/ProductListRow.tsx');
    expect(row).toMatch(/product\.confirm_availability === true\s*\? \(isEs \? 'Consultar' : 'Inquire'\)/);
    const page = read('src/app/[locale]/shop/[id]/page.tsx');
    expect(page).toContain("? checkFirst ? (isEs ? 'Consultar' : 'Inquire') : (isEs ? 'Disponible' : 'Available')");
  });

  it('the item page drops its separate Inquire button for a ticked piece', () => {
    const page = read('src/app/[locale]/shop/[id]/page.tsx');
    expect(page).toContain("product-cta-grid mt-3${checkFirst ? ' product-cta-grid-check' : ''}");
    expect(page).toMatch(/\{!checkFirst && \(\s*<Link href=\{`\$\{contactHref\}\?item=/);
    const css = read('src/app/globals.css');
    expect(css).toContain('.product-cta-grid.product-cta-grid-check {');
  });

  it('ticked items stay in the Meta shop; a Buy tap there opens the ask-first form, never the cart', () => {
    const feed = read('src/app/api/merchant-feed/route.ts');
    expect(feed).not.toContain(".eq('confirm_availability'");
    const meta = read('src/app/[locale]/meta-checkout/page.tsx');
    expect(meta).toContain(".eq('confirm_availability', true)");
    expect(meta).toContain('if (flaggedIds.has(line.item.id))');
    expect(meta).toContain("redirect(`${locale === 'es' ? '/es' : ''}/availability/");
    const handoff = read('src/components/checkout/MetaCheckoutHandoff.tsx');
    expect(handoff).toContain('const goingStraight = lines.length > 0 && unavailable.length === 0 && checkFirst.length === 0;');
  });

  it('Accept and Counter refuse an availability check; Not available can mark the item Sold', () => {
    const server = read('src/lib/offers-server.ts');
    expect(server).toContain("if (offer.kind === 'availability') return fail(409, 'An availability check holds no payment");
    expect(server).toContain("if (offer.kind === 'availability') return fail(409, 'This is an availability check");
    expect(server).toContain('counter_expires_at: availabilityLinkExpiresAt(sentAt).toISOString(),');
    const route = read('src/app/api/admin/offers/[id]/route.ts');
    expect(route).toContain("action === 'unavailable'");
    expect(route).toContain("await adminUpdateProductStatus(result.offer.product_id, 'sold')");
    expect(route).toContain("action === 'available'");
  });

  it('the SQL adds both columns, the anon read grant, and changes no cron', () => {
    const sql = read('../supabase/availability-check-2026-11.sql');
    expect(sql).toContain('add column if not exists confirm_availability boolean not null default false');
    expect(sql).toContain('grant select (confirm_availability) on public.products to anon, authenticated;');
    expect(sql).toContain("add column if not exists kind text not null default 'offer'");
    expect(sql).toContain("check (kind in ('offer', 'availability'))");
    expect(sql).not.toContain('cron.schedule');
  });
});
