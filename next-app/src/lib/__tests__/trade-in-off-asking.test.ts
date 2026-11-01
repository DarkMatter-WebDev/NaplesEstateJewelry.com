import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner 2026-10-31: the item form's trade-in "Override Type" gains "Percent off
// asking price" and "Dollar amount off asking price". The math lives in
// types/product.ts (tested in types/__tests__/product.test.ts); these pin the
// wiring that a refactor could silently break.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('trade-in off the asking price — wiring', () => {
  it('the SQL allows all four choices, adds both number columns and lets the storefront read them', () => {
    const sql = read('..', 'supabase', 'product-trade-in-off-asking-2026-10.sql');
    expect(sql).toContain("check (special_price_override_mode in ('amount', 'percent', 'asking_percent', 'asking_amount'))");
    expect(sql).toContain('add column if not exists special_price_override_discount_percent numeric(5,2)');
    expect(sql).toContain('add column if not exists special_price_override_discount_amount  numeric(12,2)');
    expect(sql).toContain('grant select (special_price_override_discount_percent, special_price_override_discount_amount)');
    expect(sql).toContain('on public.products to anon, authenticated;');
    // The canonical schema file agrees.
    expect(read('..', 'supabase', 'products.sql')).toContain("'amount', 'percent', 'asking_percent', 'asking_amount'");
  });

  it('the product page reads both new columns (and degrades without them)', () => {
    const page = read('src', 'app', '[locale]', 'shop', '[id]', 'page.tsx');
    // In the select list AND the optional list (plus the narrow fallback's own list).
    expect(page.match(/'special_price_override_discount_percent',/g)?.length).toBeGreaterThanOrEqual(2);
    expect(page.match(/'special_price_override_discount_amount',/g)?.length).toBeGreaterThanOrEqual(2);
    expect(page).toContain('special_price_override_discount_percent: null,');
    expect(page).toContain('getProductPriceValue(p, spotData)');
  });

  it('the item form offers both choices, saves only the chosen number, and never drops the override silently', () => {
    const shell = read('src', 'components', 'admin', 'AdminShell.tsx');
    expect(shell).toContain('<option value="asking_percent">Percent off asking price</option>');
    expect(shell).toContain('<option value="asking_amount">Dollar amount off asking price</option>');
    expect(shell).toMatch(/=== 'asking_percent'\s*\? editing\.special_price_override_discount_percent \?\? null/);
    expect(shell).toMatch(/=== 'asking_amount'\s*\? editing\.special_price_override_discount_amount \?\? null/);
    // Before the SQL runs, the generic "retry without optional columns" would
    // save the item WITHOUT its override — both save paths stop and say so,
    // inside the editor (flash() paints behind it).
    expect(shell.match(/isMissingTradeInOffAskingError\(error\) && usesTradeInOffAsking\(payload\)/g)?.length).toBe(2);
    expect(shell.match(/setFormErrors\(\[TRADE_IN_OFF_ASKING_SQL_NOTICE\]\)/g)?.length).toBe(2);
    // An amount that leaves $0 or less is refused at save.
    expect(shell).toContain('must be less than the asking price');
  });

  it('before the SQL runs, only the two new columns are dropped — never offers, quantity or other overrides', () => {
    const shell = read('src', 'components', 'admin', 'AdminShell.tsx');
    expect(shell.match(/isMissingOffAskingColumnError\(error\)\s*\? withoutOffAskingColumns\(payload\)/g)?.length).toBe(2);
    const page = read('src', 'app', '[locale]', 'shop', '[id]', 'page.tsx');
    expect(page).toContain('.select(PRODUCT_DETAIL_COLUMNS_WITHOUT_OFF_ASKING)');
    expect(page.indexOf('isMissingOffAskingColumnError(result.error)')).toBeLessThan(page.indexOf('isMissingOptionalColumnError(result.error)'));
  });
});
