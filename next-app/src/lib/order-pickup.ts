// Local Pickup log + pickup sheet (owner, 2026-11-21, mockup 1 approved).
//
// Admin → Orders → a Local Pickup order → Pickup card → Log Pickup: who picked
// it up, the ID photo (the AI fills ID type + last 4, as on the buy receipt),
// how they signed (a finger on the iPad / iPhone, or on paper), and "Email the
// customer their pickup copy". Then a STORE copy (ID photo, ID type + last 4,
// signature, staff line — kept on file) and a CUSTOMER copy (name only, never
// the ID) print, and the buyer can be emailed theirs (`order-pickup-email.ts`).
//
// ⛔ The ID photo and the signature are PRIVATE: paths in the `buy-receipt-ids`
// bucket under `order-pickups/<order id>/`, never URLs. The paper carries them
// as `<img data-nej-private="path">`; the browser that prints swaps each for a
// short-lived picture (`fillPrivateImages`, pickup-client.ts) — the order page's
// Print Here and the desktop Print Station alike. Never in an email.
//
// Pure: no React, no Supabase client.
import { BUY_RECEIPT_ID_TYPES, type BuyReceiptIdType } from '@/lib/buy-receipts';
import { metalIn, orderDateLine, type OrderLanguage } from '@/lib/order-language';
import { escapeHtml as esc } from '@/lib/marketing-email-html';
import { cityLine, landmarkPhrase, SHOWROOM_TIME_ZONE, streetLine } from '@/lib/business-location';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL } from '@/lib/order-email-branding';
import { paperDateLine, type PaperReceipt } from '@/lib/order-receipt-paper';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { formatProductItemYear } from '@/types/product';
import { formatPublicPurity } from '@/types/sales';

export const ORDER_PICKUP_TABLE = 'order_pickups';
export const ORDER_PICKUP_SQL_FILE = 'supabase/order-pickups-2026-11.sql';

export const ORDER_PICKUP_COLUMNS =
  'order_id, picked_up_by, picked_up_by_buyer, id_type, id_last4, id_photo_path, sign_method, signature_path, signed_name, signed_at, picked_up_at, emailed_at, emailed_to, logged_by_email, updated_by_email, created_at, updated_at';

export type PickupSignMethod = 'digital' | 'paper';

export type OrderPickupRow = {
  order_id: string;
  picked_up_by: string;
  picked_up_by_buyer: boolean;
  id_type: BuyReceiptIdType | null;
  id_last4: string | null;
  id_photo_path: string | null;
  sign_method: PickupSignMethod;
  signature_path: string | null;
  signed_name: string | null;
  signed_at: string | null;
  picked_up_at: string;
  emailed_at: string | null;
  emailed_to: string | null;
  logged_by_email: string | null;
  updated_by_email: string | null;
  created_at: string;
  updated_at: string;
};

/** What the order page gets: whether the SQL has run, and the row if there is one. */
export type OrderPickupState = { supported: boolean; row: OrderPickupRow | null };

/**
 * The statement on the signing screen, both copies and the email (owner's yes
 * to mockup 1, 2026-11-21). Change the words here only.
 */
export const PICKUP_STATEMENT =
  "I confirm I am the buyer named on this order, or a person the buyer authorized to collect it, and the ID shown is mine. I received the item(s) listed above, have inspected them, and accept them in the condition described. Returns follow Naples Estate Jewelry's posted policy: call or text within 5 days of pickup.";

/**
 * The same statement in Spanish (2026-11-21), on the Spanish customer copy and
 * the Spanish pickup email, and under the English one on the store copy of a
 * Spanish order, so the customer can read what they sign.
 * ⚠️ Claude's translation — for the owner's translator or attorney (TASKS).
 */
export const PICKUP_STATEMENT_ES =
  'Confirmo que soy el comprador indicado en este pedido, o una persona autorizada por el comprador para recogerlo, y que la identificación presentada es mía. Recibí los artículos indicados arriba, los revisé y los acepto en el estado descrito. Las devoluciones siguen la política publicada de Naples Estate Jewelry: llame o envíe un texto dentro de los 5 días posteriores a la recogida.';

export const PICKUP_ID_TYPES = BUY_RECEIPT_ID_TYPES;

/** The attribute that marks a private picture on the paper; the printing browser fills it in. */
export const PRIVATE_IMAGE_ATTR = 'data-nej-private';

export type PickupCopies = 'both' | 'store' | 'customer';

export const PICKUP_COPIES_OPTIONS: { value: PickupCopies; label: string }[] = [
  { value: 'both', label: 'Store copy + customer copy' },
  { value: 'store', label: 'Store copy only' },
  { value: 'customer', label: 'Customer copy only' },
];

export function isPickupCopies(value: unknown): value is PickupCopies {
  return value === 'both' || value === 'store' || value === 'customer';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The Pickup card shows on Local Pickup orders only — and not on an in-store
 * sale, where the customer carried the piece out at the counter (owner, 2026-11-21).
 */
export function isPickupOrder(order: { shipping_method?: string | null; payment_method?: string | null }): boolean {
  if (order.shipping_method !== 'pickup') return false;
  return !/^in_store_/.test(String(order.payment_method ?? ''));
}

/** The order's own folder in the private bucket — everything in it belongs to that order's pickup. */
export function orderPickupFolder(orderId: string): string {
  return `order-pickups/${orderId}`;
}

/** A new name on every upload, so a replaced photo never serves a cached old one. */
export function orderPickupIdPhotoPath(orderId: string, fileId: string): string {
  return `${orderPickupFolder(orderId)}/id-${fileId}.webp`;
}

export function orderPickupSignaturePath(orderId: string, fileId: string): string {
  return `${orderPickupFolder(orderId)}/signature-${fileId}.webp`;
}

/** A path this feature wrote for THIS order — anything else is refused. */
export function isOrderPickupPath(orderId: string, path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(`${orderPickupFolder(orderId)}/`) && !path.includes('..');
}

/** Postgres "relation does not exist" — the SQL file has not been run. */
export function isMissingPickupTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const message = error.message ?? '';
  return /order_pickups/.test(message) && /does not exist|could not find/i.test(message);
}

// ---- The Log Pickup form ---------------------------------------------------

export type PickupDetailsInput = {
  /** True = the buyer picked it up; false = someone else (`name` is theirs). */
  buyer: boolean;
  name: string;
  idType: string;
  idLast4: string;
  signMethod: PickupSignMethod;
  /** The printed name under a finger signature. */
  signedName: string;
  /** "Email the customer their pickup copy" — honoured on the first log only. */
  email: boolean;
  /** Take the stored ID photo off (Remove on the strip). */
  removePhoto: boolean;
};

export type PickupDetails = {
  picked_up_by: string;
  picked_up_by_buyer: boolean;
  id_type: BuyReceiptIdType | null;
  id_last4: string | null;
  sign_method: PickupSignMethod;
  signed_name: string | null;
  email: boolean;
  removePhoto: boolean;
};

function collapse(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** The ID's last four: letters or digits, upper case. Empty = not given. */
export function cleanIdLast4(value: unknown): string | null | 'invalid' {
  const text = collapse(value).replace(/[\s-]/g, '').toUpperCase();
  if (!text) return null;
  return /^[A-Z0-9]{4}$/.test(text) ? text : 'invalid';
}

/** Checks the Log Pickup form. The buyer's name comes from the order, never from the browser. */
export function normalizePickupDetails(raw: unknown, buyerName: string | null | undefined): { value: PickupDetails } | { error: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PickupDetailsInput, unknown>>;
  const buyer = input.buyer !== false;
  const name = buyer ? collapse(buyerName) || collapse(input.name) : collapse(input.name);
  if (!name) return { error: buyer ? 'The order has no buyer name. Choose "Someone else" and type the name.' : 'Type the name of the person picking up.' };
  if (name.length > 120) return { error: 'That name is too long.' };

  const idTypeText = collapse(input.idType);
  const idType = idTypeText ? PICKUP_ID_TYPES.find((type) => type === idTypeText) ?? null : null;
  if (idTypeText && !idType) return { error: 'Choose an ID type from the list.' };

  const last4 = cleanIdLast4(input.idLast4);
  if (last4 === 'invalid') return { error: 'ID last 4 must be four letters or digits.' };

  const signMethod: PickupSignMethod = input.signMethod === 'digital' ? 'digital' : 'paper';
  const signedName = collapse(input.signedName).slice(0, 120) || null;

  return {
    value: {
      picked_up_by: name,
      picked_up_by_buyer: buyer,
      id_type: idType,
      id_last4: last4,
      sign_method: signMethod,
      signed_name: signMethod === 'digital' ? signedName ?? name : null,
      email: input.email === true,
      removePhoto: input.removePhoto === true,
    },
  };
}

/**
 * Does the name the AI read off the ID look like the buyer's? First and last
 * word, ignoring case, accents, punctuation and middle names ("COLLINS,
 * MARGARET A" vs "Margaret Collins"). Used only to WARN — never to block.
 */
export function idNameMatchesBuyer(idName: string | null | undefined, buyerName: string | null | undefined): boolean {
  const words = (value: string | null | undefined) =>
    collapse(value)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(word));
  const a = words(idName);
  const b = words(buyerName);
  if (a.length === 0 || b.length === 0) return true;
  const setA = new Set(a);
  // Both the buyer's first and last name appear on the ID (in any order).
  return setA.has(b[0]) && setA.has(b[b.length - 1]);
}

// ---- The paper -------------------------------------------------------------

export type PickupPaperItem = {
  inventory_number: string | null;
  title_snapshot: string;
  item_year_snapshot?: number | null;
  metal_snapshot: string | null;
  purity_snapshot: string | null;
  gram_weight_snapshot: number | null;
  quantity?: number | null;
  image_snapshot: string | null;
};

export type PickupPaperOrder = {
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  created_at: string;
  order_items: PickupPaperItem[];
};

/** "November 21, 2026" in Naples time ("21 de noviembre de 2026" in Spanish). */
export function pickupDateOnly(iso: string | null | undefined, language: OrderLanguage = 'en'): string {
  if (language === 'es') return orderDateLine(iso, 'es');
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: SHOWROOM_TIME_ZONE }).format(date);
}

function qtyOf(item: { quantity?: number | null }): number {
  const qty = Math.floor(Number(item.quantity ?? 1));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

/** "#1043 · Ca. 1950 · 14K · 4.2 g" — the same detail line as the receipt, never a price. */
export function pickupItemDetail(item: PickupPaperItem, language: OrderLanguage = 'en'): string {
  const year = formatProductItemYear(item.item_year_snapshot ?? null);
  return [
    item.inventory_number ? `#${item.inventory_number}` : null,
    year ? `Ca. ${year}` : null,
    metalIn(item.metal_snapshot, language),
    item.purity_snapshot ? formatPublicPurity(item.purity_snapshot) : null,
    item.gram_weight_snapshot ? `${item.gram_weight_snapshot} g` : null,
  ].filter(Boolean).join(' · ');
}

function privateImg(path: string, className: string): string {
  return `<img class="${className}" ${PRIVATE_IMAGE_ATTR}="${esc(path)}" alt="">`;
}

/** "Driver license ····4821", or whichever half was given. */
export function pickupIdLine(pickup: Pick<OrderPickupRow, 'id_type' | 'id_last4'> | null): string {
  if (!pickup) return '';
  return [pickup.id_type, pickup.id_last4 ? `····${pickup.id_last4}` : null].filter(Boolean).join(' ');
}

function copyBody(
  order: PickupPaperOrder,
  pickup: OrderPickupRow | null,
  copy: 'store' | 'customer',
  opts: { hoursLine?: string | null; hoursLineEs?: string | null; printedAt?: string; language?: OrderLanguage },
): string {
  const store = copy === 'store';
  // The customer copy is in the order's language; the store copy stays English (2026-11-21).
  const orderEs = opts.language === 'es';
  const es = orderEs && !store;
  const language: OrderLanguage = es ? 'es' : 'en';
  const items = order.order_items;
  const anyPhoto = items.some((item) => Boolean(normalizeLegacyLocalImageUrl(item.image_snapshot)));
  const rows = items.map((item, index) => {
    const image = normalizeLegacyLocalImageUrl(item.image_snapshot);
    const detail = pickupItemDetail(item, language);
    return `<tr>
<td class="n">${index + 1}</td>
${anyPhoto ? `<td class="ph">${image ? `<img src="${esc(image)}" alt="">` : ''}</td>` : ''}
<td><strong>${esc(item.title_snapshot)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</td>
<td class="m">${qtyOf(item)}</td>
</tr>`;
  }).join('');

  const contact = [order.customer_email, order.customer_phone].filter(Boolean).map((v) => esc(String(v))).join(' · ');
  const pickedUp = pickup
    ? `${esc(paperDateLine(pickup.picked_up_at, language))}<br>${es ? 'en el salón' : 'at the showroom'}`
    : '<span class="blank"></span>';
  const idLine = pickupIdLine(pickup);
  const pickedUpBy = pickup
    ? `${esc(pickup.picked_up_by)}${store && pickup.picked_up_by_buyer ? ' (the buyer)' : ''}${store && idLine ? `<br>${esc(idLine)}` : ''}`
    : '<span class="blank"></span>';

  const digital = Boolean(pickup && pickup.sign_method === 'digital' && pickup.signature_path);
  const signedName = pickup?.signed_name || pickup?.picked_up_by || '';
  const signedDate = pickupDateOnly(pickup?.signed_at ?? pickup?.picked_up_at, language);
  // A paper pickup: the store copy has blank lines to sign by hand; the customer copy has no signature row.
  const showSigs = store || digital;
  const sigs = !showSigs ? '' : `
<div class="sigs${store ? '' : ' three'}">
  <div><div class="sig">${digital && pickup?.signature_path ? privateImg(pickup.signature_path, 'sigimg') : ''}</div><div class="siglab">${es ? 'Firma del cliente' : 'Customer signature'}</div></div>
  <div><div class="sig typed">${digital ? esc(signedName) : ''}</div><div class="siglab">${es ? 'Nombre' : 'Printed name'}</div></div>
  <div><div class="sig typed">${digital ? esc(signedDate) : ''}</div><div class="siglab">${es ? 'Fecha de recogida' : 'Date picked up'}</div></div>
  ${store ? '<div><div class="sig"></div><div class="siglab">Staff</div></div>' : ''}
</div>${digital && pickup?.signed_at ? `
<div class="esig">${es ? 'Firmado electrónicamente en el salón' : 'Signed electronically at the showroom'} · ${esc(paperDateLine(pickup.signed_at, language))}</div>` : ''}`;

  const idRow = !store ? '' : `
<div class="idrow">
  <div class="idbox">${pickup?.id_photo_path ? privateImg(pickup.id_photo_path, 'idimg') : '<span>ID photo</span>'}</div>
  <div class="idnote"><div class="lab">ID shown at pickup</div>${idLine ? esc(idLine) : pickup ? 'Not recorded' : 'ID type · last 4: ____________'}<br><br>Store copy — keep on file.<br>Never handed to the customer.<br><br>Order ${esc(order.order_number)}${opts.printedAt ? `<br>Printed ${esc(paperDateLine(opts.printedAt))}` : ''}</div>
</div>`;

  // The store copy's order + print time sit beside the ID (no footer row), so six items still fit one sheet.
  const hoursEs = opts.hoursLineEs ?? null;
  const foot = store
    ? ''
    : es
      ? `<div class="foot"><strong>¡Gracias!</strong> ¿Preguntas? Llame o envíe un texto al ${esc(BUSINESS_PHONE)} · Devoluciones: llame o envíe un texto dentro de los 5 días posteriores a la recogida · ${esc(SITE_DOMAIN_LABEL)}/es/returns-refunds${hoursEs ? `<br>Salón: ${esc(hoursEs)} · ${esc(landmarkPhrase(true))}` : ''}</div>`
      : `<div class="foot"><strong>Thank you!</strong> Questions? Call or text ${esc(BUSINESS_PHONE)} · Returns: call or text within 5 days of pickup · ${esc(SITE_DOMAIN_LABEL)}/returns-refunds${opts.hoursLine ? `<br>Showroom: ${esc(opts.hoursLine)} · ${esc(landmarkPhrase(false))}` : ''}</div>`;
  // A Spanish order's store copy: the statement in Spanish too, under the English one.
  const statement = es
    ? esc(PICKUP_STATEMENT_ES)
    : orderEs
      ? `${esc(PICKUP_STATEMENT)}<br><br><span lang="es">${esc(PICKUP_STATEMENT_ES)}</span>`
      : esc(PICKUP_STATEMENT);

  return `<div class="nej-paper nej-pickup">
<div class="top">
  <div class="brand"><img src="/assets/images/branding/email-logo.png" alt=""><div><div class="name">Naples Estate Jewelry</div><div class="addr">${esc(streetLine())}, ${esc(cityLine())} · ${esc(BUSINESS_PHONE)}<br>${esc(SITE_DOMAIN_LABEL)}</div></div></div>
  <div class="doc">${es
    ? `<div class="kind">RECOGIDA</div><div class="meta">Pedido ${esc(order.order_number)}<br>Pedido el ${esc(paperDateLine(order.created_at, 'es'))}</div><span class="badge green">COPIA DEL CLIENTE</span>`
    : `<div class="kind">PICKUP</div><div class="meta">Order ${esc(order.order_number)}<br>Ordered ${esc(paperDateLine(order.created_at))}</div><span class="badge ${store ? 'gold' : 'green'}">${store ? 'STORE COPY' : 'CUSTOMER COPY'}</span>`}</div>
</div>
<div class="info">
  <div><div class="lab">${es ? 'Comprador' : 'Buyer'}</div>${esc(order.customer_name || '—')}${contact ? `<br>${contact}` : ''}</div>
  <div><div class="lab">${es ? 'Recogido' : 'Picked up'}</div>${pickedUp}</div>
  <div><div class="lab">${es ? 'Recogido por' : 'Picked up by'}</div>${pickedUpBy}</div>
</div>
<table><thead><tr><th></th>${anyPhoto ? '<th></th>' : ''}<th>${es ? 'Artículo' : 'Item'}</th><th class="m">${es ? 'Cant.' : 'Qty'}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="statement">${statement}</div>${sigs}${idRow}
${foot}
</div>`;
}

/** Scoped like the receipt paper's own CSS (`order-receipt-paper.ts`), plus the pickup parts. */
export const PICKUP_PAPER_CSS = `.nej-paper{font-family:Arial,Helvetica,sans-serif;color:#1d1a14;font-size:12.5px;line-height:1.4;background:#fff;max-width:720px;margin:0 auto}
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
.nej-paper .badge.gold{background:#735c00}
.nej-paper .info{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:14px;padding:12px 0;border-bottom:1px solid #d5c697}
.nej-paper .lab{font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#735c00;margin-bottom:3px}
.nej-paper .blank{display:block;height:30px;border-bottom:1px solid #1d1a14;margin-right:12px}
.nej-paper table{width:100%;border-collapse:collapse;margin-top:6px}
.nej-paper th{font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase;color:#735c00;text-align:left;padding:6px 4px;border-bottom:1px solid #d5c697}
.nej-paper th.m,.nej-paper td.m{text-align:right}
.nej-paper td{padding:6px 4px;border-bottom:1px solid #eee5cc;vertical-align:middle}
.nej-paper tr{break-inside:avoid;page-break-inside:avoid}
.nej-paper td span{display:block;color:#5b5446;font-size:11px}
.nej-paper td.n{width:22px;color:#8a8170;font-size:11px}
.nej-paper td.ph{width:48px}
.nej-paper td.ph img{width:40px;height:40px;object-fit:cover;border:1px solid #eadfbd;border-radius:3px;display:block;background:#fbfaf5}
.nej-paper td.m{font-weight:700;white-space:nowrap;width:40px}
.nej-paper .statement{margin-top:12px;padding:8px 12px;background:#fbf5dd;border-left:3px solid #d4af37;font-size:11.5px;line-height:1.5;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.nej-paper .sigs{display:grid;grid-template-columns:1.5fr 1fr 1fr .55fr;gap:16px;margin-top:22px;align-items:end;break-inside:avoid}
.nej-paper .sigs.three{grid-template-columns:1.5fr 1fr 1fr}
.nej-paper .sig{border-bottom:1px solid #1d1a14;height:52px;position:relative;font-size:13px}
.nej-paper .sig.typed{display:flex;align-items:flex-end;padding-bottom:3px}
.nej-paper .sig .sigimg{position:absolute;left:0;bottom:1px;max-height:50px;max-width:100%;width:auto;display:block}
.nej-paper .siglab{font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a8170;margin-top:4px}
.nej-paper .esig{font-size:10.5px;color:#5b5446;margin-top:6px}
.nej-paper .idrow{display:flex;gap:18px;align-items:flex-start;margin-top:18px;padding-top:12px;border-top:1px dashed #d5c697;break-inside:avoid}
.nej-paper .idbox{width:3.375in;height:2.125in;flex:0 0 auto;border:1px solid #c9c0a6;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#8a8170;font-size:11px;background:#fff}
.nej-paper .idbox .idimg{width:100%;height:100%;object-fit:contain;display:block}
.nej-paper .idnote{font-size:11px;color:#5b5446;line-height:1.55}
.nej-paper .foot{margin-top:14px;padding-top:10px;border-top:1px solid #d5c697;font-size:11px;color:#5b5446;text-align:center;line-height:1.55;break-inside:avoid}
.nej-paper .foot strong{color:#1d1a14}
.nej-pickup-sheet{break-after:page;page-break-after:always}
.nej-pickup-sheet:last-child{break-after:auto;page-break-after:auto}`;

/**
 * The pickup paper: the store copy, the customer copy, or both in ONE print
 * job (store first). `pickup` null = the blank sheet (store copy, empty boxes)
 * for a paper-only pickup. Prints through the same path as the one-page receipt
 * (`paperReceiptDocument` + `printPaperInFrame`), so the station needs no new code
 * beyond filling the private pictures.
 */
export function buildPickupPaper(
  order: PickupPaperOrder,
  pickup: OrderPickupRow | null,
  opts: {
    copies?: PickupCopies;
    hoursLine?: string | null;
    /** The hours in Spanish, for a Spanish customer copy. */
    hoursLineEs?: string | null;
    printedAt?: string;
    /** The order's customer language (2026-11-21): the customer copy follows it. */
    language?: OrderLanguage;
  } = {},
): PaperReceipt {
  const copies: PickupCopies = pickup ? opts.copies ?? 'both' : 'store';
  const list: ('store' | 'customer')[] = copies === 'both' ? ['store', 'customer'] : [copies];
  const body = list.map((copy) => `<div class="nej-pickup-sheet">${copyBody(order, pickup, copy, opts)}</div>`).join('');
  const label = !pickup ? 'Blank pickup sheet' : copies === 'both' ? 'Pickup sheets' : copies === 'store' ? 'Pickup store copy' : 'Pickup customer copy';
  return { title: `${label} ${order.order_number}`, css: PICKUP_PAPER_CSS, body };
}

/** The private paths a paper needs filled in before it prints. */
export function privateImagePaths(html: string): string[] {
  const found = new Set<string>();
  const pattern = new RegExp(`${PRIVATE_IMAGE_ATTR}="([^"]+)"`, 'g');
  for (const match of html.matchAll(pattern)) {
    found.add(match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  return [...found];
}

/** Gives each private picture its printable link; one with no link drops out of the sheet. */
export function withPrivateImages(html: string, links: ReadonlyMap<string, string>): string {
  const pattern = new RegExp(`<img class="([^"]*)" ${PRIVATE_IMAGE_ATTR}="([^"]+)" alt="">`, 'g');
  return html.replace(pattern, (_whole, className: string, encodedPath: string) => {
    const path = encodedPath.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const link = links.get(path);
    return link ? `<img class="${className}" src="${esc(link)}" alt="">` : '';
  });
}

