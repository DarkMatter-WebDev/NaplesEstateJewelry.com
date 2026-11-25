// "Send customer shipping updates" — one setting per order (owner, 2026-11-24,
// mockup 1): whether the AUTOMATIC carrier emails (expected delivery date,
// out for delivery, delivered) go to the customer. Separate from "Update
// customer via email", which only opens the hand-sent Shipped email.
//
// Columns `orders.delivery_emails` + `orders.delivery_emails_on_at`
// (supabase/order-delivery-emails-2026-11.sql). Read/written ONLY through
// `order-delivery-emails-server.ts`, on their own query — never in a shared
// select (a missing column would blank the order page).
//
// Turned back ON later = only scans at or after that moment send (owner pick
// 3: no catching up on skipped emails). Never turned off = exactly as before.

import { scanInstant } from '@/lib/shipment-tracking';

export interface DeliveryEmailSetting {
  /** Automatic shipping update emails on for this order. */
  on: boolean;
  /** When they were last turned back on (ISO); null = never turned off. */
  onSince: string | null;
  /** Has the SQL run? Before it, every order reads as on and nothing can be saved. */
  ready: boolean;
}

/** Before the SQL, or on any read problem: on, as the site always behaved. */
export const DEFAULT_DELIVERY_EMAIL_SETTING: DeliveryEmailSetting = { on: true, onSince: null, ready: false };

export function readDeliveryEmailSetting(row: unknown): DeliveryEmailSetting {
  const value = row as { delivery_emails?: unknown; delivery_emails_on_at?: unknown } | null;
  if (!value || typeof value !== 'object') return DEFAULT_DELIVERY_EMAIL_SETTING;
  const onSince = typeof value.delivery_emails_on_at === 'string' && value.delivery_emails_on_at ? value.delivery_emails_on_at : null;
  return { on: value.delivery_emails !== false, onSince, ready: true };
}

/**
 * The columns to write when the owner sets it. Only an off → on change stamps
 * `delivery_emails_on_at` (the "no catching up" moment); on → on and any → off
 * leave it as it was. `null` = nothing to write.
 */
export function deliveryEmailUpdate(
  current: DeliveryEmailSetting,
  on: boolean,
  nowIso: string,
): { delivery_emails: boolean; delivery_emails_on_at?: string } | null {
  if (current.on === on) return null;
  return on ? { delivery_emails: true, delivery_emails_on_at: nowIso } : { delivery_emails: false };
}

/**
 * May this carrier scan send its automatic email? Off → never. Never turned
 * off → always (the scan-age rules in order-tracking-server still apply).
 * Turned back on → only a scan at or after that moment; an unreadable scan
 * time does not send (it cannot be shown to be new).
 */
export function scanAllowsDeliveryEmail(setting: DeliveryEmailSetting, scanDatetime: string | null | undefined): boolean {
  if (!setting.on) return false;
  if (!setting.onSince) return true;
  const scanMs = scanInstant(scanDatetime);
  const sinceMs = Date.parse(setting.onSince);
  if (Number.isNaN(scanMs) || Number.isNaN(sinceMs)) return false;
  return scanMs >= sinceMs;
}
