import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUY_RECEIPT_ATTESTATION,
  BUY_RECEIPT_ATTESTATION_SELLER,
  BUY_RECEIPT_FORM_ROWS,
  BUY_RECEIPT_DEFAULT_PRINT_SET,
  BUY_RECEIPT_DEFAULT_PRINT_SET_WITH_ID,
  BUY_RECEIPT_PAYMENT_LABELS,
  BUY_RECEIPT_PAYMENT_METHODS,
  BUY_RECEIPT_PRINT_SETS,
  BUY_RECEIPT_STATION_PATH,
  BUY_RECEIPT_STATION_SHORT_PATH,
  WINDOWS_SHORTCUT_TARGET_MAX,
  blankBuyReceiptDraft,
  buyReceiptContentColumns,
  buyReceiptIdPhotoFolder,
  buyReceiptIdPhotoPath,
  buyReceiptTotal,
  defaultPrintSet,
  draftFromReceipt,
  draftTotal,
  easternDayKey,
  formatDob,
  formatReceiptDate,
  formatReceiptDateTime,
  isClaimStale,
  isPrintPending,
  mergeFreshReceipts,
  pendingReceiptIds,
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
  stationShortcutTarget,
  type BuyReceiptDraft,
} from '../buy-receipts';
import { LEGACY_REDIRECTS, resolveLegacyRedirect } from '../legacy-redirects';

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

  it('offers Cash App and PayPal beside the other payment apps (owner, 2026-10-03)', () => {
    // The order is the order of the form's list: cash and check, then the apps together.
    expect([...BUY_RECEIPT_PAYMENT_METHODS]).toEqual(['cash', 'check', 'zelle', 'venmo', 'cashapp', 'paypal', 'bank_transfer', 'store_credit']);
    for (const method of BUY_RECEIPT_PAYMENT_METHODS) expect(BUY_RECEIPT_PAYMENT_LABELS[method]).toBeTruthy();
    expect(paymentLabel('cashapp', null)).toBe('Cash App');
    expect(paymentLabel('paypal', null)).toBe('PayPal');
    // Saved like any other method: the whole total, and no reference (only a check has one).
    expect(value(draft({ payments: [{ method: 'cashapp', reference: 'x', amount: '' }] })).payments).toEqual([
      { method: 'cashapp', reference: null, amount: 1250 },
    ]);
    expect(value(draft({ payments: [{ method: 'paypal', reference: '', amount: '750' }, { method: 'cash', reference: '', amount: '500' }] })).payments).toEqual([
      { method: 'paypal', reference: null, amount: 750 },
      { method: 'cash', reference: null, amount: 500 },
    ]);
    expect(paymentsLine([{ method: 'paypal', reference: null, amount: 750 }, { method: 'cashapp', reference: null, amount: 500 }])).toBe(
      'PayPal $750.00 · Cash App $500.00',
    );
    // The form's list is built from the same constants, so the two cannot drift apart.
    const sheet = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'BuyReceiptSheet.tsx'), 'utf8');
    expect(sheet).toContain('{BUY_RECEIPT_PAYMENT_METHODS.map((method) => (');
    // The database keeps payments as a free list — a new method must not need a migration.
    const sql = readFileSync(join(process.cwd(), '..', 'supabase', 'buy-receipts-2026-09.sql'), 'utf8');
    expect(sql).not.toMatch(/venmo|zelle/i);
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
  it('defaults to a shop copy plus a seller copy — the shop copy WITH the ID photo once there is one (owner, 2026-10-06)', () => {
    expect(BUY_RECEIPT_PRINT_SETS[BUY_RECEIPT_DEFAULT_PRINT_SET]).toMatchObject({ plain: 1, withId: 0, seller: 1 });
    expect(BUY_RECEIPT_PRINT_SETS[BUY_RECEIPT_DEFAULT_PRINT_SET_WITH_ID]).toMatchObject({ plain: 0, withId: 1, seller: 1 });
    expect(defaultPrintSet(false)).toBe('shop_and_seller');
    expect(defaultPrintSet(true)).toBe('shop_id_and_seller');
    // Either way it is one shop copy and one seller's copy: never a third sheet of paper by default.
    for (const withPhoto of [false, true]) {
      const set = BUY_RECEIPT_PRINT_SETS[defaultPrintSet(withPhoto)];
      expect(set.plain + set.withId).toBe(1);
      expect(set.seller).toBe(1);
    }
    // A print request that names no copies gets that default…
    expect(resolvePrintCopies(null, true)).toEqual({ plain: 0, withId: 1, seller: 1 });
    expect(resolvePrintCopies({}, true)).toEqual({ plain: 0, withId: 1, seller: 1 });
    expect(resolvePrintCopies(null, false)).toEqual({ plain: 1, withId: 0, seller: 1 });
    // …and one that names some is never topped up with a with-ID copy nobody asked for.
    expect(resolvePrintCopies({ plain: 1 }, true)).toEqual({ plain: 1, withId: 0, seller: 1 });
    expect(resolvePrintCopies({ plain: 1, withId: 0, seller: 1 }, true)).toEqual({ plain: 1, withId: 0, seller: 1 });
  });
  it('every place that prints without being told what asks the one default (form, print panel, Log)', () => {
    const form = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'BuyReceiptForm.tsx'), 'utf8');
    const panel = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'ReceiptPrintControls.tsx'), 'utf8');
    const log = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'BuyReceiptLog.tsx'), 'utf8');
    // Null until the owner picks, so the default can follow the photo; a pick is kept.
    expect(form).toContain('useState<BuyReceiptPrintSetKey | null>(null)');
    expect(form).toContain('chosenSet && printSetAllowed(chosenSet, hasPhoto) ? chosenSet : defaultPrintSet(hasPhoto)');
    expect(panel).toContain('chosen && printSetAllowed(chosen, hasIdPhoto) ? chosen : defaultPrintSet(hasIdPhoto)');
    expect(log.match(/BUY_RECEIPT_PRINT_SETS\[defaultPrintSet\(Boolean\(row\.seller_id_photo_path\)\)\]/g)).toHaveLength(2);
    // The Log's "Print here" really loads the photo it now prints, and refuses to print without it.
    expect(log).toContain('idPhoto = await printableIdPhoto(row.seller_id_photo_path);');
    expect(log).toContain('the ID photo could not be loaded, so nothing was printed.');
    for (const source of [form, panel, log]) expect(source).not.toContain('BUY_RECEIPT_DEFAULT_PRINT_SET');
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
    // Field labels sit UNDER their line, on screen and on paper (owner, 2026-10-01).
    expect(sheet).not.toMatch(/<span className="brs-label">[^<]+<\/span>\s*<(input|select|Value|AutoGrowTextarea)/);
    expect(sheet).toContain('<Value>{receipt.seller_name}</Value><span className="brs-label">Name</span>');
    expect(sheet).toContain('<span>Email copy</span>');
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
  it('keeps the desktop shortcut inside what Windows stores — it was 260 characters once and lost its last letter', () => {
    const target = stationShortcutTarget('https://naplesestatejewelry.com');
    // Counted here, never by hand: a comment once said "253" for a 260-character
    // string, and the owner's shortcut opened …/statio (2026-10-03).
    expect(target.length).toBe(247);
    expect(target.length).toBeLessThanOrEqual(WINDOWS_SHORTCUT_TARGET_MAX);
    expect(target).toBe(
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" '
      + '--user-data-dir="%LOCALAPPDATA%\\NEJStation" --kiosk-printing '
      + '--disable-backgrounding-occluded-windows --disable-background-timer-throttling '
      + '--app=https://naplesestatejewelry.com/admin/station',
    );
    // A trailing slash on the site address must not cost a character or break the path.
    expect(stationShortcutTarget('https://naplesestatejewelry.com/')).toBe(target);
  });
  it('the short station address, and the cut-off one the first shortcut has, both reach the station', () => {
    expect(BUY_RECEIPT_STATION_SHORT_PATH).toBe('/admin/station');
    expect(resolveLegacyRedirect(BUY_RECEIPT_STATION_SHORT_PATH)).toEqual({ destination: BUY_RECEIPT_STATION_PATH, permanent: false });
    expect(resolveLegacyRedirect('/admin/buy-receipts/statio')).toEqual({ destination: BUY_RECEIPT_STATION_PATH, permanent: false });
    expect(resolveLegacyRedirect('/es/admin/station')).toEqual({ destination: `/es${BUY_RECEIPT_STATION_PATH}`, permanent: false });
    // The station page itself is never redirected, and it exists.
    expect(LEGACY_REDIRECTS[BUY_RECEIPT_STATION_PATH]).toBeUndefined();
    expect(statSync(join(process.cwd(), 'src', 'app', '[locale]', 'admin', 'buy-receipts', 'station', 'page.tsx')).isFile()).toBe(true);
    // The setup box on the station page shows the tested text, not a second copy of it.
    const help = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'StationSetupHelp.tsx'), 'utf8');
    expect(help).toContain('stationShortcutTarget(getSiteUrl())');
    expect(help).not.toContain('chrome.exe');
  });
  it('labels the print state for the log', () => {
    expect(receiptPrintLabel({ print_requested_at: null, printed_at: null, print_count: 0 })).toBe('Not printed');
    expect(receiptPrintLabel({ print_requested_at: null, printed_at: '2026-09-30T18:00:05Z', print_count: 2 })).toBe('Printed ×2');
    expect(receiptPrintLabel({ print_requested_at: '2026-09-30T18:00:00Z', printed_at: null, print_count: 0 })).toBe('Waiting for the desktop');
  });
  it('the Log watches the waiting rows and folds fresh copies in', () => {
    const base = sampleBuyReceipt('2026-09-30T18:00:00.000Z');
    const waiting = { ...base, id: 'b', print_requested_at: '2026-09-30T18:00:00Z', printed_at: null };
    const idle = { ...base, id: 'a' };
    expect(pendingReceiptIds([waiting, idle])).toEqual(['b']);
    expect(pendingReceiptIds([idle])).toEqual([]);

    const list = [waiting, idle];
    // No news: the very same array, so nothing re-renders.
    expect(mergeFreshReceipts(list, [{ ...waiting }])).toBe(list);
    // The desktop printed: that row is replaced, the order and the other row are kept.
    const printed = { ...waiting, print_requested_at: null, printed_at: '2026-09-30T18:00:09Z', print_count: 2, updated_at: '2026-09-30T18:00:09.000Z' };
    const merged = mergeFreshReceipts(list, [printed]);
    expect(merged.map((row) => row.id)).toEqual(['b', 'a']);
    expect(merged[0]).toBe(printed);
    expect(merged[1]).toBe(idle);
    expect(pendingReceiptIds(merged)).toEqual([]);
    expect(receiptPrintLabel(merged[0])).toBe('Printed ×2');

    const source = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts', 'BuyReceiptLog.tsx'), 'utf8');
    expect(source).toContain("select(BUY_RECEIPT_COLUMNS).in('id', ids)");
    expect(source).toContain("document.addEventListener('visibilitychange', onReturn)");
    // Straight from Supabase under the admin session — never a new polling route.
    expect(source).toContain('await supabase.auth.getSession()');
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

  it('has the nine routes', () => {
    // The eighth (2026-10-03) starts and ends customer input mode; the ninth (2026-10-06) keeps the seller's thumbprint.
    expect(files).toHaveLength(9);
  });

  it('gates every handler on requireAdmin and never reaches for the service role', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const handlers = source.match(/export async function (GET|POST|PUT|DELETE)/g) ?? [];
      // Only the customer-mode route may ask to be answered on a locked browser:
      // it is how the lock starts and ends. Every other route refuses one.
      const lockRoute = file.replace(/\\/g, '/').endsWith('/customer-mode/route.ts');
      const gate = lockRoute
        ? /const admin = await requireAdmin\(\{ duringCustomerMode: true \}\);/g
        : /const admin = await requireAdmin\(\);/g;
      const gates = source.match(gate) ?? [];
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

  it('deletes a receipt with its ID photo, photo first, and nothing if the photo cannot go (owner, 2026-10-03)', () => {
    const route = read('src', 'app', 'api', 'admin', 'buy-receipts', '[id]', 'route.ts');
    expect(route).toContain('export async function DELETE(');
    // The private bucket has no garbage collector: the photo is removed BEFORE the row.
    const listAt = route.indexOf('bucket.list(folder');
    const removeAt = route.indexOf('bucket.remove([...paths])');
    const deleteAt = route.indexOf(".from('buy_receipts').delete().eq('id', id)");
    expect(listAt).toBeGreaterThan(-1);
    expect(removeAt).toBeGreaterThan(listAt);
    expect(deleteAt).toBeGreaterThan(removeAt);
    expect(route).toContain('Nothing was deleted.');
    expect(route).toContain('BUY_RECEIPT_ID_BUCKET');
    expect(route).toContain('buyReceiptIdPhotoFolder(id)');
    expect(buyReceiptIdPhotoFolder('abc')).toBe('receipts/abc');
    expect(buyReceiptIdPhotoPath('abc', 'f1')).toBe('receipts/abc/f1.webp');
    // Unknown ids are a 404, and both kinds of receipt can go: no status check stands in the way.
    const handler = route.slice(route.indexOf('export async function DELETE('));
    expect(handler).toContain('if (!isReceiptId(id)) return notFound();');
    expect(handler).toContain('if (!current) return notFound();');
    expect(handler).not.toContain("status === 'void'");
  });

  it('needs no new SQL for a delete: the grant, the copy link and the guard already allow it', () => {
    const sql = read('..', 'supabase', 'buy-receipts-2026-09.sql');
    expect(sql).toContain('grant select, insert, update, delete on public.buy_receipts to authenticated');
    expect(sql).toContain('duplicated_from      uuid references public.buy_receipts (id) on delete set null');
    // The guard watches updates only, so a void receipt can still be deleted.
    expect(sql).toContain('before update on public.buy_receipts');
    expect(sql).not.toMatch(/before delete/i);
    expect(sql).toContain('create policy "Admins delete buy receipt ids"');
  });

  it('the Log asks before deleting, in a pop-up window, and points to Void for a real purchase', () => {
    const log = components('BuyReceiptLog.tsx');
    expect(log).toContain('deleteReceipt(deleting.id)');
    expect(log).toContain('<AdminModal title={`Delete ${deleting.receipt_number}`}');
    expect(log).toContain('It cannot be');
    expect(log).toContain('<strong>Void</strong>');
    expect(log).toContain('Keep it');
    // The row leaves the list only after the server confirmed it.
    const refusedAt = log.search(/if \('error' in result\) \{\s+setDeleteError\(result\.error\);\s+return;/);
    expect(refusedAt).toBeGreaterThan(-1);
    expect(refusedAt).toBeLessThan(log.indexOf('current.filter((item) => item.id !== deleting.id)'));
    // No browser confirm box: it blocks the page and looks nothing like the rest of Admin.
    expect(log).not.toContain('window.confirm');
    // The button is a trash-can with a spoken name — a fourth worded button did not fit an iPad.
    expect(log).toContain('aria-label={`Delete ${row.receipt_number}`}');
    expect(log).toContain('<AppIcon name="delete"');
    // Below 1100px the cells and the worded buttons give up side padding so all four controls fit.
    expect(log).toContain('@media (max-width: 1100px)');
    expect(log).toContain('.brl-table .brl-actions .outline-button { padding-left: 0.85rem; padding-right: 0.85rem; }');
    expect(log).toContain('className="brl-table w-full text-sm"');
    expect(log).toContain('className="brl-actions px-4 py-3 text-right whitespace-nowrap"');
    // No preview page is ever shipped.
    expect(existsSync(join(root, 'src', 'app', '[locale]', 'zz-receipt-log-preview'))).toBe(false);
    const client = components('buy-receipt-client.ts');
    expect(client).toContain("fetch(`/api/admin/buy-receipts/${id}`, { method: 'DELETE' })");
    expect(client).toContain('data.deleted !== true');
  });
});

describe('buy receipts: the seller copy by email', () => {
  it('builds the seller copy as an email: number, lines, total, paid-by, the signed line, never the ID', async () => {
    const { buildBuyReceiptEmail } = await import('../buy-receipt-email');
    const row = {
      ...sampleBuyReceipt('2026-09-30T18:14:00Z'),
      receipt_number: 'BUY-00042',
      seller_email: 'maria@example.com',
      seller_id_photo_path: 'receipts/x/y.webp',
      payments: [
        { method: 'cash' as const, reference: null, amount: 100 },
        { method: 'check' as const, reference: '2041', amount: 50 },
      ],
    };
    const email = buildBuyReceiptEmail(row);
    expect(email.subject).toBe('Your receipt from Naples Estate Jewelry — BUY-00042');
    for (const part of ['BUY-00042', 'Sep 30, 2026 · 2:14 PM', 'This is a test print. Nothing was saved.', '$150.00', 'Paid by: Cash $100.00 · Check #2041 $50.00', 'Total paid to seller', 'Received by:', 'Christopher Surette', BUY_RECEIPT_ATTESTATION_SELLER, 'Items purchased by Naples Estate Jewelry', 'Seller&rsquo;s copy', '/assets/images/branding/email-logo.png']) {
      expect(email.html).toContain(part);
    }
    expect(email.text).toContain('Total paid to seller: $150.00');
    // The ID photo is never in the email, in any form; the only image is the logo.
    expect(email.html).not.toContain('receipts/x/y.webp');
    expect(email.html.match(/<img /g)).toHaveLength(1);
    // The email speaks of the seller in the third person; the paper keeps its first-person line.
    expect(email.html).not.toContain('I certify');
    expect(email.text).not.toContain('y.webp');
    // A void receipt says so in the subject.
    expect(buildBuyReceiptEmail({ ...row, status: 'void', void_reason: 'Test' }).subject).toMatch(/^VOID — /);
  });

  it('is sent through the admin routes only, never attaching the photo', () => {
    const route = read('src', 'app', 'api', 'admin', 'buy-receipts', '[id]', 'email', 'route.ts');
    expect(route).toContain('requireAdmin()');
    expect(route).not.toContain('createServiceClient');
    const mailer = read('src', 'lib', 'buy-receipt-mailer.ts');
    expect(mailer).toContain("replyTo: 'info@naplesestatejewelry.com'");
    expect(mailer).not.toContain('attachments');
    expect(mailer).not.toContain('seller_id_photo_path');
    // Nor the thumbprint: neither the mailer nor the email it builds ever reads that column.
    expect(mailer).not.toContain('seller_thumbprint_path');
    expect(read('src', 'lib', 'buy-receipt-email.ts')).not.toContain('seller_thumbprint_path');
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
