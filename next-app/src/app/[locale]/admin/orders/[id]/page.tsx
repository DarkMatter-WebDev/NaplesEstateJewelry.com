import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import OrderDetailPanel from '@/components/admin/OrderDetailPanel';
import { loadOrderTaxExemption } from '@/lib/tax-exempt-server';
import { formatPickupHours } from '@/lib/order-invoice-email';
import { getStoreHours } from '@/lib/store-hours';
import AdminHeader from '@/components/admin/AdminHeader';
import type { Order, OrderItem } from '@/types/sales';
import type { Product } from '@/types/product';
import { calcSpotMeltValue } from '@/lib/pricing';
import { fetchSpotData } from '@/lib/spot-price';

export const metadata: Metadata = { title: 'Admin - Order Detail' };

const ORDER_DETAIL_COLUMNS = [
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
  'shipping_carrier',
  'tracking_number',
  'shipping_address',
  'billing_address',
  'internal_notes',
  'customer_notes',
  'heard_about',
  'heard_about_other',
  'refund_amount',
  'deleted_at',
  'created_at',
  'updated_at',
  'order_items(id, order_id, product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');

type OrderColumnSupport = {
  tracking: boolean;
  itemYearAndQuantity: boolean;
  refundAmount: boolean;
  deletedAt: boolean;
  heardAbout: boolean;
};

function getOrderDetailColumns(support: OrderColumnSupport) {
  let columns = ORDER_DETAIL_COLUMNS;
  if (!support.tracking) {
    columns = columns
      .replace('shipping_carrier, ', '')
      .replace('tracking_number, ', '');
  }
  // item_year_snapshot and quantity were added together; a database missing
  // either predates that migration, so strip them as a pair.
  if (!support.itemYearAndQuantity) {
    columns = columns
      .replace('item_year_snapshot, ', '')
      .replace('quantity, ', '');
  }
  if (!support.refundAmount) columns = columns.replace('refund_amount, ', '');
  if (!support.deletedAt) columns = columns.replace('deleted_at, ', '');
  // Before `supabase/order-heard-about-2026-10.sql` runs, the order still opens.
  if (!support.heardAbout) {
    columns = columns
      .replace('heard_about, ', '')
      .replace('heard_about_other, ', '');
  }
  return columns;
}

function isMissingHeardAboutColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('heard_about'));
}

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

function isMissingRefundAmountError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('refund_amount'));
}

function isMissingDeletedAtColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('deleted_at'));
}

function isMissingTrackingColumnError(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes('shipping_carrier') || message.includes('tracking_number');
}

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  created_at: string;
};

type OrderEmail = {
  id: string;
  email_type: string;
  recipient: string;
  subject: string | null;
  status: string | null;
  sent_by_email: string | null;
  created_at: string;
};

export default async function AdminOrderDetailPage({ params }: Props) {
  const { locale, id } = await params;
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

  const [initialOrderResult, { data: invoices }, { count: unreadMessagesCount }, orderEmailsResult] = await Promise.all([
    supabase
      .from('orders')
      .select(ORDER_DETAIL_COLUMNS)
      .eq('id', id)
      .single(),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
    // Email history for this order. Degrades to [] if the table isn't migrated yet.
    supabase
      .from('order_emails')
      .select('id, email_type, recipient, subject, status, sent_by_email, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
  ]);
  const orderEmails = (orderEmailsResult?.data ?? []) as OrderEmail[];
  const columnSupport: OrderColumnSupport = {
    tracking: true,
    itemYearAndQuantity: true,
    refundAmount: true,
    deletedAt: true,
    heardAbout: true,
  };
  let orderResult = initialOrderResult;

  for (let attempt = 0; orderResult.error && attempt < 5; attempt += 1) {
    let changed = false;
    if (columnSupport.tracking && isMissingTrackingColumnError(orderResult.error)) {
      columnSupport.tracking = false;
      changed = true;
    }
    if (columnSupport.itemYearAndQuantity && isMissingItemYearColumnError(orderResult.error)) {
      columnSupport.itemYearAndQuantity = false;
      changed = true;
    }
    if (columnSupport.refundAmount && isMissingRefundAmountError(orderResult.error)) {
      columnSupport.refundAmount = false;
      changed = true;
    }
    if (columnSupport.deletedAt && isMissingDeletedAtColumnError(orderResult.error)) {
      columnSupport.deletedAt = false;
      changed = true;
    }
    if (columnSupport.heardAbout && isMissingHeardAboutColumnError(orderResult.error)) {
      columnSupport.heardAbout = false;
      changed = true;
    }
    if (!changed) break;

    orderResult = await supabase
      .from('orders')
      .select(getOrderDetailColumns(columnSupport))
      .eq('id', id)
      .single();
  }

  const order = orderResult.data;
  const recycleBinSupported = columnSupport.deletedAt && !orderResult.error;
  const trackingSupported = columnSupport.tracking && !orderResult.error;

  if (!order) notFound();

  // Live melt value per linked product for the Items table. Item rows keep
  // their sale-time snapshots; melt is inherently a live estimate, so it is
  // computed from the current product rows plus spot and omitted when the
  // product is gone or has no weight/purity.
  const orderItems = (order as unknown as Order & { order_items: OrderItem[] }).order_items ?? [];
  const meltProductIds = Array.from(
    new Set(orderItems.map((item) => item.product_id).filter((value): value is string => Boolean(value))),
  );
  const itemMeltValues: Record<string, number> = {};
  if (meltProductIds.length > 0) {
    const [{ data: meltProducts }, spotData] = await Promise.all([
      supabase
        .from('products')
        .select('id, category, purity, gram_weight, weight_grams')
        .in('id', meltProductIds),
      fetchSpotData(),
    ]);
    for (const product of meltProducts ?? []) {
      const melt = calcSpotMeltValue(product as unknown as Product, spotData);
      if (melt != null) itemMeltValues[String(product.id)] = melt;
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader
        adminBasePath={adminBasePath}
        active="orders"
        unreadMessagesCount={unreadMessagesCount ?? 0}
        userEmail={user.email}
      />

      <OrderDetailPanel
        pickupHours={formatPickupHours(await getStoreHours())}
        initialOrder={order as unknown as Order & { order_items: OrderItem[] }}
        itemMeltValues={itemMeltValues}
        initialInvoices={(invoices ?? []) as Invoice[]}
        initialOrderEmails={orderEmails}
        adminEmail={user.email ?? null}
        locale={locale}
        recycleBinSupported={recycleBinSupported}
        trackingSupported={trackingSupported}
        taxExemption={await loadOrderTaxExemption(supabase, id)}
      />
    </div>
  );
}
