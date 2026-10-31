import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import AdminHeader from '@/components/admin/AdminHeader';
import { getRecentScans, getScanSummaries, RECENT_SCANS_PER_SOURCE } from '@/lib/qr-scans';
import { SCAN_SOURCES, SCAN_SOURCE_KEYS } from '@/lib/scan-sources';

export const metadata: Metadata = { title: 'Admin - Insights' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

// Admin → Insights (owner, 2026-10-31): how many people opened each printed
// code — car magnets (/magnet), Chris's card (/card), Kitt's card (/kittcard).
// Counts come from `qr_scans` (time + source only; lib/qr-scans.ts). The site
// has no other analytics by the owner's rulings, so this page is the place for
// any future first-party count; add a source in lib/scan-sources.ts.

const eastern = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
});

// Every scan's own time, in the list under each code: weekday + date + time.
const easternFull = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
});

const thStyle = {
  padding: '0.6rem 1rem',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-on-surface-variant)',
  fontFamily: 'var(--font-label)',
  whiteSpace: 'nowrap',
} as const;

const tdStyle = { padding: '0.85rem 1rem', color: 'var(--color-on-surface)', verticalAlign: 'top' } as const;
const numStyle = { ...tdStyle, fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, textAlign: 'right' } as const;

export default async function AdminInsightsPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const adminBasePath = isEs ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect(isEs ? '/es/account/sign-in' : '/account/sign-in');

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect(isEs ? '/es/account' : '/account');

  const [{ count: unreadMessagesCount }, summaries, recent] = await Promise.all([
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    getScanSummaries(),
    getRecentScans(),
  ]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader
        adminBasePath={adminBasePath}
        active="insights"
        unreadMessagesCount={unreadMessagesCount ?? 0}
        userEmail={user.email}
      />

      <main className="px-4 md:px-8 py-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-8">
            <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.35em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              Marketing
            </p>
            <h1 className="text-3xl font-bold md:text-4xl" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              Insights
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              How many people opened each printed QR code. Only the time is saved — nothing about the visitor. Bots, link
              previews and test tools are not counted; a card visit counts once per browser tab.
            </p>
          </div>

          <section className="rounded-[1.25rem] border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
            <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                QR code scans
              </h2>
            </div>
            {summaries ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Code</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Last 7 days</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Last 30 days</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>All time</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Last scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCAN_SOURCE_KEYS.map((source) => {
                      const row = summaries[source];
                      return (
                        <tr key={source} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                          <td style={tdStyle}>
                            <strong>{SCAN_SOURCES[source].label}</strong>
                            <div className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                              naplesestatejewelry.com{SCAN_SOURCES[source].path}
                            </div>
                          </td>
                          <td style={numStyle}>{row.last7Days}</td>
                          <td style={numStyle}>{row.last30Days}</td>
                          <td style={numStyle}>{row.allTime}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>
                            {row.lastScanAt ? eastern.format(new Date(row.lastScanAt)) : 'None yet'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-4 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Counter not set up yet — run <code>supabase/qr-scans-2026-10.sql</code> in Supabase. The magnets and cards
                already work; visits are counted from then on.
              </p>
            )}
          </section>

          {/* Every scan with its time, one block per code (owner, 2026-10-31:
              "add timestamps to all the scans … grouped by page"). Newest
              first; capped per code so the page stays light — the counts in
              the table above are always exact. */}
          {summaries && recent && SCAN_SOURCE_KEYS.map((source) => {
            const times = recent[source];
            const total = summaries[source].allTime;
            return (
              <section
                key={source}
                className="mt-6 rounded-[1.25rem] border bg-white"
                style={{ borderColor: 'var(--color-outline-variant)' }}
                aria-labelledby={`scans-${source}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
                  <h2 id={`scans-${source}`} className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                    {SCAN_SOURCES[source].label}
                    <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                      naplesestatejewelry.com{SCAN_SOURCES[source].path}
                    </span>
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {total === 0
                      ? 'No scans yet'
                      : total > times.length
                        ? `Newest ${times.length} of ${total} scans`
                        : `${total} ${total === 1 ? 'scan' : 'scans'}, newest first`}
                  </p>
                </div>
                {times.length > 0 && (
                  <ol
                    className="grid gap-x-6 gap-y-1.5 px-5 py-4 text-sm"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))', color: 'var(--color-on-surface)', listStyle: 'none', margin: 0 }}
                  >
                    {times.map((iso, i) => (
                      <li key={`${iso}-${i}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <time dateTime={iso}>{easternFull.format(new Date(iso))}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
          {summaries && recent && (
            <p className="mt-3 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              Times are Eastern. Each list shows up to the newest {RECENT_SCANS_PER_SOURCE} scans.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
