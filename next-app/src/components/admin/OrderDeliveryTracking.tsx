'use client';

import { useState } from 'react';
import {
  deliveredWhere,
  formatScanPlace,
  formatScanTime,
  trackingStatusLabel,
  type OrderTrackingRow,
} from '@/lib/shipment-tracking';

const BORDER = 'var(--color-outline-variant)';

/**
 * The order page's delivery line (owner, 2026-11-05): where the package is,
 * the last carrier scan, and which automatic emails have gone. "Check
 * tracking now" re-registers / re-reads the package on demand; otherwise the
 * EasyPost webhook and the hourly sweep keep it current.
 */
export default function OrderDeliveryTracking({
  orderId,
  tracking,
  enabled,
  onChange,
}: {
  orderId: string;
  tracking: OrderTrackingRow | null;
  enabled: boolean;
  onChange: (row: OrderTrackingRow | null) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const muted = { color: 'var(--color-on-surface-variant)' };

  const checkNow = async () => {
    setChecking(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/tracking`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (data?.tracking !== undefined) onChange(data.tracking ?? null);
      setNote(data?.ok
        ? { text: 'Checked with the carrier just now.', ok: true }
        : { text: data?.reason || 'Could not check tracking. The hourly check will try again.', ok: false });
    } catch {
      setNote({ text: 'Could not reach the site. The hourly check will try again.', ok: false });
    } finally {
      setChecking(false);
    }
  };

  if (!enabled) {
    return (
      <p className="mt-4 border-t pt-4 text-xs" style={{ ...muted, borderColor: BORDER }}>
        Delivery emails are off &mdash; EasyPost is not connected (Admin &rarr; Settings &rarr; Delivery Tracking).
      </p>
    );
  }

  const scanTime = formatScanTime(tracking?.last_event_at);
  const place = formatScanPlace(tracking?.last_event_city, tracking?.last_event_state, tracking?.last_event_zip);
  const deliveredTime = formatScanTime(tracking?.delivered_at);
  const where = deliveredWhere(tracking?.delivered_message);
  const isDelivered = tracking?.status === 'delivered';

  return (
    <div className="mt-4 border-t pt-4 text-sm" style={{ borderColor: BORDER }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="form-label">Delivery</span>
          {!tracking ? (
            <p className="mt-1" style={muted}>Not registered with the carrier yet &mdash; the hourly check will do it.</p>
          ) : !tracking.easypost_tracker_id ? (
            <p className="mt-1" style={{ color: 'var(--color-error)' }}>
              Could not register this tracking number{tracking.register_error ? `: ${tracking.register_error}` : '.'} The hourly check retries.
            </p>
          ) : (
            <>
              <p className="mt-1 font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                {trackingStatusLabel(tracking.status)}
                {isDelivered && deliveredTime ? ` · ${deliveredTime.date} · ${deliveredTime.time}` : ''}
                {isDelivered && where ? ` — ${where}` : ''}
              </p>
              {!isDelivered && tracking.last_event_message && (
                <p className="mt-0.5 text-xs" style={muted}>
                  Last scan: {tracking.last_event_message}
                  {place ? ` · ${place}` : ''}
                  {scanTime ? ` · ${scanTime.date} · ${scanTime.time}` : ''}
                </p>
              )}
              <p className="mt-0.5 text-xs" style={muted}>
                Out-for-delivery email: {tracking.out_for_delivery_email_at ? 'sent' : 'not yet'} &middot; Delivered email:{' '}
                {tracking.delivered_email_at ? 'sent' : 'not yet'}
              </p>
            </>
          )}
        </div>
        <button type="button" className="outline-button text-xs" onClick={() => void checkNow()} disabled={checking}>
          {checking ? 'Checking…' : 'Check tracking now'}
        </button>
      </div>
      {note && (
        <p className="mt-2 text-xs" role="status" style={{ color: note.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
          {note.text}
        </p>
      )}
    </div>
  );
}
