import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_MAX_ITEMS,
  BUY_RECEIPT_MAX_PAYMENTS,
  blankBuyReceiptDraft,
  normalizeBuyReceiptInput,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import {
  BUY_RECEIPT_DRAFT_COLUMNS,
  BUY_RECEIPT_DRAFT_NAME_NEEDED,
  buyReceiptDraftColumns,
  draftContinuePath,
  draftFormFromRow,
  isDraftReceipt,
  normalizeBuyReceiptDraftSave,
  readBuyReceiptDraftForm,
  receiptOfDraftRow,
  sanitizeBuyReceiptDraft,
  type BuyReceiptDraftRow,
} from '@/lib/buy-receipt-drafts';

const HALF_DONE = {
  ...blankBuyReceiptDraft(),
  sellerName: '  Maria   Lopez ',
  sellerPhone: '239',
  items: [
    { qty: '', description: '14K rope chain', amount: '' },
    { qty: '2', description: 'Sterling spoons', amount: '120' },
  ],
  payments: [{ method: '', reference: '', amount: '' }],
  notes: 'Waiting on the weight',
};

describe('normalizeBuyReceiptDraftSave: name only (owner, 2026-10-09)', () => {
  it('saves a form the full check would refuse, exactly as typed', () => {
    expect('error' in normalizeBuyReceiptInput(HALF_DONE)).toBe(true);
    const saved = normalizeBuyReceiptDraftSave({ ...HALF_DONE, emailCopy: true, mailingList: false });
    if ('error' in saved) throw new Error(saved.error);
    expect(saved.value.sellerName).toBe('Maria Lopez');
    // The form itself is kept as typed — the half-written row included.
    expect(saved.value.form.draft.items).toEqual(HALF_DONE.items);
    expect(saved.value.form.draft.sellerName).toBe('  Maria   Lopez ');
    expect(saved.value.form.draft.sellerPhone).toBe('239');
    expect(saved.value.form.draft.notes).toBe('Waiting on the weight');
    expect(saved.value.form).toMatchObject({ v: 1, emailCopy: true, mailingList: false });
    // The amounts typed so far, for the Log.
    expect(saved.value.total).toBe(120);
  });

  it('needs the name and nothing else', () => {
    expect(normalizeBuyReceiptDraftSave({ ...blankBuyReceiptDraft(), sellerName: 'Maria' })).toMatchObject({ value: { sellerName: 'Maria', total: 0 } });
    for (const name of ['', '   ', undefined, 42]) {
      expect(normalizeBuyReceiptDraftSave({ ...blankBuyReceiptDraft(), sellerName: name })).toEqual({ error: BUY_RECEIPT_DRAFT_NAME_NEEDED });
    }
    expect(normalizeBuyReceiptDraftSave(null)).toEqual({ error: BUY_RECEIPT_DRAFT_NAME_NEEDED });
  });

  it('writes only the name, the running total and the form to the row', () => {
    const saved = normalizeBuyReceiptDraftSave(HALF_DONE);
    if ('error' in saved) throw new Error(saved.error);
    const columns = buyReceiptDraftColumns(saved.value);
    expect(Object.keys(columns).sort()).toEqual(['draft_form', 'seller_name', 'total']);
    expect(columns.draft_form).toBe(saved.value.form);
  });
});

describe('sanitizeBuyReceiptDraft / readBuyReceiptDraftForm', () => {
  it('always comes back with the shape of the form', () => {
    for (const raw of [null, undefined, 'x', 7, [], { items: 'no', payments: null, sellerName: 9 }]) {
      const draft = sanitizeBuyReceiptDraft(raw);
      expect(Object.keys(draft).sort()).toEqual(Object.keys(blankBuyReceiptDraft()).sort());
      expect(draft.items).toEqual([{ qty: '', description: '', amount: '' }]);
      expect(draft.payments).toEqual([{ method: '', reference: '', amount: '' }]);
      expect(draft.sellerName).toBe('');
    }
  });

  it('caps what a draft can hold', () => {
    const draft = sanitizeBuyReceiptDraft({
      sellerName: 'x'.repeat(5000),
      notes: 'n'.repeat(5000),
      items: Array.from({ length: 80 }, () => ({ qty: '1', description: 'd'.repeat(5000), amount: '5' })),
      payments: Array.from({ length: 30 }, () => ({ method: 'cash', reference: '', amount: '' })),
    });
    expect(draft.sellerName.length).toBeLessThanOrEqual(200);
    expect(draft.notes.length).toBeLessThanOrEqual(500);
    expect(draft.items).toHaveLength(BUY_RECEIPT_MAX_ITEMS);
    expect(draft.items[0].description.length).toBeLessThanOrEqual(200);
    expect(draft.payments).toHaveLength(BUY_RECEIPT_MAX_PAYMENTS);
  });

  it('round-trips a saved form through the database column', () => {
    const saved = normalizeBuyReceiptDraftSave({ ...HALF_DONE, mailingList: true });
    if ('error' in saved) throw new Error(saved.error);
    const stored = JSON.parse(JSON.stringify(saved.value.form));
    expect(readBuyReceiptDraftForm(stored)).toEqual(saved.value.form);
  });

  it('answers null for anything that is not a stored form', () => {
    for (const raw of [null, undefined, 'x', [], {}, { v: 2, draft: {} }, { v: 1 }, { v: 1, draft: 'no' }]) {
      expect(readBuyReceiptDraftForm(raw)).toBeNull();
    }
  });

  it('a finished draft passes the full check with the form it was saved with', () => {
    const finished = {
      ...blankBuyReceiptDraft(),
      sellerName: 'Maria Lopez',
      items: [{ qty: '1', description: '14K rope chain', amount: '1010' }],
      payments: [{ method: 'cash', reference: '', amount: '' }],
    };
    const saved = normalizeBuyReceiptDraftSave(finished);
    if ('error' in saved) throw new Error(saved.error);
    const check = normalizeBuyReceiptInput(saved.value.form.draft);
    expect('error' in check ? check.error : null).toBeNull();
  });
});

describe('draft rows', () => {
  const row = { id: 'abc', status: 'draft', seller_name: 'Maria Lopez', seller_state: null, draft_form: null } as unknown as BuyReceiptDraftRow;

  it('opens even when the stored form cannot be read, under the name it was saved with', () => {
    const form = draftFormFromRow(row);
    expect(form.draft.sellerName).toBe('Maria Lopez');
    expect(form.draft.sellerState).toBe('FL');
    expect(form.emailCopy).toBe(false);
  });

  it('hands the form the row without the stored form', () => {
    const plain = receiptOfDraftRow({ ...row, draft_form: { v: 1 } });
    expect('draft_form' in plain).toBe(false);
    expect(plain.id).toBe('abc');
  });

  it('knows a draft, and where it is carried on', () => {
    expect(isDraftReceipt({ status: 'draft' })).toBe(true);
    expect(isDraftReceipt({ status: 'recorded' } as BuyReceiptRow)).toBe(false);
    expect(draftContinuePath('/admin', 'abc')).toBe('/admin/buy-receipts?draft=abc');
    expect(draftContinuePath('/es/admin', 'abc')).toBe('/es/admin/buy-receipts?draft=abc');
  });
});

// --- Source guards -------------------------------------------------------------
// The rules below are easy to undo by accident and expensive to get wrong.

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const components = (name: string) => read('src', 'components', 'admin', 'buy-receipts', name);
const api = (...parts: string[]) => read('src', 'app', 'api', 'admin', 'buy-receipts', ...parts);

describe('drafts: the database', () => {
  const sql = read('..', 'supabase', 'buy-receipts-drafts-2026-10.sql');

  it('adds the status and the column, and only a draft carries a stored form', () => {
    expect(sql).toContain("check (status in ('draft', 'recorded', 'void'))");
    expect(sql).toContain('add column if not exists draft_form jsonb;');
    expect(sql).toContain("check (status = 'draft' or draft_form is null)");
  });

  it('guards the rules in the database, in its own trigger', () => {
    expect(sql).toContain("if new.status = 'draft' and old.status <> 'draft' then");
    expect(sql).toContain("if new.status = 'draft' and new.print_requested_at is not null then");
    expect(sql).toContain("if old.status = 'draft' and new.status = 'void' then");
    expect(sql).toMatch(/if new\.status <> 'draft' then\s+new\.draft_form := null;/);
    expect(sql).toContain('create trigger buy_receipts_draft_guard');
    // Never an edit to the main guard: re-running that file must not drop these rules.
    expect(sql).not.toContain('function public.guard_buy_receipt_update');
  });

  it('keeps the stored form OUT of the one select list every page uses', () => {
    // A deploy before the SQL must leave every existing page working.
    expect(BUY_RECEIPT_COLUMNS).not.toContain('draft_form');
    expect(BUY_RECEIPT_DRAFT_COLUMNS).toBe(`${BUY_RECEIPT_COLUMNS}, draft_form`);
    for (const name of ['BuyReceiptLog.tsx', 'PrintStation.tsx', 'BuyReceiptDetail.tsx']) {
      expect(components(name), name).not.toContain('BUY_RECEIPT_DRAFT_COLUMNS');
    }
    const page = read('src', 'app', '[locale]', 'admin', 'buy-receipts', 'page.tsx');
    expect(page.match(/BUY_RECEIPT_DRAFT_COLUMNS/g)).toHaveLength(2); // the import and the one read
    expect(page).toContain('wantsDraft\n      ? supabase.from(\'buy_receipts\').select(BUY_RECEIPT_DRAFT_COLUMNS)');
  });
});

describe('drafts: the routes', () => {
  const create = api('route.ts');
  const one = api('[id]', 'route.ts');

  it('saves a draft with its number at once, and emails nobody', () => {
    const branch = create.slice(create.indexOf('if (body?.asDraft === true) {'), create.indexOf('const normalized = normalizeBuyReceiptInput(body);'));
    expect(branch).toContain('normalizeBuyReceiptDraftSave(body)');
    expect(branch).toContain("status: 'draft',");
    expect(branch).toContain('...buyReceiptDraftColumns(draft.value),');
    expect(branch).toContain('return NextResponse.json({ receipt: saved as unknown as BuyReceiptRow }, { status: 201 });');
    expect(branch).not.toContain('sendBuyReceiptEmail');
    expect(branch).not.toContain('addSellerToMailingList');
  });

  it('saves a draft again only while it is one, and never turns a receipt back into a draft', () => {
    const put = one.slice(one.indexOf('export async function PUT('), one.indexOf('export async function DELETE('));
    expect(put).toContain("if (current.status !== 'draft') {");
    expect(put).toContain('It cannot go back to a draft.');
    expect(put).toContain(".eq('status', 'draft')");
  });

  it('finishes a draft through the full check, then emails and joins the list like a new receipt', () => {
    const put = one.slice(one.indexOf('export async function PUT('), one.indexOf('export async function DELETE('));
    const checkAt = put.indexOf('const normalized = normalizeBuyReceiptInput(body);');
    const finishAt = put.indexOf("...(finishing ? { status: 'recorded', draft_form: null } : {}),");
    const emailAt = put.indexOf('if (body?.emailCopy === true) {');
    const listAt = put.indexOf('if (body?.mailingList === true && receipt.seller_email) {');
    expect(checkAt).toBeGreaterThan(-1);
    expect(finishAt).toBeGreaterThan(checkAt);
    expect(emailAt).toBeGreaterThan(finishAt);
    expect(listAt).toBeGreaterThan(emailAt);
    // An edit to a recorded receipt answers before any of that.
    expect(put).toContain('if (!finishing) return NextResponse.json({ receipt });');
    expect(put).toContain("const finishing = current.status === 'draft';");
  });

  it('never prints or emails a draft', () => {
    expect(api('[id]', 'print-request', 'route.ts')).toContain("if (current.status === 'draft') {");
    expect(api('[id]', 'printed', 'route.ts')).toContain("if (current.status === 'draft') {");
    expect(api('[id]', 'email', 'route.ts')).toContain("if (receipt.status === 'draft') {");
  });
});

describe('drafts: the form, the Log and the pages', () => {
  const form = components('BuyReceiptForm.tsx');
  const log = components('BuyReceiptLog.tsx');

  it('checks the name before posting, and creates or re-saves by whether the form is linked', () => {
    const save = form.slice(form.indexOf('async function saveDraft()'), form.indexOf('function startOver()'));
    expect(save).toContain('normalizeBuyReceiptDraftSave({ ...draft, emailCopy, mailingList })');
    expect(save).toContain('saveDraftReceipt(draft, { id: linked?.id ?? null,');
    // The pictures held in the browser go up with the FIRST save, and the address follows the draft.
    expect(save).toContain('uploadIdPhoto(receipt.id, photo.blob)');
    expect(save).toContain('uploadThumbprint(receipt.id, thumbprint.blob)');
    expect(save).toContain('showAddress(draftContinuePath(adminBasePath, receipt.id));');
  });

  it('finishes a linked draft instead of making a second receipt', () => {
    expect(form).toContain('? await finishDraftReceipt(linked.id, draft, wantsEmail, wantsList)');
    expect(form).toContain(': await createReceipt(draft, duplicatedFrom?.id ?? null, wantsEmail, wantsList);');
  });

  it('stores a picture at once on a saved draft', () => {
    expect(form).toContain('if (linked) void storePhoto(linked.id, blob);');
    expect(form).toContain('const result = await uploadThumbprint(linked.id, blob);');
  });

  it('offers customer input mode only before the first save', () => {
    // A refresh while locked lands on the plain address and would lose the draft.
    expect(form).toContain('saved || linked ? null : (');
    expect(form).toContain('if (modeBusy || busy || draftBusy || linked) return;');
  });

  it('lists a draft with one button, Continue, and no print buttons', () => {
    expect(log).toContain('const isDraft = isDraftReceipt(row);');
    expect(log).toContain('<Tag tone="gold">Draft</Tag>');
    const actions = log.slice(log.indexOf('{isDraft ? (\n                        <Link href={openHref} className="gold-button text-xs">'), log.indexOf('{/* A trash-can, not a fourth worded button'));
    expect(actions).toContain('Continue');
    expect(actions.indexOf('Continue')).toBeLessThan(actions.indexOf('Print here'));
    // Delete stays on every row, drafts included.
    expect(log).toContain('onClick={() => askDelete(row)}');
  });

  it('sends a draft to the form and a finished receipt to its page', () => {
    const detail = read('src', 'app', '[locale]', 'admin', 'buy-receipts', '[id]', 'page.tsx');
    expect(detail).toContain('if (isDraftReceipt(receipt)) redirect(draftContinuePath(adminBasePath, receipt.id));');
    const page = read('src', 'app', '[locale]', 'admin', 'buy-receipts', 'page.tsx');
    expect(page).toContain("if (openedRow && openedRow.status !== 'draft') redirect(`${adminBasePath}/buy-receipts/${openedRow.id}`);");
    // A locked browser never opens a draft.
    expect(page).toContain('const wantsDraft = !customerModeLocked && isReceiptId(draftId);');
  });
});
