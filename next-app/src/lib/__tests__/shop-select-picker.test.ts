import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shopSelectPickerCss } from '../shop-select-picker';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

// Owner, 2026-10-25: the shop's dropdown list had "no margin buffer on the left
// side and looks a little cramped" → mockup → "Build Option B, and give the
// Products per page list the same look."
describe('shop dropdown lists (Option B)', () => {
  const css = shopSelectPickerCss('.box');

  it('applies on computers only, and only where the browser can restyle the list', () => {
    expect(css).toMatch(/@media \(hover: hover\) \{\s*@supports \(appearance: base-select\) \{/);
    // ⛔ Phones keep their own picker and the 16px no-zoom rule: nothing here
    // may change the select's size, opacity or position.
    expect(css).not.toMatch(/font-size: (?!0\.86rem)/);
    expect(css).not.toMatch(/\.box select \{[^}]*(opacity|position|inset)/);
  });

  it('draws the Option B list: room on the left, gold edge, gold highlight, gold check', () => {
    expect(css).toContain('.box select::picker(select)');
    expect(css).toMatch(/\.box option \{[^}]*padding: 8px 12px 8px 8px;/);
    expect(css).toMatch(/::picker\(select\) \{[^}]*border: 1px solid rgba\(115, 92, 0, 0\.28\);[^}]*border-radius: 8px;/);
    expect(css).toMatch(/\.box option::checkmark \{\s*color: var\(--color-primary\);/);
    expect(css).toMatch(/\.box option:hover,\s*\.box option:focus-visible \{\s*background: color-mix\(in srgb, var\(--color-primary\) 12%, #ffffff\);/);
    expect(css).toContain('min-width: anchor-size(width)');
  });

  it('is the LAST thing in both style blocks, so it wins over their appearance: none', () => {
    const renderer = read('src', 'app', '[locale]', 'shop', '(list)', 'shop-page-renderer.tsx');
    const pagination = read('src', 'components', 'shop', 'ShopPagination.tsx');
    expect(renderer).toMatch(/\$\{shopSelectPickerCss\('\.shop-gallery-sort-control'\)\}\s*`\}<\/style>/);
    expect(pagination).toMatch(/\$\{shopSelectPickerCss\('\.shop-pagination-size-control'\)\}\s*`\}<\/style>/);
  });
});
