import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import { invoiceNumberForOrder } from '@/lib/order-invoice-email';
import { buildPaperReceipt, isPaidStatus } from '@/lib/order-receipt-paper';
import { hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';
import { loadOrderTaxExemption } from '@/lib/tax-exempt-server';
import { SPLIT_PAYMENTS_COLUMN, TRADE_IN_COLUMN, withBullionFlags } from '@/lib/in-store-sale';
import { loadBullionLineIds } from '@/lib/bullion-sale-server';
import { loadOrderLanguage, loadSpanishItemTitles } from '@/lib/order-language-server';
import { printLanguage } from '@/lib/order-language';
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
  'payment_method',
  SPLIT_PAYMENTS_COLUMN,
  TRADE_IN_COLUMN,
  'fulfillment_status',
  'order_status',
  'shipping_method',
  'shipping_address',
  'created_at',
  'order_items(id, order_id, product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot)',
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
  searchParams: Promise<{ lang?: string | string[] }>;
}

export default async function AdminOrderInvoicePrintPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const { lang } = await searchParams;
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
  // "Bullion — not taxed" lines (2026-11-24); none before the SQL.
  typedOrder.order_items = withBullionFlags(typedOrder.order_items ?? [], await loadBullionLineIds(supabase, id));
  const latestInvoiceNumber = invoices?.[0]?.invoice_number ?? null;
  // The customer's language (2026-11-21): the order's, unless "Print in" picked the other.
  const orderLanguage = await loadOrderLanguage(supabase, id);
  const language = printLanguage(lang, orderLanguage);
  const es = language === 'es';
  // The one-page paper (2026-10-21), not the email's HTML.
  const paper = buildPaperReceipt(typedOrder, {
    invoiceNumber: invoiceNumberForOrder(typedOrder, latestInvoiceNumber),
    hoursLine: hoursLine(await getStoreHours(), es),
    taxExempt: await loadOrderTaxExemption(supabase, id),
    language,
    spanishTitles: es ? await loadSpanishItemTitles(supabase, typedOrder.order_items.map((item) => item.product_id)) : null,
  });

  return (
    <>
      <PrintInvoiceClient
        paper={paper}
        label={isPaidStatus(typedOrder.payment_status) ? `Receipt · ${typedOrder.order_number}` : `Invoice · ${invoiceNumberForOrder(typedOrder, latestInvoiceNumber)}`}
        orderNumber={typedOrder.order_number}
        backHref={`${adminBasePath}/orders/${id}`}
        language={language}
        orderLanguage={orderLanguage}
        basePath={`${adminBasePath}/orders/${id}/invoice`}
      />
      {/* No admin menu on this page, so the guard the menu carries is added here. Draws nothing. */}
      <CustomerModeTabGuard />
    </>
  );
}
