import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankBuyReceiptDraft, normalizeBuyReceiptInput } from '../buy-receipts';
import {
  CUSTOMER_FIELDS,
  CUSTOMER_MODE_API,
  CUSTOMER_MODE_CODE_LENGTH,
  customerFieldProblem,
  customerFirstName,
  customerHandBack,
  customerProblems,
  formatCustomerField,
  formatCustomerPhone,
  formatCustomerState,
  formatCustomerZip,
  readCustomerModeSnapshot,
  tidyCustomerValues,
  writeCustomerModeSnapshot,
  type CustomerValues,
} from '../buy-receipt-customer-mode';
import {
  CUSTOMER_MODE_COOKIE,
  CUSTOMER_MODE_COOKIE_MAX_AGE_SECONDS,
  CUSTOMER_MODE_MARKER_KEY,
  CUSTOMER_MODE_MAX_TRIES,
  CUSTOMER_MODE_TRY_WINDOW_SECONDS,
  customerModeBounce,
} from '../customer-mode-lock';
import { BUY_RECEIPT_STAFF_CODE, isBuyReceiptStaffCode } from '../buy-receipt-staff-code';
import { subscriberSourceLabel } from '../subscriber-sort';

// Buy receipt "Customer input mode" (owner, 2026-10-03): the seller types their
// own contact details on a locked screen. The owner's rulings, pinned here:
// the receipt form itself is unchanged and still fills in everything; the mode
// is one optional button; the seller sees seven boxes and no ID, no date of
// birth; email is optional; nothing on that browser reaches the back end
// without the staff code.

const FULL: CustomerValues = {
  sellerName: 'Maria Lopez',
  sellerPhone: '(239) 404-8505',
  sellerStreet: '1420 Pine Ridge Rd',
  sellerCity: 'Naples',
  sellerState: 'FL',
  sellerZip: '34109',
  sellerEmail: '',
};

describe('what the seller is asked for', () => {
  it('is seven boxes — never the ID type, the ID number or the date of birth (owner: "i will do the ID stuff")', () => {
    expect([...CUSTOMER_FIELDS]).toEqual(['sellerName', 'sellerPhone', 'sellerStreet', 'sellerCity', 'sellerState', 'sellerZip', 'sellerEmail']);
    for (const kept of ['sellerIdType', 'sellerIdLast4', 'sellerDob']) {
      expect(CUSTOMER_FIELDS as readonly string[]).not.toContain(kept);
    }
  });

  it('passes a complete form, with or without an email', () => {
    expect(customerProblems(FULL)).toEqual([]);
    expect(customerProblems({ ...FULL, sellerEmail: 'maria.lopez@example.com' })).toEqual([]);
  });

  it('flags every unfinished box with a reason short enough to sit beside its label', () => {
    const blank: CustomerValues = { sellerName: '', sellerPhone: '', sellerStreet: '', sellerCity: '', sellerState: '', sellerZip: '', sellerEmail: '' };
    // Six, not seven: an empty email is fine.
    expect(customerProblems(blank).map((entry) => entry.field)).toEqual(['sellerName', 'sellerPhone', 'sellerStreet', 'sellerCity', 'sellerState', 'sellerZip']);
    expect(customerProblems(blank).every((entry) => entry.problem === 'Needed')).toBe(true);

    expect(customerFieldProblem('sellerName', 'Maria')).toBe('Add your last name');
    expect(customerFieldProblem('sellerName', 'Maria .')).toBe('Check this');
    expect(customerFieldProblem('sellerName', 'Juan de la Cruz')).toBe('');
    expect(customerFieldProblem('sellerPhone', '(239) 404')).toBe('10 digits');
    // Ten digits that cannot ring a telephone.
    expect(customerFieldProblem('sellerPhone', '111-111-1111')).toBe('Check this');
    expect(customerFieldProblem('sellerPhone', '1 239 404 8505')).toBe('');
    expect(customerFieldProblem('sellerState', 'F')).toBe('2 letters');
    expect(customerFieldProblem('sellerState', 'fl')).toBe('');
    expect(customerFieldProblem('sellerZip', '3410')).toBe('5 digits');
    expect(customerFieldProblem('sellerZip', '34109-1234')).toBe('');
    for (const field of CUSTOMER_FIELDS) {
      for (const sample of ['', 'x', 'Maria', '123']) {
        expect(customerFieldProblem(field, sample).length, `${field}: ${sample}`).toBeLessThanOrEqual(18);
      }
    }
  });

  it('keeps the email optional but checks one that is typed (owner: "keep the email optional")', () => {
    expect(customerFieldProblem('sellerEmail', '')).toBe('');
    expect(customerFieldProblem('sellerEmail', '   ')).toBe('');
    expect(customerFieldProblem('sellerEmail', 'maria@')).toBe('Check this');
    expect(customerFieldProblem('sellerEmail', 'maria.lopez@example.com')).toBe('');
  });

  it('never accepts a box the receipt itself would refuse to save', () => {
    const cases: CustomerValues[] = [
      FULL,
      { ...FULL, sellerEmail: ' Maria.Lopez@Example.com ' },
      { ...FULL, sellerPhone: '1 (239) 404-8505', sellerZip: '34109-1234', sellerState: 'fl' },
      { ...FULL, sellerName: '  Juan   de la  Cruz ', sellerPhone: '239.404.8505 x12' },
    ];
    for (const values of cases) {
      expect(customerProblems(values), JSON.stringify(values)).toEqual([]);
      const draft = {
        ...blankBuyReceiptDraft(),
        ...tidyCustomerValues(values),
        items: [{ qty: '1', description: '14K chain', amount: '100' }],
        payments: [{ method: 'cash', reference: '', amount: '' }],
      };
      const result = normalizeBuyReceiptInput(draft);
      expect('error' in result ? result.error : null, JSON.stringify(values)).toBeNull();
    }
  });

  it('tidies a finished form the way the receipt stores it', () => {
    expect(
      tidyCustomerValues({
        sellerName: '  maria   lopez ',
        sellerPhone: '2394048505',
        sellerStreet: ' 1420  Pine Ridge Rd ',
        sellerCity: ' Naples ',
        sellerState: 'fl',
        sellerZip: ' 34109 ',
        sellerEmail: ' Maria@Example.com ',
      }),
    ).toEqual({
      sellerName: 'maria lopez',
      sellerPhone: '(239) 404-8505',
      sellerStreet: '1420 Pine Ridge Rd',
      sellerCity: 'Naples',
      sellerState: 'FL',
      sellerZip: '34109',
      sellerEmail: 'maria@example.com',
    });
    expect(customerFirstName('  Maria Lopez')).toBe('Maria');
    expect(customerFirstName('')).toBe('');
  });
});

describe('typing helpers', () => {
  it('formats a phone as its digits are typed, one character at a time', () => {
    let value = '';
    const seen: string[] = [];
    for (const digit of '2394048505') {
      value = formatCustomerPhone(value + digit);
      seen.push(value);
    }
    expect(seen).toEqual(['2', '23', '239', '(239) 4', '(239) 40', '(239) 404', '(239) 404-8', '(239) 404-85', '(239) 404-850', '(239) 404-8505']);
    // Backspace over the punctuation never sticks.
    expect(formatCustomerPhone('(239) 404-')).toBe('(239) 404');
    expect(formatCustomerPhone('(239) ')).toBe('239');
    // A leading 1 is the same number; an eleventh digit is not kept.
    expect(formatCustomerPhone('12394048505')).toBe('(239) 404-8505');
    expect(formatCustomerPhone('23940485059')).toBe('(239) 404-8505');
  });

  it('leaves a number the owner typed in another shape exactly as it is', () => {
    expect(formatCustomerPhone('+44 20 7123 4567')).toBe('+44 20 7123 4567');
    expect(formatCustomerPhone('(239) 404-8505 x12')).toBe('(239) 404-8505 x12');
  });

  it('upper-cases the state and keeps a ZIP to digits', () => {
    expect(formatCustomerState('fl')).toBe('FL');
    expect(formatCustomerState('f1l9a')).toBe('FL');
    expect(formatCustomerZip('34109')).toBe('34109');
    expect(formatCustomerZip('341091234')).toBe('34109-1234');
    expect(formatCustomerZip('34109-12ab')).toBe('34109-12');
    expect(formatCustomerField('sellerCity', ' Naples ')).toBe(' Naples ');
    expect(formatCustomerField('sellerState', 'ny')).toBe('NY');
  });
});

describe('the line the form shows when the tablet comes back', () => {
  const none = { emailCopy: false, mailingList: false };

  const withEmail = { ...FULL, sellerEmail: 'm@example.com' };

  it('is not there at all when nothing needs the owner (owner: "the only change we should see to the page is the new button")', () => {
    expect(customerHandBack('saved', FULL, none)).toBeNull();
    expect(customerHandBack('saved', withEmail, none)).toBeNull();
    expect(customerHandBack('staff', FULL, none)).toBeNull();
  });

  it('says what the seller asked for, because the form has no other place that does', () => {
    expect(customerHandBack('saved', withEmail, { emailCopy: false, mailingList: true })).toEqual({
      kind: 'ok',
      text: 'The customer asked to join the mailing list — they are added when you save the receipt.',
    });
    expect(customerHandBack('saved', withEmail, { emailCopy: true, mailingList: false })).toEqual({
      kind: 'ok',
      text: 'The customer asked for an emailed copy — Email copy is ticked.',
    });
    expect(customerHandBack('staff', withEmail, { emailCopy: true, mailingList: true })).toEqual({
      kind: 'ok',
      text: 'The customer asked for an emailed copy — Email copy is ticked. They also asked to join the mailing list — they are added when you save the receipt.',
    });
  });

  it('names what is still unfinished after "Submit unfinished", in the form\'s own words', () => {
    const unfinished = { ...FULL, sellerName: 'Maria', sellerCity: '', sellerZip: '3410' };
    expect(customerHandBack('unfinished', unfinished, none)).toEqual({
      kind: 'warn',
      text: 'Submitted unfinished with the staff code. Still to finish: Name, City, ZIP.',
    });
    expect(customerHandBack('unfinished', { ...unfinished, sellerEmail: 'm@example.com' }, { emailCopy: false, mailingList: true })?.text).toBe(
      'Submitted unfinished with the staff code. Still to finish: Name, City, ZIP. The customer asked to join the mailing list — they are added when you save the receipt.',
    );
    // The list shrinks as the owner finishes the boxes, and the line leaves with the last one.
    expect(customerHandBack('unfinished', { ...FULL, sellerZip: '3410' }, none)?.text).toBe('Submitted unfinished with the staff code. Still to finish: ZIP.');
    expect(customerHandBack('unfinished', FULL, none)).toBeNull();
  });

  it('never promises an emailed copy or the mailing list without an email', () => {
    expect(customerHandBack('staff', FULL, { emailCopy: true, mailingList: true })).toBeNull();
    expect(customerHandBack('saved', FULL, { emailCopy: true, mailingList: true })).toBeNull();
  });
});

describe('surviving a refresh', () => {
  const draft = {
    ...blankBuyReceiptDraft(),
    ...FULL,
    sellerDob: '1961-04-18',
    items: [{ qty: '1', description: '14K rope chain', amount: '1010' }],
    payments: [{ method: 'cash', reference: '', amount: '' }],
  };

  it('brings back the whole form — the owner\'s items as well as the seller\'s boxes', () => {
    const stored = writeCustomerModeSnapshot({ draft, emailCopy: true, mailingList: true, phase: 'thanks', tried: false });
    expect(readCustomerModeSnapshot(stored)).toEqual({ draft, emailCopy: true, mailingList: true, phase: 'thanks', tried: false });
  });

  it('trusts nothing in storage that is not shaped like a form', () => {
    expect(readCustomerModeSnapshot(null)).toBeNull();
    expect(readCustomerModeSnapshot('')).toBeNull();
    expect(readCustomerModeSnapshot('{not json')).toBeNull();
    expect(readCustomerModeSnapshot('"text"')).toBeNull();
    expect(readCustomerModeSnapshot(JSON.stringify({ v: 2, draft }))).toBeNull();
    expect(readCustomerModeSnapshot(JSON.stringify({ v: 1, draft: { ...draft, sellerName: 5 } }))).toBeNull();
    expect(readCustomerModeSnapshot(JSON.stringify({ v: 1, draft: { ...draft, items: [] } }))).toBeNull();
    expect(readCustomerModeSnapshot(JSON.stringify({ v: 1, draft: { ...draft, items: [{ qty: 1 }] } }))).toBeNull();
    expect(readCustomerModeSnapshot(JSON.stringify({ v: 1, draft: { ...draft, payments: 'cash' } }))).toBeNull();
    // Unknown flags fall back to the safe side: the form, nothing ticked.
    expect(readCustomerModeSnapshot(JSON.stringify({ v: 1, draft, phase: 'admin', emailCopy: 'yes' }))).toMatchObject({ phase: 'form', emailCopy: false, mailingList: false, tried: false });
  });
});

describe('the lock: what a browser in customer input mode may open', () => {
  it('sends every admin and account page back to the New receipt page', () => {
    for (const path of ['/admin', '/admin/orders', '/admin/buy-receipts/log', '/admin/buy-receipts/station', '/admin/buy-receipts/abc', '/admin/subscribers', '/account', '/account/security', '/account/reset-password', '/account/sign-up']) {
      expect(customerModeBounce(path), path).toBe('/admin/buy-receipts');
    }
  });

  it('keeps the language, and reads a path the same with or without its locale', () => {
    expect(customerModeBounce('/es/admin/orders')).toBe('/es/admin/buy-receipts');
    expect(customerModeBounce('/es/account/security')).toBe('/es/admin/buy-receipts');
    expect(customerModeBounce('/en/admin/orders')).toBe('/admin/buy-receipts');
    expect(customerModeBounce('/admin/orders/')).toBe('/admin/buy-receipts');
    expect(customerModeBounce('/%61dmin/orders')).toBe('/admin/buy-receipts');
  });

  it('lets through the lock page itself, the sign-in page and the public site', () => {
    for (const path of ['/admin/buy-receipts', '/admin/buy-receipts/', '/en/admin/buy-receipts', '/es/admin/buy-receipts', '/account/sign-in', '/es/account/sign-in', '/', '/es', '/shop', '/sell/naples', '/administrator', '/accounting', '/checkout']) {
      expect(customerModeBounce(path), path).toBeNull();
    }
  });

  it('never bounces to a page it would bounce again (no redirect loop)', () => {
    for (const path of ['/admin', '/es/admin/x', '/account', '/es/account/security']) {
      const destination = customerModeBounce(path);
      expect(destination).not.toBeNull();
      expect(customerModeBounce(destination as string)).toBeNull();
    }
  });

  it('frees itself overnight and pauses after five tries', () => {
    expect(CUSTOMER_MODE_COOKIE).toBe('nej_customer_mode');
    expect(CUSTOMER_MODE_COOKIE_MAX_AGE_SECONDS).toBe(12 * 60 * 60);
    expect(CUSTOMER_MODE_MAX_TRIES).toBe(5);
    expect(CUSTOMER_MODE_TRY_WINDOW_SECONDS).toBe(30);
    expect(CUSTOMER_MODE_CODE_LENGTH).toBe(BUY_RECEIPT_STAFF_CODE.length);
  });
});

describe('the staff code', () => {
  it('accepts only the code', () => {
    expect(isBuyReceiptStaffCode(BUY_RECEIPT_STAFF_CODE)).toBe(true);
    expect(isBuyReceiptStaffCode(` ${BUY_RECEIPT_STAFF_CODE} `)).toBe(true);
    for (const wrong of ['', '0000', '250', '25000', '2501', null, undefined, 2500, ['2500'], { code: '2500' }]) {
      expect(isBuyReceiptStaffCode(wrong), String(wrong)).toBe(false);
    }
  });
});

// --- Source guards -------------------------------------------------------------
// The rules below are easy to undo by accident and expensive to get wrong.

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const component = (name: string) => read('src', 'components', 'admin', 'buy-receipts', name);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('customer input mode: the code never reaches the browser', () => {
  it('lives in one server-only file and is checked by the server', () => {
    const codeFile = read('src', 'lib', 'buy-receipt-staff-code.ts');
    expect(codeFile).toMatch(/^import 'server-only';/);
    const literal = new RegExp(`['"\`]${BUY_RECEIPT_STAFF_CODE}['"\`]`);
    const holders = sourceFiles(join(root, 'src')).filter((file) => literal.test(readFileSync(file, 'utf8')));
    expect(holders.map((file) => file.replace(root, '').replace(/\\/g, '/'))).toEqual(['/src/lib/buy-receipt-staff-code.ts']);
    // Only the route imports it.
    const importers = sourceFiles(join(root, 'src')).filter((file) => readFileSync(file, 'utf8').includes('buy-receipt-staff-code'));
    expect(importers.map((file) => file.replace(root, '').replace(/\\/g, '/'))).toEqual(['/src/app/api/admin/buy-receipts/customer-mode/route.ts']);
    const screen = component('BuyReceiptCustomerMode.tsx');
    expect(screen).toContain('await endCustomerMode(code)');
    expect(component('buy-receipt-client.ts')).toContain("fetch(CUSTOMER_MODE_API, json('DELETE', { code }))");
    expect(CUSTOMER_MODE_API).toBe('/api/admin/buy-receipts/customer-mode');
  });
});

describe('customer input mode: the server refuses a locked browser', () => {
  it('bounces in the proxy, after the legacy redirects and before anything is rendered', () => {
    const proxy = read('src', 'proxy.ts');
    expect(proxy).toContain("import { CUSTOMER_MODE_COOKIE, customerModeBounce } from './lib/customer-mode-lock';");
    // Every other visitor leaves on the first line: no cookie, no work.
    expect(proxy).toContain('if (!request.cookies.has(CUSTOMER_MODE_COOKIE)) return null;');
    const legacyAt = proxy.indexOf('const legacy = legacyRedirect(request);');
    const lockAt = proxy.indexOf('const locked = customerModeRedirect(request);');
    const sessionAt = proxy.indexOf('const needsSessionRefresh');
    expect(legacyAt).toBeGreaterThan(-1);
    expect(lockAt).toBeGreaterThan(legacyAt);
    expect(sessionAt).toBeGreaterThan(lockAt);
    // The lock file is loaded on every request: it must stay free of imports.
    expect(read('src', 'lib', 'customer-mode-lock.ts')).not.toMatch(/^import /m);
  });

  it('refuses admin API calls too, except the two that start and end the mode', () => {
    const gate = read('src', 'lib', 'admin-auth.ts');
    expect(gate).toContain('if (!options.duringCustomerMode && (await cookies()).has(CUSTOMER_MODE_COOKIE))');
    expect(gate).toContain('{ status: 423 }');
    // Signed-out and non-admin answers are unchanged: the lock is checked after both.
    expect(gate.indexOf('status: 423')).toBeGreaterThan(gate.indexOf('status: 403'));
    const passers = sourceFiles(join(root, 'src')).filter((file) => readFileSync(file, 'utf8').includes('duringCustomerMode: true'));
    expect(passers.map((file) => file.replace(root, '').replace(/\\/g, '/'))).toEqual(['/src/app/api/admin/buy-receipts/customer-mode/route.ts']);
  });

  it('makes the browser\'s OTHER tabs leave their admin and account pages', () => {
    // A tab already showing the Log asks the server for nothing, so the server cannot refuse it.
    const guard = component('CustomerModeTabGuard.tsx');
    expect(guard).toContain("if (window.localStorage.getItem(CUSTOMER_MODE_MARKER_KEY) !== '1') return;");
    expect(guard).toContain('const destination = customerModeBounce(window.location.pathname);');
    expect(guard).toContain("root.style.visibility = 'hidden';");
    // The server's answer decides, and "unknown" counts as locked.
    expect(guard).toContain('let locked = true;');
    expect(guard).toContain("const res = await fetch(CUSTOMER_MODE_API, { cache: 'no-store' });");
    expect(guard).toContain('window.location.replace(destination);');
    // A stale note heals itself instead of bouncing forever.
    expect(guard).toContain('window.localStorage.removeItem(CUSTOMER_MODE_MARKER_KEY);');
    for (const event of ["'storage'", "'pageshow'", "'visibilitychange'"]) expect(guard, event).toContain(`addEventListener(${event}`);
    // It draws nothing.
    expect(guard).toContain('return null;');
    expect(guard).not.toContain('<div');

    // Account pages: their layout. Admin pages: the admin menu calls the hook…
    const accountLayout = read('src', 'app', '[locale]', 'account', 'layout.tsx');
    expect(accountLayout).toContain('<CustomerModeTabGuard />');
    expect(accountLayout).toContain('{children}');
    expect(read('src', 'components', 'admin', 'AdminHeader.tsx')).toContain('useCustomerModeTabGuard();');
    // …because there is deliberately NO admin layout file (STRUCTURE.md, "Phone
    // listing editor": the reverted viewport-lock layout must not come back).
    expect(existsSync(join(root, 'src', 'app', '[locale]', 'admin', 'layout.tsx'))).toBe(false);

    // Every admin page is covered, including ones added later: it either shows
    // the admin menu (directly, or through a shell that does) or carries the guard itself.
    const menu = /AdminHeader|AdminShell|BuyReceiptsShell|renderAdminProductMarketplacePage|CustomerModeTabGuard/;
    for (const shell of [['components', 'admin', 'AdminShell.tsx'], ['components', 'admin', 'buy-receipts', 'BuyReceiptsShell.tsx'], ['app', '[locale]', 'admin', 'products', '[id]', 'marketplace-page.tsx']]) {
      expect(read('src', ...shell), shell.join('/')).toContain('<AdminHeader');
    }
    const adminPages = sourceFiles(join(root, 'src', 'app', '[locale]', 'admin')).filter((file) => /[\\/]page\.tsx$/.test(file));
    expect(adminPages.length).toBeGreaterThanOrEqual(25);
    const uncovered = adminPages.filter((file) => !menu.test(readFileSync(file, 'utf8')));
    expect(uncovered.map((file) => file.replace(root, '').replace(/\\/g, '/'))).toEqual([]);

    // The component form is for pages with no admin menu; the public site never loads it.
    const users = sourceFiles(join(root, 'src')).filter((file) => readFileSync(file, 'utf8').includes('<CustomerModeTabGuard'));
    expect(users.map((file) => file.replace(root, '').replace(/\\/g, '/')).sort()).toEqual([
      '/src/app/[locale]/account/layout.tsx',
      '/src/app/[locale]/admin/orders/[id]/invoice/page.tsx',
      '/src/app/[locale]/admin/orders/[id]/print/page.tsx',
    ]);

    // The note is written when the lock starts and removed when it ends.
    const form = component('BuyReceiptForm.tsx');
    expect(form.match(/window\.localStorage\.setItem\(CUSTOMER_MODE_MARKER_KEY, '1'\);/g)).toHaveLength(2);
    expect(form.match(/window\.localStorage\.removeItem\(CUSTOMER_MODE_MARKER_KEY\);/g)).toHaveLength(2);
    const enter = form.slice(form.indexOf('async function enterCustomerMode()'), form.indexOf('function leaveCustomerMode('));
    expect(enter.indexOf("window.localStorage.setItem(CUSTOMER_MODE_MARKER_KEY, '1');")).toBeGreaterThan(enter.indexOf("if ('error' in started)"));
    expect(CUSTOMER_MODE_MARKER_KEY).toBe('nej-customer-mode');
  });

  it('opens the New receipt page straight into the seller\'s screen, and cannot loop', () => {
    const page = read('src', 'app', '[locale]', 'admin', 'buy-receipts', 'page.tsx');
    expect(page).toContain('const customerModeLocked = (await cookies()).has(CUSTOMER_MODE_COOKIE);');
    expect(page).toContain('startInCustomerMode={customerModeLocked}');
    expect(page).toContain('requireBuyReceiptsAdmin(locale, { customerModeLocked })');
    // A locked browser is bounced off /account, so a non-admin must not be sent there.
    const shell = component('BuyReceiptsShell.tsx');
    expect(shell).toContain("if (customerModeLocked) redirect(isEs ? '/es' : '/');");
    expect(customerModeBounce('/')).toBeNull();
    expect(customerModeBounce('/account/sign-in')).toBeNull();
  });
});

describe('customer input mode: the form is unchanged and the mode is optional', () => {
  it('leaves the owner\'s paper form exactly as it was — all ten seller boxes, typed by the owner', () => {
    const sheet = component('BuyReceiptSheet.tsx');
    for (const field of ['sellerName', 'sellerPhone', 'sellerEmail', 'sellerStreet', 'sellerCity', 'sellerState', 'sellerZip', 'sellerIdType', 'sellerIdLast4', 'sellerDob']) {
      expect(sheet, field).toContain(`set({ ${field}: e.target.value`);
    }
    // The paper knows nothing about the mode.
    expect(sheet.toLowerCase()).not.toContain('customer');
  });

  it('adds one button, on the tabs row, and always draws the form', () => {
    const form = component('BuyReceiptForm.tsx');
    expect(form).toContain("{modeBusy ? 'Locking…' : 'Customer input mode'}");
    expect(form).toContain('<BuyReceiptTabs');
    expect(form).toContain('active="new"');
    expect(form.match(/<BuyReceiptSheet/g)).toHaveLength(1);
    // The sheet is not behind any condition on the mode.
    expect(form).not.toMatch(/customerMode \? [\s\S]*<BuyReceiptSheet/);
    expect(read('src', 'app', '[locale]', 'admin', 'buy-receipts', 'page.tsx')).toContain('showTabs={false}');
    // The other Buy Receipts pages keep the shell's own tabs.
    for (const page of ['log', 'station', '[id]']) {
      expect(read('src', 'app', '[locale]', 'admin', 'buy-receipts', page, 'page.tsx'), page).not.toContain('showTabs');
    }
  });

  it('locks the browser on the server BEFORE the seller\'s screen appears', () => {
    const form = component('BuyReceiptForm.tsx');
    const enter = form.slice(form.indexOf('async function enterCustomerMode()'), form.indexOf('function leaveCustomerMode('));
    const lockedAt = enter.indexOf('const started = await startCustomerMode();');
    const refusedAt = enter.indexOf("if ('error' in started)");
    const shownAt = enter.indexOf("setCustomerMode({ phase: 'form', tried: false });");
    expect(lockedAt).toBeGreaterThan(-1);
    expect(refusedAt).toBeGreaterThan(lockedAt);
    expect(shownAt).toBeGreaterThan(refusedAt);
    expect(enter).toContain('do not hand it over yet');
  });

  it('shows the seller only the seller boxes, on a screen that is the only thing on the page', () => {
    const screen = component('BuyReceiptCustomerMode.tsx');
    for (const hidden of ['sellerDob', 'sellerIdType', 'sellerIdLast4', 'items', 'payments', 'amount', 'notes']) {
      expect(screen, hidden).not.toContain(hidden);
    }
    expect(screen).toContain('createPortal(');
    expect(screen).toContain('document.body');
    const css = component('buy-receipt-customer-css.ts');
    expect(css).toContain('body > *:not(.${CUSTOMER_MODE_HOST_CLASS}) { display: none !important; }');
    expect(css).toContain("export const CUSTOMER_MODE_HOST_CLASS = 'buy-receipt-customer-host';");
    expect(css).toContain('html, body { overflow: hidden !important; overscroll-behavior: none !important; }');
    // In the server's HTML as well, so a refresh never paints the admin page first.
    expect(component('BuyReceiptForm.tsx')).toContain('{customerMode && <style>{CUSTOMER_MODE_PAGE_CSS}</style>}');
    // No links out of the screen except the sign-in recovery.
    expect(screen.match(/<a /g)).toHaveLength(1);
    expect(screen).not.toContain("from 'next/link'");
  });

  it('never suggests one seller\'s details to the next, and never zooms on a tap', () => {
    const screen = component('BuyReceiptCustomerMode.tsx');
    expect(screen).toContain('autoComplete="off"');
    expect(screen).toContain('autoCorrect="off"');
    expect(screen).toContain('spellCheck={false}');
    const css = component('buy-receipt-customer-css.ts');
    expect(css).toMatch(/\.brc-fld input \{[^}]*font-size: 16px;/);
  });

  it('offers "Submit unfinished" only after a Save that found a problem, and the code screen for every way out', () => {
    const screen = component('BuyReceiptCustomerMode.tsx');
    expect(screen).toContain('const unfinished = tried && customerProblems(values).length > 0;');
    expect(screen).toContain("{unfinished && <button type=\"button\" className=\"brc-unf\" onClick={() => openPad('unfinished')}>Submit unfinished</button>}");
    expect(screen).toContain("onClick={() => openPad('saved')}");
    expect(screen).toContain("onClick={() => openPad('staff')}");
    // The mode ends in exactly one place: after the server accepted the code.
    expect(screen.match(/onUnlocked\(/g)).toHaveLength(1);
    expect(screen.indexOf('onUnlocked(reason)')).toBeGreaterThan(screen.indexOf("if ('unlocked' in result)"));
  });

  it('stays on the page when Back is pressed, and reloads it if history jumps elsewhere', () => {
    const screen = component('BuyReceiptCustomerMode.tsx');
    expect(screen).toContain("window.addEventListener('popstate', onPop);");
    expect(screen).toContain('const here = window.location.pathname;');
    expect(screen).toContain('if (window.location.pathname !== here) {');
    expect(screen).toContain('window.location.replace(here);');
    // The page stays hidden from <head>, outside React, until the code is accepted.
    expect(screen).toContain('document.head.appendChild(style);');
  });

  it('ships no preview page', () => {
    // The two login-free pages used to check this in a browser must never be deployed.
    expect(existsSync(join(root, 'src', 'app', '[locale]', 'zz-customer-mode-preview'))).toBe(false);
    expect(existsSync(join(root, 'src', 'app', '[locale]', 'admin', 'zz-guard-preview'))).toBe(false);
  });
});

describe('customer input mode: the mailing list', () => {
  it('adds the seller when the OWNER saves the receipt, and a failure never costs the receipt', () => {
    const route = read('src', 'app', 'api', 'admin', 'buy-receipts', 'route.ts');
    const insertAt = route.indexOf(".insert({");
    const listAt = route.indexOf('if (body?.mailingList === true && receipt.seller_email) {');
    expect(insertAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(insertAt);
    expect(route).toContain("mailingList = added.ok ? 'added' : 'failed';");
    expect(route).toContain('return NextResponse.json({ receipt, emailed, emailError, mailingList }, { status: 201 });');
    const form = component('BuyReceiptForm.tsx');
    expect(form).toContain('const wantsList = mailingList && Boolean(draft.sellerEmail.trim());');
    expect(form).toContain('createReceipt(draft, duplicatedFrom?.id ?? null, wantsEmail, wantsList)');
  });

  it('joins the homepage list through its own function — email only, never a text sign-up', () => {
    const lib = read('src', 'lib', 'buy-receipt-mailing-list.ts');
    expect(lib).toMatch(/^import 'server-only';/);
    expect(lib).toContain("service.rpc('subscribe_homepage_v2', {");
    expect(lib).toContain('subscriber_phone: null,');
    expect(lib).toContain('subscriber_sms_consent: false,');
    expect(lib).toContain("export const BUY_RECEIPT_SUBSCRIBER_SOURCE = 'buy_receipt';");
    // The receipts table is never touched with the service role.
    expect(lib).not.toContain("from('buy_receipts')");
    // The list's `source` column is free text, so a new source needs no SQL.
    expect(read('..', 'supabase', 'homepage-subscribers.sql')).toContain("source text not null default 'homepage_hero',");
    expect(read('..', 'supabase', 'text-subscribers-2026-09.sql')).toContain(
      'grant execute on function public.subscribe_homepage_v2(text, text, text, text, boolean, text, integer, text) to service_role;',
    );
  });

  it('labels those subscribers on the Subscribers page', () => {
    expect(subscriberSourceLabel({ source: 'subscriber', subscriberSource: 'buy_receipt' })).toBe('Buy receipt');
    expect(subscriberSourceLabel({ source: 'account+subscriber', subscriberSource: 'buy_receipt' })).toBe('Buy receipt + Account holder');
    expect(subscriberSourceLabel({ source: 'subscriber', subscriberSource: 'homepage_hero' })).toBe('Newsletter subscriber');
  });

  it('starts both small boxes unticked and shows them only beside a typed email', () => {
    const screen = component('BuyReceiptCustomerMode.tsx');
    expect(screen).toContain('Email me a copy of my receipt');
    expect(screen).toContain('Add me to the mailing list');
    expect(screen).toContain("className={`brc-opts${hasEmail ? ' brc-on' : ''}`}");
    expect(screen).toContain("if (field === 'sellerEmail' && !next.trim() && (emailCopy || mailingList)) onAsk({ emailCopy: false, mailingList: false });");
    const form = component('BuyReceiptForm.tsx');
    expect(form).toContain('const [mailingList, setMailingList] = useState(false);');
  });
});
