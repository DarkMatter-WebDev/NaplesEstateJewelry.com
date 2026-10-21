'use client';

import { useRef, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import IdPhotoCapture from '@/components/admin/buy-receipts/IdPhotoCapture';
import { prefersNativeCamera } from './sale-client';

/**
 * One item's optional photo on an Instant Sale (owner mockup v1/v2,
 * 2026-10-21) — the Buy Receipts ID-photo strip's look. "Take photo" opens the
 * iPad's / phone's own camera, or on a computer the webcam window Buy Receipts
 * uses; "Choose photo" takes a picture file. A listed item shows its listing's
 * photo until one is taken; that one replaces it on this sale only.
 */
export default function SalePhotoField({
  photoUrl,
  listingPhoto,
  uploading,
  error,
  onPick,
  onRemove,
}: {
  photoUrl: string | null;
  listingPhoto: string | null;
  uploading: boolean;
  error: string | null;
  onPick: (photo: Blob) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const shown = photoUrl ?? listingPhoto;

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onPick(file);
  }

  function takePhoto() {
    if (prefersNativeCamera()) cameraRef.current?.click();
    else setCapturing(true);
  }

  const button = 'sale-photo-btn rounded-full border bg-white px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] disabled:opacity-50';
  const buttonStyle = { borderColor: 'color-mix(in srgb, var(--color-primary) 50%, transparent)', color: 'var(--color-primary)', fontFamily: 'var(--font-label)' } as const;

  return (
    <div className="sale-photo flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-2.5" style={{ borderColor: 'var(--color-outline-variant)', background: '#fcfbf7' }}>
      {shown ? (
        <button type="button" onClick={() => setViewing(true)} aria-label="View the photo" className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" className="h-16 w-16 rounded-lg object-cover" />
        </button>
      ) : (
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-dashed bg-white text-xl" style={{ borderColor: 'var(--color-outline-variant)', color: '#b5ab93' }} aria-hidden="true">＋</div>
      )}
      <div className="sale-photo-words grid min-w-0 flex-1 gap-0.5">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
          Photo<span style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.06em' }}> · optional</span>
        </span>
        <span className="text-xs leading-snug" style={{ color: error ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }} role={error ? 'alert' : undefined}>
          {uploading
            ? 'Uploading the photo…'
            : error
              ?? (photoUrl
                ? 'Taken for this sale. Shown on the order and the receipt.'
                : listingPhoto
                  ? 'The listing’s photo is used. Take or choose one to use a different picture.'
                  : 'No photo. Fine to leave it.')}
        </span>
      </div>
      <div className="sale-photo-buttons flex flex-wrap gap-2">
        <button type="button" className={button} style={buttonStyle} disabled={uploading} onClick={takePhoto}>
          {photoUrl ? 'Retake' : 'Take photo'}
        </button>
        <button type="button" className={button} style={buttonStyle} disabled={uploading} onClick={() => fileRef.current?.click()}>
          Choose photo
        </button>
        {photoUrl && (
          <button type="button" className="text-xs underline" style={{ color: 'var(--color-on-surface-variant)' }} disabled={uploading} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {capturing && (
        <IdPhotoCapture
          title="Item photo"
          hint="Fill the picture with the piece, then press Capture."
          onCapture={(blob) => { setCapturing(false); onPick(blob); }}
          onClose={() => setCapturing(false)}
        />
      )}
      {viewing && shown && (
        <AdminModal title="Item photo" onClose={() => setViewing(false)} maxWidth="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" className="mx-auto max-h-[75vh] w-auto max-w-full" />
        </AdminModal>
      )}
    </div>
  );
}
