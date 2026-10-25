import type { Metadata } from 'next';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import MetaCheckoutHandoff from '@/components/checkout/MetaCheckoutHandoff';
import type { CartItem } from '@/context/CartContext';
import { createPublicClient } from '@/lib/supabase/public';
import { fetchSpotData } from '@/lib/spot-price';
import { fetchShopVisibilitySettings } from '@/lib/shop-settings';
import { getStorefrontDisplayPrice } from '@/lib/pricing';
import { parseMetaCheckoutProducts } from '@/lib/meta-checkout';
import { CART_ITEM_PRODUCT_COLUMNS, productCartItem } from '@/lib/product-cart-item';
import { isProductPurchasable, isProductVisibleInShop, type Product } from '@/types/product';

/**
 * `/meta-checkout` — the "checkout URL" of the Meta (Instagram / Facebook)
 * shop, 2026-10-25. Meta sends `?products=nej-123:1,…`; the available pieces
 * go in the cart and the shopper lands on /checkout. Utility page: noindex,
 * off the sitemap. Rules in lib/meta-checkout.ts.
 */

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ products?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'es' ? 'Finalizar Compra' : 'Checkout',
    robots: { index: false, follow: false },
  };
}

export default async function MetaCheckoutPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { products } = await searchParams;
  const requested = parseMetaCheckoutProducts(Array.isArray(products) ? products.join(',') : products);

  const lines: { item: CartItem; quantity: number }[] = [];
  const unavailable: string[] = [];

  if (requested.length > 0) {
    const supabase = createPublicClient();
    const inventoryNumbers = requested.flatMap((line) => line.inventoryNumber ?? []);
    const ids = requested.filter((line) => line.inventoryNumber == null).map((line) => line.ref);

    const [byInventory, byId, spotData, visibility] = await Promise.all([
      inventoryNumbers.length
        ? supabase.from('products').select(CART_ITEM_PRODUCT_COLUMNS).in('inventory_number', inventoryNumbers)
          .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase.from('products').select(CART_ITEM_PRODUCT_COLUMNS).in('id', ids)
        : Promise.resolve({ data: [], error: null }),
      fetchSpotData(),
      fetchShopVisibilitySettings(supabase),
    ]);

    const rows = [
      ...((byInventory.data ?? []) as unknown as Product[]),
      ...((byId.data ?? []) as unknown as Product[]),
    ];

    // A failed read must never tell a shopper that a piece has sold: with
    // nothing in either list the page shows "couldn't find" + shop / call.
    const readFailed = Boolean(byInventory.error || byId.error);

    for (const line of readFailed ? [] : requested) {
      // Newest first, as /p/<inventory#> resolves a reused number.
      const product = line.inventoryNumber != null
        ? rows.find((row) => row.inventory_number === line.inventoryNumber)
        : rows.find((row) => row.id === line.ref);
      if (product && isProductVisibleInShop(product.status) && isProductPurchasable(product.status, product.quantity)) {
        const price = getStorefrontDisplayPrice(product, spotData, visibility.hideSoldItemPrices, locale);
        lines.push({ item: productCartItem(product, price), quantity: line.quantity });
      } else {
        unavailable.push(product ? (locale === 'es' && product.title_es ? product.title_es : product.title) : line.ref);
      }
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="site-header-offset">
        <MetaCheckoutHandoff locale={locale} lines={lines} unavailable={unavailable} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
