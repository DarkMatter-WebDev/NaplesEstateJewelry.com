import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rateLimitState: vi.fn(),
  cookies: new Set<string>(),
}));

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitState: mocks.rateLimitState }));
vi.mock('next/headers', () => ({ cookies: async () => ({ has: (name: string) => mocks.cookies.has(name) }) }));

import { DELETE, GET, POST } from './route';
import { BUY_RECEIPT_STAFF_CODE } from '@/lib/buy-receipt-staff-code';

const ADMIN = { supabase: {}, user: { id: 'admin-1', email: 'owner@example.com' } };

function unlock(code: unknown) {
  return DELETE(
    new Request('https://example.com/api/admin/buy-receipts/customer-mode', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );
}

describe('customer input mode: the lock route', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue(ADMIN);
    mocks.rateLimitState.mockReset().mockResolvedValue('ok');
    mocks.cookies.clear();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('is admin-only, and is the one route a locked browser may still call', async () => {
    mocks.requireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect((await POST()).status).toBe(401);
    expect((await unlock(BUY_RECEIPT_STAFF_CODE)).status).toBe(401);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(3);
    for (const call of mocks.requireAdmin.mock.calls) expect(call).toEqual([{ duringCustomerMode: true }]);
    // A refused caller never reaches the code check or its counter.
    expect(mocks.rateLimitState).not.toHaveBeenCalled();
  });

  it('GET tells this browser\'s other tabs whether it is locked, and is never cached', async () => {
    const open = await GET();
    expect(open.status).toBe(200);
    await expect(open.json()).resolves.toEqual({ locked: false });
    expect(open.headers.get('cache-control')).toBe('no-store');
    // Asking changes nothing.
    expect(open.headers.get('set-cookie')).toBeNull();

    mocks.cookies.add('nej_customer_mode');
    await expect((await GET()).json()).resolves.toEqual({ locked: true });
  });

  it('POST locks this browser with a cookie page scripts cannot touch', async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ locked: true });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^nej_customer_mode=1;/);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=43200/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it('DELETE unlocks only with the staff code', async () => {
    for (const wrong of ['0000', '250', '', null, 2500]) {
      const refused = await unlock(wrong);
      expect(refused.status, String(wrong)).toBe(403);
      await expect(refused.json()).resolves.toEqual({ error: 'That code is not right.' });
      // The lock stays: no cookie is sent back.
      expect(refused.headers.get('set-cookie')).toBeNull();
    }

    const opened = await unlock(BUY_RECEIPT_STAFF_CODE);
    expect(opened.status).toBe(200);
    await expect(opened.json()).resolves.toEqual({ locked: false });
    const cookie = opened.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^nej_customer_mode=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('counts every try for the signed-in admin, five per half minute', async () => {
    await unlock('1234');
    expect(mocks.rateLimitState).toHaveBeenCalledWith('buy-receipt-code:admin-1', 5, 30);
  });

  it('refuses even the right code once the tries are used up', async () => {
    mocks.rateLimitState.mockResolvedValue('limited');
    const response = await unlock(BUY_RECEIPT_STAFF_CODE);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'Too many tries. Wait half a minute, then try again.', waitSeconds: 30 });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('still unlocks with the right code when the counter cannot be reached', async () => {
    mocks.rateLimitState.mockResolvedValue('unavailable');
    expect((await unlock('1234')).status).toBe(403);
    expect((await unlock(BUY_RECEIPT_STAFF_CODE)).status).toBe(200);
  });

  it('treats a body that is not JSON as a wrong code', async () => {
    const response = await DELETE(new Request('https://example.com/api/admin/buy-receipts/customer-mode', { method: 'DELETE', body: 'not json' }));
    expect(response.status).toBe(403);
  });
});
