'use client';

import { formatCurrency } from '@/types/sales';
import { round2 } from '@/lib/checkout-pricing';
import {
  IN_STORE_PAYMENT_LABELS,
  IN_STORE_PAYMENT_METHODS,
  SALE_PAYMENTS_MAX,
  parseSalePaymentAmount,
  salePaymentsMismatch,
  type InStorePaymentMethod,
  type SalePaymentPart,
} from '@/lib/in-store-sale';

// "Paid by" for Instant Sale (owner mockup 2026-11-16): one method (the chips,
// as before) or a SPLIT — two to four payment lines, each a method and an
// amount, that must add up to the total. The last line fills itself with what
// is left until something is typed in it (owner decision 1). The same method
// may appear twice (two cards on Zettle). Shared by the In-store form and the
// Remote invoice's "Record payment"; the server checks the sum again
// (`normalizeSalePayments`).

export type SalePaymentLine = { key: string; method: InStorePaymentMethod; amount: string; typed: boolean };
export type SalePaymentsDraft = { paidBy: InStorePaymentMethod; split: boolean; lines: SalePaymentLine[] };

let lineCounter = 0;
function newLine(method: InStorePaymentMethod): SalePaymentLine {
  lineCounter += 1;
  return { key: `pay-${lineCounter}`, method, amount: '', typed: false };
}

export function newSalePayments(paidBy: InStorePaymentMethod = 'zettle'): SalePaymentsDraft {
  return { paidBy, split: false, lines: [] };
}

/**
 * The amount each line stands for: what was typed, or — on the LAST line,
 * until it is typed in — what is left of the total. Null = blank / not a number.
 */
export function salePaymentLineAmounts(draft: SalePaymentsDraft, total: number | null): (number | null)[] {
  const last = draft.lines.length - 1;
  const typed = draft.lines.map((line) => parseSalePaymentAmount(line.amount));
  return draft.lines.map((line, index) => {
    if (index !== last || line.typed) return typed[index];
    if (total == null) return null;
    const others = typed.slice(0, last);
    if (others.some((value) => value == null)) return null;
    const rest = round2(total - others.reduce<number>((sum, value) => sum + (value ?? 0), 0));
    return rest > 0 ? rest : null;
  });
}

/** The parts as they stand — only when every line has a method and an amount. */
export function salePaymentParts(draft: SalePaymentsDraft, total: number | null): SalePaymentPart[] | null {
  if (!draft.split) return total == null ? null : [{ method: draft.paidBy, amount: round2(total) }];
  const amounts = salePaymentLineAmounts(draft, total);
  if (amounts.some((value) => value == null)) return null;
  return draft.lines.map((line, index) => ({ method: line.method, amount: amounts[index] as number }));
}

/** Why the payments cannot be recorded yet, or null. */
export function salePaymentsProblem(draft: SalePaymentsDraft, total: number | null): string | null {
  if (!draft.split || total == null) return null;
  const amounts = salePaymentLineAmounts(draft, total);
  const blank = amounts.findIndex((value) => value == null);
  if (blank >= 0) return `Payment ${blank + 1}: enter the amount, e.g. 500.`;
  return salePaymentsMismatch(round2(amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0)), total);
}

/** The request body's payment part: `{ paidBy }` or `{ payments }`. */
export function salePaymentsPayload(draft: SalePaymentsDraft, total: number | null): { paidBy: InStorePaymentMethod } | { payments: SalePaymentPart[] } {
  if (!draft.split) return { paidBy: draft.paidBy };
  return { payments: salePaymentParts(draft, total) ?? [] };
}

const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;

function chipStyle(on: boolean) {
  return {
    fontFamily: 'var(--font-label)',
    borderColor: on ? 'var(--color-primary)' : 'var(--color-outline-variant)',
    background: on ? '#fbf5dd' : '#fff',
    color: on ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
  } as const;
}

export default function SalePaymentsEditor({
  draft,
  onChange,
  total,
  compact = false,
  totalWord = 'total',
}: {
  draft: SalePaymentsDraft;
  onChange: (next: SalePaymentsDraft) => void;
  /** What the payments must add up to; null while the price is not typed yet. */
  total: number | null;
  /** The Remote invoice card's smaller chips. */
  compact?: boolean;
  /** "total" (in store) or "invoice". */
  totalWord?: string;
}) {
  const chipClass = compact
    ? 'rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.08em]'
    : 'rounded-full border px-4 py-2.5 text-[0.7rem] font-bold uppercase tracking-[0.08em]';
  const splitButton = (
    <button
      type="button"
      className="lift-tile justify-self-start rounded-full border border-dashed px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.06em] bg-white"
      style={{ fontFamily: 'var(--font-label)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
      onClick={() => {
        // Opens two lines: the method picked so far, then the card (cash + card when the card was picked).
        const first: InStorePaymentMethod = draft.paidBy === 'zettle' ? 'cash' : draft.paidBy;
        onChange({ ...draft, split: true, lines: [newLine(first), newLine('zettle')] });
      }}
    >
      + Split payment{compact ? '' : ' (two or more methods)'}
    </button>
  );

  if (!draft.split) {
    return (
      <div className="grid gap-3">
        <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 sm:flex sm:flex-wrap gap-2'} role="group" aria-label="Paid by">
          {IN_STORE_PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => onChange({ ...draft, paidBy: method })}
              aria-pressed={draft.paidBy === method}
              className={chipClass}
              style={chipStyle(draft.paidBy === method)}
            >
              {IN_STORE_PAYMENT_LABELS[method]}
            </button>
          ))}
        </div>
        {splitButton}
      </div>
    );
  }

  const amounts = salePaymentLineAmounts(draft, total);
  const last = draft.lines.length - 1;
  const allTyped = amounts.every((value) => value != null);
  const sum = round2(amounts.reduce<number>((acc, value) => acc + (value ?? 0), 0));
  const gap = total != null ? round2(total - sum) : null;
  const addsUp = total != null && allTyped && gap != null && Math.round(gap * 100) === 0;

  function patchLine(index: number, patch: Partial<SalePaymentLine>) {
    onChange({ ...draft, lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  }

  function removeLine(index: number) {
    const rest = draft.lines.filter((_, i) => i !== index);
    // Down to one line = one method again, the one left.
    if (rest.length < 2) onChange({ paidBy: rest[0]?.method ?? draft.paidBy, split: false, lines: [] });
    else onChange({ ...draft, lines: rest });
  }

  return (
    <div className="grid gap-3">
      {draft.lines.map((line, index) => {
        const auto = index === last && !line.typed;
        const shown = auto ? (amounts[index] != null ? (amounts[index] as number).toFixed(2) : '') : line.amount;
        return (
          <div key={line.key} className="grid grid-cols-[1.25rem_minmax(0,1.25fr)_minmax(0,1fr)_2.25rem] sm:grid-cols-[1.75rem_minmax(0,1.25fr)_minmax(0,1fr)_2.25rem] gap-2 items-end">
            <span className="pb-3 font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}>{index + 1}</span>
            <label className="block min-w-0">
              <span className="form-label" style={{ color: 'var(--color-primary)' }}>Method</span>
              <select className="form-field" value={line.method} onChange={(e) => patchLine(index, { method: e.target.value as InStorePaymentMethod })} aria-label={`Payment ${index + 1} method`}>
                {IN_STORE_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{IN_STORE_PAYMENT_LABELS[method]}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="form-label" style={{ color: 'var(--color-primary)' }}>{auto ? (compact ? 'The rest' : <><span className="hidden sm:inline">Amount · </span>The rest</>) : 'Amount'}</span>
              <input
                className="form-field"
                inputMode="decimal"
                value={shown}
                placeholder={auto ? 'the rest' : '500'}
                onChange={(e) => patchLine(index, { amount: e.target.value, typed: index === last ? e.target.value.trim() !== '' : line.typed })}
                aria-label={`Payment ${index + 1} amount`}
                style={auto && shown ? { background: '#fbf5dd', borderColor: 'var(--color-primary-container)' } : allTyped && !addsUp && total != null ? { borderColor: 'var(--color-error)' } : undefined}
              />
            </label>
            <button
              type="button"
              className="lift-icon h-11 w-9 rounded-[10px] border bg-white flex items-center justify-center"
              style={{ borderColor: 'var(--color-outline-variant)', color: 'var(--color-on-surface-variant)' }}
              onClick={() => removeLine(index)}
              aria-label={`Remove payment ${index + 1}`}
            >
              ✕
            </button>
          </div>
        );
      })}
      {draft.lines.length < SALE_PAYMENTS_MAX && (
        <button
          type="button"
          className="lift-tile justify-self-start rounded-full border border-dashed px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.06em] bg-white"
          style={{ fontFamily: 'var(--font-label)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          onClick={() => {
            // The line that was filling itself keeps the amount it showed, so the new last line starts at $0 left.
            const lines = draft.lines.map((line, index) => (index === last && !line.typed && amounts[index] != null
              ? { ...line, amount: (amounts[index] as number).toFixed(2), typed: true }
              : line));
            onChange({ ...draft, lines: [...lines, newLine('cash')] });
          }}
        >
          + Add another payment
        </button>
      )}
      {total != null && allTyped && (
        <div
          className="rounded-[10px] px-3 py-2.5 text-sm font-bold flex justify-between gap-3"
          role="status"
          style={addsUp
            ? { background: '#e8f3ec', color: '#16653c' }
            : { background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}
        >
          {addsUp ? (
            <><span>✓ {compact ? `Adds up to the ${totalWord}` : `Payments add up to the ${totalWord}`}</span><span>{formatCurrency(total)}</span></>
          ) : (
            <><span>{formatCurrency(Math.abs(gap ?? 0))} {(gap ?? 0) > 0 ? 'still to assign' : 'too much'}</span><span>{formatCurrency(sum)} of {formatCurrency(total)}</span></>
          )}
        </div>
      )}
      {total != null && !allTyped && draft.lines.length > 2 && (
        <span className="text-xs" style={hintStyle}>Type each amount; the last line fills with what is left.</span>
      )}
      <button
        type="button"
        className="justify-self-start text-xs underline"
        style={hintStyle}
        onClick={() => onChange({ paidBy: draft.lines[0]?.method ?? draft.paidBy, split: false, lines: [] })}
      >
        Back to one method
      </button>
    </div>
  );
}
