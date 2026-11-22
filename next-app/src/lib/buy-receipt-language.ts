// Buy receipt for a Spanish-speaking seller (owner, 2026-11-19, mockup 1: "Yes, build it").
//
// One switch on the form, "Seller's copy: English / Español", saved on the receipt
// (`seller_language`, supabase/buy-receipts-seller-language-2026-11.sql). Picking
// Español changes exactly two things:
// - the SELLER'S copy (paper and email) is printed in Spanish, every word the site
//   prints — what the owner TYPED (name, address, item descriptions, notes) prints
//   as typed;
// - the SHOP copy stays in English, and the statement the seller signs is printed a
//   second time in Spanish right under the English one, so the seller can read what
//   they sign on the copy the shop keeps.
// English receipts print exactly as before: every English word below is the
// literal the paper and the email used until now (a test pins that).
//
// ⚠️ The Spanish statement is Claude's translation. The owner has it approved by
// their attorney or a certified translator before relying on it (the English one
// is also still "confirm with your attorney") — change it here, in one place.
//
// Pure, no imports beyond types, so both `buy-receipts.ts` and the client
// components can use it without a cycle.
import type { BuyReceiptIdType, BuyReceiptPaymentMethod } from '@/lib/buy-receipts';

export const BUY_RECEIPT_LANGUAGES = ['en', 'es'] as const;
export type BuyReceiptLanguage = (typeof BUY_RECEIPT_LANGUAGES)[number];

/** Anything that is not exactly 'es' is English: a missing value (older rows, older drafts) prints as it always did. */
export function normalizeBuyReceiptLanguage(value: unknown): BuyReceiptLanguage {
  return value === 'es' ? 'es' : 'en';
}

/** The ownership statement in Spanish, first person — above the seller's line on the shop copy, and on the Spanish seller's copy. */
export const BUY_RECEIPT_ATTESTATION_ES =
  'Certifico que los artículos indicados arriba son de mi legítima propiedad, que no son robados ni están sujetos a '
  + 'ningún gravamen, y que tengo derecho a venderlos. Tengo 18 años o más.';

/** The same in the third person, for the emailed Spanish copy (the English email says "The seller certifies…"). */
export const BUY_RECEIPT_ATTESTATION_SELLER_ES =
  'El vendedor certifica que los artículos indicados arriba son de su legítima propiedad, que no son robados ni están '
  + 'sujetos a ningún gravamen, que tiene derecho a venderlos y que tiene 18 años o más.';

/** Every word the printed seller's copy carries. The shop copy always uses `en`. */
export type BuyReceiptPaperWords = {
  purchaseReceipt: string;
  numberPrefix: string;
  datePrefix: string;
  sellersCopy: string;
  seller: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  cityStateZip: string;
  idType: string;
  idLast4: string;
  dob: string;
  itemsPurchasedBy: (business: string) => string;
  qty: string;
  description: string;
  amount: string;
  totalPaid: string;
  paidBy: string;
  notes: string;
  receivedBy: string;
  date: string;
  thanks: (business: string) => string;
  void: string;
};

export const BUY_RECEIPT_PAPER_WORDS: Record<BuyReceiptLanguage, BuyReceiptPaperWords> = {
  en: {
    purchaseReceipt: 'Purchase receipt',
    numberPrefix: 'No.',
    datePrefix: 'Date:',
    sellersCopy: "Seller's copy",
    seller: 'Seller',
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    street: 'Street',
    cityStateZip: 'City, state, ZIP',
    idType: 'ID type',
    idLast4: 'ID last 4',
    dob: 'Date of birth',
    itemsPurchasedBy: (business) => `Items purchased by ${business}`,
    qty: 'Qty',
    description: 'Description',
    amount: 'Amount',
    totalPaid: 'Total paid to seller',
    paidBy: 'Paid by',
    notes: 'Notes',
    receivedBy: 'Received by',
    date: 'Date',
    thanks: (business) => `Thank you for choosing ${business}.`,
    void: 'VOID',
  },
  es: {
    purchaseReceipt: 'Recibo de compra',
    numberPrefix: 'N.º',
    datePrefix: 'Fecha:',
    sellersCopy: 'Copia del vendedor',
    seller: 'Vendedor',
    name: 'Nombre',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    street: 'Dirección',
    cityStateZip: 'Ciudad, estado, código postal',
    idType: 'Tipo de identificación',
    idLast4: 'Últimos 4',
    dob: 'Fecha de nacimiento',
    itemsPurchasedBy: (business) => `Artículos comprados por ${business}`,
    qty: 'Cant.',
    description: 'Descripción',
    amount: 'Importe',
    totalPaid: 'Total pagado al vendedor',
    paidBy: 'Forma de pago',
    notes: 'Notas',
    receivedBy: 'Recibido por',
    date: 'Fecha',
    thanks: (business) => `Gracias por elegir ${business}.`,
    void: 'ANULADO',
  },
};

/** The emailed seller's copy. `en` is exactly what the email said before. */
export type BuyReceiptEmailWords = {
  subject: (business: string, number: string, isVoid: boolean) => string;
  yourReceipt: string;
  /** Already HTML (the English one has always used `&rsquo;`). */
  sellersCopyHtml: string;
  sellersCopyText: string;
  voidTag: string;
  voidedBecause: string;
  seller: string;
  phone: string;
  email: string;
  address: string;
  id: string;
  last4: string;
  dob: string;
  item: string;
  qty: string;
  qtyInline: string;
  amount: string;
  paidBy: string;
  totalPaid: string;
  notes: string;
  receivedBy: string;
  date: string;
  thanks: (business: string) => string;
  questions: (phone: string) => string;
  questionsHtmlBefore: string;
};

export const BUY_RECEIPT_EMAIL_WORDS: Record<BuyReceiptLanguage, BuyReceiptEmailWords> = {
  en: {
    subject: (business, number, isVoid) => `${isVoid ? 'VOID — ' : ''}Your receipt from ${business} — ${number}`,
    yourReceipt: 'Your receipt',
    sellersCopyHtml: 'Seller&rsquo;s copy',
    sellersCopyText: "Seller's copy",
    voidTag: 'VOID',
    voidedBecause: 'This receipt was voided:',
    seller: 'Seller',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    id: 'ID',
    last4: 'last 4:',
    dob: 'DOB',
    item: 'Item',
    qty: 'Qty',
    qtyInline: 'qty',
    amount: 'Amount',
    paidBy: 'Paid by:',
    totalPaid: 'Total paid to seller',
    notes: 'Notes:',
    receivedBy: 'Received by:',
    date: 'Date',
    thanks: (business) => `Thank you for choosing ${business}.`,
    questions: (phone) => `Questions? Reply to this email or call ${phone}.`,
    questionsHtmlBefore: 'Questions? Reply to this email or call',
  },
  es: {
    subject: (business, number, isVoid) => `${isVoid ? 'ANULADO — ' : ''}Su recibo de ${business} — ${number}`,
    yourReceipt: 'Su recibo',
    sellersCopyHtml: 'Copia del vendedor',
    sellersCopyText: 'Copia del vendedor',
    voidTag: 'ANULADO',
    voidedBecause: 'Este recibo fue anulado:',
    seller: 'Vendedor',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    address: 'Dirección',
    id: 'Identificación',
    last4: 'últimos 4:',
    dob: 'Fecha de nac.',
    item: 'Artículo',
    qty: 'Cant.',
    qtyInline: 'cant.',
    amount: 'Importe',
    paidBy: 'Forma de pago:',
    totalPaid: 'Total pagado al vendedor',
    notes: 'Notas:',
    receivedBy: 'Recibido por:',
    date: 'Fecha',
    thanks: (business) => `Gracias por elegir ${business}.`,
    questions: (phone) => `¿Preguntas? Responda a este correo o llame al ${phone}.`,
    questionsHtmlBefore: '¿Preguntas? Responda a este correo o llame al',
  },
};

/** "Cash" → "Efectivo". Brand names stay as they are. */
export const BUY_RECEIPT_PAYMENT_LABELS_ES: Record<BuyReceiptPaymentMethod, string> = {
  cash: 'Efectivo',
  check: 'Cheque',
  zelle: 'Zelle',
  venmo: 'Venmo',
  cashapp: 'Cash App',
  paypal: 'PayPal',
  bank_transfer: 'Transferencia bancaria',
  store_credit: 'Crédito en tienda / intercambio',
  trade_credit: 'Crédito por intercambio',
};

/** The ID type as stored ('Driver license') → Spanish for the seller's copy. An unknown value prints as stored. */
export const BUY_RECEIPT_ID_TYPE_LABELS_ES: Record<BuyReceiptIdType, string> = {
  'Driver license': 'Licencia de conducir',
  'State ID': 'Identificación estatal',
  Passport: 'Pasaporte',
  'Military ID': 'Identificación militar',
  Other: 'Otra',
};

export function idTypeLabel(value: string | null | undefined, language: BuyReceiptLanguage): string {
  if (!value) return '';
  if (language !== 'es') return value;
  return BUY_RECEIPT_ID_TYPE_LABELS_ES[value as BuyReceiptIdType] ?? value;
}

const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/**
 * `2026-11-19` (the Eastern day) → "19 nov 2026". Built by hand, not with
 * `Intl` in Spanish: the server (email) and the browser (paper) must print the
 * same thing, and Spanish month/AM-PM forms differ between ICU versions.
 */
export function spanishDateFromDayKey(dayKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return '';
  return `${Number(match[3])} ${SPANISH_MONTHS[Number(match[2]) - 1] ?? ''} ${match[1]}`;
}

/** "2:14 PM" (the English Eastern time, whatever space ICU puts before PM) → "2:14 p. m.". */
export function spanishTimeFromEnglish(time: string): string {
  return time.replace(/[\s ]*([AaPp])\.?\s*[Mm]\.?$/, (_all, letter: string) => (letter.toLowerCase() === 'a' ? ' a. m.' : ' p. m.'));
}
