'use client';

import type { FormEvent } from 'react';
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_SUBSCRIBER_SORT,
  nextSubscriberSort,
  sortSubscriberRows,
  subscriberRowKey,
  subscriberSourceLabel,
  type SubscriberRow,
  type SubscriberSortKey,
} from '@/lib/subscriber-sort';
import {
  ADMIN_SMS_CONSENT_LABEL,
  formatUsPhone,
  normalizeUsPhone,
  smsStatusLabel,
  subscriberChannelLabel,
  type SmsStatus,
} from '@/lib/subscriber-phone';

export type { SubscriberRow } from '@/lib/subscriber-sort';

// Add Subscriber takes a mobile number too since 2026-11-02 (customers who ask
// the shop to add them to text deals). The tick box is never pre-ticked.
const EMPTY_ADD_FORM = { email: '', name: '', phone: '', smsConsent: false };

type AddResult = {
  phoneSaved?: boolean;
  smsStatus?: SmsStatus | null;
  confirmation?: 'sent' | 'not_configured' | 'not_pending' | 'failed' | null;
  confirmationError?: string | null;
} | null;

/** What the owner is told after an add or an edit: above all, whether the "reply YES" text went out. */
function addedNotice({ who, typedPhone, result, verb = 'added' }: { who: string; typedPhone: string; result: AddResult; verb?: string }) {
  if (!typedPhone) return { text: 'Subscriber added.', ok: true };
  const number = formatUsPhone(normalizeUsPhone(typedPhone));
  if (!result?.phoneSaved) {
    return { text: `${who} ${verb}. ${number} is already on the list under another entry, so it was left there.`, ok: false };
  }
  if (result.smsStatus === 'confirmed') {
    return { text: `${who} ${verb}. ${number} already replied YES, so no new text was sent.`, ok: true };
  }
  switch (result.confirmation) {
    case 'sent':
      return { text: `${who} ${verb}. "Reply YES" text sent to ${number}. It shows as Pending YES until they answer.`, ok: true };
    case 'not_configured':
      return { text: `${who} ${verb}. Texting is not set up here, so no "Reply YES" text was sent.`, ok: false };
    case 'failed':
      return { text: `${who} ${verb}, but the "Reply YES" text did not go out: ${(result.confirmationError || 'send failed').replace(/\.$/, '')}.`, ok: false };
    default:
      return { text: `${who} ${verb}.`, ok: true };
  }
}

// Edit + Combine (2026-11-02): a row's own fields as the API returns them.
type SavedRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  smsStatus: SmsStatus | null;
  subscribedAt: string | null;
};

/** The other entry that already has the typed email or number, and whether the two can become one. */
type CombineOffer = { other: SavedRow; field: 'email' | 'phone'; canCombine: boolean; reason: string | null };

/** What changed in the Edit box; `email` / `phone` are only sent to the API when changed. */
function editChanges(row: SubscriberRow, form: typeof EMPTY_ADD_FORM) {
  const email = form.email.trim().toLowerCase();
  const phone = form.phone.trim();
  const emailChanged = email !== (row.email || '');
  const phoneChanged = phone ? normalizeUsPhone(phone) !== row.phone : Boolean(row.phone);
  return { email, phone, emailChanged, phoneChanged, newPhone: Boolean(phone) && phoneChanged };
}

// Column headers; a `sortKey` makes the header a sort button (lib/subscriber-sort.ts).
// Phone + Alerts since 2026-09-15: the "Join the List" window can sign a
// visitor up for text deals, with or without an email.
const COLUMNS: { label: string; sortKey: SubscriberSortKey | null }[] = [
  { label: 'Name', sortKey: 'name' },
  { label: 'Email', sortKey: 'email' },
  { label: 'Phone', sortKey: 'phone' },
  { label: 'Alerts', sortKey: 'alerts' },
  { label: 'Source', sortKey: 'source' },
  { label: 'Subscribed', sortKey: 'subscribed' },
  { label: 'Actions', sortKey: null },
];

// The Alerts column: which channel the row is on, then where the number stands.
const STATUS_COLORS: Record<string, string> = {
  confirmed: '#2f6b3a',
  pending: '#8a5a00',
  stopped: 'var(--color-error)',
};

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.12em]"
      style={{ color, borderColor: color, fontFamily: 'var(--font-label)' }}
    >
      {children}
    </span>
  );
}

type Notice = { text: string; ok: boolean };

function NoticeBox({ notice, className }: { notice: Notice; className: string }) {
  return (
    <div
      className={`${className} rounded-lg px-3 py-2 text-sm`}
      role="status"
      style={{
        background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
        color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)',
      }}
    >
      {notice.text}
    </div>
  );
}

// Pinned to Eastern so the server render and the owner's browser agree (a
// hydration mismatch otherwise) and so the time reads as the showroom's clock,
// not the Netlify region's.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
});

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

/**
 * The box under a row being edited: Name, Email, Mobile number, the text
 * deals tick (only for a new number), and — when the typed email or number is
 * already on another entry — the Combine offer (owner, 2026-11-02).
 */
function EditBox({
  row,
  form,
  onChange,
  combineOffer,
  notice,
  saving,
  onSave,
  onCombine,
  onCancel,
  onDismissOffer,
}: {
  row: SubscriberRow;
  form: typeof EMPTY_ADD_FORM;
  onChange: (patch: Partial<typeof EMPTY_ADD_FORM>) => void;
  combineOffer: CombineOffer | null;
  notice: Notice | null;
  saving: boolean;
  onSave: () => void;
  onCombine: (otherId: string) => void;
  onCancel: () => void;
  onDismissOffer: () => void;
}) {
  const { newPhone } = editChanges(row, form);
  const other = combineOffer?.other;
  // What the one entry will hold: each field from whichever entry has it.
  const combinedName = form.name.trim() || row.name || other?.name || '';
  const combinedEmail = row.email || other?.email || '';
  const combinedPhone = row.phone || other?.phone || null;
  const combinedStatus = row.phone ? row.smsStatus : (other?.smsStatus ?? null);
  const typedValue = combineOffer?.field === 'email' ? form.email.trim().toLowerCase() : formatUsPhone(normalizeUsPhone(form.phone));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!combineOffer?.canCombine) onSave();
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr] md:items-end">
        <label>
          <span className="form-label">Name</span>
          <input className="form-field mt-2 w-full" value={form.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label>
          <span className="form-label">Email</span>
          <input
            className="form-field mt-2 w-full"
            type="email"
            value={form.email}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="customer@example.com"
          />
        </label>
        <label>
          <span className="form-label">Mobile number (for text deals)</span>
          <input
            className="form-field mt-2 w-full"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="(239) 555-0123"
          />
        </label>
      </div>

      {newPhone && !combineOffer && (
        <label
          className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-3.5 py-3"
          style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)' }}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer"
            style={{ accentColor: 'var(--color-primary)' }}
            checked={form.smsConsent}
            onChange={(event) => onChange({ smsConsent: event.target.checked })}
          />
          <span>
            <span className="block text-sm font-bold" style={{ color: 'var(--color-on-surface)' }}>
              {ADMIN_SMS_CONSENT_LABEL}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
              They get the &ldquo;Reply YES&rdquo; text right away. Deals only go to them after they reply YES.
            </span>
          </span>
        </label>
      )}

      {combineOffer && other && (
        <div className="mt-3 rounded-xl border-[1.5px] px-4 py-3 text-sm" style={{ borderColor: '#8a5a00', background: '#fffaf0', color: 'var(--color-on-surface)' }}>
          <p>
            <b>{typedValue} is already on another entry:</b>{' '}
            {[
              other.name ? `"${other.name}"` : null,
              [subscriberChannelLabel({ email: other.email, phone: other.phone }), other.phone ? smsStatusLabel(other.smsStatus) : '']
                .filter(Boolean)
                .join(' · '),
              formatDate(other.subscribedAt) ? `joined ${formatDate(other.subscribedAt)}` : null,
            ].filter(Boolean).join(', ')}.
          </p>
          {combineOffer.canCombine ? (
            <>
              <p className="mt-1">Combine the two into one?</p>
              <ul className="mt-1.5 list-disc pl-5 text-[0.82rem] leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                <li>One entry: {[combinedName, combinedEmail, formatUsPhone(combinedPhone)].filter(Boolean).join(', ')}</li>
                {combinedPhone && (
                  <li>
                    The number stays {smsStatusLabel(combinedStatus) || 'as it is'}.{' '}
                    {combinedStatus === 'confirmed' ? 'They already replied YES, so no new text is sent.' : 'No new text is sent.'}
                  </li>
                )}
                <li>Their text history (deals sent, their replies) moves with it. The other entry is removed.</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="gold-button text-xs" onClick={() => onCombine(other.id)} disabled={saving}>
                  {saving ? 'Combining...' : 'Combine'}
                </button>
                <button type="button" className="outline-button text-xs" onClick={onDismissOffer} disabled={saving}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1" style={{ color: 'var(--color-error)' }}>{combineOffer.reason}</p>
          )}
        </div>
      )}

      {notice && <NoticeBox notice={notice} className="mt-3" />}

      {!(combineOffer?.canCombine) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="gold-button text-xs" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="outline-button text-xs" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

export default function SubscribersManager({ initialRows }: { initialRows: SubscriberRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  // router.refresh() hands down fresh rows; take them, so the table always
  // ends on what the database holds (a combine can touch two lines).
  const [syncedRows, setSyncedRows] = useState(initialRows);
  if (initialRows !== syncedRows) {
    setSyncedRows(initialRows);
    setRows(initialRows);
  }
  // Edit opens a box under the row (by row id, so text-only rows edit too).
  const [editing, setEditing] = useState<SubscriberRow | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_ADD_FORM);
  const [saving, setSaving] = useState(false);
  const [editNotice, setEditNotice] = useState<Notice | null>(null);
  const [combineOffer, setCombineOffer] = useState<CombineOffer | null>(null);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [adding, setAdding] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Add Subscriber's own message, shown inside its box (whether the "reply YES" text went out).
  const [addNotice, setAddNotice] = useState<Notice | null>(null);
  const [sort, setSort] = useState(DEFAULT_SUBSCRIBER_SORT);
  const [textOnly, setTextOnly] = useState(false);

  const sortedRows = useMemo(() => sortSubscriberRows(rows, sort), [rows, sort]);
  const visibleRows = useMemo(() => (textOnly ? sortedRows.filter((row) => row.phone) : sortedRows), [sortedRows, textOnly]);
  // "Copy All Emails" follows the visible order so a pasted list reads like the table.
  const emailList = useMemo(() => sortedRows.filter((row) => row.email).map((row) => row.email).join(', '), [sortedRows]);
  // Only numbers that replied YES are ever texted, so only those are copied.
  const confirmedNumbers = useMemo(
    () => sortedRows.filter((row) => row.phone && row.smsStatus === 'confirmed').map((row) => formatUsPhone(row.phone)),
    [sortedRows],
  );
  const emailCount = useMemo(() => rows.filter((row) => row.email).length, [rows]);
  const textCount = useMemo(() => rows.filter((row) => row.phone).length, [rows]);

  function beginEdit(row: SubscriberRow) {
    setEditing(row);
    setEditForm({ name: row.name ?? '', email: row.email, phone: formatUsPhone(row.phone), smsConsent: false });
    setEditNotice(null);
    setCombineOffer(null);
    setNotice(null);
  }

  function cancelEdit() {
    setEditing(null);
    setEditForm(EMPTY_ADD_FORM);
    setEditNotice(null);
    setCombineOffer(null);
  }

  // Any change to the boxes withdraws an open Combine offer — it was for the old value.
  function changeEdit(patch: Partial<typeof EMPTY_ADD_FORM>) {
    setEditForm((current) => ({ ...current, ...patch }));
    setCombineOffer(null);
    setEditNotice(null);
  }

  async function addSubscriber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding) return;

    const normalizedEmail = addForm.email.trim().toLowerCase();
    const trimmedName = addForm.name.trim();
    const typedPhone = addForm.phone.trim();
    if (!normalizedEmail && !typedPhone) {
      setAddNotice({ text: 'Enter an email or a mobile number.', ok: false });
      return;
    }
    // The number is only for text deals, so it needs the tick (never pre-ticked).
    if (typedPhone && !addForm.smsConsent) {
      setAddNotice({ text: `Tick "${ADMIN_SMS_CONSENT_LABEL}" to add the number.`, ok: false });
      return;
    }

    setAdding(true);
    setAddNotice(null);
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          fullName: trimmedName,
          phone: typedPhone,
          smsConsent: Boolean(typedPhone) && addForm.smsConsent,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not add subscriber.');

      const phone = typedPhone && data?.phoneSaved ? normalizeUsPhone(typedPhone) : null;
      const smsStatus: SmsStatus | null = phone ? (data?.smsStatus ?? 'pending') : null;

      setRows((current) => {
        // The server matches by email first, then by number — so does this.
        const existing = (normalizedEmail
          ? current.find((row) => row.email === normalizedEmail || row.subscriberEmail === normalizedEmail)
          : undefined) ?? (phone ? current.find((row) => row.phone === phone) : undefined);
        if (existing) {
          return current.map((row) => {
            if (row !== existing) return row;
            const email = normalizedEmail || row.subscriberEmail;
            return {
              ...row,
              email: row.source === 'account' ? row.email : (normalizedEmail || row.email),
              name: trimmedName || row.name,
              source: row.source === 'account' ? 'both' : row.source,
              subscriberSource: 'admin_manual',
              subscriberEmail: email,
              subscribedAt: new Date().toISOString(),
              phone: phone ?? row.phone,
              smsStatus: phone ? smsStatus : row.smsStatus,
            };
          });
        }
        return [
          {
            subscriberId: typeof data?.id === 'string' ? data.id : null,
            email: normalizedEmail,
            name: trimmedName || null,
            source: 'subscriber',
            subscriberSource: 'admin_manual',
            subscriberEmail: normalizedEmail || null,
            subscribedAt: new Date().toISOString(),
            accountCreatedAt: null,
            phone,
            smsStatus,
          },
          ...current,
        ];
      });
      setAddForm(EMPTY_ADD_FORM);
      setAddNotice(addedNotice({
        who: trimmedName || normalizedEmail || formatUsPhone(normalizeUsPhone(typedPhone)),
        typedPhone,
        result: data,
      }));
      router.refresh();
    } catch (err) {
      setAddNotice({ text: err instanceof Error ? err.message : 'Could not add subscriber.', ok: false });
    } finally {
      setAdding(false);
    }
  }

  /**
   * Save the Edit box, or — with `combineWithId` — combine this row with the
   * other entry the API pointed at. A typed email or number that is already
   * on another entry comes back as a Combine offer instead of an error.
   */
  async function saveEdit(combineWithId?: string) {
    const row = editing;
    if (!row?.subscriberId || saving) return;
    const changes = editChanges(row, editForm);
    if (!changes.email && !changes.phone) {
      setEditNotice({ text: 'Keep an email or a mobile number. To remove the entry, use Delete.', ok: false });
      return;
    }
    // No tick check here: the API first looks for the number on another entry
    // (a Combine offer needs no tick), then asks for the tick.
    if (!combineWithId) {
      if (changes.emailChanged && !changes.email && !window.confirm(`Take ${row.email} off the email list?`)) return;
      if (changes.phoneChanged && !changes.phone && !window.confirm(`Take ${formatUsPhone(row.phone)} off the text list?`)) return;
    }

    setSaving(true);
    setEditNotice(null);
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.subscriberId,
          fullName: editForm.name.trim(),
          ...(changes.emailChanged ? { email: changes.email } : {}),
          ...(changes.phoneChanged ? { phone: changes.phone, smsConsent: editForm.smsConsent } : {}),
          ...(combineWithId ? { combineWithId } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.combine) {
        setCombineOffer({ other: data.combine, field: data.field, canCombine: Boolean(data.canCombine), reason: data.reason ?? null });
        return;
      }
      if (!res.ok) throw new Error(data?.error || 'Could not update subscriber.');

      const saved = data.row as SavedRow;
      const removedId = typeof data.removedId === 'string' ? data.removedId : null;
      setRows((current) => current
        .filter((item) => !removedId || item.subscriberId !== removedId)
        .map((item) => (item.subscriberId === row.subscriberId
          ? {
              ...item,
              name: saved.name,
              email: saved.email ?? (item.source === 'subscriber' ? '' : item.email),
              subscriberEmail: saved.email,
              phone: saved.phone,
              smsStatus: saved.smsStatus,
            }
          : item)));
      cancelEdit();
      const who = saved.name || saved.email || formatUsPhone(saved.phone);
      if (data.combined) {
        const status = smsStatusLabel(saved.smsStatus);
        setNotice({ text: `Combined into one entry: ${who}.${saved.phone && status ? ` ${formatUsPhone(saved.phone)} stays ${status}.` : ''}`, ok: true });
      } else if (changes.newPhone) {
        setNotice(addedNotice({ who, typedPhone: changes.phone, result: { phoneSaved: true, ...data, smsStatus: saved.smsStatus }, verb: 'updated' }));
      } else {
        setNotice({ text: 'Subscriber updated.', ok: true });
      }
      router.refresh();
    } catch (err) {
      setEditNotice({ text: err instanceof Error ? err.message : 'Could not update subscriber.', ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: SubscriberRow) {
    // By the row's id: an email row takes its number with it, a text-only row has only the number.
    const id = row.subscriberId;
    if (!id) return;
    const who = row.subscriberEmail || row.email || formatUsPhone(row.phone);
    const confirmed = window.confirm(`Delete ${who} from subscribers? Account-holder records will not be deleted.`);
    if (!confirmed) return;

    setBusyEmail(id);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not delete subscriber.');

      if (editing?.subscriberId === id) cancelEdit();
      setRows((current) => current
        .map((item) => {
          if (item.subscriberId !== id) return item;
          // An account holder / past buyer stays on the list without the newsletter row.
          const others = (item.source ?? '').split('+').filter((part) => part && part !== 'subscriber');
          if (others.length > 0) {
            return { ...item, source: others.join('+'), subscriberId: null, subscriberEmail: null, phone: null, smsStatus: null };
          }
          return null;
        })
        .filter((item): item is SubscriberRow => item !== null));
      setNotice({ text: 'Subscriber deleted.', ok: true });
      router.refresh();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not delete subscriber.', ok: false });
    } finally {
      setBusyEmail(null);
    }
  }

  // The "reply YES" text again, for a number still pending (Step 2, 2026-09-15).
  async function resendConfirmation(row: SubscriberRow) {
    if (!row.phone) return;
    setBusyEmail(row.subscriberId ?? row.phone);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/subscribers/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: row.phone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not resend the confirmation.');
      setNotice({ text: `Confirmation text sent to ${formatUsPhone(row.phone)}.`, ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not resend the confirmation.', ok: false });
    } finally {
      setBusyEmail(null);
    }
  }

  async function copyEmails() {
    try {
      const copied = await copyText(emailList);
      setNotice({
        text: copied ? `Copied ${emailCount} email${emailCount === 1 ? '' : 's'}.` : 'Could not copy automatically.',
        ok: copied,
      });
    } catch {
      setNotice({ text: 'Could not copy automatically.', ok: false });
    }
  }

  async function copyNumbers() {
    try {
      const copied = await copyText(confirmedNumbers.join(', '));
      setNotice({
        text: copied ? `Copied ${confirmedNumbers.length} confirmed number${confirmedNumbers.length === 1 ? '' : 's'}.` : 'Could not copy automatically.',
        ok: copied,
      });
    } catch {
      setNotice({ text: 'Could not copy automatically.', ok: false });
    }
  }

  return (
    <>
      <form
        className="mb-5 rounded-[1.25rem] border bg-white p-4"
        style={{ borderColor: 'var(--color-outline-variant)' }}
        onSubmit={(event) => void addSubscriber(event)}
      >
        <div className="mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}>
            Add Subscriber
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Add a customer who asked to join, by email, text deals, or both.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr] md:items-end">
          <label>
            <span className="form-label">Name</span>
            <input
              className="form-field mt-2 w-full"
              value={addForm.name}
              onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label>
            <span className="form-label">Email</span>
            <input
              className="form-field mt-2 w-full"
              type="email"
              value={addForm.email}
              onChange={(event) => setAddForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="customer@example.com"
            />
          </label>
          <label>
            <span className="form-label">Mobile number (for text deals)</span>
            <input
              className="form-field mt-2 w-full"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={addForm.phone}
              onChange={(event) => setAddForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="(239) 555-0123"
            />
          </label>
        </div>
        <label
          className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
            background: 'color-mix(in srgb, var(--color-primary) 5%, white)',
          }}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer"
            style={{ accentColor: 'var(--color-primary)' }}
            checked={addForm.smsConsent}
            onChange={(event) => setAddForm((current) => ({ ...current, smsConsent: event.target.checked }))}
          />
          <span>
            <span className="block text-sm font-bold" style={{ color: 'var(--color-on-surface)' }}>
              {ADMIN_SMS_CONSENT_LABEL}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
              They get the &ldquo;Reply YES&rdquo; text right away. Deals only go to them after they reply YES.
            </span>
          </span>
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            Email or mobile number, at least one.
          </span>
          <button type="submit" className="gold-button w-full md:w-auto" disabled={adding}>
            {adding ? 'Adding...' : 'Add Subscriber'}
          </button>
        </div>
        {addNotice && <NoticeBox notice={addNotice} className="mt-3" />}
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {emailCount} reachable by email · {textCount} on the text list
          {textOnly ? ` · showing ${visibleRows.length} with a number` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="outline-button text-sm"
            onClick={() => setTextOnly((current) => !current)}
            aria-pressed={textOnly}
            style={textOnly ? { background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' } : undefined}
          >
            {textOnly ? 'Showing: text list' : 'Show: text list only'}
          </button>
          <button type="button" className="outline-button text-sm" onClick={copyNumbers} disabled={confirmedNumbers.length === 0} title="Only numbers that replied YES">
            Copy Confirmed Numbers
          </button>
          <button type="button" className="outline-button text-sm" onClick={copyEmails} disabled={emailCount === 0}>
            Copy All Emails
          </button>
        </div>
      </div>

      {notice && <NoticeBox notice={notice} className="mb-4" />}

      <div className="responsive-table-wrap border" style={{ borderColor: 'var(--color-outline-variant)', background: 'white' }}>
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead style={{ background: 'var(--color-surface-container-low)' }}>
            <tr>
              {COLUMNS.map(({ label, sortKey }) => {
                const active = sortKey !== null && sort.key === sortKey;
                return (
                  <th
                    key={label}
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="px-4 py-3 text-[0.68rem] uppercase tracking-widest font-bold whitespace-nowrap"
                    style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                  >
                    {sortKey ? (
                      <button
                        type="button"
                        onClick={() => setSort((current) => nextSubscriberSort(current, sortKey))}
                        className="flex items-center gap-1 uppercase tracking-widest hover:opacity-75"
                        style={{ fontFamily: 'var(--font-label)' }}
                        title={`Sort by ${label.toLowerCase()}`}
                      >
                        <span>{label}</span>
                        <span
                          aria-hidden="true"
                          className="text-[0.65rem]"
                          style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
                        >
                          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((subscriber) => {
              const canManage = Boolean(subscriber.subscriberId);
              const isEditing = canManage && editing?.subscriberId === subscriber.subscriberId;
              const busy = busyEmail === (subscriber.subscriberId ?? subscriber.phone);
              const channel = subscriberChannelLabel({ email: subscriber.email || null, phone: subscriber.phone });
              const statusLabel = subscriber.phone ? smsStatusLabel(subscriber.smsStatus) : '';

              return (
                <Fragment key={`${subscriber.source}-${subscriberRowKey(subscriber)}-${subscriber.subscriberId ?? ''}`}>
                <tr
                  className="border-t"
                  style={{
                    borderColor: 'var(--color-outline-variant)',
                    background: isEditing ? 'color-mix(in srgb, var(--color-primary) 6%, white)' : undefined,
                  }}
                >
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                    {subscriber.name || '-'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-on-surface)' }}>
                    {subscriber.email || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: 'var(--color-on-surface)' }}>
                    {formatUsPhone(subscriber.phone) || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Pill color="var(--color-on-surface-variant)">{channel}</Pill>
                      {statusLabel && (
                        <Pill color={STATUS_COLORS[subscriber.smsStatus ?? ''] ?? 'var(--color-on-surface-variant)'}>{statusLabel}</Pill>
                      )}
                      {subscriber.phone && subscriber.smsStatus === 'pending' && (
                        <button
                          type="button"
                          className="text-[0.62rem] font-bold uppercase tracking-[0.1em] underline underline-offset-2"
                          style={{ color: 'var(--color-primary)' }}
                          onClick={() => void resendConfirmation(subscriber)}
                          disabled={busyEmail !== null}
                          title="Send the reply-YES text again"
                        >
                          Resend YES
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {subscriberSourceLabel(subscriber)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {formatDate(subscriber.subscribedAt) ?? (
                      formatDate(subscriber.accountCreatedAt) ? (
                        <span>
                          {formatDate(subscriber.accountCreatedAt)}
                          <span className="ml-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>(account)</span>
                        </span>
                      ) : '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="outline-button text-xs"
                          onClick={() => (isEditing ? cancelEdit() : beginEdit(subscriber))}
                          disabled={busyEmail !== null || saving}
                          aria-expanded={isEditing}
                        >
                          {isEditing ? 'Close' : 'Edit'}
                        </button>
                        <button type="button" className="outline-button text-xs" onClick={() => void remove(subscriber)} disabled={busyEmail !== null || saving} style={{ color: 'var(--color-error)' }}>
                          {busy ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {[
                          subscriber.source?.includes('account') ? 'Account profile' : null,
                          subscriber.source?.includes('buyer') ? 'Buyer record' : null,
                        ].filter(Boolean).join(' + ') || 'Not editable here'}
                      </span>
                    )}
                  </td>
                </tr>
                {isEditing && editing && (
                  <tr style={{ background: 'color-mix(in srgb, var(--color-primary) 4%, white)' }}>
                    <td colSpan={COLUMNS.length} className="px-4 pb-4 pt-1">
                      {/* Pinned to the left of the scrolling table so the box stays on screen on a phone. */}
                      <div className="sticky left-4 max-w-[min(1100px,calc(100vw-4.5rem))]">
                        <EditBox
                          row={editing}
                          form={editForm}
                          onChange={changeEdit}
                          combineOffer={combineOffer}
                          notice={editNotice}
                          saving={saving}
                          onSave={() => void saveEdit()}
                          onCombine={(otherId) => void saveEdit(otherId)}
                          onCancel={cancelEdit}
                          onDismissOffer={() => setCombineOffer(null)}
                        />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12 text-center" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {textOnly ? 'Nobody has asked for text alerts yet.' : 'No reachable marketing recipients yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
