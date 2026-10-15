import type { Product } from '@/types/product';

const ADMIN_PRODUCT_SUMMARY_KEYS = [
  'id',
  'category',
  'metal_type',
  'metal_variant',
  'title',
  'title_es',
  'price_mode',
  'purity',
  'weight_grams',
  'inventory_number',
  'sku',
  'metal',
  'gram_weight',
  'brand',
  'product_type',
  'jewelry_type',
  'chain_type',
  'length',
  'pricing_multiplier',
  'quantity',
  'status',
  'location',
  'image_urls',
  'image_padding',
  'image_padding_by_image',
  'manual_price_label',
  'asking_price',
  'gender',
  'item_year',
  'tags',
  'featured',
  'sort_order',
] as const satisfies readonly (keyof Product)[];

export const ADMIN_PRODUCT_SUMMARY_COLUMNS_WITHOUT_SOLD_PRICE = ADMIN_PRODUCT_SUMMARY_KEYS.join(', ');
export const ADMIN_PRODUCT_SUMMARY_COLUMNS = `${ADMIN_PRODUCT_SUMMARY_COLUMNS_WITHOUT_SOLD_PRICE}, sold_price`;

export function isMissingSoldPriceColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('sold_price'));
}

export function toAdminProductSummary(product: Partial<Product>): Product {
  const summary: Partial<Product> = {};
  for (const key of ADMIN_PRODUCT_SUMMARY_KEYS) {
    (summary as Record<string, unknown>)[key] = product[key];
  }

  if (Object.prototype.hasOwnProperty.call(product, 'sold_price')) {
    summary.sold_price = product.sold_price ?? null;
  }
  // Not a selected column (the Products page loads the same before
  // make-offer-2026-10.sql runs); kept when present so a save does not blank
  // the table's Offers column until the next counts refresh.
  if (Object.prototype.hasOwnProperty.call(product, 'accepts_offers')) {
    summary.accepts_offers = product.accepts_offers === true;
  }

  const imageUrls = product.image_urls?.length ? product.image_urls : product.images ?? [];
  // Keep one URL-array copy for reference-safe image cleanup, but avoid shipping
  // the legacy mirrored array as a second copy in the initial RSC payload.
  summary.images = [];
  summary.image_urls = imageUrls;
  return summary as Product;
}
