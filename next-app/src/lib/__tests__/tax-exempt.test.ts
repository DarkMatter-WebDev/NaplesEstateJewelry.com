import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  certificateIsUsable,
  certificateProblemMessage,
  certificateUsableThrough,
  checkCertificateRead,
  cleanCertNumber,
  coerceCertificateRead,
  exemptReceiptLine,
  exemptShortTag,
  maskCertNumber,
  normalizeTaxExemptSaleInput,
  opensAtLabel,
  ownerApprovalTextBody,
  FL_CERT_VERIFY_URL,
  PAPER_COPY_MIME,
  hasCopyOnFile,
  parseCertificateReadJson,
  parseTaxExemptSnapshot,
  requestRefLabel,
  type CertificateRead,
  type TaxExemptSnapshot,
} from '../tax-exempt';
import { normalizeInStoreSaleInput } from '../in-store-sale';
import { payPageTotals, remoteTotals } from '../remote-sale';

const NOW = new Date('2026-10-27T15:00:00Z');
const PHOTO = 'certificates/0b6f2a4e-1d3c-4a5b-9c7d-112233445566.webp';

const goodRead: CertificateRead = {
  isCertificate: true,
  issuingState: 'FL',
  certType: 'resale',
  businessName: 'Coastal Jewelers LLC',
  certNumber: '78-8012345678-9',
  expiresOn: '2026-12-31',
  numberClear: true,
};

describe('the AI read is only trusted for its shape', () => {
  it('parses a reply wrapped in a code fence', () => {
    expect(parseCertificateReadJson('```json\n{"isCertificate": true}\n```')).toEqual({ isCertificate: true });
    expect(parseCertificateReadJson('no json here')).toBeNull();
  });

  it('keeps clean values and drops malformed ones', () => {
    const read = coerceCertificateRead({
      isCertificate: true,
      issuingState: 'fl',
      certType: 'RESALE',
      businessName: 'COASTAL JEWELERS LLC',
      certNumber: '78 - 8012345678 - 9',
      expiresOn: '2026-12-31',
      numberClear: true,
    });
    expect(read).toEqual({ ...goodRead });
    const bad = coerceCertificateRead({ isCertificate: 'yes', issuingState: 'Florida', certType: 'gift', certNumber: '12', expiresOn: '12/31/2026', numberClear: true });
    expect(bad).toEqual({ isCertificate: false, issuingState: null, certType: null, businessName: null, certNumber: null, expiresOn: null, numberClear: false });
  });

  it('cleans certificate numbers to letters, digits and dashes', () => {
    expect(cleanCertNumber('85-8012345678c-9')).toBe('85-8012345678C-9');
    expect(cleanCertNumber('abc')).toBeNull();
  });
});

describe('the checks that run before anything reaches the owner', () => {
  it('passes a current Florida resale certificate', () => {
    expect(checkCertificateRead(goodRead, NOW)).toEqual({ ok: true, problem: null, florida: true, typeOk: true, current: true });
  });

  it('turns away another state (Florida only accepts Florida certificates)', () => {
    const checks = checkCertificateRead({ ...goodRead, issuingState: 'GA', certType: 'other' }, NOW);
    expect(checks.problem).toBe('not_florida');
    expect(certificateProblemMessage('not_florida', { issuingState: 'GA' })).toContain('Georgia');
    expect(certificateProblemMessage('not_florida', { issuingState: 'GA' }, true)).toContain('Georgia');
  });

  it('turns away an expired one, a wrong form and an unreadable picture', () => {
    expect(checkCertificateRead({ ...goodRead, expiresOn: '2025-12-31' }, NOW).problem).toBe('expired');
    expect(checkCertificateRead({ ...goodRead, certType: 'other' }, NOW).problem).toBe('wrong_type');
    expect(checkCertificateRead({ ...goodRead, isCertificate: false }, NOW).problem).toBe('unreadable');
  });

  it('lets a certificate with no readable expiry through for the owner to check', () => {
    const checks = checkCertificateRead({ ...goodRead, expiresOn: null }, NOW);
    expect(checks.ok).toBe(true);
    expect(checks.current).toBeNull();
  });
});

describe('Instant Sale box → the choice the route records', () => {
  it('is null when the box is off or missing', () => {
    expect(normalizeTaxExemptSaleInput(undefined)).toEqual({ value: null });
    expect(normalizeTaxExemptSaleInput({ enabled: false, physicalCopySeen: true })).toEqual({ value: null });
  });

  it('takes a certificate on file by id', () => {
    expect(normalizeTaxExemptSaleInput({ enabled: true, certificateId: '0b6f2a4e-1d3c-4a5b-9c7d-112233445566' })).toEqual({
      value: { kind: 'on_file', certificateId: '0b6f2a4e-1d3c-4a5b-9c7d-112233445566', flAuthNumber: null },
    });
    // A certificate on file with no copy needs this sale's number; the route checks the photo, the input carries it.
    expect(normalizeTaxExemptSaleInput({ enabled: true, certificateId: '0b6f2a4e-1d3c-4a5b-9c7d-112233445566', flAuthNumber: ' 1234567890123 ' })).toEqual({
      value: { kind: 'on_file', certificateId: '0b6f2a4e-1d3c-4a5b-9c7d-112233445566', flAuthNumber: '1234567890123' },
    });
  });

  it('needs a photo or the physical-copy tick', () => {
    const result = normalizeTaxExemptSaleInput({ enabled: true, businessName: 'X', certNumber: '78-8012345678-9' }, NOW);
    expect('error' in result && result.error).toMatch(/photo|physical/);
  });

  it('with only the physical copy seen, the Florida authorization number is required; the other details stay optional', () => {
    // Florida documents the sale by a copy OR an authorization number (Rules 12A-1.039(3) / 12A-1.038(3)).
    const noNumber = normalizeTaxExemptSaleInput({ enabled: true, physicalCopySeen: true }, NOW);
    expect('error' in noNumber && noNumber.error).toMatch(/authorization number/);
    const badNumber = normalizeTaxExemptSaleInput({ enabled: true, physicalCopySeen: true, flAuthNumber: 'abc' }, NOW);
    expect('error' in badNumber && badNumber.error).toMatch(/authorization number/);
    const result = normalizeTaxExemptSaleInput({ enabled: true, physicalCopySeen: true, flAuthNumber: '1234567890123' }, NOW);
    expect('value' in result && result.value).toMatchObject({ kind: 'new', physicalCopySeen: true, paperCopyKept: false, photoPath: null, photoMime: null, certNumber: null, flAuthNumber: '1234567890123' });
  });

  it('a kept paper copy overrides the photo: no photo and no authorization number needed (owner: "might not have time for photo")', () => {
    const result = normalizeTaxExemptSaleInput({ enabled: true, physicalCopySeen: true, paperCopyKept: true }, NOW);
    expect('value' in result && result.value).toMatchObject({ kind: 'new', paperCopyKept: true, photoPath: null, photoMime: PAPER_COPY_MIME, flAuthNumber: null });
    // "Kept a paper copy" means nothing without the physical-copy tick, and a photo wins over it.
    expect('error' in normalizeTaxExemptSaleInput({ enabled: true, paperCopyKept: true }, NOW)).toBe(true);
    const withPhoto = normalizeTaxExemptSaleInput({ enabled: true, photoPath: PHOTO, businessName: 'A', certNumber: '78-8012345678-9', physicalCopySeen: true, paperCopyKept: true }, NOW);
    expect('value' in withPhoto && withPhoto.value).toMatchObject({ paperCopyKept: false, photoMime: 'image/webp' });
  });

  it('knows when the store holds a copy: a photo or a filed paper copy', () => {
    expect(hasCopyOnFile({ photo_path: PHOTO, photo_mime: 'image/webp' })).toBe(true);
    expect(hasCopyOnFile({ photo_path: null, photo_mime: PAPER_COPY_MIME })).toBe(true);
    expect(hasCopyOnFile({ photo_path: null, photo_mime: null })).toBe(false);
  });

  it("a certificate on file with no copy needs this sale's authorization number (server)", () => {
    const server = readFileSync(join(process.cwd(), 'src', 'lib', 'tax-exempt-server.ts'), 'utf8');
    expect(server).toContain('if (!hasCopyOnFile(row)) {');
    expect(server).toContain('if (!choice.flAuthNumber) {');
  });

  it("points the Verify buttons at Florida's Certificate Verification System", () => {
    expect(FL_CERT_VERIFY_URL).toBe('https://floridarevenue.com/taxes/certificates');
    for (const file of [['components', 'admin', 'instant-sale', 'TaxExemptSaleBox.tsx'], ['components', 'admin', 'tax-exempt', 'TaxExemptReviewActions.tsx']]) {
      const source = readFileSync(join(process.cwd(), 'src', ...file), 'utf8');
      expect(source).toContain('href={FL_CERT_VERIFY_URL}');
      expect(source).not.toContain('eservices/Pages');
    }
  });

  it('with a photo, the name and number are required', () => {
    const missing = normalizeTaxExemptSaleInput({ enabled: true, photoPath: PHOTO, businessName: 'Coastal' }, NOW);
    expect('error' in missing).toBe(true);
    const ok = normalizeTaxExemptSaleInput({ enabled: true, photoPath: PHOTO, businessName: 'Coastal', certNumber: '78-8012345678-9', certType: 'resale', expiresOn: '2026-12-31' }, NOW);
    expect('value' in ok && ok.value).toMatchObject({ kind: 'new', photoMime: 'image/webp', saveForNextTime: true });
  });

  it('refuses a non-Florida read, an expired date and a path outside the private folder', () => {
    expect('error' in normalizeTaxExemptSaleInput({ enabled: true, photoPath: PHOTO, businessName: 'A', certNumber: '78-8012345678-9', aiState: 'GA' }, NOW)).toBe(true);
    expect('error' in normalizeTaxExemptSaleInput({ enabled: true, physicalCopySeen: true, flAuthNumber: '1234567890123', expiresOn: '2025-01-01' }, NOW)).toBe(true);
    expect('error' in normalizeTaxExemptSaleInput({ enabled: true, photoPath: 'https://evil.example/x.webp', businessName: 'A', certNumber: '78-8012345678-9' }, NOW)).toBe(true);
  });
});

describe('the tax comes off the whole sale', () => {
  const base = {
    items: [{ kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1000' }],
    customer: { firstName: 'Dana', lastName: 'Whitfield', phone: '(239) 555-0134', email: '' },
    delivery: { method: 'pickup' },
    paidBy: 'zettle',
  };

  it('in store: tax 0, and the 6% it would have been is kept as "tax not charged"', () => {
    const result = normalizeInStoreSaleInput({ ...base, taxExempt: { enabled: true, physicalCopySeen: true, paperCopyKept: true } });
    expect('value' in result && result.value).toMatchObject({ tax: 0, total: 1000, taxNotCharged: 60 });
  });

  it('in store without the box: taxed as before', () => {
    const result = normalizeInStoreSaleInput(base);
    expect('value' in result && result.value).toMatchObject({ tax: 60, total: 1060, taxNotCharged: 0, taxExempt: null });
  });

  it('remote: no tax at any address, on the form and on the pay page', () => {
    expect(remoteTotals(1000, { method: 'ship', shippingFee: 45 }, 'FL', true).tax).toBe(0);
    expect(payPageTotals({ subtotal: 1000, shipping_fee: 45, shipping_method: 'shipping', tax_exempt: true }, 'FL').tax).toBe(0);
    expect(payPageTotals({ subtotal: 1000, shipping_fee: 45, shipping_method: 'shipping' }, 'FL').tax).toBe(62.7);
  });
});

describe('saved certificates', () => {
  const row = { status: 'approved' as const, expires_on: '2026-12-31', approved_at: '2026-10-27T15:00:00Z' };

  it('are usable through their printed expiry, never after, never when withdrawn', () => {
    expect(certificateIsUsable(row, NOW)).toBe(true);
    expect(certificateIsUsable(row, new Date('2027-01-02T15:00:00Z'))).toBe(false);
    expect(certificateIsUsable({ ...row, status: 'revoked' }, NOW)).toBe(false);
  });

  it('with no printed expiry, are reused for a year after approval', () => {
    expect(certificateUsableThrough({ expires_on: null, approved_at: '2026-10-27T15:00:00Z' })).toBe('2027-10-27');
  });
});

describe('words', () => {
  const snapshot: TaxExemptSnapshot = {
    certificateId: 'c1',
    certType: 'resale',
    businessName: 'Coastal Jewelers LLC',
    certNumber: '78-8012345678-9',
    issuingState: 'FL',
    expiresOn: '2026-12-31',
    physicalCopySeen: false,
    photoPath: PHOTO,
    photoMime: 'image/webp',
    flAuthNumber: null,
    approvedVia: 'in_store',
    approvedAt: '2026-10-27T15:00:00Z',
    approvedBy: 'owner@example.com',
    requestRef: null,
    taxNotCharged: 98.1,
  };

  it('mask the number to its last four', () => {
    expect(maskCertNumber('78-8012345678-9')).toBe('··6789');
    expect(exemptShortTag(snapshot)).toBe('Resale ··6789');
    expect(requestRefLabel(1042)).toBe('TX-1042');
  });

  it('print the certificate on receipts', () => {
    expect(exemptReceiptLine(snapshot)).toBe('Tax-exempt sale · Florida Annual Resale Certificate · 78-8012345678-9 · Coastal Jewelers LLC · valid through 12/31/2026');
    expect(exemptReceiptLine({ ...snapshot, photoPath: null, physicalCopySeen: true, certNumber: null, businessName: null, certType: null, expiresOn: null }))
      .toBe('Tax-exempt sale · Florida certificate · physical copy seen');
    // The paper-copy override and the authorization number are printed (the rule wants the number on the invoice).
    expect(exemptReceiptLine({ ...snapshot, photoPath: null, photoMime: PAPER_COPY_MIME, physicalCopySeen: true }))
      .toContain('paper copy on file');
    expect(exemptReceiptLine({ ...snapshot, photoPath: null, photoMime: null, physicalCopySeen: true, flAuthNumber: '1234567890123' }))
      .toContain('physical copy seen · FL auth 1234567890123');
  });

  it('read a stored snapshot back defensively', () => {
    expect(parseTaxExemptSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(parseTaxExemptSnapshot(null)).toBeNull();
    expect(parseTaxExemptSnapshot({ certType: 'gift', taxNotCharged: 'x' })).toMatchObject({ certType: null, taxNotCharged: 0, approvedVia: 'in_store' });
  });

  it('text the owner one short message with the link', () => {
    const body = ownerApprovalTextBody({
      ref: 'TX-1042', businessName: 'Bell & Sons Jewelry Inc', certType: 'resale', certNumber: '78-8099887766-4', expiresOn: '2026-12-31',
      cartTotal: 3025, tax: 181.5, customerName: 'Marcus Bell', customerPhone: '+19415550188', url: 'https://naplesestatejewelry.com/admin/tax-exempt/abc',
    });
    expect(body).toContain('TX-1042');
    expect(body).toContain('··7664');
    expect(body).toContain('$3,025.00');
    expect(body).toContain('https://naplesestatejewelry.com/admin/tax-exempt/abc');
    expect(body).not.toContain('8099887766');
    expect(body.length).toBeLessThan(400);
  });

  it('say "for their account, no order yet" for a My Account request (mockup v3)', () => {
    const body = ownerApprovalTextBody({
      ref: 'TX-1043', businessName: 'Bell & Sons Jewelry Inc', certType: 'resale', certNumber: '78-8099887766-4', expiresOn: '2026-12-31',
      cartTotal: null, tax: null, customerName: 'Marcus Bell', customerPhone: '+19415550188', url: 'https://naplesestatejewelry.com/admin/tax-exempt/abc',
      forAccount: true,
    });
    expect(body).toContain('for their account, no order yet');
    expect(body).toContain('TX-1043');
    expect(body).toContain('··7664');
    expect(body).not.toContain('waiting at checkout');
    expect(body).not.toContain('Cart');
    expect(body).not.toContain('8099887766');
    expect(body).toContain('https://naplesestatejewelry.com/admin/tax-exempt/abc');
  });

  it('never claim "AI checks passed" for an upload past the daily AI limit', () => {
    const body = ownerApprovalTextBody({
      ref: 'TX-1044', businessName: null, certType: null, certNumber: null, expiresOn: null,
      cartTotal: 1219, tax: 73.14, customerName: 'Marcus Bell', customerPhone: '+19415550188', url: 'https://naplesestatejewelry.com/admin/tax-exempt/abc',
      aiRead: false,
    });
    expect(body).toContain('NOT read by AI');
    expect(body).not.toContain('AI checks passed');
    expect(body).toContain('$1,219.00');
    expect(body).toContain('https://naplesestatejewelry.com/admin/tax-exempt/abc');
  });

  it('say when the store opens', () => {
    expect(opensAtLabel('11:00')).toBe('11 AM');
    expect(opensAtLabel('13:30', true)).toBe('1:30 p.m.');
  });
});

describe('guards in the code and the SQL', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

  it('checkout drops tax ONLY through resolveCheckoutExemption, in both the quote and the order route', () => {
    for (const route of [read('src', 'app', 'api', 'checkout', 'quote', 'route.ts'), read('src', 'app', 'api', 'paypal', 'create-order', 'route.ts')]) {
      expect(route).toContain('resolveCheckoutExemption(');
      expect(route).toContain('parseCheckoutExemptionInput(body.taxExempt)');
    }
    const server = read('src', 'lib', 'tax-exempt-server.ts');
    expect(server).toMatch(/requestIsLive\(request\) && sameEmail/);
  });

  it('the SQL keeps the tables service-role only and the bucket private', () => {
    const sql = read('..', 'supabase', 'tax-exempt-2026-10.sql');
    expect(sql).toContain('revoke all on public.tax_exempt_certificates from anon, authenticated;');
    expect(sql).toContain('grant select, insert, update, delete on public.tax_exempt_requests to service_role;');
    expect(sql).toContain("values ('tax-certificates', 'tax-certificates', false,");
    expect(sql).toContain("grant usage, select on sequence %s to service_role");
  });

  it('the certificate photo is verified to be WebP before it is stored as WebP', () => {
    const server = read('src', 'lib', 'tax-exempt-server.ts');
    expect(server).toContain("if (produced.format !== 'webp')");
  });

  it('the customer AI read is capped per account and site-wide BEFORE the AI is called (owner, abuse limits)', () => {
    const route = read('src', 'app', 'api', 'tax-exempt', 'read', 'route.ts');
    const caps = route.indexOf("checkRateLimit('tax-exempt-ai-site'");
    const perAccount = route.indexOf('tax-exempt-ai-user:');
    const ai = route.indexOf('readCertificateWithAi(buffer)');
    expect(perAccount).toBeGreaterThan(0);
    expect(caps).toBeGreaterThan(perAccount);
    expect(ai).toBeGreaterThan(caps);
    expect(route).toContain('if (aiAllowed)');
  });

  it('only a signed-in customer can send from My Account, and it never carries a cart', () => {
    const route = read('src', 'app', 'api', 'tax-exempt', 'account', 'route.ts');
    expect(route).toContain("{ status: 401 }");
    expect(route).toContain('cart: null');
    expect(route).toContain('save_to_account: true');
    expect(route).not.toContain('resolveCheckoutExemption(');
  });
});
