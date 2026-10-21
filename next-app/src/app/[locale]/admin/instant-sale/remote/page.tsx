import type { Metadata } from 'next';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import RemoteSaleForm from '@/components/admin/instant-sale/RemoteSaleForm';
import { loadInstantSalePage } from '@/components/admin/instant-sale/load-instant-sale-page';
import { createServiceClient } from '@/lib/supabase/service';
import { findRemoteDraft } from '@/lib/remote-sale-server';

export const metadata: Metadata = { title: 'Admin - Instant Sale · Remote' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ draft?: string }>;
}

/**
 * Admin → Instant Sale → Remote sale (owner, mockup v2, 2026-10-21).
 * `?draft=<id>` reopens a saved draft ("Continue" on Instant Sale).
 */
export default async function AdminRemoteSalePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { draft: draftId } = await searchParams;
  const page = await loadInstantSalePage(locale, { products: true });
  const draft = draftId ? await findRemoteDraft(createServiceClient(), draftId) : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={page.adminBasePath} active="instant-sale" unreadMessagesCount={page.unreadMessagesCount} userEmail={page.userEmail} />
      <main className="px-4 md:px-8 py-8">
        <div className="ultrawide-page-medium max-w-[1200px] mx-auto">
          <div className="mb-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              <Link href={`${page.adminBasePath}/instant-sale`} className="underline-offset-2 hover:underline">Instant Sale</Link> › Remote{draft ? ' · draft' : ''}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Remote Sale
            </h1>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--color-on-surface-variant)' }}>
              Set up the items and email the customer an invoice. They pay through a private link (PayPal or any card) or by Zelle or check.
            </p>
          </div>
          <RemoteSaleForm
            key={draft?.id ?? 'new'}
            adminBasePath={page.adminBasePath}
            products={page.products}
            spotData={page.spotData}
            draft={draft}
            draftMissing={Boolean(draftId) && !draft}
          />
        </div>
      </main>
    </div>
  );
}
