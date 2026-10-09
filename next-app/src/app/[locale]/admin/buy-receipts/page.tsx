import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BUY_RECEIPT_DRAFT_COLUMNS, draftFormFromRow, receiptOfDraftRow, type BuyReceiptDraftRow } from '@/lib/buy-receipt-drafts';
import { BUY_RECEIPT_COLUMNS, draftFromReceipt, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';
import { CUSTOMER_MODE_COOKIE } from '@/lib/customer-mode-lock';
import BuyReceiptsShell, { requireBuyReceiptsAdmin } from '@/components/admin/buy-receipts/BuyReceiptsShell';
import BuyReceiptForm from '@/components/admin/buy-receipts/BuyReceiptForm';

export const metadata: Metadata = { title: 'Admin - Buy Receipts' };

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; draft?: string }>;
}

/**
 * Admin → Buy Receipts → New receipt (owner mockups 2026-09-29/30): the
 * receipt for something the shop BUYS from a customer at the counter, filled
 * in on the laptop beside them. `?from=<id>` starts from a copy of a saved
 * receipt (the "Duplicate" link). `?draft=<id>` opens a saved DRAFT to carry on
 * with it — on any device (owner, 2026-10-09); a receipt that is no longer a
 * draft is sent on to its own page.
 *
 * This is also the one admin page a browser in customer input mode may open
 * (`lib/customer-mode-lock.ts`): with the lock cookie present the form starts
 * straight in the seller's screen, so a refresh or a typed admin address lands
 * there and nowhere else.
 */
export default async function AdminBuyReceiptsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { from, draft: draftId } = await searchParams;
  const customerModeLocked = (await cookies()).has(CUSTOMER_MODE_COOKIE);
  const { supabase, user, adminBasePath } = await requireBuyReceiptsAdmin(locale, { customerModeLocked });
  // A locked browser shows the seller's screen and nothing else: no draft is opened into it.
  const wantsDraft = !customerModeLocked && isReceiptId(draftId);

  const [{ count: unreadMessagesCount }, source, opened] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    !wantsDraft && isReceiptId(from)
      ? supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', from).maybeSingle()
      : Promise.resolve({ data: null }),
    wantsDraft
      ? supabase.from('buy_receipts').select(BUY_RECEIPT_DRAFT_COLUMNS).eq('id', draftId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const sourceRow = (source.data ?? null) as unknown as BuyReceiptRow | null;
  const openedRow = (opened.data ?? null) as unknown as BuyReceiptDraftRow | null;
  // Finished (or voided) since the link was made: its own page is the place for it now.
  if (openedRow && openedRow.status !== 'draft') redirect(`${adminBasePath}/buy-receipts/${openedRow.id}`);
  const draftForm = openedRow ? draftFormFromRow(openedRow) : null;
  // The form gets the row without the stored form: it has its own copy in `draftForm`.
  const draftReceipt = openedRow ? receiptOfDraftRow(openedRow) : null;

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
        // A different source receipt, or a different draft, is a different form.
        key={draftReceipt ? `draft-${draftReceipt.id}` : (sourceRow?.id ?? 'blank')}
        adminBasePath={adminBasePath}
        nowIso={new Date().toISOString()}
        initialDraft={sourceRow ? draftFromReceipt(sourceRow) : undefined}
        duplicatedFrom={sourceRow ? { id: sourceRow.id, number: sourceRow.receipt_number } : null}
        startInCustomerMode={customerModeLocked}
        draftReceipt={draftReceipt}
        draftForm={draftForm}
      />
    </BuyReceiptsShell>
  );
}
