import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { addressOneLine, BUSINESS_NAME } from '@/lib/business-location';
import { logOrderEmail } from '@/lib/email-copies';
import {
  buyerReadiness,
  computeSendAt,
  delayFor,
  FOLLOW_UP_DISCOVERY_DAYS,
  FOLLOW_UP_ORDER_LOOKBACK_DAYS,
  FOLLOW_UP_STEP2_DAYS,
  FOLLOW_UP_STEP2_LOOKAHEAD_DAYS,
  formatFollowUpTime,
  itemPhrase,
  nextSlotAtOrAfter,
  renderFollowUp,
  settingsFromRow,
  step2SendAt,
  stepEnabled,
  templateFor,
  thankedRecently,
  type BuyerOrderState,
  type FollowUpAudience,
  type FollowUpLanguage,
  type FollowUpSettings,
  type FollowUpStatus,
  type FollowUpStep,
  type FollowUpTemplate,
  type RenderedFollowUp,
} from '@/lib/follow-ups';
import { getMarketingSettings, isValidEmail, normalizeEmail } from '@/lib/marketing';
import { BUSINESS_PHONE, getSiteUrl } from '@/lib/order-email-branding';
import { loadLatestOrderLanguageByEmail, loadOrderLanguage } from '@/lib/order-language-server';

/**
 * Admin → Follow-ups, the database + sending half (the pure rules are in
 * `lib/follow-ups.ts`).
 *
 * How it runs: `reconcileFollowUps` finds new buy receipts / paid orders and
 * queues their thank-you, moves buyer rows from "waiting" to "scheduled" once
 * picked up / delivered, cancels rows whose receipt was voided or order
 * cancelled, and queues step 2 when it is on. `sendDueFollowUps` sends what is
 * due. Both run every 15 minutes from pg_cron (`nej-follow-ups-sweep`), and the
 * reconcile also runs when the admin page opens so a receipt saved a minute
 * ago is already in Upcoming. ⛔ Never rely on `after()` here — a sweep is the
 * only thing that is sure to run on Netlify.
 *
 * Sending claims the row first (scheduled → sending) so two sweeps can never
 * send the same email twice.
 */

const MESSAGES = 'follow_up_messages';
const SETTINGS = 'follow_up_settings';
const STOPS = 'follow_up_stops';
const DAY_MS = 24 * 3600_000;
export const FOLLOW_UP_AUTOMATIC_LABEL = 'Automatic (follow-up)';
/** Netlify's synchronous limit is 26 s; stop sending well before it. */
const SEND_BUDGET_MS = 18_000;
const SEND_BATCH = 10;

export type FollowUpMessageRow = {
  id: string;
  email: string;
  name: string | null;
  audience: FollowUpAudience;
  step: FollowUpStep;
  source_type: 'buy_receipt' | 'order';
  source_id: string;
  source_ref: string | null;
  source_note: string | null;
  language: FollowUpLanguage;
  status: FollowUpStatus;
  wait_reason: 'pickup' | 'shipping' | 'delivery' | null;
  waiting_since: string | null;
  event_at: string | null;
  send_at: string | null;
  reason: string | null;
  subject: string | null;
  resend_id: string | null;
  sent_at: string | null;
  sent_by_email: string | null;
  click_token: string;
  review_clicked_at: string | null;
  created_at: string;
  updated_at: string;
};

export const MESSAGE_COLUMNS =
  'id, email, name, audience, step, source_type, source_id, source_ref, source_note, language, status, wait_reason, waiting_since, event_at, send_at, reason, subject, resend_id, sent_at, sent_by_email, click_token, review_clicked_at, created_at, updated_at';

/** The tables are not there yet → the SQL file has not been run. */
export function isFollowUpsNotReady(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /follow_up_/.test(error.message ?? '');
}

export async function loadFollowUpSettings(client: SupabaseClient): Promise<{ ready: boolean; settings: FollowUpSettings }> {
  const { data, error } = await client.from(SETTINGS).select('*').eq('id', true).maybeSingle();
  if (error) {
    if (isFollowUpsNotReady(error)) return { ready: false, settings: settingsFromRow(null) };
    throw new Error(`Could not read the follow-up settings: ${error.message}`);
  }
  return { ready: true, settings: settingsFromRow(data as Record<string, unknown> | null) };
}

function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(amount) ? amount : 0);
}

/** An email for `ilike` that matches only itself, any case (`_` and `%` are wildcards there). */
function likeExact(email: string): string {
  return email.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function chunk<T>(list: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function selectIn<T>(client: SupabaseClient, table: string, columns: string, column: string, values: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk([...new Set(values)])) {
    if (part.length === 0) continue;
    const { data, error } = await client.from(table).select(columns).in(column, part);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

// ---- Opt-outs ---------------------------------------------------------------

export type OptOut = { kind: 'unsubscribed' | 'stopped'; at: string | null };

/** Unsubscribed anywhere (newsletter, account, buyers list, follow-ups) or stopped by the owner. */
export async function optOutFor(client: SupabaseClient, email: string): Promise<OptOut | null> {
  const normalized = normalizeEmail(email);
  const [stop, subscriber, profile, buyer] = await Promise.all([
    client.from(STOPS).select('reason, stopped_at').eq('email', normalized).maybeSingle(),
    client.from('homepage_subscribers').select('subscribed, unsubscribed_at').eq('email', normalized).maybeSingle(),
    client.from('profiles').select('marketing_opt_out').eq('email', normalized).limit(1).maybeSingle(),
    client.from('buyers').select('marketing_opt_out').eq('email', normalized).maybeSingle(),
  ]);
  if (stop.data) {
    return { kind: stop.data.reason === 'admin' ? 'stopped' : 'unsubscribed', at: (stop.data.stopped_at as string) ?? null };
  }
  if (subscriber.data && subscriber.data.subscribed === false && subscriber.data.unsubscribed_at) {
    return { kind: 'unsubscribed', at: subscriber.data.unsubscribed_at as string };
  }
  if (profile.data?.marketing_opt_out === true) return { kind: 'unsubscribed', at: null };
  if (buyer.data?.marketing_opt_out === true) return { kind: 'unsubscribed', at: null };
  return null;
}

/** Every opted-out / stopped email, for the People list. */
async function loadOptOutMap(client: SupabaseClient): Promise<Map<string, OptOut>> {
  const map = new Map<string, OptOut>();
  const [stops, subscribers, profiles, buyers] = await Promise.all([
    client.from(STOPS).select('email, reason, stopped_at'),
    client.from('homepage_subscribers').select('email, unsubscribed_at').eq('subscribed', false).not('unsubscribed_at', 'is', null),
    client.from('profiles').select('email').eq('marketing_opt_out', true),
    client.from('buyers').select('email').eq('marketing_opt_out', true),
  ]);
  for (const row of (buyers.data ?? []) as Array<{ email: string | null }>) {
    if (row.email) map.set(normalizeEmail(row.email), { kind: 'unsubscribed', at: null });
  }
  for (const row of (profiles.data ?? []) as Array<{ email: string | null }>) {
    if (row.email) map.set(normalizeEmail(row.email), { kind: 'unsubscribed', at: null });
  }
  for (const row of (subscribers.data ?? []) as Array<{ email: string | null; unsubscribed_at: string | null }>) {
    if (row.email) map.set(normalizeEmail(row.email), { kind: 'unsubscribed', at: row.unsubscribed_at });
  }
  for (const row of (stops.data ?? []) as Array<{ email: string; reason: string; stopped_at: string }>) {
    map.set(normalizeEmail(row.email), { kind: row.reason === 'admin' ? 'stopped' : 'unsubscribed', at: row.stopped_at });
  }
  return map;
}

// ---- Sources ----------------------------------------------------------------

type ReceiptSource = {
  id: string;
  receipt_number: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_language: string | null;
  total: number | null;
  status: string;
  created_at: string;
};

type OrderSource = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  payment_status: string | null;
  order_status: string | null;
  fulfillment_status: string | null;
  shipping_method: string | null;
  deleted_at: string | null;
  created_at: string;
};

const RECEIPT_COLUMNS = 'id, receipt_number, seller_name, seller_email, seller_language, total, status, created_at';
const ORDER_COLUMNS = 'id, order_number, customer_name, customer_email, payment_status, order_status, fulfillment_status, shipping_method, deleted_at, created_at';

async function loadOrderStates(client: SupabaseClient, orders: OrderSource[]): Promise<Map<string, BuyerOrderState>> {
  const ids = orders.map((order) => order.id);
  const [pickups, tracking] = await Promise.all([
    selectIn<{ order_id: string; picked_up_at: string | null }>(client, 'order_pickups', 'order_id, picked_up_at', 'order_id', ids).catch(() => []),
    selectIn<{ order_id: string; created_at: string | null; delivered_at: string | null }>(client, 'order_tracking', 'order_id, created_at, delivered_at', 'order_id', ids).catch(() => []),
  ]);
  const pickupBy = new Map<string, string | null>();
  for (const row of pickups) {
    const known = pickupBy.get(row.order_id);
    if (!known || (row.picked_up_at && row.picked_up_at > known)) pickupBy.set(row.order_id, row.picked_up_at);
  }
  const trackingBy = new Map(tracking.map((row) => [row.order_id, row]));
  return new Map(
    orders.map((order) => [
      order.id,
      {
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        fulfillmentStatus: order.fulfillment_status,
        shippingMethod: order.shipping_method,
        deletedAt: order.deleted_at,
        createdAt: order.created_at,
        pickedUpAt: pickupBy.get(order.id) ?? null,
        trackingCreatedAt: trackingBy.get(order.id)?.created_at ?? null,
        deliveredAt: trackingBy.get(order.id)?.delivered_at ?? null,
      } satisfies BuyerOrderState,
    ]),
  );
}

async function orderItemTitles(client: SupabaseClient, orderIds: string[]): Promise<Map<string, string[]>> {
  const rows = await selectIn<{ order_id: string; title_snapshot: string | null }>(client, 'order_items', 'order_id, title_snapshot', 'order_id', orderIds).catch(() => []);
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    if (row.title_snapshot) list.push(row.title_snapshot);
    map.set(row.order_id, list);
  }
  return map;
}

/** Step-1 rows already queued / sent for these addresses (for the 90-day rule at queue time). */
async function stepOneByEmail(client: SupabaseClient, emails: string[]): Promise<Map<string, Array<{ id: string; status: string; sent_at: string | null; source_ref: string | null }>>> {
  const map = new Map<string, Array<{ id: string; status: string; sent_at: string | null; source_ref: string | null }>>();
  if (emails.length === 0) return map;
  const rows = await selectIn<{ id: string; email: string; status: string; sent_at: string | null; source_ref: string | null; step: number }>(
    client,
    MESSAGES,
    'id, email, status, sent_at, source_ref, step',
    'email',
    emails,
  );
  for (const row of rows) {
    if (row.step !== 1) continue;
    const list = map.get(row.email) ?? [];
    list.push(row);
    map.set(row.email, list);
  }
  return map;
}

type NewRow = {
  email: string;
  name: string | null;
  audience: FollowUpAudience;
  step: FollowUpStep;
  source_type: 'buy_receipt' | 'order';
  source_id: string;
  source_ref: string | null;
  source_note: string | null;
  language: FollowUpLanguage;
  status: FollowUpStatus;
  wait_reason?: string | null;
  waiting_since?: string | null;
  event_at?: string | null;
  send_at?: string | null;
  reason?: string | null;
};

/** Queue-time duplicate check: thanked in the last 90 days, or another thank-you already waiting. */
function duplicateReason(
  existing: Array<{ status: string; sent_at: string | null; source_ref: string | null }> | undefined,
  at: Date,
): string | null {
  if (!existing || existing.length === 0) return null;
  const recent = thankedRecently(existing.filter((row) => row.status === 'sent').map((row) => row.sent_at), at);
  if (recent) return `Thanked ${formatFollowUpTime(recent)} — one thank-you every 90 days.`;
  const pending = existing.find((row) => row.status === 'scheduled' || row.status === 'waiting' || row.status === 'sending');
  if (pending) return `A thank-you is already queued for ${pending.source_ref ?? 'another visit'}.`;
  return null;
}

async function insertRows(client: SupabaseClient, rows: NewRow[]): Promise<number> {
  let created = 0;
  for (const part of chunk(rows, 50)) {
    if (part.length === 0) continue;
    // ignoreDuplicates: a second sweep racing this one never creates a second row.
    const { data, error } = await client
      .from(MESSAGES)
      .upsert(part, { onConflict: 'source_type,source_id,step', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`Could not queue follow-ups: ${error.message}`);
    created += data?.length ?? 0;
  }
  return created;
}

export type ReconcileResult = { created: number; readied: number; cancelled: number; step2: number };

export async function reconcileFollowUps(client: SupabaseClient, settings: FollowUpSettings, now = new Date()): Promise<ReconcileResult> {
  const result: ReconcileResult = { created: 0, readied: 0, cancelled: 0, step2: 0 };
  const nowIso = now.toISOString();
  const discoverySince = new Date(now.getTime() - FOLLOW_UP_DISCOVERY_DAYS * DAY_MS);
  const optOuts = await loadOptOutMap(client);
  const newRows: NewRow[] = [];

  // 1. Sellers — every recorded buy receipt (Trade-ins too) with an email.
  if (stepEnabled(settings, 'seller', 1)) {
    const { data, error } = await client
      .from('buy_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('status', 'recorded')
      .not('seller_email', 'is', null)
      .gte('created_at', discoverySince.toISOString())
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Could not read buy receipts: ${error.message}`);
    const receipts = ((data ?? []) as ReceiptSource[]).filter((receipt) => isValidEmail(normalizeEmail(receipt.seller_email)));
    const known = new Set(
      (await selectIn<{ source_id: string }>(client, MESSAGES, 'source_id', 'source_id', receipts.map((r) => r.id))).map((row) => row.source_id),
    );
    const fresh = receipts.filter((receipt) => !known.has(receipt.id));
    const byEmail = await stepOneByEmail(client, fresh.map((receipt) => normalizeEmail(receipt.seller_email)));
    for (const receipt of fresh) {
      const email = normalizeEmail(receipt.seller_email);
      const eventAt = new Date(receipt.created_at);
      const optOut = optOuts.get(email);
      const duplicate = duplicateReason(byEmail.get(email), now);
      const sendAt = computeSendAt(eventAt, delayFor(settings, 'seller'), now);
      const row: NewRow = {
        email,
        name: receipt.seller_name,
        audience: 'seller',
        step: 1,
        source_type: 'buy_receipt',
        source_id: receipt.id,
        source_ref: receipt.receipt_number,
        source_note: `${money(receipt.total)} paid`,
        language: receipt.seller_language === 'es' ? 'es' : 'en',
        status: optOut || duplicate ? 'not_sent' : 'scheduled',
        event_at: eventAt.toISOString(),
        send_at: optOut || duplicate ? null : sendAt.toISOString(),
        reason: optOut ? (optOut.kind === 'stopped' ? 'Follow-ups stopped for this person.' : 'Unsubscribed.') : duplicate,
      };
      newRows.push(row);
      // The next receipt for the same person in this same run sees this one.
      const list = byEmail.get(email) ?? [];
      list.push({ id: 'new', status: row.status, sent_at: null, source_ref: row.source_ref });
      byEmail.set(email, list);
    }
  }

  // 2. Shop buyers — every paid order with an email (website, In-store, Remote, Trade-in).
  if (stepEnabled(settings, 'buyer', 1)) {
    const lookback = new Date(now.getTime() - FOLLOW_UP_ORDER_LOOKBACK_DAYS * DAY_MS);
    const { data, error } = await client
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('payment_status', 'paid')
      .not('customer_email', 'is', null)
      .is('deleted_at', null)
      .gte('created_at', lookback.toISOString())
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Could not read orders: ${error.message}`);
    const orders = ((data ?? []) as OrderSource[]).filter((order) => isValidEmail(normalizeEmail(order.customer_email)));
    const known = new Set(
      (await selectIn<{ source_id: string }>(client, MESSAGES, 'source_id', 'source_id', orders.map((o) => o.id))).map((row) => row.source_id),
    );
    const fresh = orders.filter((order) => !known.has(order.id));
    const states = await loadOrderStates(client, fresh);
    const titles = await orderItemTitles(client, fresh.map((order) => order.id));
    // Read the existing step-1 rows BEFORE the sellers above are written, plus
    // what this run queued for sellers — a Trade-in gets ONE thank-you.
    const byEmail = await stepOneByEmail(client, fresh.map((order) => normalizeEmail(order.customer_email)));
    for (const row of newRows) {
      const list = byEmail.get(row.email) ?? [];
      list.push({ id: 'new', status: row.status, sent_at: null, source_ref: row.source_ref });
      byEmail.set(row.email, list);
    }
    for (const order of fresh) {
      const state = states.get(order.id);
      if (!state) continue;
      const readiness = buyerReadiness(state, now, { firstLook: true, waitingSince: null });
      if (readiness.kind === 'cancelled') continue;
      if (readiness.kind === 'ready' && readiness.eventAt.getTime() < discoverySince.getTime()) continue;
      const email = normalizeEmail(order.customer_email);
      const language = await loadOrderLanguage(client, order.id).catch(() => 'en' as const);
      const optOut = optOuts.get(email);
      const duplicate = duplicateReason(byEmail.get(email), now);
      const blocked = optOut ? (optOut.kind === 'stopped' ? 'Follow-ups stopped for this person.' : 'Unsubscribed.') : duplicate;
      const row: NewRow = {
        email,
        name: order.customer_name,
        audience: 'buyer',
        step: 1,
        source_type: 'order',
        source_id: order.id,
        source_ref: order.order_number,
        source_note: itemPhrase(titles.get(order.id) ?? [], language),
        language,
        status: blocked ? 'not_sent' : readiness.kind === 'ready' ? 'scheduled' : 'waiting',
        reason: blocked,
      };
      if (!blocked && readiness.kind === 'ready') {
        row.event_at = readiness.eventAt.toISOString();
        row.send_at = computeSendAt(readiness.eventAt, delayFor(settings, 'buyer'), now).toISOString();
      } else if (!blocked && readiness.kind === 'waiting') {
        row.wait_reason = readiness.reason;
        row.waiting_since = nowIso;
      }
      newRows.push(row);
      const list = byEmail.get(email) ?? [];
      list.push({ id: 'new', status: row.status, sent_at: null, source_ref: row.source_ref });
      byEmail.set(email, list);
    }
  }

  result.created += await insertRows(client, newRows);

  // 3. Waiting / scheduled rows: ready now? cancelled since?
  const { data: openData, error: openError } = await client
    .from(MESSAGES)
    .select(MESSAGE_COLUMNS)
    .in('status', ['waiting', 'scheduled']);
  if (openError) throw new Error(`Could not read the queue: ${openError.message}`);
  const open = (openData ?? []) as FollowUpMessageRow[];

  const receiptIds = open.filter((row) => row.source_type === 'buy_receipt').map((row) => row.source_id);
  const receiptStatus = new Map(
    (await selectIn<{ id: string; status: string }>(client, 'buy_receipts', 'id, status', 'id', receiptIds)).map((row) => [row.id, row.status]),
  );
  const orderIds = open.filter((row) => row.source_type === 'order').map((row) => row.source_id);
  const orderRows = await selectIn<OrderSource>(client, 'orders', ORDER_COLUMNS, 'id', orderIds);
  const orderStates = await loadOrderStates(client, orderRows);

  for (const row of open) {
    let update: Record<string, unknown> | null = null;
    if (row.source_type === 'buy_receipt') {
      const status = receiptStatus.get(row.source_id);
      if (status !== 'recorded') update = { status: 'cancelled', reason: status === 'void' ? 'The buy receipt was voided.' : 'The buy receipt is gone.', send_at: null };
    } else {
      const state = orderStates.get(row.source_id);
      if (!state) {
        update = { status: 'cancelled', reason: 'The order is gone.', send_at: null };
      } else if (row.step === 2) {
        const readiness = buyerReadiness(state, now, { firstLook: false, waitingSince: null });
        if (readiness.kind === 'cancelled') update = { status: 'cancelled', reason: readiness.reason, send_at: null };
      } else {
        const readiness = buyerReadiness(state, now, { firstLook: false, waitingSince: row.waiting_since });
        if (readiness.kind === 'cancelled') {
          update = { status: 'cancelled', reason: readiness.reason, send_at: null };
        } else if (row.status === 'waiting' && readiness.kind === 'ready') {
          update = {
            status: 'scheduled',
            event_at: readiness.eventAt.toISOString(),
            send_at: computeSendAt(readiness.eventAt, delayFor(settings, 'buyer'), now).toISOString(),
            wait_reason: null,
          };
          result.readied += 1;
        } else if (row.status === 'waiting' && readiness.kind === 'waiting' && readiness.reason !== row.wait_reason) {
          update = { wait_reason: readiness.reason, waiting_since: nowIso };
        }
      }
    }
    if (!update) continue;
    if (update.status === 'cancelled') result.cancelled += 1;
    const { error } = await client
      .from(MESSAGES)
      .update({ ...update, updated_at: nowIso })
      .eq('id', row.id)
      .in('status', ['waiting', 'scheduled']);
    if (error) throw new Error(`Could not update a follow-up: ${error.message}`);
  }

  // 4. Step 2, for each group that has it on.
  for (const audience of ['seller', 'buyer'] as const) {
    if (!stepEnabled(settings, audience, 2)) continue;
    const days = FOLLOW_UP_STEP2_DAYS[audience];
    const newest = new Date(now.getTime() - (days - FOLLOW_UP_STEP2_LOOKAHEAD_DAYS) * DAY_MS);
    const oldest = new Date(now.getTime() - (days + FOLLOW_UP_DISCOVERY_DAYS) * DAY_MS);
    const { data, error } = await client
      .from(MESSAGES)
      .select(MESSAGE_COLUMNS)
      .eq('audience', audience)
      .eq('step', 1)
      .eq('status', 'sent')
      .lte('sent_at', newest.toISOString())
      .gte('sent_at', oldest.toISOString());
    if (error) throw new Error(`Could not read sent thank-yous: ${error.message}`);
    const sent = (data ?? []) as FollowUpMessageRow[];
    if (sent.length === 0) continue;
    const already = new Set(
      (await selectIn<{ source_id: string; step: number }>(client, MESSAGES, 'source_id, step', 'source_id', sent.map((row) => row.source_id)))
        .filter((row) => row.step === 2)
        .map((row) => row.source_id),
    );
    const rows: NewRow[] = [];
    for (const step1 of sent) {
      if (already.has(step1.source_id) || !step1.sent_at) continue;
      const due = step2SendAt(new Date(step1.sent_at), audience);
      rows.push({
        email: step1.email,
        name: step1.name,
        audience,
        step: 2,
        source_type: step1.source_type,
        source_id: step1.source_id,
        source_ref: step1.source_ref,
        source_note: step1.source_note,
        language: step1.language,
        status: optOuts.has(step1.email) ? 'not_sent' : 'scheduled',
        event_at: step1.event_at,
        send_at: optOuts.has(step1.email) ? null : (due.getTime() < now.getTime() ? nextSlotAtOrAfter(now) : due).toISOString(),
        reason: optOuts.has(step1.email) ? 'Unsubscribed.' : null,
      });
    }
    result.step2 += await insertRows(client, rows);
  }

  return result;
}

// ---- Sending ----------------------------------------------------------------

function unsubscribeUrl(email: string, language: FollowUpLanguage): string {
  const params = new URLSearchParams({ email });
  return `${getSiteUrl()}${language === 'es' ? '/es' : ''}/unsubscribe?${params.toString()}`;
}

/** `/review?f=<token>` counts the click on the log, then goes to Google. */
export function trackedReviewUrl(token: string): string {
  return `${getSiteUrl()}/review?f=${encodeURIComponent(token)}`;
}

async function renderForRow(row: FollowUpMessageRow, template: FollowUpTemplate, mailingAddress: string, sendAt: Date): Promise<RenderedFollowUp> {
  return renderFollowUp(template, {
    audience: row.audience,
    language: row.language,
    name: row.name,
    eventAt: row.event_at ? new Date(row.event_at) : null,
    sendAt,
    item: row.audience === 'buyer' ? row.source_note : null,
    phone: BUSINESS_PHONE,
    reviewUrl: trackedReviewUrl(row.click_token),
    unsubscribeUrl: unsubscribeUrl(row.email, row.language),
    businessName: BUSINESS_NAME,
    mailingAddress,
  });
}

/** The email as it would go out now (Preview), or its saved copy once sent. */
export async function previewFollowUp(client: SupabaseClient, id: string): Promise<{ subject: string; html: string; text: string; saved: boolean } | null> {
  const { data, error } = await client.from(MESSAGES).select(`${MESSAGE_COLUMNS}, body_html, body_text`).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as FollowUpMessageRow & { body_html: string | null; body_text: string | null };
  if (row.status === 'sent' && row.body_html) {
    return { subject: row.subject ?? '', html: row.body_html, text: row.body_text ?? '', saved: true };
  }
  const { settings } = await loadFollowUpSettings(client);
  const marketing = await getMarketingSettings();
  const sendAt = row.send_at ? new Date(row.send_at) : new Date();
  const rendered = await renderForRow(row, templateFor(settings, row.audience, row.step, row.language), marketing.mailingAddress ?? addressOneLine(), sendAt);
  return { ...rendered, saved: false };
}

/** A sample of one template (the Edit emails box), with made-up details. */
export async function previewTemplate(
  template: FollowUpTemplate,
  audience: FollowUpAudience,
  language: FollowUpLanguage,
): Promise<RenderedFollowUp> {
  const marketing = await getMarketingSettings();
  const now = new Date();
  return renderFollowUp(template, {
    audience,
    language,
    name: audience === 'seller' ? 'Margaret Ellison' : 'Linda Park',
    eventAt: new Date(now.getTime() - DAY_MS),
    sendAt: now,
    item: audience === 'buyer' ? (language === 'es' ? 'cadena de cuerda de 14K' : '14K rope chain') : null,
    phone: BUSINESS_PHONE,
    reviewUrl: `${getSiteUrl()}/review`,
    unsubscribeUrl: unsubscribeUrl('example@example.com', language),
    businessName: BUSINESS_NAME,
    mailingAddress: marketing.mailingAddress ?? addressOneLine(),
  });
}

async function finish(client: SupabaseClient, id: string, update: Record<string, unknown>) {
  const { error } = await client.from(MESSAGES).update({ ...update, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'sending');
  if (error) console.error('[follow-ups] could not record the result:', error.message);
}

export type SendOutcome = { ok: boolean; status: FollowUpStatus; message: string };

/**
 * Send one follow-up. `manual` = an admin pressed Send now: it may send a row
 * that is waiting, failed, skipped or not sent, and skips the 90-day rule —
 * but never to someone unsubscribed or stopped.
 */
export async function sendFollowUp(
  client: SupabaseClient,
  id: string,
  options: { manual: boolean; byEmail?: string | null; settings?: FollowUpSettings },
): Promise<SendOutcome> {
  const allowed = options.manual ? ['scheduled', 'waiting', 'failed', 'skipped', 'not_sent'] : ['scheduled'];
  const { data: claimedRows, error: claimError } = await client
    .from(MESSAGES)
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', allowed)
    .select(MESSAGE_COLUMNS);
  if (claimError) throw new Error(`Could not claim the follow-up: ${claimError.message}`);
  const row = (claimedRows?.[0] ?? null) as FollowUpMessageRow | null;
  if (!row) return { ok: false, status: 'sending', message: 'This email is already sent or being sent.' };

  const email = normalizeEmail(row.email);
  if (!isValidEmail(email)) {
    await finish(client, id, { status: 'failed', reason: 'The email address is not valid.' });
    return { ok: false, status: 'failed', message: 'The email address is not valid.' };
  }

  const optOut = await optOutFor(client, email);
  if (optOut) {
    const reason = optOut.kind === 'stopped' ? 'Follow-ups stopped for this person.' : 'Unsubscribed.';
    await finish(client, id, { status: 'not_sent', reason, send_at: null });
    return { ok: false, status: 'not_sent', message: `Not sent: ${reason}` };
  }

  // The receipt / order must still stand.
  if (row.source_type === 'buy_receipt') {
    const { data } = await client.from('buy_receipts').select('status').eq('id', row.source_id).maybeSingle();
    if (data?.status !== 'recorded') {
      await finish(client, id, { status: 'cancelled', reason: 'The buy receipt was voided.', send_at: null });
      return { ok: false, status: 'cancelled', message: 'Not sent: the buy receipt was voided.' };
    }
  } else {
    const { data } = await client.from('orders').select(ORDER_COLUMNS).eq('id', row.source_id).maybeSingle();
    const state = data ? (await loadOrderStates(client, [data as OrderSource])).get(row.source_id) : null;
    const readiness = state ? buyerReadiness(state, new Date(), { firstLook: false, waitingSince: row.waiting_since }) : null;
    if (!readiness || readiness.kind === 'cancelled') {
      const reason = readiness?.kind === 'cancelled' ? readiness.reason : 'The order is gone.';
      await finish(client, id, { status: 'cancelled', reason, send_at: null });
      return { ok: false, status: 'cancelled', message: `Not sent: ${reason}` };
    }
  }

  if (!options.manual) {
    if (row.step === 1) {
      const { data: earlier } = await client.from(MESSAGES).select('sent_at').eq('email', email).eq('step', 1).eq('status', 'sent').neq('id', id);
      const recent = thankedRecently(((earlier ?? []) as Array<{ sent_at: string | null }>).map((r) => r.sent_at), new Date());
      if (recent) {
        const reason = `Thanked ${formatFollowUpTime(recent)} — one thank-you every 90 days.`;
        await finish(client, id, { status: 'not_sent', reason, send_at: null });
        return { ok: false, status: 'not_sent', message: `Not sent: ${reason}` };
      }
    } else if (row.audience === 'seller' && row.event_at) {
      // "Whenever you're ready" only if they have not sold to us again since.
      const { count } = await client
        .from('buy_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'recorded')
        .ilike('seller_email', likeExact(email))
        .gt('created_at', row.event_at);
      if ((count ?? 0) > 0) {
        await finish(client, id, { status: 'not_sent', reason: 'Sold to us again since — that visit got its own thank-you.', send_at: null });
        return { ok: false, status: 'not_sent', message: 'Not sent: they sold to us again since.' };
      }
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await finish(client, id, { status: 'failed', reason: 'RESEND_API_KEY is not set on the server.' });
    return { ok: false, status: 'failed', message: 'Email is not set up on this server (RESEND_API_KEY).' };
  }

  const settings = options.settings ?? (await loadFollowUpSettings(client)).settings;
  const marketing = await getMarketingSettings();
  const sender = marketing.senderProfiles.chris;
  const now = new Date();
  const rendered = await renderForRow(row, templateFor(settings, row.audience, row.step, row.language), marketing.mailingAddress ?? addressOneLine(), now);

  let resendId: string;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: sender.fromAddress,
      replyTo: sender.replyTo ?? undefined,
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(email, row.language)}>` },
    });
    if (result.error || !result.data?.id) throw new Error(result.error?.message ?? 'Resend did not accept the email.');
    resendId = result.data.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish(client, id, { status: 'failed', reason: `Email service: ${message}`.slice(0, 500) });
    return { ok: false, status: 'failed', message: `Not sent — ${message}` };
  }

  await finish(client, id, {
    status: 'sent',
    sent_at: now.toISOString(),
    sent_by_email: options.byEmail ?? null,
    subject: rendered.subject,
    body_html: rendered.html,
    body_text: rendered.text,
    resend_id: resendId,
    reason: null,
  });

  // A buyer's thank-you also shows in that order's Email History.
  if (row.source_type === 'order') {
    const { error: logError } = await logOrderEmail(client, {
      order_id: row.source_id,
      email_type: 'follow_up',
      recipient: email,
      subject: rendered.subject,
      status: `step${row.step}`,
      sent_by: null,
      sent_by_email: options.byEmail ?? FOLLOW_UP_AUTOMATIC_LABEL,
    }, { html: rendered.html, text: rendered.text });
    if (logError) console.error('[follow-ups] order_emails insert failed:', logError);
  }

  return { ok: true, status: 'sent', message: `Sent to ${email}.` };
}

export type SweepResult = { ok: boolean; skipped?: string; reconcile?: ReconcileResult; sent: number; notSent: number; failed: number; paused: boolean; errors: string[] };

/** The 15-minute job: find + queue, then send what is due (unless paused). */
export async function sweepFollowUps(client: SupabaseClient, now = new Date()): Promise<SweepResult> {
  const started = Date.now();
  const { ready, settings } = await loadFollowUpSettings(client);
  if (!ready) return { ok: true, skipped: 'Run supabase/follow-ups-2026-11.sql first.', sent: 0, notSent: 0, failed: 0, paused: false, errors: [] };
  const result: SweepResult = { ok: true, sent: 0, notSent: 0, failed: 0, paused: !settings.autoSend, errors: [] };
  try {
    result.reconcile = await reconcileFollowUps(client, settings, now);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!settings.autoSend) return result;

  const { data, error } = await client
    .from(MESSAGES)
    .select('id, audience, step')
    .eq('status', 'scheduled')
    .lte('send_at', now.toISOString())
    .order('send_at', { ascending: true })
    .limit(SEND_BATCH * 3);
  if (error) {
    result.errors.push(error.message);
    return { ...result, ok: false };
  }
  let attempted = 0;
  for (const due of (data ?? []) as Array<{ id: string; audience: FollowUpAudience; step: FollowUpStep }>) {
    // A step that is switched off waits in the queue (shown as "Off") until it is on again.
    if (!stepEnabled(settings, due.audience, due.step)) continue;
    if (attempted >= SEND_BATCH || Date.now() - started > SEND_BUDGET_MS) break;
    attempted += 1;
    try {
      const outcome = await sendFollowUp(client, due.id, { manual: false, settings });
      if (outcome.status === 'sent') result.sent += 1;
      else if (outcome.status === 'failed') result.failed += 1;
      else result.notSent += 1;
    } catch (sendError) {
      result.errors.push(sendError instanceof Error ? sendError.message : String(sendError));
    }
  }
  if (result.errors.length > 0) result.ok = false;
  return result;
}

// ---- Admin actions ----------------------------------------------------------

export async function rescheduleFollowUp(client: SupabaseClient, id: string, sendAt: Date): Promise<string | null> {
  const { data, error } = await client
    .from(MESSAGES)
    .update({ send_at: sendAt.toISOString(), status: 'scheduled', reason: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['scheduled', 'skipped', 'not_sent', 'failed'])
    .select('id');
  if (error) return error.message;
  return data && data.length > 0 ? null : 'This email can no longer be moved (it was sent, or is waiting for pickup / delivery).';
}

export async function skipFollowUp(client: SupabaseClient, id: string, byEmail: string | null): Promise<string | null> {
  const { data, error } = await client
    .from(MESSAGES)
    .update({ status: 'skipped', send_at: null, reason: `Skipped by ${byEmail ?? 'an admin'}.`, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['scheduled', 'waiting', 'failed'])
    .select('id');
  if (error) return error.message;
  return data && data.length > 0 ? null : 'This email was already sent or is being sent.';
}

/** Undo a Skip: back into the queue at the next 10 AM. */
export async function unskipFollowUp(client: SupabaseClient, id: string): Promise<string | null> {
  return rescheduleFollowUp(client, id, nextSlotAtOrAfter(new Date()));
}

export async function stopPerson(client: SupabaseClient, email: string, byEmail: string | null): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const { error } = await client
    .from(STOPS)
    .upsert({ email: normalized, reason: 'admin', stopped_at: new Date().toISOString(), stopped_by_email: byEmail }, { onConflict: 'email' });
  if (error) return error.message;
  await client
    .from(MESSAGES)
    .update({ status: 'not_sent', send_at: null, reason: 'Follow-ups stopped for this person.', updated_at: new Date().toISOString() })
    .eq('email', normalized)
    .in('status', ['scheduled', 'waiting']);
  return null;
}

/** Undo "Stop all" (only an owner stop — an unsubscribe is the person's own choice and stays). */
export async function resumePerson(client: SupabaseClient, email: string): Promise<string | null> {
  const { error } = await client.from(STOPS).delete().eq('email', normalizeEmail(email)).eq('reason', 'admin');
  return error?.message ?? null;
}

/** Record an unsubscribe from ANY marketing email here too (called by suppressMarketingEmail). */
export async function recordFollowUpUnsubscribe(client: SupabaseClient, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return;
  const { error } = await client
    .from(STOPS)
    .upsert({ email: normalized, reason: 'unsubscribed', stopped_at: new Date().toISOString(), stopped_by_email: null }, { onConflict: 'email' });
  if (error && !isFollowUpsNotReady(error)) console.error('[follow-ups] could not record the unsubscribe:', error.message);
  if (error) return;
  await client
    .from(MESSAGES)
    .update({ status: 'not_sent', send_at: null, reason: 'Unsubscribed.', updated_at: new Date().toISOString() })
    .eq('email', normalized)
    .in('status', ['scheduled', 'waiting']);
}

/** `/review?f=<token>`: mark the first click. Never throws — the visitor still goes to Google. */
export async function recordReviewClick(client: SupabaseClient, token: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return;
  try {
    await client
      .from(MESSAGES)
      .update({ review_clicked_at: new Date().toISOString() })
      .eq('click_token', token)
      .is('review_clicked_at', null);
  } catch {
    // ignore
  }
}

/**
 * "Send a thank-you now" on a person: their latest visit that has no
 * thank-you yet gets one, sent right away.
 */
export async function sendPersonNow(client: SupabaseClient, email: string, byEmail: string | null): Promise<SendOutcome> {
  const normalized = normalizeEmail(email);
  const { settings } = await loadFollowUpSettings(client);
  const [{ data: receipts }, { data: orders }] = await Promise.all([
    client.from('buy_receipts').select(RECEIPT_COLUMNS).eq('status', 'recorded').ilike('seller_email', likeExact(normalized)).order('created_at', { ascending: false }).limit(10),
    client.from('orders').select(ORDER_COLUMNS).eq('payment_status', 'paid').ilike('customer_email', likeExact(normalized)).is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
  ]);
  const visits = [
    ...((receipts ?? []) as ReceiptSource[]).map((receipt) => ({ kind: 'receipt' as const, at: receipt.created_at, receipt })),
    ...((orders ?? []) as OrderSource[]).map((order) => ({ kind: 'order' as const, at: order.created_at, order })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (visits.length === 0) return { ok: false, status: 'failed', message: 'No buy receipt or paid order with this email.' };

  const existing = new Map(
    (await selectIn<{ id: string; source_id: string; status: string; step: number }>(client, MESSAGES, 'id, source_id, status, step', 'source_id', visits.map((v) => (v.kind === 'receipt' ? v.receipt.id : v.order.id))))
      .filter((row) => row.step === 1)
      .map((row) => [row.source_id, row]),
  );
  for (const visit of visits) {
    const sourceId = visit.kind === 'receipt' ? visit.receipt.id : visit.order.id;
    const row = existing.get(sourceId);
    if (row && row.status === 'sent') continue;
    if (row) return sendFollowUp(client, row.id, { manual: true, byEmail, settings });
    const now = new Date();
    let fresh: NewRow;
    if (visit.kind === 'receipt') {
      fresh = {
        email: normalized,
        name: visit.receipt.seller_name,
        audience: 'seller',
        step: 1,
        source_type: 'buy_receipt',
        source_id: visit.receipt.id,
        source_ref: visit.receipt.receipt_number,
        source_note: `${money(visit.receipt.total)} paid`,
        language: visit.receipt.seller_language === 'es' ? 'es' : 'en',
        status: 'scheduled',
        event_at: visit.receipt.created_at,
        send_at: now.toISOString(),
      };
    } else {
      const language = await loadOrderLanguage(client, visit.order.id).catch(() => 'en' as const);
      const titles = await orderItemTitles(client, [visit.order.id]);
      fresh = {
        email: normalized,
        name: visit.order.customer_name,
        audience: 'buyer',
        step: 1,
        source_type: 'order',
        source_id: visit.order.id,
        source_ref: visit.order.order_number,
        source_note: itemPhrase(titles.get(visit.order.id) ?? [], language),
        language,
        status: 'scheduled',
        event_at: visit.order.created_at,
        send_at: now.toISOString(),
      };
    }
    await insertRows(client, [fresh]);
    const { data: inserted } = await client.from(MESSAGES).select('id').eq('source_type', fresh.source_type).eq('source_id', fresh.source_id).eq('step', 1).maybeSingle();
    if (!inserted) return { ok: false, status: 'failed', message: 'Could not queue the thank-you.' };
    return sendFollowUp(client, inserted.id as string, { manual: true, byEmail, settings });
  }
  return { ok: false, status: 'sent', message: 'Every visit of theirs already has a thank-you. Open the Sent log to see it.' };
}

// ---- The page ---------------------------------------------------------------

export type FollowUpPersonRow = {
  email: string;
  name: string | null;
  phone: string | null;
  isSeller: boolean;
  isBuyer: boolean;
  lastVisitAt: string | null;
  sellerCount: number;
  sellerTotal: number;
  buyerCount: number;
  buyerTotal: number;
  language: FollowUpLanguage;
  followUp:
    | { kind: 'scheduled'; at: string | null }
    | { kind: 'waiting' }
    | { kind: 'thanked'; at: string }
    | { kind: 'unsubscribed'; at: string | null }
    | { kind: 'stopped'; at: string | null }
    | { kind: 'none' };
};

export type FollowUpsPageData = {
  ready: boolean;
  settings: FollowUpSettings;
  upcoming: FollowUpMessageRow[];
  log: FollowUpMessageRow[];
  people: FollowUpPersonRow[];
  reconcileError: string | null;
};

export async function loadFollowUpsPage(client: SupabaseClient): Promise<FollowUpsPageData> {
  const { ready, settings } = await loadFollowUpSettings(client);
  if (!ready) return { ready, settings, upcoming: [], log: [], people: [], reconcileError: null };

  let reconcileError: string | null = null;
  try {
    await reconcileFollowUps(client, settings);
  } catch (error) {
    reconcileError = error instanceof Error ? error.message : String(error);
  }

  const [upcomingResult, logResult] = await Promise.all([
    client.from(MESSAGES).select(MESSAGE_COLUMNS).in('status', ['waiting', 'scheduled', 'sending']).order('send_at', { ascending: true, nullsFirst: false }).limit(500),
    client.from(MESSAGES).select(MESSAGE_COLUMNS).in('status', ['sent', 'skipped', 'not_sent', 'failed', 'cancelled']).order('updated_at', { ascending: false }).limit(400),
  ]);
  if (upcomingResult.error) throw new Error(upcomingResult.error.message);
  if (logResult.error) throw new Error(logResult.error.message);
  const upcoming = (upcomingResult.data ?? []) as FollowUpMessageRow[];
  const log = ((logResult.data ?? []) as FollowUpMessageRow[]).sort((a, b) => (b.sent_at ?? b.updated_at).localeCompare(a.sent_at ?? a.updated_at));

  const people = await loadPeople(client, upcoming);
  return { ready, settings, upcoming, log, people, reconcileError };
}

async function loadPeople(client: SupabaseClient, upcoming: FollowUpMessageRow[]): Promise<FollowUpPersonRow[]> {
  const [receiptsResult, buyersResult, sentResult, optOuts, orderLanguages] = await Promise.all([
    client.from('buy_receipts').select('seller_email, seller_name, seller_phone, seller_language, total, created_at').eq('status', 'recorded').not('seller_email', 'is', null).order('created_at', { ascending: true }).limit(10000),
    client.from('buyers').select('email, name, phone, order_count, total_spent, last_order_at').limit(10000),
    client.from(MESSAGES).select('email, sent_at').eq('step', 1).eq('status', 'sent').order('sent_at', { ascending: true }).limit(10000),
    loadOptOutMap(client),
    loadLatestOrderLanguageByEmail(client),
  ]);
  const people = new Map<string, FollowUpPersonRow & { sellerLanguageAt: string | null; sellerLanguage: FollowUpLanguage | null }>();
  const person = (email: string) => {
    let row = people.get(email);
    if (!row) {
      row = {
        email, name: null, phone: null, isSeller: false, isBuyer: false, lastVisitAt: null,
        sellerCount: 0, sellerTotal: 0, buyerCount: 0, buyerTotal: 0, language: 'en', followUp: { kind: 'none' },
        sellerLanguageAt: null, sellerLanguage: null,
      };
      people.set(email, row);
    }
    return row;
  };
  for (const receipt of (receiptsResult.data ?? []) as Array<{ seller_email: string | null; seller_name: string | null; seller_phone: string | null; seller_language: string | null; total: number | null; created_at: string }>) {
    const email = normalizeEmail(receipt.seller_email);
    if (!isValidEmail(email)) continue;
    const row = person(email);
    row.isSeller = true;
    row.sellerCount += 1;
    row.sellerTotal += Number(receipt.total ?? 0) || 0;
    row.name = receipt.seller_name || row.name;
    row.phone = receipt.seller_phone || row.phone;
    if (!row.lastVisitAt || receipt.created_at > row.lastVisitAt) row.lastVisitAt = receipt.created_at;
    row.sellerLanguage = receipt.seller_language === 'es' ? 'es' : 'en';
    row.sellerLanguageAt = receipt.created_at;
  }
  for (const buyer of (buyersResult.data ?? []) as Array<{ email: string | null; name: string | null; phone: string | null; order_count: number | null; total_spent: number | null; last_order_at: string | null }>) {
    const email = normalizeEmail(buyer.email);
    if (!isValidEmail(email)) continue;
    const row = person(email);
    row.isBuyer = true;
    row.buyerCount = buyer.order_count ?? 0;
    row.buyerTotal = Number(buyer.total_spent ?? 0) || 0;
    if (!row.name) row.name = buyer.name;
    if (!row.phone) row.phone = buyer.phone;
    if (buyer.last_order_at && (!row.lastVisitAt || buyer.last_order_at > row.lastVisitAt)) {
      row.lastVisitAt = buyer.last_order_at;
    }
  }
  const lastThanked = new Map<string, string>();
  for (const sent of (sentResult.data ?? []) as Array<{ email: string; sent_at: string | null }>) {
    if (sent.sent_at) lastThanked.set(normalizeEmail(sent.email), sent.sent_at);
  }
  const queued = new Map<string, FollowUpMessageRow>();
  for (const row of upcoming) {
    if (!queued.has(row.email)) queued.set(row.email, row);
  }

  const out: FollowUpPersonRow[] = [];
  for (const row of people.values()) {
    const orderLanguage = orderLanguages.get(row.email) ?? null;
    // The later of the two visits decides the language; a seller-only row uses the receipt's.
    row.language = row.isBuyer && orderLanguage && (!row.sellerLanguageAt || (row.lastVisitAt ?? '') > row.sellerLanguageAt)
      ? orderLanguage
      : row.sellerLanguage ?? orderLanguage ?? 'en';
    const optOut = optOuts.get(row.email);
    const next = queued.get(row.email);
    const thanked = lastThanked.get(row.email);
    if (optOut) row.followUp = optOut.kind === 'stopped' ? { kind: 'stopped', at: optOut.at } : { kind: 'unsubscribed', at: optOut.at };
    else if (next) row.followUp = next.status === 'waiting' ? { kind: 'waiting' } : { kind: 'scheduled', at: next.send_at };
    else if (thanked) row.followUp = { kind: 'thanked', at: thanked };
    out.push({
      email: row.email, name: row.name, phone: row.phone, isSeller: row.isSeller, isBuyer: row.isBuyer,
      lastVisitAt: row.lastVisitAt, sellerCount: row.sellerCount, sellerTotal: row.sellerTotal,
      buyerCount: row.buyerCount, buyerTotal: row.buyerTotal, language: row.language, followUp: row.followUp,
    });
  }
  return out.sort((a, b) => (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? ''));
}

export type PersonDetail = {
  email: string;
  visits: Array<{ kind: 'receipt' | 'order'; id: string; ref: string | null; at: string; amount: number; note: string | null }>;
  messages: FollowUpMessageRow[];
  optOut: OptOut | null;
};

export async function loadPersonDetail(client: SupabaseClient, email: string): Promise<PersonDetail> {
  const normalized = normalizeEmail(email);
  const [receipts, orders, messages, optOut] = await Promise.all([
    client.from('buy_receipts').select('id, receipt_number, total, created_at, status').ilike('seller_email', likeExact(normalized)).neq('status', 'draft').order('created_at', { ascending: false }).limit(50),
    client.from('orders').select('id, order_number, total, created_at, payment_status, fulfillment_status').ilike('customer_email', likeExact(normalized)).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
    client.from(MESSAGES).select(MESSAGE_COLUMNS).eq('email', normalized).order('created_at', { ascending: false }).limit(100),
    optOutFor(client, normalized),
  ]);
  const visits: PersonDetail['visits'] = [
    ...((receipts.data ?? []) as Array<{ id: string; receipt_number: string | null; total: number | null; created_at: string; status: string }>).map((receipt) => ({
      kind: 'receipt' as const,
      id: receipt.id,
      ref: receipt.receipt_number,
      at: receipt.created_at,
      amount: Number(receipt.total ?? 0) || 0,
      note: receipt.status === 'void' ? 'Void' : 'We paid',
    })),
    ...((orders.data ?? []) as Array<{ id: string; order_number: string | null; total: number | null; created_at: string; payment_status: string | null; fulfillment_status: string | null }>).map((order) => ({
      kind: 'order' as const,
      id: order.id,
      ref: order.order_number,
      at: order.created_at,
      amount: Number(order.total ?? 0) || 0,
      note: order.payment_status === 'paid' ? `They paid · ${String(order.fulfillment_status ?? '').replace(/_/g, ' ')}` : String(order.payment_status ?? '').replace(/_/g, ' '),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { email: normalized, visits, messages: (messages.data ?? []) as FollowUpMessageRow[], optOut };
}
