'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Printer, RefreshCw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  BUY_RECEIPT_CLAIM_STALE_MS,
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_STATION_BACKOFF_MAX_MS,
  BUY_RECEIPT_STATION_KEY,
  BUY_RECEIPT_STATION_POLL_MS,
  BUY_RECEIPT_TIME_ZONE,
  easternDayKey,
  formatReceiptTime,
  isClaimStale,
  isPrintPending,
  receiptPrintLabel,
  resolvePrintCopies,
  sampleBuyReceipt,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';
import { useReceiptPrinter } from './BuyReceiptPrintHost';
import { printableIdPhoto, type PrintableIdPhoto } from './buy-receipt-client';

/**
 * Admin → Buy Receipts → Print station (owner mockup 2026-09-29).
 *
 * Left open on the PC that has the printer. It watches for receipts the laptop
 * sent and prints them on its own. On that PC Chrome is started from a
 * shortcut with --kiosk-printing, so `window.print()` goes straight to the
 * default printer with no dialog (features/buy-receipts.md has the shortcut).
 *
 * How it works, and why:
 * - It polls Supabase DIRECTLY from the browser (the admin session under RLS),
 *   never through a site route: a station left open all day would otherwise
 *   spend tens of thousands of function calls doing nothing.
 * - ⛔ It does nothing until THIS browser is chosen as the station (a
 *   localStorage flag). Otherwise opening this tab on the laptop would grab
 *   the job and pop a print dialog on the wrong computer.
 * - A job is CLAIMED with a compare-and-set update before printing, so two
 *   station windows never print the same request. A claim from a window that
 *   died is taken over after 90 seconds.
 * - The clock comes from a Web Worker. Chrome slows page timers to once a
 *   minute in a window that is covered or minimised — and the station usually
 *   sits behind whatever else the desktop is doing. Worker timers keep time.
 */

const STATION_EVENT = 'nej-buy-receipt-station-change';
const TODAY_REFRESH_MS = 60_000;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

type Status = 'starting' | 'ready' | 'printing' | 'disconnected' | 'signed-out';
type Armed = 'unknown' | 'armed' | 'off';

function subscribeStation(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(STATION_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(STATION_EVENT, onChange);
  };
}

function readStation(): Armed {
  try {
    return window.localStorage.getItem(BUY_RECEIPT_STATION_KEY) === '1' ? 'armed' : 'off';
  } catch {
    return 'off';
  }
}

function writeStation(armed: boolean) {
  try {
    if (armed) window.localStorage.setItem(BUY_RECEIPT_STATION_KEY, '1');
    else window.localStorage.removeItem(BUY_RECEIPT_STATION_KEY);
  } catch {
    // Storage blocked: the station simply stays off on this browser.
  }
  window.dispatchEvent(new Event(STATION_EVENT));
}

/** A once-a-second tick that keeps running in a covered window. */
function startTicker(onTick: () => void): () => void {
  try {
    const source = URL.createObjectURL(new Blob(['setInterval(function () { postMessage(0); }, 1000);'], { type: 'text/javascript' }));
    const worker = new Worker(source);
    worker.onmessage = onTick;
    return () => {
      worker.terminate();
      URL.revokeObjectURL(source);
    };
  } catch {
    const interval = window.setInterval(onTick, 1000);
    return () => window.clearInterval(interval);
  }
}

function isAuthError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST301' || /jwt|token is expired|invalid claim|not authenticated/i.test(error.message ?? '');
}

function clockLabel(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUY_RECEIPT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

export default function PrintStation({ adminBasePath, adminEmail }: { adminBasePath: string; adminEmail: string | null }) {
  const armed = useSyncExternalStore<Armed>(subscribeStation, readStation, () => 'unknown');
  const [status, setStatus] = useState<Status>('starting');
  const [current, setCurrent] = useState<BuyReceiptRow | null>(null);
  const [today, setToday] = useState<BuyReceiptRow[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const printer = useReceiptPrinter();
  const printReceipt = printer.print;
  const router = useRouter();

  /** This window's name on a claim. Made on first use, in the browser only. */
  const tabIdRef = useRef<string | null>(null);
  const stationId = useCallback((): string => {
    if (!tabIdRef.current) tabIdRef.current = `station-${Math.random().toString(36).slice(2, 10)}`;
    return tabIdRef.current;
  }, []);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const tickingRef = useRef(false);
  const printingRef = useRef(false);
  const failuresRef = useRef(0);
  const nextPollAtRef = useRef(0);
  const nextTodayAtRef = useRef(0);
  const stoppedRef = useRef(false);
  /** Printed, but the "printed" write failed: retried every tick, and never printed again meanwhile. */
  const pendingMarksRef = useRef(new Map<string, { printed_at: string; print_count: number }>());

  const client = useCallback((): SupabaseClient => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const signedOut = useCallback(() => {
    stoppedRef.current = true;
    setStatus('signed-out');
    const prefix = adminBasePath.replace(/\/admin$/, '');
    const next = encodeURIComponent(`${adminBasePath}/buy-receipts/station`);
    const signInUrl = `${prefix}/account/sign-in?next=${next}`;
    // Long enough to read "Signed out" before the page changes.
    window.setTimeout(() => router.replace(signInUrl), 1500);
  }, [adminBasePath, router]);

  const refreshToday = useCallback(async () => {
    nextTodayAtRef.current = Date.now() + TODAY_REFRESH_MS;
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    const { data } = await client()
      .from('buy_receipts')
      .select(BUY_RECEIPT_COLUMNS)
      .gte('created_at', since)
      .order('seq', { ascending: false })
      .limit(60);
    const todayKey = easternDayKey(new Date());
    const rows = ((data ?? []) as unknown as BuyReceiptRow[]).filter((row) => easternDayKey(row.created_at) === todayKey);
    setToday(rows);
  }, [client]);

  /** Print one receipt this station has already claimed (or a local reprint), then record it. */
  const runPrint = useCallback(
    async (row: BuyReceiptRow, wanted: { plain: number; withId: number }, claimed: boolean) => {
      printingRef.current = true;
      setCurrent(row);
      setStatus('printing');
      let idPhoto: PrintableIdPhoto | null = null;
      try {
        idPhoto = wanted.withId > 0 ? await printableIdPhoto(row.seller_id_photo_path) : null;
        if (wanted.withId > 0 && !idPhoto) setNotice(`${row.receipt_number}: the ID photo could not be loaded, so it printed without it.`);
        const copies = resolvePrintCopies(wanted, Boolean(idPhoto));
        const pages = await printReceipt(row, copies, idPhoto?.url ?? null);
        if (pages <= 0 || row.id === 'test-print') return;

        const mark = { printed_at: new Date().toISOString(), print_count: row.print_count + pages };
        let query = client()
          .from('buy_receipts')
          .update(claimed ? { ...mark, print_requested_at: null, print_claimed_at: null, print_claimed_by: null } : mark)
          .eq('id', row.id);
        if (claimed) query = query.eq('print_claimed_by', stationId());
        const { error } = await query;
        if (error) {
          pendingMarksRef.current.set(row.id, mark);
          setNotice(`${row.receipt_number} printed, but the log could not be updated yet. It will not print twice.`);
        }
      } finally {
        idPhoto?.release();
        printingRef.current = false;
        setCurrent(null);
        if (!stoppedRef.current) setStatus('ready');
        void refreshToday();
      }
    },
    [client, printReceipt, refreshToday, stationId],
  );

  const poll = useCallback(async () => {
    if (tickingRef.current || printingRef.current || stoppedRef.current) return;
    tickingRef.current = true;
    let delay = BUY_RECEIPT_STATION_POLL_MS;
    try {
      const supabase = client();
      // Without this the first query goes out as anon and RLS answers "nothing", forever.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        signedOut();
        return;
      }

      // Finish any "printed" write that failed earlier.
      for (const [id, mark] of pendingMarksRef.current) {
        const { error } = await supabase
          .from('buy_receipts')
          .update({ ...mark, print_requested_at: null, print_claimed_at: null, print_claimed_by: null })
          .eq('id', id);
        if (!error) pendingMarksRef.current.delete(id);
      }

      const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
      const { data, error } = await supabase
        .from('buy_receipts')
        .select(BUY_RECEIPT_COLUMNS)
        .not('print_requested_at', 'is', null)
        .gte('print_requested_at', since)
        .order('print_requested_at', { ascending: true })
        .limit(20);

      if (error) {
        if (isAuthError(error)) {
          signedOut();
          return;
        }
        throw new Error(error.message);
      }

      failuresRef.current = 0;
      setLastCheckedAt(Date.now());
      setStatus('ready');

      const now = Date.now();
      // PostgREST cannot compare two columns, so "requested after it last printed" is decided here.
      const next = ((data ?? []) as unknown as BuyReceiptRow[]).find(
        (row) => isPrintPending(row) && isClaimStale(row, now) && !pendingMarksRef.current.has(row.id),
      );
      if (next) {
        const staleBefore = new Date(now - BUY_RECEIPT_CLAIM_STALE_MS).toISOString();
        // Compare-and-set: only one station window wins this exact request.
        const { data: won } = await supabase
          .from('buy_receipts')
          .update({ print_claimed_at: new Date().toISOString(), print_claimed_by: stationId() })
          .eq('id', next.id)
          .eq('print_requested_at', next.print_requested_at as string)
          .or(`print_claimed_at.is.null,print_claimed_at.lt.${staleBefore}`)
          .select('id');
        if (won && won.length > 0) {
          await runPrint(next, { plain: next.print_copies_plain, withId: next.print_copies_with_id }, true);
          delay = 250;
        }
      }

      if (Date.now() >= nextTodayAtRef.current) void refreshToday();
    } catch (caught) {
      failuresRef.current += 1;
      delay = Math.min(BUY_RECEIPT_STATION_POLL_MS * 2 ** failuresRef.current, BUY_RECEIPT_STATION_BACKOFF_MAX_MS);
      if (failuresRef.current >= 3) {
        setStatus('disconnected');
        setNotice(caught instanceof Error ? caught.message : 'The connection was lost.');
      }
    } finally {
      nextPollAtRef.current = Date.now() + delay;
      tickingRef.current = false;
    }
  }, [client, refreshToday, runPrint, signedOut, stationId]);

  useEffect(() => {
    if (armed !== 'armed') return;
    stoppedRef.current = false;
    nextPollAtRef.current = 0;
    const onTick = () => {
      if (Date.now() >= nextPollAtRef.current) void poll();
    };
    const stop = startTicker(onTick);
    const onWake = () => {
      nextPollAtRef.current = 0;
      onTick();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      stop();
      stoppedRef.current = true;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [armed, poll]);

  function checkNow() {
    setNotice(null);
    failuresRef.current = 0;
    nextPollAtRef.current = 0;
    void poll();
  }

  function testPrint() {
    if (printingRef.current) return;
    setNotice(null);
    void runPrint(sampleBuyReceipt(new Date().toISOString()), { plain: 1, withId: 0 }, false);
  }

  function printAgain(row: BuyReceiptRow) {
    if (printingRef.current) return;
    setNotice(null);
    void runPrint(row, { plain: 1, withId: 0 }, false);
  }

  const pageStyle = { minHeight: '100vh', background: 'var(--color-background, #fafaf8)', color: 'var(--color-on-surface)' } as const;
  const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
  const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

  const brand = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-xl" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}>Naples Estate Jewelry</span>
      <span className="text-sm" style={hintStyle}>Print station</span>
    </div>
  );

  if (armed !== 'armed') {
    return (
      <div style={pageStyle} className="px-4 py-8 md:px-8">
        <div className="mx-auto grid max-w-2xl gap-5">
          {brand}
          <div className="border bg-white p-6 text-center md:p-10" style={cardStyle}>
            <Printer size={44} aria-hidden="true" className="mx-auto" style={{ color: 'var(--color-primary)' }} />
            <h1 className="mt-3 text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)' }}>
              {armed === 'unknown' ? 'Print station' : 'This computer is not the print station'}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm" style={hintStyle}>
              The print station runs on the computer that is connected to the printer. Receipts sent from the laptop print there on their own. Turn it on only on that computer.
            </p>
            {armed === 'off' && (
              <button type="button" className="gold-button mt-5 text-xs" onClick={() => writeStation(true)}>
                Use this computer as the print station
              </button>
            )}
          </div>
          <Link href={`${adminBasePath}/buy-receipts`} className="text-sm underline" style={{ color: 'var(--color-primary)' }}>
            Back to Buy Receipts
          </Link>
        </div>
      </div>
    );
  }

  const pill =
    status === 'ready' || status === 'printing'
      ? { text: lastCheckedAt ? `Connected · checked ${clockLabel(lastCheckedAt)}` : 'Connected', background: '#eaf3de', color: '#27500a', dot: '#639922' }
      : status === 'starting'
        ? { text: 'Connecting…', background: '#f1efe8', color: '#5f5e5a', dot: '#888780' }
        : status === 'signed-out'
          ? { text: 'Signed out', background: '#f1efe8', color: '#5f5e5a', dot: '#888780' }
          : { text: 'Disconnected · retrying', background: '#fcebeb', color: '#791f1f', dot: '#e24b4a' };

  return (
    <div style={pageStyle} className="px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-4xl gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {brand}
          <span className="flex-1" />
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: pill.background, color: pill.color }} role="status">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: pill.dot }} />
            {pill.text}
          </span>
          {adminEmail && <span className="text-xs" style={hintStyle}>Signed in as {adminEmail}</span>}
        </div>

        <div className="border bg-white px-6 py-8 text-center" style={cardStyle}>
          <Printer size={44} aria-hidden="true" className="mx-auto" style={{ color: 'var(--color-primary)' }} />
          <h1 className="mt-2 text-3xl font-bold" style={{ fontFamily: 'var(--font-headline)' }}>
            {status === 'printing' ? 'Printing' : status === 'disconnected' ? 'Disconnected' : status === 'signed-out' ? 'Signed out' : status === 'starting' ? 'Starting' : 'Ready'}
          </h1>
          <p className="mx-auto mt-1 max-w-lg text-sm" style={hintStyle}>
            {status === 'signed-out'
              ? 'Taking you to sign in. You will come straight back here.'
              : status === 'disconnected'
                ? 'The station cannot reach the site. It keeps trying on its own.'
                : 'Receipts sent from the laptop print here on their own. Keep this window open, not minimized.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="outline-button text-xs" onClick={checkNow}>
              <RefreshCw size={14} aria-hidden="true" className="mr-1.5 inline" />
              Check now
            </button>
            <button type="button" className="outline-button text-xs" disabled={status === 'printing'} onClick={testPrint}>
              <FileText size={14} aria-hidden="true" className="mr-1.5 inline" />
              Test print
            </button>
          </div>
        </div>

        {current && (
          <div className="border px-4 py-3" style={{ borderColor: '#ef9f27', background: '#faeeda', color: '#633806' }} role="status">
            <p className="text-sm font-semibold">
              Printing {current.receipt_number} · {current.seller_name} · {formatCurrency(current.total)}
            </p>
            {current.print_requested_at && (
              <p className="text-xs" style={{ color: '#854f0b' }}>
                Sent {formatReceiptTime(current.print_requested_at)}
                {current.print_requested_by ? ` by ${current.print_requested_by}` : ''}
              </p>
            )}
          </div>
        )}

        {notice && (
          <p role="alert" className="border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
            {notice}
          </p>
        )}

        <div>
          <p className="mb-2 text-sm" style={hintStyle}>Today</p>
          {today.length === 0 ? (
            <div className="border bg-white px-4 py-6 text-center text-sm" style={{ ...cardStyle, ...hintStyle }}>
              No receipts yet today.
            </div>
          ) : (
            <div className="border bg-white" style={cardStyle}>
              {today.map((row, index) => {
                const isVoid = row.status === 'void';
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                    style={{ borderTop: index === 0 ? 'none' : '1px solid var(--color-outline-variant)', color: isVoid ? 'var(--color-on-surface-variant)' : undefined }}
                  >
                    <span className="w-24 font-semibold">{row.receipt_number}</span>
                    <span className="w-20" style={hintStyle}>{formatReceiptTime(row.created_at)}</span>
                    <span className="min-w-[140px] flex-1">
                      {row.seller_name} · {row.items.length} {row.items.length === 1 ? 'item' : 'items'}
                      {isVoid ? ' · void' : ''}
                    </span>
                    <span className="w-24 text-right">{formatCurrency(row.total)}</span>
                    <span className="w-40 text-right text-xs" style={hintStyle}>{receiptPrintLabel(row)}</span>
                    <button type="button" className="outline-button text-xs" disabled={status === 'printing'} onClick={() => printAgain(row)}>
                      Print again
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={hintStyle}>
          <Link href={`${adminBasePath}/buy-receipts/log`} className="underline">Log</Link>
          <Link href={`${adminBasePath}/buy-receipts`} className="underline">New receipt</Link>
          <span className="flex-1" />
          <button type="button" className="underline" onClick={() => writeStation(false)}>
            Stop using this computer as the print station
          </button>
        </div>
      </div>
      {printer.host}
    </div>
  );
}
