import type { Order, OrderItem } from '@/types/sales';
import { formatCurrency, formatPublicPurity, orderStatusLabel } from '@/types/sales';
import { formatProductItemYear } from '@/types/product';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { BUSINESS_PHONE, buildOrderEmailFooterHtml, buildOrderEmailFooterTextLines, pinPhoneToOneLine } from '@/lib/order-email-branding';
import {
  byAppointmentLabel,
  cityLine,
  DEFAULT_STORE_HOURS,
  hoursSegmentsFull,
  hoursSummary,
  streetLine,
  type StoreHoursSchedule,
} from '@/lib/business-location';
import { describeOrderShippingService } from '@/lib/checkout-shipping';
import { chrisSignatureHtml, chrisSignatureText } from '@/lib/email-signature';
import { BULLION_LAW_LINE, BULLION_LINE_LABEL, IN_STORE_PAYMENT_LABELS, bullionTaxLabel, formatSalePayments, orderBullionTaxFree,readSalePaymentParts, readSaleTradeIn, salePaymentPartLabel, tradeInReceiptLine, type SalePaymentMethod } from '@/lib/in-store-sale';
import { paperDateLine } from '@/lib/order-receipt-paper';
import { type TaxExemptSnapshot } from '@/lib/tax-exempt';
import { type OrderGift } from '@/lib/order-gift';
import { exemptReceiptLineIn, giftReceiptNoteIn, inStorePaidByTextEs, itemTitleIn, metalIn, orderDateLine, orderStatusLabelEs, tradeInReceiptLineEs, type OrderLanguage } from '@/lib/order-language';

export type InvoiceEmailOrder = Order & { order_items: OrderItem[] };

/**
 * Where and when to collect a pickup order, as a laid-out block rather than a
 * sentence.
 *
 * Until 2026-08-23 this was spliced into `note` as prose, so a receipt read
 * "…thank you. Pick up at 6240 Shirley St, Ste 104, Naples, FL 34109 · inside
 * [the shared suite]. Tue–Sat 11am–3pm, or by appointment. Call or text
 * us at…" — one run-on block in which the address a buyer actually needs was
 * the least findable thing (owner report).
 *
 * Kept as DATA, not a formatted string, because the HTML and plain-text bodies
 * lay it out differently — a bordered panel against indented lines — and a
 * pre-joined string forces one of them to unpick the other's formatting.
 *
 * ⚠️ Every string here comes from `business-location.ts`. Do not retype the
 * address. (The shared-suite landmark line was removed
 * 2026-11-25 — owner: proper signage now.)
 */
export interface InvoicePickupBlock {
  label: string;
  /** Street+suite, then city/state/ZIP — one line each, as on an envelope. */
  addressLines: string[];
  hoursLabel: string;
  hours: string;
  byAppointment: string;
}

/**
 * How to pay an UNPAID invoice sent from Instant Sale → Remote sale (owner,
 * 2026-10-21): the owner's message, the private Pay online button, and the
 * other ways to pay that were ticked. Absent on every other invoice/receipt,
 * which render exactly as before.
 */
export interface InvoicePaymentBlock {
  /** The private /pay/<token> link, or null when "Pay online" was not ticked. */
  payUrl: string | null;
  /** "Pay $2,871.54 securely". */
  payLabel: string;
  /** "PayPal or any debit / credit card · link good until Oct 28". */
  payHint: string;
  /** Shown when the tax can still come off (shipping, no address yet). */
  taxHint: string | null;
  otherWays: string[];
  /** The owner's own words, printed as typed; the email then ends with Chris's signature block. */
  message: string | null;
}

export interface InvoiceEmailContent {
  subject: string;
  invoiceNumber: string;
  greeting: string;
  intro: string;
  items: {
    title: string;
    inventory: string;
    details: string;
    price: string;
    originalPrice: string;
    discount: string | null;
    imageUrl: string | null;
  }[];
  totals: {
    subtotal: string;
    discount: string | null;
    tax: string;
    /** "Tax", or "Tax · exempt" on a tax-exempt sale (owner, 2026-10-27). */
    taxLabel: string;
    /** The certificate line under the totals on a tax-exempt sale, else null. */
    exemptLine: string | null;
    /** The bullion law line (2026-11-24) when any line is bullion, else null. */
    bullionLine: string | null;
    shipping: string;
    total: string;
  };
  /** Opening prose above the pickup block. Empty on an unpaid invoice. */
  note: string;
  /** Pickup directions, or null on a shipped order. */
  pickup: InvoicePickupBlock | null;
  /** Closing contact sentence, below the pickup block. */
  contactNote: string;
  closing: string;
  html: string;
  text: string;
}

export function invoiceNumberForOrder(order: Pick<Order, 'order_number'>, fallbackInvoiceNumber?: string | null) {
  return fallbackInvoiceNumber || `INV-${order.order_number.replace(/^NEJ-/, '')}`;
}

export function withInvoiceLineDiscounts(order: InvoiceEmailOrder, itemDiscounts: Record<string, number>): InvoiceEmailOrder {
  const persistedLineDiscount = order.order_items.reduce((sum, item) => sum + clampDiscount(Number(item.discount ?? 0), lineSubtotalOf(item)), 0);
  const editedItems = order.order_items.map((item) => ({
    ...item,
    discount: clampDiscount(itemDiscounts[item.id] ?? Number(item.discount ?? 0), lineSubtotalOf(item)),
  }));
  const editedLineDiscount = editedItems.reduce((sum, item) => sum + clampDiscount(Number(item.discount ?? 0), lineSubtotalOf(item)), 0);
  const orderLevelDiscount = Math.max(order.discount - persistedLineDiscount, 0);
  const discount = orderLevelDiscount + editedLineDiscount;
  const taxableBeforeDiscount = Math.max(order.subtotal - order.discount, 0) + order.shipping_fee;
  const taxRate = taxableBeforeDiscount > 0 ? order.tax / taxableBeforeDiscount : 0;
  const tax = (Math.max(order.subtotal - discount, 0) + order.shipping_fee) * taxRate;
  const total = Math.max(order.subtotal - discount, 0) + tax + order.shipping_fee;

  return {
    ...order,
    order_items: editedItems,
    discount,
    tax,
    total,
  };
}

export function isOrderPaid(order: Pick<Order, 'payment_status'>): boolean {
  return String(order.payment_status ?? '').trim().toLowerCase() === 'paid';
}

/**
 * Format the admin-editable schedule for the pickup block's single hours line:
 * `Tuesday – Saturday, 11:00 AM – 3:00 PM`, or a `'; '`-joined per-segment
 * list when the week doesn't compress to one range, or `'By appointment'`
 * when every day is closed (the block's own byAppointment footnote would
 * otherwise be the only content).
 */
export function formatPickupHours(schedule: StoreHoursSchedule, language: OrderLanguage = 'en'): string {
  const es = language === 'es';
  const summary = hoursSummary(schedule, es);
  if (summary) return `${summary.days}, ${summary.times}`;
  const segments = hoursSegmentsFull(schedule, es);
  return segments.length > 0 ? segments.join('; ') : es ? 'Con cita' : 'By appointment';
}

// This module is sync and imported by a client component (OrderDetailPanel's
// preview), so it cannot fetch the schedule itself. Server callers pass
// `opts.pickupHours` from `getStoreHours()`; without it the block shows the
// built-in default hours.
/** "Card · Zettle", or a split's parts: "Cash $500.00 and Card · Zettle $1,302.00" (2026-11-16). */
function inStorePaidByText(method: string, splitPayments: unknown): string {
  if (method === 'split') {
    const parts = readSalePaymentParts(splitPayments);
    return parts ? formatSalePayments(parts).replace(/ \+ (?=[^+]*$)/, ' and ').replace(/ \+ /g, ', ') : 'several payments';
  }
  if (method === 'trade_credit') {
    // Paid wholly by a trade-in (2026-11-21): name the buy receipt.
    const parts = readSalePaymentParts(splitPayments, 1);
    return parts ? salePaymentPartLabel(parts[0]) : IN_STORE_PAYMENT_LABELS.trade_credit;
  }
  return IN_STORE_PAYMENT_LABELS[method as SalePaymentMethod] ?? 'in store';
}

export function buildInvoiceEmailContent(
  order: InvoiceEmailOrder,
  fallbackInvoiceNumber?: string | null,
  opts?: {
    pickupHours?: string;
    payment?: InvoicePaymentBlock | null;
    taxExempt?: TaxExemptSnapshot | null;
    gift?: OrderGift | null;
    /** The customer's language (2026-11-21); English when absent, exactly as before. */
    language?: OrderLanguage;
    /** Listing id → Spanish title, for a Spanish receipt. */
    spanishTitles?: Map<string, string> | null;
  },
): InvoiceEmailContent {
  const language = opts?.language ?? 'en';
  const es = language === 'es';
  const invoiceNumber = invoiceNumberForOrder(order, fallbackInvoiceNumber);
  const paid = isOrderPaid(order);
  const payment = paid ? null : opts?.payment ?? null;
  // In-store receipts (owner, 2026-10-21): the customer was at the counter, so
  // the receipt says how and when it was paid, and leaves out what does not
  // apply to a piece they carried out — the $0.00 shipping row, the "Shipping
  // method: Local Pickup" box and the pickup address + hours.
  const inStoreMethod = /^in_store_(\w+)$/.exec(String(order.payment_method ?? ''))?.[1] as SalePaymentMethod | undefined;
  const inStore = Boolean(inStoreMethod);
  const carriedOut = inStore && order.shipping_method === 'pickup';
  // Local pickup orders can still have an address on file (the checkout address
  // accordion lets a pickup buyer optionally provide one) — label it "Address"
  // rather than "Ship to" since nothing is actually being shipped.
  const isPickup = order.shipping_method === 'pickup';
  // A paid order gets a "receipt"; an unpaid order gets an "invoice".
  const subject = es
    ? paid
      ? `Recibo del pedido ${order.order_number} de Naples Estate Jewelry`
      : `Factura ${invoiceNumber} de Naples Estate Jewelry`
    : paid
      ? `Receipt for order ${order.order_number} from Naples Estate Jewelry`
      : `Invoice ${invoiceNumber} from Naples Estate Jewelry`;
  const customerName = order.customer_name || 'there';
  const items = order.order_items.map((item) => {
    const qty = orderItemQuantity(item);
    const lineSubtotal = lineSubtotalOf(item);
    const discount = clampDiscount(Number(item.discount ?? 0), lineSubtotal);
    const lineTotal = Math.max(lineSubtotal - discount, 0);
    const circa = formatProductItemYear(item.item_year_snapshot);
    const details = [
      qty > 1 ? `${es ? 'Cant.' : 'Qty'} ${qty} × ${formatCurrency(item.price_snapshot)}` : null,
      circa ? `Ca. ${circa}` : null,
      metalIn(item.metal_snapshot, language),
      item.purity_snapshot ? (es ? `pureza ${formatPublicPurity(item.purity_snapshot)}` : `${formatPublicPurity(item.purity_snapshot)} purity`) : null,
      item.gram_weight_snapshot ? `${item.gram_weight_snapshot}g` : null,
      item.tax_free_bullion ? BULLION_LINE_LABEL[language] : null,
    ].filter(Boolean).join(' - ');

    return {
      title: itemTitleIn(item, language, opts?.spanishTitles),
      // An unlisted piece (in-store / remote sale) has no number: say nothing rather than "No inventory #".
      inventory: item.inventory_number || '',
      details: details || (es ? 'Joya de patrimonio' : 'Estate jewelry item'),
      price: formatCurrency(lineTotal),
      originalPrice: formatCurrency(lineSubtotal),
      discount: discount > 0 ? `-${formatCurrency(discount)}` : null,
      imageUrl: absoluteImageUrl(normalizeLegacyLocalImageUrl(item.image_snapshot)),
    };
  });
  // Bullion lines (2026-11-24): the tax label names what the 6% was on.
  const bullionTaxFree = orderBullionTaxFree(order.order_items);
  const totals = {
    subtotal: formatCurrency(order.subtotal),
    discount: order.discount > 0 ? `-${formatCurrency(order.discount)}` : null,
    tax: formatCurrency(order.tax),
    taxLabel: !opts?.taxExempt && bullionTaxFree > 0
      ? bullionTaxLabel(order, bullionTaxFree, es ? 'Impuesto' : 'Tax', language)
      : es ? (opts?.taxExempt ? 'Impuesto · exento' : 'Impuesto') : (opts?.taxExempt ? 'Tax · exempt' : 'Tax'),
    exemptLine: opts?.taxExempt ? exemptReceiptLineIn(opts.taxExempt, language) : null,
    bullionLine: bullionTaxFree > 0 ? BULLION_LAW_LINE[language] : null,
    shipping: formatCurrency(order.shipping_fee),
    total: formatCurrency(order.total),
  };
  const greeting = es ? (order.customer_name ? `Hola, ${order.customer_name}:` : 'Hola:') : `Hi ${customerName},`;
  const intro = es
    ? paid
      ? `Gracias por su compra en Naples Estate Jewelry. Recibimos su pago; este es su recibo del pedido ${order.order_number}.`
      : payment
        ? `Esta es su factura de Naples Estate Jewelry del pedido ${order.order_number}.`
        : `Gracias por su pedido en Naples Estate Jewelry. La factura ${invoiceNumber} del pedido ${order.order_number} está lista para su revisión.`
    : paid
      ? `Thank you for your order with Naples Estate Jewelry. Your payment has been received — here is your receipt for order ${order.order_number}.`
      : payment
        ? `Here is your invoice from Naples Estate Jewelry for order ${order.order_number}.`
        : `Thank you for your order with Naples Estate Jewelry. Invoice ${invoiceNumber} for ${order.order_number} is ready for review.`;
  // A pickup buyer is TOLD WHERE TO GO. Until 2026-08-17 this email said only
  // "call or text with any questions about pickup" — someone who had just paid
  // several thousand dollars had to phone up to learn the address. The showroom
  // address belongs here, not just on the website.
  //
  // Laid out as a block since 2026-08-23 (owner request). The business name is
  // deliberately NOT a line: on an envelope it would be, but this is an email
  // from that same business, so it only pushed the street address down.
  const pickup: InvoicePickupBlock | null = isPickup && !carriedOut
    ? {
      label: es ? 'Lugar de recogida' : 'Pickup Location',
      addressLines: [streetLine(), cityLine()],
      hoursLabel: es ? 'Horario' : 'Hours',
      hours: opts?.pickupHours ?? formatPickupHours(DEFAULT_STORE_HOURS, language),
      byAppointment: byAppointmentLabel(es),
    }
    : null;

  // Sent from a no-reply address, so don't invite replies — direct to phone/text.
  const paidNote = !paid
    ? ''
    : es
      ? inStoreMethod
        ? `Pagado en su totalidad con ${inStorePaidByTextEs(inStoreMethod, order.split_payments)} el ${orderDateLine(order.created_at, 'es') || 'día de la venta'}. ¡Gracias!`
        : 'Recibimos su pago completo. ¡Gracias!'
      : inStoreMethod
        ? `Paid in full by ${inStorePaidByText(inStoreMethod, order.split_payments)} on ${paperDateLine(order.created_at).split(' · ')[0] || 'the day of the sale'} — thank you.`
        : 'Your payment has been received in full — thank you.';
  // A checkout gift (2026-10-29): the buyer's record of who it goes to and
  // what the slip says. The priced receipt stays with the buyer.
  // A Trade-in sale (2026-11-21): what they traded, and the buy receipt it is on.
  const tradeIn = paid ? readSaleTradeIn(order.trade_in) : null;
  const note = [
    paidNote,
    tradeIn ? (es ? tradeInReceiptLineEs(tradeIn) : tradeInReceiptLine(tradeIn)) : '',
    opts?.gift ? giftReceiptNoteIn(opts.gift, language) : '',
  ].filter(Boolean).join(' ');
  const contactNote = es
    ? carriedOut
      ? `Llame o envíe un texto al ${BUSINESS_PHONE} si tiene alguna pregunta.`
      : paid
        ? `Llame o envíe un texto al ${BUSINESS_PHONE} si tiene preguntas sobre la recogida, la entrega o el envío.`
        : `Llame o envíe un texto al ${BUSINESS_PHONE} si tiene preguntas sobre el pago, la recogida, la entrega o el envío.`
    : carriedOut
      ? `Call or text us at ${BUSINESS_PHONE} with any questions.`
      : paid
        ? `Call or text us at ${BUSINESS_PHONE} with any questions about pickup, delivery, or shipping.`
        : `Call or text us at ${BUSINESS_PHONE} with any questions about payment, pickup, delivery, or shipping.`;
  const closing = es ? 'Gracias, NaplesEstateJewelry.com' : 'Thank you, NaplesEstateJewelry.com';
  const shipToLines = formatAddressLines(order.shipping_address);
  const shipToLabel = es ? (isPickup ? 'Dirección' : 'Enviar a') : (isPickup ? 'Address' : 'Ship to');

  return {
    subject,
    invoiceNumber,
    greeting,
    intro,
    items,
    totals,
    note,
    pickup,
    contactNote,
    closing,
    html: buildInvoiceEmailHtml({
      orderNumber: order.order_number,
      subject,
      greeting,
      intro,
      items,
      totals,
      note,
      pickup,
      contactNote,
      closing,
      paid,
      paymentStatus: es ? orderStatusLabelEs(order.payment_status) : orderStatusLabel(order.payment_status),
      fulfillmentStatus: es ? orderStatusLabelEs(order.fulfillment_status) : orderStatusLabel(order.fulfillment_status),
      // NOT `orderStatusLabel(order.shipping_method)` — that column is the
      // narrowed DB value, so it printed "Shipping method: Shipping".
      shippingMethod: describeOrderShippingService(
        order.shipping_method,
        order.subtotal,
        order.shipping_fee,
        es,
      ),
      shipTo: shipToLines,
      shipToLabel,
      payment,
      hideShipping: carriedOut,
      language,
    }),
    text: [
      greeting,
      intro,
      ...(payment?.message ? ['', payment.message] : []),
      ...(paid ? ['', es ? 'PAGO RECIBIDO — PAGADO EN SU TOTALIDAD' : 'PAYMENT RECEIVED — PAID IN FULL'] : []),
      '',
      es ? 'Artículos:' : 'Items:',
      ...(items.length > 0
        ? items.map((item) => `- ${item.title}${item.inventory ? ` (${item.inventory})` : ''} - ${item.discount ? (es ? `${item.originalPrice}, descuento ${item.discount}, total ${item.price}` : `${item.originalPrice}, line discount ${item.discount}, total ${item.price}`) : item.price}`)
        : [es ? '- No se adjuntaron detalles de los artículos.' : '- No item details were attached.']),
      '',
      `Subtotal: ${totals.subtotal}`,
      ...(totals.discount ? [`${es ? 'Descuento' : 'Discount'}: ${totals.discount}`] : []),
      `${totals.taxLabel}: ${totals.tax}`,
      ...(carriedOut ? [] : [`${es ? 'Envío' : 'Shipping'}: ${totals.shipping}`]),
      `Total: ${totals.total}`,
      ...(totals.exemptLine ? [totals.exemptLine] : []),
      ...(totals.bullionLine ? [totals.bullionLine] : []),
      ...(payment?.payUrl
        ? ['', `${payment.payLabel.toUpperCase()}:`, payment.payUrl, payment.payHint, ...(payment.taxHint ? [payment.taxHint] : [])]
        : []),
      ...(payment && payment.otherWays.length > 0
        ? ['', payment.payUrl ? (es ? 'OTRAS FORMAS DE PAGAR' : 'OTHER WAYS TO PAY') : (es ? 'CÓMO PAGAR' : 'HOW TO PAY'), ...payment.otherWays]
        : []),
      ...(shipToLines.length > 0 ? ['', `${shipToLabel}:`, ...shipToLines] : []),
      '',
      ...(note ? [note, ''] : []),
      // The same three beats as the HTML: prose, then the block set off by
      // blank lines and uppercase labels, then the contact line.
      ...(pickup
        ? [
          pickup.label.toUpperCase(),
          ...pickup.addressLines,
          '',
          pickup.hoursLabel.toUpperCase(),
          pickup.hours,
          pickup.byAppointment,
          '',
        ]
        : []),
      contactNote,
      closing,
      '',
      // Chris's signature — only when the owner typed a message (owner, 2026-11-26).
      ...(payment?.message ? [chrisSignatureText(es ? 'es' : 'en'), ''] : []),
      ...buildOrderEmailFooterTextLines(order.order_number, language),
    ].join('\n'),
  };
}

/**
 * Size of the email's `<h1>`, which prints the SUBJECT.
 *
 * ⚠️ 20px, not the 24–28px a display heading would normally take (owner,
 * 2026-08-24). This heading is a generated SENTENCE — "Invoice
 * INV-20260824-ZCW89 from Naples Estate Jewelry" — not a short label. At 28px
 * it wrapped to four lines and filled a phone screen before any content.
 *
 * The fulfillment email deliberately keeps 24px: its heading is the two words
 * "Order Update" and cannot wrap.
 */
const SUBJECT_HEADING_PX = 20;

function buildInvoiceEmailHtml({
  orderNumber,
  subject,
  greeting,
  intro,
  items,
  totals,
  note,
  pickup,
  contactNote,
  closing,
  paid,
  paymentStatus,
  fulfillmentStatus,
  shippingMethod,
  shipTo,
  shipToLabel,
  payment,
  hideShipping,
  language,
}: Omit<InvoiceEmailContent, 'html' | 'text' | 'invoiceNumber'> & {
  orderNumber: string;
  paid: boolean;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippingMethod: string;
  shipTo: string[];
  shipToLabel: string;
  payment: InvoicePaymentBlock | null;
  /** An in-store sale carried out of the showroom: no shipping row, no shipping box. */
  hideShipping: boolean;
  language: OrderLanguage;
}) {
  const es = language === 'es';
  // No photo, no box — but the row keeps the photo's space while any item has
  // one, so every title lines up (owner, 2026-10-21: a flush-left row read as
  // confusing on a phone). With no photo on any item the column goes.
  const anyImage = items.some((item) => Boolean(item.imageUrl));
  const itemRows = items.length > 0
    ? items.map((item) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #eadfbd;">
          <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
            <tr>
              ${anyImage ? `<td width="72" valign="top" style="width:72px;padding-right:14px;">
                ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" width="58" height="58" style="display:block;width:58px;height:58px;object-fit:contain;border:1px solid #eadfbd;background:#fbfaf5;" />` : ''}
              </td>` : ''}
              <td valign="top">
                <strong style="display:block;color:#1d1a14;font-size:15px;line-height:1.35;">${escapeHtml(item.title)}</strong>
                <span style="display:block;margin-top:4px;color:#746b5b;font-size:12px;">${escapeHtml([item.inventory, item.details].filter(Boolean).join(' - '))}</span>
              </td>
            </tr>
          </table>
        </td>
        <td align="right" style="padding:14px 0;border-bottom:1px solid #eadfbd;color:#735c00;font-weight:700;white-space:nowrap;">
          ${item.discount ? `<span style="display:block;color:#746b5b;font-size:12px;font-weight:400;text-decoration:line-through;">${escapeHtml(item.originalPrice)}</span><span style="display:block;color:#735c00;font-size:12px;">${es ? 'Descuento' : 'Discount'} ${escapeHtml(item.discount)}</span>` : ''}
          ${escapeHtml(item.price)}
        </td>
      </tr>
    `).join('')
    : `<tr><td colspan="2" style="padding:14px 0;color:#746b5b;">${es ? 'No se adjuntaron detalles de los artículos.' : 'No item details were attached.'}</td></tr>`;

  return `
    <div style="margin:0;padding:0;background:#f8f6ef;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6ef;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d1a14;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d5c697;">
              <tr>
                <td style="padding:28px 30px 18px;border-bottom:1px solid #d5c697;">
                  <div style="color:#735c00;font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">NaplesEstateJewelry.com</div>
                  <h1 style="margin:10px 0 0;color:#1d1a14;font-family:Georgia,'Times New Roman',serif;font-size:${SUBJECT_HEADING_PX}px;line-height:1.3;">${escapeHtml(subject)}</h1>
                  ${paid ? '<div style="display:inline-block;margin:12px 0 0;padding:5px 12px;background:#0f7a4f;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;border-radius:3px;">' + (es ? 'Pagado en su totalidad' : 'Paid in full') + '</div>' : ''}
                  <p style="margin:8px 0 0;color:#746b5b;font-size:13px;">${es ? 'Pedido' : 'Order'} ${escapeHtml(orderNumber)} - ${escapeHtml(paymentStatus)} - ${escapeHtml(fulfillmentStatus)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 30px;">
                  <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">${escapeHtml(greeting)}</p>
                  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtml(intro)}</p>
                  ${payment?.message ? paymentMessageHtml(payment.message) : ''}

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #eadfbd;border-bottom:1px solid #eadfbd;margin:0 0 22px;">
                    ${itemRows}
                  </table>

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">
                    ${totalRow('Subtotal', totals.subtotal)}
                    ${totals.discount ? totalRow(es ? 'Descuento' : 'Discount', totals.discount) : ''}
                    ${totalRow(totals.taxLabel, totals.tax)}
                    ${hideShipping ? '' : totalRow(es ? 'Envío' : 'Shipping', totals.shipping)}
                    ${totalRow(paid ? (es ? 'Total pagado' : 'Total Paid') : 'Total', totals.total, true)}
                  </table>
                  ${totals.exemptLine ? `<p style="margin:-10px 0 22px;padding:8px 12px;background:#fbf5dd;border-left:3px solid #d4af37;font-size:13px;line-height:1.5;color:#1d1a14;">${escapeHtml(totals.exemptLine)}</p>` : ''}
                  ${totals.bullionLine ? `<p style="margin:-10px 0 22px;padding:8px 12px;background:#fbf5dd;border-left:3px solid #d4af37;font-size:13px;line-height:1.5;color:#1d1a14;">${escapeHtml(totals.bullionLine)}</p>` : ''}
                  ${payment ? paymentBlockHtml(payment, es) : ''}

                  ${hideShipping ? '' : `<div style="margin:0 0 22px;padding:14px 16px;background:#fbfaf5;border:1px solid #eadfbd;color:#746b5b;font-size:13px;line-height:1.5;">
                    ${es ? 'Método de envío' : 'Shipping method'}: ${escapeHtml(shippingMethod)}
                    ${shipTo.length > 0 ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #eadfbd;"><strong style="display:block;color:#1d1a14;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(shipToLabel)}</strong>${shipTo.map(escapeHtml).join('<br/>')}</div>` : ''}
                  </div>`}

                  ${note ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;">${pinPhoneToOneLine(escapeHtml(note))}</p>` : ''}
                  ${pickup ? pickupBlockHtml(pickup) : ''}
                  <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">${pinPhoneToOneLine(escapeHtml(contactNote))}</p>
                  <p style="margin:0;font-size:15px;line-height:1.55;">${escapeHtml(closing)}</p>
                  ${payment?.message ? chrisSignatureHtml(es ? 'es' : 'en', { marginTop: 22 }) : ''}
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

/**
 * The pickup panel: where to collect, then when, in the email's existing
 * panel style (`#fbfaf5` on a `#eadfbd` hairline, 11px letterspaced caps) so
 * it reads as a sibling of the Ship-to block rather than a new component.
 *
 * ⚠️ A TABLE, not a div, unlike the Ship-to block it mirrors. Outlook's Word
 * rendering engine drops padding and background on a block-level div, which
 * would collapse this to unstyled text in exactly the client most likely to be
 * open on a desk. The inner hairline stays a div because a border-top on a div
 * is already proven in this template.
 *
 * ⚠️ Stacked `display:block` spans, not `<br/>`: each line carries its own
 * size and colour.
 */
function pickupBlockHtml(pickup: InvoicePickupBlock) {
  const caps = 'display:block;color:#1d1a14;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;';
  const line = 'display:block;color:#1d1a14;font-size:14px;line-height:1.5;';
  const muted = 'display:block;color:#746b5b;font-size:13px;line-height:1.5;';
  return `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#fbfaf5;border:1px solid #eadfbd;">
                    <tr>
                      <td style="padding:16px 18px;">
                        <strong style="${caps}margin:0 0 10px;">${escapeHtml(pickup.label)}</strong>
                        ${pickup.addressLines.map((addressLine) => `<span style="${line}">${escapeHtml(addressLine)}</span>`).join('')}
                        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eadfbd;">
                          <strong style="${caps}margin:0 0 5px;">${escapeHtml(pickup.hoursLabel)}</strong>
                          <span style="${line}">${escapeHtml(pickup.hours)}</span>
                          <span style="${muted}">${escapeHtml(pickup.byAppointment)}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
  `;
}

/**
 * The owner's message on a remote-sale invoice, quoted as typed. No "— Chris"
 * here any more (owner, 2026-11-26): Chris's signature block sits at the end.
 */
function paymentMessageHtml(message: string) {
  return `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#fbf7e8;border-left:3px solid #d4af37;">
                    <tr>
                      <td style="padding:12px 14px;color:#1d1a14;font-size:14px;line-height:1.55;font-style:italic;">
                        ${escapeHtml(message).replace(/\n/g, '<br/>')}
                      </td>
                    </tr>
                  </table>
  `;
}

/**
 * The Pay online button and the other ways to pay. A TABLE-cell button (the
 * bulletproof-button pattern) so Outlook keeps its background and padding.
 */
function paymentBlockHtml(payment: InvoicePaymentBlock, es = false) {
  const button = payment.payUrl
    ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                    <tr>
                      <td align="center" bgcolor="#b5890c" style="background:#b5890c;border-radius:4px;">
                        <a href="${escapeHtml(payment.payUrl)}" style="display:block;padding:15px 18px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">${escapeHtml(payment.payLabel)}</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 ${payment.taxHint ? '2px' : '20px'};text-align:center;color:#746b5b;font-size:12px;line-height:1.5;">${escapeHtml(payment.payHint)}</p>
                  ${payment.taxHint ? `<p style="margin:0 0 20px;text-align:center;color:#746b5b;font-size:12px;line-height:1.5;">${escapeHtml(payment.taxHint)}</p>` : ''}`
    : '';
  const other = payment.otherWays.length > 0
    ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;border:1px solid #eadfbd;">
                    <tr>
                      <td style="padding:12px 14px;color:#1d1a14;font-size:14px;line-height:1.6;">
                        <strong style="display:block;margin-bottom:4px;">${payment.payUrl ? (es ? 'Otras formas de pagar' : 'Other ways to pay') : (es ? 'Cómo pagar' : 'How to pay')}</strong>
                        ${payment.otherWays.map((line) => `<span style="display:block;">${escapeHtml(line).replace(/\(\d{3}\) \d{3}-\d{4}/g, (phone) => `<span style="white-space:nowrap;">${phone}</span>`)}</span>`).join('')}
                      </td>
                    </tr>
                  </table>`
    : '';
  return `${button}${other}`;
}

function totalRow(label: string, value: string, strong = false) {
  return `
    <tr>
      <td style="padding:${strong ? '12px 0 0' : '5px 0'};${strong ? 'border-top:1px solid #d5c697;' : ''}color:${strong ? '#735c00' : '#746b5b'};font-size:14px;${strong ? 'font-weight:700;' : ''}">${escapeHtml(label)}</td>
      <td align="right" style="padding:${strong ? '12px 0 0' : '5px 0'};${strong ? 'border-top:1px solid #d5c697;' : ''}color:${strong ? '#735c00' : '#1d1a14'};font-size:14px;${strong ? 'font-weight:700;' : ''}">${escapeHtml(value)}</td>
    </tr>
  `;
}

function formatAddressLines(address: unknown): string[] {
  if (!address || typeof address !== 'object') return [];
  const a = address as Record<string, unknown>;
  const get = (key: string) => (typeof a[key] === 'string' ? (a[key] as string).trim() : '');
  const cityLine = [[get('city'), get('state')].filter(Boolean).join(', '), get('postal_code')]
    .filter(Boolean)
    .join(' ')
    .trim();
  return [get('line1'), get('line2'), cityLine, get('country')].filter((line) => line.length > 0);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function orderItemQuantity(item: Pick<OrderItem, 'quantity'>): number {
  const qty = Math.floor(Number(item.quantity ?? 1));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function lineSubtotalOf(item: Pick<OrderItem, 'price_snapshot' | 'quantity'>): number {
  return item.price_snapshot * orderItemQuantity(item);
}

function clampDiscount(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function absoluteImageUrl(value: string | null | undefined) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/')) return null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://naplesestatejewelry.com';
  return `${siteUrl.replace(/\/$/, '')}${value}`;
}
