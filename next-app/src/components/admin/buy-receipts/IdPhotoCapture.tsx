'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';

/**
 * The webcam window for the seller's ID photo (owner mockup 2026-09-30).
 *
 * Live picture with a card-shaped guide → Capture → the still → Retake or
 * Use this photo. The camera is released the moment the window closes.
 *
 * The camera needs two things that are easy to miss:
 * - the site's Permissions-Policy must allow it (`camera=(self)` in BOTH
 *   next.config.ts and netlify.toml — it was `camera=()` until this feature);
 * - a secure page: https, or localhost. A plain http LAN address has no camera.
 */

type Camera = { deviceId: string; label: string };

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera is blocked for this site. Click the camera icon in the address bar to allow it, or use "Choose a photo" instead.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this computer. Use "Choose a photo" instead.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is in use by another program. Close it and try again.';
  }
  return 'The camera could not be started. Use "Choose a photo" instead.';
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function IdPhotoCapture({ onCapture, onClose }: { onCapture: (photo: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null);

  const start = useCallback(async (wanted: string) => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setReady(false);
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('The camera only works on the secure site (https) or on localhost. Use "Choose a photo" instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(wanted ? { deviceId: { exact: wanted } } : {}),
          // On a phone or tablet start with the rear camera; a laptop ignores this.
          facingMode: wanted ? undefined : { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setReady(true);

      // Camera names are only readable once permission has been given.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const found = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }));
      setCameras(found);
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (active) setDeviceId(active);
    } catch (caught) {
      setError(cameraErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    // Starting the camera is an external subscription; its result arrives later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start('');
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [start]);

  useEffect(() => {
    const url = still?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [still]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        // `toBlob` may hand back a different type than asked for; the server
        // re-encodes whatever arrives, so any real image blob is fine here.
        if (!blob || !blob.type.startsWith('image/')) {
          setError('The photo could not be captured. Try again.');
          return;
        }
        setStill({ blob, url: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      0.92,
    );
  }

  function acceptPhoto() {
    if (!still) return;
    onCapture(still.blob);
    onClose();
  }

  return (
    <AdminModal title="Seller ID photo" onClose={onClose} maxWidth="max-w-2xl">
      <div className="grid gap-3">
        <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {still && <img src={still.url} alt="Captured ID" className="absolute inset-0 h-full w-full object-contain" />}
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            style={{ visibility: still ? 'hidden' : 'visible' }}
          />
          {!still && ready && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center text-center text-xs"
              style={{
                width: '62%',
                aspectRatio: '3.375 / 2.125',
                transform: 'translate(-50%, -50%)',
                border: '2px dashed #fac775',
                borderRadius: 10,
                color: '#fac775',
              }}
            >
              Hold the license inside the frame
            </div>
          )}
          {!still && !ready && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Starting the camera…</p>
          )}
        </div>

        {error && (
          <p role="alert" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
            {error}
          </p>
        )}

        {still ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="outline-button text-xs" onClick={() => setStill(null)}>
              Retake
            </button>
            <button type="button" className="gold-button text-xs" onClick={acceptPhoto}>
              Use this photo
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {cameras.length > 1 && (
              <select
                className="form-field flex-1"
                style={{ minWidth: 180 }}
                value={deviceId}
                aria-label="Camera"
                onChange={(event) => {
                  setDeviceId(event.target.value);
                  void start(event.target.value);
                }}
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                  </option>
                ))}
              </select>
            )}
            <span className="flex-1" />
            <button type="button" className="outline-button text-xs" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="gold-button text-xs" disabled={!ready} onClick={capture}>
              Capture
            </button>
          </div>
        )}
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          The photo is kept with this receipt for your records. It is not printed on the seller&apos;s copy.
        </p>
      </div>
    </AdminModal>
  );
}
