import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import OrdersPanel from '@/components/admin/OrdersPanel';
import AdminHeader from '@/components/admin/AdminHeader';
import type { Order } from '@/types/sales';
import { loadMarketplaceSaleRecords } from '@/lib/marketplace-sale-records-server';

export const metadata: Metadata = { title: 'Admin - Orders' };

const ORDER_LIST_COLUMNS = [
  'id',
  'order_number',
  'user_id',
  'customer_name',
  'customer_email',
  'customer_phone',
  'subtotal',
  'tax',
  'shipping_fee',
  'discount',
  'total',
  'payment_status',
  'fulfillment_status',
  'order_status',
  'payment_method',
  'payment_reference',
  'shipping_method',
  'shipping_address',
  'billing_address',
  'internal_notes',
  'customer_notes',
  'deleted_at',
  'created_at',
  'updated_at',
  'order_items(id, order_id, product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');
const ORDER_LIST_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT = ORDER_LIST_COLUMNS
  .replace('item_year_snapshot, ', '')
  .replace('quantity, ', '');
const ORDER_LIST_COLUMNS_WITHOUT_DELETED_AT = ORDER_LIST_COLUMNS.replace('deleted_at, ', '');
const ORDER_LIST_COLUMNS_WITHOUT_BOTH = ORDER_LIST_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT.replace('deleted_at, ', '');

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

function isMissingDeletedAtColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('deleted_at'));
}

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string }>;
}

export default async function AdminOrdersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { view } = await searchParams;
  const isTrash = view === 'trash';
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    redirect(isEs ? '/es/account' : '/account');
  }

  const ordersQuery = supabase
    .from('orders')
    .select(ORDER_LIST_COLUMNS)
    .order('created_at', { ascending: false });
  const filteredOrdersQuery = isTrash
    ? ordersQuery.not('deleted_at', 'is', null)
    : ordersQuery.is('deleted_at', null);

  const [ordersResult, { count: unreadMessagesCount }, trashCountResult, marketplaceRecords] = await Promise.all([
    filteredOrdersQuery,
    supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('deleted_at', 'is', null),
    // eBay / Etsy sale records, mixed into the list (2026-11-16). Not in the Recycle Bin.
    isTrash ? Promise.resolve([]) : loadMarketplaceSaleRecords(),
  ]);
  let orders = ordersResult.data;
  let recycleBinSupported = !ordersResult.error;
  if (ordersResult.error) {
    recycleBinSupported = !isMissingDeletedAtColumnError(ordersResult.error);
    if (isMissingItemYearColumnError(ordersResult.error) && recycleBinSupported) {
      const fallbackQuery = supabase
        .from('orders')
        .select(ORDER_LIST_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT)
        .order('created_at', { ascending: false });
      const fallback = await (isTrash
        ? fallbackQuery.not('deleted_at', 'is', null)
        : fallbackQuery.is('deleted_at', null));
      orders = fallback.data;
      recycleBinSupported = !fallback.error;
    } else if (isMissingDeletedAtColumnError(ordersResult.error)) {
      recycleBinSupported = false;
      if (isTrash) {
        orders = [];
      } else {
        const fallback = await supabase
          .from('orders')
          .select(isMissingItemYearColumnError(ordersResult.error) ? ORDER_LIST_COLUMNS_WITHOUT_BOTH : ORDER_LIST_COLUMNS_WITHOUT_DELETED_AT)
          .order('created_at', { ascending: false });
        orders = fallback.data;
      }
    }
  }
  const trashCount = recycleBinSupported ? trashCountResult.count ?? 0 : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader
        adminBasePath={adminBasePath}
        active="orders"
        unreadMessagesCount={unreadMessagesCount ?? 0}
        userEmail={user.email}
      />

      <OrdersPanel
        initialOrders={(orders ?? []) as unknown as Order[]}
        products={[]}
        spotData={null}
        locale={locale}
        view={isTrash ? 'trash' : 'active'}
        trashCount={trashCount}
        recycleBinSupported={recycleBinSupported}
        marketplaceRecords={marketplaceRecords}
      />
    </div>
  );
}
