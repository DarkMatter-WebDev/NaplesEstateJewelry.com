// Buy receipt for a Spanish-speaking seller (owner, 2026-11-19, mockup 1).
// The seller's copy (paper + email) prints in Spanish; the shop copy stays English
// and carries the Spanish statement under the English one. English is unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBuyReceiptEmail } from '@/lib/buy-receipt-email';
import { normalizeBuyReceiptDraftSave, sanitizeBuyReceiptDraft } from '@/lib/buy-receipt-drafts';
import {
  BUY_RECEIPT_ATTESTATION_ES,
  BUY_RECEIPT_ATTESTATION_SELLER_ES,
  BUY_RECEIPT_EMAIL_WORDS,
  BUY_RECEIPT_PAPER_WORDS,
  idTypeLabel,
  normalizeBuyReceiptLanguage,
  spanishDateFromDayKey,
  spanishTimeFromEnglish,
} from '@/lib/buy-receipt-language';
import {
  BUY_RECEIPT_ATTESTATION,
  BUY_RECEIPT_COLUMNS,
  blankBuyReceiptDraft,
  buyReceiptContentColumns,
  buyReceiptLanguage,
  draftFromReceipt,
  formatReceiptDate,
  formatReceiptDateTime,
  normalizeBuyReceiptInput,
  paymentsLine,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';

const src = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const ROW = {
  id: '00000000-0000-4000-8000-000000000001', seq: 123, receipt_number: 'BUY-00123', status: 'recorded',
  seller_name: 'Maria Gonzalez', seller_phone: '(239) 555-0142', seller_email: 'm@example.com', seller_street: '123 Sample Ave',
  seller_city: 'Naples', seller_state: 'FL', seller_zip: '34116', seller_id_type: 'Driver license', seller_id_last4: '1234',
  seller_dob: '1961-04-18', seller_id_photo_path: null, seller_thumbprint_path: null,
  items: [{ qty: 1, description: '14K rope chain', amount: 520 }],
  total: 520, payments: [{ method: 'cash', reference: null, amount: 520 }], notes: null,
  print_requested_at: null, print_requested_by: null, print_copies_plain: 1, print_copies_with_id: 0, print_copies_seller: 1,
  emailed_at: null, emailed_to: null, print_claimed_at: null, print_claimed_by: null, printed_at: null, print_count: 0,
  void_reason: null, voided_at: null, voided_by: null, duplicated_from: null, created_by: null, created_by_email: null,
  updated_by_email: null, created_at: '2026-11-19T19:14:00.000Z', updated_at: '2026-11-19T19:14:00.000Z',
} as unknown as BuyReceiptRow;

const filled = () => ({
  ...blankBuyReceiptDraft(),
  sellerName: 'Maria Gonzalez',
  items: [{ qty: '', description: '14K rope chain', amount: '520' }],
  payments: [{ method: 'cash', reference: '', amount: '' }],
});

describe('seller language: the value', () => {
  it('is English unless it is exactly es — older rows, drafts and snapshots without it stay English', () => {
    expect(normalizeBuyReceiptLanguage('es')).toBe('es');
    for (const other of ['en', 'ES', 'spanish', '', null, undefined, 1]) expect(normalizeBuyReceiptLanguage(other)).toBe('en');
    expect(buyReceiptLanguage(ROW)).toBe('en');
    expect(buyReceiptLanguage({ seller_language: 'es' })).toBe('es');
    expect(blankBuyReceiptDraft().sellerLanguage).toBe('en');
  });

  it('is saved with the receipt and read back for edits, duplicates and reprints', () => {
    expect(BUY_RECEIPT_COLUMNS).toContain('seller_language');
    const es = normalizeBuyReceiptInput({ ...filled(), sellerLanguage: 'es' });
    if ('error' in es) throw new Error(es.error);
    expect(buyReceiptContentColumns(es.value).seller_language).toBe('es');
    const junk = normalizeBuyReceiptInput({ ...filled(), sellerLanguage: 'fr' });
    if ('error' in junk) throw new Error(junk.error);
    expect(junk.value.sellerLanguage).toBe('en');
    expect(draftFromReceipt({ ...ROW, seller_language: 'es' }).sellerLanguage).toBe('es');
    expect(draftFromReceipt(ROW).sellerLanguage).toBe('en');
  });

  it('survives a saved draft', () => {
    expect(sanitizeBuyReceiptDraft({ ...filled(), sellerLanguage: 'es' }).sellerLanguage).toBe('es');
    expect(sanitizeBuyReceiptDraft({ sellerName: 'A B' }).sellerLanguage).toBe('en');
    const save = normalizeBuyReceiptDraftSave({ ...filled(), sellerLanguage: 'es' });
    if ('error' in save) throw new Error(save.error);
    expect(save.value.form.draft.sellerLanguage).toBe('es');
  });
});

describe('seller language: the words', () => {
  it('keeps every English word the paper printed before', () => {
    const en = BUY_RECEIPT_PAPER_WORDS.en;
    expect([en.purchaseReceipt, en.numberPrefix, en.datePrefix, en.sellersCopy, en.seller]).toEqual(['Purchase receipt', 'No.', 'Date:', "Seller's copy", 'Seller']);
    expect([en.name, en.phone, en.email, en.street, en.cityStateZip, en.idType, en.idLast4, en.dob]).toEqual(['Name', 'Phone', 'Email', 'Street', 'City, state, ZIP', 'ID type', 'ID last 4', 'Date of birth']);
    expect(en.itemsPurchasedBy('X')).toBe('Items purchased by X');
    expect([en.qty, en.description, en.amount, en.totalPaid, en.paidBy, en.notes, en.receivedBy, en.date, en.void]).toEqual(['Qty', 'Description', 'Amount', 'Total paid to seller', 'Paid by', 'Notes', 'Received by', 'Date', 'VOID']);
    expect(en.thanks('X')).toBe('Thank you for choosing X.');
    expect(BUY_RECEIPT_EMAIL_WORDS.en.subject('X', 'BUY-1', false)).toBe('Your receipt from X — BUY-1');
    expect(BUY_RECEIPT_EMAIL_WORDS.en.sellersCopyHtml).toBe('Seller&rsquo;s copy');
  });

  it('has a Spanish word for every English one', () => {
    for (const key of Object.keys(BUY_RECEIPT_PAPER_WORDS.en)) expect(BUY_RECEIPT_PAPER_WORDS.es).toHaveProperty(key);
    for (const key of Object.keys(BUY_RECEIPT_EMAIL_WORDS.en)) expect(BUY_RECEIPT_EMAIL_WORDS.es).toHaveProperty(key);
  });

  it('writes dates, times, payments and ID types in Spanish — English unchanged', () => {
    expect(formatReceiptDate(ROW.created_at)).toBe('Nov 19, 2026');
    expect(formatReceiptDate(ROW.created_at, 'es')).toBe('19 nov 2026');
    expect(formatReceiptDateTime(ROW.created_at, 'es')).toBe('19 nov 2026 · 2:14 p. m.');
    expect(spanishDateFromDayKey('2026-09-05')).toBe('5 sept 2026');
    expect(spanishTimeFromEnglish('2:14 PM')).toBe('2:14 p. m.');
    expect(spanishTimeFromEnglish('11:05 AM')).toBe('11:05 a. m.');
    const split = [{ method: 'cash', reference: null, amount: 300 }, { method: 'check', reference: '2041', amount: 220 }] as BuyReceiptRow['payments'];
    expect(paymentsLine(split)).toBe('Cash $300.00 · Check #2041 $220.00');
    expect(paymentsLine(split, 'es')).toBe('Efectivo $300.00 · Cheque #2041 $220.00');
    expect(idTypeLabel('Driver license', 'es')).toBe('Licencia de conducir');
    expect(idTypeLabel('Driver license', 'en')).toBe('Driver license');
    expect(idTypeLabel('Something typed', 'es')).toBe('Something typed');
  });
});

describe('seller language: the email', () => {
  it('stays English for an English receipt', () => {
    const email = buildBuyReceiptEmail(ROW);
    expect(email.subject).toBe('Your receipt from Naples Estate Jewelry — BUY-00123');
    expect(email.html).toContain('Seller&rsquo;s copy');
    expect(email.text).not.toContain(BUY_RECEIPT_ATTESTATION_SELLER_ES);
  });

  it('is all Spanish for a Spanish seller, with the third-person statement', () => {
    const email = buildBuyReceiptEmail({ ...ROW, seller_language: 'es' });
    expect(email.subject).toBe('Su recibo de Naples Estate Jewelry — BUY-00123');
    expect(email.text).toContain(BUY_RECEIPT_ATTESTATION_SELLER_ES);
    expect(email.text).toContain('Forma de pago: Efectivo');
    expect(email.text).toContain('Copia del vendedor · 19 nov 2026 · 2:14 p. m.');
    expect(email.html).toContain('Recibido por:');
    expect(email.html).not.toContain('Received by');
    expect(buildBuyReceiptEmail({ ...ROW, seller_language: 'es', status: 'void', void_reason: 'x' }).subject).toMatch(/^ANULADO — /);
  });
});

describe('seller language: the paper and the switch (source guards)', () => {
  const sheet = src('components', 'admin', 'buy-receipts', 'BuyReceiptSheet.tsx');

  it('prints the seller copy in its language and keeps the shop copy English', () => {
    expect(sheet).toContain("const language: BuyReceiptLanguage = sellerCopy ? receiptLanguage : 'en';");
    expect(sheet).toContain("{language === 'es' ? BUY_RECEIPT_ATTESTATION_ES : BUY_RECEIPT_ATTESTATION}");
  });

  it('adds the Spanish statement under the English one on the shop copy and on the form', () => {
    expect(sheet).toContain("{!sellerCopy && receiptLanguage === 'es' && <SpanishAttestation />}");
    expect(sheet).toContain("{draft.sellerLanguage === 'es' && <SpanishAttestation />}");
    expect(BUY_RECEIPT_ATTESTATION_ES).not.toBe(BUY_RECEIPT_ATTESTATION);
  });

  it('offers the switch on the New receipt form and while editing a saved receipt', () => {
    expect(src('components', 'admin', 'buy-receipts', 'BuyReceiptForm.tsx')).toContain('<SellerLanguageSwitch value={draft.sellerLanguage}');
    expect(src('components', 'admin', 'buy-receipts', 'BuyReceiptDetail.tsx')).toContain('<SellerLanguageSwitch value={draft.sellerLanguage}');
    const switcher = src('components', 'admin', 'buy-receipts', 'SellerLanguageSwitch.tsx');
    // The site's own buttons, so hover / press / focus behave like every other button.
    expect(switcher).toContain("on ? 'gold-button' : 'outline-button'");
  });

  it('left no temporary preview page behind (the print measurement page of 2026-11-19)', () => {
    expect(existsSync(join(process.cwd(), 'src', 'app', '[locale]', 'zz-spanish-receipt-preview'))).toBe(false);
  });

  it('has its SQL: one column, default en, only en or es', () => {
    const sql = readFileSync(join(process.cwd(), '..', 'supabase', 'buy-receipts-seller-language-2026-11.sql'), 'utf8');
    expect(sql).toContain("add column if not exists seller_language text not null default 'en'");
    expect(sql).toContain("check (seller_language in ('en', 'es'))");
  });
});
