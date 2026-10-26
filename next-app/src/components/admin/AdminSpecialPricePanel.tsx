'use client';

import { useEffect, useState } from 'react';

type Basis = 'melt' | 'asking';

interface Form {
  enabled: boolean;
  basis: Basis;
  percent: string; // strings for the inputs
  discount: string;
}

const EMPTY_FORM: Form = { enabled: false, basis: 'melt', percent: '', discount: '' };

function formFromResponse(d: {
  enabled?: boolean;
  basis?: string | null;
  percent?: number | null;
  discountPercent?: number | null;
} | null | undefined): Form {
  if (!d) return EMPTY_FORM;
  return {
    enabled: Boolean(d.enabled),
    basis: d.basis === 'asking' ? 'asking' : 'melt',
    percent: d.percent != null ? String(d.percent) : '',
    discount: d.discountPercent != null ? String(d.discountPercent) : '',
  };
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Site-wide default for the product-page trade-in line ("Own gold or silver?
 * … pay as little as ___"). By default that line shows the item's computed
 * melt/spot value; this sets ONE default for every item at once — either a
 * signed % over/under melt, or a % off the asking price. Each choice keeps its
 * own number. The per-item override on any listing still wins.
 */
export default function AdminSpecialPricePanel() {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saved, setSaved] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // setState only after the await (matches AdminShopVisibilityPanel — the
    // react-hooks/set-state-in-effect rule only flags a synchronous set).
    (async () => {
      try {
        const res = await fetch('/api/admin/shop-settings');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to load settings.');
        if (cancelled) return;
        const next = formFromResponse(data.specialPriceDefault);
        setForm(next);
        setSaved(next);
      } catch (err) {
        if (!cancelled) setNotice({ text: err instanceof Error ? err.message : 'Failed to load settings.', ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { enabled, basis, percent, discount } = form;
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const percentNum = Number(percent);
  const discountNum = Number(discount);
  const percentInvalid = enabled && basis === 'melt' && percent.trim() !== '' && !Number.isFinite(percentNum);
  const discountInvalid =
    enabled && basis === 'asking' && discount.trim() !== '' && (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100);
  const invalid = percentInvalid || discountInvalid;
  const dirty =
    enabled !== saved.enabled ||
    basis !== saved.basis ||
    percent.trim() !== saved.percent.trim() ||
    discount.trim() !== saved.discount.trim();

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/shop-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          specialPriceDefaultEnabled: enabled,
          specialPriceDefaultBasis: basis,
          specialPriceDefaultPercent: percent.trim() === '' ? null : percentNum,
          specialPriceDefaultDiscountPercent: discount.trim() === '' ? null : discountNum,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save.');
      const next = data?.specialPriceDefault ? formFromResponse(data.specialPriceDefault) : form;
      setForm(next);
      setSaved(next);
      setNotice({ text: 'Saved. Product pages update within ~5 minutes.', ok: true });
      window.setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Failed to save.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  // Live example on a $1,000 base, so the sign/direction is unambiguous.
  const examplePreview =
    basis === 'melt'
      ? percent.trim() !== '' && Number.isFinite(percentNum)
        ? `On a $1,000 melt value, the line would read ${usd(1000 * (1 + percentNum / 100))}.`
        : null
      : discount.trim() !== '' && !discountInvalid
        ? `On a $1,000 asking price, the line would read ${usd(1000 * (1 - discountNum / 100))}.`
        : null;

  const busy = loading || saving;
  const choiceStyle = { cursor: busy ? 'default' : 'pointer', color: 'var(--color-on-surface)' } as const;
  const radioStyle = { accentColor: '#a98208', width: '1rem', height: '1rem', cursor: busy ? 'not-allowed' : 'pointer' } as const;

  return (
    <section className="mt-6 border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          Customer Trade-in Price
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Controls the site-wide default for the “Own gold or silver? … pay as little as ___” line on every product page. By
          default it shows the item’s spot melt value. Turn this on to advertise a different price for all items at once — a
          percentage over or under melt, or a percentage off the asking price. The per-item override on any individual listing
          still takes precedence.
        </p>
      </div>
      <div className="p-5 flex flex-col gap-4">
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

        <label className="flex items-start gap-3 text-sm" style={{ cursor: busy ? 'default' : 'pointer', color: 'var(--color-on-surface)' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            disabled={busy}
            className="mt-0.5"
            style={{ accentColor: '#a98208', width: '1.05rem', height: '1.05rem', cursor: busy ? 'not-allowed' : 'pointer' }}
          />
          <span>
            <span className="font-bold">Set a site-wide trade-in price instead of the spot melt value</span>
            <span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {loading ? 'Loading…' : 'When off, every item’s line shows its plain melt value (the historical behavior).'}
            </span>
          </span>
        </label>

        {enabled && (
          <div className="flex flex-col gap-3 pl-8">
            <fieldset className="flex flex-col gap-2" disabled={busy}>
              <legend className="sr-only">Base the trade-in price on</legend>
              <label className="flex items-center gap-2 text-sm" style={choiceStyle}>
                <input
                  type="radio"
                  name="trade-in-basis"
                  checked={basis === 'melt'}
                  onChange={() => update({ basis: 'melt' })}
                  style={radioStyle}
                />
                Percent over melt value
              </label>
              <label className="flex items-center gap-2 text-sm" style={choiceStyle}>
                <input
                  type="radio"
                  name="trade-in-basis"
                  checked={basis === 'asking'}
                  onChange={() => update({ basis: 'asking' })}
                  style={radioStyle}
                />
                Percent off the asking price
              </label>
            </fieldset>

            {basis === 'melt' ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>Trade-in price = melt value</span>
                  <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{percentNum < 0 ? '−' : '+'}</span>
                  <input
                    type="number"
                    step="0.5"
                    className="form-field w-24"
                    value={percent}
                    disabled={busy}
                    onChange={(e) => update({ percent: e.target.value })}
                    placeholder="e.g. 10"
                    aria-label="Trade-in percent over melt value"
                  />
                  <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>%</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Use a negative number (e.g. −10) to advertise <em>below</em> spot. {examplePreview}
                </p>
                {percentInvalid && (
                  <p className="text-xs" style={{ color: 'var(--color-error)' }}>Enter a number (e.g. 10, or -5 for below spot).</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>Trade-in price = asking price −</span>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={100}
                    className="form-field w-24"
                    value={discount}
                    disabled={busy}
                    onChange={(e) => update({ discount: e.target.value })}
                    placeholder="e.g. 20"
                    aria-label="Trade-in percent off the asking price"
                  />
                  <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>%</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  The asking price is the price shown in the shop. An item with no number for its price (“Contact for price”)
                  shows its melt value instead. {examplePreview}
                </p>
                {discountInvalid && (
                  <p className="text-xs" style={{ color: 'var(--color-error)' }}>Enter a number from 0 to 100 (e.g. 20 for 20% off).</p>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty || invalid}
            className="gold-button text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  );
}
