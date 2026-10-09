import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUY_RECEIPT_COLUMNS, buyReceiptIdPhotoFolder, buyReceiptThumbprintPath, sampleBuyReceipt } from '../buy-receipts';
import {
  THUMBPRINT_MAX_EDGE_PX,
  THUMBPRINT_WATCH_EVERY_MS,
  THUMBPRINT_WATCH_GIVE_UP_MS,
  isPrintPicture,
  pickFreshPrint,
} from '../buy-receipt-thumbprint';

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const components = (name: string) => read('src', 'components', 'admin', 'buy-receipts', name);

const PRESSED = Date.parse('2026-10-06T15:00:00Z');
const file = (name: string, secondsAfterPress: number, size = 121_078) => ({ name, lastModified: PRESSED + secondsAfterPress * 1000, size });

describe('thumbprint: which file in the watched folder is the print just saved', () => {
  it('takes pictures only — the capture program saves BMP', () => {
    for (const name of ['finger.bmp', 'FINGER.BMP', 'print.png', 'scan.jpg', 'scan.JPEG']) expect(isPrintPicture(name), name).toBe(true);
    for (const name of ['finger.raw', 'notes.txt', 'finger.bmp.tmp', 'bmp', 'desktop.ini']) expect(isPrintPicture(name), name).toBe(false);
  });

  it('never takes a file saved before the button was pressed — that is the previous seller', () => {
    const old = file('yesterday.bmp', -3600);
    const first = pickFreshPrint([old], PRESSED, {});
    expect(first.ready).toBeNull();
    expect(first.seen).toEqual({});
    // Still nothing on the second look, however settled the old file is.
    expect(pickFreshPrint([old], PRESSED, { 'yesterday.bmp': old.size }).ready).toBeNull();
  });

  it('waits for the size to stop changing before handing a new file over', () => {
    const writing = file('finger.bmp', 4, 40_000);
    const first = pickFreshPrint([writing], PRESSED, {});
    expect(first.ready).toBeNull();
    expect(first.seen).toEqual({ 'finger.bmp': 40_000 });
    // Still growing: not yet.
    const grown = file('finger.bmp', 4, 121_078);
    const second = pickFreshPrint([grown], PRESSED, first.seen);
    expect(second.ready).toBeNull();
    // The same size twice in a row: this is the print.
    expect(pickFreshPrint([grown], PRESSED, second.seen).ready).toEqual(grown);
  });

  it('takes the newest of several, and ignores empty files and non-pictures', () => {
    const files = [file('a.bmp', 2), file('b.bmp', 9), file('empty.bmp', 12, 0), file('notes.txt', 20), file('old.bmp', -5)];
    const first = pickFreshPrint(files, PRESSED, {});
    expect(Object.keys(first.seen).sort()).toEqual(['a.bmp', 'b.bmp']);
    expect(pickFreshPrint(files, PRESSED, first.seen).ready?.name).toBe('b.bmp');
  });

  it('a file saved in the very moment of the press counts', () => {
    const exact = file('finger.bmp', 0);
    expect(pickFreshPrint([exact], PRESSED, { 'finger.bmp': exact.size }).ready).toEqual(exact);
  });

  it('looks every second and gives up by itself', () => {
    expect(THUMBPRINT_WATCH_EVERY_MS).toBe(1_000);
    expect(THUMBPRINT_WATCH_GIVE_UP_MS).toBeGreaterThanOrEqual(5 * 60_000);
    // The reader's own picture is 300 × 400: it is never scaled.
    expect(THUMBPRINT_MAX_EDGE_PX).toBeGreaterThanOrEqual(400);
  });
});

describe('thumbprint: stored privately, with the receipt', () => {
  it('lives in the receipt’s own folder, so deleting the receipt takes it along', () => {
    expect(buyReceiptThumbprintPath('abc', 'f1')).toBe('receipts/abc/thumbprint-f1.webp');
    expect(buyReceiptThumbprintPath('abc', 'f1').startsWith(`${buyReceiptIdPhotoFolder('abc')}/`)).toBe(true);
    expect(BUY_RECEIPT_COLUMNS).toContain('seller_thumbprint_path');
    expect(sampleBuyReceipt('2026-10-06T15:00:00Z').seller_thumbprint_path).toBeNull();

    const route = read('src', 'app', 'api', 'admin', 'buy-receipts', '[id]', 'route.ts');
    expect(route).toContain(".select('id, receipt_number, seller_id_photo_path, seller_thumbprint_path')");
    expect(route).toContain('if (current.seller_thumbprint_path) paths.add(current.seller_thumbprint_path);');
    // Still pictures first, the row second.
    expect(route.indexOf('bucket.remove([...paths])')).toBeLessThan(route.indexOf(".from('buy_receipts').delete().eq('id', id)"));
  });

  it('goes to the private bucket as a LOSSLESS WebP that is proven to be WebP', () => {
    const route = read('src', 'app', 'api', 'admin', 'buy-receipts', '[id]', 'thumbprint', 'route.ts');
    expect(route).toContain('BUY_RECEIPT_ID_BUCKET');
    expect(route).not.toContain('getPublicUrl');
    expect(route).not.toContain('PRODUCT_IMAGES_BUCKET');
    expect(route).not.toMatch(/from\(['"]product-images/);
    // Ridges are the record: no lossy encode.
    expect(route).toContain('.webp({ lossless: true })');
    expect(route).not.toMatch(/quality:/);
    expect(route).toContain("produced.format !== 'webp'");
    expect(route).toContain("contentType: 'image/webp'");
    expect(route).toContain("cacheControl: '0'");
    // Netlify: sharp's output must be copied off the shared buffer before the upload.
    expect(route).toContain('toOwnedBuffer(');
    // A replace removes the previous object; a void receipt is refused in both handlers.
    expect(route).toContain('bucket.remove([previous])');
    expect(route.match(/if \(current\.status === 'void'\) return voidLocked\(\);/g)).toHaveLength(2);
  });

  it('needs one SQL step, run before the deploy, and freezes the column on a void receipt', () => {
    const sql = read('..', 'supabase', 'buy-receipts-thumbprint-2026-10.sql');
    expect(sql).toContain('add column if not exists seller_thumbprint_path text');
    expect(sql).toMatch(/BEFORE deploying/);
    expect(sql).toContain('create trigger buy_receipts_thumbprint_guard');
    expect(sql).toContain("old.status = 'void' and new.seller_thumbprint_path is distinct from old.seller_thumbprint_path");
    // Its own function: the main file can be re-run without dropping the rule.
    expect(sql).not.toContain('function public.guard_buy_receipt_update');
    // The bucket and its policies are the existing ones; this file creates none.
    expect(sql).not.toMatch(/create policy|insert into storage\.buckets/i);
    expect(read('..', 'supabase', 'buy-receipts-2026-09.sql')).toContain("array['image/webp', 'image/jpeg']");
  });

  it('the browser turns the reader’s BMP into a PNG and checks that it did', () => {
    const client = components('buy-receipt-client.ts');
    const prepare = client.slice(client.indexOf('export async function prepareThumbprint'), client.indexOf('/** A link to the private ID photo'));
    expect(prepare).toContain("canvas.toBlob(resolve, 'image/png')");
    expect(prepare).toContain("blob.type !== 'image/png'");
    expect(prepare).toContain('THUMBPRINT_MAX_EDGE_PX');
    expect(client).toContain("form.append('print', print, 'seller-thumbprint.png')");
  });
});

describe('thumbprint: on the form and on paper', () => {
  const sheet = components('BuyReceiptSheet.tsx');
  const css = components('buy-receipt-sheet-css.ts');

  it('is the owner’s part of the form: under the ID photo strip, switched off in the seller’s view', () => {
    const ownerPart = sheet.slice(sheet.indexOf('const ownerPart = ('), sheet.indexOf('<h2 className="sheet-section-title">Items purchased by'));
    expect(ownerPart).toMatch(/\{idPhotoSlot\}\s+\{thumbprintSlot\}/);
    expect(components('BuyReceiptForm.tsx')).toMatch(/thumbprintSlot=\{\s*<ThumbprintField/);
    expect(components('BuyReceiptDetail.tsx')).toContain('thumbprintSlot={thumbprintField}');
  });

  it('prints on shop copies only, labelled "Seller thumbprint" (owner, 2026-10-06)', () => {
    expect(sheet).toContain('const thumbprint = !sellerCopy && thumbprintUrl ? thumbprintUrl : null;');
    expect(sheet).toContain('<span className="brs-label brs-sign-label">Seller thumbprint</span>');
    // The seller's copy is the SignedBlock alone: no seller line, no pictures.
    expect(sheet).toContain('{sellerCopy && <SignedBlock dateIso={receipt.created_at} />}');
    expect(sheet).toContain('{!sellerCopy && <SignatureBlock dateIso={receipt.created_at} />}');
  });

  it('shop copy: signatures side by side on one level, the pictures side by side under them (owner, 2026-10-06, mockup 2)', () => {
    // One signature row for every shop copy and for the form — never the two stacked lines again.
    const block = sheet.slice(sheet.indexOf('function SignatureBlock('), sheet.indexOf('function Value('));
    expect(block).toContain('<div className="brs-sign-row">');
    expect(block.indexOf('<SellerSignAndDate />')).toBeLessThan(block.indexOf('<SignedReceivedBy dateIso={dateIso} />'));
    expect(sheet).not.toContain('brs-sign-stack');
    expect(sheet).not.toContain('brs-sign-with-id');
    // The pictures come AFTER the signatures and last on the sheet, so they are what moves to a second page first.
    const print = sheet.slice(sheet.indexOf('function PrintSheet('));
    const signAt = print.indexOf('<SignatureBlock dateIso={receipt.created_at} />');
    const picturesAt = print.indexOf('<div className="brs-pictures">');
    expect(signAt).toBeGreaterThan(-1);
    expect(picturesAt).toBeGreaterThan(signAt);
    expect(print).toContain('{(withId || thumbprint) && (');
    const pictures = print.slice(picturesAt, print.indexOf('{sellerCopy && <p className="brs-thanks">'));
    expect(pictures.indexOf('alt="Seller ID"')).toBeLessThan(pictures.indexOf('<ThumbprintBlock url={thumbprint} />'));
  });

  it('the row is sized for the printed page: a 1.77 in line for the seller, the signature on ONE line', () => {
    expect(css).toMatch(/\.brs-sign-row \{[^}]*grid-template-columns: 272fr 328fr;[^}]*break-inside: avoid;/);
    expect(css).toContain('.buy-receipt-sheet .brs-sign-seller { grid-template-columns: 170fr 90fr; }');
    expect(css).toContain('.buy-receipt-sheet .brs-sign-shop { grid-template-columns: 226fr 90fr; }');
    // 34px is 236px wide and broke into two lines over the label; 30px is 208px in a 226px line.
    expect(css).toContain('.buy-receipt-sheet .brs-sign-row .brs-signature { font-size: 30px; white-space: nowrap; }');
    expect(css).toContain('.buy-receipt-sheet .brs-sign-row .brs-sign-line { height: 40px; }');
    // The seller's copy keeps the full-size signature.
    expect(css).toContain('.buy-receipt-sheet .brs-signature { font-size: 34px;');
    // Too narrow for two halves: stacked — on screens only, never on paper.
    expect(css).toMatch(/@media screen and \(max-width: 640px\) \{\s*\.buy-receipt-sheet \.brs-sign-row \{ grid-template-columns: 1fr;/);
  });

  it('the pictures move to a second sheet together, and start 0.6 in down it', () => {
    expect(css).toMatch(/\.brs-pictures \{[^}]*break-inside: avoid;[^}]*padding-top: 0\.6in;[^}]*margin-top: calc\(14px - 0\.6in\);/);
    // The thumbprint is as tall as the ID card beside it.
    expect(css).toMatch(/\.brs-thumbprint img \{[^}]*width: 1\.59375in;[^}]*height: 2\.125in;/);
    expect(css).toMatch(/\.brs-id img \{[^}]*width: 3\.375in;[^}]*height: 2\.125in;/);
    // New class names only: `brs-name` once collided with the letterhead (2026-10-03).
    expect(css).not.toContain('is-small');
  });

  it('every way of printing carries it: the print panel, the Log and the station', () => {
    const host = components('BuyReceiptPrintHost.tsx');
    expect(host).toContain('thumbprintUrl: string | null = null');
    expect(host).toContain('thumbprintUrl={view.thumbprintUrl}');
    for (const name of ['ReceiptPrintControls.tsx', 'BuyReceiptLog.tsx', 'PrintStation.tsx']) {
      const source = components(name);
      expect(source, name).toContain('printableThumbprint(');
      expect(source, name).toContain('thumbprint?.url ?? null');
      expect(source, name).toContain('thumbprint?.release();');
    }
  });
});

describe('thumbprint: the folder watch on the form', () => {
  const field = components('ThumbprintField.tsx');

  it('is a screen-only control that hands the print to its parent', () => {
    expect(field).toContain('className="no-print mt-2 flex');
    expect(field).toContain('onPickRef.current(print);');
    expect(field).not.toContain('uploadThumbprint');
  });

  it('counts only files saved after the press, and removes the file once the form has it', () => {
    // The moment is taken BEFORE the folder is opened: choosing the folder the first time takes a while.
    expect(field.indexOf('const since = Date.now();')).toBeLessThan(field.indexOf('(folderSource ?? openPrintFolder)(fresh)'));
    expect(field).toContain('pickFreshPrint(found, watch.since, sizes)');
    const handedAt = field.indexOf('onPickRef.current(print);');
    const removedAt = field.indexOf('watch.folder.removeEntry(saved.name)');
    expect(handedAt).toBeGreaterThan(-1);
    expect(removedAt).toBeGreaterThan(handedAt);
  });

  it('offers only "Choose a file" where the browser cannot watch a folder (the iPad)', () => {
    expect(field).toContain('{canWatch && (waiting ? (');
    expect(field).toContain('showDirectoryPicker');
    expect(field).toContain('accept="image/*,.bmp"');
    // The server's HTML and the first client paint agree: no watching until the browser says it can.
    expect(field).toContain('useSyncExternalStore(noSubscription');
  });

  it('ships no preview page', () => {
    expect(existsSync(join(root, 'src', 'app', '[locale]', 'zz-thumbprint-preview'))).toBe(false);
  });
});
