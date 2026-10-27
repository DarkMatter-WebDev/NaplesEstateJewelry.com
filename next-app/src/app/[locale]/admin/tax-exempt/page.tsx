import type { Metadata } from 'next';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import CertificateStatusButton from '@/components/admin/tax-exempt/CertificateStatusButton';
import { loadInstantSalePage } from '@/components/admin/instant-sale/load-instant-sale-page';
import { createServiceClient } from '@/lib/supabase/service';
import { isAccountRequest, REQUEST_COLUMNS, type TaxExemptRequestRow } from '@/lib/tax-exempt-server';
import {
  CERTIFICATE_COLUMNS,
  PAPER_COPY_MIME,
  TAX_CERT_TYPE_LABELS,
  TAX_EXEMPT_SOURCE_LABELS,
  certificateIsUsable,
  exemptShortTag,
  formatCertDate,
  parseTaxExemptSnapshot,
  requestRefLabel,
  type CertificateRow,
} from '@/lib/tax-exempt';
import { formatCurrency } from '@/types/sales';
import { paperDateLine } from '@/lib/order-receipt-paper';

export const metadata: Metadata = { title: 'Admin - Tax Exempt' };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

type ExemptOrder = { id: string; order_number: string; created_at: string; customer_name: string | null; tax_exempt_certificate_id: string | null; tax_exempt_snapshot: unknown };

/**
 * Admin → Tax Exempt (owner, 2026-10-27: "make sure the tax id photo is saved
 * in a dedicated area of admin and noted on the order"). One place for:
 *   - website requests waiting for approval (the text links to each one);
 *   - every certificate the store accepted — photo, physical copy, source,
 *     account it is saved to, and the orders that used it;
 *   - the tax-exempt orders themselves.
 * Certificates are records: they can be withdrawn, never deleted here.
 */
export default async function AdminTaxExemptPage({ params }: Props) {
  const { locale } = await params;
  const page = await loadInstantSalePage(locale, { products: false });
  const service = createServiceClient();

  const [pendingResult, recentResult, certResult, ordersResult] = await Promise.all([
    service.from('tax_exempt_requests').select(REQUEST_COLUMNS).eq('status', 'pending').order('submitted_at', { ascending: true }).limit(30),
    service.from('tax_exempt_requests').select(REQUEST_COLUMNS).in('status', ['approved', 'declined', 'cancelled']).order('updated_at', { ascending: false }).limit(15),
    service.from('tax_exempt_certificates').select(CERTIFICATE_COLUMNS).order('approved_at', { ascending: false }).limit(300),
    service.from('orders').select('id, order_number, created_at, customer_name, tax_exempt_certificate_id, tax_exempt_snapshot').eq('tax_exempt', true).order('created_at', { ascending: false }).limit(300),
  ]);
  const missingSql = [pendingResult.error, certResult.error, ordersResult.error].some((error) => error && /does not exist|schema cache|column/i.test(error.message));
  const pending = (pendingResult.data ?? []) as unknown as TaxExemptRequestRow[];
  const recent = (recentResult.data ?? []) as unknown as TaxExemptRequestRow[];
  const certificates = (certResult.data ?? []) as unknown as CertificateRow[];
  const orders = (ordersResult.data ?? []) as unknown as ExemptOrder[];
  const ordersByCertificate = new Map<string, ExemptOrder[]>();
  for (const order of orders) {
    if (!order.tax_exempt_certificate_id) continue;
    const list = ordersByCertificate.get(order.tax_exempt_certificate_id) ?? [];
    list.push(order);
    ordersByCertificate.set(order.tax_exempt_certificate_id, list);
  }
  const totalNotCharged = orders.reduce((sum, order) => sum + (parseTaxExemptSnapshot(order.tax_exempt_snapshot)?.taxNotCharged ?? 0), 0);

  const card = 'rounded-[1.25rem] border bg-white p-5';
  const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;
  const hint = { color: 'var(--color-on-surface-variant)' } as const;
  const h2 = 'text-lg font-bold';
  const h2Style = { fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' } as const;
  const badge = (text: string, tone: 'ok' | 'warn' | 'bad' | 'new') => (
    <span
      className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] whitespace-nowrap"
      style={{
        background: tone === 'ok' ? '#e3f1e8' : tone === 'warn' ? '#fff1cf' : tone === 'bad' ? '#f3dede' : '#e9c349',
        color: tone === 'ok' ? '#16653c' : tone === 'warn' ? '#7a5600' : tone === 'bad' ? 'var(--color-error)' : '#1a1c1c',
      }}
    >
      {text}
    </span>
  );
  const nowMs = new Date().getTime();
  const minutesAgo = (iso: string | null) => (iso ? Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000)) : 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={page.adminBasePath} active="tax-exempt" unreadMessagesCount={page.unreadMessagesCount} userEmail={page.userEmail} />
      <main className="px-4 md:px-8 py-8">
        <div className="mx-auto max-w-[1100px] grid gap-6">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>Sales</p>
            <h1 className="text-3xl md:text-4xl font-bold" style={h2Style}>Tax Exempt</h1>
            <p className="mt-2 text-sm max-w-2xl" style={hint}>
              Every Florida certificate the store accepted — from an in-store sale, a remote sale or a website request — with its photo, and the orders it covered.
              Photos are private: View opens a five-minute link. Nothing here is ever auto-deleted.
            </p>
          </div>

          {missingSql && (
            <div className="rounded-xl border p-4 text-sm" role="alert" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', background: '#fdf4f4' }}>
              Tax-exempt sales need <strong>supabase/tax-exempt-2026-10.sql</strong> run in the Supabase SQL editor first.
            </div>
          )}

          <section className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={h2} style={h2Style}>Waiting for approval · {pending.length}</h2>
              <span className="text-xs" style={hint}>Website buyers at checkout or in My Account</span>
            </div>
            {pending.length === 0 ? (
              <p className={`${card} text-sm`} style={{ ...cardStyle, ...hint }}>None waiting. When a buyer sends a certificate you get a text, and it shows here.</p>
            ) : pending.map((request) => (
              <Link key={request.id} href={`${page.adminBasePath}/tax-exempt/${request.id}`} className={`${card} grid gap-1 hover:shadow-md`} style={{ borderColor: '#e9c349', background: '#fffcf0' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{requestRefLabel(request.ref)} · {request.business_name ?? 'Business name not read'}</strong>
                  {badge(`Waiting ${minutesAgo(request.submitted_at)} min`, 'warn')}
                </div>
                <span className="text-sm" style={hint}>
                  {[request.customer_name, request.customer_phone, isAccountRequest(request) ? 'for their account, no order yet' : null, request.cart?.total != null ? `cart ${formatCurrency(request.cart.total)}` : null, request.cart?.tax != null ? `tax ${formatCurrency(request.cart.tax)}` : null].filter(Boolean).join(' · ')}
                </span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>Review and approve →</span>
              </Link>
            ))}
          </section>

          <section className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={h2} style={h2Style}>Certificates on file · {certificates.length}</h2>
              <span className="text-xs" style={hint}>{orders.length} exempt order{orders.length === 1 ? '' : 's'} · {formatCurrency(totalNotCharged)} tax not charged</span>
            </div>
            {certificates.length === 0 ? (
              <p className={`${card} text-sm`} style={{ ...cardStyle, ...hint }}>None yet. Tick &ldquo;Tax-exempt sale&rdquo; on an In-store or Remote sale, or approve a website request.</p>
            ) : (
              <div className={`${card} overflow-x-auto p-0`} style={cardStyle}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.6rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
                      <th className="p-3">Certificate</th>
                      <th className="p-3">Number</th>
                      <th className="p-3">Valid through</th>
                      <th className="p-3">Record</th>
                      <th className="p-3">Orders</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((row) => {
                      const used = ordersByCertificate.get(row.id) ?? [];
                      const usable = certificateIsUsable(row);
                      return (
                        <tr key={row.id} className="border-t align-top" style={cardStyle}>
                          <td className="p-3">
                            <strong>{row.business_name ?? 'Name not recorded'}</strong>
                            <span className="block text-xs" style={hint}>{row.cert_type ? `${TAX_CERT_TYPE_LABELS[row.cert_type].long} (${TAX_CERT_TYPE_LABELS[row.cert_type].form})` : 'Type not recorded'}</span>
                            <span className="block text-xs" style={hint}>{[row.customer_name, row.customer_email].filter(Boolean).join(' · ')}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap">{row.cert_number ?? '—'}{row.fl_auth_number ? <span className="block text-xs" style={hint}>Auth # {row.fl_auth_number}</span> : null}</td>
                          <td className="p-3 whitespace-nowrap">
                            {formatCertDate(row.expires_on) ?? '—'}
                            <span className="block mt-1">{row.status === 'revoked' ? badge('Withdrawn', 'bad') : usable ? badge('Usable', 'ok') : badge('Expired', 'warn')}</span>
                          </td>
                          <td className="p-3">
                            <span className="block">{TAX_EXEMPT_SOURCE_LABELS[row.source]} · {formatCertDate(row.approved_at)}</span>
                            {row.approved_by_email && <span className="block text-xs" style={hint}>by {row.approved_by_email}</span>}
                            <span className="block text-xs" style={hint}>{[row.photo_path ? 'Photo' : null, !row.photo_path && row.photo_mime === PAPER_COPY_MIME ? 'Paper copy filed' : null, row.physical_copy_seen ? 'Physical copy seen' : null, !row.photo_path && row.photo_mime !== PAPER_COPY_MIME && row.fl_auth_number ? `FL auth ${row.fl_auth_number}` : null, row.user_id ? 'Saved to their account' : null].filter(Boolean).join(' · ') || '—'}</span>
                            {row.photo_path && (
                              <a href={`/api/admin/tax-exempt/photo?path=${encodeURIComponent(row.photo_path)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline" style={{ color: 'var(--color-primary)' }}>View certificate</a>
                            )}
                          </td>
                          <td className="p-3">
                            {used.length === 0 ? <span style={hint}>—</span> : used.slice(0, 6).map((order) => (
                              <Link key={order.id} href={`${page.adminBasePath}/orders/${order.id}`} className="block text-xs underline whitespace-nowrap" style={{ color: 'var(--color-primary)' }}>{order.order_number}</Link>
                            ))}
                            {used.length > 6 && <span className="text-xs" style={hint}>+{used.length - 6} more</span>}
                          </td>
                          <td className="p-3"><CertificateStatusButton id={row.id} status={row.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {orders.length > 0 && (
            <section className="grid gap-3">
              <h2 className={h2} style={h2Style}>Tax-exempt orders · {orders.length}</h2>
              <div className={`${card} grid gap-1.5`} style={cardStyle}>
                {orders.slice(0, 50).map((order) => {
                  const snapshot = parseTaxExemptSnapshot(order.tax_exempt_snapshot);
                  return (
                    <div key={order.id} className="flex flex-wrap justify-between gap-2 text-sm border-b pb-1.5 last:border-b-0" style={cardStyle}>
                      <Link href={`${page.adminBasePath}/orders/${order.id}`} className="underline" style={{ color: 'var(--color-primary)' }}>{order.order_number}</Link>
                      <span className="flex-1 min-w-[180px]" style={hint}>{[paperDateLine(order.created_at).split(' · ')[0], order.customer_name, snapshot?.businessName, snapshot ? exemptShortTag(snapshot) : null, snapshot ? TAX_EXEMPT_SOURCE_LABELS[snapshot.approvedVia] : null].filter(Boolean).join(' · ')}</span>
                      <span>{formatCurrency(snapshot?.taxNotCharged ?? 0)} not charged</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section className="grid gap-3">
              <h2 className={h2} style={h2Style}>Recent website requests</h2>
              <div className={`${card} grid gap-1.5`} style={cardStyle}>
                {recent.map((request) => (
                  <Link key={request.id} href={`${page.adminBasePath}/tax-exempt/${request.id}`} className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>{requestRefLabel(request.ref)} · {request.business_name ?? '—'} · {request.customer_name ?? '—'}</span>
                    {badge(request.status, request.status === 'approved' ? 'ok' : request.status === 'declined' ? 'bad' : 'warn')}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
