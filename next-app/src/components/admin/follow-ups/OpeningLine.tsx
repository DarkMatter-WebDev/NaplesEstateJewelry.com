'use client';

import { useState } from 'react';
import { OWNER_OPENING_MAX, openingLabel } from '@/lib/follow-up-opening';
import type { FollowUpMessageRow } from '@/lib/follow-ups-server';
import { callJson, MUTED, SMALL_BUTTON } from './shared';

/**
 * Upcoming → the thank-you's opening line (owner, 2026-11-25, mockup 1):
 * what the AI wrote for this person, with Edit (own words) · Rewrite (ask the
 * AI again) · Standard wording. Step-1 rows only. Before the SQL the line says
 * so and offers nothing.
 */
export default function OpeningLine({
  row,
  aiOn,
  ready,
  onChanged,
}: {
  row: FollowUpMessageRow;
  aiOn: boolean;
  ready: boolean;
  onChanged: (text: string, ok: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'save' | 'rewrite' | 'standard' | null>(null);

  if (row.step !== 1) return null;
  if (!ready) {
    return (
      <p className="text-xs" style={MUTED}>
        Opening line: standard wording · run <code>supabase/follow-ups-ai-openings-2026-11.sql</code> for the AI-written openings.
      </p>
    );
  }

  const custom = (row.opening_source === 'ai' || row.opening_source === 'owner') && row.opening ? row.opening : null;

  async function run(action: 'set_opening' | 'rewrite_opening' | 'standard_opening', label: 'save' | 'rewrite' | 'standard') {
    setBusy(label);
    const { ok, data } = await callJson<{ opening?: string }>(`/api/admin/follow-ups/${row.id}`, {
      body: action === 'set_opening' ? { action, text } : { action },
    });
    setBusy(null);
    if (!ok) {
      onChanged(data.error ?? 'Could not change the opening line.', false);
      return;
    }
    setEditing(false);
    const who = row.name || row.email;
    onChanged(
      label === 'save' ? `${who}: your opening line is saved.` : label === 'rewrite' ? `${who}: the AI wrote a new opening line.` : `${who}: the standard opening line will be used.`,
      true,
    );
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={MUTED}>
        Opening line · <span className="normal-case tracking-normal font-semibold">{openingLabel(row.opening_source, aiOn)}</span>
      </span>
      {editing ? (
        <>
          <textarea
            className="form-field"
            rows={3}
            maxLength={OWNER_OPENING_MAX}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label={`Opening line for ${row.name || row.email}`}
          />
          <span className="text-[11.5px]" style={MUTED}>
            Goes right after &ldquo;Hi {row.name?.split(/\s+/)[0] || 'there'},&rdquo;. You can write <code>{'{when}'}</code> for &ldquo;yesterday / on Monday&rdquo;.
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="gold-button" style={SMALL_BUTTON} disabled={busy !== null || !text.trim()} onClick={() => void run('set_opening', 'save')}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="outline-button" style={SMALL_BUTTON} disabled={busy !== null} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p
            className="rounded-[3px] px-3 py-2 text-[13.5px] leading-relaxed"
            style={custom
              ? { background: '#fbf1cf', border: '1px dashed #d9b84a', color: 'var(--color-on-surface)' }
              : { background: 'var(--color-surface-container-low)', border: '1px solid #ece8de', ...MUTED }}
          >
            {custom ?? (row.audience === 'seller'
              ? 'It was a pleasure meeting you {when}. Thank you for coming in and trusting us with your piece(s).'
              : 'Thank you for buying your {item} from us. I hope it’s everything you hoped for.')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="outline-button"
              style={SMALL_BUTTON}
              disabled={busy !== null || row.status === 'sending'}
              onClick={() => {
                setText(custom ?? '');
                setEditing(true);
              }}
            >
              Edit
            </button>
            {aiOn && (
              <button type="button" className="outline-button" style={SMALL_BUTTON} disabled={busy !== null || row.status === 'sending'} aria-busy={busy === 'rewrite'} onClick={() => void run('rewrite_opening', 'rewrite')}>
                {busy === 'rewrite' ? 'Writing…' : custom ? 'Rewrite' : 'Write it now'}
              </button>
            )}
            {row.opening_source !== 'standard' && (
              <button type="button" className="outline-button" style={{ ...SMALL_BUTTON, opacity: 0.85 }} disabled={busy !== null || row.status === 'sending'} onClick={() => void run('standard_opening', 'standard')}>
                {busy === 'standard' ? 'Saving…' : 'Use standard wording'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
