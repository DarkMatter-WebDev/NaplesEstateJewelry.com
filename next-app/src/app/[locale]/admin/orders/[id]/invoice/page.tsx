import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import { buildInvoiceEmailContent, formatPickupHours } from '@/lib/order-invoice-email';
import { getStoreHours } from '@/lib/store-hours';
import type { Order, OrderItem } from '@/types/sales';
import CustomerModeTabGuard from '@/components/admin/buy-receipts/CustomerModeTabGuard';
import PrintInvoiceClient from './PrintInvoiceClient';

export const metadata: Metadata = { title: 'Print Invoice' };

const INVOICE_COLUMNS = [
  'id',
  'order_number',
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
  'shipping_method',
  'shipping_address',
  'created_at',
  'order_items(id, order_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot)',
].join(', ');

const INVOICE_COLUMNS_WITHOUT_ITEM_YEAR = INVOICE_COLUMNS
  .replace('item_year_snapshot, ', '')
  .replace('quantity, ', '');

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default async function AdminOrderInvoicePrintPage({ params }: Props) {
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

  const [orderResult, { data: invoices }] = await Promise.all([
    supabase.from('orders').select(INVOICE_COLUMNS).eq('id', id).single(),
    supabase
      .from('invoices')
      .select('invoice_number')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  let order = orderResult.data;
  if (isMissingItemYearColumnError(orderResult.error)) {
    const fallback = await supabase
      .from('orders')
      .select(INVOICE_COLUMNS_WITHOUT_ITEM_YEAR)
      .eq('id', id)
      .single();
    order = fallback.data;
  }

  if (!order) notFound();

  const typedOrder = order as unknown as Order & { order_items: OrderItem[] };
  const latestInvoiceNumber = invoices?.[0]?.invoice_number ?? null;
  const invoiceContent = buildInvoiceEmailContent(typedOrder, latestInvoiceNumber, {
    pickupHours: formatPickupHours(await getStoreHours()),
  });

  return (
    <>
      <PrintInvoiceClient
        invoiceHtml={invoiceContent.html}
        invoiceNumber={invoiceContent.invoiceNumber}
        orderNumber={typedOrder.order_number}
        backHref={`${adminBasePath}/orders/${id}`}
      />
      {/* No admin menu on this page, so the guard the menu carries is added here. Draws nothing. */}
      <CustomerModeTabGuard />
    </>
  );
}
