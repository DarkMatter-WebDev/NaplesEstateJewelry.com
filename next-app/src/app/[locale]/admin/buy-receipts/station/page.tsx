import type { Metadata } from 'next';
import { requireBuyReceiptsAdmin } from '@/components/admin/buy-receipts/BuyReceiptsShell';
import PrintStation from '@/components/admin/buy-receipts/PrintStation';

export const metadata: Metadata = { title: 'Print Station' };

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Admin → Buy Receipts → Print station. The page left open on the PC that has
 * the printer (opened there from a Chrome shortcut with --kiosk-printing).
 * No admin header on purpose: it is a single-purpose window, often chromeless.
 */
export default async function AdminBuyReceiptsStationPage({ params }: Props) {
  const { locale } = await params;
  const { user, adminBasePath } = await requireBuyReceiptsAdmin(locale);
  return <PrintStation adminBasePath={adminBasePath} adminEmail={user.email ?? null} />;
}
