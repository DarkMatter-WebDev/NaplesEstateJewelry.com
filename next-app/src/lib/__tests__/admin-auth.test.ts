import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  cookies: new Set<string>(),
  claims: null as Record<string, unknown> | null,
  profile: null as { is_admin: boolean } | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ has: (name: string) => state.cookies.has(name) }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }) }),
  }),
}));

import { requireAdmin } from '../admin-auth';
import { CUSTOMER_MODE_COOKIE } from '../customer-mode-lock';

async function statusOf(result: Awaited<ReturnType<typeof requireAdmin>>): Promise<number | 'ok'> {
  return result.error ? result.error.status : 'ok';
}

describe('requireAdmin', () => {
  beforeEach(() => {
    state.cookies.clear();
    state.claims = { sub: 'user-1', email: 'owner@example.com' };
    state.profile = { is_admin: true };
  });

  it('lets a signed-in admin through, and nobody else', async () => {
    const admin = await requireAdmin();
    expect(await statusOf(admin)).toBe('ok');
    expect(admin.user).toEqual({ id: 'user-1', email: 'owner@example.com' });

    state.profile = { is_admin: false };
    expect(await statusOf(await requireAdmin())).toBe(403);
    state.claims = null;
    expect(await statusOf(await requireAdmin())).toBe(401);
  });

  it('refuses an admin whose browser is in customer input mode (owner, 2026-10-03)', async () => {
    state.cookies.add(CUSTOMER_MODE_COOKIE);
    const locked = await requireAdmin();
    expect(await statusOf(locked)).toBe(423);
    await expect(locked.error?.json()).resolves.toEqual({
      error: 'This device is in customer input mode. Open Buy Receipts and enter the staff code to unlock it.',
    });
    // Explicit `false` is the same as not asking.
    expect(await statusOf(await requireAdmin({ duringCustomerMode: false }))).toBe(423);
  });

  it('still answers the two calls that start and end that mode', async () => {
    state.cookies.add(CUSTOMER_MODE_COOKIE);
    expect(await statusOf(await requireAdmin({ duringCustomerMode: true }))).toBe('ok');
  });

  it('keeps the signed-out and not-an-admin answers the same on a locked browser', async () => {
    state.cookies.add(CUSTOMER_MODE_COOKIE);
    state.profile = { is_admin: false };
    expect(await statusOf(await requireAdmin())).toBe(403);
    // The lock exemption is not a way in for a non-admin.
    expect(await statusOf(await requireAdmin({ duringCustomerMode: true }))).toBe(403);
    state.claims = null;
    expect(await statusOf(await requireAdmin())).toBe(401);
  });

  it('is unaffected by other cookies', async () => {
    state.cookies.add('NEXT_LOCALE');
    expect(await statusOf(await requireAdmin())).toBe('ok');
  });
});
