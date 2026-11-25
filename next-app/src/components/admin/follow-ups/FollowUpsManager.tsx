'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import EmailCopyViewer from '@/components/admin/EmailCopyViewer';
import {
  FOLLOW_UP_DELAY_LABELS,
  FOLLOW_UP_DELAYS,
  FOLLOW_UP_STEP2_DAYS,
  formatFollowUpTime,
  stepName,
  type FollowUpAudience,
  type FollowUpDelay,
  type FollowUpSettings,
  type FollowUpStep,
} from '@/lib/follow-ups';
import type { FollowUpMessageRow, FollowUpsPageData } from '@/lib/follow-ups-server';
import ChangeTimeModal from './ChangeTimeModal';
import FollowUpEditor from './FollowUpEditor';
import FollowUpItemsModal from './FollowUpItemsModal';
import FollowUpPeople from './FollowUpPeople';
import OpeningLine from './OpeningLine';
import { callJson, FOLLOW_UP_FROM_LINE, LABEL_CLASS, MUTED, Notice, SMALL_BUTTON, StatusText, Switch, TypeChip } from './shared';
import { messageResult, upcomingStatus } from './status';

/**
 * Admin → Follow-ups (owner, 2026-11-24, mockup 1). Server data comes in as
 * props; every action calls the API and then `router.refresh()`, so the page
 * shows what the database now says (the page load also re-runs the reconcile).
 */

type Tab = 'upcoming' | 'log' | 'people';
type LogFilter = 'all' | 'sent' | 'clicked' | 'other';

type Viewing = { row: FollowUpMessageRow } | { preview: { audience: FollowUpAudience; step: FollowUpStep; language: 'en' | 'es' } };

export default function FollowUpsManager({ data, adminBasePath }: { data: FollowUpsPageData; adminBasePath: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [settings, setSettings] = useState<FollowUpSettings>(data.settings);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [audienceFilter, setAudienceFilter] = useState<'all' | FollowUpAudience>('all');
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(
    data.reconcileError ? { text: `Could not check for new receipts / orders: ${data.reconcileError}`, ok: false } : null,
  );
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [changing, setChanging] = useState<FollowUpMessageRow | null>(null);
  const [itemsFor, setItemsFor] = useState<FollowUpMessageRow | null>(null);
  const [editing, setEditing] = useState<FollowUpAudience | null>(null);

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function saveSettings(patch: Partial<FollowUpSettings>, message: string) {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSavingSettings(true);
    const { ok, data: result } = await callJson<{ settings?: FollowUpSettings }>('/api/admin/follow-ups/settings', { method: 'PATCH', body: patch });
    setSavingSettings(false);
    if (!ok || !result.settings) {
      setSettings(previous);
      setNotice({ text: result.error ?? 'Could not save.', ok: false });
      return;
    }
    setSettings(result.settings);
    setNotice({ text: message, ok: true });
    refresh();
  }

  async function act(row: FollowUpMessageRow, action: 'send_now' | 'skip' | 'unskip') {
    const who = row.name || row.email;
    if (action === 'send_now' && !window.confirm(`Send the ${stepName(row.audience, row.step).toLowerCase()} email to ${row.email} now?`)) return;
    setBusyId(row.id);
    const { ok, data: result } = await callJson(`/api/admin/follow-ups/${row.id}`, { body: { action } });
    setBusyId(null);
    if (!ok) {
      setNotice({ text: result.message ?? result.error ?? 'Something went wrong.', ok: false });
    } else {
      setNotice({
        text: action === 'send_now' ? (result.message ?? `Sent to ${row.email}.`) : action === 'skip' ? `${who}: skipped — it will not be sent.` : `${who}: back in the queue for the next 10 AM.`,
        ok: true,
      });
    }
    refresh();
  }

  const upcoming = useMemo(() => filterRows(data.upcoming, audienceFilter, query), [data.upcoming, audienceFilter, query]);
  const log = useMemo(() => {
    const rows = filterRows(data.log, audienceFilter, query);
    if (logFilter === 'sent') return rows.filter((row) => row.status === 'sent');
    if (logFilter === 'clicked') return rows.filter((row) => row.review_clicked_at);
    if (logFilter === 'other') return rows.filter((row) => row.status !== 'sent');
    return rows;
  }, [data.log, audienceFilter, logFilter, query]);

  const nextDue = data.upcoming
    .filter((row) => row.status === 'scheduled' && row.send_at && stepIsOn(settings, row))
    .map((row) => row.send_at as string)
    .sort()[0];
  const sentCount = data.log.filter((row) => row.status === 'sent').length;
  const clickedCount = data.log.filter((row) => row.review_clicked_at).length;

  return (
    <>
      <div className="mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.35em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
            Thank-you emails
          </p>
          <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Follow-ups</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-full border bg-white px-4 py-2 text-sm" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: settings.autoSend ? '#3c9a4f' : '#c0392b' }} aria-hidden />
          <b>{settings.autoSend ? 'Auto-send is on' : 'Paused — nothing is sent'}</b>
          {settings.autoSend && nextDue && <span style={MUTED}>· next email {formatFollowUpTime(nextDue)}</span>}
          <button
            type="button"
            className={settings.autoSend ? 'outline-button' : 'gold-button'}
            style={SMALL_BUTTON}
            disabled={savingSettings}
            onClick={() => void saveSettings({ autoSend: !settings.autoSend }, settings.autoSend ? 'Paused. Nothing goes out until you turn auto-send back on.' : 'Auto-send is back on.')}
          >
            {settings.autoSend ? 'Pause all' : 'Turn auto-send back on'}
          </button>
        </div>
      </div>
      <p className="mb-6 text-sm" style={MUTED}>
        A thank-you email to every seller and shop buyer who gave us their email — one per person every 90 days at most.
        {' '}{sentCount} sent{clickedCount > 0 ? ` · ${clickedCount} clicked the review link` : ''} in the log below.
      </p>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <SeriesCard
          audience="seller"
          title="Sellers"
          when="Starts when a buy receipt (or a Trade-in) is saved with an email"
          settings={settings}
          busy={savingSettings}
          onSave={saveSettings}
          onEdit={() => setEditing('seller')}
          onPreview={(language) => setViewing({ preview: { audience: 'seller', step: 1, language } })}
        />
        <SeriesCard
          audience="buyer"
          title="Shop buyers"
          when="Starts when an order is paid · eBay / Etsy sales are left out (no buyer email)"
          settings={settings}
          busy={savingSettings}
          onSave={saveSettings}
          onEdit={() => setEditing('buyer')}
          onPreview={(language) => setViewing({ preview: { audience: 'buyer', step: 1, language } })}
        />
        <p className="md:col-span-2 border-l-[3px] px-4 py-2.5 text-[12.5px]" style={{ ...MUTED, borderColor: 'var(--color-primary)', background: 'var(--color-surface-container-low)' }}>
          <b style={{ color: 'var(--color-on-surface)' }}>Never sends:</b> to anyone unsubscribed · for a voided receipt or a cancelled / refunded order · a second thank-you within 90 days · on Sunday (moves to Monday 10 AM) · anything while &ldquo;Pause all&rdquo; is on.
          Sent as &ldquo;Chris at Naples Estate Jewelry&rdquo;; replies land in info@.
        </p>
        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border bg-white px-5 py-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">AI-written opening lines</div>
            <div className="text-[12.5px]" style={MUTED}>
              {!data.openings.ready
                ? 'Run supabase/follow-ups-ai-openings-2026-11.sql in Supabase to turn this on. Until then every thank-you uses the standard opening line.'
                : !data.openings.aiConfigured
                  ? 'The AI is not set up on this server, so every thank-you uses the standard opening line.'
                  : 'The AI writes the first line of each thank-you from the receipt or order (and your "Note for the thank-you email"). The review request stays the same for everyone. Check or change each one in Upcoming.'}
            </div>
          </div>
          <Switch
            checked={settings.aiOpenings}
            disabled={savingSettings || !data.openings.ready}
            label="AI-written opening lines"
            onChange={(next) => void saveSettings({ aiOpenings: next }, next ? 'AI openings on: the AI writes the first line of each new thank-you.' : 'AI openings off: every thank-you uses the standard opening line.')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-1 border-b" style={{ borderColor: 'var(--color-outline-variant)' }} role="tablist">
        {([
          ['upcoming', 'Upcoming', data.upcoming.length],
          ['log', 'Sent log', data.log.length],
          ['people', 'People', data.people.length],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className="-mb-px border border-b-0 px-4 py-2.5 text-[13.5px] font-semibold transition-colors hover:text-[var(--color-primary)]"
            style={tab === value
              ? { background: 'white', borderColor: 'var(--color-outline-variant)', color: 'var(--color-primary)' }
              : { borderColor: 'transparent', color: 'var(--color-on-surface-variant)' }}
          >
            {label}
            <span className="ml-1.5 inline-block min-w-[18px] rounded-full px-1.5 text-center text-[11px]" style={{ background: 'var(--color-surface-container-low)', ...MUTED }}>{count}</span>
          </button>
        ))}
        {refreshing && <span className="ml-auto pb-2 text-xs" style={MUTED}>Updating…</span>}
      </div>

      <div className="border border-t-0 bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
        {tab !== 'people' && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: '#ece8de' }}>
            {(['all', 'seller', 'buyer'] as const).map((value) => (
              <FilterChip key={value} active={audienceFilter === value} onClick={() => setAudienceFilter(value)}>
                {value === 'all' ? 'All' : value === 'seller' ? 'Sellers' : 'Buyers'}
              </FilterChip>
            ))}
            {tab === 'log' && (
              <>
                <span className="mx-1 h-4 w-px" style={{ background: 'var(--color-outline-variant)' }} aria-hidden />
                {([['all', 'Everything'], ['sent', 'Sent'], ['clicked', 'Clicked review link'], ['other', 'Skipped / not sent']] as const).map(([value, label]) => (
                  <FilterChip key={value} active={logFilter === value} onClick={() => setLogFilter(value)}>{label}</FilterChip>
                ))}
              </>
            )}
            <input
              type="search"
              className="form-field ml-auto"
              style={{ maxWidth: 260, padding: '0.45rem 0.7rem' }}
              placeholder="Search name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search follow-ups"
            />
          </div>
        )}

        {tab === 'upcoming' && (
          <UpcomingList
            rows={upcoming}
            settings={settings}
            busyId={busyId}
            adminBasePath={adminBasePath}
            empty={data.upcoming.length === 0 ? 'Nothing queued. A thank-you appears here as soon as a buy receipt or a paid order with an email is saved.' : 'No one matches.'}
            onSendNow={(row) => void act(row, 'send_now')}
            onSkip={(row) => void act(row, 'skip')}
            onChangeTime={(row) => setChanging(row)}
            onPreview={(row) => setViewing({ row })}
            onViewItems={(row) => setItemsFor(row)}
            openings={{ ready: data.openings.ready, aiOn: settings.aiOpenings && data.openings.aiConfigured }}
            onOpeningChanged={(text, ok) => {
              setNotice({ text, ok });
              refresh();
            }}
          />
        )}

        {tab === 'log' && (
          <LogList
            rows={log}
            busyId={busyId}
            adminBasePath={adminBasePath}
            empty={data.log.length === 0 ? 'Nothing sent yet.' : 'No one matches.'}
            onView={(row) => setViewing({ row })}
            onUnskip={(row) => void act(row, 'unskip')}
            onRetry={(row) => void act(row, 'send_now')}
          />
        )}

        {tab === 'people' && (
          <FollowUpPeople
            people={data.people}
            adminBasePath={adminBasePath}
            onChanged={(text, ok) => {
              setNotice({ text, ok });
              refresh();
            }}
          />
        )}
      </div>

      {itemsFor && <FollowUpItemsModal row={itemsFor} adminBasePath={adminBasePath} onClose={() => setItemsFor(null)} />}
      {viewing && 'row' in viewing && (
        <EmailCopyViewer
          title={`Step ${viewing.row.step} · ${stepName(viewing.row.audience, viewing.row.step)}`}
          url={`/api/admin/follow-ups/${viewing.row.id}`}
          to={viewing.row.email}
          subject={viewing.row.status === 'sent' ? viewing.row.subject : null}
          sentLabel={viewing.row.status === 'sent'
            ? `${formatFollowUpTime(viewing.row.sent_at)} · ${viewing.row.sent_by_email ? `by ${viewing.row.sent_by_email}` : 'automatically'}`
            : viewing.row.status === 'scheduled'
              ? `${formatFollowUpTime(viewing.row.send_at)} — preview of how it will look`
              : 'Not sent — preview as it would go out now'}
          sentTerm={viewing.row.status === 'sent' ? 'Sent' : viewing.row.status === 'scheduled' ? 'Sends' : 'Status'}
          fromLine={FOLLOW_UP_FROM_LINE}
          onClose={() => setViewing(null)}
        />
      )}
      {viewing && 'preview' in viewing && (
        <EmailCopyViewer
          title={`Preview — ${stepName(viewing.preview.audience, viewing.preview.step)} · ${viewing.preview.language === 'es' ? 'Español' : 'English'}`}
          url={`/api/admin/follow-ups/preview?audience=${viewing.preview.audience}&step=${viewing.preview.step}&language=${viewing.preview.language}`}
          to={viewing.preview.audience === 'seller' ? 'Margaret Ellison (sample)' : 'Linda Park (sample)'}
          subject={null}
          sentLabel="Sample with made-up details"
          sentTerm="Note"
          fromLine={FOLLOW_UP_FROM_LINE}
          onClose={() => setViewing(null)}
        />
      )}
      {changing && (
        <ChangeTimeModal
          id={changing.id}
          who={changing.name || changing.email}
          current={changing.send_at}
          onClose={() => setChanging(null)}
          onDone={(message) => {
            setChanging(null);
            setNotice({ text: message, ok: true });
            refresh();
          }}
        />
      )}
      {editing && (
        <FollowUpEditor
          audience={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={(next, message) => {
            setSettings(next);
            setNotice({ text: message, ok: true });
          }}
        />
      )}
    </>
  );
}

function stepIsOn(settings: FollowUpSettings, row: FollowUpMessageRow): boolean {
  if (row.audience === 'seller') return row.step === 1 ? settings.sellerStep1 : settings.sellerStep2;
  return row.step === 1 ? settings.buyerStep1 : settings.buyerStep2;
}

function filterRows(rows: FollowUpMessageRow[], audience: 'all' | FollowUpAudience, query: string) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (audience !== 'all' && row.audience !== audience) return false;
    if (!q) return true;
    return row.email.includes(q) || (row.name ?? '').toLowerCase().includes(q) || (row.source_ref ?? '').toLowerCase().includes(q);
  });
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full border px-3 py-1 text-xs transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      style={active
        ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: '#fbf6e6', fontWeight: 600 }
        : { borderColor: 'var(--color-outline-variant)', color: '#555', background: 'white' }}
    >
      {children}
    </button>
  );
}

function SeriesCard({
  audience,
  title,
  when,
  settings,
  busy,
  onSave,
  onEdit,
  onPreview,
}: {
  audience: FollowUpAudience;
  title: string;
  when: string;
  settings: FollowUpSettings;
  busy: boolean;
  onSave: (patch: Partial<FollowUpSettings>, message: string) => Promise<void>;
  onEdit: () => void;
  onPreview: (language: 'en' | 'es') => void;
}) {
  const step1Key = audience === 'seller' ? 'sellerStep1' : 'buyerStep1';
  const step2Key = audience === 'seller' ? 'sellerStep2' : 'buyerStep2';
  const delayKey = audience === 'seller' ? 'sellerDelay' : 'buyerDelay';
  const step1On = settings[step1Key];
  const step2On = settings[step2Key];
  const delay = settings[delayKey];
  const step1Detail = audience === 'seller'
    ? `${FOLLOW_UP_DELAY_LABELS[delay]} · a personal opening line, then the review request`
    : `Pickup / in-store: ${FOLLOW_UP_DELAY_LABELS[delay].toLowerCase()} · Shipped: counted from the carrier's "Delivered"`;
  const step2Detail = audience === 'seller'
    ? `About 6 months after the thank-you · no review ask · only if they haven't sold to us since`
    : `${FOLLOW_UP_STEP2_DAYS.buyer} days after the thank-you · how to clean and store it · no review ask`;

  return (
    <section className="border bg-white px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <h2 className="text-xl" style={{ fontFamily: 'var(--font-headline)' }}>{title}</h2>
      <p className="mb-3 text-[12.5px]" style={MUTED}>{when}</p>

      <StepRow
        n={1}
        title={stepName(audience, 1)}
        detail={step1Detail}
        on={step1On}
        busy={busy}
        onToggle={(next) => void onSave({ [step1Key]: next }, `${title}: thank-you ${next ? 'on' : 'off'}.`)}
      >
        <label className="mt-1.5 inline-flex items-center gap-2 text-[12.5px]" style={MUTED}>
          Send
          <select
            className="form-field"
            style={{ padding: '0.25rem 0.5rem', width: 'auto', fontSize: '0.8rem' }}
            value={delay}
            disabled={busy}
            onChange={(event) => void onSave({ [delayKey]: event.target.value as FollowUpDelay }, `${title}: thank-you now goes ${FOLLOW_UP_DELAY_LABELS[event.target.value as FollowUpDelay].toLowerCase()}.`)}
          >
            {FOLLOW_UP_DELAYS.map((value) => <option key={value} value={value}>{FOLLOW_UP_DELAY_LABELS[value]}</option>)}
          </select>
        </label>
      </StepRow>
      <StepRow
        n={2}
        title={stepName(audience, 2)}
        detail={step2Detail}
        on={step2On}
        busy={busy}
        onToggle={(next) => void onSave({ [step2Key]: next }, `${title}: step 2 ${next ? 'on — it is queued for people thanked in the right window' : 'off'}.`)}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={onEdit}>Edit emails</button>
        <button type="button" className="outline-button" style={{ ...SMALL_BUTTON, opacity: 0.85 }} onClick={() => onPreview('en')}>Preview · English</button>
        <button type="button" className="outline-button" style={{ ...SMALL_BUTTON, opacity: 0.85 }} onClick={() => onPreview('es')}>Preview · Español</button>
      </div>
    </section>
  );
}

function StepRow({
  n,
  title,
  detail,
  on,
  busy,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  detail: string;
  on: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[26px_1fr_auto] items-start gap-3 border-t py-3" style={{ borderColor: '#ece8de' }}>
      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', opacity: on ? 1 : 0.55 }}>{n}</span>
      <div style={{ opacity: on ? 1 : 0.7 }}>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[12.5px]" style={MUTED}>{detail}</div>
        {children}
      </div>
      <Switch checked={on} onChange={onToggle} disabled={busy} label={`Step ${n}: ${title}`} />
    </div>
  );
}

function sourceLink(row: FollowUpMessageRow, adminBasePath: string) {
  const href = row.source_type === 'buy_receipt' ? `${adminBasePath}/buy-receipts/${row.source_id}` : `${adminBasePath}/orders/${row.source_id}`;
  return (
    <Link href={href} className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--color-primary)' }}>
      {row.source_ref ?? (row.source_type === 'buy_receipt' ? 'Buy receipt' : 'Order')}
    </Link>
  );
}

function UpcomingList({
  rows,
  settings,
  busyId,
  adminBasePath,
  empty,
  onSendNow,
  onSkip,
  onChangeTime,
  onPreview,
  onViewItems,
  openings,
  onOpeningChanged,
}: {
  rows: FollowUpMessageRow[];
  settings: FollowUpSettings;
  busyId: string | null;
  adminBasePath: string;
  empty: string;
  onSendNow: (row: FollowUpMessageRow) => void;
  onSkip: (row: FollowUpMessageRow) => void;
  onChangeTime: (row: FollowUpMessageRow) => void;
  onPreview: (row: FollowUpMessageRow) => void;
  /** "View items" — the original receipt / order lines in a pop-up (2026-11-25). */
  onViewItems: (row: FollowUpMessageRow) => void;
  openings: { ready: boolean; aiOn: boolean };
  onOpeningChanged: (text: string, ok: boolean) => void;
}) {
  if (rows.length === 0) return <p className="px-4 py-12 text-center text-sm" style={MUTED}>{empty}</p>;
  return (
    <ul className="divide-y" style={{ borderColor: '#ece8de' }}>
      {rows.map((row) => {
        const status = upcomingStatus(row, settings);
        const busy = busyId === row.id;
        return (
          <li key={row.id} className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm md:grid-cols-[1.3fr_0.55fr_1.2fr_0.9fr_1.4fr_23rem] md:items-start" style={{ borderColor: '#ece8de' }}>
            <div>
              <div className="font-semibold">{row.name || '—'}</div>
              <div className="text-xs break-all" style={MUTED}>{row.email}</div>
            </div>
            <div className="justify-self-end md:justify-self-auto"><TypeChip type={row.audience} /></div>
            <div>
              {sourceLink(row, adminBasePath)}
              <div className="text-xs" style={MUTED}>{row.source_note}</div>
              <button type="button" className="outline-button mt-1.5" style={SMALL_BUTTON} onClick={() => onViewItems(row)} aria-label={`View items on ${row.source_ref ?? (row.source_type === 'buy_receipt' ? 'the buy receipt' : 'the order')}`}>
                View items
              </button>
            </div>
            <div>
              Step {row.step} · {row.step === 1 ? 'Thank you' : row.audience === 'seller' ? 'Ready again' : 'Care tips'}
              <div className="text-xs" style={MUTED}>{row.language === 'es' ? 'Español' : 'English'}</div>
            </div>
            <div className="col-span-2 md:col-span-1"><StatusText tone={status.tone}>{status.text}</StatusText></div>
            <div className="col-span-2 flex flex-wrap gap-1.5 md:col-span-1 md:justify-end">
              <button type="button" className="gold-button" style={SMALL_BUTTON} disabled={busy || row.status === 'sending'} aria-busy={busy} onClick={() => onSendNow(row)}>
                {busy ? 'Working…' : 'Send now'}
              </button>
              {row.status === 'scheduled' && (
                <button type="button" className="outline-button" style={SMALL_BUTTON} disabled={busy} onClick={() => onChangeTime(row)}>Change time</button>
              )}
              <button type="button" className="outline-button" style={{ ...SMALL_BUTTON, opacity: 0.85 }} onClick={() => onPreview(row)}>Preview</button>
              <button type="button" className="outline-button social-danger-button" style={SMALL_BUTTON} disabled={busy || row.status === 'sending'} onClick={() => onSkip(row)}>Skip</button>
            </div>
            {row.step === 1 && (
              <div className="col-span-2 md:col-span-6 md:max-w-[52rem]">
                <OpeningLine row={row} aiOn={openings.aiOn} ready={openings.ready} onChanged={onOpeningChanged} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LogList({
  rows,
  busyId,
  adminBasePath,
  empty,
  onView,
  onUnskip,
  onRetry,
}: {
  rows: FollowUpMessageRow[];
  busyId: string | null;
  adminBasePath: string;
  empty: string;
  onView: (row: FollowUpMessageRow) => void;
  onUnskip: (row: FollowUpMessageRow) => void;
  onRetry: (row: FollowUpMessageRow) => void;
}) {
  if (rows.length === 0) return <p className="px-4 py-12 text-center text-sm" style={MUTED}>{empty}</p>;
  return (
    <ul className="divide-y" style={{ borderColor: '#ece8de' }}>
      <li className={`hidden px-4 py-2.5 md:grid md:grid-cols-[1fr_1.4fr_0.6fr_1.3fr_2fr_7rem] md:gap-4 ${LABEL_CLASS}`} style={{ ...MUTED, background: 'var(--color-surface-container-low)', fontFamily: 'var(--font-label)' }}>
        <span>When</span><span>Person</span><span>Type</span><span>Email</span><span>Result</span><span />
      </li>
      {rows.map((row) => {
        const result = messageResult(row);
        const busy = busyId === row.id;
        return (
          <li key={row.id} className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-sm md:grid-cols-[1fr_1.4fr_0.6fr_1.3fr_2fr_7rem] md:items-start" style={{ borderColor: '#ece8de' }}>
            <div className="col-span-2 text-xs md:col-span-1 md:text-sm" style={MUTED}>{formatFollowUpTime(row.sent_at ?? row.updated_at)}</div>
            <div>
              <div className="font-semibold">{row.name || '—'}</div>
              <div className="text-xs break-all" style={MUTED}>{row.email}</div>
            </div>
            <div className="justify-self-end md:justify-self-auto"><TypeChip type={row.audience} /></div>
            <div className="col-span-2 md:col-span-1">
              Step {row.step} · {row.step === 1 ? 'Thank you' : row.audience === 'seller' ? 'Ready again' : 'Care tips'} · {row.language === 'es' ? 'Español' : 'English'}
              <div className="text-xs">{sourceLink(row, adminBasePath)}</div>
            </div>
            <div className="col-span-2 md:col-span-1"><StatusText tone={result.tone}>{result.text}</StatusText></div>
            <div className="col-span-2 flex flex-wrap gap-1.5 md:col-span-1 md:justify-end">
              {row.status === 'sent' && <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={() => onView(row)}>View copy</button>}
              {row.status === 'skipped' && <button type="button" className="outline-button" style={SMALL_BUTTON} disabled={busy} onClick={() => onUnskip(row)}>Put back</button>}
              {row.status === 'failed' && <button type="button" className="gold-button" style={SMALL_BUTTON} disabled={busy} onClick={() => onRetry(row)}>Try again</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
