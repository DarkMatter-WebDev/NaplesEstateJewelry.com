// The seller's copy of a buy receipt as an email (pure: builds subject, HTML
// and text; sending lives in buy-receipt-mailer.ts).
//
// Why (2026-09-30): the owner wants a "send via email" box on the receipt —
// when the seller gave an email, their copy goes out as the receipt is saved.
// It is the SELLER'S copy: the printed Received-by line, no seller signature
// line, never the ID photo. Table-based HTML with inline styles, the same frame
// as the order emails (order-invoice-email.ts), so it renders in every mail app.
import { BUSINESS_NAME, addressOneLine } from '@/lib/business-location';
import { escapeHtml } from '@/lib/marketing-email-html';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL, getSiteUrl } from '@/lib/order-email-branding';
import {
  BUY_RECEIPT_ATTESTATION,
  BUY_RECEIPT_SIGNER_NAME,
  formatDob,
  formatReceiptDate,
  formatReceiptDateTime,
  paymentsLine,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';

export type BuyReceiptEmail = { subject: string; html: string; text: string };

/** The receipt rows that are shown: a blank optional field is simply left out. */
function sellerLines(row: BuyReceiptRow): { label: string; value: string }[] {
  const cityLine = [[row.seller_city, row.seller_state].filter(Boolean).join(', '), row.seller_zip].filter(Boolean).join(' ');
  const lines = [
    { label: 'Name', value: row.seller_name },
    { label: 'Phone', value: row.seller_phone ?? '' },
    { label: 'Email', value: row.seller_email ?? '' },
    { label: 'Street', value: row.seller_street ?? '' },
    { label: 'City, state, ZIP', value: cityLine },
    { label: 'ID type', value: row.seller_id_type ?? '' },
    { label: 'ID last 4', value: row.seller_id_last4 ?? '' },
    { label: 'Date of birth', value: formatDob(row.seller_dob) },
  ];
  return lines.filter((line) => line.value.trim() !== '');
}

function cell(text: string, extra = ''): string {
  return `<td style="padding:8px 0;border-bottom:1px solid #eadfbd;font-size:14px;color:#1d1a14;${extra}">${escapeHtml(text)}</td>`;
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

  const subject = `${isVoid ? 'VOID — ' : ''}Your receipt from ${BUSINESS_NAME} — ${number}`;

  const sellerRows = sellerLines(row)
    .map((line) => `<tr><td style="padding:5px 12px 5px 0;font-size:12px;color:#746b5b;white-space:nowrap;vertical-align:top;">${escapeHtml(line.label)}</td><td style="padding:5px 0;font-size:14px;color:#1d1a14;">${escapeHtml(line.value)}</td></tr>`)
    .join('');

  const itemRows = items
    .map((item, index) => `<tr>${cell(String(index + 1), 'color:#746b5b;width:24px;')}${cell(String(item.qty), 'width:36px;')}${cell(item.description)}${cell(formatCurrency(item.amount), 'text-align:right;white-space:nowrap;')}</tr>`)
    .join('');

  const html = `
    <div style="margin:0;padding:0;background:#f8f6ef;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6ef;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d1a14;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d5c697;">
              <tr>
                <td style="padding:26px 30px 16px;border-bottom:2px solid #735c00;">
                  <div style="color:#735c00;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;">${escapeHtml(BUSINESS_NAME)}</div>
                  <div style="margin-top:4px;color:#746b5b;font-size:13px;">${escapeHtml(addressOneLine())} &middot; <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span></div>
                  <div style="margin-top:14px;color:#735c00;font-family:Georgia,'Times New Roman',serif;font-size:18px;">Purchase receipt${isVoid ? ' &mdash; <span style="color:#a32d2d;">VOID</span>' : ''}</div>
                  <div style="margin-top:4px;color:#1d1a14;font-size:13px;">No. ${escapeHtml(number)} &middot; ${escapeHtml(date)} &middot; Seller&rsquo;s copy</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 30px;">
                  ${isVoid && row.void_reason ? `<p style="margin:0 0 16px;padding:10px 12px;border:1px solid #a32d2d;color:#a32d2d;font-size:13px;">This receipt was voided: ${escapeHtml(row.void_reason)}</p>` : ''}
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Thank you. Here is your copy of the receipt for the items ${escapeHtml(BUSINESS_NAME)} purchased from you.</p>

                  <div style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#1d1a14;border-bottom:1px solid #735c00;padding-bottom:4px;">Seller</div>
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">${sellerRows}</table>

                  <div style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#1d1a14;border-bottom:1px solid #735c00;padding-bottom:4px;">Items purchased</div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 6px;">
                    <tr>
                      <td style="padding:4px 0;font-size:11px;color:#746b5b;text-transform:uppercase;letter-spacing:1px;">#</td>
                      <td style="padding:4px 0;font-size:11px;color:#746b5b;text-transform:uppercase;letter-spacing:1px;">Qty</td>
                      <td style="padding:4px 0;font-size:11px;color:#746b5b;text-transform:uppercase;letter-spacing:1px;">Description</td>
                      <td align="right" style="padding:4px 0;font-size:11px;color:#746b5b;text-transform:uppercase;letter-spacing:1px;">Amount</td>
                    </tr>
                    ${itemRows}
                  </table>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;border-top:2px solid #735c00;">
                    <tr>
                      <td style="padding:10px 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:15px;">Total paid to seller</td>
                      <td align="right" style="padding:10px 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;white-space:nowrap;">${escapeHtml(total)}</td>
                    </tr>
                    <tr>
                      <td style="padding:2px 0;font-size:12px;color:#746b5b;">Paid by</td>
                      <td align="right" style="padding:2px 0;font-size:14px;">${escapeHtml(paid)}</td>
                    </tr>
                  </table>

                  ${row.notes ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.5;"><span style="color:#746b5b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Notes</span><br />${escapeHtml(row.notes).replace(/\n/g, '<br />')}</p>` : ''}

                  <p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#1d1a14;">${escapeHtml(BUY_RECEIPT_ATTESTATION)}</p>

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 6px;">
                    <tr>
                      <td style="padding:0 20px 0 0;border-bottom:1px solid #1d1a14;font-family:'Alex Brush','Brush Script MT','Segoe Script',cursive;font-size:30px;line-height:1.1;color:#1f2540;">${escapeHtml(BUY_RECEIPT_SIGNER_NAME)}</td>
                      <td width="150" style="width:150px;padding:0;border-bottom:1px solid #1d1a14;font-size:14px;color:#1d1a14;white-space:nowrap;">${escapeHtml(signedDate)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0 0;font-size:11px;color:#746b5b;text-transform:uppercase;letter-spacing:1px;">Received by &mdash; ${escapeHtml(BUY_RECEIPT_SIGNER_NAME)}, ${escapeHtml(BUSINESS_NAME)}</td>
                      <td style="padding:4px 0 0;font-size:11px;color:#746b5b;text-transform:uppercase;letter-spacing:1px;">Date</td>
                    </tr>
                  </table>

                  <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#746b5b;">Thank you for choosing ${escapeHtml(BUSINESS_NAME)}. Questions? Reply to this email or call <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span>.</p>
                  <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#9a8f7a;">
                    <a href="${escapeHtml(siteUrl)}" style="color:#735c00;font-weight:600;text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}</a> &middot; ${escapeHtml(addressOneLine())} &middot; <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    `${BUSINESS_NAME} — Purchase receipt ${number}${isVoid ? ' (VOID)' : ''}`,
    `${addressOneLine()} · ${BUSINESS_PHONE}`,
    `Date: ${date} · Seller's copy`,
    '',
    ...(isVoid && row.void_reason ? [`This receipt was voided: ${row.void_reason}`, ''] : []),
    `Thank you. Here is your copy of the receipt for the items ${BUSINESS_NAME} purchased from you.`,
    '',
    'Seller:',
    ...sellerLines(row).map((line) => `  ${line.label}: ${line.value}`),
    '',
    'Items purchased:',
    ...items.map((item, index) => `  ${index + 1}. Qty ${item.qty} — ${item.description} — ${formatCurrency(item.amount)}`),
    '',
    `Total paid to seller: ${total}`,
    `Paid by: ${paid}`,
    ...(row.notes ? ['', `Notes: ${row.notes}`] : []),
    '',
    BUY_RECEIPT_ATTESTATION,
    '',
    `Received by — ${BUY_RECEIPT_SIGNER_NAME}, ${BUSINESS_NAME} · ${signedDate}`,
    '',
    `Thank you for choosing ${BUSINESS_NAME}. Questions? Reply to this email or call ${BUSINESS_PHONE}.`,
    `${SITE_DOMAIN_LABEL} · ${addressOneLine()} · ${BUSINESS_PHONE}`,
  ].join('\n');

  return { subject, html, text };
}
