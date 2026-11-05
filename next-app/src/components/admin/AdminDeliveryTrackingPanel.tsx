'use client';

import { useEffect, useState } from 'react';

type EasyPostStatus = {
  apiKeySet: boolean;
  keyMode: 'test' | 'production' | 'unknown' | null;
  webhookSecretSet: boolean;
  webhookUrl: string;
  webhookUrlIsHttps: boolean;
  webhook: { id: string; mode: string | null; disabledAt: string | null } | null;
  webhookError: string | null;
};

/**
 * Admin → Settings → Delivery Tracking (owner, 2026-11-05): is EasyPost set
 * up, and one Connect button that registers the webhook, so the owner never
 * configures it by hand. The keys themselves live only in Netlify.
 */
export default function AdminDeliveryTrackingPanel() {
  const [status, setStatus] = useState<EasyPostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/easypost');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Could not load the delivery tracking status.');
        if (!cancelled) setStatus(data as EasyPostStatus);
      } catch (err) {
        if (!cancelled) setNotice({ text: err instanceof Error ? err.message : 'Could not load the status.', ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/easypost', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not connect the webhook.');
      setStatus(data as EasyPostStatus);
      setNotice({ text: 'Connected. EasyPost will now tell the site about every carrier scan.', ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not connect the webhook.', ok: false });
    } finally {
      setConnecting(false);
    }
  };

  const muted = { color: 'var(--color-on-surface-variant)' };
  const good = { color: 'var(--color-primary)' };
  const bad = { color: 'var(--color-error)' };
  const connected = Boolean(status?.webhook && !status.webhook.disabledAt);
  const keyLabel = status?.keyMode === 'test'
    ? 'Set — TEST key (for trying it out with EasyPost test numbers; real packages need the production key)'
    : status?.keyMode === 'production'
      ? 'Set — production key'
      : status?.apiKeySet ? 'Set' : 'Not set';

  return (
    <section className="mt-6 border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          Delivery Tracking
        </h2>
        <p className="mt-1 text-xs" style={muted}>
          After you mark an order Shipped with a tracking number, the site follows the package through EasyPost and emails the
          customer when it is out for delivery and when it is delivered. Each package costs about 1&ndash;3&cent; at EasyPost.
        </p>
      </div>

      <div className="grid gap-3 px-5 py-5 text-sm">
        {loading ? (
          <p style={muted}>Loading&hellip;</p>
        ) : status && (
          <dl className="grid gap-2 sm:grid-cols-[14rem_1fr]">
            <dt className="form-label">EASYPOST_API_KEY</dt>
            <dd style={status.apiKeySet ? good : bad}>{keyLabel}</dd>
            <dt className="form-label">EASYPOST_WEBHOOK_SECRET</dt>
            <dd style={status.webhookSecretSet ? good : bad}>{status.webhookSecretSet ? 'Set' : 'Not set'}</dd>
            <dt className="form-label">Webhook</dt>
            <dd style={connected ? good : bad}>
              {status.webhookError
                ? `Could not check: ${status.webhookError}`
                : connected
                  ? `Connected (${status.webhook?.mode ?? 'EasyPost'}) → ${status.webhookUrl}`
                  : status.webhook?.disabledAt
                    ? 'Disabled by EasyPost after repeated failures — press Connect to turn it back on.'
                    : 'Not connected'}
            </dd>
          </dl>
        )}

        {status && (!status.apiKeySet || !status.webhookSecretSet) && (
          <p className="text-xs" style={muted}>
            To turn it on: add both values in Netlify &rarr; Site configuration &rarr; Environment variables, redeploy, then come
            back and press Connect.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {notice && (
            <span className="text-xs" role="status" style={notice.ok ? good : bad}>
              {notice.text}
            </span>
          )}
          <button
            type="button"
            className="gold-button"
            onClick={() => void connect()}
            disabled={loading || connecting || !status?.apiKeySet || !status?.webhookSecretSet || !status?.webhookUrlIsHttps}
            title={status && !status.webhookUrlIsHttps ? 'Connect from the live site (EasyPost needs an https address).' : undefined}
          >
            {connecting ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
          </button>
        </div>
      </div>
    </section>
  );
}
