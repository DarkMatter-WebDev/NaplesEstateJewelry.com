import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { getVerifiedUser } from '@/lib/auth-claims';

function clientWithClaims(result: unknown) {
  return {
    auth: {
      getClaims: async () => result,
    },
  } as unknown as SupabaseClient;
}

describe('getVerifiedUser', () => {
  it('returns the verified subject and email claims', async () => {
    const user = await getVerifiedUser(clientWithClaims({
      data: { claims: { sub: 'admin-id', email: 'admin@example.com' } },
      error: null,
    }));

    expect(user).toEqual({ id: 'admin-id', email: 'admin@example.com' });
  });

  it('rejects failed or subject-less claim verification', async () => {
    await expect(getVerifiedUser(clientWithClaims({ data: null, error: new Error('invalid') }))).resolves.toBeNull();
    await expect(getVerifiedUser(clientWithClaims({ data: { claims: { email: 'admin@example.com' } }, error: null }))).resolves.toBeNull();
  });
});
