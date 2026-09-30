/**
 * Text alerts (Twilio) — configuration (2026-09-15, Step 2).
 *
 * Netlify is the operating configuration (memory: env-netlify-authoritative).
 *   TWILIO_ACCOUNT_SID      ACxxxxxxxx…   Console home → Account Info
 *   TWILIO_AUTH_TOKEN       write-only in Netlify; rotate, never copy
 *   TWILIO_FROM_NUMBER      +18884237522  the toll-free number bought 2026-09-15
 *   TWILIO_FORWARD_TO       +12394048505  the owner's cell (default below)
 *   TEXT_ALERTS_CRON_SECRET x-cron-secret for /api/admin/text-alerts/sweep
 *   SITE_URL                already set; the webhook URLs are built from it
 *
 * Nothing sends while the three TWILIO_* values are missing: every sender
 * checks `twilioConfigured()` first and returns a "not configured" result,
 * so the site is safe to deploy before Twilio's toll-free verification lands.
 */

/** The owner's cell in E.164 — every reply is forwarded here. */
export const DEFAULT_FORWARD_TO = '+12394048505';

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  forwardTo: string;
  siteUrl: string;
};

function siteUrl(): string {
  return (process.env.SITE_URL || 'https://naplesestatejewelry.com').replace(/\/+$/, '');
}

/**
 * The picture attached to every customer-facing text that is not a deal
 * (the sign-up confirmation, the YES reply, the sold auto-reply).
 *
 * Why (owner, 2026-09-17): a plain text and a picture message from the same
 * toll-free number land in TWO threads on the iPhone ("+1 (888) 423-7522" vs
 * "8884237522"). Making every customer text an MMS keeps the whole
 * conversation in one thread. The forwards to the owner's own cell stay
 * plain texts. The image is the gold "NAPLES / ESTATE JEWELRY" wordmark on
 * navy with "DEALS" as a third line (owner, 2026-09-18: the picture reads
 * "Naples Estate Jewelry Deals"), 800×400 JPEG (~22 KB), served from the site
 * so Twilio can fetch it.
 * Shape matters (rounds on the owner's phone, 2026-09-18): the iPhone preview
 * bubble shows a picture at its own ratio up to roughly 16:9 and CROPS anything
 * wider to 16:9 (a 800×300 banner with a 700 px mark lost its N and S); 4:3
 * showed whole but "too tall". So: a 2:1 canvas — the bubble is as short as
 * it gets (16:9) — with the wordmark on the central 600 px, which survives
 * the 800→711 px crop. Never let the artwork leave that central band.
 *
 * A changed picture needs a NEW file name: `/assets/*` is served
 * `immutable, max-age=1y` (netlify.toml) and Twilio caches media by URL, so
 * the old bytes would keep going out under the old name.
 */
export function brandMediaUrl(): string {
  return `${siteUrl()}/assets/images/branding/text-brand-wordmark-v5.jpg`;
}

export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return {
    accountSid,
    authToken,
    fromNumber,
    forwardTo: process.env.TWILIO_FORWARD_TO?.trim() || DEFAULT_FORWARD_TO,
    siteUrl: siteUrl(),
  };
}

export function twilioConfigured(): boolean {
  return twilioConfig() !== null;
}

/** Where Twilio reports delivery for every message we send (passed per message, no console setup). */
export function statusCallbackUrl(): string {
  return `${siteUrl()}/api/webhooks/twilio/status`;
}

/** The URL the number's "A message comes in" webhook must be set to in the Twilio console. */
export function inboundWebhookUrl(): string {
  return `${siteUrl()}/api/webhooks/twilio/inbound`;
}
