'use client';

import { useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import { emailFrameDocument } from '@/lib/email-copies';
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  findUnknownToken,
  FOLLOW_UP_BODY_MAX,
  FOLLOW_UP_SUBJECT_MAX,
  FOLLOW_UP_TOKENS,
  stepName,
  templateKey,
  type FollowUpAudience,
  type FollowUpLanguage,
  type FollowUpSettings,
  type FollowUpStep,
} from '@/lib/follow-ups';
import { callJson, MUTED, SMALL_BUTTON } from './shared';

/**
 * "Edit emails" on a series card: the wording of step 1 / step 2, English /
 * Español. Saving stores only what the owner changed; "Use our wording"
 * removes the edit. The fill-in words are listed under the box, and an
 * unknown `{word}` is refused (it would otherwise go out as typed).
 */
export default function FollowUpEditor({
  audience,
  settings,
  onClose,
  onSaved,
}: {
  audience: FollowUpAudience;
  settings: FollowUpSettings;
  onClose: () => void;
  onSaved: (settings: FollowUpSettings, message: string) => void;
}) {
  const [step, setStep] = useState<FollowUpStep>(1);
  const [language, setLanguage] = useState<FollowUpLanguage>('en');
  const [templates, setTemplates] = useState(settings.templates);
  const key = templateKey(audience, step, language);
  const saved = templates[key] ?? DEFAULT_FOLLOW_UP_TEMPLATES[key];
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const draft = drafts[key] ?? saved;
  const dirty = draft.subject !== saved.subject || draft.body !== saved.body;
  const edited = Boolean(templates[key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; html: string; subject: string } | null>(null);

  function update(patch: Partial<{ subject: string; body: string }>) {
    setDrafts((current) => ({ ...current, [key]: { ...draft, ...patch } }));
    setPreview(null);
  }

  function choose(nextStep: FollowUpStep, nextLanguage: FollowUpLanguage) {
    setStep(nextStep);
    setLanguage(nextLanguage);
    setError(null);
    setPreview(null);
  }

  async function showPreview() {
    setError(null);
    const unknown = findUnknownToken(`${draft.subject}\n${draft.body}`);
    if (unknown) {
      setError(`${unknown} is not a fill-in word. Use one from the list.`);
      return;
    }
    setBusy(true);
    const { ok, data } = await callJson<{ html?: string; subject?: string }>('/api/admin/follow-ups/preview', {
      body: { audience, language, subject: draft.subject, body: draft.body },
    });
    setBusy(false);
    if (!ok || !data.html) {
      setError(data.error ?? 'Could not build the preview.');
      return;
    }
    setPreview({ key, html: data.html, subject: data.subject ?? draft.subject });
  }

  async function save(value: { subject: string; body: string } | null) {
    setBusy(true);
    setError(null);
    const { ok, data } = await callJson<{ settings?: FollowUpSettings }>('/api/admin/follow-ups/settings', {
      method: 'PATCH',
      body: { template: { key, value } },
    });
    setBusy(false);
    if (!ok || !data.settings) {
      setError(data.error ?? 'Could not save.');
      return;
    }
    setTemplates(data.settings.templates);
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    onSaved(data.settings, value ? 'Email wording saved.' : 'Back to our wording.');
  }

  const tab = (active: boolean) => ({
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-primary)',
  });

  return (
    <AdminModal title={`Edit emails — ${audience === 'seller' ? 'Sellers' : 'Shop buyers'}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4 px-4 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-full border" style={{ borderColor: 'var(--color-outline-variant)' }} role="tablist" aria-label="Which email">
            {([1, 2] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={step === value} onClick={() => choose(value, language)}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-[#fbf6e6] hover:text-[var(--color-primary)]" style={tab(step === value)}>
                Step {value} · {stepName(audience, value)}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-full border" style={{ borderColor: 'var(--color-outline-variant)' }} role="tablist" aria-label="Language">
            {(['en', 'es'] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={language === value} onClick={() => choose(step, value)}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-[#fbf6e6] hover:text-[var(--color-primary)]" style={tab(language === value)}>
                {value === 'en' ? 'English' : 'Español'}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold" style={{ color: edited ? '#8a6d00' : 'var(--color-on-surface-variant)' }}>
            {edited ? 'Your wording' : 'Our wording'}{dirty ? ' · not saved' : ''}
          </span>
        </div>

        <label className="block">
          <span className="form-label">Subject</span>
          <input className="form-field" value={draft.subject} maxLength={FOLLOW_UP_SUBJECT_MAX} onChange={(event) => update({ subject: event.target.value })} />
        </label>
        <label className="block">
          <span className="form-label">Email (a blank line starts a new paragraph)</span>
          <textarea className="form-field" rows={13} value={draft.body} maxLength={FOLLOW_UP_BODY_MAX} onChange={(event) => update({ body: event.target.value })} style={{ fontFamily: 'var(--font-body)', lineHeight: 1.55 }} />
        </label>

        <div className="rounded border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--color-outline-variant)', background: '#fcfbf7' }}>
          <p className="mb-1 font-semibold">Fill-in words</p>
          <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {FOLLOW_UP_TOKENS.map((entry) => (
              <li key={entry.token}><code style={{ color: 'var(--color-primary)' }}>{entry.token}</code> <span style={MUTED}>— {entry.help}</span></li>
            ))}
          </ul>
          <p className="mt-1" style={MUTED}>A line that is just <b>Chris</b> becomes your signature block (name, logo, phone, email, address). The address and the Unsubscribe link are added under every email. Keep the review a soft ask: &ldquo;if you have a minute&rdquo; — never &ldquo;if you enjoyed it&rdquo; (Google&rsquo;s rules).</p>
        </div>

        {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {preview && preview.key === key && (
          <div>
            <p className="mb-1 text-xs" style={MUTED}>Preview with made-up details · Subject: <b style={{ color: 'var(--color-on-surface)' }}>{preview.subject}</b></p>
            <iframe
              title="Email preview"
              srcDoc={emailFrameDocument(preview.html)}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className="block w-full border"
              style={{ height: 'min(52vh, 520px)', borderColor: '#e6ddc4', background: '#fff' }}
            />
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="outline-button social-danger-button" style={SMALL_BUTTON} disabled={busy || !edited}
            onClick={() => { if (window.confirm('Go back to our wording for this email? Your edit is removed.')) void save(null); }}>
            Use our wording
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={() => { if (!dirty || window.confirm('Close without saving?')) onClose(); }} disabled={busy}>Close</button>
            <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={() => void showPreview()} disabled={busy}>Preview</button>
            <button type="button" className="gold-button" style={SMALL_BUTTON} onClick={() => void save(draft)} disabled={busy || !dirty} aria-busy={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
