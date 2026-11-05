'use client';

import { useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '@/lib/clipboard';
import AdminCarouselSettingsPanel from './AdminCarouselSettingsPanel';
import AdminShopVisibilityPanel from './AdminShopVisibilityPanel';
import AdminStoreHoursPanel from './AdminStoreHoursPanel';
import AdminHomeBannerPanel from './AdminHomeBannerPanel';
import AdminGoogleReviewsPanel from './AdminGoogleReviewsPanel';
import AdminSpecialPricePanel from './AdminSpecialPricePanel';
import AdminDeliveryTrackingPanel from './AdminDeliveryTrackingPanel';
import MarketingSettingsPanel from './MarketingSettingsPanel';
import EtsySettingsPanel from './EtsySettingsPanel';
import EbaySettingsPanel from './EbaySettingsPanel';
import InstagramSettingsPanel from './InstagramSettingsPanel';
import FacebookSettingsPanel from './FacebookSettingsPanel';
import { AppIcon } from '@/components/AppIcon';

type AiSettingsResponse = {
  systemPrompt: string;
  builtInPrompt: string;
  promptVersion: string;
};

type StorageGcResult = {
  dryRun: boolean;
  objectCount: number;
  referencedPathCount: number;
  orphanCount: number;
  skippedUnknownAgeCount: number;
  samplePaths: string[];
  deletedCount: number;
  deletedSamplePaths: string[];
};

export default function AdminSettingsPanel() {
  const [prompt, setPrompt] = useState('');
  const [builtInPrompt, setBuiltInPrompt] = useState('');
  const [promptVersion, setPromptVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  // Collapsed by default so the (very tall) prompt editor doesn't dominate the
  // page on load; the admin expands it deliberately, like the other settings
  // accordions.
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [gcRunning, setGcRunning] = useState(false);
  const [gcResult, setGcResult] = useState<StorageGcResult | null>(null);
  const [gcNotice, setGcNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const showNotice = (text: string, ok = true) => {
    setNotice({ text, ok });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const applyResponse = (data: AiSettingsResponse) => {
    setPrompt(data.systemPrompt);
    setBuiltInPrompt(data.builtInPrompt);
    setPromptVersion(data.promptVersion);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ai-settings');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to load the AI prompt.');
        if (!cancelled) applyResponse(data as AiSettingsResponse);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load the AI prompt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startEditing = () => {
    setEditing(true);
    // Focus the field on the next tick, once it's no longer read-only.
    window.setTimeout(() => promptTextareaRef.current?.focus(), 0);
  };

  const persist = async (nextPrompt: string, successText: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemPrompt: nextPrompt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save the AI prompt.');
      applyResponse(data as AiSettingsResponse);
      setEditing(false);
      showNotice(successText);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to save the AI prompt.', false);
    } finally {
      setSaving(false);
    }
  };

  const savePrompt = () => {
    if (!prompt.trim()) {
      showNotice('Prompt cannot be blank. Use Restore Built-In to bring back the original prompt.', false);
      return;
    }
    void persist(prompt, 'AI assistant prompt saved. New listings will use it.');
  };

  const restoreBuiltInPrompt = () => {
    // Sending an empty value clears the saved prompt; the server falls back to
    // the built-in starting prompt shipped in code.
    void persist('', 'AI assistant prompt restored to the built-in original.');
  };

  const copyPrompt = async () => {
    const copied = await copyTextToClipboard(prompt);
    if (!copied) {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.select();
    }
    showNotice(copied ? 'AI assistant prompt copied.' : 'Clipboard access was blocked. Prompt text is selected for manual copy.', copied);
  };

  const isBuiltInText = prompt.trim() === builtInPrompt.trim();

  const runStorageGc = async (confirm = false) => {
    setGcRunning(true);
    setGcNotice(null);
    try {
      const res = await fetch('/api/admin/storage-gc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Storage cleanup check failed.');
      setGcResult(data as StorageGcResult);
      setGcNotice({
        ok: true,
        text: confirm
          ? `Deleted ${(data as StorageGcResult).deletedCount} old unreferenced file(s).`
          : `Dry run found ${(data as StorageGcResult).orphanCount} old unreferenced file(s).`,
      });
    } catch (err) {
      setGcNotice({ ok: false, text: err instanceof Error ? err.message : 'Storage cleanup check failed.' });
    } finally {
      setGcRunning(false);
    }
  };

  return (
    <main className="px-4 md:px-8 py-8">
      <div className="ultrawide-page-medium max-w-[1100px] mx-auto">
        <div className="mb-8">
          <p
            className="text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
          >
            Admin Settings
          </p>
          <h1
            className="text-3xl md:text-4xl font-bold"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Settings
          </h1>
        </div>

        <section className="border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <div
            className="border-b px-5 py-4 flex items-center justify-between gap-3 cursor-pointer select-none"
            style={{ borderColor: 'var(--color-outline-variant)' }}
            role="button"
            tabIndex={0}
            aria-expanded={promptExpanded}
            aria-controls="ai-settings-prompt-panel"
            onClick={() => setPromptExpanded((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPromptExpanded((open) => !open);
              }
            }}
          >
            <div>
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
              >
                AI Listing Assistant Prompt
              </h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                The single prompt that drives photo &amp; transcript autofill. Edit it to permanently change how
                listings are generated &mdash; your saved text becomes the prompt and applies to all new listings immediately.
              </p>
            </div>
            <AppIcon name={promptExpanded ? 'expand_less' : 'expand_more'} className="flex-shrink-0" aria-hidden="true" style={{ color: 'var(--color-primary)' }} />
          </div>
          {promptExpanded && (
          <div id="ai-settings-prompt-panel" className="p-5 flex flex-col gap-4">
            {notice && (
              <div
                className="px-3 py-2 text-xs font-medium"
                role="status"
                style={{
                  background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  border: `1px solid ${notice.ok ? 'color-mix(in srgb, var(--color-primary) 28%, transparent)' : 'color-mix(in srgb, var(--color-error) 28%, transparent)'}`,
                  color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)',
                  fontFamily: 'var(--font-label)',
                }}
              >
                {notice.text}
              </div>
            )}

            {loadError && (
              <div
                className="px-3 py-2 text-xs font-medium"
                role="status"
                style={{
                  background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
                  color: 'var(--color-error)',
                  fontFamily: 'var(--font-label)',
                }}
              >
                {loadError}
              </div>
            )}

            <label className="form-label" htmlFor="ai-system-prompt">
              System Prompt
            </label>
            <textarea
              ref={promptTextareaRef}
              id="ai-system-prompt"
              className="form-field w-full min-h-[460px] font-mono text-xs leading-relaxed"
              value={loading ? 'Loading…' : prompt}
              onChange={(event) => setPrompt(event.target.value)}
              readOnly={!editing || loading}
              aria-readonly={!editing || loading}
              spellCheck={false}
              style={editing && !loading ? undefined : { background: 'var(--color-surface-container-low)', cursor: 'default' }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.7rem]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                {promptVersion ? `Built-in version: ${promptVersion}` : ''}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={copyPrompt} disabled={loading} className="outline-button text-sm">
                  Copy Prompt
                </button>
                {editing && (
                  <button type="button" onClick={restoreBuiltInPrompt} disabled={saving || isBuiltInText} className="outline-button text-sm">
                    Restore Built-In
                  </button>
                )}
                {editing ? (
                  <button type="button" onClick={savePrompt} disabled={saving} className="gold-button text-sm">
                    {saving ? 'Saving…' : 'Save Prompt'}
                  </button>
                ) : (
                  <button type="button" onClick={startEditing} disabled={loading || !!loadError} className="gold-button text-sm">
                    Edit Prompt
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        </section>
        <section className="mt-6 border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Product Image Storage Cleanup
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              Dry-run first. Confirmed cleanup deletes only old Supabase Storage objects that are not referenced by products, orders, or inquiries.
            </p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {gcNotice && (
              <div
                className="px-3 py-2 text-xs font-medium"
                role="status"
                style={{
                  background: gcNotice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  border: `1px solid ${gcNotice.ok ? 'color-mix(in srgb, var(--color-primary) 28%, transparent)' : 'color-mix(in srgb, var(--color-error) 28%, transparent)'}`,
                  color: gcNotice.ok ? 'var(--color-primary)' : 'var(--color-error)',
                  fontFamily: 'var(--font-label)',
                }}
              >
                {gcNotice.text}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void runStorageGc(false)} disabled={gcRunning} className="outline-button text-sm">
                {gcRunning ? 'Checking...' : 'Dry Run'}
              </button>
              <button
                type="button"
                onClick={() => void runStorageGc(true)}
                disabled={gcRunning || !gcResult || gcResult.orphanCount === 0}
                className="gold-button text-sm disabled:opacity-50"
              >
                Delete Old Orphans
              </button>
            </div>

            {gcResult && (
              <div className="grid gap-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                <p>
                  Checked {gcResult.objectCount} object(s), with {gcResult.referencedPathCount} referenced path(s).
                  {' '}Skipped {gcResult.skippedUnknownAgeCount} object(s) with unknown age.
                </p>
                <p>
                  {gcResult.dryRun
                    ? `Dry run would delete ${gcResult.orphanCount} old unreferenced object(s).`
                    : `Confirmed run deleted ${gcResult.deletedCount} object(s).`}
                </p>
                {(gcResult.samplePaths.length > 0 || gcResult.deletedSamplePaths.length > 0) && (
                  <ul className="max-h-44 overflow-auto border p-3 font-mono text-[0.7rem]" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}>
                    {(gcResult.deletedSamplePaths.length > 0 ? gcResult.deletedSamplePaths : gcResult.samplePaths).map((path) => (
                      <li key={path}>{path}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
        <AdminShopVisibilityPanel />
        <AdminStoreHoursPanel />
        <AdminHomeBannerPanel />
        <AdminGoogleReviewsPanel />
        <AdminSpecialPricePanel />
        <AdminDeliveryTrackingPanel />
        <MarketingSettingsPanel />
        <EtsySettingsPanel />
        <EbaySettingsPanel />
        <InstagramSettingsPanel />
        <FacebookSettingsPanel />
      </div>

      {/* Carousel panel gets a wider container so its two tables can use the
          full width on widescreen, only stacking below the lg breakpoint. */}
      <div className="ultrawide-page-wide max-w-[1800px] mx-auto">
        <AdminCarouselSettingsPanel />
      </div>
    </main>
  );
}
