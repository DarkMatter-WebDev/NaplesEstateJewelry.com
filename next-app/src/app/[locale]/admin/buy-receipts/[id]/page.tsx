import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BUY_RECEIPT_COLUMNS, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';
import BuyReceiptsShell, { requireBuyReceiptsAdmin } from '@/components/admin/buy-receipts/BuyReceiptsShell';
import BuyReceiptDetail from '@/components/admin/buy-receipts/BuyReceiptDetail';

export const metadata: Metadata = { title: 'Admin - Buy Receipt' };

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

/** One saved receipt: the paper, its ID photo, and print / edit / duplicate / void. */
export default async function AdminBuyReceiptPage({ params }: Props) {
  const { locale, id } = await params;
  const { supabase, user, adminBasePath } = await requireBuyReceiptsAdmin(locale);
  if (!isReceiptId(id)) notFound();

  const [{ count: unreadMessagesCount }, { data }] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', id).maybeSingle(),
  ]);
  if (!data) notFound();
  const receipt = data as unknown as BuyReceiptRow;

  return (
    <BuyReceiptsShell
      adminBasePath={adminBasePath}
      userEmail={user.email}
      unreadMessagesCount={unreadMessagesCount ?? 0}
      activeTab={null}
      title={`Receipt ${receipt.receipt_number}`}
      intro="Print it here or on the desktop, change it, duplicate it, or void it."
    >
      <BuyReceiptDetail adminBasePath={adminBasePath} initialReceipt={receipt} />
    </BuyReceiptsShell>
  );
}
