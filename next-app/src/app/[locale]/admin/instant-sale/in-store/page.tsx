import type { Metadata } from 'next';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import InStoreSaleForm from '@/components/admin/InStoreSaleForm';
import { loadInstantSalePage } from '@/components/admin/instant-sale/load-instant-sale-page';

export const metadata: Metadata = { title: 'Admin - Instant Sale · In store' };

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Admin → Instant Sale → In-store sale (the In-Store Sale page until
 * 2026-10-21; owner mockup 2026-09-16, several items + photos + Email copy
 * 2026-10-21): the card is taken on Zettle; this page records the sale —
 * listed items by inventory number, unlisted pieces by description — as a paid
 * order, marks listed items sold and emails the receipt when asked.
 */
export default async function AdminInStoreSalePage({ params }: Props) {
  const { locale } = await params;
  const page = await loadInstantSalePage(locale, { products: true });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={page.adminBasePath} active="instant-sale" unreadMessagesCount={page.unreadMessagesCount} userEmail={page.userEmail} />
      <main className="px-4 md:px-8 py-8">
        <div className="ultrawide-page-medium max-w-[1200px] mx-auto">
          <div className="mb-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              <Link href={`${page.adminBasePath}/instant-sale`} className="underline-offset-2 hover:underline">Instant Sale</Link> › In store
            </p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              In-Store Sale
            </h1>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--color-on-surface-variant)' }}>
              Take the card on Zettle, then record the sale here. This creates the order, marks listed items sold and
              emails the receipt.
            </p>
          </div>
          <InStoreSaleForm adminBasePath={page.adminBasePath} products={page.products} spotData={page.spotData} />
        </div>
      </main>
    </div>
  );
}
