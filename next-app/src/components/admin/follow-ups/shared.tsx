'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { FollowUpAudience } from '@/lib/follow-ups';

/** Small pill buttons — `.gold-button` / `.outline-button` keep their hover lift; only the size changes. */
export const SMALL_BUTTON: CSSProperties = { padding: '0.42rem 0.85rem', fontSize: '0.6rem', letterSpacing: '0.1em' };

export const MUTED: CSSProperties = { color: 'var(--color-on-surface-variant)' };

export const LABEL_CLASS = 'text-[0.68rem] uppercase tracking-widest font-bold';

/** Sent as "Chris at Naples Estate Jewelry" from info@ (the Email Campaigns "chris" sender). */
export const FOLLOW_UP_FROM_LINE = 'Chris at Naples Estate Jewelry <info@naplesestatejewelry.com> · replies go to info@naplesestatejewelry.com';

export async function callJson<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; data: T & { error?: string; message?: string } }> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: 'Could not reach the server. Check the connection and try again.' } as T & { error?: string } };
  }
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 text-xs font-semibold disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: checked ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', cursor: disabled ? 'default' : 'pointer' }}
    >
      <span
        className="relative inline-block h-[21px] w-[38px] rounded-full transition-[background,box-shadow] duration-150 group-hover:shadow-[0_0_0_4px_rgba(115,92,0,0.12)] group-active:scale-95"
        style={{ background: checked ? 'var(--color-primary)' : '#cfcabc' }}
      >
        <span
          className="absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white shadow transition-[left] duration-150"
          style={{ left: checked ? 19 : 2 }}
        />
      </span>
      <span className="min-w-[1.5rem] text-left">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}

const TYPE_STYLE: Record<'seller' | 'buyer' | 'both', CSSProperties> = {
  seller: { background: '#f3ead0', color: '#6b5500' },
  buyer: { background: '#e3ecf6', color: '#29507a' },
  both: { background: '#ece4f3', color: '#5a3a78' },
};

export function TypeChip({ type }: { type: FollowUpAudience | 'both' }) {
  return (
    <span className="inline-block rounded-[3px] px-[7px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.08em]" style={TYPE_STYLE[type]}>
      {type === 'seller' ? 'Seller' : type === 'buyer' ? 'Buyer' : 'Both'}
    </span>
  );
}

export type Tone = 'wait' | 'ok' | 'muted' | 'bad';

const TONE_COLOR: Record<Tone, string> = { wait: '#8a6d00', ok: '#2f6b3a', muted: 'var(--color-on-surface-variant)', bad: 'var(--color-error)' };

export function StatusText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1.5 text-[12.5px] font-semibold" style={{ color: TONE_COLOR[tone] }}>
      {children}
    </span>
  );
}

export function Notice({ notice, onClose }: { notice: { text: string; ok: boolean } | null; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm"
      style={{
        background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
        color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)',
      }}
    >
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded px-1 font-bold transition-colors hover:bg-black/5">
        ✕
      </button>
    </div>
  );
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function shortDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value));
}
