import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createTracker,
  easyPostApiKey,
  retrieveTracker,
  type EasyPostTracker,
  type EasyPostTrackingDetail,
} from '@/lib/easypost';
import { buildDeliveryUpdateEmailContent, type DeliveryEmailKind } from '@/lib/order-fulfillment-email';
import {
  compactTrackingNumber,
  deliveredWhere,
  easyPostCarrier,
  FINAL_TRACKING_STATUSES,
  formatScanPlace,
  formatScanTime,
  sameTrackingNumber,
  scanInstant,
  type OrderTrackingRow,
} from '@/lib/shipment-tracking';

// Delivery tracking emails (owner, 2026-11-05, mockup 4): the server half.
//
//   Mark Shipped ──► registerOrderTracking ──► EasyPost tracker
//   EasyPost webhook ─┐
//   hourly pg_cron ───┴► applyTrackerUpdate ──► out-for-delivery / delivered email
//
// ⛔ The webhook is a nudge, not the record: every update re-reads the tracker
// from EasyPost with our own key before anything is written or sent, and the
// hourly sweep (`sweepOrderTracking`) catches anything a webhook missed —
// Netlify can freeze a function mid-flight (see after-is-best-effort).
// ⛔ Each email is CLAIMED with a conditional update before it is sent, so a
// webhook retry racing the sweep can never send it twice; a failed send
// releases the claim and the next pass retries.

const TABLE = 'order_tracking';
const SENDER = 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>';
const REPLY_TO = 'info@naplesestatejewelry.com';
/** Shown as "Automatic (…)" in the order's email history (emailInitiatorLabel). */
const AUTOMATIC_SENDER_LABEL = 'Automatic (delivery tracking)';

/** Orders shipped within this many days are registered / re-checked by the sweep. */
const SWEEP_WINDOW_DAYS = 30;
/** Don't send "out for delivery" for a scan older than this (a stale tracker). */
const OUT_FOR_DELIVERY_MAX_AGE_MS = 24 * 3600_000;
/** Don't send "delivered" for a delivery older than this (registered late). */
const DELIVERED_MAX_AGE_MS = 7 * 24 * 3600_000;

const ORDER_COLUMNS = 'id, order_number, customer_name, customer_email, fulfillment_status, shipping_method, shipping_carrier, tracking_number, deleted_at';

interface TrackedOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  fulfillment_status: string;
  shipping_method: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  deleted_at?: string | null;
}

export interface TrackingResult {
  ok: boolean;
  reason?: string;
  status?: string | null;
  emailsSent?: DeliveryEmailKind[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
}

function isValidEmail(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function isShippedWithTracking(order: TrackedOrder | null): order is TrackedOrder {
  return Boolean(
    order
      && !order.deleted_at
      && order.fulfillment_status === 'shipped'
      && order.shipping_method === 'shipping'
      && compactTrackingNumber(order.tracking_number),
  );
}

async function loadOrder(service: SupabaseClient, orderId: string): Promise<TrackedOrder | null> {
  const { data, error } = await service.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  if (error) throw new Error(`Could not load order ${orderId}: ${error.message}`);
  return (data as TrackedOrder | null) ?? null;
}

async function loadRow(service: SupabaseClient, orderId: string): Promise<OrderTrackingRow | null> {
  const { data, error } = await service.from(TABLE).select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw new Error(`Could not read ${TABLE}: ${error.message}`);
  return (data as OrderTrackingRow | null) ?? null;
}

/** Admin order page: this order's tracking row, or null (none yet, or the SQL has not run). */
export async function loadOrderTracking(client: SupabaseClient, orderId: string): Promise<OrderTrackingRow | null> {
  const { data, error } = await client.from(TABLE).select('*').eq('order_id', orderId).maybeSingle();
  if (error || !data) return null;
  return data as OrderTrackingRow;
}

/** Latest detail (by its own timestamp — EasyPost may deliver them out of order), optionally of one status. */
function latestDetail(details: EasyPostTrackingDetail[], status?: string): EasyPostTrackingDetail | null {
  let best: EasyPostTrackingDetail | null = null;
  let bestMs = -Infinity;
  details.forEach((detail, index) => {
    if (status && detail.status !== status) return;
    const ms = scanInstant(detail.datetime);
    // Unreadable stamps fall back to array order (later = newer).
    const key = Number.isNaN(ms) ? index - 1e15 : ms;
    if (key >= bestMs) {
      best = detail;
      bestMs = key;
    }
  });
  return best;
}

/**
 * Register (or refresh) the order's package with EasyPost. Called right after
 * the owner marks an order Shipped, from "Check tracking now", and by the
 * sweep for any shipped order that has no tracker yet. Never throws for an
 * EasyPost problem — the error is stored on the row and the sweep retries.
 */
export async function registerOrderTracking(service: SupabaseClient, orderId: string): Promise<TrackingResult> {
  if (!easyPostApiKey()) return { ok: false, reason: 'EasyPost is not connected (EASYPOST_API_KEY is not set).' };

  const order = await loadOrder(service, orderId);
  if (!isShippedWithTracking(order)) {
    return { ok: false, reason: 'The order is not marked Shipped with a tracking number.' };
  }

  let row = await loadRow(service, orderId);
  if (row && !sameTrackingNumber(row.tracking_number, order.tracking_number)) {
    // The owner changed the number: start over for the new package.
    const { error } = await service.from(TABLE).delete().eq('order_id', orderId);
    if (error) throw new Error(`Could not reset ${TABLE}: ${error.message}`);
    row = null;
  }

  if (row?.easypost_tracker_id) {
    try {
      const tracker = await retrieveTracker(row.easypost_tracker_id);
      return await applyTrackerUpdate(service, tracker);
    } catch (error) {
      await service.from(TABLE).update({ register_error: errorText(error), checked_at: new Date().toISOString() }).eq('order_id', orderId);
      return { ok: false, reason: errorText(error) };
    }
  }

  const now = new Date().toISOString();
  try {
    const tracker = await createTracker(compactTrackingNumber(order.tracking_number), easyPostCarrier(order.shipping_carrier));
    const { error } = await service.from(TABLE).upsert({
      order_id: orderId,
      tracking_number: order.tracking_number!.trim(),
      carrier: order.shipping_carrier?.trim() || null,
      easypost_tracker_id: tracker.id,
      register_error: null,
      updated_at: now,
    }, { onConflict: 'order_id' });
    if (error) throw new Error(`Could not save ${TABLE}: ${error.message}`);
    return await applyTrackerUpdate(service, tracker);
  } catch (error) {
    await service.from(TABLE).upsert({
      order_id: orderId,
      tracking_number: order.tracking_number!.trim(),
      carrier: order.shipping_carrier?.trim() || null,
      register_error: errorText(error),
      checked_at: now,
      updated_at: now,
    }, { onConflict: 'order_id' });
    return { ok: false, reason: errorText(error) };
  }
}

/**
 * Store what EasyPost knows about a package and send the email it calls for.
 * `tracker` must come from EasyPost with OUR key (retrieveTracker / createTracker),
 * never straight from a webhook body.
 */
export async function applyTrackerUpdate(service: SupabaseClient, tracker: EasyPostTracker): Promise<TrackingResult> {
  const { data: rowData, error: rowError } = await service
    .from(TABLE)
    .select('*')
    .eq('easypost_tracker_id', tracker.id)
    .maybeSingle();
  if (rowError) throw new Error(`Could not read ${TABLE}: ${rowError.message}`);
  const row = rowData as OrderTrackingRow | null;
  if (!row) return { ok: false, reason: 'No order uses this tracker.' };

  const details = Array.isArray(tracker.tracking_details) ? tracker.tracking_details : [];
  const latest = latestDetail(details);
  const outForDelivery = latestDetail(details, 'out_for_delivery');
  const delivered = latestDetail(details, 'delivered');
  const status = tracker.status ?? null;
  const now = new Date().toISOString();

  const { error: updateError } = await service.from(TABLE).update({
    status,
    status_detail: tracker.status_detail ?? null,
    public_url: tracker.public_url ?? null,
    last_event_message: latest?.message ?? null,
    last_event_at: latest?.datetime ?? null,
    last_event_city: latest?.tracking_location?.city ?? null,
    last_event_state: latest?.tracking_location?.state ?? null,
    last_event_zip: latest?.tracking_location?.zip ?? null,
    out_for_delivery_at: outForDelivery?.datetime ?? row.out_for_delivery_at,
    delivered_at: delivered?.datetime ?? row.delivered_at,
    delivered_message: delivered?.message ?? row.delivered_message,
    register_error: null,
    checked_at: now,
    updated_at: now,
  }).eq('order_id', row.order_id);
  if (updateError) throw new Error(`Could not update ${TABLE}: ${updateError.message}`);

  const order = await loadOrder(service, row.order_id);
  // Only while the order is still shipped with THIS number (the owner may have
  // un-marked it, edited the number, or moved it to the recycle bin).
  if (!isShippedWithTracking(order) || !sameTrackingNumber(order.tracking_number, row.tracking_number)) {
    return { ok: true, status, reason: 'Order no longer shipped with this number — no email.' };
  }
  if (!isValidEmail(order.customer_email)) return { ok: true, status, reason: 'No customer email on the order.' };

  const sent: DeliveryEmailKind[] = [];
  const nowMs = Date.now();
  const recent = (raw: string | null | undefined, maxAgeMs: number) => {
    const ms = scanInstant(raw);
    return Number.isNaN(ms) || nowMs - ms <= maxAgeMs;
  };

  if (status === 'out_for_delivery' && !row.out_for_delivery_email_at && recent(outForDelivery?.datetime, OUT_FOR_DELIVERY_MAX_AGE_MS)) {
    const scan = outForDelivery ?? latest;
    if (await sendDeliveryEmail(service, order, row, 'out_for_delivery', {
      when: formatScanTime(scan?.datetime),
      place: formatScanPlace(scan?.tracking_location?.city, scan?.tracking_location?.state, scan?.tracking_location?.zip),
      where: null,
    })) sent.push('out_for_delivery');
  }

  if (status === 'delivered' && !row.delivered_email_at && recent(delivered?.datetime, DELIVERED_MAX_AGE_MS)) {
    const scan = delivered ?? latest;
    if (await sendDeliveryEmail(service, order, row, 'delivered', {
      when: formatScanTime(scan?.datetime),
      place: null,
      where: deliveredWhere(scan?.message),
    })) sent.push('delivered');
  }

  return { ok: true, status, emailsSent: sent };
}

async function sendDeliveryEmail(
  service: SupabaseClient,
  order: TrackedOrder,
  row: OrderTrackingRow,
  kind: DeliveryEmailKind,
  scan: Parameters<typeof buildDeliveryUpdateEmailContent>[2],
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[tracking] RESEND_API_KEY is not set — delivery email not sent.');
    return false;
  }
  const column = kind === 'out_for_delivery' ? 'out_for_delivery_email_at' : 'delivered_email_at';

  // Claim first: only the caller whose update flips NULL → now() sends.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await service
    .from(TABLE)
    .update({ [column]: claimedAt })
    .eq('order_id', row.order_id)
    .is(column, null)
    .select('order_id');
  if (claimError) throw new Error(`Could not claim the ${kind} email: ${claimError.message}`);
  if (!claimed || claimed.length === 0) return false;

  const recipient = order.customer_email!.trim();
  const content = buildDeliveryUpdateEmailContent(order, kind, scan);
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const result = await resend.emails.send(
      {
        from: SENDER,
        replyTo: REPLY_TO,
        to: recipient,
        subject: content.subject,
        html: content.html,
        text: content.text,
      },
      { idempotencyKey: `order-${order.id}-${kind}-${row.easypost_tracker_id ?? compactTrackingNumber(row.tracking_number)}` },
    );
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'Resend did not return an accepted email ID.');
    }
  } catch (error) {
    console.error(`[tracking] ${kind} email failed for ${order.order_number}:`, errorText(error));
    // Release the claim so the next webhook or sweep retries.
    await service.from(TABLE).update({ [column]: null }).eq('order_id', row.order_id).eq(column, claimedAt);
    return false;
  }

  const { error: logError } = await service.from('order_emails').insert({
    order_id: order.id,
    email_type: 'fulfillment_update',
    recipient,
    subject: content.subject,
    status: kind,
    sent_by: null,
    sent_by_email: AUTOMATIC_SENDER_LABEL,
  });
  if (logError) console.error('[tracking] order_emails insert failed:', logError.message);
  return true;
}

export interface TrackingSweepResult {
  ok: boolean;
  skipped?: string;
  registered: number;
  refreshed: number;
  emailsSent: number;
  errors: string[];
}

/**
 * Hourly safety net (pg_cron `nej-order-tracking-sweep`):
 * 1. every shipped order from the last 30 days with a tracking number but no
 *    working tracker gets registered;
 * 2. every tracker still on its way — or delivered with the email not yet
 *    sent — is re-read from EasyPost and applied.
 */
export async function sweepOrderTracking(service: SupabaseClient): Promise<TrackingSweepResult> {
  const result: TrackingSweepResult = { ok: true, registered: 0, refreshed: 0, emailsSent: 0, errors: [] };
  if (!easyPostApiKey()) return { ...result, skipped: 'EASYPOST_API_KEY is not set.' };

  const since = new Date(Date.now() - SWEEP_WINDOW_DAYS * 24 * 3600_000).toISOString();

  const { data: orders, error: ordersError } = await service
    .from('orders')
    .select('id, tracking_number')
    .eq('fulfillment_status', 'shipped')
    .eq('shipping_method', 'shipping')
    .not('tracking_number', 'is', null)
    .is('deleted_at', null)
    .gte('updated_at', since)
    .limit(100);
  if (ordersError) throw new Error(`Could not list shipped orders: ${ordersError.message}`);

  const shipped = ((orders ?? []) as Array<{ id: string; tracking_number: string | null }>)
    .filter((order) => compactTrackingNumber(order.tracking_number));
  const rowsById = new Map<string, OrderTrackingRow>();
  if (shipped.length > 0) {
    const { data: rows, error: rowsError } = await service
      .from(TABLE)
      .select('*')
      .in('order_id', shipped.map((order) => order.id));
    if (rowsError) throw new Error(`Could not read ${TABLE}: ${rowsError.message}`);
    for (const row of (rows ?? []) as OrderTrackingRow[]) rowsById.set(row.order_id, row);
  }

  const handled = new Set<string>();
  for (const order of shipped.slice(0, 25)) {
    const row = rowsById.get(order.id);
    if (row?.easypost_tracker_id && sameTrackingNumber(row.tracking_number, order.tracking_number)) continue;
    handled.add(order.id);
    try {
      const outcome = await registerOrderTracking(service, order.id);
      if (outcome.ok) result.registered += 1;
      else if (outcome.reason) result.errors.push(`${order.id}: ${outcome.reason}`);
      result.emailsSent += outcome.emailsSent?.length ?? 0;
    } catch (error) {
      result.errors.push(`${order.id}: ${errorText(error)}`);
    }
  }

  const { data: active, error: activeError } = await service
    .from(TABLE)
    .select('*')
    .not('easypost_tracker_id', 'is', null)
    .gte('created_at', since)
    .order('checked_at', { ascending: true, nullsFirst: true })
    .limit(60);
  if (activeError) throw new Error(`Could not list ${TABLE}: ${activeError.message}`);

  const nowMs = Date.now();
  const due = ((active ?? []) as OrderTrackingRow[]).filter((row) => !handled.has(row.order_id) && (
    !FINAL_TRACKING_STATUSES.has(String(row.status ?? ''))
    // Delivered but the email has not gone (a failed send) — retry while it is still news.
    || (row.status === 'delivered' && !row.delivered_email_at && nowMs - scanInstant(row.delivered_at) <= DELIVERED_MAX_AGE_MS)
  ));

  for (const row of due.slice(0, 40)) {
    try {
      const tracker = await retrieveTracker(row.easypost_tracker_id!);
      const outcome = await applyTrackerUpdate(service, tracker);
      result.refreshed += 1;
      result.emailsSent += outcome.emailsSent?.length ?? 0;
    } catch (error) {
      result.errors.push(`${row.order_id}: ${errorText(error)}`);
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}
