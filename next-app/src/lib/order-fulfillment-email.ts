import type { FulfillmentStatus, Order } from '@/types/sales';
import { orderStatusLabel } from '@/types/sales';
import { BUSINESS_PHONE, buildOrderEmailFooterHtml, buildOrderEmailFooterTextLines, pinPhoneToOneLine } from '@/lib/order-email-branding';
import { GOOGLE_REVIEW_URL } from '@/lib/business-location';
import { trackingUrl } from '@/lib/order-lookup';
import { compactTrackingNumber, formatExpectedDate, formatTrackingNumber, type ScanTimeParts } from '@/lib/shipment-tracking';
import { orderStatusLabelEs, spanishClock, spanishExpectedDay, spanishScanDate, type OrderLanguage } from '@/lib/order-language';

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

/** The same, for a customer whose receipts are in Spanish (2026-11-21). */
const STATUS_MESSAGES_ES: Record<FulfillmentStatus, string> = {
  pending: 'Estamos preparando su pedido.',
  packed: 'Su pedido está empacado y listo para el siguiente paso.',
  shipped: '¡Su pedido fue enviado!',
  picked_up: 'Su pedido fue recogido. ¡Gracias por comprar con nosotros!',
  cancelled: 'Su pedido fue cancelado.',
};

const GOLD = '#735c00';
const INK = '#1d1a14';
const MUTED = '#746b5b';
// Sent from a no-reply address, so don't invite replies — direct to phone/text.
const NOTE = `Call or text us at ${BUSINESS_PHONE} with any questions.`;
const CLOSING = 'Thank you, NaplesEstateJewelry.com';
const NOTE_ES = `Llame o envíe un texto al ${BUSINESS_PHONE} si tiene alguna pregunta.`;
const CLOSING_ES = 'Gracias, NaplesEstateJewelry.com';

function noteFor(language: OrderLanguage) { return language === 'es' ? NOTE_ES : NOTE; }
function closingFor(language: OrderLanguage) { return language === 'es' ? CLOSING_ES : CLOSING; }
function greetingFor(name: string | null | undefined, language: OrderLanguage) {
  if (language === 'es') return name ? `Hola, ${name}:` : 'Hola:';
  return `Hi ${name || 'there'},`;
}

export interface FulfillmentEmailOptions {
  /**
   * True when the site will follow this package and send the out-for-delivery
   * and delivered emails (EasyPost connected + a tracking number). Only then
   * does the shipped email promise them.
   */
  deliveryUpdates?: boolean;
  /** The customer's language (2026-11-21); English when absent, exactly as before. */
  language?: OrderLanguage;
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

  const language = options.language ?? 'en';
  const es = language === 'es';
  const statusLabel = es ? orderStatusLabelEs(status) : orderStatusLabel(status);
  const subject = es
    ? `Novedades de su pedido ${order.order_number} de Naples Estate Jewelry`
    : `Update on your order ${order.order_number} from Naples Estate Jewelry`;
  const greeting = greetingFor(order.customer_name, language);
  const message = es
    ? STATUS_MESSAGES_ES[status] ?? `El estado de su pedido cambió a ${statusLabel}.`
    : STATUS_MESSAGES[status] ?? `Your order status has been updated to ${statusLabel}.`;
  const shippingCarrier = order.shipping_carrier?.trim() || null;
  const trackingNumber = order.tracking_number?.trim() || null;
  const carrierWord = es ? 'Transportista' : 'Carrier';
  const trackingWord = es ? 'Número de rastreo' : 'Tracking number';
  const shipmentText = [
    shippingCarrier ? `${carrierWord}: ${shippingCarrier}` : null,
    trackingNumber ? `${trackingWord}: ${trackingNumber}` : null,
  ].filter((line): line is string => Boolean(line));
  const shipmentHtml = shippingCarrier || trackingNumber
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f8f6ef;border:1px solid #d5c697;">
        ${shippingCarrier ? `<tr><td style="padding:12px 14px 4px;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;">${carrierWord}</td><td style="padding:12px 14px 4px;color:${INK};font-size:14px;font-weight:700;text-align:right;">${escapeHtml(shippingCarrier)}</td></tr>` : ''}
        ${trackingNumber ? `<tr><td style="padding:4px 14px 12px;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;">${trackingWord}</td><td style="padding:4px 14px 12px;color:${INK};font-size:14px;font-weight:700;text-align:right;word-break:break-all;">${escapeHtml(trackingNumber)}</td></tr>` : ''}
      </table>
    `
    : '';

  const text = [
    greeting,
    '',
    message,
    '',
    `${es ? 'Pedido' : 'Order'}: ${order.order_number}`,
    `${es ? 'Estado' : 'Status'}: ${statusLabel}`,
    ...shipmentText,
    '',
    noteFor(language),
    closingFor(language),
    '',
    ...buildOrderEmailFooterTextLines(order.order_number, language),
  ].join('\n');

  const html = emailShell({
    title: es ? 'Novedades del pedido' : 'Order Update',
    orderNumber: order.order_number,
    statusLabel,
    language,
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
  /** Expected-date email only: the scan's own words ("Accepted at USPS Origin Facility"). */
  message?: string | null;
  /** Expected-date email only: the carrier's day, "YYYY-MM-DD" (trackerExpectedDate). */
  expectedDate?: string | null;
}

export type DeliveryEmailKind = 'expected_delivery' | 'out_for_delivery' | 'delivered';

function buildShippedEmailContent(order: FulfillmentEmailOrder, options: FulfillmentEmailOptions): FulfillmentUpdateEmailContent {
  const language = options.language ?? 'en';
  const es = language === 'es';
  const parts = shipmentParts(order);
  const promiseUpdates = Boolean(options.deliveryUpdates && parts.trackingNumber);
  const subject = es ? `Su pedido ${order.order_number} fue enviado` : `Your order ${order.order_number} has shipped`;
  const greeting = greetingFor(order.customer_name, language);
  const message = es ? STATUS_MESSAGES_ES.shipped : STATUS_MESSAGES.shipped;
  // 2026-11-19 (4-email plan): the expected-date email is promised too.
  const followUp = es
    ? `Le enviaremos por correo la fecha estimada de entrega en cuanto ${parts.carrier || 'el transportista'} la tenga, y otra vez cuando salga a reparto y cuando se entregue.`
    : `We’ll email you the expected delivery date as soon as ${parts.carrier || 'the carrier'} has one, and again when it’s out for delivery and when it’s delivered.`;

  const html = emailShell({
    title: es ? 'Su pedido fue enviado' : 'Your Order Has Shipped',
    orderNumber: order.order_number,
    statusLabel: es ? 'Enviado' : 'Shipped',
    language,
    bodyHtml: `
      ${paragraph(escapeHtml(greeting), 14)}
      ${paragraph(escapeHtml(message))}
      ${progressLine(1, language)}
      ${detailTable([
        parts.carrier ? labelValueRow(es ? 'Transportista' : 'Carrier', escapeHtml(parts.carrier)) : null,
        parts.trackingNumber ? trackingRow(parts.trackingNumber, language) : null,
      ])}
      ${parts.link ? goldButton(es ? 'Rastrear su paquete' : 'Track Your Package', parts.link) : ''}
      ${promiseUpdates ? paragraph(followUp) : ''}
    `,
  });

  const text = [
    greeting,
    '',
    message,
    '',
    `${es ? 'Pedido' : 'Order'}: ${order.order_number}`,
    es ? 'Estado: Enviado' : 'Status: Shipped',
    ...shipmentTextLines(parts, language),
    ...(promiseUpdates ? ['', followUp] : []),
    '',
    noteFor(language),
    closingFor(language),
    '',
    ...buildOrderEmailFooterTextLines(order.order_number, language),
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
  language: OrderLanguage = 'en',
): FulfillmentUpdateEmailContent {
  const es = language === 'es';
  const parts = shipmentParts(order);
  const greeting = greetingFor(order.customer_name, language);
  const scanTime = scan.when ? (es ? spanishClock(scan.when.time) : scan.when.time) : null;
  const when = scan.when ? `${es ? spanishScanDate(scan.when.date) : scan.when.date} · ${scanTime}` : null;

  if (kind === 'expected_delivery') return buildExpectedDeliveryEmail(order, parts, greeting, scan, language);

  if (kind === 'out_for_delivery') {
    const subject = es ? `Su pedido ${order.order_number} salió a reparto` : `Your order ${order.order_number} is out for delivery`;
    const message = es
      ? 'Buenas noticias: su paquete va en el camión de reparto y debería llegar hoy.'
      : 'Good news — your package is on the delivery truck and should arrive today.';
    const signatureLead = es ? 'Alguien tendrá que estar presente para firmar.' : 'Someone will need to be there to sign for it.';
    const signatureRest = es
      ? `Si no hay nadie en casa, ${parts.carrier || 'el transportista'} dejará un aviso para que lo recoja o programe una nueva entrega.`
      : `If no one is home, ${parts.carrier || 'the carrier'} will leave a notice so you can pick it up or schedule redelivery.`;
    const scanLines = [scan.place, scanTime].filter((line): line is string => Boolean(line));
    const outWord = es ? 'En reparto' : 'Out for Delivery';
    const latestScanHtml = `${outWord}${scanLines
      .map((line) => `<br><span style="font-weight:400;color:${MUTED};white-space:nowrap;">${escapeHtml(line)}</span>`)
      .join('')}`;

    const html = emailShell({
      title: es ? 'En reparto hoy' : 'Out for Delivery Today',
      orderNumber: order.order_number,
      statusLabel: outWord,
      language,
      bodyHtml: `
        ${paragraph(escapeHtml(greeting), 14)}
        ${paragraph(escapeHtml(message))}
        ${progressLine(2, language)}
        ${detailTable([
          labelValueRow(es ? 'Último escaneo' : 'Latest scan', latestScanHtml),
          parts.carrier ? labelValueRow(es ? 'Transportista' : 'Carrier', escapeHtml(parts.carrier)) : null,
          parts.trackingNumber ? trackingRow(parts.trackingNumber, language) : null,
        ])}
        ${paragraph(`<strong>${escapeHtml(signatureLead)}</strong> ${escapeHtml(signatureRest)}`)}
        ${parts.link ? goldButton(es ? 'Rastrear su paquete' : 'Track Your Package', parts.link) : ''}
      `,
    });

    const text = [
      greeting,
      '',
      message,
      '',
      `${es ? 'Pedido' : 'Order'}: ${order.order_number}`,
      `${es ? 'Estado' : 'Status'}: ${outWord}`,
      `${es ? 'Último escaneo' : 'Latest scan'}: ${outWord}${scanLines.length ? ` — ${scanLines.join(', ')}` : ''}`,
      ...shipmentTextLines(parts, language),
      '',
      `${signatureLead} ${signatureRest}`,
      '',
      noteFor(language),
      closingFor(language),
      '',
      ...buildOrderEmailFooterTextLines(order.order_number, language),
    ].join('\n');

    return { subject, html, text };
  }

  const subject = es ? `Su pedido ${order.order_number} fue entregado` : `Your order ${order.order_number} was delivered`;
  const message = 'USPS reports your package was delivered. We hope you love it!';
  const notHereLead = es ? '¿Todavía no lo tiene?' : 'Not in your hands yet?';
  const notHereRest = es
    ? `No se preocupe: a veces el transportista registra un paquete como entregado un poco antes de que llegue a la puerta, y suele aparecer al día siguiente. Si mañana al final del día todavía no ha llegado, llame o envíe un texto al ${BUSINESS_PHONE} y lo revisaremos de inmediato.`
    : `Don’t worry — carriers sometimes record a package as delivered a little before it actually reaches the door, and it usually turns up by the next day. If it still hasn’t arrived by the end of tomorrow, call or text us at ${BUSINESS_PHONE} and we’ll look into it right away.`;
  const reviewLead = es
    ? '¿Le gustó su pieza? Una breve reseña en Google ayuda mucho a un pequeño negocio de Naples como el nuestro.'
    : 'Happy with your piece? A quick Google review helps a small Naples business like ours.';
  const carrierName = parts.carrier || (es ? 'El transportista' : 'The carrier');
  const deliveredMessage = es
    ? `${carrierName} informa que su paquete fue entregado. ¡Esperamos que le encante!`
    : carrierName === 'USPS' ? message : message.replace('USPS', carrierName);
  const deliveredWord = es ? 'Entregado' : 'Delivered';

  const html = emailShell({
    title: es ? 'Su pedido fue entregado' : 'Your Order Was Delivered',
    orderNumber: order.order_number,
    statusLabel: deliveredWord,
    language,
    bodyHtml: `
      ${paragraph(escapeHtml(greeting), 14)}
      ${paragraph(escapeHtml(deliveredMessage))}
      ${progressLine(3, language)}
      ${detailTable([
        when ? labelValueRow(deliveredWord, `<span style="white-space:nowrap;">${escapeHtml(when)}</span>`) : null,
        scan.where
          ? labelValueRow(es ? 'Dónde' : 'Where', `${escapeHtml(scan.where)}<br><span style="font-weight:400;color:${MUTED};font-size:12px;">${es ? 'según' : 'as reported by'} ${escapeHtml(parts.carrier || (es ? 'el transportista' : 'the carrier'))}</span>`)
          : null,
        parts.trackingNumber ? trackingRow(parts.trackingNumber, language) : null,
      ])}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#fffaf0;border-left:3px solid ${GOLD};">
        <tr><td style="padding:14px 16px;font-size:15px;line-height:1.55;"><strong>${escapeHtml(notHereLead)}</strong> ${pinPhoneToOneLine(escapeHtml(notHereRest))}</td></tr>
      </table>
      ${paragraph(`${escapeHtml(reviewLead)} <a href="${escapeHtml(GOOGLE_REVIEW_URL)}" style="color:${GOLD};font-weight:700;text-decoration:underline;">${es ? 'Déjenos una reseña' : 'Leave us a review'}</a>`)}
    `,
  });

  const text = es
    ? [
      greeting,
      '',
      deliveredMessage,
      '',
      `Pedido: ${order.order_number}`,
      'Estado: Entregado',
      ...(when ? [`Entregado: ${when}`] : []),
      ...(scan.where ? [`Dónde: ${scan.where} (según ${parts.carrier || 'el transportista'})`] : []),
      ...(parts.trackingNumber ? [`Número de rastreo: ${parts.trackingNumber}`] : []),
      '',
      `${notHereLead} ${notHereRest}`,
      '',
      `${reviewLead} Déjenos una reseña: ${GOOGLE_REVIEW_URL}`,
      '',
      NOTE_ES,
      CLOSING_ES,
      '',
      ...buildOrderEmailFooterTextLines(order.order_number, 'es'),
    ].join('\n')
    : [
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

/**
 * The one-time "expected delivery date" email (owner, 2026-11-19, the 4-email
 * plan, mockup 1): sent the first time the carrier's tracking carries a date
 * while the package is in transit — never again when the date moves (the
 * out-for-delivery email covers the real day). The send rule lives in
 * `order-tracking-server.ts`.
 */
function buildExpectedDeliveryEmail(
  order: FulfillmentEmailOrder,
  parts: ShipmentParts,
  greeting: string,
  scan: DeliveryScan,
  language: OrderLanguage,
): FulfillmentUpdateEmailContent {
  const es = language === 'es';
  const date = formatExpectedDate(scan.expectedDate);
  const dayLong = (es ? spanishExpectedDay(scan.expectedDate) : null) ?? date?.long ?? String(scan.expectedDate ?? '').trim();
  // Break after the weekday on a phone, never inside "November 24".
  const commaAt = dayLong.indexOf(', ');
  const dayHtml = commaAt > 0
    ? `${escapeHtml(dayLong.slice(0, commaAt + 1))} <span style="white-space:nowrap;">${escapeHtml(dayLong.slice(commaAt + 2))}</span>`
    : `<span style="white-space:nowrap;">${escapeHtml(dayLong)}</span>`;
  const carrierName = parts.carrier || (es ? 'El transportista' : 'The carrier');
  const subject = es ? `Su pedido ${order.order_number} llegará el ${dayLong}` : `Your order ${order.order_number} is expected ${dayLong}`;
  const message = es
    ? `${carrierName} escaneó su paquete y espera entregarlo el:`
    : `${carrierName} has scanned your package and expects to deliver it on:`;
  const estimateNote = es
    ? `Estimación de ${parts.carrier || 'el transportista'}: puede variar un día`
    : `${parts.carrier ? `${parts.carrier}’s` : 'The carrier’s'} estimate — it can shift by a day`;
  const signatureLead = es ? 'Alguien tendrá que estar presente para firmar.' : 'Someone will need to be there to sign for it.';
  const signatureRest = es
    ? `Si no habrá nadie en casa ese día, llame o envíe un texto al ${BUSINESS_PHONE} y le ayudaremos a resolverlo.`
    : `If no one will be home that day, call or text us at ${BUSINESS_PHONE} and we’ll help you work it out.`;
  const closingLine = es ? 'Le escribiremos de nuevo la mañana en que salga a reparto.' : 'We’ll email you again the morning it’s out for delivery.';
  // The scan's own words are the carrier's (English); only the fallback is ours.
  const scanTitle = scan.message?.trim() || (es ? 'En tránsito' : 'In transit');
  const scanTime = scan.when ? (es ? spanishClock(scan.when.time) : scan.when.time) : null;
  const scanLines = [scan.place, scanTime].filter((line): line is string => Boolean(line));
  const latestScanHtml = `${escapeHtml(scanTitle)}${scanLines
    .map((line) => `<br><span style="font-weight:400;color:${MUTED};white-space:nowrap;">${escapeHtml(line)}</span>`)
    .join('')}`;

  const html = emailShell({
    title: es ? 'Su paquete va en camino' : 'Your Package Is on Its Way',
    orderNumber: order.order_number,
    statusLabel: es ? 'En tránsito' : 'In Transit',
    language,
    bodyHtml: `
      ${paragraph(escapeHtml(greeting), 14)}
      ${paragraph(escapeHtml(message))}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#fffaf0;border:1px solid #d5c697;border-left:3px solid ${GOLD};">
        <tr><td align="center" style="padding:18px 14px;">
          <div style="color:${MUTED};font-size:11px;letter-spacing:2px;text-transform:uppercase;line-height:16px;">${es ? 'Entrega estimada' : 'Expected delivery'}</div>
          <div style="margin-top:6px;color:${INK};font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;">${dayHtml}</div>
          <div style="margin-top:6px;color:${MUTED};font-size:12px;line-height:18px;">${escapeHtml(estimateNote)}</div>
        </td></tr>
      </table>
      ${progressLine(1, language)}
      ${detailTable([
        labelValueRow(es ? 'Último escaneo' : 'Latest scan', latestScanHtml),
        parts.carrier ? labelValueRow(es ? 'Transportista' : 'Carrier', escapeHtml(parts.carrier)) : null,
        parts.trackingNumber ? trackingRow(parts.trackingNumber, language) : null,
      ])}
      ${paragraph(`<strong>${escapeHtml(signatureLead)}</strong> ${pinPhoneToOneLine(escapeHtml(signatureRest))}`)}
      ${parts.link ? goldButton(es ? 'Rastrear su paquete' : 'Track Your Package', parts.link) : ''}
      ${paragraph(escapeHtml(closingLine))}
    `,
  });

  const text = [
    greeting,
    '',
    message,
    dayLong,
    `(${estimateNote})`,
    '',
    `${es ? 'Pedido' : 'Order'}: ${order.order_number}`,
    es ? 'Estado: En tránsito' : 'Status: In Transit',
    `${es ? 'Último escaneo' : 'Latest scan'}: ${scanTitle}${scanLines.length ? ` — ${scanLines.join(', ')}` : ''}`,
    ...shipmentTextLines(parts, language),
    '',
    `${signatureLead} ${signatureRest}`,
    '',
    closingLine,
    '',
    noteFor(language),
    closingFor(language),
    '',
    ...buildOrderEmailFooterTextLines(order.order_number, language),
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

function shipmentTextLines(parts: ShipmentParts, language: OrderLanguage = 'en'): string[] {
  const es = language === 'es';
  return [
    parts.carrier ? `${es ? 'Transportista' : 'Carrier'}: ${parts.carrier}` : null,
    parts.trackingNumber ? `${es ? 'Número de rastreo' : 'Tracking number'}: ${parts.trackingNumber}` : null,
    parts.link ? `${es ? 'Rastree su paquete' : 'Track your package'}: ${parts.link}` : null,
  ].filter((line): line is string => Boolean(line));
}

function emailShell({ title, orderNumber, statusLabel, bodyHtml, language = 'en' }: { title: string; orderNumber: string; statusLabel: string; bodyHtml: string; language?: OrderLanguage }) {
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
                  <p style="margin:8px 0 0;color:${MUTED};font-size:13px;">${language === 'es' ? 'Pedido' : 'Order'} ${escapeHtml(orderNumber)} - ${escapeHtml(statusLabel)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 30px;text-align:left;">
                  ${bodyHtml}
                  <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">${pinPhoneToOneLine(escapeHtml(noteFor(language)))}</p>
                  <p style="margin:0;font-size:15px;line-height:1.55;">${escapeHtml(closingFor(language))}</p>
                  ${buildOrderEmailFooterHtml(orderNumber, language)}
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
function progressLine(step: 1 | 2 | 3, language: OrderLanguage = 'en') {
  const labels = language === 'es' ? ['Enviado', 'En reparto', 'Entregado'] : ['Shipped', 'Out for delivery', 'Delivered'];
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
function trackingRow(displayNumber: string, language: OrderLanguage = 'en'): DetailRow {
  return (position) => {
    const { top, bottom } = rowPadding(position);
    return `<tr><td colspan="2" style="padding:${top}px 14px ${bottom}px;"><div style="text-align:justify;font-size:0;line-height:0;"><div style="display:inline-block;vertical-align:baseline;${LABEL_STYLE}">${language === 'es' ? 'Número de rastreo' : 'Tracking number'}</div> <div style="display:inline-block;vertical-align:baseline;${VALUE_STYLE}white-space:nowrap;">${escapeHtml(displayNumber)}</div><div style="display:inline-block;width:100%;height:0;"></div></div></td></tr>`;
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
