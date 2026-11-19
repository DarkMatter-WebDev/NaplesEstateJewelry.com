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
// date. Round two (owner, 2026-10-01, mockup v10): "Paid by: Cash" bold on the
// left and "Total paid to seller $x" bold on the right of ONE line, the total
// flush under the item amounts; "Received by:" as a caption ABOVE the line; the
// signature sitting on its rule; the footer as three centred lines.
// Table-based HTML with inline styles so it renders in every mail app.
//
// Spanish (owner, 2026-11-19): a receipt whose seller's copy is Spanish
// (`seller_language = 'es'`) emails in Spanish too — the same layout, the words
// from `BUY_RECEIPT_EMAIL_WORDS.es`. English is unchanged, word for word.
import { BUSINESS_NAME, addressOneLine } from '@/lib/business-location';
import {
  BUY_RECEIPT_ATTESTATION_SELLER_ES,
  BUY_RECEIPT_EMAIL_WORDS,
  idTypeLabel,
  type BuyReceiptEmailWords,
  type BuyReceiptLanguage,
} from '@/lib/buy-receipt-language';
import { escapeHtml } from '@/lib/marketing-email-html';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL, getSiteUrl } from '@/lib/order-email-branding';
import {
  BUY_RECEIPT_ATTESTATION_SELLER,
  BUY_RECEIPT_SIGNER_NAME,
  buyReceiptLanguage,
  buyReceiptShowsQty,
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
function detailLines(row: BuyReceiptRow, w: BuyReceiptEmailWords, language: BuyReceiptLanguage): { label: string; value: string }[] {
  const address = [row.seller_street, [[row.seller_city, row.seller_state].filter(Boolean).join(', '), row.seller_zip].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim())
    .join(', ');
  const id = [idTypeLabel(row.seller_id_type, language), row.seller_id_last4 ? `${w.last4} ${row.seller_id_last4}` : '', row.seller_dob ? `${w.dob} ${formatDob(row.seller_dob)}` : '']
    .filter(Boolean)
    .join(' · ');
  return [
    { label: w.seller, value: row.seller_name },
    { label: w.phone, value: row.seller_phone ?? '' },
    { label: w.email, value: row.seller_email ?? '' },
    { label: w.address, value: address },
    { label: w.id, value: id },
  ].filter((line) => line.value.trim() !== '');
}

export function buildBuyReceiptEmail(row: BuyReceiptRow): BuyReceiptEmail {
  const number = row.receipt_number;
  const language = buyReceiptLanguage(row);
  const w = BUY_RECEIPT_EMAIL_WORDS[language];
  const date = formatReceiptDateTime(row.created_at, language);
  const signedDate = formatReceiptDate(row.created_at, language);
  const items = row.items ?? [];
  // The same rule as the printed paper: no Qty column unless an older receipt has a real quantity.
  const showQty = buyReceiptShowsQty(items);
  const total = formatCurrency(row.total);
  const paid = paymentsLine(row.payments, language);
  const siteUrl = getSiteUrl();
  const isVoid = row.status === 'void';
  const itemsHeading = language === 'es' ? `Artículos comprados por ${BUSINESS_NAME}` : `Items purchased by ${BUSINESS_NAME}`;
  const attestation = language === 'es' ? BUY_RECEIPT_ATTESTATION_SELLER_ES : BUY_RECEIPT_ATTESTATION_SELLER;

  const subject = w.subject(BUSINESS_NAME, number, isVoid);

  const small = `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:${INK};`;
  const label = `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:${MUTED};`;
  const tiny = `font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:${MUTED};`;
  const caption = `font-family:Arial,Helvetica,sans-serif;font-size:9.5px;line-height:1.4;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};`;

  const detailRows = detailLines(row, w, language)
    .map((line) => `<tr><td style="${label}padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top;">${escapeHtml(line.label)}</td><td style="${small}padding:2px 0;">${escapeHtml(line.value)}</td></tr>`)
    .join('');

  const itemRows = items
    .map((item) => `<tr>
      <td style="${small}padding:6px 8px 6px 0;border-bottom:1px solid ${RULE};">${escapeHtml(item.description)}</td>
      ${showQty ? `<td align="center" style="${small}padding:6px 8px;border-bottom:1px solid ${RULE};white-space:nowrap;">${escapeHtml(String(item.qty))}</td>` : ''}
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

                  <p style="${small}margin:12px 0 2px;font-size:15px;font-weight:700;">${escapeHtml(w.yourReceipt)} &mdash; ${escapeHtml(number)}${isVoid ? ` <span style="color:#a32d2d;">(${escapeHtml(w.voidTag)})</span>` : ''}</p>
                  <p style="${tiny}margin:0 0 10px;">${w.sellersCopyHtml} &middot; ${escapeHtml(date)}</p>
                  ${isVoid && row.void_reason ? `<p style="${small}margin:0 0 10px;color:#a32d2d;">${escapeHtml(w.voidedBecause)} ${escapeHtml(row.void_reason)}</p>` : ''}

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};">
                    <tr><td style="padding:6px 0;"><table role="presentation" cellspacing="0" cellpadding="0">${detailRows}</table></td></tr>
                  </table>

                  <p style="${small}margin:12px 0 4px;font-weight:700;">${escapeHtml(itemsHeading)}</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="${tiny}padding:0 8px 4px 0;border-bottom:1px solid ${RULE};">${escapeHtml(w.item)}</td>
                      ${showQty ? `<td align="center" style="${tiny}padding:0 8px 4px;border-bottom:1px solid ${RULE};">${escapeHtml(w.qty)}</td>` : ''}
                      <td align="right" style="${tiny}padding:0 0 4px 8px;border-bottom:1px solid ${RULE};">${escapeHtml(w.amount)}</td>
                    </tr>
                    ${itemRows}
                    <tr>
                      <td style="${small}padding:8px 8px 0 0;vertical-align:bottom;font-size:14px;font-weight:700;">${escapeHtml(w.paidBy)} ${escapeHtml(paid)}</td>
                      <td${showQty ? ' colspan="2"' : ''} align="right" style="${small}padding:8px 0 0 8px;font-size:14px;font-weight:700;white-space:nowrap;">${escapeHtml(w.totalPaid)}&nbsp;&nbsp;&nbsp;${escapeHtml(total)}</td>
                    </tr>
                  </table>

                  ${row.notes ? `<p style="${tiny}margin:10px 0 0;">${escapeHtml(w.notes)} ${escapeHtml(row.notes).replace(/\n/g, '<br />')}</p>` : ''}
                  <p style="${tiny}margin:10px 0 0;font-size:10.5px;line-height:1.4;">${escapeHtml(attestation)}</p>

                  <p style="${caption}margin:12px 4px 0;">${escapeHtml(w.receivedBy)}</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:0 4px 0;border-bottom:1px solid ${INK};vertical-align:bottom;font-family:'Alex Brush','Brush Script MT','Segoe Script',cursive;font-size:17px;line-height:0.9;color:#1f2540;">${escapeHtml(BUY_RECEIPT_SIGNER_NAME)}</td>
                      <td align="right" style="padding:0 4px 2px;border-bottom:1px solid ${INK};vertical-align:bottom;${tiny}color:${INK};white-space:nowrap;">${escapeHtml(signedDate)}</td>
                    </tr>
                    <tr>
                      <td style="${label}padding:1px 4px 0;">${escapeHtml(BUY_RECEIPT_SIGNER_NAME)}, ${escapeHtml(BUSINESS_NAME)}</td>
                      <td align="right" style="${label}padding:1px 4px 0;">${escapeHtml(w.date)}</td>
                    </tr>
                  </table>

                  <p style="${tiny}margin:14px 0 0;text-align:center;">${escapeHtml(w.thanks(BUSINESS_NAME))}</p>
                  <p style="${tiny}margin:2px 0 0;text-align:center;">${escapeHtml(w.questionsHtmlBefore)} <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span>.</p>
                  <p style="${tiny}margin:2px 0 0;text-align:center;"><a href="${escapeHtml(siteUrl)}" style="color:${GOLD};text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}</a></p>
                  <p style="${tiny}margin:0;text-align:center;white-space:nowrap;">${escapeHtml(addressOneLine())}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    `${BUSINESS_NAME} — ${w.yourReceipt} ${number}${isVoid ? ` (${w.voidTag})` : ''}`,
    `${addressOneLine()} · ${BUSINESS_PHONE}`,
    `${w.sellersCopyText} · ${date}`,
    '',
    ...(isVoid && row.void_reason ? [`${w.voidedBecause} ${row.void_reason}`, ''] : []),
    ...detailLines(row, w, language).map((line) => `${line.label}: ${line.value}`),
    '',
    `${itemsHeading}:`,
    ...items.map((item, index) => `  ${index + 1}. ${item.description}${showQty ? ` — ${w.qtyInline} ${item.qty}` : ''} — ${formatCurrency(item.amount)}`),
    '',
    `${w.paidBy} ${paid}`,
    `${w.totalPaid}: ${total}`,
    ...(row.notes ? ['', `${w.notes} ${row.notes}`] : []),
    '',
    attestation,
    '',
    `${w.receivedBy} ${BUY_RECEIPT_SIGNER_NAME}, ${BUSINESS_NAME} · ${signedDate}`,
    '',
    w.thanks(BUSINESS_NAME),
    w.questions(BUSINESS_PHONE),
    `${SITE_DOMAIN_LABEL} · ${addressOneLine()}`,
  ].join('\n');

  return { subject, html, text };
}
