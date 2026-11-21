'use client';

/* eslint-disable @next/next/no-img-element -- item thumbnails from Storage/app assets, same as the receipt paper */
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { PICKUP_STATEMENT, pickupItemDetail, type PickupPaperItem } from '@/lib/order-pickup';

/**
 * The signing screen (owner, 2026-11-21, mockup 1): handed to the customer on
 * the iPad or iPhone the admin is using. No lock — the admin is right there
 * (owner: "no need to lock the finger sign feature").
 *
 * Fills the whole screen; no prices. The box takes a finger (or mouse / pen)
 * through Pointer Events with `touch-action: none`, so the page never scrolls
 * while someone signs. Strokes are kept in box-relative units and redrawn on a
 * resize, so turning the phone does not lose the signature.
 *
 * Done hands back a PNG (checked to really be PNG) and the printed name;
 * the parent saves it. Cancel saves nothing.
 *
 * ⚠️ Chromium cannot prove Safari's touch behaviour — the owner's first
 * signature on the real iPad / iPhone is the check (phone-editor memory).
 */

type Point = { x: number; y: number };

const INK = '#1d2a5a';

export default function PickupSignatureScreen({
  orderNumber,
  dateLabel,
  pickedUpBy,
  items,
  initialName,
  busy = false,
  error = null,
  onCancel,
  onDone,
}: {
  orderNumber: string;
  /** "Sat, Nov 21, 2026" — shown, not editable; the server stamps the real time. */
  dateLabel: string;
  pickedUpBy: string;
  items: PickupPaperItem[];
  initialName: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onDone: (signature: Blob, signedName: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef<{ pointerId: number } | null>(null);
  const [inked, setInked] = useState(false);
  const [name, setName] = useState(initialName);
  const [readAll, setReadAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const rect = box.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrokes(context, strokesRef.current, rect.width, rect.height);
  }, []);

  // Size the canvas to its box now and whenever the box changes (rotation, keyboard).
  useEffect(() => {
    redraw();
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(box);
    return () => observer.disconnect();
  }, [redraw]);

  // The page behind must not scroll or bounce while this is up.
  useEffect(() => {
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior };
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = previous.overflow;
      html.style.overscrollBehavior = previous.overscroll;
    };
  }, []);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || drawingRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = { pointerId: event.pointerId };
    strokesRef.current.push([pointFrom(event)]);
    setProblem(null);
    redraw();
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (drawingRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    // Coalesced events give the full finger path on iPad instead of a jagged line.
    const native = event.nativeEvent as PointerEvent;
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const rect = event.currentTarget.getBoundingClientRect();
    if (events.length > 0) {
      for (const each of events) stroke.push({ x: (each.clientX - rect.left) / rect.width, y: (each.clientY - rect.top) / rect.height });
    } else {
      stroke.push(pointFrom(event));
    }
    redraw();
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (drawingRef.current?.pointerId !== event.pointerId) return;
    drawingRef.current = null;
    setInked(strokesRef.current.some((stroke) => stroke.length > 0));
  }

  function clear() {
    strokesRef.current = [];
    drawingRef.current = null;
    setInked(false);
    redraw();
  }

  async function done() {
    const box = boxRef.current;
    if (!box || !inked) {
      setProblem('Please sign in the box first.');
      return;
    }
    if (!name.trim()) {
      setProblem('Please type your name under the signature.');
      return;
    }
    // A clean copy at a fixed scale: a transparent background, the ink only.
    const rect = box.getBoundingClientRect();
    const scale = Math.max(1, Math.min(3, 1200 / Math.max(rect.width, 1)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setProblem('This device could not save the signature. Use the paper sheet instead.');
      return;
    }
    context.scale(scale, scale);
    drawStrokes(context, strokesRef.current, rect.width, rect.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    // `toBlob` may quietly produce another type; the upload is named .png, so check.
    if (!blob || blob.type !== 'image/png') {
      setProblem('This device could not save the signature. Use the paper sheet instead.');
      return;
    }
    onDone(blob, name.trim());
  }

  const message = problem ?? error;

  return (
    <div className="pickup-sign fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Sign for your pickup">
      <div className="pickup-sign-inner mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-5 md:px-8 md:py-7">
        <div className="pickup-sign-head flex items-center gap-3 border-b-2 pb-3" style={{ borderColor: '#735c00' }}>
          <img src="/assets/images/branding/email-logo.png" alt="" className="pickup-sign-logo h-10 w-auto" />
          <span className="pickup-sign-brand text-lg" style={{ fontFamily: 'var(--font-headline)' }}>Naples Estate Jewelry</span>
          <span className="ml-auto text-right text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            Order {orderNumber}<br />{dateLabel}
          </span>
        </div>

        <h2 className="pickup-sign-title mt-4 text-2xl md:text-3xl" style={{ fontFamily: 'var(--font-headline)', fontWeight: 400 }}>Please sign for your pickup</h2>
        <p className="mt-1 text-base">Picked up by <strong>{pickedUpBy}</strong></p>
        <p className="pickup-sign-turn mt-2 rounded px-3 py-2 text-sm" style={{ background: '#fbf6e6', color: '#735c00' }}>
          Turn the phone sideways for a bigger signing box.
        </p>

        <ul className="pickup-sign-items mt-3 rounded-lg border" style={{ borderColor: '#eadfbd' }}>
          {items.map((item, index) => {
            const image = normalizeLegacyLocalImageUrl(item.image_snapshot);
            const detail = pickupItemDetail(item);
            return (
              <li key={`${item.inventory_number ?? ''}-${index}`} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: '#f0e8cf' }}>
                {image ? <img src={image} alt="" className="h-11 w-11 shrink-0 rounded border object-cover" style={{ borderColor: '#eadfbd' }} /> : null}
                <span className="text-[15px] leading-snug">
                  {item.title_snapshot}
                  {detail ? <span className="block text-xs" style={{ color: '#6b6352' }}>{detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>

        <div className={`pickup-sign-statement mt-3 text-[14.5px] leading-relaxed${readAll ? ' is-open' : ''}`} style={{ background: '#fbf5dd', borderLeft: '3px solid #d4af37', padding: '10px 14px' }}>
          {PICKUP_STATEMENT}
        </div>
        <button type="button" className="pickup-sign-readall mt-1 self-start text-sm font-semibold underline" style={{ color: '#735c00' }} onClick={() => setReadAll((open) => !open)}>
          {readAll ? 'Show less' : 'Read all'}
        </button>

        <div
          ref={boxRef}
          className="pickup-sign-pad relative mt-3 min-h-[170px] flex-1 rounded-xl border-2"
          style={{ borderColor: '#d5c697', background: '#fffefa', maxHeight: 320 }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block"
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Signature box — sign with your finger"
          />
          <span className="pointer-events-none absolute bottom-10 left-6 text-xl" style={{ color: '#8a8170' }}>✕</span>
          <span className="pointer-events-none absolute bottom-9 left-6 right-6 border-b" style={{ borderColor: '#8a8170' }} />
          <span className="pointer-events-none absolute bottom-2.5 left-0 right-0 text-center text-xs" style={{ color: '#8a8170' }}>
            Sign above the line with your finger
          </span>
          <button type="button" className="outline-button absolute right-3 top-3 text-xs" onClick={clear} disabled={busy}>Clear</button>
        </div>

        {message && <p role="alert" className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-error)' }}>{message}</p>}

        <div className="pickup-sign-bottom">
          <label className="pickup-sign-name mt-3 grid gap-1">
            <span className="form-label">Printed name</span>
            <input className="form-field" value={name} maxLength={120} autoComplete="off" onChange={(event) => setName(event.target.value)} style={{ fontSize: 16 }} />
          </label>

          <div className="pickup-sign-actions mt-4 flex items-center justify-between gap-3 pb-[env(safe-area-inset-bottom)]">
            <button type="button" className="outline-button" style={{ fontSize: '0.8rem', padding: '0.9rem 1.6rem' }} onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="button" className="gold-button" style={{ fontSize: '0.8rem', padding: '0.95rem 1.8rem' }} onClick={() => void done()} disabled={busy}>
              {busy ? 'Saving…' : <>Done<span className="hidden sm:inline">&nbsp;— I Picked It Up</span></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Draw the strokes (box-relative 0–1 units) as smooth ink at the box's CSS size. */
function drawStrokes(context: CanvasRenderingContext2D, strokes: Point[][], width: number, height: number) {
  context.clearRect(0, 0, width, height);
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2.2, Math.min(3.4, width / 220));
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    const points = stroke.map((point) => ({ x: point.x * width, y: point.y * height }));
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i += 1) {
      const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      context.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
    context.stroke();
  }
}
