import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getVerifiedUser } from '@/lib/auth-claims';
import AdminHeader from '@/components/admin/AdminHeader';
import FollowUpsManager from '@/components/admin/follow-ups/FollowUpsManager';
import { loadFollowUpsPage, type FollowUpsPageData } from '@/lib/follow-ups-server';
import { FOLLOW_UPS_SQL_FILE, settingsFromRow } from '@/lib/follow-ups';

export const metadata: Metadata = { title: 'Admin - Follow-ups' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Admin → Follow-ups (owner, 2026-11-24, mockup 1): one thank-you email after
 * every buy receipt and every paid order — the series switches, the queue
 * (Upcoming), the Sent log and People. Opening the page also runs the
 * reconcile, so a receipt saved a minute ago is already in Upcoming.
 */
export default async function AdminFollowUpsPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect(isEs ? '/es/account' : '/account');

  const [{ count: unreadMessagesCount }, pageResult] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    loadFollowUpsPage(createServiceClient()).then(
      (data) => ({ data, error: null as string | null }),
      (error: unknown) => ({ data: null, error: error instanceof Error ? error.message : String(error) }),
    ),
  ]);

  const data: FollowUpsPageData = pageResult.data ?? {
    ready: true,
    settings: settingsFromRow(null),
    upcoming: [],
    log: [],
    people: [],
    reconcileError: null,
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={adminBasePath} active="follow-ups" unreadMessagesCount={unreadMessagesCount ?? 0} userEmail={user.email} />

      <main className="px-4 md:px-8 py-8">
        <div className="ultrawide-page-medium max-w-[1240px] mx-auto">
          {pageResult.error && (
            <div role="alert" className="mb-6 border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'white' }}>
              Could not load follow-ups: {pageResult.error}
            </div>
          )}
          {!data.ready ? (
            <div className="border px-5 py-5 text-sm leading-relaxed" style={{ borderColor: 'var(--color-outline-variant)', background: 'white' }}>
              <h1 className="mb-2 text-3xl" style={{ fontFamily: 'var(--font-headline)' }}>Follow-ups</h1>
              <p>
                One step left before this page works: run <code>{FOLLOW_UPS_SQL_FILE}</code> in the Supabase SQL Editor (all of it).
                The last result should be one row with every value <b>true</b>. Then reload this page.
              </p>
            </div>
          ) : (
            <FollowUpsManager data={data} adminBasePath={adminBasePath} />
          )}
        </div>
      </main>
    </div>
  );
}
