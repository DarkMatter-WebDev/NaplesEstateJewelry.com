import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMarketplaceSaleRecords,
  marketplaceHidePlan,
  marketplaceSalesLabel,
  parseMarketplaceRecordKey,
  splitMarketplaceRows,
  type MarketplaceSaleEventRow,
} from '@/lib/marketplace-sale-records';

// 2026-11-18 (owner): "Give me the option to manually delete orders from eBay /
// Etsy (like we have for normal orders) ... so they just don't exist on the
// Naples Estate Jewelry site" — with bulk checkboxes. ⛔ Deleting HIDES the
// rows (deleted_at → Recycle Bin, purged_at → gone forever); it never erases
// them, because each row is the sales sweep's "already seen" mark.

const row = (over: Partial<MarketplaceSaleEventRow>): MarketplaceSaleEventRow => ({
  channel: 'ebay',
  external_order_id: '01-15423-03542',
  external_line_id: '1',
  product_id: null,
  quantity: 1,
  sale_price: '100.00',
  outcome: 'unmatched',
  title: 'Montblanc 149',
  sold_at: '2026-11-08T23:41:00.000Z',
  marketplace_status: null,
  deleted_at: null,
  purged_at: null,
  created_at: '2026-11-16T17:00:00.000Z',
  ...over,
});

describe('splitMarketplaceRows', () => {
  it('puts live rows in the list, deleted rows in the bin, and drops "deleted forever" rows', () => {
    const live = row({ external_order_id: 'A' });
    const binned = row({ external_order_id: 'B', deleted_at: '2026-11-18T10:00:00Z' });
    const purged = row({ external_order_id: 'C', deleted_at: '2026-11-18T10:00:00Z', purged_at: '2026-11-18T11:00:00Z' });
    const purgedOnly = row({ external_order_id: 'D', purged_at: '2026-11-18T11:00:00Z' });
    const { active, trash } = splitMarketplaceRows([live, binned, purged, purgedOnly]);
    expect(active.map((r) => r.external_order_id)).toEqual(['A']);
    expect(trash.map((r) => r.external_order_id)).toEqual(['B']);
  });

  it('treats rows from before the hide SQL (no columns) as live', () => {
    const old = row({});
    delete old.deleted_at;
    delete old.purged_at;
    expect(splitMarketplaceRows([old]).active).toHaveLength(1);
  });

  it('keeps every line of a deleted order together in the bin', () => {
    const lines = [
      row({ external_order_id: 'E', external_line_id: '1', deleted_at: '2026-11-18T10:00:00Z' }),
      row({ external_order_id: 'E', external_line_id: '2', title: 'Ring', deleted_at: '2026-11-18T10:00:00Z' }),
    ];
    const { active, trash } = splitMarketplaceRows(lines);
    expect(active).toHaveLength(0);
    const records = buildMarketplaceSaleRecords(trash);
    expect(records).toHaveLength(1);
    expect(records[0].items).toEqual(['Montblanc 149', 'Ring']);
  });
});

describe('parseMarketplaceRecordKey', () => {
  it('reads back the keys the list uses', () => {
    expect(parseMarketplaceRecordKey('ebay:01-15423-03542')).toEqual({ channel: 'ebay', externalOrderId: '01-15423-03542' });
    expect(parseMarketplaceRecordKey('etsy:4176386677')).toEqual({ channel: 'etsy', externalOrderId: '4176386677' });
  });

  it('keeps a colon inside the order id', () => {
    expect(parseMarketplaceRecordKey('ebay:a:b')).toEqual({ channel: 'ebay', externalOrderId: 'a:b' });
  });

  it('refuses anything else', () => {
    for (const bad of [null, 42, '', 'ebay', 'ebay:', 'ebay:   ', 'amazon:1', 'site:abc', `ebay:${'x'.repeat(101)}`]) {
      expect(parseMarketplaceRecordKey(bad)).toBeNull();
    }
  });
});

describe('marketplaceHidePlan', () => {
  const now = '2026-11-18T12:00:00.000Z';
  it('delete → Recycle Bin, from the list only', () => {
    expect(marketplaceHidePlan('delete', now)).toEqual({ patch: { deleted_at: now }, onlyInTrash: false });
  });
  it('restore → back to the list, from the bin only', () => {
    expect(marketplaceHidePlan('restore', now)).toEqual({ patch: { deleted_at: null }, onlyInTrash: true });
  });
  it('purge → "deleted forever", from the bin only, never clearing deleted_at', () => {
    expect(marketplaceHidePlan('purge', now)).toEqual({ patch: { purged_at: now }, onlyInTrash: true });
  });
});

describe('marketplaceSalesLabel', () => {
  it('names one sale, or counts several', () => {
    expect(marketplaceSalesLabel([{ channel: 'ebay', externalOrderId: '12-3' }])).toBe('eBay sale 12-3');
    expect(marketplaceSalesLabel([{ channel: 'etsy', externalOrderId: '1' }, { channel: 'etsy', externalOrderId: '2' }])).toBe('2 Etsy sales');
    expect(marketplaceSalesLabel([{ channel: 'ebay', externalOrderId: '1' }, { channel: 'etsy', externalOrderId: '2' }])).toBe('2 eBay / Etsy sales');
  });
});

// ---------------------------------------------------------------------------
// The server writer: UPDATE only, whole orders, the right rows.
// ---------------------------------------------------------------------------
type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
let updateResult: { data: unknown; error: { message: string } | null } = { data: [], error: null };

function chain(table: string) {
  const node: Record<string, unknown> = {};
  for (const method of ['eq', 'in', 'is', 'not', 'order', 'limit']) {
    node[method] = (...args: unknown[]) => { calls.push({ table, op: method, args }); return node; };
  }
  node.select = (...args: unknown[]) => { calls.push({ table, op: 'select', args }); return Promise.resolve(updateResult); };
  return node;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (patch: unknown) => { calls.push({ table, op: 'update', args: [patch] }); return chain(table); },
      delete: () => { calls.push({ table, op: 'delete', args: [] }); throw new Error('rows must never be erased'); },
      select: () => { throw new Error('not used here'); },
    }),
  }),
}));

const requireAdminMock = vi.fn();
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: () => requireAdminMock() }));

beforeEach(() => {
  calls.length = 0;
  updateResult = { data: [], error: null };
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({ supabase: {}, user: { id: 'admin' } });
});

describe('setMarketplaceSalesHidden', () => {
  it('delete updates every line of each order, per channel, only rows still in the list', async () => {
    const { setMarketplaceSalesHidden } = await import('@/lib/marketplace-sale-records-server');
    updateResult = { data: [{ external_order_id: 'A' }, { external_order_id: 'A' }, { external_order_id: 'B' }], error: null };
    const result = await setMarketplaceSalesHidden('delete', [
      { channel: 'ebay', externalOrderId: 'A' },
      { channel: 'ebay', externalOrderId: 'B' },
      { channel: 'ebay', externalOrderId: 'A' },
    ]);
    expect(result).toEqual({ changed: 2 });
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
    const update = calls.find((c) => c.op === 'update');
    expect(update?.table).toBe('marketplace_sale_events');
    expect(Object.keys(update?.args[0] as object)).toEqual(['deleted_at']);
    expect(calls).toContainEqual({ table: 'marketplace_sale_events', op: 'eq', args: ['channel', 'ebay'] });
    expect(calls).toContainEqual({ table: 'marketplace_sale_events', op: 'in', args: ['external_order_id', ['A', 'B']] });
    expect(calls).toContainEqual({ table: 'marketplace_sale_events', op: 'is', args: ['purged_at', null] });
    expect(calls).toContainEqual({ table: 'marketplace_sale_events', op: 'is', args: ['deleted_at', null] });
    // No Etsy target → no Etsy update.
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it('purge only touches rows already in the Recycle Bin', async () => {
    const { setMarketplaceSalesHidden } = await import('@/lib/marketplace-sale-records-server');
    await setMarketplaceSalesHidden('purge', [{ channel: 'etsy', externalOrderId: '9' }]);
    expect(Object.keys(calls.find((c) => c.op === 'update')?.args[0] as object)).toEqual(['purged_at']);
    expect(calls).toContainEqual({ table: 'marketplace_sale_events', op: 'not', args: ['deleted_at', 'is', null] });
    expect(calls).toContainEqual({ table: 'marketplace_sale_events', op: 'is', args: ['purged_at', null] });
  });

  it('says to run the SQL when the columns are missing', async () => {
    const { setMarketplaceSalesHidden } = await import('@/lib/marketplace-sale-records-server');
    updateResult = { data: null, error: { message: 'column marketplace_sale_events.deleted_at does not exist' } };
    const result = await setMarketplaceSalesHidden('delete', [{ channel: 'ebay', externalOrderId: 'A' }]);
    expect(result).toEqual({ error: 'Run supabase/marketplace-sale-hide-2026-11.sql in Supabase first.' });
  });
});

describe('POST /api/admin/orders/marketplace-sales', () => {
  const post = async (body: unknown) => {
    const { POST } = await import('@/app/api/admin/orders/marketplace-sales/route');
    return POST(new Request('http://localhost/api/admin/orders/marketplace-sales', { method: 'POST', body: JSON.stringify(body) }));
  };

  it('is admin-only', async () => {
    const { NextResponse } = await import('next/server');
    requireAdminMock.mockResolvedValue({ error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) });
    const res = await post({ action: 'delete', keys: ['ebay:A'] });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('refuses unknown actions, empty or oversized selections, and foreign keys', async () => {
    expect((await post({ action: 'erase', keys: ['ebay:A'] })).status).toBe(400);
    expect((await post({ action: 'delete', keys: [] })).status).toBe(400);
    expect((await post({ action: 'delete', keys: Array.from({ length: 501 }, (_, i) => `ebay:${i}`) })).status).toBe(400);
    expect((await post({ action: 'delete', keys: ['ebay:A', 'order-uuid'] })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('hides the selected sales and reports how many changed', async () => {
    updateResult = { data: [{ external_order_id: 'A' }], error: null };
    const res = await post({ action: 'restore', keys: ['ebay:A'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, changed: 1 });
    expect(calls.find((c) => c.op === 'update')?.args[0]).toEqual({ deleted_at: null });
  });
});

describe('guards', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

  it('the sales sweep never clears or sets the hide columns (a deleted sale stays deleted)', () => {
    const sweep = read('src/lib/marketplace-sales-sweep.ts');
    expect(sweep).not.toMatch(/deleted_at|purged_at/);
  });

  it('the records server never erases sale rows', () => {
    const server = read('src/lib/marketplace-sale-records-server.ts');
    expect(server).not.toMatch(/\.delete\(/);
  });

  it('the Orders panel posts eBay / Etsy actions to the admin route, never to the table', () => {
    const panel = read('src/components/admin/OrdersPanel.tsx');
    expect(panel).toContain("'/api/admin/orders/marketplace-sales'");
    expect(panel).not.toMatch(/from\('marketplace_sale_events'\)/);
  });
});
