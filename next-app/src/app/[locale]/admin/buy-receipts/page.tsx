import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { BUY_RECEIPT_COLUMNS, draftFromReceipt, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';
import { CUSTOMER_MODE_COOKIE } from '@/lib/customer-mode-lock';
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
 *
 * This is also the one admin page a browser in customer input mode may open
 * (`lib/customer-mode-lock.ts`): with the lock cookie present the form starts
 * straight in the seller's screen, so a refresh or a typed admin address lands
 * there and nowhere else.
 */
export default async function AdminBuyReceiptsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { from } = await searchParams;
  const customerModeLocked = (await cookies()).has(CUSTOMER_MODE_COOKIE);
  const { supabase, user, adminBasePath } = await requireBuyReceiptsAdmin(locale, { customerModeLocked });

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
      // The form draws the tabs: its "Customer input mode" button sits at the end of their row.
      showTabs={false}
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
        startInCustomerMode={customerModeLocked}
      />
    </BuyReceiptsShell>
  );
}
