import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSpecialPriceDefault,
  normalizeSpecialPriceDefaultBasis,
  saveSpecialPriceDefault,
} from '../shop-settings';

const NEW_COLUMNS = /special_price_default_(basis|discount_percent)/;

/**
 * A stand-in for the one shop_settings row. `migrated: false` behaves like a
 * database where shop-trade-in-asking-discount-2026-10.sql has not run yet:
 * any read or write naming the new columns fails the way PostgREST does.
 */
function fakeClient(row: Record<string, unknown>, migrated: boolean) {
  const upserts: Record<string, unknown>[] = [];
  const missing = (cols: string) => !migrated && NEW_COLUMNS.test(cols);
  const client = {
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () =>
            missing(cols)
              ? { data: null, error: { message: 'column shop_settings.special_price_default_basis does not exist' } }
              : { data: row, error: null },
        }),
      }),
      upsert: async (value: Record<string, unknown>) => {
        if (missing(Object.keys(value).join(','))) {
          return { error: { message: "Could not find the 'special_price_default_basis' column of 'shop_settings' in the schema cache" } };
        }
        upserts.push(value);
        return { error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

describe('site-wide trade-in basis', () => {
  it('normalizes anything but "asking" to the original melt basis', () => {
    expect(normalizeSpecialPriceDefaultBasis('asking')).toBe('asking');
    expect(normalizeSpecialPriceDefaultBasis('melt')).toBe('melt');
    expect(normalizeSpecialPriceDefaultBasis(null)).toBe('melt');
    expect(normalizeSpecialPriceDefaultBasis('ASKING')).toBe('melt');
  });

  it('reads the basis and the discount once the SQL has run', async () => {
    const { client } = fakeClient(
      {
        special_price_default_enabled: true,
        special_price_default_percent: 20,
        special_price_default_basis: 'asking',
        special_price_default_discount_percent: 15,
      },
      true,
    );
    expect(await fetchSpecialPriceDefault(client)).toEqual({ enabled: true, basis: 'asking', percent: 20, discountPercent: 15 });
  });

  it('before the SQL, still reads the melt setting instead of switching it off', async () => {
    const { client } = fakeClient({ special_price_default_enabled: true, special_price_default_percent: 20 }, false);
    expect(await fetchSpecialPriceDefault(client)).toEqual({ enabled: true, basis: 'melt', percent: 20, discountPercent: null });
  });

  it('before the SQL, a melt save still works (without the new columns)', async () => {
    const { client, upserts } = fakeClient({}, false);
    await saveSpecialPriceDefault(client, { enabled: true, basis: 'melt', percent: 20, discountPercent: null });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ special_price_default_enabled: true, special_price_default_percent: 20 });
    expect(upserts[0]).not.toHaveProperty('special_price_default_basis');
  });

  it('before the SQL, an asking-price save says to run the SQL', async () => {
    const { client } = fakeClient({}, false);
    await expect(
      saveSpecialPriceDefault(client, { enabled: true, basis: 'asking', percent: 20, discountPercent: 15 }),
    ).rejects.toThrow(/shop-trade-in-asking-discount-2026-10\.sql/);
  });

  it('after the SQL, saves both numbers so each choice keeps its own', async () => {
    const { client, upserts } = fakeClient({}, true);
    await saveSpecialPriceDefault(client, { enabled: true, basis: 'asking', percent: 20, discountPercent: 15 });
    expect(upserts[0]).toMatchObject({
      special_price_default_basis: 'asking',
      special_price_default_percent: 20,
      special_price_default_discount_percent: 15,
    });
  });
});
