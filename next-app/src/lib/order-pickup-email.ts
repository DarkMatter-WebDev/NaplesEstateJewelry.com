// The customer's pickup copy as an email (owner, 2026-11-21: "similar to how
// we give the option to email the customer on the buy receipt"). Pure: builds
// subject, HTML and text; sending lives in `order-pickup-server.ts`.
//
// Same light, compact look as the buy-receipt email (`buy-receipt-email.ts`):
// white, a small octopus logo, one details list, the items (NO prices), the
// signed line, the statement, the 5-day return line, a centred footer.
//
// ⛔ Never in it: the ID photo, the ID type or last 4, the signature picture,
// prices. It goes to the BUYER (the order's email) even when someone else
// picked up.
import { BUSINESS_NAME, addressOneLine } from '@/lib/business-location';
import { escapeHtml } from '@/lib/marketing-email-html';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL, getSiteUrl } from '@/lib/order-email-branding';
import { paperDateLine } from '@/lib/order-receipt-paper';
import { PICKUP_STATEMENT, pickupDateOnly, pickupItemDetail, type OrderPickupRow, type PickupPaperOrder } from '@/lib/order-pickup';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';

export type PickupEmail = { subject: string; html: string; text: string };

/** Shown in the order's email history as "Pickup Receipt". */
export const PICKUP_EMAIL_TYPE = 'pickup_receipt';

const LOGO_PATH = '/assets/images/branding/email-logo.png';
const INK = '#1d1a14';
const MUTED = '#746b5b';
const RULE = '#eadfbd';
const GOLD = '#735c00';

function firstName(name: string | null | undefined): string {
  const word = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  return word.length > 1 ? word : '';
}

/** "Signed electronically by …" for a finger signature; "Signed in person …" for paper. */
export function pickupSignedLine(pickup: Pick<OrderPickupRow, 'sign_method' | 'signature_path' | 'signed_name' | 'signed_at' | 'picked_up_by' | 'picked_up_at'>): string {
  if (pickup.sign_method === 'digital' && pickup.signature_path) {
    return `Signed electronically by ${pickup.signed_name || pickup.picked_up_by} on ${paperDateLine(pickup.signed_at ?? pickup.picked_up_at)}`;
  }
  return `Signed in person at the showroom on ${pickupDateOnly(pickup.picked_up_at)}`;
}

function absoluteImage(src: string | null, siteUrl: string): string | null {
  const image = normalizeLegacyLocalImageUrl(src);
  if (!image) return null;
  return /^https?:\/\//i.test(image) ? image : `${siteUrl}${image.startsWith('/') ? '' : '/'}${image}`;
}

export function buildPickupEmail(order: PickupPaperOrder, pickup: OrderPickupRow): PickupEmail {
  const siteUrl = getSiteUrl();
  const subject = `Your pickup receipt — Order ${order.order_number}`;
  const hello = firstName(order.customer_name);
  const signed = pickupSignedLine(pickup);
  const details = [
    { label: 'Order', value: order.order_number },
    { label: 'Ordered', value: pickupDateOnly(order.created_at) },
    { label: 'Picked up', value: paperDateLine(pickup.picked_up_at) },
    { label: 'Picked up by', value: pickup.picked_up_by },
  ].filter((line) => line.value);

  const small = `font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${INK};`;
  const label = `font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;color:${GOLD};`;
  const tiny = `font-family:Arial,Helvetica,sans-serif;font-size:11.5px;line-height:1.5;color:${MUTED};`;

  const detailRows = details
    .map((line) => `<tr><td style="${label}padding:5px 12px 5px 0;border-bottom:1px solid ${RULE};white-space:nowrap;vertical-align:top;">${escapeHtml(line.label)}</td><td align="right" style="${small}padding:5px 0;border-bottom:1px solid ${RULE};">${escapeHtml(line.value)}</td></tr>`)
    .join('');

  const itemRows = order.order_items
    .map((item) => {
      const image = absoluteImage(item.image_snapshot, siteUrl);
      const detail = pickupItemDetail(item);
      return `<tr>
        <td width="44" style="padding:6px 10px 6px 0;vertical-align:middle;">${image ? `<img src="${escapeHtml(image)}" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border:1px solid ${RULE};border-radius:4px;object-fit:cover;" />` : ''}</td>
        <td style="${small}padding:6px 0;vertical-align:middle;">${escapeHtml(item.title_snapshot)}${detail ? `<br><span style="${tiny}">${escapeHtml(detail)}</span>` : ''}</td>
      </tr>`;
    })
    .join('');

  const html = `
    <div style="margin:0;padding:0;background:#ffffff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
        <tr>
          <td align="center" style="padding:16px 14px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
              <tr><td align="center" style="padding:4px 0 6px;"><img src="${escapeHtml(siteUrl + LOGO_PATH)}" width="52" height="40" alt="${escapeHtml(BUSINESS_NAME)}" style="display:block;width:52px;height:40px;border:0;" /></td></tr>
              <tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.2;font-weight:700;color:${INK};padding:2px 0 4px;">Your pickup receipt</td></tr>
              <tr><td align="center" style="${tiny}font-size:13px;padding:0 10px 14px;">Thank you for picking up your order${hello ? `, ${escapeHtml(hello)}` : ''}. Here is your copy for your records.</td></tr>
              <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${RULE};">${detailRows}</table></td></tr>
              <tr><td style="padding-top:10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}</table></td></tr>
              <tr><td style="padding-top:12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="${small}padding:8px 12px;background:#f3f8f5;border-left:3px solid #0f7a4f;">&#10003; ${escapeHtml(signed)}</td></tr></table></td></tr>
              <tr><td style="${tiny}font-style:italic;padding:12px 0 0;">&ldquo;${escapeHtml(PICKUP_STATEMENT)}&rdquo;</td></tr>
              <tr><td style="${small}padding:12px 0 0;"><strong>Returns:</strong> call or text <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span> within 5 days of pickup.</td></tr>
              <tr><td align="center" style="${tiny}padding:18px 0 0;border-bottom:0;">
                <div style="border-top:1px solid ${RULE};padding-top:12px;">${escapeHtml(BUSINESS_NAME)}<br>${escapeHtml(addressOneLine())}<br><span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span> &middot; <a href="${escapeHtml(siteUrl)}" style="color:${GOLD};text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}</a></div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    `${BUSINESS_NAME} — Your pickup receipt`,
    `Thank you for picking up your order${hello ? `, ${hello}` : ''}. Here is your copy for your records.`,
    '',
    ...details.map((line) => `${line.label}: ${line.value}`),
    '',
    'Items:',
    ...order.order_items.map((item, index) => {
      const detail = pickupItemDetail(item);
      return `  ${index + 1}. ${item.title_snapshot}${detail ? ` (${detail})` : ''}`;
    }),
    '',
    signed,
    '',
    `"${PICKUP_STATEMENT}"`,
    '',
    `Returns: call or text ${BUSINESS_PHONE} within 5 days of pickup.`,
    '',
    BUSINESS_NAME,
    addressOneLine(),
    `${BUSINESS_PHONE} · ${SITE_DOMAIN_LABEL}`,
  ].join('\n');

  return { subject, html, text };
}
