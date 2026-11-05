import type { FulfillmentStatus, Order } from '@/types/sales';
import { orderStatusLabel } from '@/types/sales';
import { BUSINESS_PHONE, buildOrderEmailFooterHtml, buildOrderEmailFooterTextLines, pinPhoneToOneLine } from '@/lib/order-email-branding';
import { GOOGLE_REVIEW_URL } from '@/lib/business-location';
import { trackingUrl } from '@/lib/order-lookup';
import { compactTrackingNumber, formatTrackingNumber, type ScanTimeParts } from '@/lib/shipment-tracking';

export interface FulfillmentUpdateEmailContent {
  subject: string;
  html: string;
  text: string;
}

type FulfillmentEmailOrder = Pick<
  Order,
  'order_number' | 'customer_name' | 'shipping_carrier' | 'tracking_number'
>;

const STATUS_MESSAGES: Record<FulfillmentStatus, string> = {
  pending: 'Your order is being prepared.',
  packed: 'Your order has been packed and is being prepared for its next step.',
  shipped: 'Your order has shipped!',
  picked_up: 'Your order has been picked up. Thank you for shopping with us!',
  cancelled: 'Your order has been cancelled.',
};

const GOLD = '#735c00';
const INK = '#1d1a14';
const MUTED = '#746b5b';
// Sent from a no-reply address, so don't invite replies — direct to phone/text.
const NOTE = `Call or text us at ${BUSINESS_PHONE} with any questions.`;
const CLOSING = 'Thank you, NaplesEstateJewelry.com';

export interface FulfillmentEmailOptions {
  /**
   * True when the site will follow this package and send the out-for-delivery
   * and delivered emails (EasyPost connected + a tracking number). Only then
   * does the shipped email promise them.
   */
  deliveryUpdates?: boolean;
}

/**
 * The email for a fulfillment change the owner makes in Admin → Orders.
 *
 * "Shipped" has the delivery-tracking design (owner, 2026-11-05, mockup 4):
 * its own subject, a Shipped → Out for delivery → Delivered line, a Track Your
 * Package button. Every other status keeps the original "Order Update" email.
 */
export function buildFulfillmentUpdateEmailContent(
  order: FulfillmentEmailOrder,
  status: FulfillmentStatus,
  options: FulfillmentEmailOptions = {},
): FulfillmentUpdateEmailContent {
  if (status === 'shipped') return buildShippedEmailContent(order, options);

  const customerName = order.customer_name || 'there';
  const statusLabel = orderStatusLabel(status);
  const subject = `Update on your order ${order.order_number} from Naples Estate Jewelry`;
  const greeting = `Hi ${customerName},`;
  const message = STATUS_MESSAGES[status] ?? `Your order status has been updated to ${statusLabel}.`;
  const shippingCarrier = order.shipping_carrier?.trim() || null;
  const trackingNumber = order.tracking_number?.trim() || null;
  const shipmentText = [
    shippingCarrier ? `Carrier: ${shippingCarrier}` : null,
    trackingNumber ? `Tracking number: ${trackingNumber}` : null,
  ].filter((line): line is string => Boolean(line));
  const shipmentHtml = shippingCarrier || trackingNumber
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f8f6ef;border:1px solid #d5c697;">
        ${shippingCarrier ? `<tr><td style="padding:12px 14px 4px;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;">Carrier</td><td style="padding:12px 14px 4px;color:${INK};font-size:14px;font-weight:700;text-align:right;">${escapeHtml(shippingCarrier)}</td></tr>` : ''}
        ${trackingNumber ? `<tr><td style="padding:4px 14px 12px;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tracking number</td><td style="padding:4px 14px 12px;color:${INK};font-size:14px;font-weight:700;text-align:right;word-break:break-all;">${escapeHtml(trackingNumber)}</td></tr>` : ''}
      </table>
    `
    : '';

  const text = [
    greeting,
    '',
    message,
    '',
    `Order: ${order.order_number}`,
    `Status: ${statusLabel}`,
    ...shipmentText,
    '',
    NOTE,
    CLOSING,
    '',
    ...buildOrderEmailFooterTextLines(order.order_number),
  ].join('\n');

  const html = emailShell({
    title: 'Order Update',
    orderNumber: order.order_number,
    statusLabel,
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtml(message)}</p>
      ${shipmentHtml}
    `,
  });

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Shipped / Out for delivery / Delivered — the delivery-tracking emails
// ---------------------------------------------------------------------------

export interface DeliveryScan {
  /** When the scan happened, in the scan's local time (formatScanTime). */
  when: ScanTimeParts | null;
  /** "Naples, FL 34102" (formatScanPlace). */
  place: string | null;
  /** Delivered only: "Left with Individual" (deliveredWhere). */
  where: string | null;
}

export type DeliveryEmailKind = 'out_for_delivery' | 'delivered';

function buildShippedEmailContent(order: FulfillmentEmailOrder, options: FulfillmentEmailOptions): FulfillmentUpdateEmailContent {
  const parts = shipmentParts(order);
  const promiseUpdates = Boolean(options.deliveryUpdates && parts.trackingNumber);
  const subject = `Your order ${order.order_number} has shipped`;
  const greeting = `Hi ${order.customer_name || 'there'},`;
  const message = STATUS_MESSAGES.shipped;
  const followUp = 'We’ll email you again when it’s out for delivery and when it’s delivered.';

  const html = emailShell({
    title: 'Your Order Has Shipped',
    orderNumber: order.order_number,
    statusLabel: 'Shipped',
    bodyHtml: `
      ${paragraph(escapeHtml(greeting), 14)}
      ${paragraph(escapeHtml(message))}
      ${progressLine(1)}
      ${detailTable([
        parts.carrier ? labelValueRow('Carrier', escapeHtml(parts.carrier)) : null,
        parts.trackingNumber ? trackingRow(parts.trackingNumber) : null,
      ])}
      ${parts.link ? goldButton('Track Your Package', parts.link) : ''}
      ${promiseUpdates ? paragraph(followUp) : ''}
    `,
  });

  const text = [
    greeting,
    '',
    message,
    '',
    `Order: ${order.order_number}`,
    'Status: Shipped',
    ...shipmentTextLines(parts),
    ...(promiseUpdates ? ['', followUp] : []),
    '',
    NOTE,
    CLOSING,
    '',
    ...buildOrderEmailFooterTextLines(order.order_number),
  ].join('\n');

  return { subject, html, text };
}

/**
 * The two automatic emails, sent when the carrier scans the package (EasyPost
 * webhook or the hourly sweep — `order-tracking-server.ts`).
 *
 * Every shipped order needs a signature (checkout: "Fully insured shipping
 * with delivery signature"; shipping-service.ts lists "signature" for
 * Priority, Registered and Express), so the out-for-delivery email always
 * says so (owner, 2026-11-05).
 */
export function buildDeliveryUpdateEmailContent(
  order: FulfillmentEmailOrder,
  kind: DeliveryEmailKind,
  scan: DeliveryScan,
): FulfillmentUpdateEmailContent {
  const parts = shipmentParts(order);
  const greeting = `Hi ${order.customer_name || 'there'},`;
  const when = scan.when ? `${scan.when.date} · ${scan.when.time}` : null;

  if (kind === 'out_for_delivery') {
    const subject = `Your order ${order.order_number} is out for delivery`;
    const message = 'Good news — your package is on the delivery truck and should arrive today.';
    const signatureLead = 'Someone will need to be there to sign for it.';
    const signatureRest = `If no one is home, ${parts.carrier || 'the carrier'} will leave a notice so you can pick it up or schedule redelivery.`;
    const scanLines = [scan.place, scan.when?.time ?? null].filter((line): line is string => Boolean(line));
    const latestScanHtml = `Out for Delivery${scanLines
      .map((line) => `<br><span style="font-weight:400;color:${MUTED};white-space:nowrap;">${escapeHtml(line)}</span>`)
      .join('')}`;

    const html = emailShell({
      title: 'Out for Delivery Today',
      orderNumber: order.order_number,
      statusLabel: 'Out for Delivery',
      bodyHtml: `
        ${paragraph(escapeHtml(greeting), 14)}
        ${paragraph(escapeHtml(message))}
        ${progressLine(2)}
        ${detailTable([
          labelValueRow('Latest scan', latestScanHtml),
          parts.carrier ? labelValueRow('Carrier', escapeHtml(parts.carrier)) : null,
          parts.trackingNumber ? trackingRow(parts.trackingNumber) : null,
        ])}
        ${paragraph(`<strong>${escapeHtml(signatureLead)}</strong> ${escapeHtml(signatureRest)}`)}
        ${parts.link ? goldButton('Track Your Package', parts.link) : ''}
      `,
    });

    const text = [
      greeting,
      '',
      message,
      '',
      `Order: ${order.order_number}`,
      'Status: Out for Delivery',
      `Latest scan: Out for Delivery${scanLines.length ? ` — ${scanLines.join(', ')}` : ''}`,
      ...shipmentTextLines(parts),
      '',
      `${signatureLead} ${signatureRest}`,
      '',
      NOTE,
      CLOSING,
      '',
      ...buildOrderEmailFooterTextLines(order.order_number),
    ].join('\n');

    return { subject, html, text };
  }

  const subject = `Your order ${order.order_number} was delivered`;
  const message = 'USPS reports your package was delivered. We hope you love it!';
  const notHereLead = 'Not in your hands yet?';
  const notHereRest = `Don’t worry — carriers sometimes record a package as delivered a little before it actually reaches the door, and it usually turns up by the next day. If it still hasn’t arrived by the end of tomorrow, call or text us at ${BUSINESS_PHONE} and we’ll look into it right away.`;
  const reviewLead = 'Happy with your piece? A quick Google review helps a small Naples business like ours.';
  const carrierName = parts.carrier || 'The carrier';
  const deliveredMessage = carrierName === 'USPS' ? message : message.replace('USPS', carrierName);

  const html = emailShell({
    title: 'Your Order Was Delivered',
    orderNumber: order.order_number,
    statusLabel: 'Delivered',
    bodyHtml: `
      ${paragraph(escapeHtml(greeting), 14)}
      ${paragraph(escapeHtml(deliveredMessage))}
      ${progressLine(3)}
      ${detailTable([
        when ? labelValueRow('Delivered', `<span style="white-space:nowrap;">${escapeHtml(when)}</span>`) : null,
        scan.where
          ? labelValueRow('Where', `${escapeHtml(scan.where)}<br><span style="font-weight:400;color:${MUTED};font-size:12px;">as reported by ${escapeHtml(parts.carrier || 'the carrier')}</span>`)
          : null,
        parts.trackingNumber ? trackingRow(parts.trackingNumber) : null,
      ])}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#fffaf0;border-left:3px solid ${GOLD};">
        <tr><td style="padding:14px 16px;font-size:15px;line-height:1.55;"><strong>${escapeHtml(notHereLead)}</strong> ${pinPhoneToOneLine(escapeHtml(notHereRest))}</td></tr>
      </table>
      ${paragraph(`${escapeHtml(reviewLead)} <a href="${escapeHtml(GOOGLE_REVIEW_URL)}" style="color:${GOLD};font-weight:700;text-decoration:underline;">Leave us a review</a>`)}
    `,
  });

  const text = [
    greeting,
    '',
    deliveredMessage,
    '',
    `Order: ${order.order_number}`,
    'Status: Delivered',
    ...(when ? [`Delivered: ${when}`] : []),
    ...(scan.where ? [`Where: ${scan.where} (as reported by ${parts.carrier || 'the carrier'})`] : []),
    ...(parts.trackingNumber ? [`Tracking number: ${parts.trackingNumber}`] : []),
    '',
    `${notHereLead} ${notHereRest}`,
    '',
    `${reviewLead} Leave us a review: ${GOOGLE_REVIEW_URL}`,
    '',
    NOTE,
    CLOSING,
    '',
    ...buildOrderEmailFooterTextLines(order.order_number),
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

interface ShipmentParts {
  carrier: string | null;
  /** Display form ("9405 5112 …"). */
  trackingNumber: string | null;
  link: string | null;
}

function shipmentParts(order: FulfillmentEmailOrder): ShipmentParts {
  const carrier = order.shipping_carrier?.trim() || null;
  const typed = order.tracking_number?.trim() || null;
  return {
    carrier,
    trackingNumber: typed ? formatTrackingNumber(typed) : null,
    link: typed ? trackingUrl(carrier, compactTrackingNumber(typed)) : null,
  };
}

function shipmentTextLines(parts: ShipmentParts): string[] {
  return [
    parts.carrier ? `Carrier: ${parts.carrier}` : null,
    parts.trackingNumber ? `Tracking number: ${parts.trackingNumber}` : null,
    parts.link ? `Track your package: ${parts.link}` : null,
  ].filter((line): line is string => Boolean(line));
}

function emailShell({ title, orderNumber, statusLabel, bodyHtml }: { title: string; orderNumber: string; statusLabel: string; bodyHtml: string }) {
  return `
    <div style="margin:0;padding:0;background:#f8f6ef;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6ef;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d5c697;">
              <tr>
                <td style="padding:28px 30px 18px;border-bottom:1px solid #d5c697;">
                  <div style="color:${GOLD};font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">NaplesEstateJewelry.com</div>
                  <h1 style="margin:10px 0 0;color:${INK};font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;">${escapeHtml(title)}</h1>
                  <p style="margin:8px 0 0;color:${MUTED};font-size:13px;">Order ${escapeHtml(orderNumber)} - ${escapeHtml(statusLabel)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 30px;text-align:left;">
                  ${bodyHtml}
                  <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">${pinPhoneToOneLine(escapeHtml(NOTE))}</p>
                  <p style="margin:0;font-size:15px;line-height:1.55;">${escapeHtml(CLOSING)}</p>
                  ${buildOrderEmailFooterHtml(orderNumber)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function paragraph(innerHtml: string, marginBottom = 20) {
  return `<p style="margin:0 0 ${marginBottom}px;font-size:15px;line-height:1.55;">${innerHtml}</p>`;
}

/** Shipped → Out for delivery → Delivered, with `step` steps done. */
function progressLine(step: 1 | 2 | 3) {
  const labels = ['Shipped', 'Out for delivery', 'Delivered'];
  const cells = labels.map((label, index) => {
    const done = index < step;
    const dot = done
      ? `<div style="width:16px;height:16px;border-radius:50%;background:${GOLD};margin:0 auto 6px;line-height:16px;color:#ffffff;font-size:10px;font-weight:700;text-align:center;">&#10003;</div>`
      : '<div style="width:12px;height:12px;border-radius:50%;border:2px solid #d5c697;background:#ffffff;margin:0 auto 6px;"></div>';
    return `<td width="33%" align="center" style="padding:12px 4px;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:${index === step - 1 ? 700 : 400};color:${done ? INK : '#9a8f7a'};">${dot}${label}</td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-top:1px solid #eadfbd;border-bottom:1px solid #eadfbd;"><tr>${cells}</tr></table>`;
}

type DetailRow = (position: { first: boolean; last: boolean }) => string;

// Label + value share ONE text baseline (valign=baseline, same 20px line
// height) and labels never wrap — mockup 4 (owner: values sat lower than their
// labels, and "Latest scan" wrapped on a phone).
const LABEL_STYLE = `color:${MUTED};font-size:12px;line-height:20px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;`;
const VALUE_STYLE = `color:${INK};font-size:14px;line-height:20px;font-weight:700;`;

function rowPadding({ first, last }: { first: boolean; last: boolean }) {
  return { top: first ? 12 : 4, bottom: last ? 12 : 4 };
}

function labelValueRow(label: string, valueHtml: string): DetailRow {
  return (position) => {
    const { top, bottom } = rowPadding(position);
    return `<tr><td valign="baseline" style="padding:${top}px 14px ${bottom}px;vertical-align:baseline;${LABEL_STYLE}">${escapeHtml(label)}</td><td valign="baseline" style="padding:${top}px 14px ${bottom}px 0;vertical-align:baseline;${VALUE_STYLE}text-align:right;">${valueHtml}</td></tr>`;
  };
}

/**
 * "Tracking number" + the number on ONE line when they fit (label left,
 * number right); on a screen too narrow for both, the number drops to its own
 * line under the label, never wrapped — mockup 3/4. Email-safe, no media
 * query: justified inline-blocks plus a full-width zero-height spacer that
 * forces the first line to justify. Clients without inline-block (Outlook on
 * Windows) simply stack the two lines.
 */
function trackingRow(displayNumber: string): DetailRow {
  return (position) => {
    const { top, bottom } = rowPadding(position);
    return `<tr><td colspan="2" style="padding:${top}px 14px ${bottom}px;"><div style="text-align:justify;font-size:0;line-height:0;"><div style="display:inline-block;vertical-align:baseline;${LABEL_STYLE}">Tracking number</div> <div style="display:inline-block;vertical-align:baseline;${VALUE_STYLE}white-space:nowrap;">${escapeHtml(displayNumber)}</div><div style="display:inline-block;width:100%;height:0;"></div></div></td></tr>`;
  };
}

function detailTable(rows: Array<DetailRow | null>) {
  const present = rows.filter((row): row is DetailRow => Boolean(row));
  if (present.length === 0) return '';
  const body = present.map((row, index) => row({ first: index === 0, last: index === present.length - 1 })).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f8f6ef;border:1px solid #d5c697;">${body}</table>`;
}

function goldButton(label: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;"><tr><td style="background:${GOLD};border-radius:2px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
