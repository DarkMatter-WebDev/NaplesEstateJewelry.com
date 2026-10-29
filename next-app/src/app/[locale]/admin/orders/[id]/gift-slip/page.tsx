import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import { loadOrderGift } from '@/lib/order-gift-server';
import CustomerModeTabGuard from '@/components/admin/buy-receipts/CustomerModeTabGuard';
import GiftSlipClient from './GiftSlipClient';

export const metadata: Metadata = { title: 'Gift Slip' };

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * The gift slip that goes in a gift order's box (2026-10-29): who it is for,
 * the buyer's message, the item names — NO prices and none of the buyer's
 * contact details. Opened from Admin → Orders → the order → Print Gift Slip.
 */
export default async function AdminOrderGiftSlipPage({ params }: Props) {
  const { locale, id } = await params;
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect(isEs ? '/es/account' : '/account');

  const [{ data: order }, gift] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, customer_name, order_items(id, title_snapshot)')
      .eq('id', id)
      .single(),
    loadOrderGift(supabase, id),
  ]);
  if (!order || !gift) notFound();

  const row = order as unknown as {
    order_number: string;
    customer_name: string | null;
    order_items: { id: string; title_snapshot: string }[];
  };

  return (
    <>
      <GiftSlipClient
        backHref={`${adminBasePath}/orders/${id}`}
        orderNumber={row.order_number}
        from={row.customer_name}
        gift={gift}
        items={row.order_items.map((item) => item.title_snapshot)}
      />
      {/* No admin menu on this page, so the guard the menu carries is added here. Draws nothing. */}
      <CustomerModeTabGuard />
    </>
  );
}
