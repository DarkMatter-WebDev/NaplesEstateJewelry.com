'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { EbayAspectRows, FIELD_LABEL, useProductFieldEditor, type EditorKey } from './ProductFieldInlineEditor';
import { AppIcon } from '@/components/AppIcon';
import type { ProductFieldEditPatch, ReviewProductFields } from '@/lib/product-field-edits';

interface PreflightCheck {
  check: string;
  ok: boolean;
  message?: string;
  value?: unknown;
}

interface MappedEbayPayload {
  sku: string;
  title: string;
  description: string;
  aspects: Record<string, string[]>;
  conditionId: string;
  conditionDescription: string;
  categoryId: string | null;
  categoryPath: string | null;
  categoryIsApproximate: boolean;
  categoryIsOverride: boolean;
  price: number | null;
  priceBeforeMarkup: number | null;
  quantity: number;
  images: { url: string }[];
  fulfillmentPolicyId: string | null;
  shippingTier: 'standard' | 'express' | 'tiered';
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;
  marketplaceId: string;
  /** This item's own Best Offer choice (products.ebay_best_offer). */
  bestOfferEnabled: boolean;
}

interface EbayListingSummary {
  syncState: string;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  lastError: string | null;
}

interface PreviewResponse {
  eligible: boolean;
  preflight: PreflightCheck[];
  payload: MappedEbayPayload;
  listing: EbayListingSummary | null;
  fees: unknown;
  /** The stored product values behind the editable rows — prefills the pencil editors. */
  productFields?: ReviewProductFields;
}

interface BestOfferChangeResult {
  ok: boolean;
  enabled: boolean;
  pushed: boolean;
  syncState: string | null;
  confirmedOnEbay: boolean | null;
  message: string;
  error?: { code: string; message: string };
}

interface SyncStepResult {
  done: boolean;
  syncState: string;
  progress?: { step: string };
  listingId?: string;
  listingUrl?: string;
  warnings?: string[];
  error?: { code: string; message: string };
}

// eBay routes return { error: { code, message } } — read via this helper
// rather than `data?.error` (see the note in EbaySettingsPanel.tsx).
function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: unknown }).error;
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return fallback;
}

const STATE_LABELS: Record<string, string> = {
  pending: 'Not listed',
  item_synced: 'Preparing…',
  offer_created: 'Preparing…',
  review: 'Ready to publish',
  published: 'Live',
  // Matches the product table's wording — this is content drift, never price.
  out_of_date: 'Content stale',
  hidden_oos: 'Hidden (sold)',
  ended: 'Ended',
  error: 'Error',
};

/** Self-contained eBay drawer section: its own fetch, its own sync loop — mirrors EtsyProductPanel's pattern (own state, own round trip, independent of the form's Save). */
export default function EbayProductPanel({
  productId,
  onSynced,
  onProductEdited,
}: {
  productId: string;
  /** Called after an action that can change this listing's sync state, so the
   *  parent admin table can refresh its status chips (see AdminShell). */
  onSynced?: () => void;
  /** A pencil edit saved product fields (quantity, brand, weight…) — the host
   *  merges the patch so its own copy (the open editor form, a header) is not stale. */
  onProductEdited?: (productId: string, patch: ProductFieldEditPatch) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ step: string } | null>(null);
  const [busyAction, setBusyAction] = useState<'delist' | 'restore' | 'check-status' | 'unstage' | null>(null);
  const [pushingPrice, setPushingPrice] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingBestOffer, setSavingBestOffer] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const showNotice = (text: string, ok = true) => {
    setNotice({ text, ok });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const loadPreview = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    // No setState before the first await — matches EtsyProductPanel.loadPreview.
    try {
      const res = await fetch('/api/admin/ebay/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not load the eBay preview.'));
      setPreview(data as PreviewResponse);
      setLoadError(null);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load the eBay preview.';
      setLoadError(message);
      return { ok: false, message };
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    const run = async () => { await loadPreview(); };
    void run();
  }, [loadPreview]);

  // Pencil edits on the product-backed rows — the same editors as the
  // "Review before submitting" window, saved to the product row, then the
  // preview re-runs (DECISIONS.md → "Review-window edits write to the product").
  const fieldEditor = useProductFieldEditor({
    marketplace: 'ebay',
    productId,
    fields: preview?.productFields ?? null,
    productType: preview?.productFields?.product_type ?? null,
    disabled: syncing || publishing || pushingPrice || busyAction !== null,
    onSaved: async (patch, key) => {
      onProductEdited?.(productId, patch);
      const result = await loadPreview();
      showNotice(
        result.ok
          ? `${FIELD_LABEL[key]} saved · preview refreshed.`
          : `${FIELD_LABEL[key]} saved, but the preview did not refresh: ${result.message ?? 'try Refresh Preview.'}`,
        result.ok,
      );
    },
  });

  const handleRefreshClick = async () => {
    const result = await loadPreview();
    showNotice(result.ok ? 'Preview refreshed.' : (result.message ?? 'Could not refresh the preview.'), result.ok);
  };

  // Polling sync loop — most calls finish in one round trip (done: true
  // immediately) since eBay only needs ~3 calls total, but the loop is
  // written for the rare multi-call case, mirroring EtsyProductPanel's
  // runSyncLoop shape (including the stall guard) exactly.
  const runSyncLoop = async (mode: 'publish' | 'update') => {
    setSyncing(true);
    setProgress(null);
    let lastProgressSignature: string | null = null;
    let stallCount = 0;
    try {
      for (;;) {
        const res = await fetch('/api/admin/ebay/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId, mode }),
        });
        const data = (await res.json().catch(() => null)) as SyncStepResult | null;
        if (!res.ok || !data) throw new Error('Sync request failed.');
        if (data.error) {
          showNotice(data.error.message, false);
          break;
        }
        if (!data.done) {
          setProgress(data.progress ?? null);
          if (data.warnings?.length) showNotice(data.warnings.join(' '), false);
          const signature = JSON.stringify(data.progress);
          if (signature === lastProgressSignature) {
            stallCount += 1;
            if (stallCount >= 5) {
              showNotice('Sync stalled — no progress after several attempts, stopping to avoid hammering eBay. See the notice above for the actual failure reason, or try again.', false);
              break;
            }
          } else {
            stallCount = 0;
            lastProgressSignature = signature;
          }
          continue;
        }
        if (data.warnings?.length) showNotice(data.warnings.join(' '), true);
        else showNotice(`Synced — ${STATE_LABELS[data.syncState] ?? data.syncState}.`, true);
        break;
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Sync failed.', false);
    } finally {
      setSyncing(false);
      setProgress(null);
      await loadPreview();
      onSynced?.(); // refresh the parent table's status chips
    }
  };

  // eBay has no private draft — publishing goes live immediately, so this is
  // a single explicit call (no polling loop) with copy that says so.
  const publishLive = async () => {
    setPublishing(true);
    try {
      const res = await fetch('/api/admin/ebay/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, mode: 'publish-live' }),
      });
      const data = (await res.json().catch(() => null)) as SyncStepResult | null;
      if (!res.ok || !data) throw new Error('Publish failed.');
      if (data.error) showNotice(data.error.message, false);
      else if (!data.done) showNotice('Publish is still in progress — refresh in a moment.', true);
      else showNotice(`Published — ${STATE_LABELS[data.syncState] ?? data.syncState}.`, true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Publish failed.', false);
    } finally {
      setPublishing(false);
      await loadPreview();
      onSynced?.();
    }
  };

  // Lean price-only push for THIS listing — completes in one server call (no
  // polling), so this is a plain one-shot. Only offered once an offer exists.
  const pushPriceOnly = async () => {
    setPushingPrice(true);
    try {
      const res = await fetch('/api/admin/ebay/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, mode: 'price-only' }),
      });
      const data = (await res.json().catch(() => null)) as SyncStepResult | null;
      if (!res.ok || !data) throw new Error('Price push failed.');
      if (data.error) showNotice(data.error.message, false);
      else showNotice('Price pushed to eBay.', true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Price push failed.', false);
    } finally {
      setPushingPrice(false);
      await loadPreview();
      onSynced?.();
    }
  };

  // Reconciles with the real eBay listing — read-only on eBay's side (a GET),
  // so it's safe to call any time an offer is linked; loadPreview() re-renders
  // the chip. Mirrors EtsyProductPanel's checkStatus.
  const checkStatus = async () => {
    setBusyAction('check-status');
    try {
      const res = await fetch('/api/admin/ebay/verify-listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not check eBay status.'));
      showNotice(data.message ?? 'Checked eBay status.', true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not check eBay status.', false);
    } finally {
      setBusyAction(null);
      await loadPreview();
      onSynced?.();
    }
  };

  // The item's Best Offer choice (2026-10-14). A live or prepared offer is
  // updated on eBay in the same call; otherwise the choice is saved and rides
  // along with the next sync. No auto-accept / auto-decline — offers are
  // answered on eBay (owner's choice).
  const changeBestOffer = async (enabled: boolean) => {
    setSavingBestOffer(true);
    try {
      const res = await fetch('/api/admin/ebay/best-offer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, enabled }),
      });
      const data = (await res.json().catch(() => null)) as BestOfferChangeResult | null;
      if (!res.ok || !data) throw new Error(errorMessage(data, 'Could not change Best Offer.'));
      const mismatch = data.confirmedOnEbay !== null && data.confirmedOnEbay !== data.enabled;
      showNotice(data.message, data.ok && !mismatch);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not change Best Offer.', false);
    } finally {
      setSavingBestOffer(false);
      await loadPreview();
      onSynced?.();
    }
  };

  const runDelistAction = async (action: 'hide' | 'withdraw' | 'restore' | 'unstage') => {
    setBusyAction(action === 'restore' ? 'restore' : action === 'unstage' ? 'unstage' : 'delist');
    try {
      const res = await fetch('/api/admin/ebay/delist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Action failed.'));
      showNotice(
        action === 'hide'
          ? 'Marked sold out on eBay.'
          : action === 'withdraw'
            ? 'Listing ended on eBay.'
            : action === 'unstage'
              ? 'Un-staged — discarded the prepared eBay offer. This item is no longer queued to publish.'
              : 'Listing restored on eBay.',
        true,
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Action failed.', false);
    } finally {
      setBusyAction(null);
      await loadPreview();
      onSynced?.();
    }
  };

  if (loading) return <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Loading eBay status…</p>;
  // Only the initial load (no preview yet) replaces the panel with a bare
  // error line; a later failed Refresh Preview click keeps the existing
  // panel/data on screen and reports the failure via the notice banner
  // instead (same as every other action button below).
  if (loadError && !preview) return <p className="text-xs" style={{ color: 'var(--color-error)' }}>{loadError}</p>;
  if (!preview) return null;

  const listing = preview.listing;
  const stateLabel = listing ? (STATE_LABELS[listing.syncState] ?? listing.syncState) : 'Not listed';
  const alreadySynced = listing != null && ['review', 'published', 'out_of_date', 'hidden_oos'].includes(listing.syncState);
  const hasOffer = Boolean(listing?.ebayOfferId);
  const hasListing = Boolean(listing?.ebayListingId);
  const canRestore = listing?.syncState === 'hidden_oos' || listing?.syncState === 'ended';
  // A prepared offer that isn't live — can be fully discarded ("un-staged").
  const canUnstage =
    hasOffer && (listing?.syncState === 'review' || listing?.syncState === 'ended' || listing?.syncState === 'offer_created');
  const fields = preview.productFields ?? null;
  const offerIsLive = listing?.syncState === 'published' || listing?.syncState === 'out_of_date';
  const offerIsPrepared = hasOffer && (listing?.syncState === 'review' || listing?.syncState === 'offer_created');
  const bestOfferHint = offerIsLive
    ? 'Changes the live eBay listing right away. Offers are answered on eBay; nothing is accepted or declined automatically.'
    : offerIsPrepared
      ? 'Updates the prepared listing right away; it carries this choice when you publish.'
      : listing?.syncState === 'hidden_oos'
        ? 'Saved now; eBay gets it after Restore, then Sync Updates.'
        : 'Saved now; included when this item is synced to eBay.';

  // A product-backed value with its pencil; the cell spans both columns while
  // its editor is open so the inputs have room.
  const valueCell = (key: EditorKey, label: string, value: ReactNode) => (
    <div className={fieldEditor.editorKey === key ? 'md:col-span-2' : undefined}>
      <span className="form-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span>{value}</span>
        {fieldEditor.pencil(key, label)}
      </div>
      {fieldEditor.inlineEditor(key)}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <div
          className="px-3 py-2 text-xs font-medium"
          role="status"
          style={{
            background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            border: `1px solid ${notice.ok ? 'color-mix(in srgb, var(--color-primary) 28%, transparent)' : 'color-mix(in srgb, var(--color-error) 28%, transparent)'}`,
            color: notice.ok ? 'var(--color-primary)' : 'var(--color-error)',
          }}
        >
          {notice.text}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className="inline-flex text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5"
          style={{
            background: listing?.syncState === 'error' ? 'color-mix(in srgb, var(--color-error) 16%, transparent)' : 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
            color: listing?.syncState === 'error' ? 'var(--color-error)' : 'var(--color-primary)',
          }}
        >
          {stateLabel}
        </span>
        {listing?.ebayListingId && (
          <a
            href={`https://www.ebay.com/itm/${listing.ebayListingId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline"
            style={{ color: 'var(--color-primary)' }}
          >
            View on eBay
          </a>
        )}
      </div>

      {listing?.lastError && <p className="text-xs" style={{ color: 'var(--color-error)' }}>{listing.lastError}</p>}

      <div>
        <p className="form-label mb-1">Pre-flight</p>
        <ul className="flex flex-col gap-1">
          {preview.preflight.map((check) => (
            <li
              key={check.check}
              className="text-xs flex items-start gap-2"
              style={{ color: !check.ok ? 'var(--color-error)' : check.message ? '#a9760a' : 'var(--color-on-surface-variant)' }}
            >
              <AppIcon name={!check.ok ? 'error' : check.message ? 'warning' : 'check_circle'}  style={{ fontSize: '14px', lineHeight: '1.4' }} aria-hidden="true" />
              <span>{check.message ?? check.check}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        <div>
          <span className="form-label">Title</span>
          <p>{preview.payload.title}</p>
        </div>
        <div>
          <span className="form-label">Price</span>
          <p>
            {preview.payload.price != null ? `$${preview.payload.price.toFixed(2)}` : '—'}
            {preview.payload.priceBeforeMarkup != null && preview.payload.price != null
              ? ` (before markup: $${preview.payload.priceBeforeMarkup.toFixed(2)})`
              : ''}
          </p>
        </div>
        {valueCell('quantity', 'Quantity', preview.payload.quantity)}
        <div>
          <span className="form-label">Condition</span>
          <p>{preview.payload.conditionDescription}</p>
        </div>
        <div className="md:col-span-2">
          <span className="form-label">Category</span>
          <p>
            {preview.payload.categoryPath ?? '—'}
            {preview.payload.categoryIsOverride && (
              <span className="ml-2 text-[0.65rem] font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>Manually selected</span>
            )}
            {preview.payload.categoryIsApproximate && (
              <span className="ml-2 text-[0.65rem] font-bold uppercase tracking-wide" style={{ color: '#a9760a' }}>(approximate — review before publishing)</span>
            )}
          </p>
          {fields && !preview.payload.categoryIsOverride && (
            <p className="text-[0.7rem] italic opacity-75">Pinned from Type and metal · change Type in the aspects below to move it</p>
          )}
        </div>
        <div className="md:col-span-2">
          <span className="form-label">Aspects</span>
          <EbayAspectRows aspects={preview.payload.aspects} fields={fields} productType={fields?.product_type ?? null} editor={fieldEditor} />
        </div>
        <div>
          <span className="form-label">Photos</span>
          <p>{preview.payload.images.length}</p>
        </div>
        <div>
          <span className="form-label">Shipping</span>
          <p>
            {preview.payload.shippingTier === 'tiered'
              ? 'site shipping tier (price-based)'
              : preview.payload.shippingTier === 'express'
                ? 'express (over the high-value threshold)'
                : 'standard'}
          </p>
        </div>
        <div className="md:col-span-2">
          <span className="form-label">Best Offer</span>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
            <input
              type="checkbox"
              checked={preview.payload.bestOfferEnabled}
              disabled={savingBestOffer || syncing || publishing || pushingPrice || busyAction !== null || fieldEditor.saving}
              onChange={(e) => void changeBestOffer(e.target.checked)}
              style={{ accentColor: 'var(--color-primary)' }}
            />
            {savingBestOffer ? 'Saving…' : 'Allow offers'}
          </label>
          <p className="text-[0.7rem] italic opacity-75">{bestOfferHint}</p>
        </div>
      </div>

      {progress && (
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Working on {progress.step}…
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void handleRefreshClick()} disabled={loading || syncing || fieldEditor.saving} className="outline-button text-sm">
          Refresh Preview
        </button>
        {hasOffer && (
          <button type="button" onClick={() => void checkStatus()} disabled={busyAction !== null || syncing} className="outline-button text-sm">
            {busyAction === 'check-status' ? 'Checking…' : 'Check eBay Status'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void runSyncLoop(alreadySynced ? 'update' : 'publish')}
          disabled={!preview.eligible || syncing || savingBestOffer || fieldEditor.saving}
          className="gold-button text-sm disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : alreadySynced ? 'Sync Updates' : 'Sync to eBay'}
        </button>
        {listing?.syncState === 'review' && (
          <button
            type="button"
            onClick={() => void publishLive()}
            disabled={publishing || syncing || savingBestOffer || !preview.eligible || fieldEditor.saving}
            className="gold-button text-sm disabled:opacity-50"
            title="eBay has no private draft — this makes the listing live immediately."
          >
            {publishing ? 'Publishing…' : 'Publish on eBay (goes live immediately)'}
          </button>
        )}
        {hasOffer && (
          <button
            type="button"
            onClick={() => void pushPriceOnly()}
            disabled={pushingPrice || syncing || savingBestOffer || busyAction !== null}
            className="outline-button text-sm"
            title="Push just the current price to eBay (no photos or details)"
          >
            {pushingPrice ? 'Pushing price…' : 'Push price only'}
          </button>
        )}
        {hasListing && !canRestore && (
          <button type="button" onClick={() => void runDelistAction('hide')} disabled={busyAction !== null} className="outline-button text-sm">
            {busyAction === 'delist' ? 'Working…' : 'Hide (mark sold out)'}
          </button>
        )}
        {hasListing && !canRestore && (
          <button type="button" onClick={() => void runDelistAction('withdraw')} disabled={busyAction !== null} className="outline-button text-sm">
            {busyAction === 'delist' ? 'Working…' : 'End listing'}
          </button>
        )}
        {hasListing && canRestore && (
          <button type="button" onClick={() => void runDelistAction('restore')} disabled={busyAction !== null} className="outline-button text-sm">
            {busyAction === 'restore' ? 'Restoring…' : 'Restore'}
          </button>
        )}
        {canUnstage && (
          <button
            type="button"
            onClick={() => void runDelistAction('unstage')}
            disabled={busyAction !== null || syncing}
            className="outline-button text-sm"
            title="Discard the prepared (unpublished) eBay offer and return this item to Not Listed — removes it from the publish queue."
          >
            {busyAction === 'unstage' ? 'Un-staging…' : 'Un-stage (discard draft)'}
          </button>
        )}
      </div>
    </div>
  );
}
