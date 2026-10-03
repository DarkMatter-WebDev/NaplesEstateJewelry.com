import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import { invoiceNumberForOrder } from '@/lib/order-invoice-email';
import type { Order, OrderItem } from '@/types/sales';
import CustomerModeTabGuard from '@/components/admin/buy-receipts/CustomerModeTabGuard';
import PrintOrderClient from './PrintOrderClient';

export const metadata: Metadata = { title: 'Print Order' };

const PRINT_ORDER_COLUMNS = [
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
  'refund_amount',
  'deleted_at',
  'created_at',
  'updated_at',
  'order_items(id, order_id, product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');

const PRINT_ORDER_COLUMNS_WITHOUT_ITEM_YEAR = PRINT_ORDER_COLUMNS
  .replace('item_year_snapshot, ', '')
  .replace('quantity, ', '');
const PRINT_ORDER_COLUMNS_WITHOUT_REFUND_AMOUNT = PRINT_ORDER_COLUMNS.replace('refund_amount, ', '');
const PRINT_ORDER_COLUMNS_WITHOUT_BOTH = PRINT_ORDER_COLUMNS_WITHOUT_ITEM_YEAR.replace('refund_amount, ', '');
const PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT = PRINT_ORDER_COLUMNS.replace('deleted_at, ', '');
const PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_ITEM_YEAR = PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT
  .replace('item_year_snapshot, ', '')
  .replace('quantity, ', '');
const PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_REFUND = PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT.replace('refund_amount, ', '');
const PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_BOTH = PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_ITEM_YEAR.replace('refund_amount, ', '');

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

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default async function AdminOrderPrintPage({ params }: Props) {
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
    supabase
      .from('orders')
      .select(PRINT_ORDER_COLUMNS)
      .eq('id', id)
      .single(),
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
      .select(PRINT_ORDER_COLUMNS_WITHOUT_ITEM_YEAR)
      .eq('id', id)
      .single();
    order = fallback.data;
    if (isMissingRefundAmountError(fallback.error)) {
      const fallback2 = await supabase
        .from('orders')
        .select(PRINT_ORDER_COLUMNS_WITHOUT_BOTH)
        .eq('id', id)
        .single();
      order = fallback2.data;
    }
  } else if (isMissingRefundAmountError(orderResult.error)) {
    const fallback = await supabase
      .from('orders')
      .select(PRINT_ORDER_COLUMNS_WITHOUT_REFUND_AMOUNT)
      .eq('id', id)
      .single();
    order = fallback.data;
  } else if (isMissingDeletedAtColumnError(orderResult.error)) {
    const selectColumns = isMissingItemYearColumnError(orderResult.error)
      ? (isMissingRefundAmountError(orderResult.error) ? PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_BOTH : PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_ITEM_YEAR)
      : (isMissingRefundAmountError(orderResult.error) ? PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT_REFUND : PRINT_ORDER_COLUMNS_WITHOUT_DELETED_AT);
    const fallback = await supabase
      .from('orders')
      .select(selectColumns)
      .eq('id', id)
      .single();
    order = fallback.data;
  }

  if (!order) notFound();

  const typedOrder = order as unknown as Order & { order_items: OrderItem[] };
  const invoiceNumber = invoiceNumberForOrder(typedOrder, invoices?.[0]?.invoice_number ?? null);

  return (
    <>
      <PrintOrderClient
        adminEmail={user.email ?? null}
        backHref={`${adminBasePath}/orders/${id}`}
        invoiceNumber={invoiceNumber}
        order={typedOrder}
        printedAt={new Date().toISOString()}
      />
      {/* No admin menu on this page, so the guard the menu carries is added here. Draws nothing. */}
      <CustomerModeTabGuard />
    </>
  );
}
