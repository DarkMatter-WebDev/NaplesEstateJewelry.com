import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getVerifiedUser } from '@/lib/auth-claims';
import { fetchSpotData } from '@/lib/spot-price';
import type { SpotData } from '@/types/product';
import type { InStoreProduct } from './SaleItemsEditor';

const PRODUCT_COLUMNS =
  'id, title, status, quantity, inventory_number, category, metal_variant, purity, gram_weight, weight_grams, '
  + 'price_mode, pricing_multiplier, manual_price_label, asking_price, sold_price, image_urls, images';

/**
 * The admin gate + data the Instant Sale pages share (was the In-Store Sale
 * page's own, 2026-09-16): signed-in admin or a redirect, the unread count for
 * the header, and — when a form needs them — the items for sale and spot prices.
 */
export async function loadInstantSalePage(
  locale: string,
  options: { products: boolean },
): Promise<{
  adminBasePath: string;
  userEmail: string | undefined;
  unreadMessagesCount: number;
  products: InStoreProduct[];
  spotData: SpotData | null;
}> {
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect(isEs ? '/es/account' : '/account');

  const service = createServiceClient();
  const [{ count }, productsResult, spotData] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    options.products
      ? service
        .from('products')
        .select(PRODUCT_COLUMNS)
        .in('status', ['available', 'Available'])
        .order('inventory_number', { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    options.products ? fetchSpotData() : Promise.resolve(null),
  ]);

  return {
    adminBasePath,
    userEmail: user.email ?? undefined,
    unreadMessagesCount: count ?? 0,
    products: (productsResult.data ?? []) as unknown as InStoreProduct[],
    spotData,
  };
}
