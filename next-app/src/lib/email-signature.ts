import { escapeHtml } from '@/lib/marketing-email-html';
import { BUSINESS_NAME, addressOneLine, cityLine, streetLine } from '@/lib/business-location';
import { BUSINESS_EMAIL, BUSINESS_PHONE, SITE_DOMAIN_LABEL, getSiteUrl } from '@/lib/order-email-branding';
import { CONTACT_PHONE_DIGITS } from '@/lib/contact-links';

/**
 * Chris's signature block — ONE design for every customer email that is
 * signed by Chris (owner, 2026-11-26, mockup 6 → "4c at 12 px"):
 *
 *   — Chris Surette                       (Georgia 20px, above the card)
 *   ┌─ gold bar ──────────────────────────────┐
 *   │ [octopus]  NAPLES ESTATE JEWELRY  (12px) │
 *   │            Call or text (239) 404-8505   │
 *   │            info@naplesestatejewelry.com  │
 *   ├─ cream strip ────────────────────────────┤
 *   │ 6240 Shirley St, … 34109  NaplesEstate…  │
 *   └──────────────────────────────────────────┘
 *
 * Used by: the thank-you follow-ups (lib/follow-ups.ts), the offer and Check
 * Availability emails when the owner typed a note (lib/offer-emails.ts), the
 * remote-sale invoice when the owner typed a message
 * (lib/order-invoice-email.ts) and Email Campaigns sent as "Chris"
 * (lib/marketing-email-html.ts → withMarketingFooter).
 *
 * ⚠️ Fit: the narrowest place it sits is the invoice on a 375 px phone, where
 * the column beside the logo is 175 px. NAPLES ESTATE JEWELRY at 12px only fits
 * there with letter-spacing 0.4px (167 px wide, measured); 12px at the old
 * 1.4px spacing was 188 px and wrapped. Do not widen the spacing or the logo
 * cell without re-measuring. On phones the ≤480px rule in
 * EMAIL_SIGNATURE_STYLE adds ~26 px to that column, so 360 px Android phones
 * fit too (measured 2026-11-26: card 131 px in every frame from 360 px up;
 * at 320 px the logo hides and the address breaks after "Ste 104,").
 *
 * ⚠️ The address + website strip is one line on a computer; on a phone the two
 * wrap onto two lines and the `<style>` rule centres them. A client that drops
 * `<style>` (Outlook desktop — where it is one line anyway) simply leaves them
 * left-aligned. Nothing else depends on the rule.
 */

export type SignatureLanguage = 'en' | 'es';

export const SIGNATURE_NAME = 'Chris Surette';

/** 112×86 PNG shown at 56×43 (2× for sharp phones). New file name = no stale cache. */
export const EMAIL_SIGNATURE_LOGO_PATH = '/assets/images/branding/email-signature-logo.png';

const WORDS = {
  en: { callOrText: 'Call or text' },
  // ◻ Spanish: draft for the translator (TASKS).
  es: { callOrText: 'Llame o escriba al' },
} as const;

const FONT = 'font-family:Arial,Helvetica,sans-serif;';
const SERIF = "font-family:Georgia,'Times New Roman',serif;";
const GOLD = '#735c00';
const LINK = `color:${GOLD};text-decoration:none;`;

/**
 * Phone-only rules (owner, 2026-11-26, mockup 7 "Build, keep Llame"):
 * - ≤480px: centre the address / website strip once it wraps, and tighten the
 *   logo + text cells (logo cell 88 → 66 px, text padding 24 → 20 px) so
 *   NAPLES ESTATE JEWELRY and "Llame o escriba al (239) 404-8505" stay on one
 *   line in the offer / availability / invoice frames on 360–375 px phones.
 *   The logo stays 56×43.
 * - ≤340px (2016 iPhone SE and smaller): hide the logo so the card fits.
 * A client that ignores `<style>` shows the computer layout — still correct,
 * just a line or two taller on a small phone.
 */
export const EMAIL_SIGNATURE_STYLE = '<style>'
  + '@media only screen and (max-width:480px){.nej-sig-strip{text-align:center !important;}'
  + '.nej-sig-logo{width:56px !important;padding:11px 0 11px 10px !important;}'
  + '.nej-sig-text{padding:11px 10px !important;}}'
  + '@media only screen and (max-width:340px){.nej-sig-logo{display:none !important;}'
  + '.nej-sig-text{padding:11px 12px !important;}}'
  + '</style>';

/** The HTML block. `marginTop` is the gap above the "— Chris Surette" line. */
export function chrisSignatureHtml(language: SignatureLanguage = 'en', options: { marginTop?: number } = {}): string {
  const words = WORDS[language];
  const siteUrl = getSiteUrl();
  const marginTop = options.marginTop ?? 0;
  return `${EMAIL_SIGNATURE_STYLE}
<div style="margin:${marginTop}px 0 0;${SERIF}font-size:20px;line-height:1.15;color:#1d1a14;white-space:nowrap;padding:0 0 7px;">&mdash;&nbsp;${escapeHtml(SIGNATURE_NAME)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;border:1px solid #d5c697;border-top:3px solid ${GOLD};background:#ffffff;border-collapse:separate;border-radius:4px;">
  <tr>
    <td width="72" valign="middle" align="center" class="nej-sig-logo" style="padding:11px 2px 11px 14px;"><img src="${escapeHtml(siteUrl + EMAIL_SIGNATURE_LOGO_PATH)}" width="56" height="43" alt="${escapeHtml(BUSINESS_NAME)}" style="display:block;width:56px;height:43px;border:0;" /></td>
    <td valign="middle" class="nej-sig-text" style="padding:11px 14px 11px 10px;${FONT}text-align:left;">
      <div style="font-size:12px;line-height:14px;letter-spacing:0.4px;text-transform:uppercase;font-weight:bold;color:${GOLD};margin:0 0 5px;">${escapeHtml(BUSINESS_NAME)}</div>
      <div style="font-size:12px;line-height:1.5;color:#333333;">${escapeHtml(words.callOrText)} <a href="tel:${CONTACT_PHONE_DIGITS}" style="${LINK}font-weight:bold;white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</a><br /><a href="mailto:${BUSINESS_EMAIL}" style="${LINK}">${escapeHtml(BUSINESS_EMAIL)}</a></div>
    </td>
  </tr>
  <tr>
    <td colspan="2" class="nej-sig-strip" style="padding:6px 7px 7px;border-top:1px solid #eee5cc;background:#fcfaf4;${FONT}font-size:12px;line-height:1.5;color:#5e5648;text-align:left;"><span style="display:inline-block;vertical-align:top;margin:0 7px;"><span style="white-space:nowrap;">${escapeHtml(streetLine())},</span> <span style="white-space:nowrap;">${escapeHtml(cityLine())}</span></span><a href="${escapeHtml(siteUrl)}" style="${LINK}display:inline-block;vertical-align:top;white-space:nowrap;margin:0 7px;">${escapeHtml(SITE_DOMAIN_LABEL)}</a></td>
  </tr>
</table>`;
}

/** The plain-text part of the same block. */
export function chrisSignatureText(language: SignatureLanguage = 'en'): string {
  return [
    `— ${SIGNATURE_NAME}`,
    BUSINESS_NAME,
    `${WORDS[language].callOrText} ${BUSINESS_PHONE}`,
    BUSINESS_EMAIL,
    addressOneLine(),
    SITE_DOMAIN_LABEL,
  ].join('\n');
}

/**
 * A line that IS the sign-off in a follow-up template ("Chris", "Chris
 * Surette", "— Chris"): it becomes the block. Owner-edited templates
 * (`follow_up_settings.templates`) still end with the old "Chris" line, so this
 * matches them too.
 */
export function isChrisSignOffLine(line: string): boolean {
  return /^(?:[—–-]\s*)?chris(?:\s+surette)?[.,]?$/i.test(line.trim());
}

/** The old "and the Naples Estate Jewelry Team" line under "Chris" — dropped (owner, 2026-11-26). */
export function isTeamLine(line: string): boolean {
  return /^(?:and the naples estate jewelry team|y el equipo de naples estate jewelry)[.,]?$/i.test(line.trim());
}
