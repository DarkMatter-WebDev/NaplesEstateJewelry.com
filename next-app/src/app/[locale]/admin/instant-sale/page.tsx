import type { Metadata } from 'next';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import RemoteInvoiceCard from '@/components/admin/instant-sale/RemoteInvoiceCard';
import RemoteDraftCard from '@/components/admin/instant-sale/RemoteDraftCard';
import { loadInstantSalePage } from '@/components/admin/instant-sale/load-instant-sale-page';
import { createServiceClient } from '@/lib/supabase/service';
import { listOpenRemoteInvoices, listRemoteDrafts } from '@/lib/remote-sale-server';

export const metadata: Metadata = { title: 'Admin - Instant Sale' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Admin → Instant Sale (owner, mockup v2, 2026-10-21; was "In-Store Sale"):
 * pick how this sale happens — In-store sale (the customer is here and pays
 * now) or Remote sale (email an invoice with a private pay link) — and see
 * the remote invoices still waiting to be paid, then any saved drafts.
 */
export default async function AdminInstantSalePage({ params }: Props) {
  const { locale } = await params;
  const page = await loadInstantSalePage(locale, { products: false });
  const service = createServiceClient();
  const [invoices, drafts] = await Promise.all([listOpenRemoteInvoices(service), listRemoteDrafts(service)]);

  const card = 'grid gap-2.5 rounded-[1.25rem] border bg-white p-6 shadow-[0_14px_38px_rgba(38,28,6,0.05)]';
  const bullets = 'm-0 grid gap-1 pl-4 text-sm leading-relaxed list-disc';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={page.adminBasePath} active="instant-sale" unreadMessagesCount={page.unreadMessagesCount} userEmail={page.userEmail} />
      <main className="px-4 md:px-8 py-8">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>Sales</p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Instant Sale</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Pick how this sale happens.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={card} style={{ borderColor: 'var(--color-primary)' }}>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>In-store sale</h2>
              <ul className={bullets} style={{ color: 'var(--color-on-surface-variant)' }}>
                <li>The customer is here and pays now — Zettle, cash, Zelle, check…</li>
                <li>One or more items, a photo for each</li>
                <li>Pickup or ship · receipt by email</li>
              </ul>
              <Link href={`${page.adminBasePath}/instant-sale/in-store`} className="gold-button mt-2 justify-center text-xs">Start in-store sale</Link>
            </div>
            <div className={card} style={{ borderColor: 'var(--color-outline-variant)' }}>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Remote sale</h2>
              <ul className={bullets} style={{ color: 'var(--color-on-surface-variant)' }}>
                <li>The customer is not here — phone, text, out of town</li>
                <li>Set up the items, email them an invoice</li>
                <li>They pay through a private link (PayPal or card), or by Zelle / check</li>
              </ul>
              <Link href={`${page.adminBasePath}/instant-sale/remote`} className="outline-button mt-2 justify-center text-xs">Start remote sale</Link>
            </div>
          </div>

          <section className="mt-6 grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Open invoices · {invoices.length}</h2>
              <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Unpaid remote sales</span>
            </div>
            {invoices.length === 0 ? (
              <p className="rounded-2xl border bg-white p-4 text-sm" style={{ borderColor: 'var(--color-outline-variant)', color: 'var(--color-on-surface-variant)' }}>
                None waiting. A remote sale shows here from the moment its invoice is sent until it is paid or cancelled.
              </p>
            ) : (
              invoices.map((invoice) => <RemoteInvoiceCard key={invoice.id} invoice={invoice} adminBasePath={page.adminBasePath} />)
            )}
          </section>

          {drafts.length > 0 && (
            <section className="mt-6 grid gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Drafts · {drafts.length}</h2>
                <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Remote sales saved, not sent</span>
              </div>
              {drafts.map((draft) => <RemoteDraftCard key={draft.id} draft={draft} adminBasePath={page.adminBasePath} />)}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
