import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

/**
 * Shop toolbar sort box (owner, 2026-10-25, "option B"): the sitewide iOS
 * no-zoom rule makes every select 16px on touch screens, which had turned the
 * toolbar's "Inventory order" into 16px bold on a phone. The words are now a
 * small label and the real select lies over them, invisible — so the select
 * can stay 16px (no zoom) while the words keep the original 0.78rem bold.
 */
describe('shop toolbar sort box', () => {
  const component = read('components/shop/ShopSortSelect.tsx');
  const renderer = read('app/[locale]/shop/(list)/shop-page-renderer.tsx');

  it('shows the choice in a label and lays the real select over it', () => {
    expect(component).toContain('<span className="shop-gallery-sort-value" aria-hidden="true">');
    expect(component).toMatch(/<span className="shop-gallery-sort-control">[\s\S]*?<select value=\{currentSort \?\? ''\}/);
    expect(renderer).toMatch(/\.shop-gallery-sort-control select \{[^}]*position: absolute;[^}]*inset: 0;[^}]*opacity: 0;/);
  });

  it('the words keep the toolbar size; the select itself is never sized below 16px', () => {
    expect(renderer).toMatch(/\.shop-gallery-sort-control \{[^}]*font-size: 0\.78rem;[^}]*font-weight: 800;/);
    const selectRule = /\.shop-gallery-sort-control select \{([^}]*)\}/.exec(renderer)?.[1] ?? '';
    expect(selectRule).not.toMatch(/font-size/);
    // The old visible-select rule is gone.
    expect(renderer).not.toMatch(/\.shop-gallery-sort select \{/);
    // The sitewide 16px rule is still what keeps iOS from zooming on tap.
    expect(read('app/globals.css')).toMatch(/@media \(hover: none\) \{\s*:is\(input, select, textarea\)/);
  });

  it('a keyboard user still sees where focus is', () => {
    expect(renderer).toContain('.shop-gallery-sort:has(select:focus-visible)');
  });
});

describe('shop "Products per page" box (same treatment, owner 2026-10-25)', () => {
  const pagination = read('components/shop/ShopPagination.tsx');

  it('shows the number in a label and lays the real select over it', () => {
    expect(pagination).toContain('<span className="shop-pagination-size-value" aria-hidden="true">{perPage}</span>');
    expect(pagination).toMatch(/<span className="shop-pagination-size-control">[\s\S]*?<select\s+value=\{perPage\}/);
    expect(pagination).toMatch(/\.shop-pagination-size-control select \{[^}]*position: absolute;[^}]*inset: 0;[^}]*opacity: 0;/);
    const selectRule = /\.shop-pagination-size-control select \{([^}]*)\}/.exec(pagination)?.[1] ?? '';
    expect(selectRule).not.toMatch(/font-size/);
    expect(pagination).toMatch(/\.shop-pagination-size-control \{[^}]*font-size: 0\.82rem;[^}]*font-weight: 800;/);
    expect(pagination).not.toMatch(/\.shop-pagination-size select \{/);
    expect(pagination).toContain('.shop-pagination-size-control:has(select:focus-visible)');
  });

  it('on a phone "Per page" sits beside its box, never pushed to the far edge', () => {
    const phone = pagination.slice(pagination.indexOf('@media (max-width: 760px)'), pagination.indexOf('@media (max-width: 440px)'));
    expect(phone).toMatch(/\.shop-pagination-size \{\s*justify-content: center;/);
    expect(phone).not.toContain('space-between');
  });
});
