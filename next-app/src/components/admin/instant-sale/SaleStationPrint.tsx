'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  SALE_PRINT_MESSAGES,
  SALE_PRINT_TABLE,
  SALE_PRINT_WATCH_EVERY_MS,
  SALE_PRINT_WATCH_GIVE_UP_MS,
  salePrintWatchPhase,
  type SalePrintPhase,
  type SalePrintRequestRef,
} from '@/lib/sale-print-requests';

/**
 * "Send to desktop printer" on a recorded in-store sale (2026-10-26), and the
 * line under it: Sent. Waiting for the desktop… → Printed on the desktop. (or,
 * after 30 s with no station picking it up, that the Print Station window is
 * probably closed). Watches its one `sale_print_requests` row straight from
 * Supabase every 2 s, for up to a minute — the buy receipts' panel does the
 * same (`buy-receipts/ReceiptPrintControls.tsx`).
 *
 * `initialRequest` = the send "Record & send to desktop printer" already made;
 * `initialError` = why that send failed (the sale itself is recorded).
 */
export default function SaleStationPrint({
  orderId,
  initialRequest = null,
  initialError = null,
}: {
  orderId: string;
  initialRequest?: SalePrintRequestRef | null;
  initialError?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [phase, setPhase] = useState<SalePrintPhase | null>(initialRequest ? 'waiting' : null);
  const [watch, setWatch] = useState<{ id: string; startedAt: number } | null>(
    () => (initialRequest ? { id: initialRequest.id, startedAt: Date.now() } : null),
  );

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPhase(null);
    try {
      const res = await fetch(`/api/admin/in-store-sales/${orderId}/print-request`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        setError(data.error ?? 'Could not send it to the desktop printer.');
        return;
      }
      setPhase('waiting');
      setWatch({ id: data.request.id, startedAt: Date.now() });
    } catch {
      setError('Could not reach the server. Nothing was sent — try again.');
    } finally {
      setBusy(false);
    }
  }, [orderId]);

  // Watch the row until the station marks it printed.
  useEffect(() => {
    if (!watch) return;
    let cancelled = false;
    let timer = 0;
    const supabase = createClient();

    const tick = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - watch.startedAt;
      await supabase.auth.getSession();
      const { data } = await supabase.from(SALE_PRINT_TABLE).select('printed_at, claimed_at').eq('id', watch.id).maybeSingle();
      if (cancelled) return;
      const next = salePrintWatchPhase((data as { printed_at: string | null; claimed_at: string | null } | null) ?? null, elapsed);
      setPhase(next);
      if (next === 'printed' || elapsed > SALE_PRINT_WATCH_GIVE_UP_MS) {
        setWatch(null);
        return;
      }
      timer = window.setTimeout(tick, SALE_PRINT_WATCH_EVERY_MS);
    };

    timer = window.setTimeout(tick, SALE_PRINT_WATCH_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [watch]);

  return (
    <div className="grid gap-2">
      <button type="button" className="outline-button text-xs" disabled={busy || phase === 'waiting'} onClick={() => void send()}>
        {busy ? 'Sending…' : 'Send to desktop printer'}
      </button>
      {phase === 'waiting' && (
        <span role="status" className="text-xs text-center" style={{ color: 'var(--color-on-surface-variant)' }}>{SALE_PRINT_MESSAGES.waiting}</span>
      )}
      {phase === 'printed' && (
        <span role="status" className="text-xs text-center font-semibold" style={{ color: 'var(--color-primary)' }}>{SALE_PRINT_MESSAGES.printed}</span>
      )}
      {phase === 'stalled' && (
        <span role="alert" className="text-xs text-center" style={{ color: 'var(--color-error)' }}>{SALE_PRINT_MESSAGES.stalled}</span>
      )}
      {error && (
        <span role="alert" className="text-xs text-center" style={{ color: 'var(--color-error)' }}>{error}</span>
      )}
    </div>
  );
}
