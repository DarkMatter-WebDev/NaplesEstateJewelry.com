import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperReceipt } from '@/lib/order-receipt-paper';
import { loadPaperReceipt } from '@/lib/order-receipt-paper-server';
import {
  isMissingSalePrintTable,
  SALE_PRINT_MESSAGES,
  SALE_PRINT_TABLE,
  salePrintInsert,
  type SalePrintRequestRef,
} from '@/lib/sale-print-requests';

/**
 * "Send to desktop printer" for a recorded sale: one `sale_print_requests` row
 * the Print Station picks up on its next check (`lib/sale-print-requests.ts`).
 *
 * The order and its paper are read with the service client (the same read the
 * in-store route already does); the row is written with the admin's own
 * request-scoped client, under the admin-only RLS policy — the buy-receipts
 * pattern. `paper` may be passed when the caller already built it.
 */
export async function queueSalePrint(
  adminClient: SupabaseClient,
  service: SupabaseClient,
  input: { orderId: string; requestedBy: string | null; paper?: PaperReceipt | null },
): Promise<{ request: SalePrintRequestRef } | { error: string; status: number }> {
  const [{ data: order, error: orderError }, paper] = await Promise.all([
    service.from('orders').select('order_number, customer_name, total').eq('id', input.orderId).maybeSingle(),
    input.paper ? Promise.resolve(input.paper) : loadPaperReceipt(service, input.orderId),
  ]);
  if (orderError) console.error('[sale-print] order read failed', orderError.message);
  if (!order) return { error: 'Order not found.', status: 404 };
  if (!paper) return { error: 'The receipt could not be read to send it.', status: 500 };

  const { data, error } = await adminClient
    .from(SALE_PRINT_TABLE)
    .insert(salePrintInsert({
      orderId: input.orderId,
      orderNumber: String(order.order_number),
      customerName: (order.customer_name as string | null) ?? null,
      total: order.total == null ? null : Number(order.total),
      paper,
      requestedBy: input.requestedBy,
    }))
    .select('id, requested_at')
    .single();

  if (error || !data) {
    console.error('[sale-print] request failed', error?.message);
    if (isMissingSalePrintTable(error)) return { error: SALE_PRINT_MESSAGES.needsSql, status: 503 };
    return { error: 'Could not send it to the desktop printer.', status: 500 };
  }
  return { request: { id: data.id as string, requestedAt: data.requested_at as string } };
}
