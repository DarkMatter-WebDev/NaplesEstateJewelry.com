import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * The In-Store Sale page became Admin → Instant Sale (owner, 2026-10-21). This
 * old address stays so bookmarks and the desktop shortcut keep working: it
 * forwards to the Instant Sale choice (In-store sale · Remote sale).
 */
export default async function AdminInStoreSaleRedirect({ params }: Props) {
  const { locale } = await params;
  redirect(locale === 'es' ? '/es/admin/instant-sale' : '/admin/instant-sale');
}
