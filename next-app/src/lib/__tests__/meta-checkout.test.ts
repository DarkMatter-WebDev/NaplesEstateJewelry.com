import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  META_CHECKOUT_MAX_LINES,
  META_CHECKOUT_MAX_QUANTITY,
  parseMetaCheckoutProducts,
} from '@/lib/meta-checkout';

// 2026-10-25: the Meta shop's checkout URL. Meta opens
// /meta-checkout?products=<g:id>:<qty>,…; the page fills the cart and opens
// /checkout. See lib/meta-checkout.ts.

const SRC = join(process.cwd(), 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

describe('parseMetaCheckoutProducts', () => {
  it('reads feed ids with quantities', () => {
    expect(parseMetaCheckoutProducts('nej-123:1,nej-77:2')).toEqual([
      { ref: 'nej-123', inventoryNumber: 123, quantity: 1 },
      { ref: 'nej-77', inventoryNumber: 77, quantity: 2 },
    ]);
  });

  it('accepts a product id (no inventory number) and a missing quantity', () => {
    expect(parseMetaCheckoutProducts('gold-rope-chain-24 ')).toEqual([
      { ref: 'gold-rope-chain-24', inventoryNumber: null, quantity: 1 },
    ]);
  });

  it('merges repeats and clamps bad quantities', () => {
    expect(parseMetaCheckoutProducts('nej-5:1,NEJ-5:2,nej-6:0,nej-7:abc,nej-8:1000')).toEqual([
      { ref: 'nej-5', inventoryNumber: 5, quantity: 3 },
      { ref: 'nej-6', inventoryNumber: 6, quantity: 1 },
      { ref: 'nej-7', inventoryNumber: 7, quantity: 1 },
      { ref: 'nej-8', inventoryNumber: 8, quantity: META_CHECKOUT_MAX_QUANTITY },
    ]);
  });

  it('drops anything that is not a plain id', () => {
    expect(parseMetaCheckoutProducts('../etc:1,<script>:1,,:3,a b:1')).toEqual([]);
    expect(parseMetaCheckoutProducts(null)).toEqual([]);
    expect(parseMetaCheckoutProducts('')).toEqual([]);
  });

  it('caps the number of lines', () => {
    const many = Array.from({ length: 50 }, (_, i) => `nej-${i + 1}:1`).join(',');
    expect(parseMetaCheckoutProducts(many)).toHaveLength(META_CHECKOUT_MAX_LINES);
  });
});

describe('meta checkout wiring', () => {
  const page = read('app', '[locale]', 'meta-checkout', 'page.tsx');
  const handoff = read('components', 'checkout', 'MetaCheckoutHandoff.tsx');

  it('is noindex and stays off the sitemap', () => {
    expect(page).toContain('robots: { index: false, follow: false }');
    expect(read('app', 'sitemap.ts')).not.toContain('meta-checkout');
  });

  it('only adds pieces that are still for sale, built like the product page', () => {
    expect(page).toContain('isProductPurchasable(product.status, product.quantity)');
    expect(page).toContain('productCartItem(product, price)');
    expect(read('app', '[locale]', 'shop', '[id]', 'page.tsx')).toContain('productCartItem(p, price)');
  });

  it('never calls a piece sold when the read failed', () => {
    expect(page).toContain('readFailed ? [] : requested');
  });

  it('waits for the saved cart before adding', () => {
    expect(handoff).toContain('if (!hydrated || done.current) return;');
    expect(read('context', 'CartContext.tsx')).toMatch(/value=\{\{ items, hydrated,/);
  });
});
