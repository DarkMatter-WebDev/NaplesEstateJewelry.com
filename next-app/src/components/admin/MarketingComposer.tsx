'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AudienceScope, MarketingSenderProfile } from '@/lib/marketing';
import { withMarketingFooter } from '@/lib/marketing-email-html';
import { chrisSignatureHtml } from '@/lib/email-signature';
import { addressOneLine } from '@/lib/business-location';

type SettingsState = {
  mailingAddress: string | null;
  siteUrl: string;
  fromAddress: string;
  senderProfiles: Record<MarketingSenderProfile, {
    fromAddress: string;
    label: string;
    replyTo: string | null;
  }>;
  transport: 'direct' | 'broadcast';
};

const AUDIENCE_LABELS: Record<AudienceScope, string> = {
  all: 'Newsletter subscribers + account holders + past buyers',
  subscribers: 'Newsletter subscribers only',
  accounts: 'Account holders only',
  buyers: 'Past buyers only',
};

type AudienceCounts = Record<AudienceScope, number | null>;

type CampaignSuccess = {
  campaignId: string | null;
  failed: number;
  scope: AudienceScope;
  sent: number;
  subject: string;
  total: number;
  /** How many got the Spanish version (2026-11-22). */
  spanish: number;
};

type ScopeCount = { count: number; spanish: number };
const SCOPES: AudienceScope[] = ['all', 'subscribers', 'accounts', 'buyers'];

/*
 * Spanish version (2026-11-22, owner mockup 1: "3A, 4A"): "Translate to
 * Spanish" fills a Spanish subject + body the owner can correct. Recipients
 * whose language is Spanish (Spanish newsletter row, or a Spanish latest
 * order) get it, with the footer in Spanish. Left empty, they get the English
 * email.
 */
export default function MarketingComposer() {
  const [scope, setScope] = useState<AudienceScope>('all');
  const [senderProfile, setSenderProfile] = useState<MarketingSenderProfile>('chris');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [subjectEs, setSubjectEs] = useState('');
  const [htmlEs, setHtmlEs] = useState('');
  const [audienceCounts, setAudienceCounts] = useState<AudienceCounts>({
    all: null,
    subscribers: null,
    accounts: null,
    buyers: null,
  });
  const [spanishCounts, setSpanishCounts] = useState<AudienceCounts>({ all: null, subscribers: null, accounts: null, buyers: null });
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [busy, setBusy] = useState<'count' | 'test' | 'send' | 'translate' | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [campaignSuccess, setCampaignSuccess] = useState<CampaignSuccess | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<'en' | 'es'>('en');

  const fetchAudienceCount = useCallback(async (nextScope: AudienceScope): Promise<ScopeCount> => {
    const res = await fetch('/api/admin/marketing/audience-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: nextScope }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Could not count ${AUDIENCE_LABELS[nextScope].toLowerCase()}.`);
    return { count: Number(data.count ?? 0), spanish: Number(data.spanish ?? 0) };
  }, []);

  const applyCounts = useCallback((counts: ScopeCount[]) => {
    const total = {} as AudienceCounts;
    const spanish = {} as AudienceCounts;
    SCOPES.forEach((item, index) => {
      total[item] = counts[index].count;
      spanish[item] = counts[index].spanish;
    });
    setAudienceCounts(total);
    setSpanishCounts(spanish);
  }, []);

  const refreshCounts = useCallback(async () => {
    setBusy('count');
    setNotice(null);
    try {
      applyCounts(await Promise.all(SCOPES.map((item) => fetchAudienceCount(item))));
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not count recipients.', ok: false });
    } finally {
      setBusy(null);
    }
  }, [fetchAudienceCount, applyCounts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsRes, ...counts] = await Promise.all([
          fetch('/api/admin/marketing/settings'),
          ...SCOPES.map((item) => fetchAudienceCount(item)),
        ]);
        const settingsData = await settingsRes.json().catch(() => null);
        if (!settingsRes.ok) throw new Error(settingsData?.error || 'Could not load marketing settings.');
        if (!cancelled) {
          setSettings(settingsData as SettingsState);
          applyCounts(counts);
        }
      } catch (err) {
        if (!cancelled) setNotice({ text: err instanceof Error ? err.message : 'Could not load marketing settings.', ok: false });
      }
    })();
    return () => { cancelled = true; };
  }, [fetchAudienceCount, applyCounts]);

  async function translateToSpanish() {
    if (busy !== null) return;
    if (!subject.trim() || !html.trim()) {
      setNotice({ text: 'Write the English subject and body first, then translate.', ok: false });
      return;
    }
    if ((subjectEs.trim() || htmlEs.trim()) && !window.confirm('Replace the Spanish version (and any corrections in it) with a new translation?')) return;
    setBusy('translate');
    setNotice(null);
    try {
      const res = await fetch('/api/admin/marketing/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not translate the email.');
      setSubjectEs(String(data.subjectEs ?? ''));
      setHtmlEs(String(data.htmlEs ?? ''));
      setNotice({ text: 'Translated. Read it over and correct anything before you send — Preview Español shows it as it will arrive.', ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not translate the email.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewOpen]);

  async function send(endpoint: 'test' | 'send') {
    if (busy !== null) return;
    if (!subject.trim()) {
      setNotice({ text: 'Add a subject before sending.', ok: false });
      return;
    }
    if (!html.trim()) {
      setNotice({ text: 'Add an email body before sending.', ok: false });
      return;
    }
    if (endpoint === 'send' && !settings?.mailingAddress) {
      setNotice({ text: 'Add a physical mailing address in Admin Settings before sending a campaign.', ok: false });
      return;
    }
    if (endpoint === 'send' && recipientCount === 0) {
      setNotice({ text: 'There are no eligible recipients for the selected audience.', ok: false });
      return;
    }
    if (Boolean(subjectEs.trim()) !== Boolean(htmlEs.trim())) {
      setNotice({ text: 'The Spanish version needs both a subject and a body — or leave both empty to send everyone the English email.', ok: false });
      return;
    }
    const spanishFilled = Boolean(subjectEs.trim() && htmlEs.trim());
    if (endpoint === 'send' && !spanishFilled && (spanishCount ?? 0) > 0
      && !window.confirm(`No Spanish version: the ${spanishCount} Spanish ${spanishCount === 1 ? 'recipient gets' : 'recipients get'} the English email. Send anyway?`)) {
      return;
    }

    setBusy(endpoint);
    setNotice(null);
    setCampaignSuccess(null);
    try {
      const res = await fetch(`/api/admin/marketing/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html, scope, senderProfile, ...(spanishFilled ? { subjectEs, htmlEs } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not send email.');
      setNotice({
        text: endpoint === 'test'
          ? (data?.spanishSent ? 'Two test emails sent to your admin email: English and Español.' : 'Test email sent to your admin email.')
          : 'Campaign sent successfully.',
        ok: true,
      });
      if (endpoint === 'send') {
        setCampaignSuccess({
          campaignId: typeof data.campaignId === 'string' ? data.campaignId : null,
          failed: Number(data.failed ?? 0),
          scope,
          sent: Number(data.sent ?? 0),
          subject,
          total: Number(data.total ?? 0),
          spanish: Number(data.spanish ?? 0),
        });
        setSubject('');
        setHtml('');
        setSubjectEs('');
        setHtmlEs('');
        void refreshCounts();
      }
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not send email.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  function openPreview(language: 'en' | 'es' = 'en') {
    if (!(language === 'es' ? htmlEs : html).trim()) {
      setNotice({ text: language === 'es' ? 'Add or translate the Spanish body before previewing it.' : 'Add an email body before previewing.', ok: false });
      return;
    }
    setNotice(null);
    setPreviewLanguage(language);
    setPreviewOpen(true);
  }

  const recipientCount = audienceCounts[scope];
  const spanishCount = spanishCounts[scope];
  const canAttemptAction = busy === null;
  const countLabel = (nextScope: AudienceScope) => {
    const count = audienceCounts[nextScope];
    return count === null ? 'Counting...' : `${count} ${count === 1 ? 'recipient' : 'recipients'}`;
  };
  const previewIsEs = previewLanguage === 'es';
  const previewUnsubscribeUrl = `${settings?.siteUrl ?? 'https://naplesestatejewelry.com'}${previewIsEs ? '/es' : ''}/unsubscribe?email=preview%40naplesestatejewelry.co`;
  // Falls back to the showroom address for the same reason the server does:
  // marketing email must carry a physical address. Before 2026-08-17 this
  // rendered a "add the live address before sending" placeholder, which is now
  // unreachable — getMarketingSettings() never returns a null mailingAddress.
  const previewMailingAddress = settings?.mailingAddress || addressOneLine();
  const previewSubject = (previewIsEs ? subjectEs : subject).trim() || 'Untitled Campaign';
  const selectedSender = settings?.senderProfiles?.[senderProfile];
  const selectedFromAddress = selectedSender?.fromAddress
    ?? (senderProfile === 'chris'
      ? 'Chris at Naples Estate Jewelry <info@naplesestatejewelry.com>'
      : 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>');
  const selectedReplyTo = selectedSender?.replyTo
    ?? (senderProfile === 'chris' ? 'info@naplesestatejewelry.com' : null);
  const previewHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; background: #f6f2ea; color: #241f1a; font-family: Arial, sans-serif; }
      .email-shell { max-width: 680px; margin: 0 auto; padding: 28px 18px; }
      .email-paper { background: #fff; border: 1px solid #e4d8c3; border-radius: 18px; box-shadow: 0 18px 45px rgba(36, 31, 26, 0.08); padding: 28px; overflow-wrap: anywhere; }
      img { max-width: 100%; height: auto; }
      a { color: #735c00; }
      @media (max-width: 540px) {
        .email-shell { padding: 14px 10px; }
        .email-paper { border-radius: 14px; padding: 18px; }
      }
    </style>
  </head>
  <body>
    <div class="email-shell">
      <div class="email-paper">
        ${withMarketingFooter(previewIsEs ? htmlEs : html, previewUnsubscribeUrl, previewMailingAddress, previewLanguage, {
          signatureHtml: senderProfile === 'chris' ? chrisSignatureHtml(previewLanguage) : undefined,
        })}
      </div>
    </div>
  </body>
</html>`;

  return (
    <section className="rounded-[1.25rem] border bg-white p-5 md:p-6" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
            Compose Campaign
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Sends only to the centralized eligible audience and appends unsubscribe/address footer automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'rgba(115, 92, 0, 0.1)', color: 'var(--color-primary)' }}>
            {recipientCount === null ? 'Counting...' : `${recipientCount} recipients`}
          </div>
          {recipientCount !== null && (spanishCount ?? 0) > 0 && (
            <div className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'rgba(115, 92, 0, 0.1)', color: 'var(--color-primary)' }} title="Spanish = joined in Spanish, switched to Spanish in Subscribers, or their latest order was Spanish">
              {recipientCount - (spanishCount ?? 0)} English · {spanishCount} Español
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div
          className="mb-4 rounded-lg px-3 py-2 text-sm"
          role="status"
          style={{
            background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)',
          }}
        >
          {notice.text}
        </div>
      )}

      {campaignSuccess && (
        <div
          className="mb-4 rounded-2xl border px-4 py-3"
          role="status"
          aria-live="polite"
          style={{
            background: 'color-mix(in srgb, var(--color-primary) 9%, white)',
            borderColor: 'color-mix(in srgb, var(--color-primary) 28%, transparent)',
            color: 'var(--color-on-surface)',
          }}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p
                className="text-[0.62rem] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
              >
                Campaign Sent Successfully
              </p>
              <strong className="mt-1 block text-base">{campaignSuccess.subject}</strong>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Sent to {AUDIENCE_LABELS[campaignSuccess.scope].toLowerCase()}.
                {campaignSuccess.spanish > 0 ? ` ${campaignSuccess.spanish} got the Spanish version.` : ''}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Sent', campaignSuccess.sent],
                ['Failed', campaignSuccess.failed],
                ['Total', campaignSuccess.total],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border px-3 py-2" style={{ borderColor: 'rgba(115, 92, 0, 0.14)', background: 'white' }}>
                  <span className="block text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
                    {label}
                  </span>
                  <strong className="mt-1 block">{value}</strong>
                </div>
              ))}
            </div>
          </div>
          {campaignSuccess.campaignId && (
            <p className="mt-3 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              Campaign ID: <span className="font-mono">{campaignSuccess.campaignId}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4">
        <label>
          <span className="form-label">Audience</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-4" aria-label="Audience recipient counts">
            {(['all', 'subscribers', 'accounts', 'buyers'] as AudienceScope[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setScope(item)}
                className="rounded-2xl border px-3 py-2 text-left transition"
                style={{
                  borderColor: scope === item ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                  background: scope === item ? 'rgba(115, 92, 0, 0.08)' : 'var(--color-surface-container-lowest)',
                  color: 'var(--color-on-surface)',
                }}
              >
                <span className="block text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
                  {item === 'all' ? 'Combined' : item === 'subscribers' ? 'Newsletter' : item === 'accounts' ? 'Accounts' : 'Buyers'}
                </span>
                <strong className="mt-1 block text-sm">{countLabel(item)}</strong>
                <span className="mt-0.5 block text-[0.72rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {AUDIENCE_LABELS[item]}
                </span>
              </button>
            ))}
          </div>
          <select
            className="form-field mt-2 w-full"
            value={scope}
            onChange={(event) => {
              const nextScope = event.target.value as AudienceScope;
              setScope(nextScope);
            }}
          >
            <option value="all">{AUDIENCE_LABELS.all} ({countLabel('all')})</option>
            <option value="subscribers">{AUDIENCE_LABELS.subscribers} ({countLabel('subscribers')})</option>
            <option value="accounts">{AUDIENCE_LABELS.accounts} ({countLabel('accounts')})</option>
            <option value="buyers">{AUDIENCE_LABELS.buyers} ({countLabel('buyers')})</option>
          </select>
        </label>
        <label>
          <span className="form-label">Sender</span>
          <select
            className="form-field mt-2 w-full"
            value={senderProfile}
            onChange={(event) => setSenderProfile(event.target.value as MarketingSenderProfile)}
          >
            <option value="chris">Chris reply-enabled</option>
            <option value="no_reply">No-reply address</option>
          </select>
          <span className="mt-2 block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            From: {selectedFromAddress}
            {selectedReplyTo ? ` | Replies go to ${selectedReplyTo}` : ' | Replies are not directed to a monitored inbox'}
          </span>
        </label>
        <label>
          <span className="form-label">Subject</span>
          <input className="form-field mt-2 w-full" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={180} />
        </label>
        <label>
          <span className="form-label">Email HTML</span>
          <textarea
            className="form-field mt-2 min-h-[18rem] w-full font-mono text-sm"
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            placeholder="<h1>New arrivals</h1><p>Write the campaign body here.</p>"
          />
        </label>
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)', background: 'color-mix(in srgb, var(--color-primary) 3%, white)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="form-label" style={{ marginBottom: 0 }}>
              Spanish version{spanishCount !== null ? ` · for ${spanishCount} ${spanishCount === 1 ? 'person' : 'people'}` : ''}
            </span>
            <button type="button" className="gold-button" disabled={busy !== null} onClick={() => void translateToSpanish()}>
              {busy === 'translate' ? 'Translating...' : 'Translate to Spanish'}
            </button>
          </div>
          <label className="mt-3 block">
            <span className="form-label">Subject (Español)</span>
            <input className="form-field mt-2 w-full" value={subjectEs} onChange={(event) => setSubjectEs(event.target.value)} maxLength={180} lang="es" />
          </label>
          <label className="mt-3 block">
            <span className="form-label">Email HTML (Español)</span>
            <textarea
              className="form-field mt-2 min-h-[12rem] w-full font-mono text-sm"
              value={htmlEs}
              onChange={(event) => setHtmlEs(event.target.value)}
              lang="es"
              placeholder="Press Translate to Spanish, or paste the Spanish HTML here."
            />
          </label>
          <span className="mt-2 block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            Left empty, Spanish subscribers get the English email. Spanish = joined in Spanish, switched to Spanish in Subscribers, or their latest order was Spanish. Their footer and unsubscribe page are in Spanish.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="outline-button"
            disabled={busy !== null}
            onClick={() => openPreview('en')}
            title="Opens a rendered preview of the email HTML with the automatic footer."
          >
            Preview Email
          </button>
          <button
            type="button"
            className="outline-button"
            disabled={busy !== null || !htmlEs.trim()}
            onClick={() => openPreview('es')}
            title="The Spanish version as it will arrive, with the Spanish footer."
          >
            Preview Español
          </button>
          <button
            type="button"
            className="outline-button"
            disabled={!canAttemptAction}
            onClick={() => void send('test')}
            title="Sends a test to your signed-in admin email after subject and body are entered."
          >
            {busy === 'test' ? 'Sending Test...' : 'Send Test'}
          </button>
          <button
            type="button"
            className="gold-button"
            disabled={!canAttemptAction}
            onClick={() => void send('send')}
            title="Sends to the selected eligible audience after subject, body, mailing address, and recipients are ready."
          >
            {busy === 'send' ? 'Sending Campaign...' : 'Send Campaign'}
          </button>
          <button type="button" className="outline-button" disabled={busy !== null} onClick={() => void refreshCounts()}>
            Refresh Counts
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Send buttons validate that subject, email body, mailing address, and selected audience are present before any email is sent.
        </p>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-3 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="marketing-preview-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewOpen(false);
          }}
        >
          <div
            className="flex h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border bg-white shadow-2xl"
            style={{ borderColor: 'var(--color-outline-variant)' }}
          >
            <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--color-outline-variant)' }}>
              <div>
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
                  {previewIsEs ? 'Email Preview · Español' : 'Email Preview'}
                </p>
                <h3 id="marketing-preview-title" className="mt-1 text-lg font-bold" style={{ color: 'var(--color-on-surface)' }}>
                  {previewSubject}
                </h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Rendered preview with unsubscribe and mailing-address footer.
                </p>
              </div>
              <button
                type="button"
                className="outline-button self-start md:self-auto"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close email preview"
              >
                Close
              </button>
            </div>
            <div className="border-b px-4 py-2 text-xs" style={{ borderColor: 'var(--color-outline-variant)', color: 'var(--color-on-surface-variant)' }}>
              <strong style={{ color: 'var(--color-on-surface)' }}>Subject:</strong> {previewSubject}
            </div>
            <iframe
              title="Rendered marketing email preview"
              className="min-h-0 flex-1 bg-[#f6f2ea]"
              sandbox=""
              srcDoc={previewHtml}
            />
          </div>
        </div>
      )}
    </section>
  );
}
