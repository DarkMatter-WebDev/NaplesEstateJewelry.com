import { escapeHtml } from '@/lib/marketing-email-html';
import { addressOneLine } from '@/lib/business-location';

const DEFAULT_SITE_URL = 'https://naplesestatejewelry.com';

// Brand casing on purpose (owner, 2026-09-17): the footer reads
// "NaplesEstateJewelry.com", never the lowercase domain.
export const SITE_DOMAIN_LABEL = 'NaplesEstateJewelry.com';

export const BUSINESS_PHONE = '(239) 404-8505';
/** The one monitored mailbox (PROJECT_OVERVIEW.md → email is fully .com). */
export const BUSINESS_EMAIL = 'info@naplesestatejewelry.com';

/**
 * Pin every phone number in an already-escaped HTML string to a single line.
 *
 * A phone number broken across lines ("(239)" / "404-8505") is unreadable and
 * un-dialable, and it happens in narrow email columns wherever the number lands
 * near the right edge. Owner request, 2026-08-23: the number must never wrap.
 *
 * ⚠️ Takes ESCAPED html and splits on the literal, so it must run AFTER
 * `escapeHtml`. Safe in that order because the number contains nothing
 * `escapeHtml` rewrites — digits, spaces, parentheses and a hyphen — so the
 * literal still matches. `split`/`join` rather than a RegExp because the
 * parentheses would otherwise need escaping.
 */
export function pinPhoneToOneLine(escapedHtml: string): string {
  return escapedHtml
    .split(BUSINESS_PHONE)
    .join(`<span style="white-space:nowrap;">${BUSINESS_PHONE}</span>`);
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
}

export function getAccountUrl(): string {
  return `${getSiteUrl()}/account`;
}

/**
 * The guest order page, with the order number prefilled. Most buyers never
 * create an account (owner, 2026-09-17), so order emails point here — the
 * customer enters the email or phone on the order and sees it, no sign-in.
 */
export function getOrderLookupUrl(orderNumber?: string | null): string {
  const base = `${getSiteUrl()}/order-lookup`;
  return orderNumber ? `${base}?order=${encodeURIComponent(orderNumber)}` : base;
}

/**
 * Shared footer for customer-facing order emails (invoice/receipt + fulfillment
 * updates): a link back to the buyer's account and to the storefront domain,
 * so recipients always have a clickable way back to naplesestatejewelry.com.
 *
 * ⚠️ `addressOneLine()`, NOT `addressWithLandmark()` (owner, 2026-08-23). This
 * is the sender's contact block, not directions — "· inside Sharon Lynch
 * Collections" made an already-wrapping line longer for no navigational
 * benefit. The landmark is still WAYFINDING where someone is actually being
 * sent to the door: the pickup sentence in `order-invoice-email.ts` keeps it.
 *
 * ⚠️ The phone is `white-space:nowrap` because it was breaking mid-number
 * across lines ("(239)" / "404-8505"), which is unreadable and unclickable as a
 * number. Keep the wrapper if you edit this line.
 */
export function buildOrderEmailFooterHtml(orderNumber?: string | null) {
  const siteUrl = getSiteUrl();
  const lookupUrl = getOrderLookupUrl(orderNumber);
  return `
    <div style="margin:22px 0 0;padding-top:16px;border-top:1px solid #eadfbd;">
      <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#746b5b;">
        View this order anytime at
        <a href="${escapeHtml(lookupUrl)}" style="color:#735c00;font-weight:700;text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}/order-lookup</a>
        &mdash; enter your order number and the email or phone on the order. No account needed.
      </p>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#9a8f7a;">
        <a href="${escapeHtml(siteUrl)}" style="color:#735c00;font-weight:600;text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}</a> &middot; ${escapeHtml(addressOneLine())} &middot; <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span>
      </p>
    </div>
  `;
}

export function buildOrderEmailFooterTextLines(orderNumber?: string | null): string[] {
  return [
    `View this order anytime at ${getOrderLookupUrl(orderNumber)} — enter your order number and the email or phone on the order. No account needed.`,
    SITE_DOMAIN_LABEL,
    addressOneLine(),
    BUSINESS_PHONE,
  ];
}
