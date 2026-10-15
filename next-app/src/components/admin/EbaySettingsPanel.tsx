'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  describePricePushHealth,
  type PricePushCardCopy,
  type PricePushHealth,
} from '@/lib/marketplace-price-push-health';
import { describeStatusChecks, formatStatusCheckTime, type StatusCheckRow } from '@/lib/marketplace-status-checks';
import { ADDRESS } from '@/lib/business-location';

const PRICE_PUSH_TONE_COLOR: Record<PricePushCardCopy['tone'], string> = {
  ok: 'var(--color-primary)',
  warning: '#a9760a',
  error: 'var(--color-error)',
};

interface EbayStatusResponse {
  connected: boolean;
  status: 'disconnected' | 'connected' | 'needs_reauth';
  ebayUsername: string | null;
  connectedAt: string | null;
  refreshTokenExpiresAt: string | null;
  defaults: {
    fulfillmentPolicyId: string | null;
    expressFulfillmentPolicyId: string | null;
    highValueShippingThreshold: number;
    paymentPolicyId: string | null;
    returnPolicyId: string | null;
    merchantLocationKey: string | null;
  };
  policy: {
    autoPublish: boolean;
    soldHandling: 'quantity_zero' | 'withdraw';
    pricePushEnabled: boolean;
    pricePushThresholdPct: number;
    priceMarkupPct: number;
    autoMarkSold?: boolean;
  };
  salesSync?: { scopeGranted: boolean; watchingSince: string | null };
  statusChecks?: { lastCheck: StatusCheckRow | null; lastSales: StatusCheckRow | null };
  priceAutomation: {
    cronSecretConfigured: boolean;
    schedule: string;
    health: PricePushHealth;
    lastRun: { createdAt: string; outcome: 'ok' | 'warning' | 'error'; message: string | null } | null;
  };
  sellingLimit: { amount: number | null; quantity: number | null; checkedAt: string | null };
  recentActivity: Array<{
    id: number;
    product_id: string | null;
    listing_id: string | null;
    action: string;
    outcome: 'ok' | 'warning' | 'error';
    message: string | null;
    detail: unknown;
    created_at: string;
  }>;
}

interface EbayAccountProfiles {
  fulfillmentPolicies: { id: string; name: string }[];
  paymentPolicies: { id: string; name: string }[];
  returnPolicies: { id: string; name: string }[];
  merchantLocations: { id: string; name: string }[];
}

// eBay routes return { error: { code, message } } — a different, more
// structured shape than the Etsy routes' { error: string } — so every
// error read here goes through this helper instead of `data?.error`.
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

function daysUntil(dateStr: string): number {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** eBay Sync settings panel — composed into AdminSettingsPanel.tsx right after EtsySettingsPanel, mirroring its self-contained-fetch pattern. */
export default function EbaySettingsPanel() {
  const [status, setStatus] = useState<EbayStatusResponse | null>(null);
  const [profiles, setProfiles] = useState<EbayAccountProfiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // Same controlled-with-explicit-Save pattern as EtsySettingsPanel's markup
  // field: `null` means "untouched" → falls back to the saved value. Derived
  // inline (no effect) to avoid react-hooks/set-state-in-effect, and to never
  // clobber an in-progress edit when another setting reloads status.
  const [markupInput, setMarkupInput] = useState<string | null>(null);
  const savedMarkup = status?.policy.priceMarkupPct;
  const markupValue = markupInput ?? (savedMarkup != null ? String(savedMarkup) : '');
  const markupDirty = markupInput !== null && markupInput.trim() !== '' && markupInput.trim() !== String(savedMarkup);
  const [pushingPrices, setPushingPrices] = useState(false);
  const [priceProgress, setPriceProgress] = useState<{ pushed: number; failed: number; blocked: number } | null>(null);
  // No server flag for this — tracked client-side, exactly like the Etsy
  // panel: set true when a *changed* markup is saved, cleared once prices
  // are pushed to eBay.
  const [pricesStale, setPricesStale] = useState(false);
  // Prefilled from the showroom's real ZIP rather than left blank. This value
  // becomes eBay's "Item location" on every listing, so a hand-typed ZIP here
  // silently creates a NAP mismatch against the site and the Google Business
  // Profile — and the location key is immutable once created.
  const [locationPostalCode, setLocationPostalCode] = useState<string>(ADDRESS.postalCode);
  const [settingUpLocation, setSettingUpLocation] = useState(false);
  const [provisioningTiers, setProvisioningTiers] = useState(false);
  // Account-change reset: `resetSummary` holds the dry-run report while the
  // destructive confirm UI is open; null = collapsed.
  const [resetSummary, setResetSummary] = useState<{ total: number; byState: Record<string, number>; withListingIds: number } | null>(null);
  const [resetting, setResetting] = useState(false);

  const showNotice = (text: string, ok = true) => {
    setNotice({ text, ok });
    window.setTimeout(() => setNotice(null), 4800);
  };

  const provisionShippingTiers = async () => {
    setProvisioningTiers(true);
    try {
      const res = await fetch('/api/admin/ebay/provision-shipping-tiers', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not provision shipping tiers.'));
      showNotice(`Shipping tiers ready — ${data.created} created, ${data.updated} updated.`);
      await loadStatus();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not provision shipping tiers.', false);
    } finally {
      setProvisioningTiers(false);
    }
  };

  const previewListingReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/admin/ebay/reset-listing-state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: false }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not check the listing records.'));
      if (!data?.total) {
        showNotice('No local eBay listing records exist — nothing to reset.');
        setResetSummary(null);
      } else {
        setResetSummary(data);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not check the listing records.', false);
    } finally {
      setResetting(false);
    }
  };

  const confirmListingReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/admin/ebay/reset-listing-state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not reset the listing state.'));
      showNotice(`Reset complete — ${data.deleted} local listing record(s) cleared. eBay listings themselves were not touched.`);
      setResetSummary(null);
      await loadStatus();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not reset the listing state.', false);
    } finally {
      setResetting(false);
    }
  };

  const loadStatus = useCallback(async () => {
    // No setState before the first await (react-hooks/set-state-in-effect) —
    // matches EtsySettingsPanel.loadStatus.
    try {
      const res = await fetch('/api/admin/ebay/status');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not load eBay status.'));
      const typed = data as EbayStatusResponse;
      setStatus(typed);
      if (typed.connected) {
        const profileRes = await fetch('/api/admin/ebay/account-profiles');
        const profileData = await profileRes.json().catch(() => null);
        if (profileRes.ok) setProfiles(profileData as EbayAccountProfiles);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not load eBay status.', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await loadStatus();
      const params = new URLSearchParams(window.location.search);
      const ebayParam = params.get('ebay');
      if (ebayParam === 'connected') showNotice('eBay connected.');
      else if (ebayParam === 'error') showNotice('Could not connect eBay. Please try again.', false);
    };
    void run();
  }, [loadStatus]);

  const saveSettings = async (patch: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ebay/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not save.'));
      showNotice('Saved.');
      await loadStatus();
      return true;
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not save.', false);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveMarkup = async () => {
    if (markupInput === null) return;
    const changed = markupInput.trim() !== String(savedMarkup);
    const ok = await saveSettings({ priceMarkupPct: markupInput });
    if (ok) {
      setMarkupInput(null); // fall back to the freshly-saved value
      if (changed) setPricesStale(true); // live listings won't reflect it until pushed
    }
  };

  // "Push prices to eBay now" — loops /push-prices until done, with a 3-strike
  // stall guard on `remaining` not shrinking, mirroring EtsySettingsPanel's
  // pushAllPrices exactly.
  const pushAllPrices = async () => {
    setPushingPrices(true);
    setPriceProgress(null);
    let totalPushed = 0;
    let totalFailed = 0;
    let totalBlocked = 0;
    let lastRemaining: number | null = null;
    let stall = 0;
    let completed = false;
    try {
      for (;;) {
        const res = await fetch('/api/admin/ebay/push-prices', { method: 'POST' });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error(errorMessage(data, 'Could not push prices.'));
        totalPushed += data.pushed ?? 0;
        totalFailed += data.failed ?? 0;
        totalBlocked += data.blocked ?? 0;
        setPriceProgress({ pushed: totalPushed, failed: totalFailed, blocked: totalBlocked });
        if (data.done) {
          completed = true;
          break;
        }
        if (data.remaining === lastRemaining) {
          stall += 1;
          if (stall >= 3) break; // no progress across several polls — stop rather than retry forever
        } else {
          stall = 0;
          lastRemaining = data.remaining;
        }
      }
      if (completed && totalFailed === 0 && totalBlocked === 0) setPricesStale(false);
      showNotice(
        `Pushed ${totalPushed} price${totalPushed === 1 ? '' : 's'} to eBay${totalBlocked ? ` · ${totalBlocked} blocked` : ''}${totalFailed ? ` · ${totalFailed} failed` : ''}.`,
        completed && totalFailed === 0 && totalBlocked === 0,
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not push prices.', false);
    } finally {
      setPushingPrices(false);
      await loadStatus();
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/admin/ebay/disconnect', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not disconnect.'));
      showNotice('eBay disconnected. Listings already on eBay are unaffected.');
      setConfirmDisconnect(false);
      await loadStatus();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not disconnect.', false);
    } finally {
      setDisconnecting(false);
    }
  };

  const setupLocation = async () => {
    const postalCode = locationPostalCode.trim();
    if (!postalCode) {
      showNotice('Enter a postal code first.', false);
      return;
    }
    setSettingUpLocation(true);
    try {
      const res = await fetch('/api/admin/ebay/location', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postalCode, country: 'US' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, 'Could not create the inventory location.'));
      showNotice(`Inventory location created: ${data.merchantLocationKey}.`);
      await loadStatus();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not create the inventory location.', false);
    } finally {
      setSettingUpLocation(false);
    }
  };

  const priceAutomationCopy: PricePushCardCopy | null = status
    ? describePricePushHealth({
        health: status.priceAutomation.health,
        schedule: status.priceAutomation.schedule,
        cronSecretName: 'EBAY_CRON_SECRET',
        lastRunOutcome: status.priceAutomation.lastRun?.outcome ?? null,
        lastRunMessage: status.priceAutomation.lastRun?.message ?? null,
        lastRunAtLabel: status.priceAutomation.lastRun
          ? new Date(status.priceAutomation.lastRun.createdAt).toLocaleString()
          : null,
      })
    : null;

  // Heartbeat of the 30-minute sales sweep + status reconcile (red after 60 min).
  const statusChecksCopy: PricePushCardCopy | null = status?.statusChecks
    ? describeStatusChecks({
        lastCheck: status.statusChecks.lastCheck,
        lastSales: status.statusChecks.lastSales,
        lastCheckAtLabel: status.statusChecks.lastCheck ? formatStatusCheckTime(status.statusChecks.lastCheck.createdAt) : null,
      })
    : null;

  return (
    <section className="mt-6 border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          eBay Sync
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Push the catalog to eBay as a secondary sales channel. Supabase stays the source of truth — eBay never writes back into the site.
        </p>
      </div>
      <div className="p-5 flex flex-col gap-5">
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

        {loading && <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Loading…</p>}

        {!loading && status?.status === 'disconnected' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Not connected. Connect your eBay seller account to sync the catalog to eBay as a secondary sales channel.
            </p>
            {/* Plain <a>, not next/link: this must be a real full-page GET so the
                browser follows the server's 302 redirect into eBay's OAuth consent
                screen — client-side routing would try to render it as a page. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/ebay/connect" className="gold-button text-sm inline-flex w-fit">
              Connect eBay
            </a>
          </div>
        )}

        {!loading && status?.status === 'needs_reauth' && (
          <div
            className="px-3 py-2 text-xs font-medium flex items-center justify-between gap-3 flex-wrap"
            style={{ background: 'color-mix(in srgb, #b8860b 14%, transparent)', border: '1px solid color-mix(in srgb, #b8860b 30%, transparent)', color: '#8a6400' }}
          >
            <span>eBay connection expired — reconnect to resume syncing.</span>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see the Connect eBay button above */}
            <a href="/api/admin/ebay/connect" className="gold-button text-xs">
              Reconnect eBay
            </a>
          </div>
        )}

        {!loading && status?.connected && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                  {status.ebayUsername ?? 'Connected'}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Connected{status.connectedAt ? ` ${new Date(status.connectedAt).toLocaleDateString()}` : ''}
                </p>
                {status.refreshTokenExpiresAt && (() => {
                  const days = daysUntil(status.refreshTokenExpiresAt);
                  const warn = days <= 30;
                  return (
                    <p className="text-xs" style={{ color: warn ? '#8a6400' : 'var(--color-on-surface-variant)' }}>
                      Reconnect by {new Date(status.refreshTokenExpiresAt).toLocaleDateString()}
                      {days >= 0 ? ` (${days} day${days === 1 ? '' : 's'})` : ' (overdue)'} to keep syncing — eBay refresh tokens expire after ~18 months.
                    </p>
                  );
                })()}
              </div>
              {!confirmDisconnect ? (
                <button type="button" onClick={() => setConfirmDisconnect(true)} className="outline-button text-sm">
                  Disconnect
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Listings stay on eBay. Disconnect?</span>
                  <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="outline-button text-sm" style={{ color: 'var(--color-error)' }}>
                    {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                  </button>
                  <button type="button" onClick={() => setConfirmDisconnect(false)} className="outline-button text-sm">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {resetSummary === null ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void previewListingReset()} disabled={resetting} className="outline-button text-sm">
                  {resetting ? 'Checking listing records…' : 'Reset listing state (account change)…'}
                </button>
                <p className="text-[0.65rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                  For switching to a different eBay account: clears the app&apos;s local record of offers/listings so
                  the new account can publish everything fresh. Shows a summary first; listings on eBay are never
                  touched.
                </p>
              </div>
            ) : (
              <div
                className="flex flex-col gap-2 border px-3 py-2"
                style={{ borderColor: 'color-mix(in srgb, var(--color-error) 40%, transparent)', background: 'color-mix(in srgb, var(--color-error) 6%, transparent)' }}
              >
                <p className="text-xs" style={{ color: 'var(--color-on-surface)' }}>
                  This permanently deletes {resetSummary.total} local listing record(s) (
                  {Object.entries(resetSummary.byState).map(([state, count]) => `${count} ${state}`).join(', ')}
                  ).
                  {resetSummary.withListingIds > 0
                    ? ` ${resetSummary.withListingIds} still reference a live eBay listing — end or delist those on the old account first.`
                    : ''}
                  {' '}Listings on eBay itself are not touched. Continue?
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => void confirmListingReset()} disabled={resetting} className="outline-button text-sm" style={{ color: 'var(--color-error)' }}>
                    {resetting ? 'Resetting…' : `Yes, delete ${resetSummary.total} record(s)`}
                  </button>
                  <button type="button" onClick={() => setResetSummary(null)} disabled={resetting} className="outline-button text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void provisionShippingTiers()} disabled={provisioningTiers} className="outline-button text-sm">
                {provisioningTiers ? 'Provisioning shipping tiers…' : 'Provision tiered shipping policies'}
              </button>
              <p className="text-[0.65rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                Creates/updates one eBay fulfillment policy per site shipping tier ($19–$165) and assigns
                listings by price. The standard/express policies below stay as the fallback. Requires the
                marketplace-shipping-tiers SQL migration.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="form-label" htmlFor="ebay-fulfillment-policy">Standard shipping policy</label>
                <select
                  id="ebay-fulfillment-policy"
                  className="form-field w-full"
                  value={status.defaults.fulfillmentPolicyId ?? ''}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ fulfillmentPolicyId: e.target.value || null })}
                >
                  <option value="">Choose…</option>
                  {profiles?.fulfillmentPolicies.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="ebay-express-fulfillment-policy">Express shipping policy (high-value items)</label>
                <select
                  id="ebay-express-fulfillment-policy"
                  className="form-field w-full"
                  value={status.defaults.expressFulfillmentPolicyId ?? ''}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ expressFulfillmentPolicyId: e.target.value || null })}
                >
                  <option value="">Choose…</option>
                  {profiles?.fulfillmentPolicies.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="ebay-high-value-threshold">High-value threshold ($)</label>
                <input
                  id="ebay-high-value-threshold"
                  type="number"
                  min="0"
                  step="1"
                  className="form-field w-full"
                  defaultValue={status.defaults.highValueShippingThreshold}
                  disabled={saving}
                  onBlur={(e) => void saveSettings({ highValueShippingThreshold: e.target.value })}
                />
                <p className="mt-1 text-[0.65rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Items priced above this use the express shipping policy instead of the standard one.
                </p>
              </div>
              <div>
                <label className="form-label" htmlFor="ebay-payment-policy">Payment policy</label>
                <select
                  id="ebay-payment-policy"
                  className="form-field w-full"
                  value={status.defaults.paymentPolicyId ?? ''}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ paymentPolicyId: e.target.value || null })}
                >
                  <option value="">Choose…</option>
                  {profiles?.paymentPolicies.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="ebay-return-policy">Return policy</label>
                <select
                  id="ebay-return-policy"
                  className="form-field w-full"
                  value={status.defaults.returnPolicyId ?? ''}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ returnPolicyId: e.target.value || null })}
                >
                  <option value="">Choose…</option>
                  {profiles?.returnPolicies.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="form-label">Inventory location</p>
                {status.defaults.merchantLocationKey ? (
                  <p className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{status.defaults.merchantLocationKey}</p>
                ) : (
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                      One-time setup, and <strong>immutable once created</strong>.
                      Prefilled with the showroom ZIP ({ADDRESS.postalCode}) — this
                      becomes the &ldquo;Item location&rdquo; shown on every eBay
                      listing, so keep it identical to the site and the Google
                      Business Profile.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="form-field"
                        style={{ maxWidth: '8rem' }}
                        placeholder="ZIP code"
                        value={locationPostalCode}
                        disabled={settingUpLocation}
                        onChange={(e) => setLocationPostalCode(e.target.value)}
                      />
                      <button
                        type="button"
                        className="outline-button"
                        disabled={settingUpLocation || !locationPostalCode.trim()}
                        onClick={() => void setupLocation()}
                      >
                        {settingUpLocation ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {status.sellingLimit.quantity != null || status.sellingLimit.amount != null
                ? `Monthly selling limit on file: ${status.sellingLimit.quantity ?? '—'} items / $${status.sellingLimit.amount ?? '—'}`
                : 'Monthly selling limit: not checked yet.'}
            </p>

            <div className="grid md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
                <input
                  type="checkbox"
                  checked={status.policy.autoPublish}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ autoPublish: e.target.checked })}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                Automatically publish new listings
              </label>
              <p className="text-[0.65rem] md:col-span-2 -mt-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                When off (default), syncing an item prepares it and stops at &ldquo;Ready to publish&rdquo; — you click Publish on eBay to go live.
                eBay has no private draft, so review here first.
              </p>
              <div>
                <label className="form-label" htmlFor="ebay-sold-handling">When an item sells</label>
                <select
                  id="ebay-sold-handling"
                  className="form-field w-full"
                  value={status.policy.soldHandling}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ soldHandling: e.target.value })}
                >
                  <option value="quantity_zero">Hide (quantity → 0)</option>
                  <option value="withdraw">End the listing</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
                <input
                  type="checkbox"
                  checked={status.policy.autoMarkSold ?? true}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ autoMarkSold: e.target.checked })}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                Mark sold on the site when it sells on eBay (checked every 30 min)
              </label>
              {(status.policy.autoMarkSold ?? true) && status.salesSync && !status.salesSync.scopeGranted && (
                <div
                  className="md:col-span-2 px-3 py-2 text-xs font-medium flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: 'color-mix(in srgb, #b8860b 14%, transparent)', border: '1px solid color-mix(in srgb, #b8860b 30%, transparent)', color: '#8a6400' }}
                >
                  <span>Marking items sold needs permission to read eBay orders. Reconnect once to grant it — your listings are not touched.</span>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see the Connect eBay button above */}
                  <a href="/api/admin/ebay/connect" className="gold-button text-xs">
                    Reconnect eBay
                  </a>
                </div>
              )}
              {(status.policy.autoMarkSold ?? true) && status.salesSync?.scopeGranted && (
                <p className="md:col-span-2 -mt-2 text-[0.65rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {status.salesSync.watchingSince
                    ? `Watching eBay sales since ${new Date(status.salesSync.watchingSince).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET. A sale marks the product sold here and ends it on Etsy.`
                    : 'Order permission granted — the next 30-minute check starts watching eBay sales.'}
                </p>
              )}
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
                <input
                  type="checkbox"
                  checked={status.policy.pricePushEnabled}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ pricePushEnabled: e.target.checked })}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                Push prices daily
              </label>
              <div className="flex items-center gap-2">
                <label className="form-label whitespace-nowrap mb-0" htmlFor="ebay-price-threshold">Push when price changes by at least %</label>
                <input
                  id="ebay-price-threshold"
                  type="number"
                  min="0"
                  step="0.5"
                  className="form-field w-24"
                  defaultValue={status.policy.pricePushThresholdPct}
                  onBlur={(e) => void saveSettings({ pricePushThresholdPct: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="form-label whitespace-nowrap mb-0" htmlFor="ebay-markup">eBay price markup %</label>
                <input
                  id="ebay-markup"
                  type="number"
                  min="0"
                  step="0.5"
                  className="form-field w-24"
                  value={markupValue}
                  disabled={saving}
                  onChange={(e) => setMarkupInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void saveMarkup()}
                  disabled={saving || !markupDirty}
                  className="gold-button text-xs disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {statusChecksCopy && (
              <div
                className="flex items-start gap-3 border px-3 py-3 text-xs"
                style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}
              >
                <AppIcon
                  name={statusChecksCopy.icon}
                  style={{ fontSize: '18px', color: PRICE_PUSH_TONE_COLOR[statusChecksCopy.tone] }}
                  aria-hidden="true"
                />
                <div>
                  <p className="font-bold">30-minute checks</p>
                  <p style={{ color: 'var(--color-on-surface-variant)' }}>{statusChecksCopy.text}</p>
                </div>
              </div>
            )}

            {priceAutomationCopy && (
              <div
                className="flex items-start gap-3 border px-3 py-3 text-xs"
                style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}
              >
                <AppIcon
                  name={priceAutomationCopy.icon}
                  style={{ fontSize: '18px', color: PRICE_PUSH_TONE_COLOR[priceAutomationCopy.tone] }}
                  aria-hidden="true"
                />
                <div>
                  <p className="font-bold">Daily price automation</p>
                  <p style={{ color: 'var(--color-on-surface-variant)' }}>{priceAutomationCopy.text}</p>
                </div>
              </div>
            )}

            <div className="border-t pt-4 flex flex-col gap-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
              {pricesStale && !pushingPrices && (
                <div
                  className="px-3 py-2 text-xs font-medium"
                  style={{ background: 'color-mix(in srgb, #b8860b 14%, transparent)', border: '1px solid color-mix(in srgb, #b8860b 30%, transparent)', color: '#8a6400' }}
                >
                  Markup saved. Your live eBay listings still show the old prices until you push new ones.
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => void pushAllPrices()}
                  disabled={pushingPrices || saving}
                  className={`${pricesStale ? 'gold-button' : 'outline-button'} text-sm`}
                >
                  {pushingPrices ? 'Pushing prices…' : 'Push prices to eBay now'}
                </button>
                <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Re-sends the current price of every live listing to eBay (prices only — no photos or details). Use this after changing the markup,
                  or when spot has moved — the daily scheduled push only fires past the threshold.
                  {priceProgress ? ` · Pushed ${priceProgress.pushed}${priceProgress.blocked ? `, ${priceProgress.blocked} blocked` : ''}${priceProgress.failed ? `, ${priceProgress.failed} failed` : ''}.` : ''}
                </span>
              </div>
            </div>

            <div>
              <p className="form-label mb-2">Recent eBay activity</p>
              {status.recentActivity.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>No activity yet.</p>
              ) : (
                <ul className="flex flex-col gap-1 max-h-56 overflow-auto text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {status.recentActivity.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 border-b py-1" style={{ borderColor: 'var(--color-outline-variant)' }}>
                      <AppIcon name={row.outcome === 'error' ? 'error' : row.outcome === 'warning' ? 'warning' : 'check_circle'}
                        
                        style={{ fontSize: '14px', color: row.outcome === 'error' ? 'var(--color-error)' : row.outcome === 'warning' ? '#a9760a' : 'var(--color-primary)' }}
                        aria-hidden="true"
                       />
                      <span className="flex-shrink-0">{new Date(row.created_at).toLocaleString()}</span>
                      <span className="font-semibold flex-shrink-0">{row.action}</span>
                      {row.message && <span className="truncate">{row.message}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <p className="text-[0.65rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
          eBay is a trademark of eBay Inc. This integration uses the eBay API but is not affiliated with or endorsed by eBay.
        </p>
      </div>
    </section>
  );
}
