import type { Metadata } from 'next';
import { BUY_RECEIPT_COLUMNS, draftFromReceipt, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';
import BuyReceiptsShell, { requireBuyReceiptsAdmin } from '@/components/admin/buy-receipts/BuyReceiptsShell';
import BuyReceiptForm from '@/components/admin/buy-receipts/BuyReceiptForm';

export const metadata: Metadata = { title: 'Admin - Buy Receipts' };

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}

/**
 * Admin → Buy Receipts → New receipt (owner mockups 2026-09-29/30): the
 * receipt for something the shop BUYS from a customer at the counter, filled
 * in on the laptop beside them. `?from=<id>` starts from a copy of a saved
 * receipt (the "Duplicate" link).
 */
export default async function AdminBuyReceiptsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { from } = await searchParams;
  const { supabase, user, adminBasePath } = await requireBuyReceiptsAdmin(locale);

  const [{ count: unreadMessagesCount }, source] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    isReceiptId(from)
      ? supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', from).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const sourceRow = (source.data ?? null) as unknown as BuyReceiptRow | null;

  return (
    <BuyReceiptsShell
      adminBasePath={adminBasePath}
      userEmail={user.email}
      unreadMessagesCount={unreadMessagesCount ?? 0}
      activeTab="new"
      title="Buy Receipts"
      intro="Fill this in with the seller, save it, and send it to the desktop printer. The seller signs the printed copy."
    >
      <BuyReceiptForm
        // A different source receipt is a different form.
        key={sourceRow?.id ?? 'blank'}
        adminBasePath={adminBasePath}
        nowIso={new Date().toISOString()}
        initialDraft={sourceRow ? draftFromReceipt(sourceRow) : undefined}
        duplicatedFrom={sourceRow ? { id: sourceRow.id, number: sourceRow.receipt_number } : null}
      />
    </BuyReceiptsShell>
  );
}
