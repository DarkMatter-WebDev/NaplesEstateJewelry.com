import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_DELIVERY_EMAIL_SETTING,
  deliveryEmailUpdate,
  readDeliveryEmailSetting,
  type DeliveryEmailSetting,
} from '@/lib/order-delivery-emails';

// `orders.delivery_emails` / `orders.delivery_emails_on_at`
// (supabase/order-delivery-emails-2026-11.sql). Own queries only — see
// order-delivery-emails.ts. Before the SQL: reads say "on" (as before), saves
// are refused with a "run the SQL" message.

const COLUMNS = 'delivery_emails, delivery_emails_on_at';
export const DELIVERY_EMAILS_SQL_FILE = 'supabase/order-delivery-emails-2026-11.sql';

/** The order's setting; on (and `ready: false`) when the column is not there yet or the read fails. */
export async function loadDeliveryEmailSetting(client: SupabaseClient, orderId: string): Promise<DeliveryEmailSetting> {
  try {
    const { data, error } = await client.from('orders').select(COLUMNS).eq('id', orderId).maybeSingle();
    if (error || !data) return DEFAULT_DELIVERY_EMAIL_SETTING;
    return readDeliveryEmailSetting(data);
  } catch {
    return DEFAULT_DELIVERY_EMAIL_SETTING;
  }
}

/** Turn the order's automatic shipping update emails on or off. */
export async function saveDeliveryEmailSetting(
  client: SupabaseClient,
  orderId: string,
  on: boolean,
): Promise<{ ok: true; setting: DeliveryEmailSetting } | { ok: false; error: string }> {
  const { data, error: readError } = await client.from('orders').select(COLUMNS).eq('id', orderId).maybeSingle();
  if (readError) {
    console.error('[delivery-emails] read failed (run the SQL?):', readError.message);
    return { ok: false, error: `Shipping updates setting is not available yet — run ${DELIVERY_EMAILS_SQL_FILE} in Supabase.` };
  }
  if (!data) return { ok: false, error: 'Order not found.' };

  const current = readDeliveryEmailSetting(data);
  const update = deliveryEmailUpdate(current, on, new Date().toISOString());
  if (!update) return { ok: true, setting: current };

  const { data: saved, error } = await client.from('orders').update(update).eq('id', orderId).select(COLUMNS).maybeSingle();
  if (error || !saved) {
    console.error('[delivery-emails] write failed:', error?.message);
    return { ok: false, error: error?.message ?? 'Could not save the shipping updates setting.' };
  }
  return { ok: true, setting: readDeliveryEmailSetting(saved) };
}
