'use client';

import { useState } from 'react';
import {
  deliveredWhere,
  formatExpectedDate,
  formatScanPlace,
  formatScanTime,
  trackingStatusLabel,
  type OrderTrackingRow,
} from '@/lib/shipment-tracking';
import { DEFAULT_DELIVERY_EMAIL_SETTING, type DeliveryEmailSetting } from '@/lib/order-delivery-emails';

const BORDER = 'var(--color-outline-variant)';

/**
 * The order page's delivery line (owner, 2026-11-05): where the package is,
 * the last carrier scan, and which automatic emails have gone. "Check
 * tracking now" re-registers / re-reads the package on demand; otherwise the
 * EasyPost webhook and the hourly sweep keep it current.
 *
 * 2026-11-24: "Shipping updates on / off" + Turn off / Turn on — this order's
 * automatic carrier emails (lib/order-delivery-emails.ts). Off = the package
 * is still tracked here; only the customer emails stop.
 */
/** "sent" / "not yet", or "off" for one not sent while this order's updates are off. */
function emailState(sentAt: string | null | undefined, on: boolean): string {
  if (sentAt) return 'sent';
  return on ? 'not yet' : 'off';
}

export default function OrderDeliveryTracking({
  orderId,
  tracking,
  enabled,
  onChange,
  emails = DEFAULT_DELIVERY_EMAIL_SETTING,
  onEmailsChange,
}: {
  orderId: string;
  tracking: OrderTrackingRow | null;
  enabled: boolean;
  onChange: (row: OrderTrackingRow | null) => void;
  /** This order's "Send customer shipping updates" setting. */
  emails?: DeliveryEmailSetting;
  /** Save it; resolves to an error to show, or null when saved. */
  onEmailsChange?: (on: boolean) => Promise<string | null>;
}) {
  const [checking, setChecking] = useState(false);
  const [emailsSaving, setEmailsSaving] = useState(false);
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

  const toggleEmails = async () => {
    if (!onEmailsChange || emailsSaving) return;
    setEmailsSaving(true);
    setNote(null);
    const turningOn = !emails.on;
    const error = await onEmailsChange(turningOn);
    setEmailsSaving(false);
    setNote(error
      ? { text: error, ok: false }
      : {
        text: turningOn
          ? 'Shipping updates on. The customer gets the next carrier update; skipped ones are not sent late.'
          : 'Shipping updates off. The customer gets no automatic delivery emails for this order.',
        ok: true,
      });
  };

  const scanTime = formatScanTime(tracking?.last_event_at);
  const place = formatScanPlace(tracking?.last_event_city, tracking?.last_event_state, tracking?.last_event_zip);
  const deliveredTime = formatScanTime(tracking?.delivered_at);
  const where = deliveredWhere(tracking?.delivered_message);
  const isDelivered = tracking?.status === 'delivered';
  // 2026-11-19: undefined until supabase/order-tracking-expected-date-2026-11.sql runs.
  const hasExpectedColumns = Boolean(tracking && 'expected_email_at' in tracking);
  const expected = isDelivered ? null : formatExpectedDate(tracking?.est_delivery_date);

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
                {expected ? ` · expected ${expected.short}` : ''}
              </p>
              {!isDelivered && tracking.last_event_message && (
                <p className="mt-0.5 text-xs" style={muted}>
                  Last scan: {tracking.last_event_message}
                  {place ? ` · ${place}` : ''}
                  {scanTime ? ` · ${scanTime.date} · ${scanTime.time}` : ''}
                </p>
              )}
              <p className="mt-0.5 text-xs" style={muted}>
                {!emails.on && !tracking.expected_email_at && !tracking.out_for_delivery_email_at && !tracking.delivered_email_at ? (
                  <>Automatic emails: none. Shipping updates are off for this order.</>
                ) : (
                  <>
                    {hasExpectedColumns && <>Expected-date email: {emailState(tracking.expected_email_at, emails.on)} &middot; </>}
                    Out-for-delivery email: {emailState(tracking.out_for_delivery_email_at, emails.on)} &middot; Delivered email:{' '}
                    {emailState(tracking.delivered_email_at, emails.on)}
                  </>
                )}
              </p>
            </>
          )}
        </div>
        <button type="button" className="outline-button text-xs" onClick={() => void checkNow()} disabled={checking}>
          {checking ? 'Checking…' : 'Check tracking now'}
        </button>
      </div>
      {emails.ready && onEmailsChange && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
            style={emails.on
              ? { background: '#e3efe0', color: '#2e6b2a' }
              : { background: '#fbe3e3', color: 'var(--color-error)' }}
          >
            {emails.on ? 'Shipping updates on' : 'Shipping updates off'}
          </span>
          <button type="button" className="outline-button text-xs" onClick={() => void toggleEmails()} disabled={emailsSaving}>
            {emailsSaving ? 'Saving…' : emails.on ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}
      {note && (
        <p className="mt-2 text-xs" role="status" style={{ color: note.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
          {note.text}
        </p>
      )}
    </div>
  );
}
