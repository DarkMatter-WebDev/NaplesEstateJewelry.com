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
import { PICKUP_STATEMENT, PICKUP_STATEMENT_ES, pickupDateOnly, pickupItemDetail, type OrderPickupRow, type PickupPaperOrder } from '@/lib/order-pickup';
import type { OrderLanguage } from '@/lib/order-language';
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
export function pickupSignedLine(
  pickup: Pick<OrderPickupRow, 'sign_method' | 'signature_path' | 'signed_name' | 'signed_at' | 'picked_up_by' | 'picked_up_at'>,
  language: OrderLanguage = 'en',
): string {
  if (language === 'es') {
    if (pickup.sign_method === 'digital' && pickup.signature_path) {
      return `Firmado electrónicamente por ${pickup.signed_name || pickup.picked_up_by} el ${paperDateLine(pickup.signed_at ?? pickup.picked_up_at, 'es')}`;
    }
    return `Firmado en persona en el salón el ${pickupDateOnly(pickup.picked_up_at, 'es')}`;
  }
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

export function buildPickupEmail(order: PickupPaperOrder, pickup: OrderPickupRow, language: OrderLanguage = 'en'): PickupEmail {
  // The order's customer language (2026-11-21); English exactly as before.
  const es = language === 'es';
  const siteUrl = getSiteUrl();
  const subject = es ? `Su recibo de recogida — Pedido ${order.order_number}` : `Your pickup receipt — Order ${order.order_number}`;
  const hello = firstName(order.customer_name);
  const signed = pickupSignedLine(pickup, language);
  const statement = es ? PICKUP_STATEMENT_ES : PICKUP_STATEMENT;
  const heading = es ? 'Su recibo de recogida' : 'Your pickup receipt';
  const thanks = es
    ? `Gracias por recoger su pedido${hello ? `, ${hello}` : ''}. Esta es su copia para sus archivos.`
    : `Thank you for picking up your order${hello ? `, ${hello}` : ''}. Here is your copy for your records.`;
  const details = [
    { label: es ? 'Pedido' : 'Order', value: order.order_number },
    { label: es ? 'Fecha del pedido' : 'Ordered', value: pickupDateOnly(order.created_at, language) },
    { label: es ? 'Recogido' : 'Picked up', value: paperDateLine(pickup.picked_up_at, language) },
    { label: es ? 'Recogido por' : 'Picked up by', value: pickup.picked_up_by },
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
      const detail = pickupItemDetail(item, language);
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
              <tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.2;font-weight:700;color:${INK};padding:2px 0 4px;">${escapeHtml(heading)}</td></tr>
              <tr><td align="center" style="${tiny}font-size:13px;padding:0 10px 14px;">${escapeHtml(thanks)}</td></tr>
              <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${RULE};">${detailRows}</table></td></tr>
              <tr><td style="padding-top:10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}</table></td></tr>
              <tr><td style="padding-top:12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="${small}padding:8px 12px;background:#f3f8f5;border-left:3px solid #0f7a4f;">&#10003; ${escapeHtml(signed)}</td></tr></table></td></tr>
              <tr><td style="${tiny}font-style:italic;padding:12px 0 0;">&ldquo;${escapeHtml(statement)}&rdquo;</td></tr>
              <tr><td style="${small}padding:12px 0 0;">${es
                ? `<strong>Devoluciones:</strong> llame o envíe un texto al <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span> dentro de los 5 días posteriores a la recogida.`
                : `<strong>Returns:</strong> call or text <span style="white-space:nowrap;">${escapeHtml(BUSINESS_PHONE)}</span> within 5 days of pickup.`}</td></tr>
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
    `${BUSINESS_NAME} — ${heading}`,
    thanks,
    '',
    ...details.map((line) => `${line.label}: ${line.value}`),
    '',
    es ? 'Artículos:' : 'Items:',
    ...order.order_items.map((item, index) => {
      const detail = pickupItemDetail(item, language);
      return `  ${index + 1}. ${item.title_snapshot}${detail ? ` (${detail})` : ''}`;
    }),
    '',
    signed,
    '',
    `"${statement}"`,
    '',
    es
      ? `Devoluciones: llame o envíe un texto al ${BUSINESS_PHONE} dentro de los 5 días posteriores a la recogida.`
      : `Returns: call or text ${BUSINESS_PHONE} within 5 days of pickup.`,
    '',
    BUSINESS_NAME,
    addressOneLine(),
    `${BUSINESS_PHONE} · ${SITE_DOMAIN_LABEL}`,
  ].join('\n');

  return { subject, html, text };
}
