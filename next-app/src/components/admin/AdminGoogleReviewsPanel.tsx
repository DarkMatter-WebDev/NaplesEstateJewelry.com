'use client';

import { useEffect, useMemo, useState } from 'react';
import GoogleReviewsLine from '@/components/GoogleReviewsLine';
import {
  DEFAULT_GOOGLE_REVIEWS,
  GOOGLE_REVIEWS_MAX_COUNT,
  isValidReviewCount,
  type GoogleReviewsSettings,
} from '@/lib/google-reviews';

/**
 * Admin → Settings → Google Reviews (owner, 2026-11-01, mockup approved):
 * the exact review count off Google Maps + "every review is five stars".
 * The site rounds the count DOWN to the nearest 10 with "+"; the preview is
 * the real line component, so it shows exactly what the site will.
 * Explicit Save, like the banner and store-hours panels.
 */
export default function AdminGoogleReviewsPanel() {
  const [saved, setSaved] = useState<GoogleReviewsSettings>(DEFAULT_GOOGLE_REVIEWS);
  const [countText, setCountText] = useState(String(DEFAULT_GOOGLE_REVIEWS.count));
  const [allFiveStar, setAllFiveStar] = useState(DEFAULT_GOOGLE_REVIEWS.allFiveStar);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/google-reviews');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to load the review count.');
        if (!cancelled && data?.settings) {
          setSaved(data.settings);
          setCountText(String(data.settings.count));
          setAllFiveStar(Boolean(data.settings.allFiveStar));
          setIsDefault(Boolean(data.isDefault));
        }
      } catch (err) {
        if (!cancelled) setNotice({ text: err instanceof Error ? err.message : 'Failed to load the review count.', ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const count = countText.trim() === '' ? NaN : Number(countText);
  const valid = isValidReviewCount(count);
  const draft: GoogleReviewsSettings = { count: valid ? count : saved.count, allFiveStar, updatedAt: saved.updatedAt };
  const dirty = useMemo(
    () => isDefault || !valid || count !== saved.count || allFiveStar !== saved.allFiveStar,
    [isDefault, valid, count, allFiveStar, saved],
  );

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/google-reviews', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count, allFiveStar }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save the review count.');
      setSaved(data.settings);
      setIsDefault(false);
      setNotice({ text: 'Saved. The site updates within a few minutes as the pages regenerate.', ok: true });
      window.setTimeout(() => setNotice(null), 6000);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Failed to save the review count.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving;
  const muted = { color: 'var(--color-on-surface-variant)' };

  return (
    <section className="mt-6 border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          Google Reviews
        </h2>
        <p className="mt-1 text-xs" style={muted}>
          The review line on the homepage (under &ldquo;Trusted Across Southwest Florida&rdquo;), on /reviews and on
          /free-evaluation. When your count on Google goes up, change the number here and Save — the site updates
          within a few minutes, no deploy.
        </p>
      </div>

      <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="form-label">Number of Google reviews</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={GOOGLE_REVIEWS_MAX_COUNT}
              step={1}
              className="form-field w-28"
              value={countText}
              disabled={disabled}
              onChange={(e) => setCountText(e.target.value)}
              style={!valid ? { borderColor: 'var(--color-error)' } : undefined}
            />
            <span className="mt-1 block text-[0.7rem]" style={!valid ? { color: 'var(--color-error)' } : muted}>
              {valid
                ? 'Your exact count from Google Maps. The site rounds DOWN to the nearest 10 and adds "+", so it never says more than you have: 51 → 50+, 63 → 60+.'
                : 'Enter a whole number.'}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allFiveStar}
              disabled={disabled}
              onChange={(e) => setAllFiveStar(e.target.checked)}
              style={{ accentColor: 'var(--color-primary)', marginTop: 3 }}
            />
            <span>
              <b>Every review is five stars</b>
              <span className="block text-[0.7rem]" style={muted}>
                Untick the day any review below five stars comes in — the &ldquo;All five stars&rdquo; part and the
                stars disappear; the count stays.
              </span>
            </span>
          </label>

          <p className="text-[0.7rem]" style={muted}>
            {isDefault
              ? 'Not saved yet — the site is using 51 reviews, all five stars (checked on Google Maps on Nov 1, 2026).'
              : `Last saved ${saved.updatedAt ?? '—'}.`}
          </p>
        </div>

        <div>
          <span className="form-label">Preview (what the site shows)</span>
          <div className="border px-4 py-5" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-background)' }}>
            <GoogleReviewsLine settings={draft} isEs={false} />
            <GoogleReviewsLine settings={draft} isEs small className="mt-3 opacity-80" />
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {notice && (
              <span className="text-xs" role="status" style={{ color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>
                {notice.text}
              </span>
            )}
            <button type="button" className="gold-button" onClick={() => void save()} disabled={disabled || !valid || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
