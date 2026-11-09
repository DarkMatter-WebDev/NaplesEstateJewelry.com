'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminModal from '@/components/admin/AdminModal';
import IdPhotoCapture from '@/components/admin/buy-receipts/IdPhotoCapture';
import { prefersNativeCamera } from '@/components/admin/instant-sale/sale-client';
import { prepareLeadPhotos } from '@/lib/lead-photo-prep';
import {
  FL_CERT_VERIFY_URL,
  TAX_CERT_MAX_BYTES,
  TAX_CERT_TYPE_LABELS,
  TAX_CERT_TYPES,
  certificateProblemMessage,
  formatCertDate,
  paperCopyFiled,
  type CertificateChecks,
  type CertificateRead,
  type EditableCertificate,
  type TaxCertType,
} from '@/lib/tax-exempt';

/**
 * "Add photo & details" — Admin → Tax Exempt (each certificate row) and the
 * order's Tax exemption card (owner, 2026-11-09, mockup 1: "add the pic in the
 * main table… take the pic of it for digital copy too"). One window for both:
 * Take photo / Choose photo or PDF → the same AI read as Instant Sale
 * (`api/admin/tax-exempt/read`, private bucket, WebP verified on the server) →
 * the owner checks the boxes → Save updates the certificate and the Tax
 * exemption card of every order that used it. Tax amounts never change.
 */
export default function CertificatePhotoEditor({
  certificate,
  orderNumbers,
  label,
  variant = 'button',
}: {
  certificate: EditableCertificate;
  orderNumbers: string[];
  label: string;
  variant?: 'button' | 'link';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'button' ? (
        <button type="button" className="outline-button text-xs" style={{ padding: '0.42rem 0.9rem' }} onClick={() => setOpen(true)}>{label}</button>
      ) : (
        <button type="button" className="text-xs font-bold underline" style={{ color: 'var(--color-primary)' }} onClick={() => setOpen(true)}>{label}</button>
      )}
      {open && <EditorWindow certificate={certificate} orderNumbers={orderNumbers} onClose={() => setOpen(false)} />}
    </>
  );
}

const labelClass = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const aiTag = (
  <span className="ml-1.5 rounded px-1 py-0.5 text-[0.5rem] font-bold tracking-[0.12em]" style={{ background: '#efe7ff', color: '#5a3fa0' }}>AI</span>
);
const smallButton = 'rounded-full border bg-white px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] disabled:opacity-50';
const smallButtonStyle = { borderColor: 'color-mix(in srgb, var(--color-primary) 50%, transparent)', color: 'var(--color-primary)', fontFamily: 'var(--font-label)' } as const;

function EditorWindow({ certificate, orderNumbers, onClose }: { certificate: EditableCertificate; orderNumbers: string[]; onClose: () => void }) {
  const router = useRouter();
  const [certType, setCertType] = useState<TaxCertType | ''>(certificate.cert_type ?? '');
  const [businessName, setBusinessName] = useState(certificate.business_name ?? '');
  const [certNumber, setCertNumber] = useState(certificate.cert_number ?? '');
  const [expiresOn, setExpiresOn] = useState(certificate.expires_on ?? '');
  const [flAuthNumber, setFlAuthNumber] = useState(certificate.fl_auth_number ?? '');
  /** The photo uploaded in THIS window (not yet saved). */
  const [newPath, setNewPath] = useState<string | null>(null);
  const [newMime, setNewMime] = useState<string | null>(null);
  const [aiState, setAiState] = useState<string | null>(null);
  const [numberNeedsCheck, setNumberNeedsCheck] = useState(false);
  const [checks, setChecks] = useState<CertificateChecks | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);
  const newPathRef = useRef<string | null>(null);

  useEffect(() => { newPathRef.current = newPath; }, [newPath]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const hasPhoto = Boolean(newPath || certificate.photo_path);
  const paper = paperCopyFiled(certificate.photo_mime);
  const notFlorida = Boolean(aiState && aiState !== 'FL');

  function close() {
    // Escape inside the camera window closes only the camera.
    if (capturing) return;
    // An upload made here and never saved: remove it (only if nothing points at it).
    const unsaved = newPathRef.current;
    if (unsaved && !savedRef.current) {
      void fetch(`/api/admin/tax-exempt/certificates/${certificate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard', path: unsaved }),
        keepalive: true,
      }).catch(() => undefined);
    }
    onClose();
  }

  async function upload(file: Blob, name: string) {
    setNote(null);
    setChecks(null);
    setError(null);
    let body: Blob = file;
    if (file.type !== 'application/pdf' && file instanceof File) {
      try { body = (await prepareLeadPhotos([file])).files[0] ?? file; } catch { body = file; }
    }
    if (body.size > TAX_CERT_MAX_BYTES) { setNote({ ok: false, text: 'That file is too large (5 MB at most). Take a photo instead.' }); return; }
    setReading(true);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(body.type.startsWith('image/') ? URL.createObjectURL(body) : null);
    const form = new FormData();
    form.set('certificate', body, name);
    // A retake in this window removes the earlier, unsaved upload.
    if (newPath) form.set('replacePath', newPath);
    try {
      const res = await fetch('/api/admin/tax-exempt/read', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.path) { setNote({ ok: false, text: data.error ?? 'The certificate did not upload. Try again.' }); return; }
      const read: CertificateRead | null = data.read ?? null;
      const result: CertificateChecks | null = data.checks ?? null;
      setNewPath(data.path);
      setNewMime(data.mime ?? null);
      setChecks(result);
      setAiState(read?.issuingState ?? null);
      if (read?.certType === 'resale' || read?.certType === 'exemption') setCertType(read.certType);
      if (read?.businessName) setBusinessName(read.businessName);
      if (read?.certNumber) setCertNumber(read.certNumber);
      if (read?.expiresOn) setExpiresOn(read.expiresOn);
      setNumberNeedsCheck(Boolean(read?.certNumber) && !read?.numberClear);
      if (!read) setNote({ ok: false, text: data.note ?? 'The AI could not read it. Type the details in.' });
      // An expired date is fine here: it may have been valid on the day of the sale.
      else if (result && !result.ok && result.problem && result.problem !== 'expired') setNote({ ok: false, text: certificateProblemMessage(result.problem, read) });
      else setNote({ ok: true, text: 'Read by AI. Glance at the number against the certificate.' });
    } catch {
      setNote({ ok: false, text: 'The connection dropped. Take the photo again.' });
    } finally {
      setReading(false);
    }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void upload(file, file.name || 'certificate');
  }

  function takePhoto() {
    if (prefersNativeCamera()) cameraRef.current?.click();
    else setCapturing(true);
  }

  function problem(): string | null {
    if (notFlorida) return 'That is not a Florida certificate. Florida only accepts Florida-issued certificates.';
    if (hasPhoto && (!businessName.trim() || !certNumber.trim())) return 'Fill in the name and the certificate number.';
    if (!hasPhoto && !paper && !flAuthNumber.trim()) return 'Add a photo, or enter the Florida authorization number.';
    if (numberNeedsCheck) return 'Check the certificate number against the certificate, then tick "Number checked".';
    return null;
  }

  async function save() {
    const why = problem();
    if (why) { setError(why); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tax-exempt/certificates/${certificate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', photoPath: newPath, aiState, certType: certType || null, businessName, certNumber, expiresOn, flAuthNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not save it.'); return; }
      if (data.orderErrors) { setError('The certificate was saved, but an order card did not update. Reload and press Save again.'); savedRef.current = true; return; }
      savedRef.current = true;
      onClose();
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const chip = (on: boolean) => ({
    fontFamily: 'var(--font-label)',
    borderColor: on ? 'var(--color-primary)' : 'var(--color-outline-variant)',
    background: on ? '#fbf5dd' : '#fff',
    color: on ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
  });
  const fromAi = Boolean(newPath && note?.ok);
  const thumbLabel = newPath ? (newMime === 'application/pdf' ? 'PDF' : 'CERT') : certificate.photo_path ? 'ON FILE' : 'CERT';

  return (
    <AdminModal title={`Certificate · ${certificate.business_name ?? certificate.customer_name ?? 'details'}`} onClose={close} maxWidth="max-w-xl">
      <div className="grid gap-3.5">
        <p className="text-xs" style={hintStyle}>
          {orderNumbers.length > 0
            ? <>Used on <strong>{orderNumbers.join(', ')}</strong>. Saving updates this certificate and the Tax exemption card on {orderNumbers.length === 1 ? 'that order' : 'those orders'}. The tax amounts do not change.</>
            : 'Saving updates this certificate. No order uses it yet.'}
        </p>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-white p-2.5" style={{ borderColor: 'var(--color-outline-variant)' }}>
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="h-14 w-20 flex-shrink-0 rounded-md object-cover" />
          ) : (
            <div className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-md border border-dashed text-[0.55rem] font-bold tracking-[0.1em]" style={{ borderColor: 'var(--color-outline-variant)', color: '#7f7663' }}>
              {thumbLabel}
            </div>
          )}
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>Certificate photo</span>
            <span className="text-xs leading-snug" role={note && !note.ok ? 'alert' : undefined} style={{ color: note && !note.ok ? 'var(--color-error)' : note?.ok ? '#16653c' : 'var(--color-on-surface-variant)' }}>
              {reading
                ? 'Reading the certificate…'
                : note?.text ?? (certificate.photo_path ? 'A photo is on file. Take a new one to replace it (the old one is kept).' : 'One photo, the whole page flat. The AI fills in the rest.')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} style={smallButtonStyle} disabled={reading || saving} onClick={takePhoto}>{hasPhoto ? 'Retake' : 'Take photo'}</button>
            <button type="button" className={smallButton} style={smallButtonStyle} disabled={reading || saving} onClick={() => fileRef.current?.click()}>Choose photo / PDF</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>

        {checks && (
          <div className="grid gap-1 text-sm">
            <span style={{ color: checks.florida ? '#16653c' : 'var(--color-error)' }}>{checks.florida ? '✓ Florida certificate' : '✕ Not a Florida certificate — Florida only accepts Florida-issued certificates'}</span>
            {checks.florida && <span style={{ color: checks.typeOk ? '#16653c' : 'var(--color-error)' }}>{checks.typeOk && certType ? `✓ ${TAX_CERT_TYPE_LABELS[certType].long} (${TAX_CERT_TYPE_LABELS[certType].form})` : checks.typeOk ? '✓ Certificate' : '✕ Not a resale or exemption certificate'}</span>}
            {checks.florida && checks.current !== null && <span style={{ color: checks.current ? '#16653c' : '#7a5600' }}>{checks.current ? `✓ Valid through ${formatCertDate(expiresOn)}` : `Expired ${formatCertDate(expiresOn)} — fine if it was valid on the day of the sale`}</span>}
          </div>
        )}

        {!notFlorida && (
          <>
            <div>
              <span className={labelClass} style={labelStyle}>Type{fromAi && certType ? aiTag : null}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Certificate type">
                {TAX_CERT_TYPES.map((type) => (
                  <button key={type} type="button" onClick={() => setCertType(certType === type ? '' : type)} aria-pressed={certType === type} className="rounded-full border px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-left" style={chip(certType === type)}>
                    {TAX_CERT_TYPE_LABELS[type].short}
                    <span className="block text-[0.62rem] font-semibold normal-case tracking-normal">{TAX_CERT_TYPE_LABELS[type].long} {TAX_CERT_TYPE_LABELS[type].form}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={labelClass} style={labelStyle}>Name on certificate{fromAi && businessName ? aiTag : null}</span>
                <input className="form-field" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Coastal Jewelers LLC" autoComplete="off" />
              </label>
              <label className="block">
                <span className={labelClass} style={labelStyle}>Certificate number{fromAi && certNumber ? aiTag : null}</span>
                <input
                  className="form-field"
                  value={certNumber}
                  onChange={(e) => { setCertNumber(e.target.value); setNumberNeedsCheck(false); }}
                  placeholder="78-8012345678-9"
                  autoComplete="off"
                  style={numberNeedsCheck ? { borderColor: '#e9a400', borderWidth: 2, background: '#fffaf0' } : undefined}
                />
                {numberNeedsCheck ? (
                  <label className="mt-1 flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: '#7a5600' }}>
                    <input type="checkbox" checked={false} onChange={() => setNumberNeedsCheck(false)} className="h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
                    The AI was unsure of a digit — Number checked
                  </label>
                ) : (
                  <span className="mt-1 block text-xs" style={hintStyle}>Glance at it against the certificate.</span>
                )}
              </label>
              <label className="block">
                <span className={labelClass} style={labelStyle}>Valid through<span style={{ ...hintStyle, letterSpacing: '0.06em' }}> optional</span>{fromAi && expiresOn ? aiTag : null}</span>
                <input type="date" className="form-field" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass} style={labelStyle}>Florida authorization #<span style={{ ...hintStyle, letterSpacing: '0.06em' }}>{hasPhoto || paper ? ' optional' : ' required — no copy'}</span></span>
                <input className="form-field" value={flAuthNumber} onChange={(e) => setFlAuthNumber(e.target.value)} placeholder="From the Revenue check" autoComplete="off" />
              </label>
              <div className="self-end">
                <a href={FL_CERT_VERIFY_URL} target="_blank" rel="noopener noreferrer" className="outline-button text-xs">Verify with FL Revenue ↗</a>
              </div>
            </div>
            <p className="text-xs" style={hintStyle}>
              Kept as they were: {[certificate.physical_copy_seen ? 'Physical copy seen ✓' : null, paper ? 'Paper copy filed ✓' : null, 'how and when it was approved'].filter(Boolean).join(' · ')}. A non-Florida certificate can&rsquo;t be saved.
            </p>
          </>
        )}

        {error && <p className="text-sm" role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3.5" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <button type="button" className="text-sm" style={hintStyle} onClick={close}>Cancel</button>
          <button type="button" className="gold-button" onClick={() => void save()} disabled={saving || reading || notFlorida}>
            {saving ? 'Saving…' : 'Save certificate'}
          </button>
        </div>
      </div>

      {capturing && (
        <IdPhotoCapture
          title="Certificate photo"
          hint="Fill the picture with the whole certificate, flat and in good light, then press Capture."
          onCapture={(blob) => { setCapturing(false); void upload(blob, 'certificate.jpg'); }}
          onClose={() => setCapturing(false)}
        />
      )}
    </AdminModal>
  );
}
