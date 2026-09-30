import type { Metadata } from 'next';
import { BUY_RECEIPT_COLUMNS, type BuyReceiptRow } from '@/lib/buy-receipts';
import BuyReceiptsShell, { requireBuyReceiptsAdmin } from '@/components/admin/buy-receipts/BuyReceiptsShell';
import BuyReceiptLog from '@/components/admin/buy-receipts/BuyReceiptLog';

export const metadata: Metadata = { title: 'Admin - Buy Receipts Log' };

interface Props {
  params: Promise<{ locale: string }>;
}

/** Admin → Buy Receipts → Log: every saved receipt, newest first. */
export default async function AdminBuyReceiptsLogPage({ params }: Props) {
  const { locale } = await params;
  const { supabase, user, adminBasePath } = await requireBuyReceiptsAdmin(locale);

  const [{ count: unreadMessagesCount }, { data: rows, error }] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).order('seq', { ascending: false }).limit(100),
  ]);

  return (
    <BuyReceiptsShell
      adminBasePath={adminBasePath}
      userEmail={user.email}
      unreadMessagesCount={unreadMessagesCount ?? 0}
      activeTab="log"
      title="Buy Receipts"
      intro="Every saved receipt. Open one to print it again, edit it, duplicate it or void it."
    >
      {error ? (
        <p role="alert" className="border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
          The receipts could not be loaded. If this is the first use, the database step for Buy Receipts may not have been run yet.
        </p>
      ) : (
        <BuyReceiptLog adminBasePath={adminBasePath} initialRows={(rows ?? []) as unknown as BuyReceiptRow[]} />
      )}
    </BuyReceiptsShell>
  );
}
