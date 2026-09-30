import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUY_RECEIPT_ATTESTATION,
  BUY_RECEIPT_FORM_ROWS,
  BUY_RECEIPT_DEFAULT_PRINT_SET,
  BUY_RECEIPT_PRINT_SETS,
  blankBuyReceiptDraft,
  buyReceiptContentColumns,
  buyReceiptIdPhotoPath,
  buyReceiptTotal,
  draftFromReceipt,
  draftTotal,
  easternDayKey,
  formatDob,
  formatReceiptDate,
  formatReceiptDateTime,
  isClaimStale,
  isPrintPending,
  isReceiptId,
  normalizeBuyReceiptInput,
  parseBuyAmount,
  parseBuyQty,
  paymentLabel,
  paymentsBalance,
  paymentsLine,
  receiptPrintLabel,
  resolvePrintCopies,
  sampleBuyReceipt,
  type BuyReceiptDraft,
} from '../buy-receipts';

const NOW = new Date('2026-09-30T18:00:00Z');

function draft(overrides: Partial<BuyReceiptDraft> = {}): BuyReceiptDraft {
  return {
    ...blankBuyReceiptDraft(),
    sellerName: 'Maria Lopez',
    items: [
      { qty: '1', description: '14K rope chain, 18.4 g', amount: '$1,010.00' },
      { qty: '3', description: 'Sterling flatware pieces', amount: '240' },
      { qty: '', description: '', amount: '' },
    ],
    payments: [{ method: 'cash', reference: '', amount: '' }],
    ...overrides,
  };
}

function value(input: BuyReceiptDraft) {
  const result = normalizeBuyReceiptInput(input, NOW);
  if ('error' in result) throw new Error(`expected a value, got: ${result.error}`);
  return result.value;
}

function error(input: unknown) {
  const result = normalizeBuyReceiptInput(input, NOW);
  return 'error' in result ? result.error : null;
}

describe('parseBuyAmount / parseBuyQty', () => {
  it('accepts the shapes the owner types', () => {
    expect(parseBuyAmount('$1,460')).toBe(1460);
    expect(parseBuyAmount('1460.50')).toBe(1460.5);
    expect(parseBuyAmount(' 640 ')).toBe(640);
  });
  it('rejects blanks, words, zero, negatives and a third decimal', () => {
    for (const raw of ['', 'abc', '0', '-5', '1.234', null, undefined, '300000']) expect(parseBuyAmount(raw)).toBeNull();
  });
  it('treats a blank quantity as one piece and refuses fractions', () => {
    expect(parseBuyQty('')).toBe(1);
    expect(parseBuyQty('2')).toBe(2);
    for (const raw of ['0', '1.5', '-1', 'two', '1000']) expect(parseBuyQty(raw)).toBeNull();
  });
});

describe('totals', () => {
  it('adds line amounts without float drift', () => {
    expect(buyReceiptTotal([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
    expect(buyReceiptTotal([{ amount: 1010 }, { amount: 240 }])).toBe(1250);
  });
  it('counts only the rows that parse while the owner is still typing', () => {
    expect(draftTotal(draft())).toBe(1250);
    expect(draftTotal({ items: [{ qty: '', description: 'x', amount: 'abc' }] })).toBe(0);
  });
});

describe('normalizeBuyReceiptInput', () => {
  it('drops untouched rows, recomputes the total and gives a single payment the whole amount', () => {
    const result = value(draft());
    expect(result.items).toEqual([
      { qty: 1, description: '14K rope chain, 18.4 g', amount: 1010 },
      { qty: 3, description: 'Sterling flatware pieces', amount: 240 },
    ]);
    expect(result.total).toBe(1250);
    expect(result.payments).toEqual([{ method: 'cash', reference: null, amount: 1250 }]);
  });

  it('never trusts a total sent by the browser', () => {
    const result = normalizeBuyReceiptInput({ ...draft(), total: 1 }, NOW);
    expect('value' in result && result.value.total).toBe(1250);
  });

  it('needs a first and last name and at least one item', () => {
    expect(error(draft({ sellerName: 'Maria' }))).toBe("Enter the seller's first and last name.");
    expect(error(draft({ items: [{ qty: '', description: '', amount: '' }] }))).toBe(
      'Add at least one item with a description and an amount.',
    );
  });

  it('names the row that is half filled in', () => {
    expect(error(draft({ items: [{ qty: '1', description: 'Ring', amount: '50' }, { qty: '', description: 'Chain', amount: '' }] }))).toBe(
      'Row 2 needs an amount, e.g. 120.',
    );
    expect(error(draft({ items: [{ qty: '', description: '', amount: '75' }] }))).toBe('Row 1 needs a description.');
    expect(error(draft({ items: [{ qty: '1.5', description: 'Ring', amount: '75' }] }))).toMatch(/^Row 1: quantity/);
  });

  it('normalizes the optional seller details and refuses bad ones', () => {
    const result = value(
      draft({
        sellerPhone: '2395550134',
        sellerEmail: 'Maria@Example.com',
        sellerState: 'fl',
        sellerZip: '34102',
        sellerIdType: 'Driver license',
        sellerIdLast4: 'a731',
        sellerDob: '1961-04-18',
      }),
    );
    expect(result).toMatchObject({
      sellerPhone: '(239) 555-0134',
      sellerEmail: 'maria@example.com',
      sellerState: 'FL',
      sellerZip: '34102',
      sellerIdType: 'Driver license',
      sellerIdLast4: 'A731',
      sellerDob: '1961-04-18',
    });
    expect(error(draft({ sellerPhone: '123' }))).toBe('That phone number does not look right.');
    expect(error(draft({ sellerZip: '3410' }))).toBe('ZIP code is five digits, e.g. 34109.');
    expect(error(draft({ sellerState: 'Florida' }))).toBe('State is two letters, e.g. FL.');
    expect(error(draft({ sellerIdLast4: '12345' }))).toBe('ID last 4 is up to four letters or digits.');
    expect(error(draft({ sellerIdType: 'Library card' }))).toBe('Pick the ID type from the list.');
    expect(error(draft({ sellerDob: '1961-02-30' }))).toBe('Date of birth is not a real date.');
    expect(error(draft({ sellerDob: '2026-10-01' }))).toBe('Date of birth cannot be in the future.');
  });

  it('leaves blank optional fields as null rather than empty strings', () => {
    const result = value(draft({ sellerState: '' }));
    expect(result).toMatchObject({ sellerPhone: null, sellerEmail: null, sellerState: null, sellerDob: null, notes: null });
  });

  it('requires a payment method, and a number for a check', () => {
    expect(error(draft({ payments: [{ method: '', reference: '', amount: '' }] }))).toBe('Choose how the seller was paid.');
    expect(error(draft({ payments: [{ method: 'bitcoin', reference: '', amount: '' }] }))).toBe('Choose how the seller was paid.');
    expect(error(draft({ payments: [{ method: 'check', reference: ' ', amount: '' }] }))).toBe('Enter the check number.');
    expect(value(draft({ payments: [{ method: 'check', reference: '2041', amount: '' }] })).payments).toEqual([
      { method: 'check', reference: '2041', amount: 1250 },
    ]);
  });

  it('keeps a reference only for a check', () => {
    expect(value(draft({ payments: [{ method: 'cash', reference: '999', amount: '' }] })).payments[0].reference).toBeNull();
  });

  it('accepts a split payment only when it adds up to the total', () => {
    const split = [
      { method: 'cash', reference: '', amount: '500' },
      { method: 'check', reference: '2041', amount: '750.00' },
    ];
    expect(value(draft({ payments: split })).payments).toEqual([
      { method: 'cash', reference: null, amount: 500 },
      { method: 'check', reference: '2041', amount: 750 },
    ]);
    expect(error(draft({ payments: [split[0], { ...split[1], amount: '700' }] }))).toBe(
      'Payments add up to $1,200.00 but the total is $1,250.00.',
    );
    expect(error(draft({ payments: [split[0], { ...split[1], amount: '' }] }))).toBe('Enter an amount for each payment.');
  });

  it('caps the number of payment methods', () => {
    const five = Array.from({ length: 5 }, () => ({ method: 'cash', reference: '', amount: '250' }));
    expect(error(draft({ payments: five }))).toBe('A receipt holds up to 4 payment methods.');
  });

  it('maps onto the table columns, and nothing else', () => {
    const columns = buyReceiptContentColumns(value(draft()));
    expect(Object.keys(columns).sort()).toEqual(
      [
        'items', 'notes', 'payments', 'seller_city', 'seller_dob', 'seller_email', 'seller_id_last4', 'seller_id_type',
        'seller_name', 'seller_phone', 'seller_state', 'seller_street', 'seller_zip', 'total',
      ].sort(),
    );
  });
});

describe('payments on the paper and in the form', () => {
  it('prints one method alone and a split with each amount', () => {
    expect(paymentLabel('check', '2041')).toBe('Check #2041');
    expect(paymentLabel('cash', null)).toBe('Cash');
    expect(paymentsLine([{ method: 'check', reference: '2041', amount: 1250 }])).toBe('Check #2041');
    expect(
      paymentsLine([
        { method: 'cash', reference: null, amount: 500 },
        { method: 'check', reference: '2041', amount: 750 },
      ]),
    ).toBe('Cash $500.00 · Check #2041 $750.00');
    expect(paymentsLine([])).toBe('');
  });

  it('tells the owner whether a split adds up', () => {
    const ok = paymentsBalance(
      draft({ payments: [{ method: 'cash', reference: '', amount: '500' }, { method: 'zelle', reference: '', amount: '750' }] }),
    );
    expect(ok).toMatchObject({ split: true, matches: true, message: 'Payments add up to $1,250.00' });
    const off = paymentsBalance(
      draft({ payments: [{ method: 'cash', reference: '', amount: '500' }, { method: 'zelle', reference: '', amount: '' }] }),
    );
    expect(off).toMatchObject({ matches: false, message: 'Payments add up to $500.00 but the total is $1,250.00' });
  });
});

describe('print sets', () => {
  it('defaults to a shop copy plus a seller copy, no ID photo', () => {
    expect(BUY_RECEIPT_PRINT_SETS[BUY_RECEIPT_DEFAULT_PRINT_SET]).toMatchObject({ plain: 1, withId: 0, seller: 1 });
    expect(resolvePrintCopies(null, true)).toEqual({ plain: 1, withId: 0, seller: 1 });
  });
  it('turns a with-ID shop copy into a plain one when there is no photo, and never prints nothing', () => {
    expect(resolvePrintCopies({ plain: 0, withId: 1, seller: 1 }, true)).toEqual({ plain: 0, withId: 1, seller: 1 });
    expect(resolvePrintCopies({ plain: 0, withId: 1, seller: 1 }, false)).toEqual({ plain: 1, withId: 0, seller: 1 });
    expect(resolvePrintCopies({ plain: 0, withId: 0, seller: 0 }, true)).toEqual({ plain: 1, withId: 0, seller: 0 });
  });
  it('clamps silly numbers', () => {
    expect(resolvePrintCopies({ plain: 50, withId: 9, seller: 7 }, true)).toEqual({ plain: 3, withId: 2, seller: 3 });
  });
  it('signs the seller copy from the one constant, in the cursive face', () => {
    const sheet = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'BuyReceiptSheet.tsx'), 'utf8');
    expect(sheet).toContain('{BUY_RECEIPT_SIGNER_NAME}');
    expect(sheet).toContain('signatureFont.className');
    // The seller copy never carries the ID photo, and only the seller copy says thank you.
    expect(sheet).toContain("const withId = !sellerCopy && Boolean(showIdPhoto && idPhotoUrl);");
    expect(sheet).toContain('{sellerCopy && <p className="brs-thanks">');
    expect(readFileSync(join(process.cwd(), 'src', 'lib', 'signature-font.ts'), 'utf8')).toContain('Alex_Brush');
  });
});

describe('dates', () => {
  it('uses the showroom day, not the UTC day', () => {
    // 03:30 UTC on Sep 30 is 11:30 PM on Sep 29 in Naples.
    expect(formatReceiptDate('2026-09-30T03:30:00Z')).toBe('Sep 29, 2026');
    expect(easternDayKey('2026-09-30T03:30:00Z')).toBe('2026-09-29');
    expect(formatReceiptDateTime('2026-09-30T18:14:00Z')).toBe('Sep 30, 2026 · 2:14 PM');
  });
  it('prints a date of birth without touching a time zone', () => {
    expect(formatDob('1961-04-18')).toBe('04/18/1961');
    expect(formatDob(null)).toBe('');
  });
});

describe('print-station helpers', () => {
  it('knows when a print is still owed', () => {
    expect(isPrintPending({ print_requested_at: null, printed_at: null })).toBe(false);
    expect(isPrintPending({ print_requested_at: '2026-09-30T18:00:00Z', printed_at: null })).toBe(true);
    expect(isPrintPending({ print_requested_at: '2026-09-30T18:00:00Z', printed_at: '2026-09-30T17:00:00Z' })).toBe(true);
    expect(isPrintPending({ print_requested_at: '2026-09-30T18:00:00Z', printed_at: '2026-09-30T18:00:05Z' })).toBe(false);
  });
  it('lets a dead station claim be taken over after 90 seconds', () => {
    const now = Date.parse('2026-09-30T18:02:00Z');
    expect(isClaimStale({ print_claimed_at: null }, now)).toBe(true);
    expect(isClaimStale({ print_claimed_at: '2026-09-30T18:01:30Z' }, now)).toBe(false);
    expect(isClaimStale({ print_claimed_at: '2026-09-30T18:00:00Z' }, now)).toBe(true);
  });
  it('labels the print state for the log', () => {
    expect(receiptPrintLabel({ print_requested_at: null, printed_at: null, print_count: 0 })).toBe('Not printed');
    expect(receiptPrintLabel({ print_requested_at: null, printed_at: '2026-09-30T18:00:05Z', print_count: 2 })).toBe('Printed ×2');
    expect(receiptPrintLabel({ print_requested_at: '2026-09-30T18:00:00Z', printed_at: null, print_count: 0 })).toBe('Waiting for the desktop');
  });
});

describe('drafts and ids', () => {
  it('starts a blank form with ONE item row, one payment row and Florida', () => {
    const blank = blankBuyReceiptDraft();
    // Owner, 2026-09-30: one row by default, and the paper prints only the lines entered.
    expect(BUY_RECEIPT_FORM_ROWS).toBe(1);
    expect(blank.items).toEqual([{ qty: '', description: '', amount: '' }]);
    expect(blank.payments).toHaveLength(1);
    expect(blank.sellerState).toBe('FL');
  });
  it('turns a saved receipt back into a form, hiding the amount of a single payment', () => {
    const row = sampleBuyReceipt('2026-09-30T18:00:00Z');
    const form = draftFromReceipt(row);
    expect(form.sellerName).toBe('Test Print');
    // Exactly the saved lines: no blank rows are padded on when a receipt is opened for editing.
    expect(form.items).toHaveLength(2);
    expect(form.items[0]).toEqual({ qty: '1', description: 'This is a test print. Nothing was saved.', amount: '100.00' });
    expect(form.payments).toEqual([{ method: 'cash', reference: '', amount: '' }]);
    // And it round-trips through the validator.
    expect(value(form).total).toBe(150);
  });
  it('keeps each amount of a split payment when editing', () => {
    const row = {
      ...sampleBuyReceipt('2026-09-30T18:00:00Z'),
      payments: [
        { method: 'cash' as const, reference: null, amount: 100 },
        { method: 'check' as const, reference: '88', amount: 50 },
      ],
    };
    expect(draftFromReceipt(row).payments).toEqual([
      { method: 'cash', reference: '', amount: '100.00' },
      { method: 'check', reference: '88', amount: '50.00' },
    ]);
  });
  it('recognizes a receipt id and builds the private photo path', () => {
    expect(isReceiptId('0b0e7c1e-7a1b-4c52-9f0b-2f4f6d1f3a55')).toBe(true);
    expect(isReceiptId('test-print')).toBe(false);
    expect(isReceiptId(undefined)).toBe(false);
    expect(buyReceiptIdPhotoPath('abc', 'def')).toBe('receipts/abc/def.webp');
  });
});

// --- Source guards -------------------------------------------------------------
// The rules below are easy to undo by accident and expensive to get wrong.

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const components = (name: string) => read('src', 'components', 'admin', 'buy-receipts', name);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

describe('buy receipts: database and storage rules', () => {
  const sql = read('..', 'supabase', 'buy-receipts-2026-09.sql');

  it('grants the table to the role the admin routes and the station run as', () => {
    expect(sql).toContain('grant select, insert, update, delete on public.buy_receipts to authenticated');
    expect(sql).toContain('using (public.is_admin_user(auth.uid()))');
    expect(sql).toContain('revoke all on public.buy_receipts from anon');
    expect(sql).toContain("generated always as ('BUY-' || lpad(seq::text, 5, '0')) stored");
  });

  it('keeps the ID photo bucket private and admin-only', () => {
    expect(sql).toContain("values ('buy-receipt-ids', 'buy-receipt-ids', false,");
    expect(sql).toContain('set public = false');
    const policies = sql.match(/bucket_id = 'buy-receipt-ids' and public\.is_admin_user\(auth\.uid\(\)\)/g) ?? [];
    // select, insert, delete, and update (using + with check).
    expect(policies.length).toBe(5);
    expect(sql).not.toMatch(/buy receipt ids"[^;]*to (anon|public)/);
  });

  it('freezes a void receipt in the database, not only in the routes', () => {
    expect(sql).toContain('create trigger buy_receipts_guard');
    expect(sql).toContain('Void receipts cannot be edited');
  });
});

describe('buy receipts: routes', () => {
  const files = routeFiles(join(root, 'src', 'app', 'api', 'admin', 'buy-receipts'));

  it('has the six routes', () => {
    expect(files).toHaveLength(6);
  });

  it('gates every handler on requireAdmin and never reaches for the service role', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const handlers = source.match(/export async function (GET|POST|PUT|DELETE)/g) ?? [];
      const gates = source.match(/const admin = await requireAdmin\(\);/g) ?? [];
      expect(handlers.length, file).toBeGreaterThan(0);
      expect(gates.length, file).toBe(handlers.length);
      expect(source, file).not.toContain('createServiceClient');
    }
  });

  it('stores the ID photo privately and proves it is WebP', () => {
    const route = read('src', 'app', 'api', 'admin', 'buy-receipts', '[id]', 'id-photo', 'route.ts');
    expect(route).toContain('BUY_RECEIPT_ID_BUCKET');
    expect(route).not.toContain('getPublicUrl');
    // The public bucket is named only in the comment that forbids it.
    expect(route).not.toContain('PRODUCT_IMAGES_BUCKET');
    expect(route).not.toMatch(/from\(['"]product-images/);
    expect(route).toContain("produced.format !== 'webp'");
    expect(route).toContain("cacheControl: '0'");
    // A replace removes the previous object.
    expect(route).toContain('bucket.remove([previous])');
  });
});

describe('buy receipts: the paper, printing and the station', () => {
  it('prints the attestation from the one constant and no LLC line', () => {
    const sheet = components('BuyReceiptSheet.tsx');
    expect(sheet).toContain('{BUY_RECEIPT_ATTESTATION}');
    expect(sheet).toContain('{BUSINESS_NAME}');
    expect(sheet).not.toContain('LLC');
    expect(BUY_RECEIPT_ATTESTATION).toMatch(/lawful owner/);
    // The ID photo appears only when a copy asks for it.
    expect(sheet).toContain('{withId && (');
  });

  it('prints with no page margin so Chrome adds no header or footer', () => {
    const css = components('buy-receipt-sheet-css.ts');
    expect(css).toContain('@page { size: letter; margin: 0; }');
    expect(css).toContain('body > *:not(.buy-receipt-print-host) { display: none !important; }');
    // The small-screen layout must never reach paper: a print with browser margins is ~740px wide.
    expect(css).toContain('@media screen and (max-width: 760px)');
    expect(css).not.toMatch(/@media \(max-width/);
    // The print sheet fills whatever page box it gets.
    expect(css).toMatch(/\.buy-receipt-print-host \.buy-receipt-sheet \{\s*width: 100%;/);
    // Scoped: the paper lives inside the admin page and must not restyle it.
    expect(css).not.toMatch(/^\s*body\s*\{/m);
  });

  it('does not open a pop-up to print', () => {
    for (const name of ['BuyReceiptPrintHost.tsx', 'ReceiptPrintControls.tsx', 'BuyReceiptForm.tsx', 'BuyReceiptDetail.tsx', 'PrintStation.tsx']) {
      expect(components(name), name).not.toContain('window.open(');
    }
  });

  it('keeps the station off until the computer is chosen, and claims before printing', () => {
    const station = components('PrintStation.tsx');
    expect(station).toContain('BUY_RECEIPT_STATION_KEY');
    expect(station).toContain("if (armed !== 'armed') return;");
    expect(station).toContain(".eq('print_requested_at', next.print_requested_at as string)");
    expect(station).toContain('print_claimed_at.is.null,print_claimed_at.lt.');
    expect(station).toContain('supabase.auth.getSession()');
    // The clock must survive a covered window.
    expect(station).toContain('new Worker(');
  });

  it('allows the camera for our own pages in BOTH header files', () => {
    // The header VALUES, not the comments around them (which name the old value).
    const nextPolicy = /key: 'Permissions-Policy', value: '([^']+)'/.exec(read('next.config.ts'))?.[1] ?? '';
    const netlifyPolicy = /^\s*Permissions-Policy = "([^"]+)"/m.exec(read('..', 'netlify.toml'))?.[1] ?? '';
    for (const policy of [nextPolicy, netlifyPolicy]) {
      expect(policy).toContain('camera=(self)');
      expect(policy).not.toContain('camera=()');
      // The microphone rule that was already there must survive the edit.
      expect(policy).toContain('microphone=(self)');
    }
  });

  it('is reachable from the admin menu', () => {
    const header = read('src', 'components', 'admin', 'AdminHeader.tsx');
    expect(header).toContain("'buy-receipts': 'Buy Receipts'");
    expect(header).toContain('href={`${adminBasePath}/buy-receipts`}');
  });
});
