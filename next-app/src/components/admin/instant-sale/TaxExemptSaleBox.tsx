'use client';

import { useEffect, useRef, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import IdPhotoCapture from '@/components/admin/buy-receipts/IdPhotoCapture';
import { prepareLeadPhotos } from '@/lib/lead-photo-prep';
import { prefersNativeCamera } from './sale-client';
import {
  FL_CERT_VERIFY_URL,
  TAX_CERT_MAX_BYTES,
  TAX_CERT_TYPE_LABELS,
  TAX_CERT_TYPES,
  certificateProblemMessage,
  easternDateKey,
  formatCertDate,
  type CertificateChecks,
  type CertificateRead,
  type TaxCertType,
} from '@/lib/tax-exempt';

/**
 * Instant Sale → "2. Customer" → "Tax-exempt sale (Florida certificate)"
 * (owner, mockup v2 2026-10-27), shared by In-store sale and Remote sale.
 *
 * Tick it, then EITHER take one photo of the certificate — the AI fills every
 * box like "Fill form from ID" on buy receipts, the owner only glances at the
 * number — OR tick "Customer showed me the physical certificate" and skip the
 * photo (the details become optional). A certificate already on file is one
 * pick. The photo goes to the private bucket straight away; the sale's route
 * stores the certificate and notes it on the order.
 */

export type TaxExemptBoxState = {
  enabled: boolean;
  /** A certificate on file was picked (then the fields below are ignored, except the FL authorization #). */
  certificateId: string | null;
  /** The picked certificate has a copy on file (photo or filed paper copy). Without one, this sale needs an FL authorization #. */
  pickedHasCopy: boolean;
  certType: TaxCertType | '';
  businessName: string;
  certNumber: string;
  /** `YYYY-MM-DD` from the date input. */
  expiresOn: string;
  flAuthNumber: string;
  photoPath: string | null;
  photoMime: string | null;
  physicalCopySeen: boolean;
  /** No photo: the customer's paper copy was kept for the store's files (the photo override). */
  paperCopyKept: boolean;
  saveForNextTime: boolean;
  /** The issuing state the AI read (blocks a non-Florida certificate). */
  aiState: string | null;
  /** The AI was not sure of every digit: the owner must look before recording. */
  numberNeedsCheck: boolean;
};

export function newTaxExemptBox(): TaxExemptBoxState {
  return {
    enabled: false,
    certificateId: null,
    pickedHasCopy: true,
    certType: '',
    businessName: '',
    certNumber: '',
    expiresOn: '',
    flAuthNumber: '',
    photoPath: null,
    photoMime: null,
    physicalCopySeen: false,
    paperCopyKept: false,
    saveForNextTime: true,
    aiState: null,
    numberNeedsCheck: false,
  };
}

/** What the sale routes receive (`normalizeTaxExemptSaleInput`). */
export function taxExemptPayload(box: TaxExemptBoxState) {
  if (!box.enabled) return { enabled: false };
  if (box.certificateId) return { enabled: true, certificateId: box.certificateId, flAuthNumber: box.flAuthNumber };
  return {
    enabled: true,
    certType: box.certType || null,
    businessName: box.businessName,
    certNumber: box.certNumber,
    expiresOn: box.expiresOn,
    flAuthNumber: box.flAuthNumber,
    photoPath: box.photoPath,
    physicalCopySeen: box.physicalCopySeen,
    paperCopyKept: !box.photoPath && box.physicalCopySeen && box.paperCopyKept,
    saveForNextTime: box.saveForNextTime,
    aiState: box.aiState,
  };
}

/** Why the sale cannot be recorded exempt yet, or null. Mirrors the server's rule. */
export function taxExemptProblem(box: TaxExemptBoxState): string | null {
  if (!box.enabled) return null;
  // Florida documents the sale by a copy OR an authorization number (Rules 12A-1.039(3) / 12A-1.038(3)).
  const noAuth = !box.flAuthNumber.trim();
  if (box.certificateId) {
    return !box.pickedHasCopy && noAuth ? 'Tax-exempt sale: that certificate has no copy on file. Verify it with FL Revenue and enter the Florida authorization number for this sale.' : null;
  }
  if (box.aiState && box.aiState !== 'FL') return 'Tax-exempt sale: that is not a Florida certificate. Untick the box to charge the tax.';
  if (!box.photoPath && !box.physicalCopySeen) return 'Tax-exempt sale: take a photo of the certificate, or tick "Customer showed me the physical certificate".';
  if (box.photoPath && (!box.businessName.trim() || !box.certNumber.trim())) return 'Tax-exempt sale: fill in the name and the certificate number.';
  if (!box.photoPath && !box.paperCopyKept && noAuth) return 'Tax-exempt sale: with no photo, tick "I kept a paper copy for our files", or verify it with FL Revenue and enter the Florida authorization number.';
  if (box.numberNeedsCheck) return 'Tax-exempt sale: check the certificate number against the certificate, then tick "Number checked".';
  if (box.expiresOn && box.expiresOn < easternDateKey()) return 'Tax-exempt sale: that certificate has expired.';
  return null;
}

/** The tax comes off once the box is complete. */
export function taxExemptApplies(box: TaxExemptBoxState): boolean {
  return box.enabled && taxExemptProblem(box) === null && (Boolean(box.certificateId) || Boolean(box.photoPath || box.physicalCopySeen));
}

type PickerRow = { id: string; summary: string; customer: string | null; hasCopy?: boolean };

const label = 'form-label';
const labelStyle = { color: 'var(--color-primary)' } as const;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const aiTag = (
  <span className="ml-1.5 rounded px-1 py-0.5 text-[0.5rem] font-bold tracking-[0.12em]" style={{ background: '#efe7ff', color: '#5a3fa0' }}>AI</span>
);

export default function TaxExemptSaleBox({ box, onChange }: { box: TaxExemptBoxState; onChange: (next: TaxExemptBoxState) => void }) {
  const [picker, setPicker] = useState<PickerRow[] | null>(null);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [checks, setChecks] = useState<CertificateChecks | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<TaxExemptBoxState>) => onChange({ ...box, ...patch });

  // The certificates on file, loaded once the box is ticked.
  useEffect(() => {
    if (!box.enabled || picker) return;
    let cancelled = false;
    fetch('/api/admin/tax-exempt/certificates', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setPicker(Array.isArray(data.certificates) ? data.certificates : []); })
      .catch(() => { if (!cancelled) setPicker([]); });
    return () => { cancelled = true; };
  }, [box.enabled, picker]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function upload(file: Blob, name: string) {
    setNote(null);
    setChecks(null);
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
    if (box.photoPath) form.set('replacePath', box.photoPath);
    try {
      const res = await fetch('/api/admin/tax-exempt/read', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.path) { setNote({ ok: false, text: data.error ?? 'The certificate did not upload. Try again.' }); return; }
      const read: CertificateRead | null = data.read ?? null;
      const result: CertificateChecks | null = data.checks ?? null;
      setChecks(result);
      onChange({
        ...box,
        photoPath: data.path,
        photoMime: data.mime ?? null,
        certificateId: null,
        certType: read?.certType === 'resale' || read?.certType === 'exemption' ? read.certType : box.certType,
        businessName: read?.businessName ?? box.businessName,
        certNumber: read?.certNumber ?? box.certNumber,
        expiresOn: read?.expiresOn ?? box.expiresOn,
        aiState: read?.issuingState ?? null,
        numberNeedsCheck: Boolean(read?.certNumber) && !read?.numberClear,
      });
      if (!read) setNote({ ok: false, text: data.note ?? 'The AI could not read it. Type the details in.' });
      else if (result && !result.ok && result.problem) setNote({ ok: false, text: certificateProblemMessage(result.problem, read) });
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

  const chip = (on: boolean) => ({
    fontFamily: 'var(--font-label)',
    borderColor: on ? 'var(--color-primary)' : 'var(--color-outline-variant)',
    background: on ? '#fbf5dd' : '#fff',
    color: on ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
  });
  const smallButton = 'rounded-full border bg-white px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] disabled:opacity-50';
  const smallButtonStyle = { borderColor: 'color-mix(in srgb, var(--color-primary) 50%, transparent)', color: 'var(--color-primary)', fontFamily: 'var(--font-label)' } as const;
  const notFlorida = Boolean(box.aiState && box.aiState !== 'FL');

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer w-fit" style={{ color: 'var(--color-on-surface)' }}>
        <input
          type="checkbox"
          checked={box.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="h-[18px] w-[18px]"
          style={{ accentColor: 'var(--color-primary)' }}
        />
        Tax-exempt sale <span className="text-xs font-normal" style={hintStyle}>Florida certificate</span>
      </label>

      {box.enabled && (
        <div className="grid gap-3 rounded-2xl border p-4" style={{ borderColor: '#e9c349', background: '#fffcf0' }}>
          <label className="block">
            <span className={label} style={labelStyle}>Certificate</span>
            <select
              className="form-field"
              value={box.certificateId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null;
                set({ certificateId: id, pickedHasCopy: (picker ?? []).find((row) => row.id === id)?.hasCopy !== false });
              }}
            >
              <option value="">New certificate</option>
              {(picker ?? []).map((row) => (
                <option key={row.id} value={row.id}>{row.summary}{row.customer ? ` — ${row.customer}` : ''}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs" style={hintStyle}>
              {picker === null ? 'Loading certificates on file…' : picker.length > 0 ? 'Or pick one on file — one pick, nothing to retype.' : 'None on file yet. Each new one is saved for next time.'}
            </span>
          </label>

          {box.certificateId && !box.pickedHasCopy && (
            <div className="grid gap-2 rounded-xl border bg-white p-3" style={{ borderColor: '#e9a400' }}>
              <span className="text-xs" style={{ color: '#7a5600' }}>
                <strong>No copy of this certificate on file.</strong> Florida needs a copy or an authorization number for each sale: verify it and enter the number (or choose “New certificate” and take a photo).
              </span>
              <label className="block">
                <span className={label} style={labelStyle}>Florida authorization # for this sale</span>
                <input className="form-field" value={box.flAuthNumber} onChange={(e) => set({ flAuthNumber: e.target.value })} placeholder="From the Revenue check" autoComplete="off" />
              </label>
              <a href={FL_CERT_VERIFY_URL} target="_blank" rel="noopener noreferrer" className="outline-button text-xs justify-self-start">Verify with FL Revenue ↗</a>
            </div>
          )}

          {!box.certificateId && (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-white p-2.5" style={{ borderColor: 'var(--color-outline-variant)' }}>
                {preview ? (
                  <button type="button" onClick={() => setViewing(true)} aria-label="View the certificate photo" className="flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="" className="h-14 w-20 rounded-md object-cover" />
                  </button>
                ) : (
                  <div className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-md border border-dashed text-[0.55rem] font-bold tracking-[0.1em]" style={{ borderColor: 'var(--color-outline-variant)', color: '#7f7663' }}>
                    {box.photoPath ? (box.photoMime === 'application/pdf' ? 'PDF' : 'CERT') : 'CERT'}
                  </div>
                )}
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>Certificate photo</span>
                  <span className="text-xs leading-snug" role={note && !note.ok ? 'alert' : undefined} style={{ color: note && !note.ok ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}>
                    {reading ? 'Reading the certificate…' : note?.text ?? (box.photoPath ? 'Stored privately — only admins can open it.' : 'One photo, the whole page flat. The AI fills in the rest.')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={smallButton} style={smallButtonStyle} disabled={reading} onClick={takePhoto}>{box.photoPath ? 'Retake' : 'Take photo'}</button>
                  <button type="button" className={smallButton} style={smallButtonStyle} disabled={reading} onClick={() => fileRef.current?.click()}>Choose photo / PDF</button>
                </div>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
              </div>

              {checks && (
                <div className="grid gap-1 text-sm">
                  <span style={{ color: checks.florida ? '#16653c' : 'var(--color-error)' }}>{checks.florida ? '✓ Florida certificate' : '✕ Not a Florida certificate — Florida only accepts Florida-issued certificates'}</span>
                  {checks.florida && <span style={{ color: checks.typeOk ? '#16653c' : 'var(--color-error)' }}>{checks.typeOk ? `✓ ${box.certType ? `${TAX_CERT_TYPE_LABELS[box.certType as TaxCertType].long} (${TAX_CERT_TYPE_LABELS[box.certType as TaxCertType].form})` : 'Certificate'}` : '✕ Not a resale or exemption certificate'}</span>}
                  {checks.florida && checks.current !== null && <span style={{ color: checks.current ? '#16653c' : 'var(--color-error)' }}>{checks.current ? `✓ Valid through ${formatCertDate(box.expiresOn)}` : '✕ Expired'}</span>}
                </div>
              )}

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={box.physicalCopySeen} onChange={(e) => set({ physicalCopySeen: e.target.checked })} className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
                <span>
                  <strong>Customer showed me the physical certificate</strong>
                  <span className="block text-xs" style={hintStyle}>
                    {box.photoPath ? 'Noted on the order with the photo.' : 'No time for a photo? Keep their paper copy, or verify it with FL Revenue and enter the Florida authorization number below. Florida needs a copy or that number. The other details are optional.'}
                  </span>
                </span>
              </label>
              {box.physicalCopySeen && !box.photoPath && (
                <label className="ml-6 flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={box.paperCopyKept} onChange={(e) => set({ paperCopyKept: e.target.checked })} className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
                  <span>
                    <strong>I kept a paper copy for our files</strong>
                    <span className="block text-xs" style={hintStyle}>A filed paper copy counts as the copy Florida asks for: no photo or authorization number needed. Keep it with the sale records (3 years).</span>
                  </span>
                </label>
              )}

              {!notFlorida && (
                <>
                  <div>
                    <span className={label} style={labelStyle}>Type{box.photoPath && box.certType ? aiTag : null}</span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Certificate type">
                      {TAX_CERT_TYPES.map((type) => (
                        <button key={type} type="button" onClick={() => set({ certType: box.certType === type ? '' : type })} aria-pressed={box.certType === type} className="rounded-full border px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-left" style={chip(box.certType === type)}>
                          {TAX_CERT_TYPE_LABELS[type].short}
                          <span className="block text-[0.62rem] font-semibold normal-case tracking-normal">{TAX_CERT_TYPE_LABELS[type].long} {TAX_CERT_TYPE_LABELS[type].form}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={label} style={labelStyle}>Name on certificate{box.photoPath && box.businessName ? aiTag : null}</span>
                      <input className="form-field" value={box.businessName} onChange={(e) => set({ businessName: e.target.value })} placeholder="Coastal Jewelers LLC" autoComplete="off" />
                    </label>
                    <label className="block">
                      <span className={label} style={labelStyle}>Certificate number{box.photoPath && box.certNumber ? aiTag : null}</span>
                      <input
                        className="form-field"
                        value={box.certNumber}
                        onChange={(e) => set({ certNumber: e.target.value, numberNeedsCheck: false })}
                        placeholder="78-8012345678-9"
                        autoComplete="off"
                        style={box.numberNeedsCheck ? { borderColor: '#e9a400', borderWidth: 2, background: '#fffaf0' } : undefined}
                      />
                      {box.numberNeedsCheck ? (
                        <label className="mt-1 flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: '#7a5600' }}>
                          <input type="checkbox" checked={false} onChange={() => set({ numberNeedsCheck: false })} className="h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
                          The AI was unsure of a digit — Number checked
                        </label>
                      ) : (
                        <span className="mt-1 block text-xs" style={hintStyle}>Glance at it against the certificate.</span>
                      )}
                    </label>
                    <label className="block">
                      <span className={label} style={labelStyle}>Valid through<span style={{ ...hintStyle, letterSpacing: '0.06em' }}> optional</span>{box.photoPath && box.expiresOn ? aiTag : null}</span>
                      <input type="date" className="form-field" value={box.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className={label} style={labelStyle}>Florida authorization #<span style={{ ...hintStyle, letterSpacing: '0.06em' }}>{box.photoPath || box.paperCopyKept ? ' optional' : ' required — no copy'}</span></span>
                      <input className="form-field" value={box.flAuthNumber} onChange={(e) => set({ flAuthNumber: e.target.value })} placeholder="From the Revenue check" autoComplete="off" />
                    </label>
                    <div className="self-end">
                      <a href={FL_CERT_VERIFY_URL} target="_blank" rel="noopener noreferrer" className="outline-button text-xs">Verify with FL Revenue ↗</a>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer w-fit">
                    <input type="checkbox" checked={box.saveForNextTime} onChange={(e) => set({ saveForNextTime: e.target.checked })} className="h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
                    Save for next time (one pick on their next visit)
                  </label>
                </>
              )}
            </>
          )}
          <span className="text-xs" style={hintStyle}>Tax comes off the whole sale (items + shipping). The certificate is noted on the order, the receipt and Admin → Tax Exempt.</span>
        </div>
      )}

      {capturing && (
        <IdPhotoCapture
          title="Certificate photo"
          hint="Fill the picture with the whole certificate, flat and in good light, then press Capture."
          onCapture={(blob) => { setCapturing(false); void upload(blob, 'certificate.jpg'); }}
          onClose={() => setCapturing(false)}
        />
      )}
      {viewing && preview && (
        <AdminModal title="Certificate photo" onClose={() => setViewing(false)} maxWidth="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="mx-auto max-h-[75vh] w-auto max-w-full" />
        </AdminModal>
      )}
    </div>
  );
}
