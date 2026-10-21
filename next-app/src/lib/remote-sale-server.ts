import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendOrderInvoiceEmail } from '@/lib/order-invoice-mailer';
import type { InvoicePaymentBlock } from '@/lib/order-invoice-email';
import { getSiteUrl } from '@/lib/order-email-branding';
import {
  formatRemoteDue,
  remoteInvoiceState,
  remoteOtherWays,
  remotePayUrl,
  sanitizeRemoteDraft,
  type RemoteDraftCardData,
  type RemoteDraftForm,
  type RemoteInvoiceCardData,
  type RemoteInvoiceState,
  type RemotePayOptions,
} from '@/lib/remote-sale';

export type { RemoteInvoiceCardData } from '@/lib/remote-sale';
import { formatCurrency } from '@/types/sales';

// Instant Sale → Remote sale, the server half (`lib/remote-sale.ts` holds the
// pure rules). Everything here runs with the service client: the
// `remote_sale_invoices` table is private (supabase/remote-sales-2026-10.sql).

export const REMOTE_INVOICE_COLUMNS =
  'id, order_id, pay_token, expires_at, link_days, pay_online, pay_zelle, pay_check, pay_phone, message, sent_count, last_sent_at, cancelled_at, created_at';

export type RemoteInvoiceRow = {
  id: string;
  order_id: string;
  pay_token: string;
  expires_at: string;
  link_days: number;
  pay_online: boolean;
  pay_zelle: boolean;
  pay_check: boolean;
  pay_phone: boolean;
  message: string | null;
  sent_count: number;
  last_sent_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

/** The order columns an invoice card / pay page needs — never internal notes. */
export const REMOTE_ORDER_COLUMNS =
  'id, order_number, customer_name, customer_email, customer_phone, subtotal, tax, shipping_fee, total, payment_status, order_status, payment_method, shipping_method, shipping_address, paypal_order_id, created_at';

export type RemoteOrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  total: number;
  payment_status: string | null;
  order_status: string | null;
  payment_method: string | null;
  shipping_method: string | null;
  shipping_address: Record<string, unknown> | null;
  paypal_order_id: string | null;
  created_at: string;
};

export type RemoteOrderItemRow = {
  id: string;
  product_id: string | null;
  inventory_number: string | null;
  title_snapshot: string;
  metal_snapshot: string | null;
  purity_snapshot: string | null;
  gram_weight_snapshot: number | null;
  price_snapshot: number;
  image_snapshot: string | null;
};

const ITEM_COLUMNS = 'id, product_id, inventory_number, title_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, image_snapshot';

/** 24 random bytes → 32 URL-safe characters. The whole permission to pay. */
export function newPayToken(): string {
  return randomBytes(24).toString('base64url');
}

export function payOptionsOf(row: Pick<RemoteInvoiceRow, 'pay_online' | 'pay_zelle' | 'pay_check' | 'pay_phone'>): RemotePayOptions {
  return { online: row.pay_online, zelle: row.pay_zelle, check: row.pay_check, phone: row.pay_phone };
}

export function payUrlOf(row: Pick<RemoteInvoiceRow, 'pay_token'>): string {
  return remotePayUrl(getSiteUrl(), row.pay_token);
}

/** The email's payment block for this invoice (see `InvoicePaymentBlock`). */
export function invoicePaymentBlock(
  row: RemoteInvoiceRow,
  order: Pick<RemoteOrderRow, 'order_number' | 'total' | 'shipping_method' | 'shipping_address'>,
): InvoicePaymentBlock {
  const pay = payOptionsOf(row);
  const shipsWithoutAddress = order.shipping_method === 'shipping' && !order.shipping_address;
  return {
    payUrl: pay.online ? payUrlOf(row) : null,
    payLabel: `Pay ${formatCurrency(order.total)} securely`,
    payHint: `PayPal or any debit / credit card · link good until ${formatRemoteDue(row.expires_at)}`,
    taxHint: pay.online && shipsWithoutAddress
      ? 'Shipping outside Florida? The Florida tax comes off when you enter your address.'
      : null,
    otherWays: remoteOtherWays(pay, order.order_number),
    message: row.message,
  };
}

export async function sendRemoteInvoiceEmail(
  service: SupabaseClient,
  row: RemoteInvoiceRow,
  order: RemoteOrderRow,
  sentBy: { id: string | null; email: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: 'Email sending is not configured (RESEND_API_KEY).' };
  if (!order.customer_email) return { ok: false, error: 'This invoice has no email address.' };
  const result = await sendOrderInvoiceEmail({
    supabase: service,
    resendKey,
    orderId: order.id,
    recipient: order.customer_email,
    sentBy,
    payment: invoicePaymentBlock(row, order),
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export type RemoteInvoiceBundle = {
  invoice: RemoteInvoiceRow;
  order: RemoteOrderRow;
  items: RemoteOrderItemRow[];
  state: RemoteInvoiceState;
};

async function bundle(service: SupabaseClient, invoice: RemoteInvoiceRow): Promise<RemoteInvoiceBundle | null> {
  const [{ data: order }, { data: items }] = await Promise.all([
    service.from('orders').select(REMOTE_ORDER_COLUMNS).eq('id', invoice.order_id).maybeSingle(),
    service.from('order_items').select(ITEM_COLUMNS).eq('order_id', invoice.order_id).order('created_at', { ascending: true }),
  ]);
  if (!order) return null;
  const o = order as unknown as RemoteOrderRow;
  return { invoice, order: o, items: (items ?? []) as unknown as RemoteOrderItemRow[], state: remoteInvoiceState(invoice, o) };
}

export async function findRemoteInvoiceByToken(service: SupabaseClient, token: string): Promise<RemoteInvoiceBundle | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data } = await service.from('remote_sale_invoices').select(REMOTE_INVOICE_COLUMNS).eq('pay_token', token).maybeSingle();
  return data ? bundle(service, data as unknown as RemoteInvoiceRow) : null;
}

export async function findRemoteInvoiceById(service: SupabaseClient, id: string): Promise<RemoteInvoiceBundle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await service.from('remote_sale_invoices').select(REMOTE_INVOICE_COLUMNS).eq('id', id).maybeSingle();
  return data ? bundle(service, data as unknown as RemoteInvoiceRow) : null;
}

export function cardData(b: RemoteInvoiceBundle): RemoteInvoiceCardData {
  return {
    id: b.invoice.id,
    orderId: b.order.id,
    orderNumber: b.order.order_number,
    customer: b.order.customer_name ?? '—',
    email: b.order.customer_email,
    itemCount: b.items.length,
    total: Number(b.order.total),
    ships: b.order.shipping_method === 'shipping',
    state: b.state,
    expiresAt: b.invoice.expires_at,
    sentCount: b.invoice.sent_count,
    payUrl: payUrlOf(b.invoice),
    payOnline: b.invoice.pay_online,
  };
}

/**
 * The Instant Sale page's list: every invoice not yet paid or cancelled
 * (expired ones included — they can be resent), newest first. An empty list
 * when the table is missing (SQL not run yet) — the page still works.
 */
export async function listOpenRemoteInvoices(service: SupabaseClient, limit = 30): Promise<RemoteInvoiceCardData[]> {
  const { data, error } = await service
    .from('remote_sale_invoices')
    .select(REMOTE_INVOICE_COLUMNS)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(limit * 2);
  if (error || !data) return [];
  const bundles = await Promise.all((data as unknown as RemoteInvoiceRow[]).map((row) => bundle(service, row)));
  return bundles
    .filter((b): b is RemoteInvoiceBundle => Boolean(b) && (b!.state === 'open' || b!.state === 'expired'))
    .slice(0, limit)
    .map(cardData);
}

// ---- Drafts ("Save draft", owner 2026-10-21) --------------------------------

export const REMOTE_DRAFT_COLUMNS = 'id, form, customer_name, item_count, updated_at';

type RemoteDraftRow = { id: string; form: unknown; customer_name: string | null; item_count: number; updated_at: string };

/** One draft, its form cleaned (`sanitizeRemoteDraft`). Null when missing — or the table is (SQL not run). */
export async function findRemoteDraft(service: SupabaseClient, id: string): Promise<{ id: string; form: RemoteDraftForm; updatedAt: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await service.from('remote_sale_drafts').select(REMOTE_DRAFT_COLUMNS).eq('id', id).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as RemoteDraftRow;
  return { id: row.id, form: sanitizeRemoteDraft(row.form), updatedAt: row.updated_at };
}

/** The Instant Sale page's Drafts list, newest first; empty when the table is missing. */
export async function listRemoteDrafts(service: SupabaseClient, limit = 30): Promise<RemoteDraftCardData[]> {
  const { data, error } = await service
    .from('remote_sale_drafts')
    .select('id, customer_name, item_count, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Omit<RemoteDraftRow, 'form'>[]).map((row) => ({
    id: row.id,
    customer: row.customer_name,
    itemCount: row.item_count,
    updatedAt: row.updated_at,
  }));
}
