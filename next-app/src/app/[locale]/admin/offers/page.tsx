import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import AdminHeader from '@/components/admin/AdminHeader';
import OffersPanel from '@/components/admin/OffersPanel';

export const metadata: Metadata = { title: 'Admin - Offers' };

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Admin → Offers (site shop "Make an Offer", owner mockup v2, 2026-10-15).
 * Rules: lib/offers.ts; money paths: lib/offers-server.ts.
 */
export default async function AdminOffersPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect(isEs ? '/es/account' : '/account');

  const { count: unreadMessagesCount } = await supabase
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={adminBasePath} active="offers" unreadMessagesCount={unreadMessagesCount ?? 0} userEmail={user.email} />
      <main className="px-4 md:px-8 py-8">
        <div className="ultrawide-page-medium max-w-[1200px] mx-auto">
          <div className="mb-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              Shop
            </p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Offers
            </h1>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--color-on-surface-variant)' }}>
              Each open offer is holding the buyer&apos;s payment through PayPal. Accept charges it at once; Counter releases
              it and emails a private Buy-now link at your price; Decline releases it. Unanswered offers expire after 72
              hours and release by themselves.
            </p>
          </div>
          <OffersPanel adminBasePath={adminBasePath} />
        </div>
      </main>
    </div>
  );
}
