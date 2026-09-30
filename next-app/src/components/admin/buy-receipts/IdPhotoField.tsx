'use client';

import { useRef, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import IdPhotoCapture from './IdPhotoCapture';
import { prepareIdPhoto } from './buy-receipt-client';

/**
 * The "Seller ID photo" strip under the seller fields. Screen only (`no-print`):
 * it is a control, not part of the receipt. "Use webcam" opens the capture
 * window; "Choose a photo" takes a picture file (a phone photo, a scan).
 *
 * It only hands the picture to its parent. Whether that means "hold it until
 * the receipt is saved" (new receipt) or "upload now" (saved receipt) is the
 * parent's business.
 */
export default function IdPhotoField({
  previewUrl,
  busy = false,
  note,
  onPick,
  onRemove,
}: {
  /** What to show: an object URL for a photo not uploaded yet, or a signed link. */
  previewUrl: string | null;
  busy?: boolean;
  /** A line under the title, e.g. an upload error. */
  note?: { text: string; ok: boolean } | null;
  onPick: (photo: Blob) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const has = Boolean(previewUrl);
  const working = busy || preparing;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      onPick(await prepareIdPhoto(file));
    } finally {
      setPreparing(false);
    }
  }

  const buttonClass = 'border bg-white px-3 py-1.5 text-xs font-semibold';
  const buttonStyle = { borderColor: '#d5c697', color: '#735c00' } as const;

  return (
    <div
      className="no-print mt-3 flex flex-wrap items-center gap-3 px-3 py-2.5"
      style={{ border: '1px dashed #d5c697', background: '#fbf9f2' }}
    >
      {has ? (
        <button type="button" onClick={() => setViewing(true)} aria-label="View the ID photo" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl ?? ''} alt="Seller ID" style={{ width: 96, height: 60, objectFit: 'cover', border: '1px solid #d5c697' }} />
        </button>
      ) : (
        <div
          className="flex shrink-0 items-center justify-center text-[11px]"
          style={{ width: 96, height: 60, border: '1px solid #d5c697', background: '#ffffff', color: '#746b5b' }}
        >
          No photo
        </div>
      )}
      <div className="min-w-[150px] flex-1">
        <div className="text-[13px]" style={{ color: '#1a1c1c' }}>
          {working ? 'Working on the photo…' : has ? 'Seller ID photo attached' : 'Seller ID photo (optional)'}
        </div>
        <div className="text-[11.5px]" style={{ color: note && !note.ok ? '#a32d2d' : '#746b5b' }}>
          {note?.text ?? "Kept with this receipt. Not printed on the seller's copy."}
        </div>
      </div>
      <button type="button" className={buttonClass} style={buttonStyle} disabled={working} onClick={() => setCapturing(true)}>
        {has ? 'Retake' : 'Use webcam'}
      </button>
      <button type="button" className={buttonClass} style={buttonStyle} disabled={working} onClick={() => fileRef.current?.click()}>
        Choose a photo
      </button>
      {has && (
        <button type="button" className="text-xs underline" style={{ color: '#746b5b' }} disabled={working} onClick={onRemove}>
          Remove
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {capturing && <IdPhotoCapture onCapture={onPick} onClose={() => setCapturing(false)} />}
      {viewing && previewUrl && (
        <AdminModal title="Seller ID photo" onClose={() => setViewing(false)} maxWidth="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Seller ID" className="mx-auto max-h-[75vh] w-auto max-w-full" />
        </AdminModal>
      )}
    </div>
  );
}
