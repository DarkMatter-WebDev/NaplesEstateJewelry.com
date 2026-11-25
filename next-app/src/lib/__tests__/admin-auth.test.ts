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

  it('no longer reads a customer-input-mode lock (mode removed 2026-11-25): an old lock cookie changes nothing', async () => {
    state.cookies.add('nej_customer_mode');
    expect(await statusOf(await requireAdmin())).toBe('ok');
    state.profile = { is_admin: false };
    expect(await statusOf(await requireAdmin())).toBe(403);
  });

  it('is unaffected by other cookies', async () => {
    state.cookies.add('NEXT_LOCALE');
    expect(await statusOf(await requireAdmin())).toBe('ok');
  });
});
