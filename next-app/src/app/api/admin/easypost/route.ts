import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getSiteUrl } from '@/lib/order-email-branding';
import {
  easyPostApiKey,
  easyPostKeyMode,
  easyPostWebhookSecret,
  listWebhooks,
  upsertWebhook,
} from '@/lib/easypost';

/**
 * Admin → Settings → Delivery Tracking: is EasyPost connected, and the one
 * "Connect" button that registers (or repairs) the webhook with the secret
 * from EASYPOST_WEBHOOK_SECRET — so the owner never has to set it up by hand
 * in EasyPost's dashboard.
 */
export const runtime = 'nodejs';

function webhookUrl(): string {
  return `${getSiteUrl()}/api/webhooks/easypost`;
}

async function status() {
  const url = webhookUrl();
  const base = {
    apiKeySet: Boolean(easyPostApiKey()),
    keyMode: easyPostKeyMode(),
    webhookSecretSet: Boolean(easyPostWebhookSecret()),
    webhookUrl: url,
    webhookUrlIsHttps: url.startsWith('https://'),
  };
  if (!base.apiKeySet) return { ...base, webhook: null, webhookError: null };
  try {
    const hook = (await listWebhooks()).find((item) => item.url === url) ?? null;
    return {
      ...base,
      webhook: hook ? { id: hook.id, mode: hook.mode ?? null, disabledAt: hook.disabled_at ?? null } : null,
      webhookError: null,
    };
  } catch (error) {
    return { ...base, webhook: null, webhookError: error instanceof Error ? error.message : 'Could not reach EasyPost.' };
  }
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(await status());
}

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const secret = easyPostWebhookSecret();
  if (!easyPostApiKey() || !secret) {
    return NextResponse.json(
      { error: 'Set EASYPOST_API_KEY and EASYPOST_WEBHOOK_SECRET in Netlify (then redeploy) before connecting.' },
      { status: 400 },
    );
  }
  const url = webhookUrl();
  if (!url.startsWith('https://')) {
    return NextResponse.json(
      { error: `EasyPost only sends to https addresses; this site's address is ${url}. Connect from the live site.` },
      { status: 400 },
    );
  }
  try {
    await upsertWebhook(url, secret);
    return NextResponse.json(await status());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not connect the webhook.' }, { status: 502 });
  }
}
