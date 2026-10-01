// The seller's copy of a buy receipt as an email (pure: builds subject, HTML
// and text; sending lives in buy-receipt-mailer.ts).
//
// Why (2026-09-30): the owner wants a "send via email" box on the receipt —
// when the seller gave an email, their copy goes out as the receipt is saved.
// It is the SELLER'S copy: the printed Received-by line, no seller signature
// line, never the ID photo.
//
// Look (owner, 2026-09-30, after a Staples receipt email): white, compact
// 12px text close to the edges, no outer frame, a small octopus logo, one short
// details list, the items table, total and paid-by, the ownership statement
// in the third person ("The seller certifies…" — "I certify" read as if the
// owner were certifying), and a small signature sharing ONE underline with the
// date. Table-based HTML with inline styles so it renders in every mail app.
import { BUSINESS_NAME, addressOneLine } from '@/lib/business-location';
import { escapeHtml } from '@/lib/marketing-email-html';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL, getSiteUrl } from '@/lib/order-email-branding';
import {
  BUY_RECEIPT_ATTESTATION_SELLER,
  BUY_RECEIPT_SIGNER_NAME,
  formatDob,
  formatReceiptDate,
  formatReceiptDateTime,
  paymentsLine,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';

export type BuyReceiptEmail = { subject: string; html: string; text: string };

/** PNG, not the site's WebP: Outlook cannot show WebP. 157 × 120 source → 40 × 31. */
export const BUY_RECEIPT_EMAIL_LOGO_PATH = '/assets/images/branding/email-logo.png';

const INK = '#1d1a14';
const MUTED = '#746b5b';
const RULE = '#eadfbd';
const GOLD = '#735c00';

/** The details that were filled in; a blank optional field is left out. */
function detailLines(row: BuyReceiptRow): { label: string; value: string }[] {
  const address = [row.seller_street, [[row.seller_city, row.seller_state].filter(Boolean).join(', '), row.seller_zip].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim())
    .join(', ');
  const id = [row.seller_id_type, row.seller_id_last4 ? `last 4: ${row.seller_id_last4}` : '', row.seller_dob ? `DOB ${formatDob(row.seller_dob)}` : '']
    .filter(Boolean)
    .join(' · ');
  return [
    { label: 'Seller', value: row.seller_name },
    { label: 'Phone', value: row.seller_phone ?? '' },
    { label: 'Email', value: row.seller_email ?? '' },
    { label: 'Address', value: address },
    { label: 'ID', value: id },
  ].filter((line) => line.value.trim() !== '');
}

export function buildBuyReceiptEmail(row: BuyReceiptRow): BuyReceiptEmail {
  const number = row.receipt_number;
  const date = formatReceiptDateTime(row.created_at);
  const signedDate = formatReceiptDate(row.created_at);
  const items = row.items ?? [];
  const total = formatCurrency(row.total);
  const paid = paymentsLine(row.payments);
  const siteUrl = getSiteUrl();
  const isVoid = row.status === 'void';
  const itemsHeading = `Items purchased by ${BUSINESS_NAME}`;

  const subject = `${isVoid ? 'VOID — ' : ''}Your receipt from ${BUSINESS_NAME} — ${number}`;

  const small = `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:${INK};`;
  const label = `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:${MUTED};`;
  const tiny = `font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:${MUTED};`;

  const detailRows = detailLines(row)
    .map((line) => `<tr><td style="${label}padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top;">${escapeHtml(line.label)}</td><td style="${small}padding:2px 0;">${escapeHtml(line.value)}</td></tr>`)
    .join('');

  const itemRows = items
    .map((item) => `<tr>
      <td style="${small}padding:6px 8px 6px 0;border-bottom:1px solid ${RULE};">${escapeHtml(item.description)}</td>
      <td align="center" style="${small}padding:6px 8px;border-bottom:1px solid ${RULE};white-space:nowrap;">${escapeHtml(String(item.qty))}</td>
      <td align="right" style="${small}padding:6px 0 6px 8px;border-bottom:1px solid ${RULE};white-space:nowrap;">${escapeHtml(formatCurrency(item.amount))}</td>
    </tr>`)
    .join('');

  const html = `
    <div style="margin:0;padding:0;background:#ffffff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
        <tr>
          <td align="center" style="padding:14px 14px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
              <tr>
                <td>
                  <table role="presentation" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:0 10px 0 0;vertical-align:middle;"><img src="${escapeHtml(siteUrl + BUY_RECEIPT_EMAIL_LOGO_PATH)}" width="40" height="31" alt="" style="display:block;width:40px;height:31px;border:0;" /></td>
                      <td style="vertical-align:middle;">
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.1;color:${GOLD};">${escapeHtml(BUSINESS_NAME)}</div>
                        <div style="${tiny}">${escapeHtml(addressOneLine())} &middot; <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span></div>
                      </td>
                    </tr>
                  </table>

                  <p style="${small}margin:12px 0 2px;font-size:15px;font-weight:700;">Your receipt &mdash; ${escapeHtml(number)}${isVoid ? ' <span style="color:#a32d2d;">(VOID)</span>' : ''}</p>
                  <p style="${tiny}margin:0 0 10px;">Seller&rsquo;s copy &middot; ${escapeHtml(date)}</p>
                  ${isVoid && row.void_reason ? `<p style="${small}margin:0 0 10px;color:#a32d2d;">This receipt was voided: ${escapeHtml(row.void_reason)}</p>` : ''}

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};">
                    <tr><td style="padding:6px 0;"><table role="presentation" cellspacing="0" cellpadding="0">${detailRows}</table></td></tr>
                  </table>

                  <p style="${small}margin:12px 0 4px;font-weight:700;">${escapeHtml(itemsHeading)}</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="${tiny}padding:0 8px 4px 0;border-bottom:1px solid ${RULE};">Item</td>
                      <td align="center" style="${tiny}padding:0 8px 4px;border-bottom:1px solid ${RULE};">Qty</td>
                      <td align="right" style="${tiny}padding:0 0 4px 8px;border-bottom:1px solid ${RULE};">Amount</td>
                    </tr>
                    ${itemRows}
                    <tr>
                      <td colspan="2" style="${small}padding:8px 8px 2px 0;font-size:14px;font-weight:700;">Total paid to seller</td>
                      <td align="right" style="${small}padding:8px 0 2px 8px;font-size:14px;font-weight:700;white-space:nowrap;">${escapeHtml(total)}</td>
                    </tr>
                    <tr>
                      <td colspan="2" style="${label}padding:0 8px 0 0;">Paid by</td>
                      <td align="right" style="${small}padding:0 0 0 8px;">${escapeHtml(paid)}</td>
                    </tr>
                  </table>

                  ${row.notes ? `<p style="${tiny}margin:10px 0 0;">Notes: ${escapeHtml(row.notes).replace(/\n/g, '<br />')}</p>` : ''}
                  <p style="${tiny}margin:10px 0 0;font-size:10.5px;line-height:1.4;">${escapeHtml(BUY_RECEIPT_ATTESTATION_SELLER)}</p>

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">
                    <tr>
                      <td style="padding:0 4px 2px;border-bottom:1px solid ${INK};vertical-align:bottom;font-family:'Alex Brush','Brush Script MT','Segoe Script',cursive;font-size:14px;line-height:1.1;color:#1f2540;">${escapeHtml(BUY_RECEIPT_SIGNER_NAME)}</td>
                      <td align="right" style="padding:0 4px 2px;border-bottom:1px solid ${INK};vertical-align:bottom;${tiny}color:${INK};white-space:nowrap;">${escapeHtml(signedDate)}</td>
                    </tr>
                    <tr>
                      <td style="padding:3px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Received by &mdash; ${escapeHtml(BUY_RECEIPT_SIGNER_NAME)}, ${escapeHtml(BUSINESS_NAME)}</td>
                      <td align="right" style="padding:3px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Date</td>
                    </tr>
                  </table>

                  <p style="${tiny}margin:14px 0 0;text-align:center;">Thank you for choosing ${escapeHtml(BUSINESS_NAME)}. Questions? Reply to this email or call <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span>.<br /><a href="${escapeHtml(siteUrl)}" style="color:${GOLD};text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}</a> &middot; ${escapeHtml(addressOneLine())}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    `${BUSINESS_NAME} — Your receipt ${number}${isVoid ? ' (VOID)' : ''}`,
    `${addressOneLine()} · ${BUSINESS_PHONE}`,
    `Seller's copy · ${date}`,
    '',
    ...(isVoid && row.void_reason ? [`This receipt was voided: ${row.void_reason}`, ''] : []),
    ...detailLines(row).map((line) => `${line.label}: ${line.value}`),
    '',
    `${itemsHeading}:`,
    ...items.map((item, index) => `  ${index + 1}. ${item.description} — qty ${item.qty} — ${formatCurrency(item.amount)}`),
    '',
    `Total paid to seller: ${total}`,
    `Paid by: ${paid}`,
    ...(row.notes ? ['', `Notes: ${row.notes}`] : []),
    '',
    BUY_RECEIPT_ATTESTATION_SELLER,
    '',
    `Received by — ${BUY_RECEIPT_SIGNER_NAME}, ${BUSINESS_NAME} · ${signedDate}`,
    '',
    `Thank you for choosing ${BUSINESS_NAME}. Questions? Reply to this email or call ${BUSINESS_PHONE}.`,
    `${SITE_DOMAIN_LABEL} · ${addressOneLine()}`,
  ].join('\n');

  return { subject, html, text };
}
