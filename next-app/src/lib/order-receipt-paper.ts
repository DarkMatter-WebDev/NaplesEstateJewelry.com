// The ONE-PAGE paper receipt / invoice (owner, 2026-10-21: "we will try and
// adjust the format to all fit on one page most of the time"). Printed by
// Admin → Instant Sale → In-store sale → "Record & print receipt" and by the
// order page's Print Invoice. Until then both printed the EMAIL's HTML, which
// is laid out for a screen: even one item ran to two letter pages, with no date
// and no "paid by".
//
// Same facts as the email (`order-invoice-email.ts`), a paper layout: a header
// row (brand + address | RECEIPT/INVOICE, order, date, status), one row of
// Sold to · Paid by · Delivery/Ship to, the items with small photos, totals,
// and one footer line. Measured in headless Chrome on letter paper with 0.5 in
// margins: 3 items, a shipped sale and 9 items each print on ONE page
// (about 11–12 items fit).
//
// Pure: returns HTML + CSS strings. Every selector is scoped under
// `.nej-paper`, so the page can also draw it in place without the styles
// leaking into the admin page.
import type { Order, OrderItem } from '@/types/sales';
import { formatCurrency, formatPublicPurity } from '@/types/sales';
import { formatProductItemYear } from '@/types/product';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { cityLine, streetLine } from '@/lib/business-location';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL } from '@/lib/order-email-branding';
import { BULLION_LAW_LINE, BULLION_LINE_LABEL, bullionTaxLabel, orderBullionTaxFree, readSaleTradeIn, tradeInReceiptLine } from '@/lib/in-store-sale';
import { type TaxExemptSnapshot } from '@/lib/tax-exempt';
import { exemptReceiptLineIn, itemTitleIn, metalIn, orderDateTimeLine, paidByLinesIn, tradeInReceiptLineEs, type OrderLanguage } from '@/lib/order-language';

export type PaperReceiptOrder = Pick<
  Order,
  | 'order_number' | 'customer_name' | 'customer_email' | 'customer_phone' | 'subtotal' | 'tax' | 'shipping_fee'
  | 'discount' | 'total' | 'payment_status' | 'fulfillment_status' | 'payment_method' | 'shipping_method'
  | 'shipping_address' | 'created_at'
> & {
  /** A split payment's parts (`SPLIT_PAYMENTS_COLUMN`, 2026-11-16) — one "Paid by" line each. */
  split_payments?: unknown;
  /** A Trade-in sale's trade (`TRADE_IN_COLUMN`, 2026-11-21) — one line under the totals. */
  trade_in?: unknown;
} & { order_items: (Pick<OrderItem, 'product_id' | 'inventory_number' | 'title_snapshot' | 'item_year_snapshot' | 'metal_snapshot' | 'purity_snapshot' | 'gram_weight_snapshot' | 'price_snapshot' | 'quantity' | 'discount' | 'image_snapshot' | 'tax_free_bullion'> & { id?: string })[] };

export type PaperReceipt = { title: string; css: string; body: string };

/** The page box both print paths use. */
export const PAPER_PAGE_CSS = '@page{size:letter;margin:0.5in}';

const LOGO_PATH = '/assets/images/branding/email-logo.png';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** "October 21, 2026 · 3:42 PM" in Naples time ("21 de octubre de 2026 · 3:42 p. m." in Spanish). */
export function paperDateLine(iso: string | null | undefined, language: OrderLanguage = 'en'): string {
  return orderDateTimeLine(iso, language);
}

function addressLines(address: unknown): string[] {
  if (!address || typeof address !== 'object') return [];
  const a = address as Record<string, unknown>;
  const get = (key: string) => (typeof a[key] === 'string' ? (a[key] as string).trim() : '');
  const city = [[get('city'), get('state')].filter(Boolean).join(', '), get('postal_code')].filter(Boolean).join(' ').trim();
  return [[get('line1'), get('line2')].filter(Boolean).join(', '), city].filter(Boolean);
}

function qtyOf(item: { quantity?: number }): number {
  const qty = Math.floor(Number(item.quantity ?? 1));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  return ['paid', 'partially_refunded', 'refunded'].includes(String(status ?? '').toLowerCase());
}

/**
 * The paper for one order. `hoursLine` is the showroom's admin-editable hours
 * (`hoursLine(await getStoreHours(), language === 'es')`); without it the line
 * is left out rather than printing a stale default.
 *
 * `language` (2026-11-21): 'es' prints every word the site prints in Spanish;
 * what was typed (names, unlisted titles, the trade description) prints as
 * typed, and a listed piece uses its Spanish title from `spanishTitles`.
 * English prints exactly as before.
 */
export function buildPaperReceipt(
  order: PaperReceiptOrder,
  opts: {
    invoiceNumber?: string | null;
    hoursLine?: string | null;
    taxExempt?: TaxExemptSnapshot | null;
    language?: OrderLanguage;
    spanishTitles?: Map<string, string> | null;
  } = {},
): PaperReceipt {
  const language = opts.language ?? 'en';
  const es = language === 'es';
  const paid = isPaidStatus(order.payment_status);
  const status = String(order.payment_status ?? '').toLowerCase();
  const kind = paid ? (es ? 'RECIBO' : 'RECEIPT') : (es ? 'FACTURA' : 'INVOICE');
  const badge = status === 'refunded'
    ? { text: es ? 'REEMBOLSADO' : 'REFUNDED', tone: 'grey' }
    : status === 'partially_refunded'
      ? { text: es ? 'REEMBOLSO PARCIAL' : 'PARTLY REFUNDED', tone: 'grey' }
      : paid
        ? { text: es ? 'PAGADO' : 'PAID IN FULL', tone: 'green' }
        : { text: es ? 'SIN PAGAR' : 'UNPAID', tone: 'amber' };
  const ships = order.shipping_method === 'shipping';
  const shipTo = addressLines(order.shipping_address);
  const fulfilled = String(order.fulfillment_status ?? '').toLowerCase();

  const items = order.order_items;
  // No photo = no box (owner, 2026-10-21). With no photo on any item the column goes too.
  const anyPhoto = items.some((item) => Boolean(normalizeLegacyLocalImageUrl(item.image_snapshot)));
  const rows = items.map((item, index) => {
    const qty = qtyOf(item);
    const lineSubtotal = Number(item.price_snapshot) * qty;
    const discount = Math.min(Math.max(Number(item.discount ?? 0), 0), lineSubtotal);
    const year = formatProductItemYear(item.item_year_snapshot);
    const detail = [
      item.inventory_number ? `#${item.inventory_number}` : null,
      year ? `Ca. ${year}` : null,
      metalIn(item.metal_snapshot, language),
      item.purity_snapshot ? formatPublicPurity(item.purity_snapshot) : null,
      item.gram_weight_snapshot ? `${item.gram_weight_snapshot} g` : null,
      qty > 1 ? `${es ? 'Cant.' : 'Qty'} ${qty} × ${formatCurrency(Number(item.price_snapshot))}` : null,
      item.tax_free_bullion ? BULLION_LINE_LABEL[language] : null,
    ].filter(Boolean).join(' · ');
    const image = normalizeLegacyLocalImageUrl(item.image_snapshot);
    return `<tr>
<td class="n">${index + 1}</td>
${anyPhoto ? `<td class="ph">${image ? `<img src="${esc(image)}" alt="">` : ''}</td>` : ''}
<td><strong>${esc(itemTitleIn(item, language, opts.spanishTitles))}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</td>
<td class="m">${discount > 0 ? `<s>${esc(formatCurrency(lineSubtotal))}</s>` : ''}${esc(formatCurrency(lineSubtotal - discount))}</td>
</tr>`;
  }).join('');

  const count = items.reduce((sum, item) => sum + qtyOf(item), 0);
  const paidBy = paid ? paidByLinesIn(order, language) : [es ? 'Aún sin pagar' : 'Not paid yet'];
  const tradeIn = readSaleTradeIn(order.trade_in);
  const pickedUp = fulfilled === 'picked_up' || fulfilled === 'delivered';
  const delivery = ships
    ? `<div class="lab">${es ? 'Enviar a' : 'Ship to'}</div>${shipTo.length > 0 ? shipTo.map(esc).join('<br>') : es ? 'Dirección pendiente' : 'Address to come'}`
    : es
      ? `<div class="lab">Entrega</div>${pickedUp ? 'Recogido en la tienda' : 'Recoger en el salón'}`
      : `<div class="lab">Delivery</div>${pickedUp ? 'Picked up in store' : 'Pickup at the showroom'}`;
  const contact = [order.customer_email, order.customer_phone].filter(Boolean).map((v) => esc(String(v))).join(' · ');

  // Bullion lines (2026-11-24): the 6% names what it was figured on.
  const bullionTaxFree = orderBullionTaxFree(items);
  const taxLabel = !opts.taxExempt && bullionTaxFree > 0
    ? bullionTaxLabel(order, bullionTaxFree, es ? 'Impuesto de ventas de FL' : 'FL sales tax', language)
    : es
      ? (opts.taxExempt ? 'Impuesto de ventas de FL · exento' : Number(order.tax) > 0 ? 'Impuesto de ventas de FL · 6%' : 'Impuesto de ventas')
      : (opts.taxExempt ? 'FL sales tax · exempt' : Number(order.tax) > 0 ? 'FL sales tax · 6%' : 'Sales tax');
  const totals = [
    es
      ? `<div><span>Subtotal · ${count} artículo${count === 1 ? '' : 's'}</span><span>${esc(formatCurrency(order.subtotal))}</span></div>`
      : `<div><span>Subtotal · ${count} item${count === 1 ? '' : 's'}</span><span>${esc(formatCurrency(order.subtotal))}</span></div>`,
    Number(order.discount) > 0 ? `<div><span>${es ? 'Descuento' : 'Discount'}</span><span>−${esc(formatCurrency(order.discount))}</span></div>` : '',
    ships ? `<div><span>${es ? 'Envío' : 'Shipping'}${Number(order.shipping_fee) > 0 ? '' : es ? ' · sin cargo' : ' · no charge'}</span><span>${esc(formatCurrency(order.shipping_fee))}</span></div>` : '',
    `<div><span>${taxLabel}</span><span>${esc(formatCurrency(order.tax))}</span></div>`,
    `<div class="big"><span>${paid ? (es ? 'Total pagado' : 'Total paid') : (es ? 'Total a pagar' : 'Total due')}</span><span>${esc(formatCurrency(order.total))}</span></div>`,
  ].join('');

  const title = es
    ? `${paid ? 'Recibo' : 'Factura'} ${order.order_number}`
    : `${kind === 'RECEIPT' ? 'Receipt' : 'Invoice'} ${order.order_number}`;
  const footer = es
    ? `<strong>¡Gracias!</strong> ¿Preguntas? Llame o envíe un texto al ${esc(BUSINESS_PHONE)} · Vea este pedido cuando quiera en ${esc(SITE_DOMAIN_LABEL)}/es/order-lookup${opts.hoursLine ? `<br>Salón: ${esc(opts.hoursLine)}` : ''}`
    : `<strong>Thank you!</strong> Questions? Call or text ${esc(BUSINESS_PHONE)} · View this order anytime at ${esc(SITE_DOMAIN_LABEL)}/order-lookup${opts.hoursLine ? `<br>Showroom: ${esc(opts.hoursLine)}` : ''}`;
  const body = `<div class="nej-paper">
<div class="top">
  <div class="brand"><img src="${LOGO_PATH}" alt=""><div><div class="name">Naples Estate Jewelry</div><div class="addr">${esc(streetLine())}, ${esc(cityLine())} · ${esc(BUSINESS_PHONE)}<br>${esc(SITE_DOMAIN_LABEL)}</div></div></div>
  <div class="doc"><div class="kind">${kind}</div><div class="meta">${es ? 'Pedido' : 'Order'} ${esc(order.order_number)}${!paid && opts.invoiceNumber ? `<br>${esc(opts.invoiceNumber)}` : ''}<br>${esc(paperDateLine(order.created_at, language))}</div><span class="badge ${badge.tone}">${badge.text}</span></div>
</div>
<div class="info">
  <div><div class="lab">${paid ? (es ? 'Vendido a' : 'Sold to') : (es ? 'Facturar a' : 'Bill to')}</div>${esc(order.customer_name || '—')}${contact ? `<br>${contact}` : ''}</div>
  <div><div class="lab">${es ? 'Forma de pago' : 'Paid by'}</div>${paidBy.map(esc).join('<br>')}</div>
  <div>${delivery}</div>
</div>
<table><thead><tr><th></th>${anyPhoto ? '<th></th>' : ''}<th>${es ? 'Artículo' : 'Item'}</th><th class="m">${es ? 'Precio' : 'Price'}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">${totals}</div>${opts.taxExempt ? `
<div class="exempt">${esc(exemptReceiptLineIn(opts.taxExempt, language))}</div>` : ''}${tradeIn ? `
<div class="exempt">${esc(es ? tradeInReceiptLineEs(tradeIn) : tradeInReceiptLine(tradeIn))}</div>` : ''}${bullionTaxFree > 0 ? `
<div class="exempt">${esc(BULLION_LAW_LINE[language])}</div>` : ''}
<div class="foot">
  ${footer}
</div>
</div>`;

  const css = `.nej-paper{font-family:Arial,Helvetica,sans-serif;color:#1d1a14;font-size:12.5px;line-height:1.4;background:#fff;max-width:720px;margin:0 auto}
.nej-paper *{box-sizing:border-box}
.nej-paper .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:12px;border-bottom:2px solid #735c00}
.nej-paper .brand{display:flex;gap:10px;align-items:center}
.nej-paper .brand img{height:46px;width:auto}
.nej-paper .name{font:700 19px Georgia,'Times New Roman',serif;letter-spacing:.5px}
.nej-paper .addr{color:#5b5446;font-size:11.5px;margin-top:2px}
.nej-paper .doc{text-align:right}
.nej-paper .kind{font:700 22px Georgia,'Times New Roman',serif;letter-spacing:3px;color:#735c00}
.nej-paper .meta{font-size:11.5px;color:#5b5446;margin-top:2px}
.nej-paper .badge{display:inline-block;margin-top:6px;color:#fff;font-weight:700;font-size:10.5px;letter-spacing:2px;padding:3px 9px;border-radius:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.nej-paper .badge.green{background:#0f7a4f}
.nej-paper .badge.amber{background:#a86b00}
.nej-paper .badge.grey{background:#6b6b6b}
.nej-paper .info{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:14px;padding:12px 0;border-bottom:1px solid #d5c697}
.nej-paper .lab{font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#735c00;margin-bottom:3px}
.nej-paper table{width:100%;border-collapse:collapse;margin-top:6px}
.nej-paper th{font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase;color:#735c00;text-align:left;padding:6px 4px;border-bottom:1px solid #d5c697}
.nej-paper th.m,.nej-paper td.m{text-align:right}
.nej-paper td{padding:6px 4px;border-bottom:1px solid #eee5cc;vertical-align:middle}
.nej-paper tr{break-inside:avoid;page-break-inside:avoid}
.nej-paper td span{display:block;color:#5b5446;font-size:11px}
.nej-paper td.n{width:22px;color:#8a8170;font-size:11px}
.nej-paper td.ph{width:48px}
.nej-paper td.ph img{width:40px;height:40px;object-fit:cover;border:1px solid #eadfbd;border-radius:3px;display:block;background:#fbfaf5}
.nej-paper td.m{font-weight:700;white-space:nowrap}
.nej-paper td.m s{display:block;font-weight:400;color:#8a8170;font-size:11px}
.nej-paper .totals{margin-left:auto;width:270px;margin-top:8px;break-inside:avoid}
.nej-paper .totals div{display:flex;justify-content:space-between;padding:2px 0}
.nej-paper .totals .big{border-top:1px solid #735c00;margin-top:4px;padding-top:6px;font:700 16px Georgia,'Times New Roman',serif;color:#735c00}
.nej-paper .exempt{margin-top:8px;padding:6px 10px;background:#fbf5dd;border-left:3px solid #d4af37;font-size:11.5px;break-inside:avoid}
.nej-paper .foot{margin-top:14px;padding-top:10px;border-top:1px solid #d5c697;font-size:11px;color:#5b5446;text-align:center;line-height:1.55;break-inside:avoid}
.nej-paper .foot strong{color:#1d1a14}`;

  return { title, css, body };
}

/** A whole printable document (the print window / frame writes this). */
export function paperReceiptDocument(receipt: PaperReceipt, baseHref?: string): string {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + (baseHref ? `<base href="${esc(baseHref)}">` : '')
    + `<title>${esc(receipt.title)}</title><style>${PAPER_PAGE_CSS}html,body{margin:0;padding:0;background:#fff}${receipt.css}</style>`
    + `</head><body>${receipt.body}</body></html>`;
}
