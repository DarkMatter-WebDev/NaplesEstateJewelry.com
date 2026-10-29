import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEARD_ABOUT_CHOICES,
  HEARD_ABOUT_OTHER_MAX,
  heardAboutAdminLabel,
  normalizeHeardAbout,
} from '@/lib/order-heard-about';

// "How did you hear about us?" on the Order Received screen (2026-10-29, owner's
// mockup 2): 11 choices + Other, ONE answer, English keys, write-once per paid
// order, a "Heard About Us" line in Admin → Orders.

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true), getClientIp: () => '127.0.0.1' }));

const updates: Array<{ payload: Record<string, unknown>; filters: string[] }> = [];
let updateResult: { data: Array<{ id: string }> | null; error: { message: string } | null } = { data: [{ id: 'x' }], error: null };
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        const entry = { payload, filters: [`table:${table}`] };
        updates.push(entry);
        const chain = {
          eq: (col: string, val: unknown) => { entry.filters.push(`eq:${col}=${String(val)}`); return chain; },
          is: (col: string, val: unknown) => { entry.filters.push(`is:${col}=${String(val)}`); return chain; },
          select: async () => updateResult,
        };
        return chain;
      },
    }),
  }),
}));

const ORDER_ID = '3f2b8c1e-5a4d-4b6e-9c7f-1a2b3c4d5e6f';

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/orders/heard-about/route');
  const res = await POST(new Request('http://localhost/api/orders/heard-about', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}

describe('the choice list', () => {
  it('is the owner-approved 11 (YouTube, "shopped before", "text or email" removed)', () => {
    expect(HEARD_ABOUT_CHOICES.map((c) => c.en)).toEqual([
      'Google Search', 'Google Maps', 'Instagram', 'Facebook', 'TikTok', 'Yelp', 'Nextdoor',
      'ChatGPT / AI assistant', 'Friend or family', 'Passed the showroom', 'eBay or Etsy',
    ]);
    for (const c of HEARD_ABOUT_CHOICES) {
      expect(c.key).toMatch(/^[a-z_]{1,40}$/); // the SQL format check
      expect(c.es.trim()).not.toBe('');
    }
  });
});

describe('normalizeHeardAbout', () => {
  it('accepts a known key and drops stray text', () => {
    expect(normalizeHeardAbout('instagram', 'ignored')).toEqual({ heardAbout: 'instagram', heardAboutOther: null });
  });
  it('refuses unknown keys and non-strings', () => {
    expect(normalizeHeardAbout('youtube', '')).toBeNull();
    expect(normalizeHeardAbout(3, '')).toBeNull();
    expect(normalizeHeardAbout(undefined, '')).toBeNull();
  });
  it('needs typed text for Other, trims, collapses spaces and caps the length', () => {
    expect(normalizeHeardAbout('other', '   ')).toBeNull();
    expect(normalizeHeardAbout('other', '  Naples   farmers market ')).toEqual({ heardAbout: 'other', heardAboutOther: 'Naples farmers market' });
    expect(normalizeHeardAbout('other', 'x'.repeat(200))?.heardAboutOther).toHaveLength(HEARD_ABOUT_OTHER_MAX);
  });
});

describe('heardAboutAdminLabel', () => {
  it('reads keys back in English, Other with the quote, nothing when skipped', () => {
    expect(heardAboutAdminLabel('friend_family', null)).toBe('Friend or family');
    expect(heardAboutAdminLabel('other', 'Naples farmers market')).toBe('Other — “Naples farmers market”');
    expect(heardAboutAdminLabel(null, null)).toBeNull();
    expect(heardAboutAdminLabel('retired_key', null)).toBe('retired_key');
  });
});

describe('POST /api/orders/heard-about', () => {
  beforeEach(() => {
    updates.length = 0;
    updateResult = { data: [{ id: ORDER_ID }], error: null };
  });

  it('saves once, only on the matching PAID order with no answer yet', async () => {
    const res = await post({ orderId: ORDER_ID, orderNumber: 'NEJ-20261029-K7Q2M', heardAbout: 'other', heardAboutOther: 'Farmers market' });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ heard_about: 'other', heard_about_other: 'Farmers market' });
    expect(updates[0].filters).toEqual([
      'table:orders',
      `eq:id=${ORDER_ID}`,
      'eq:order_number=NEJ-20261029-K7Q2M',
      'eq:payment_status=paid',
      'is:heard_about=null',
    ]);
  });

  it('answers 404 when nothing matched (wrong order, unpaid, or already answered)', async () => {
    updateResult = { data: [], error: null };
    const res = await post({ orderId: ORDER_ID, orderNumber: 'NEJ-1', heardAbout: 'yelp' });
    expect(res.status).toBe(404);
  });

  it('refuses a bad order id or answer before touching the database', async () => {
    expect((await post({ orderId: 'not-a-uuid', orderNumber: 'NEJ-1', heardAbout: 'yelp' })).status).toBe(400);
    expect((await post({ orderId: ORDER_ID, orderNumber: '', heardAbout: 'yelp' })).status).toBe(400);
    expect((await post({ orderId: ORDER_ID, orderNumber: 'NEJ-1', heardAbout: 'youtube' })).status).toBe(400);
    expect((await post({ orderId: ORDER_ID, orderNumber: 'NEJ-1', heardAbout: 'other', heardAboutOther: ' ' })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});

describe('wiring', () => {
  const src = (p: string) => readFileSync(path.join(process.cwd(), 'src', p), 'utf8');

  it('the Order Received screen renders the card with the captured order id', () => {
    const checkout = src('components/checkout/CheckoutClient.tsx');
    expect(checkout).toContain('<HeardAboutCard orderId={createdOrder.orderId} orderNumber={createdOrder.orderNumber} isEs={isEs} />');
    expect(checkout).toContain('onSuccess={({ orderId, orderNumber }) => {');
  });

  it('the admin order page selects both columns and survives a database without them', () => {
    const page = src('app/[locale]/admin/orders/[id]/page.tsx');
    expect(page).toContain("'heard_about',");
    expect(page).toContain("'heard_about_other',");
    expect(page).toContain('isMissingHeardAboutColumnError');
    expect(src('components/admin/OrderDetailPanel.tsx')).toContain('heardAboutAdminLabel(order.heard_about, order.heard_about_other)');
  });
});
