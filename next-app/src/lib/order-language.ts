// The language of a SALE's customer paperwork (owner, 2026-11-21, Spanish
// receipts mockup 1: "Yes, build it" — all six picks).
//
// One value per order, `orders.customer_language` ('en' | 'es',
// supabase/order-customer-language-2026-11.sql), set:
// - automatically at website checkout from the page's locale (/es → 'es'),
//   and by a counter-offer Buy link or a Remote-sale Pay page the same way;
// - by the "Receipt language" switch on In-store / Remote / Trade-in sale
//   (starts on English — pick 3);
// - by the Language switch on the order page (Customer card).
// Older orders, and every order before the SQL runs, read as English (pick 4).
//
// Spanish: the customer's emails (receipt / invoice, Fulfillment updates, the
// delivery-tracking emails, the pickup email) and the customer printouts (the
// one-page receipt, Print Order, gift slip, pickup customer copy). Each print
// page also has a "Print in: English | Español" switch that starts on the
// order's language. The shop's own copies and the owner emails stay English
// (pick 6). Formal "usted" throughout (pick 1). A listed piece prints its
// Spanish title when the listing has one (pick 2).
//
// ⚠️ The Spanish here is Claude's. The pickup statement and the tax-exempt /
// return lines are flagged in TASKS for the owner's translator or attorney
// (pick 5) — change them here, in one place.
//
// Pure (no server imports) so the print pages, the order panel and the email
// builders can all use it.
import {
  IN_STORE_PAYMENT_METHODS,
  paidByLines,
  paymentMethodLabel,
  readSalePaymentParts,
  SALE_TRADE_CREDIT,
  type SalePaymentMethod,
  type SalePaymentPart,
  type SaleTradeIn,
} from '@/lib/in-store-sale';
import { PRODUCT_METAL_TYPES, PRODUCT_METAL_VARIANTS } from '@/types/product';
import { SHOWROOM_TIME_ZONE } from '@/lib/business-location';
import { exemptReceiptLine, formatCertDate, paperCopyFiled, TAX_CERT_TYPE_LABELS, type TaxExemptSnapshot } from '@/lib/tax-exempt';
import { giftReceiptNote, type OrderGift } from '@/lib/order-gift';

export const ORDER_LANGUAGES = ['en', 'es'] as const;
export type OrderLanguage = (typeof ORDER_LANGUAGES)[number];

/** Anything that is not exactly 'es' is English — older orders print as they always did. */
export function normalizeOrderLanguage(value: unknown): OrderLanguage {
  return value === 'es' ? 'es' : 'en';
}

/** "English" / "Español" — the switch and button labels. */
export function orderLanguageName(language: OrderLanguage): string {
  return language === 'es' ? 'Español' : 'English';
}

// ---- Dates ----------------------------------------------------------------

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "2:42 PM" (whatever space ICU puts before PM) → "2:42 p. m.". */
export function spanishClock(time: string): string {
  return time.replace(/[\s ]*([AaPp])\.?\s*[Mm]\.?$/, (_all, letter: string) => (letter.toLowerCase() === 'a' ? ' a. m.' : ' p. m.'));
}

/** Naples-time parts of an instant, read from the English formatter (stable across ICU versions). */
function showroomParts(date: Date): { year: number; month: number; day: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: SHOWROOM_TIME_ZONE }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SHOWROOM_TIME_ZONE }).format(date);
  return { year: get('year'), month: get('month'), day: get('day'), time };
}

/**
 * "November 21, 2026 · 2:42 PM" / "21 de noviembre de 2026 · 2:42 p. m." in
 * Naples time. Spanish is built by hand, not with `Intl` in Spanish: the
 * server (email) and the browser (paper) must print the same thing.
 */
export function orderDateTimeLine(iso: string | null | undefined, language: OrderLanguage): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (language === 'es') {
    const { year, month, day, time } = showroomParts(d);
    return `${day} de ${MONTHS_ES[month - 1]} de ${year} · ${spanishClock(time)}`;
  }
  const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: SHOWROOM_TIME_ZONE }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SHOWROOM_TIME_ZONE }).format(d);
  return `${date} · ${time}`;
}

/** The date half only: "November 21, 2026" / "21 de noviembre de 2026". */
export function orderDateLine(iso: string | null | undefined, language: OrderLanguage): string {
  return orderDateTimeLine(iso, language).split(' · ')[0] ?? '';
}

/** A carrier's "YYYY-MM-DD" day → "lunes, 24 de noviembre" (the expected-date email). */
export function spanishExpectedDay(dayKey: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayKey ?? ''));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_ES[weekday]}, ${day} de ${MONTHS_ES[month - 1]}`;
}

/**
 * A scan's English date (`formatScanTime`: "Thu, Nov 12") → "jueves, 12 de
 * noviembre"; unknown text is left as is.
 */
export function spanishScanDate(text: string): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const match = /^(?:([A-Za-z]{3})[a-z]*,\s+)?([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?$/.exec(text.trim());
  if (!match) return text;
  const month = months.indexOf(match[2].toLowerCase());
  if (month < 0) return text;
  const weekday = match[1] ? days.indexOf(match[1].toLowerCase()) : -1;
  return `${weekday >= 0 ? `${WEEKDAYS_ES[weekday]}, ` : ''}${Number(match[3])} de ${MONTHS_ES[month]}${match[4] ? ` de ${match[4]}` : ''}`;
}

// ---- Money words ------------------------------------------------------------

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const SALE_PAYMENT_LABELS_ES: Record<SalePaymentMethod, string> = {
  zettle: 'Tarjeta · Zettle',
  cash: 'Efectivo',
  zelle: 'Zelle',
  check: 'Cheque',
  cashapp: 'Cash App',
  venmo: 'Venmo',
  store_credit: 'Crédito de la tienda',
  trade_credit: 'Crédito por intercambio',
};

function partLabelEs(part: Pick<SalePaymentPart, 'method' | 'reference'>): string {
  const label = SALE_PAYMENT_LABELS_ES[part.method] ?? part.method;
  return part.method === SALE_TRADE_CREDIT && part.reference ? `${label} · ${part.reference}` : label;
}

/** `paymentMethodLabel` in the customer's language ("En tienda · Efectivo", "PayPal", "Factura"). */
export function paymentMethodLabelIn(value: string | null | undefined, language: OrderLanguage): string {
  if (language !== 'es') return paymentMethodLabel(value);
  if (!value) return '-';
  if (value === 'paypal') return 'PayPal';
  if (value === 'manual') return 'Registrado por la tienda';
  if (value === 'invoice') return 'Factura';
  const match = value.match(/^(in_store|remote)_(\w+)$/);
  if (match) {
    const name = match[2] === 'split' ? 'Varios pagos' : SALE_PAYMENT_LABELS_ES[match[2] as SalePaymentMethod] ?? match[2];
    return `${match[1] === 'remote' ? 'Factura' : 'En tienda'} · ${name}`;
  }
  return value;
}

/** `paidByLines` in the customer's language — one line per payment of a split. */
export function paidByLinesIn(order: { payment_method?: string | null; split_payments?: unknown }, language: OrderLanguage): string[] {
  if (language !== 'es') return paidByLines(order);
  const match = /^(in_store|remote)_(split|trade_credit)$/.exec(String(order.payment_method ?? ''));
  const parts = match ? readSalePaymentParts(order.split_payments, match[2] === 'split' ? 2 : 1) : null;
  if (!match || !parts) return [paymentMethodLabelIn(order.payment_method, 'es')];
  const prefix = match[1] === 'remote' ? 'Factura' : 'En tienda';
  if (match[2] === 'trade_credit') return [`${prefix} · ${partLabelEs(parts[0])}`];
  return parts.map((part) => `${prefix} · ${partLabelEs(part)} ${money(part.amount)}`);
}

/** The email's "Paid in full by …" phrase in Spanish: "Efectivo $500.00 y Tarjeta · Zettle $1,302.00". */
export function inStorePaidByTextEs(method: string, splitPayments: unknown): string {
  if (method === 'split') {
    const parts = readSalePaymentParts(splitPayments);
    if (!parts) return 'varios pagos';
    const pieces = parts.map((part) => `${partLabelEs(part)} ${money(part.amount)}`);
    return pieces.length > 1 ? `${pieces.slice(0, -1).join(', ')} y ${pieces[pieces.length - 1]}` : pieces[0];
  }
  if (method === 'trade_credit') {
    const parts = readSalePaymentParts(splitPayments, 1);
    return parts ? partLabelEs(parts[0]) : SALE_PAYMENT_LABELS_ES.trade_credit;
  }
  return (IN_STORE_PAYMENT_METHODS as readonly string[]).includes(method)
    ? SALE_PAYMENT_LABELS_ES[method as SalePaymentMethod]
    : 'en la tienda';
}

/** "Su intercambio: 14K yellow gold scrap · 18.2 g (recibo BUY-00142, $900.00)." — what was typed prints as typed. */
export function tradeInReceiptLineEs(trade: SaleTradeIn): string {
  const what = trade.description.trim();
  return `Su intercambio: ${what ? `${what} ` : ''}(recibo ${trade.receipt_number}, ${money(trade.value)}).`;
}

// ---- Item details --------------------------------------------------------------

const METAL_ES = new Map<string, string>([
  ...PRODUCT_METAL_TYPES.map((metal) => [metal.label.toLowerCase(), metal.labelEs] as [string, string]),
  ...Object.values(PRODUCT_METAL_VARIANTS).flat().map((metal) => [metal.label.toLowerCase(), metal.labelEs] as [string, string]),
  ['sterling silver', 'Plata de ley'],
  ['two-tone gold', 'Oro bicolor'],
]);

/** "Yellow Gold" → "Oro amarillo"; anything unknown prints as stored. */
export function metalIn(metal: string | null | undefined, language: OrderLanguage): string | null {
  if (!metal) return null;
  if (language !== 'es') return metal;
  return METAL_ES.get(metal.trim().toLowerCase()) ?? metal;
}

/** The item title for the customer: the listing's Spanish title when it has one (pick 2), else the sale's own title. */
export function itemTitleIn(
  item: { title_snapshot: string; product_id?: string | null },
  language: OrderLanguage,
  spanishTitles?: Map<string, string> | Record<string, string> | null,
): string {
  if (language !== 'es' || !spanishTitles || !item.product_id) return item.title_snapshot;
  const title = spanishTitles instanceof Map ? spanishTitles.get(item.product_id) : spanishTitles[item.product_id];
  return title?.trim() || item.title_snapshot;
}

// ---- Status words -----------------------------------------------------------

const STATUS_ES: Record<string, string> = {
  paid: 'Pagado',
  unpaid: 'Sin pagar',
  pending: 'Pendiente',
  failed: 'Pago rechazado',
  refunded: 'Reembolsado',
  partially_refunded: 'Reembolso parcial',
  packed: 'Empacado',
  shipped: 'Enviado',
  picked_up: 'Recogido',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  open: 'Abierto',
  completed: 'Completado',
};

/** `orderStatusLabel` in Spanish ("picked_up" → "Recogido"). */
export function orderStatusLabelEs(value: string | null | undefined): string {
  if (!value) return '-';
  return STATUS_ES[value] ?? value.replace(/_/g, ' ');
}

/** The pages' own toggle: "?lang=es" / "?lang=en", else the order's language. */
export function printLanguage(query: string | string[] | undefined, orderLanguage: OrderLanguage): OrderLanguage {
  const value = Array.isArray(query) ? query[0] : query;
  return value === 'es' || value === 'en' ? value : orderLanguage;
}

// ---- Tax-exempt and gift lines ----------------------------------------------

/** `exemptReceiptLine` in Spanish (⚠️ for the translator's review — pick 5). */
export function exemptReceiptLineEs(snapshot: TaxExemptSnapshot): string {
  const parts = [
    snapshot.certType ? `${TAX_CERT_TYPE_LABELS[snapshot.certType].es} de Florida` : 'Certificado de Florida',
    snapshot.certNumber,
    snapshot.businessName,
    snapshot.expiresOn ? `válido hasta ${formatCertDate(snapshot.expiresOn)}` : null,
    !snapshot.photoPath && paperCopyFiled(snapshot.photoMime) ? 'copia en papel archivada' : null,
    !snapshot.photoPath && !paperCopyFiled(snapshot.photoMime) && snapshot.physicalCopySeen ? 'copia física verificada' : null,
    snapshot.flAuthNumber ? `autorización FL ${snapshot.flAuthNumber}` : null,
  ].filter(Boolean);
  return `Venta exenta de impuestos · ${parts.join(' · ')}`;
}

export function exemptReceiptLineIn(snapshot: TaxExemptSnapshot, language: OrderLanguage): string {
  return language === 'es' ? exemptReceiptLineEs(snapshot) : exemptReceiptLine(snapshot);
}

/** `giftReceiptNote` in Spanish. */
export function giftReceiptNoteEs(gift: OrderGift): string {
  const message = gift.message ? ` Su mensaje: “${gift.message}”.` : '';
  return gift.recipientName
    ? `🎁 Un regalo para ${gift.recipientName}.${message} El paquete llevará una tarjeta de regalo con su mensaje y sin precios.`
    : `🎁 Un regalo.${message} Lo entregaremos con una tarjeta de regalo, sin precios.`;
}

export function giftReceiptNoteIn(gift: OrderGift, language: OrderLanguage): string {
  return language === 'es' ? giftReceiptNoteEs(gift) : giftReceiptNote(gift);
}
