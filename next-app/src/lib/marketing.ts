import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { withMarketingFooter } from '@/lib/marketing-email-html';
import { addressOneLine } from '@/lib/business-location';

export type AudienceScope = 'subscribers' | 'accounts' | 'buyers' | 'all';
export type MarketingSenderProfile = 'no_reply' | 'chris';

/** A single source ('subscriber'/'account'/'buyer') or a deterministic,
 *  sorted '+'-joined combination (e.g. 'account+buyer') when a recipient
 *  matched more than one audience in a combined build. Kept as a plain
 *  string rather than an exhaustive union — the only consumer is a display
 *  label, and the combination count grows quickly with more sources. */
export type MarketingRecipient = {
  email: string;
  name: string | null;
  source: string;
  subscriberSource: string | null;
  unsubscribeToken: string | null;
  userId: string | null;
  subscriberEmail: string | null;
  /** `homepage_subscribers.subscribed_at` — when the newsletter row was created (null for account/buyer-only recipients). */
  subscribedAt: string | null;
  /** `profiles.created_at` — when the site account was made (null when no account matched). */
  accountCreatedAt: string | null;
};

export type MarketingSettings = {
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

export function normalizeSenderProfile(value: unknown): MarketingSenderProfile {
  return value === 'no_reply' ? 'no_reply' : 'chris';
}

export function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function marketingSiteUrl() {
  return (process.env.SITE_URL || 'https://naplesestatejewelry.com').replace(/\/+$/, '');
}

export function activeMarketingTransport(): 'direct' | 'broadcast' {
  return process.env.MARKETING_TRANSPORT === 'broadcast' ? 'broadcast' : 'direct';
}

/** Merges a new single source into a recipient's existing (possibly already
 *  combined) source, producing a deterministic sorted '+'-joined string so
 *  e.g. subscriber+account+buyer always renders the same way regardless of
 *  which order the three audience queries happened to run in. */
export function combineSource(existing: string, incoming: 'subscriber' | 'account' | 'buyer'): string {
  const parts = new Set(existing.split('+'));
  parts.add(incoming);
  return [...parts].sort().join('+');
}

export async function buildMarketingAudience(scope: AudienceScope = 'all', audienceClient?: SupabaseClient) {
  const supabase = audienceClient ?? createServiceClient();
  const byEmail = new Map<string, MarketingRecipient>();

  if (scope === 'subscribers' || scope === 'all') {
    let { data, error } = await supabase
      .from('homepage_subscribers')
      .select('email, full_name, source, unsubscribe_token, unsubscribed_at, subscribed_at')
      .is('unsubscribed_at', null);

    if (error?.code === '42703') {
      const fallback = await supabase
        .from('homepage_subscribers')
        .select('email, full_name, source, unsubscribe_token');
      data = fallback.data?.map((row) => ({ ...row, unsubscribed_at: null, subscribed_at: null })) ?? null;
      error = fallback.error;
    }

    if (error?.code === '42703') {
      const fallback = await supabase
        .from('homepage_subscribers')
        .select('email, full_name');
      data = fallback.data?.map((row) => ({ ...row, source: null, unsubscribe_token: null, unsubscribed_at: null, subscribed_at: null })) ?? null;
      error = fallback.error;
    }

    if (error) throw new Error(`Could not load active subscribers. Confirm homepage_subscribers has email/full_name plus optional unsubscribe fields. ${error.message}`);

    for (const row of data ?? []) {
      const email = normalizeEmail(row.email);
      if (!isValidEmail(email)) continue;
      byEmail.set(email, {
        email,
        name: row.full_name ?? null,
        source: 'subscriber',
        subscriberSource: row.source ?? null,
        unsubscribeToken: row.unsubscribe_token ?? null,
        userId: null,
        subscriberEmail: email,
        subscribedAt: row.subscribed_at ?? null,
        accountCreatedAt: null,
      });
    }
  }

  if (scope === 'accounts' || scope === 'all') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name, marketing_opt_out, created_at')
      .eq('marketing_opt_out', false);

    if (error) throw new Error(`Could not load account audience. Run the email marketing migration first. ${error.message}`);

    for (const row of data ?? []) {
      const email = normalizeEmail(row.email);
      if (!isValidEmail(email)) continue;
      const existing = byEmail.get(email);
      const name = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || null;
      byEmail.set(email, {
        email,
        name: existing?.name ?? name,
        source: existing ? combineSource(existing.source, 'account') : 'account',
        subscriberSource: existing?.subscriberSource ?? null,
        unsubscribeToken: existing?.unsubscribeToken ?? null,
        userId: row.id ?? null,
        subscriberEmail: existing?.subscriberEmail ?? null,
        subscribedAt: existing?.subscribedAt ?? null,
        accountCreatedAt: row.created_at ?? null,
      });
    }
  }

  if (scope === 'buyers' || scope === 'all') {
    const { data, error } = await supabase
      .from('buyers')
      .select('email, name, user_id, marketing_opt_out')
      .eq('marketing_opt_out', false);

    if (error) throw new Error(`Could not load buyer audience. Run the buyers migration first. ${error.message}`);

    for (const row of data ?? []) {
      const email = normalizeEmail(row.email);
      if (!isValidEmail(email)) continue;
      const existing = byEmail.get(email);
      byEmail.set(email, {
        email,
        name: existing?.name ?? (row.name ?? null),
        source: existing ? combineSource(existing.source, 'buyer') : 'buyer',
        subscriberSource: existing?.subscriberSource ?? null,
        unsubscribeToken: existing?.unsubscribeToken ?? null,
        userId: existing?.userId ?? (row.user_id ?? null),
        subscriberEmail: existing?.subscriberEmail ?? null,
        subscribedAt: existing?.subscribedAt ?? null,
        accountCreatedAt: existing?.accountCreatedAt ?? null,
      });
    }
  }

  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

/** One line of Admin → Subscribers: an email recipient, a text-alert sign-up, or both. */
export type SubscriberDirectoryRow = MarketingRecipient & {
  /** `homepage_subscribers.id` behind this line — what Edit / Combine / Delete act on; null for account- or buyer-only lines. */
  subscriberId: string | null;
  /** E.164 mobile number when text alerts were requested. */
  phone: string | null;
  smsStatus: 'pending' | 'confirmed' | 'stopped' | null;
};

/**
 * The email audience plus every text-alert sign-up, for the admin table.
 *
 * Email sends keep using `buildMarketingAudience` — this is a DIRECTORY, not a
 * send list. A text sign-up with a matching reachable email gets its number
 * attached to that row; one with no email, or whose email is unsubscribed,
 * appears as its own row with an empty email. Before the text-subscribers
 * migration has been run the phone columns simply do not exist yet, and the
 * directory is the email audience alone rather than an error page.
 */
export async function buildSubscriberDirectory(audienceClient?: SupabaseClient): Promise<SubscriberDirectoryRow[]> {
  const supabase = audienceClient ?? createServiceClient();
  const audience = await buildMarketingAudience('all', supabase);
  const rows: SubscriberDirectoryRow[] = audience.map((recipient) => ({ ...recipient, subscriberId: null, phone: null, smsStatus: null }));

  // Every newsletter row (not only those with a number) so each line knows
  // its row id — Edit and Combine work by id since 2026-11-02.
  const { data, error } = await supabase
    .from('homepage_subscribers')
    .select('id, email, full_name, source, subscribed_at, phone_e164, sms_status');

  if (error?.code === '42703') return rows;
  if (error) throw new Error(`Could not load text-alert subscribers. ${error.message}`);

  const byEmail = new Map(rows.map((row) => [row.email, row]));
  for (const row of data ?? []) {
    const phone = typeof row.phone_e164 === 'string' ? row.phone_e164 : null;
    const smsStatus = row.sms_status === 'confirmed' || row.sms_status === 'pending' || row.sms_status === 'stopped'
      ? row.sms_status
      : null;
    const email = normalizeEmail(row.email);
    const existing = email ? byEmail.get(email) : undefined;
    if (existing && (existing.subscriberEmail || phone)) {
      existing.subscriberId = row.id ?? null;
      if (phone) {
        existing.phone = phone;
        existing.smsStatus = smsStatus;
      }
      continue;
    }
    // An unsubscribed email with no number is not on the directory at all.
    if (!phone) continue;
    rows.push({
      subscriberId: row.id ?? null,
      email: '',
      name: row.full_name ?? null,
      source: 'subscriber',
      subscriberSource: row.source ?? null,
      unsubscribeToken: null,
      userId: null,
      subscriberEmail: null,
      subscribedAt: row.subscribed_at ?? null,
      accountCreatedAt: null,
      phone,
      smsStatus,
    });
  }

  return rows;
}

export async function getMarketingSettings(): Promise<MarketingSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('marketing_settings')
    .select('mailing_address')
    .eq('id', true)
    .maybeSingle();

  // From addresses must sit on Resend's verified sending domain, which is
  // naplesestatejewelry.com as of 2026-08-05 — .co was removed from the account.
  // NOTE: any MARKETING_*/EMAIL_FROM/RESEND_FROM override set in Netlify wins over
  // these defaults, so a stale .co value there will still break sending.
  const noReplyFromAddress = process.env.MARKETING_NOREPLY_FROM
    || process.env.EMAIL_FROM
    || process.env.RESEND_FROM
    || 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>';
  // The DISPLAY NAME stays personal ("Chris at …") because that is the entire
  // point of this sender profile versus the no_reply one; only the address
  // moved to the shared box (owner, 2026-08-08). Valid as a From because
  // `naplesestatejewelry.com` is Resend's verified sending domain — any local
  // part on it sends; a `.co` address would not send at all.
  const chrisFromAddress = process.env.MARKETING_CHRIS_FROM
    || 'Chris at Naples Estate Jewelry <info@naplesestatejewelry.com>';
  // Currently the SAME address as the From above, so it is a no-op by default:
  // a reply goes to the From address anyway when Reply-To is absent. It is kept
  // explicit, not deleted, because the two are independent knobs — Reply-To is
  // not constrained by the sending domain the way From is, so this is the one
  // that can point at an outside or unverified mailbox if that is ever wanted.
  //
  // This default is LIVE: MARKETING_CHRIS_REPLY_TO is unset, and
  // `marketing_settings` has no sender-profile columns, so nothing overrides it.
  const chrisReplyTo = process.env.MARKETING_CHRIS_REPLY_TO || 'info@naplesestatejewelry.com';

  return {
    // CAN-SPAM requires a valid physical postal address on marketing email, and
    // this used to resolve to null unless someone typed one into Admin, which
    // blocked sending entirely (see the throw in sendMarketingEmail). Now the
    // showroom address is the final fallback, so compliance does not depend on
    // data entry. An admin value or a Netlify override still wins.
    //
    // ⚠️ Deliberately `addressOneLine()`, NOT `addressWithLandmark()`. CAN-SPAM
    // wants the sender's valid physical address; "inside Sharon Lynch
    // Collections" is wayfinding for a visitor and does not belong in a legal
    // footer.
    mailingAddress: (data?.mailing_address || process.env.MARKETING_MAILING_ADDRESS || '').trim()
      || addressOneLine(),
    siteUrl: marketingSiteUrl(),
    fromAddress: chrisFromAddress,
    senderProfiles: {
      no_reply: {
        fromAddress: noReplyFromAddress,
        label: 'No-reply address',
        replyTo: null,
      },
      chris: {
        fromAddress: chrisFromAddress,
        label: 'Chris reply-enabled',
        replyTo: chrisReplyTo,
      },
    },
    transport: activeMarketingTransport(),
  };
}

export function senderForProfile(settings: MarketingSettings, profile: MarketingSenderProfile) {
  return settings.senderProfiles[profile] ?? settings.senderProfiles.chris;
}

export function unsubscribeUrlFor(recipient: MarketingRecipient, siteUrl = marketingSiteUrl()) {
  const params = new URLSearchParams();
  if (recipient.unsubscribeToken) params.set('token', recipient.unsubscribeToken);
  params.set('email', recipient.email);
  return `${siteUrl}/unsubscribe?${params.toString()}`;
}

export function stableEventId(campaignId: string, email: string, type: string, url?: string | null) {
  return createHash('sha256').update(`${campaignId}:${normalizeEmail(email)}:${type}:${url ?? ''}`).digest('hex');
}

export async function sendDirectMarketingCampaign({
  campaignId,
  subject,
  html,
  recipients,
  senderProfile = 'chris',
  settings,
}: {
  campaignId: string;
  subject: string;
  html: string;
  recipients: MarketingRecipient[];
  senderProfile?: MarketingSenderProfile;
  settings: MarketingSettings;
}) {
  if (!settings.mailingAddress) throw new Error('A physical mailing address is required before sending marketing email.');
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY || process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('EMAIL_PROVIDER_API_KEY or RESEND_API_KEY is required before sending marketing email.');

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const perRecipient: { email: string; ok: boolean; error?: string }[] = [];
  const sender = senderForProfile(settings, senderProfile);

  for (const recipient of recipients) {
    const unsubscribeUrl = unsubscribeUrlFor(recipient, settings.siteUrl);
    try {
      await resend.emails.send({
        from: sender.fromAddress,
        to: recipient.email,
        subject,
        html: withMarketingFooter(html, unsubscribeUrl, settings.mailingAddress),
        replyTo: sender.replyTo ?? undefined,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [
          { name: 'campaign_id', value: campaignId },
          { name: 'marketing', value: 'true' },
        ],
      });
      perRecipient.push({ email: recipient.email, ok: true });
    } catch (err) {
      perRecipient.push({
        email: recipient.email,
        ok: false,
        error: err instanceof Error ? err.message : 'Send failed',
      });
    }
  }

  return {
    sent: perRecipient.filter((item) => item.ok).length,
    failed: perRecipient.filter((item) => !item.ok).length,
    perRecipient,
  };
}

export async function suppressMarketingEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return;

  const supabase = createServiceClient();
  await Promise.all([
    supabase
      .from('homepage_subscribers')
      .update({ subscribed: false, unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('email', normalized),
    supabase
      .from('profiles')
      .update({ marketing_opt_out: true, marketing_opt_in: false, updated_at: new Date().toISOString() })
      .eq('email', normalized),
    // A buyer-only email (no newsletter signup, no account) has nowhere else
    // to record this — without it, they could be re-emailed the next time a
    // "Buyers" campaign goes out.
    supabase
      .from('buyers')
      .update({ marketing_opt_out: true })
      .eq('email', normalized),
  ]);
}
