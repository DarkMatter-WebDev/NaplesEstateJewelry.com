import type { CartItem } from '@/context/CartContext';
import { normalizeProductStatus, productImagePaddingForImage, type Product } from '@/types/product';

/**
 * The cart item a product page's "Add to cart" puts in the cart. Shared by the
 * product page and the Meta checkout hand-off (`/meta-checkout`, 2026-10-25),
 * so a piece added from Instagram is the same item as one added on the site.
 * `priceLabel` is display only; checkout recomputes every price on the server.
 */
export function productCartItem(p: Product, priceLabel: string): CartItem {
  const productImages = p.image_urls?.length ? p.image_urls : p.images ?? [];
  return {
    id: p.id,
    title: p.title,
    title_es: p.title_es,
    description: p.description,
    description_es: p.description_es,
    public_notes: p.public_notes,
    image: productImages[0] ?? null,
    image_padding: productImagePaddingForImage(p.image_padding, p.image_padding_by_image, productImages[0], 0),
    status: normalizeProductStatus(p.status),
    stockQuantity: p.quantity,
    priceLabel,
    category: p.category,
    metal_type: p.metal_type,
    metal_variant: p.metal_variant,
    purity: p.purity,
    weight_grams: p.weight_grams,
    gram_weight: p.gram_weight,
    product_type: p.product_type,
    jewelry_type: p.jewelry_type,
    chain_type: p.chain_type,
    length: p.length,
    brand: p.brand,
    item_year: p.item_year,
    tags: p.tags,
    tags_es: p.tags_es,
    gender: p.gender,
  };
}

/** Every column `productCartItem` and the storefront price label read. */
export const CART_ITEM_PRODUCT_COLUMNS = [
  'id', 'inventory_number', 'status', 'quantity', 'created_at',
  'title', 'title_es', 'description', 'description_es', 'public_notes',
  'images', 'image_urls', 'image_padding', 'image_padding_by_image',
  'category', 'metal_type', 'metal_variant', 'purity', 'weight_grams', 'gram_weight',
  'product_type', 'jewelry_type', 'chain_type', 'length', 'brand', 'item_year',
  'tags', 'tags_es', 'gender',
  'price_mode', 'pricing_multiplier', 'manual_price_label', 'sold_price',
].join(', ');
