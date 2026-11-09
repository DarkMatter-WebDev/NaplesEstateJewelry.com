import Link from 'next/link';
import { formatCurrency } from '@/types/sales';
import CertificatePhotoEditor from '@/components/admin/tax-exempt/CertificatePhotoEditor';
import {
  TAX_CERT_TYPE_LABELS,
  TAX_EXEMPT_SOURCE_LABELS,
  copyOnFileLabel,
  formatCertDate,
  paperCopyFiled,
  type EditableCertificate,
  type TaxExemptSnapshot,
} from '@/lib/tax-exempt';
import { paperDateLine } from '@/lib/order-receipt-paper';

const GOLD = '#735c00';
const BORDER = 'var(--color-outline-variant)';

/**
 * The order page's "Tax exemption" card (owner, 2026-10-27: "make sure the tax
 * id photo is saved in a dedicated area of admin and noted on the order").
 * Reads the snapshot stored on the order, so it stays right even if the
 * certificate is later withdrawn. "View certificate" opens a five-minute
 * signed link (admins only); the file itself is kept, never auto-deleted.
 *
 * "Add certificate photo" / "Replace photo" (owner, 2026-11-09, mockup 1)
 * opens the same window as Admin → Tax Exempt: it completes the certificate
 * and this card after the sale. Tax amounts never change.
 */
export default function OrderTaxExemptionPanel({
  snapshot,
  adminBasePath,
  editor = null,
}: {
  snapshot: TaxExemptSnapshot;
  adminBasePath: string;
  editor?: { certificate: EditableCertificate; orderNumbers: string[] } | null;
}) {
  const copy = copyOnFileLabel({ photoPath: snapshot.photoPath, photoMime: snapshot.photoMime });
  const rows: [string, string][] = [
    ['Type', snapshot.certType ? `${TAX_CERT_TYPE_LABELS[snapshot.certType].long} (${TAX_CERT_TYPE_LABELS[snapshot.certType].form})` : 'Not recorded'],
    ['Name', snapshot.businessName ?? 'Not recorded'],
    ['Number', snapshot.certNumber ?? 'Not recorded'],
    ['Valid through', formatCertDate(snapshot.expiresOn) ?? '—'],
    ['Copy on file', copy ? copy.replace('Paper copy filed', 'Paper copy (filed in store)') : 'None'],
    ['Physical copy seen', snapshot.physicalCopySeen ? 'Yes' : 'No'],
    ['Florida auth #', snapshot.flAuthNumber ?? '—'],
    ['Approved', [TAX_EXEMPT_SOURCE_LABELS[snapshot.approvedVia], snapshot.requestRef, paperDateLine(snapshot.approvedAt)].filter(Boolean).join(' · ')],
    ...(snapshot.approvedBy ? [['By', snapshot.approvedBy] as [string, string]] : []),
    ...(snapshot.editedAt ? [['Details added', [paperDateLine(snapshot.editedAt), snapshot.editedBy].filter(Boolean).join(' · ')] as [string, string]] : []),
    ['Tax not charged', formatCurrency(snapshot.taxNotCharged)],
  ];
  return (
    <section className="border p-5" style={{ borderColor: '#d4af37', background: '#fffcf0' }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Tax exemption</h2>
        <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em]" style={{ background: '#e3f1e8', color: '#16653c' }}>Florida · exempt</span>
      </div>
      <div className="grid gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
            <span className="text-right">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: BORDER }}>
        {snapshot.photoPath ? (
          <>
            <a href={`/api/admin/tax-exempt/photo?path=${encodeURIComponent(snapshot.photoPath)}`} target="_blank" rel="noopener noreferrer" className="outline-button text-xs">
              View certificate
            </a>
            {editor && <CertificatePhotoEditor certificate={editor.certificate} orderNumbers={editor.orderNumbers} label="Replace photo" variant="link" />}
          </>
        ) : (
          <>
            {editor && <CertificatePhotoEditor certificate={editor.certificate} orderNumbers={editor.orderNumbers} label="Add certificate photo" />}
            <span className="basis-full text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {paperCopyFiled(snapshot.photoMime)
                ? "No photo — the customer's paper copy is filed in the store."
                : snapshot.flAuthNumber
                  ? 'No copy — documented by the Florida authorization number above.'
                  : 'No photo — the physical copy was seen in store.'}
            </span>
          </>
        )}
        <Link href={`${adminBasePath}/tax-exempt`} className="text-xs underline self-center" style={{ color: GOLD }}>All certificates</Link>
      </div>
    </section>
  );
}
