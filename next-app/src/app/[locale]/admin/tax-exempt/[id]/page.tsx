import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminHeader from '@/components/admin/AdminHeader';
import TaxExemptReviewActions from '@/components/admin/tax-exempt/TaxExemptReviewActions';
import { loadInstantSalePage } from '@/components/admin/instant-sale/load-instant-sale-page';
import { createServiceClient } from '@/lib/supabase/service';
import { findRequestById, isAccountRequest, signedCertificateUrl } from '@/lib/tax-exempt-server';
import { TAX_CERT_TYPE_LABELS, formatCertDate, requestRefLabel } from '@/lib/tax-exempt';
import { isProductPurchasable } from '@/types/product';
import { formatCurrency } from '@/types/sales';
import { paperDateLine } from '@/lib/order-receipt-paper';

export const metadata: Metadata = { title: 'Admin - Tax-exempt request', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * The page the owner's text opens (owner, mockup v2 tab 3): one screen built
 * for a phone — the certificate, what the AI read and checked, the buyer and
 * the cart (with whether each piece is still for sale), Verify with FL
 * Revenue, then Approve or Decline. Approving makes the buyer's open checkout
 * drop the tax within a few seconds.
 */
export default async function AdminTaxExemptRequestPage({ params }: Props) {
  const { locale, id } = await params;
  const page = await loadInstantSalePage(locale, { products: false });
  const service = createServiceClient();
  const request = await findRequestById(service, id);
  if (!request) notFound();

  const photoUrl = await signedCertificateUrl(service, request.photo_path, 600);
  const isPdf = request.photo_mime === 'application/pdf';
  const productIds = (request.cart?.items ?? []).map((item) => item.productId).filter((value): value is string => Boolean(value));
  const { data: products } = productIds.length > 0
    ? await service.from('products').select('id, status, quantity').in('id', productIds)
    : { data: [] };
  const availability = new Map((products ?? []).map((p) => [String(p.id), isProductPurchasable(p.status as string, p.quantity as number | null)]));
  const nowMs = new Date().getTime();
  const waited = request.submitted_at ? Math.max(0, Math.round((nowMs - new Date(request.submitted_at).getTime()) / 60_000)) : null;
  const checks = request.ai_checks;
  const forAccount = isAccountRequest(request);
  const hint = { color: 'var(--color-on-surface-variant)' } as const;
  const row = (label: string, value: string | null) => (
    <div className="flex justify-between gap-3 text-sm">
      <span style={hint}>{label}</span>
      <span className="text-right">{value ?? '—'}</span>
    </div>
  );
  const statusBadge = {
    pending: { text: waited != null ? `Waiting ${waited} min` : 'Waiting', bg: '#fff1cf', color: '#7a5600' },
    approved: { text: 'Approved', bg: '#e3f1e8', color: '#16653c' },
    declined: { text: 'Declined', bg: '#f3dede', color: 'var(--color-error)' },
    cancelled: { text: 'Buyer cancelled', bg: '#eee', color: '#555' },
    draft: { text: 'Not sent yet', bg: '#eee', color: '#555' },
  }[request.status];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader adminBasePath={page.adminBasePath} active="tax-exempt" unreadMessagesCount={page.unreadMessagesCount} userEmail={page.userEmail} />
      <main className="px-4 py-6">
        <div className="mx-auto max-w-[460px] grid gap-4">
          <Link href={`${page.adminBasePath}/tax-exempt`} className="text-xs underline" style={{ color: 'var(--color-primary)' }}>← Tax Exempt</Link>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>Tax-exempt request</p>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{requestRefLabel(request.ref)}</h1>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em]" style={{ background: statusBadge.bg, color: statusBadge.color }}>{statusBadge.text}</span>
          </div>

          <section className="rounded-[1.25rem] border bg-white p-4 grid gap-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
            {photoUrl ? (
              isPdf ? (
                <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="outline-button text-xs justify-center">Open the certificate (PDF)</a>
              ) : (
                <a href={photoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the certificate photo full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="The buyer's certificate" className="w-full rounded-lg border" style={{ borderColor: 'var(--color-outline-variant)' }} />
                </a>
              )
            ) : (
              <span className="text-sm" style={{ color: 'var(--color-error)' }}>The certificate file could not be opened.</span>
            )}
            {!checks && (
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: '#e9a400', background: '#fffaf0' }}>
                <strong>Not read by AI</strong> (the day&rsquo;s limit for customer uploads was reached). Check the photo yourself: Florida-issued, DR-13 or DR-14, not expired, and type the name and number below before approving.
              </div>
            )}
            {checks && (
              <div className="grid gap-1 text-sm">
                <span style={{ color: checks.florida ? '#16653c' : 'var(--color-error)' }}>{checks.florida ? '✓' : '✕'} Florida certificate</span>
                <span style={{ color: checks.typeOk ? '#16653c' : 'var(--color-error)' }}>{checks.typeOk ? '✓' : '✕'} {request.cert_type ? `${TAX_CERT_TYPE_LABELS[request.cert_type].long} (${TAX_CERT_TYPE_LABELS[request.cert_type].form})` : 'Resale or exemption certificate'}</span>
                <span style={{ color: checks.current === false ? 'var(--color-error)' : checks.current ? '#16653c' : '#7a5600' }}>
                  {checks.current === false ? '✕ Expired' : checks.current ? `✓ Valid through ${formatCertDate(request.expires_on)}` : '! No expiry date could be read — check the photo'}
                </span>
              </div>
            )}
            {row('Name read', request.business_name)}
            {row('Number read', request.cert_number)}
            {row('Buyer', [request.customer_name, request.customer_phone].filter(Boolean).join(' · ') || null)}
            {row('Email', request.customer_email)}
            {forAccount ? (
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: '#e9c349', background: '#fffcf0' }}>
                <strong>For their account, no order yet.</strong> Sent from My Account. Once approved it is saved to their account and comes off at every checkout while they&rsquo;re signed in, until it expires.
              </div>
            ) : (
              <>
                {row('Delivery', request.cart?.shippingMethod === 'local-pickup' ? 'Pickup in store' : request.cart?.shippingState ? `Ships to ${request.cart.shippingState}` : null)}
                {row('Save to their account', request.save_to_account ? 'Yes, they asked' : 'No')}
              </>
            )}
            {(request.cart?.items ?? []).map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: 'var(--color-outline-variant)' }}>
                <span className="min-w-0">{item.title}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</span>
                <span className="whitespace-nowrap text-right">
                  {formatCurrency(item.price)}
                  {item.productId && availability.has(item.productId) && (
                    <span className="block text-[0.6rem] font-bold uppercase tracking-[0.08em]" style={{ color: availability.get(item.productId) ? '#16653c' : 'var(--color-error)' }}>
                      {availability.get(item.productId) ? 'Available' : 'Sold'}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {request.cart?.tax != null && (
              <div className="flex justify-between gap-3 text-sm font-bold"><span>Tax not charged</span><span>{formatCurrency(request.cart.tax)}</span></div>
            )}
          </section>

          {request.status === 'pending' ? (
            <section className="rounded-[1.25rem] border bg-white p-4" style={{ borderColor: '#e9c349' }}>
              <TaxExemptReviewActions requestId={request.id} businessName={request.business_name} certNumber={request.cert_number} />
            </section>
          ) : (
            <section className="rounded-[1.25rem] border p-4 grid gap-1 text-sm" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}>
              {request.status === 'approved' && (
                forAccount ? (
                  <span><strong>Approved</strong> {request.decided_at ? paperDateLine(request.decided_at) : ''}{request.decided_by_email ? ` by ${request.decided_by_email}` : ''}. Saved to their account; their My Account card updated and they were emailed. It applies at checkout until it expires.</span>
                ) : (
                  <span><strong>Approved</strong> {request.decided_at ? paperDateLine(request.decided_at) : ''}{request.decided_by_email ? ` by ${request.decided_by_email}` : ''}. The buyer&rsquo;s checkout updated and they were emailed a link to finish. Good for 24 hours; the certificate stays on file.</span>
                )
              )}
              {request.status === 'declined' && (
                <span><strong>Declined</strong>{request.decline_reason ? `: "${request.decline_reason}"` : ''}. The buyer was told {forAccount ? 'on their My Account card' : 'on their checkout'} and by email.</span>
              )}
              {request.status === 'cancelled' && <span>The buyer cancelled this request and chose to pay with tax.</span>}
              {request.status === 'draft' && <span>The buyer uploaded this but has not sent it for approval.</span>}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
