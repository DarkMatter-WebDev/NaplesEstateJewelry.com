'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import EmailCopyViewer from '@/components/admin/EmailCopyViewer';
import { copyTextToClipboard } from '@/lib/clipboard';
import { formatFollowUpTime, stepName } from '@/lib/follow-ups';
import type { FollowUpMessageRow, FollowUpPersonRow, PersonDetail } from '@/lib/follow-ups-server';
import { callJson, FOLLOW_UP_FROM_LINE, LABEL_CLASS, money, MUTED, shortDate, SMALL_BUTTON, StatusText, TypeChip } from './shared';
import { messageResult } from './status';

type Filter = 'all' | 'sellers' | 'buyers' | 'unsubscribed';

function personType(row: FollowUpPersonRow): 'seller' | 'buyer' | 'both' {
  if (row.isSeller && row.isBuyer) return 'both';
  return row.isSeller ? 'seller' : 'buyer';
}

function FollowUpCell({ row }: { row: FollowUpPersonRow }) {
  const f = row.followUp;
  if (f.kind === 'scheduled') return <StatusText tone="wait">● Scheduled {formatFollowUpTime(f.at)}</StatusText>;
  if (f.kind === 'waiting') return <StatusText tone="muted">◷ Waiting for pickup / delivery</StatusText>;
  if (f.kind === 'thanked') return <StatusText tone="ok">✓ Thanked {shortDate(f.at)}</StatusText>;
  if (f.kind === 'unsubscribed') return <StatusText tone="bad">Unsubscribed{f.at ? ` ${shortDate(f.at)}` : ''}</StatusText>;
  if (f.kind === 'stopped') return <StatusText tone="bad">Stopped by you</StatusText>;
  return <StatusText tone="muted">—</StatusText>;
}

export default function FollowUpPeople({
  people,
  adminBasePath,
  onChanged,
}: {
  people: FollowUpPersonRow[];
  adminBasePath: string;
  onChanged: (message: string, ok: boolean) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<FollowUpPersonRow | null>(null);

  const counts = useMemo(() => ({
    all: people.length,
    sellers: people.filter((row) => row.isSeller).length,
    buyers: people.filter((row) => row.isBuyer).length,
    unsubscribed: people.filter((row) => row.followUp.kind === 'unsubscribed' || row.followUp.kind === 'stopped').length,
  }), [people]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((row) => {
      if (filter === 'sellers' && !row.isSeller) return false;
      if (filter === 'buyers' && !row.isBuyer) return false;
      if (filter === 'unsubscribed' && row.followUp.kind !== 'unsubscribed' && row.followUp.kind !== 'stopped') return false;
      if (!q) return true;
      return row.email.includes(q) || (row.name ?? '').toLowerCase().includes(q) || (row.phone ?? '').includes(q);
    });
  }, [people, filter, query]);

  async function copySelected() {
    const emails = rows.filter((row) => selected.has(row.email)).map((row) => row.email);
    const copied = await copyTextToClipboard(emails.join(', '));
    onChanged(copied ? `Copied ${emails.length} email${emails.length === 1 ? '' : 's'}.` : 'Could not copy automatically.', copied);
  }

  const chip = (value: Filter, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className="rounded-full border px-3 py-1 text-xs transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      style={filter === value
        ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: '#fbf6e6', fontWeight: 600 }
        : { borderColor: 'var(--color-outline-variant)', color: '#555', background: 'white' }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: '#ece8de' }}>
        {chip('all', `All ${counts.all}`)}
        {chip('sellers', `Sellers ${counts.sellers}`)}
        {chip('buyers', `Buyers ${counts.buyers}`)}
        {chip('unsubscribed', `Unsubscribed ${counts.unsubscribed}`)}
        <input
          type="search"
          className="form-field ml-auto"
          style={{ maxWidth: 260, padding: '0.45rem 0.7rem' }}
          placeholder="Search name, email or phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search people"
        />
        <button type="button" className="outline-button" style={SMALL_BUTTON} disabled={selected.size === 0} onClick={() => void copySelected()}>
          Copy selected emails{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>

      <div className="responsive-table-wrap">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead style={{ background: 'var(--color-surface-container-low)' }}>
            <tr>
              <th className="px-4 py-3" style={{ width: '2.5rem' }}>
                <input
                  type="checkbox"
                  aria-label="Select everyone shown"
                  checked={rows.length > 0 && rows.every((row) => selected.has(row.email))}
                  onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.email)) : new Set())}
                  style={{ accentColor: 'var(--color-primary)', width: '1.05rem', height: '1.05rem' }}
                />
              </th>
              {['Name', 'Type', 'Email · Phone', 'Last visit', 'Sold to us', 'Bought from us', 'Language', 'Follow-up', ''].map((heading) => (
                <th key={heading} className={`px-4 py-3 ${LABEL_CLASS}`} style={{ ...MUTED, fontFamily: 'var(--font-label)' }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.email} className="border-t" style={{ borderColor: 'var(--color-outline-variant)', background: selected.has(row.email) ? 'color-mix(in srgb, var(--color-primary) 6%, transparent)' : undefined }}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.name || row.email}`}
                    checked={selected.has(row.email)}
                    onChange={() => setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(row.email)) next.delete(row.email);
                      else next.add(row.email);
                      return next;
                    })}
                    style={{ accentColor: 'var(--color-primary)', width: '1.05rem', height: '1.05rem' }}
                  />
                </td>
                <td className="px-4 py-3 font-semibold">{row.name || '—'}</td>
                <td className="px-4 py-3"><TypeChip type={personType(row)} /></td>
                <td className="px-4 py-3">{row.email}<div className="text-xs" style={MUTED}>{row.phone || '—'}</div></td>
                <td className="px-4 py-3" style={MUTED}>{shortDate(row.lastVisitAt)}</td>
                <td className="px-4 py-3" style={MUTED}>{row.sellerCount > 0 ? `${row.sellerCount} · ${money(row.sellerTotal)}` : '—'}</td>
                <td className="px-4 py-3" style={MUTED}>{row.buyerCount > 0 ? `${row.buyerCount} · ${money(row.buyerTotal)}` : '—'}</td>
                <td className="px-4 py-3" style={MUTED}>{row.language === 'es' ? 'Español' : 'English'}</td>
                <td className="px-4 py-3"><FollowUpCell row={row} /></td>
                <td className="px-4 py-3"><button type="button" className="outline-button" style={SMALL_BUTTON} onClick={() => setOpen(row)}>Open</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center" style={MUTED}>
                {people.length === 0 ? 'No one yet. Sellers appear here from buy receipts with an email, buyers from paid orders.' : 'No one matches.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-3 text-xs" style={{ ...MUTED, borderColor: '#ece8de' }}>
        No ID numbers, birth dates or ID photos here — those stay on the buy receipt.
      </p>

      {open && (
        <PersonModal
          person={open}
          adminBasePath={adminBasePath}
          onClose={() => setOpen(null)}
          onChanged={(message, ok) => {
            onChanged(message, ok);
          }}
        />
      )}
    </>
  );
}

function PersonModal({
  person,
  adminBasePath,
  onClose,
  onChanged,
}: {
  person: FollowUpPersonRow;
  adminBasePath: string;
  onClose: () => void;
  onChanged: (message: string, ok: boolean) => void;
}) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<FollowUpMessageRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/follow-ups/people?email=${encodeURIComponent(person.email)}`, { cache: 'no-store' }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as (PersonDetail & { error?: string }) | null;
      if (cancelled) return;
      if (!res?.ok || !data) setError(data?.error ?? 'Could not load this person.');
      else setDetail(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [person.email, reloadKey]);

  async function act(action: 'send_now' | 'stop' | 'resume') {
    if (action === 'stop' && !window.confirm(`Stop all follow-up emails to ${person.email}? Anything queued for them is called off.`)) return;
    setBusy(true);
    const { ok, data } = await callJson('/api/admin/follow-ups/people', { body: { email: person.email, action } });
    setBusy(false);
    const message = data.message ?? data.error ?? (ok ? 'Done.' : 'Something went wrong.');
    onChanged(action === 'stop' && ok ? `Follow-ups stopped for ${person.email}.` : action === 'resume' && ok ? `Follow-ups back on for ${person.email}.` : message, ok);
    setReloadKey((value) => value + 1);
  }

  const stopped = detail?.optOut?.kind === 'stopped';
  const unsubscribed = detail?.optOut?.kind === 'unsubscribed';

  return (
    <AdminModal title={person.name || person.email} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 px-4 py-4 text-sm">
        <p style={MUTED}>{person.email}{person.phone ? ` · ${person.phone}` : ''} · {person.language === 'es' ? 'Español' : 'English'}</p>
        {error && <p role="alert" className="font-semibold" style={{ color: 'var(--color-error)' }}>{error}</p>}
        {!detail && !error && <p style={MUTED}>Loading…</p>}
        {detail && (
          <>
            {unsubscribed && (
              <p className="rounded px-3 py-2" style={{ background: '#fdf1e7', color: '#8a3b12' }}>
                Unsubscribed{detail.optOut?.at ? ` ${shortDate(detail.optOut.at)}` : ''} — no follow-ups go to this address. Only they can sign up again.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="gold-button" style={SMALL_BUTTON} disabled={busy || unsubscribed || stopped} onClick={() => void act('send_now')}>
                Send a thank-you now
              </button>
              {stopped ? (
                <button type="button" className="outline-button" style={SMALL_BUTTON} disabled={busy} onClick={() => void act('resume')}>Turn follow-ups back on</button>
              ) : (
                <button type="button" className="outline-button social-danger-button" style={SMALL_BUTTON} disabled={busy || unsubscribed} onClick={() => void act('stop')}>
                  Stop all follow-ups for this person
                </button>
              )}
            </div>

            <section>
              <h3 className={`mb-2 ${LABEL_CLASS}`} style={MUTED}>Visits</h3>
              <ul className="divide-y rounded border" style={{ borderColor: 'var(--color-outline-variant)' }}>
                {detail.visits.map((visit) => (
                  <li key={`${visit.kind}-${visit.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <TypeChip type={visit.kind === 'receipt' ? 'seller' : 'buyer'} />{' '}
                      <Link className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--color-primary)' }}
                        href={visit.kind === 'receipt' ? `${adminBasePath}/buy-receipts/${visit.id}` : `${adminBasePath}/orders/${visit.id}`}>
                        {visit.ref ?? (visit.kind === 'receipt' ? 'Buy receipt' : 'Order')}
                      </Link>{' '}
                      <span style={MUTED}>· {shortDate(visit.at)} · {visit.note}</span>
                    </span>
                    <span className="font-semibold">{money(visit.amount)}</span>
                  </li>
                ))}
                {detail.visits.length === 0 && <li className="px-3 py-2" style={MUTED}>No visits found.</li>}
              </ul>
            </section>

            <section>
              <h3 className={`mb-2 ${LABEL_CLASS}`} style={MUTED}>Follow-ups</h3>
              <ul className="divide-y rounded border" style={{ borderColor: 'var(--color-outline-variant)' }}>
                {detail.messages.map((message) => {
                  const result = messageResult(message);
                  return (
                    <li key={message.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        Step {message.step} · {stepName(message.audience, message.step)} <span style={MUTED}>· {message.source_ref}</span>
                        <div><StatusText tone={result.tone}>{result.text}</StatusText></div>
                      </span>
                      <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={() => setViewing(message)}>
                        {message.status === 'sent' ? 'View copy' : 'Preview'}
                      </button>
                    </li>
                  );
                })}
                {detail.messages.length === 0 && <li className="px-3 py-2" style={MUTED}>None yet.</li>}
              </ul>
            </section>
          </>
        )}
      </div>
      {viewing && (
        <EmailCopyViewer
          title={`Step ${viewing.step} · ${stepName(viewing.audience, viewing.step)}`}
          url={`/api/admin/follow-ups/${viewing.id}`}
          to={viewing.email}
          subject={viewing.subject}
          sentLabel={viewing.status === 'sent' ? `${formatFollowUpTime(viewing.sent_at)} · ${viewing.sent_by_email ? `by ${viewing.sent_by_email}` : 'automatically'}` : 'Not sent — preview as it would go out now'}
          sentTerm={viewing.status === 'sent' ? 'Sent' : 'Status'}
          fromLine={FOLLOW_UP_FROM_LINE}
          onClose={() => setViewing(null)}
        />
      )}
    </AdminModal>
  );
}
