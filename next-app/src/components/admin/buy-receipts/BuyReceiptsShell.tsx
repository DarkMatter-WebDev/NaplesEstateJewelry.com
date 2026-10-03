import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import AdminHeader from '@/components/admin/AdminHeader';
import BuyReceiptTabs, { type BuyReceiptTab } from './BuyReceiptTabs';

/**
 * The admin gate every Buy Receipts page starts with (the same check as every
 * other admin page: a verified user whose `profiles.is_admin` row says so).
 * Returns the request-scoped client — the `authenticated` role — which is what
 * the `buy_receipts` table is granted to.
 *
 * `customerModeLocked`: this browser carries the customer-input-mode lock. The
 * proxy sends a locked browser away from every account page, so a signed-in
 * visitor who is NOT an admin must not be sent to `/account` here — the two
 * would bounce each other forever. They go to the home page instead. (The
 * sign-in page is not bounced, so the signed-out case is unchanged.)
 */
export async function requireBuyReceiptsAdmin(locale: string, { customerModeLocked = false }: { customerModeLocked?: boolean } = {}) {
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) {
    if (customerModeLocked) redirect(isEs ? '/es' : '/');
    redirect(isEs ? '/es/account' : '/account');
  }

  return { supabase, user, adminBasePath };
}

/**
 * Admin header, page title and the three tabs, around a Buy Receipts page.
 * `showTabs={false}` is for the New receipt page, whose form draws the tabs
 * itself so its "Customer input mode" button can sit at the end of their row.
 */
export default function BuyReceiptsShell({
  adminBasePath,
  userEmail,
  unreadMessagesCount,
  activeTab,
  showTabs = true,
  title,
  intro,
  children,
}: {
  adminBasePath: string;
  userEmail: string | null | undefined;
  unreadMessagesCount: number;
  activeTab: BuyReceiptTab | null;
  showTabs?: boolean;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={adminBasePath} active="buy-receipts" unreadMessagesCount={unreadMessagesCount} userEmail={userEmail} />
      <main className="px-4 md:px-8 py-8">
        <div className="ultrawide-page-medium max-w-[1200px] mx-auto">
          <div className="mb-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              Buying
            </p>
            <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              {title}
            </h1>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--color-on-surface-variant)' }}>
              {intro}
            </p>
          </div>
          {showTabs && <BuyReceiptTabs adminBasePath={adminBasePath} active={activeTab} />}
          {children}
        </div>
      </main>
    </div>
  );
}
