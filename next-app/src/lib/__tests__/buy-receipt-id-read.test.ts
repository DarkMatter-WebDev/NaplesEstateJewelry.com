import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankBuyReceiptDraft, BUY_RECEIPT_ID_TYPES, normalizeBuyReceiptInput } from '@/lib/buy-receipts';
import {
  EMPTY_ID_READ,
  ID_READ_SYSTEM_PROMPT,
  applyIdReadToDraft,
  coerceIdRead,
  idReadIsEmpty,
  parseIdReadJson,
  type IdReadFields,
} from '@/lib/buy-receipt-id-read';

const NOW = new Date('2026-10-09T15:00:00Z');

const CARD = {
  name: 'Maria T Lopez',
  street: '1250 Pine Ridge Rd Apt 4',
  city: 'Naples',
  state: 'FL',
  zip: '34109',
  idType: 'Driver license',
  idNumber: 'L123-456-78-901-0',
  dob: '1958-03-14',
};

const READ: IdReadFields = {
  name: 'Maria T Lopez',
  street: '1250 Pine Ridge Rd Apt 4',
  city: 'Naples',
  state: 'FL',
  zip: '34109',
  idType: 'Driver license',
  idLast4: '9010',
  dob: '1958-03-14',
};

describe('coerceIdRead', () => {
  it('turns a clean answer into the values the form accepts', () => {
    expect(coerceIdRead(CARD, NOW)).toEqual(READ);
  });

  it('keeps only the last four characters of the ID number', () => {
    expect(coerceIdRead({ idNumber: 'L123-456-78-901-0' }, NOW).idLast4).toBe('9010');
    expect(coerceIdRead({ idNumber: 'ab 12 cd' }, NOW).idLast4).toBe('12CD');
    // Fewer than four characters is not an ID number.
    expect(coerceIdRead({ idNumber: 'A1' }, NOW).idLast4).toBeNull();
  });

  it('puts an all-capitals answer into normal capitalisation and leaves a mixed-case one alone', () => {
    const read = coerceIdRead({ name: 'MARIA T LOPEZ-O’NEIL', street: '1250 PINE RIDGE RD APT 4', city: 'BONITA SPRINGS' }, NOW);
    expect(read.name).toBe('Maria T Lopez-O’Neil');
    expect(read.street).toBe('1250 Pine Ridge Rd Apt 4');
    expect(read.city).toBe('Bonita Springs');
    expect(coerceIdRead({ name: 'Sean McDonald' }, NOW).name).toBe('Sean McDonald');
  });

  it('drops a value that does not have the shape the form accepts', () => {
    const read = coerceIdRead(
      { name: '12345', state: 'Florida', zip: '3410', idType: 'Library card', dob: '03/14/1958', city: 42, street: '   ' },
      NOW,
    );
    expect(read).toEqual(EMPTY_ID_READ);
    expect(idReadIsEmpty(read)).toBe(true);
  });

  it('accepts a nine-digit ZIP however the card prints it', () => {
    expect(coerceIdRead({ zip: '34109-1234' }, NOW).zip).toBe('34109-1234');
    expect(coerceIdRead({ zip: '341091234' }, NOW).zip).toBe('34109-1234');
    expect(coerceIdRead({ zip: '34109 1234' }, NOW).zip).toBe('34109-1234');
  });

  it('refuses a date of birth that is not a real past date', () => {
    expect(coerceIdRead({ dob: '1958-02-30' }, NOW).dob).toBeNull();
    expect(coerceIdRead({ dob: '2031-01-01' }, NOW).dob).toBeNull();
    expect(coerceIdRead({ dob: '1890-01-01' }, NOW).dob).toBeNull();
    expect(coerceIdRead({ dob: '1958-03-14' }, NOW).dob).toBe('1958-03-14');
  });

  it('matches the ID type to the form list whatever its capitals', () => {
    expect(coerceIdRead({ idType: 'driver LICENSE' }, NOW).idType).toBe('Driver license');
    for (const type of BUY_RECEIPT_ID_TYPES) expect(coerceIdRead({ idType: type }, NOW).idType).toBe(type);
  });

  it('answers all-empty for anything that is not an object', () => {
    for (const raw of [null, undefined, 'text', 7, [CARD]]) expect(coerceIdRead(raw, NOW)).toEqual(EMPTY_ID_READ);
  });
});

describe('parseIdReadJson', () => {
  it('reads the object out of a bare reply, a fenced one, and one with words around it', () => {
    const json = JSON.stringify(CARD);
    expect(parseIdReadJson(json)).toEqual(CARD);
    expect(parseIdReadJson('```json\n' + json + '\n```')).toEqual(CARD);
    expect(parseIdReadJson('Here is the card:\n' + json + '\nDone.')).toEqual(CARD);
  });

  it('answers null for a reply with no object in it', () => {
    expect(parseIdReadJson('I cannot read this picture.')).toBeNull();
    expect(parseIdReadJson('{not json}')).toBeNull();
    expect(parseIdReadJson('')).toBeNull();
  });
});

describe('applyIdReadToDraft', () => {
  it('fills every empty seller box on a blank receipt, and never phone or email', () => {
    const blank = blankBuyReceiptDraft();
    const filled = applyIdReadToDraft(blank, READ);
    expect(filled).toMatchObject({
      sellerName: 'Maria T Lopez',
      sellerStreet: '1250 Pine Ridge Rd Apt 4',
      sellerCity: 'Naples',
      sellerState: 'FL',
      sellerZip: '34109',
      sellerIdType: 'Driver license',
      sellerIdLast4: '9010',
      sellerDob: '1958-03-14',
      sellerPhone: '',
      sellerEmail: '',
    });
    // The owner's part of the receipt is untouched.
    expect(filled.items).toEqual(blank.items);
    expect(filled.payments).toEqual(blank.payments);
    expect(filled.notes).toBe(blank.notes);
  });

  it('never overwrites a box that already has something in it (owner, 2026-10-09)', () => {
    const typed = {
      ...blankBuyReceiptDraft(),
      sellerName: 'M. Lopez',
      sellerStreet: '9 Gulf Shore Blvd',
      sellerCity: 'Marco Island',
      sellerState: 'FL',
      sellerZip: '34145',
      sellerIdType: 'State ID',
      sellerIdLast4: '0000',
      sellerDob: '1960-01-01',
    };
    expect(applyIdReadToDraft(typed, READ)).toEqual(typed);
  });

  it('fills only the boxes the seller left empty', () => {
    const half = { ...blankBuyReceiptDraft(), sellerName: 'Maria Lopez', sellerStreet: '9 Gulf Shore Blvd' };
    const filled = applyIdReadToDraft(half, READ);
    expect(filled.sellerName).toBe('Maria Lopez');
    expect(filled.sellerStreet).toBe('9 Gulf Shore Blvd');
    expect(filled.sellerCity).toBe('Naples');
    expect(filled.sellerDob).toBe('1958-03-14');
  });

  it('lets the ID replace the default FL only when no part of the address was typed', () => {
    const ohio: IdReadFields = { ...READ, street: '77 Elm St', city: 'Dayton', state: 'OH', zip: '45402' };
    // Nothing typed: the whole address, state included, comes from the card.
    expect(applyIdReadToDraft(blankBuyReceiptDraft(), ohio).sellerState).toBe('OH');
    // The seller typed a Naples street: "OH" must not land beside it.
    const local = { ...blankBuyReceiptDraft(), sellerStreet: '9 Gulf Shore Blvd' };
    expect(applyIdReadToDraft(local, ohio).sellerState).toBe('FL');
    // A state somebody typed is never replaced; an emptied box is filled.
    expect(applyIdReadToDraft({ ...blankBuyReceiptDraft(), sellerState: 'NY' }, ohio).sellerState).toBe('NY');
    expect(applyIdReadToDraft({ ...blankBuyReceiptDraft(), sellerState: '' }, ohio).sellerState).toBe('OH');
  });

  it('leaves a box alone when the card gave nothing for it', () => {
    const filled = applyIdReadToDraft(blankBuyReceiptDraft(), { ...EMPTY_ID_READ, name: 'Maria T Lopez' });
    expect(filled).toEqual({ ...blankBuyReceiptDraft(), sellerName: 'Maria T Lopez' });
  });

  it('produces values the receipt itself accepts', () => {
    const filled = applyIdReadToDraft(blankBuyReceiptDraft(), READ);
    const check = normalizeBuyReceiptInput({
      ...filled,
      items: [{ qty: '1', description: '14K ring', amount: '100' }],
      payments: [{ method: 'cash', reference: '', amount: '100' }],
    });
    expect('error' in check ? check.error : null).toBeNull();
  });
});

// --- Source guards -------------------------------------------------------------

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

describe('fill form from ID: where the photo goes and what is kept', () => {
  const provider = read('src', 'lib', 'buy-receipt-id-read-provider.ts');
  const route = read('src', 'app', 'api', 'admin', 'buy-receipts', 'id-read', 'route.ts');
  const form = read('src', 'components', 'admin', 'buy-receipts', 'BuyReceiptForm.tsx');
  const field = read('src', 'components', 'admin', 'buy-receipts', 'IdPhotoField.tsx');
  const detail = read('src', 'components', 'admin', 'buy-receipts', 'BuyReceiptDetail.tsx');

  it('asks the model for every box a card can fill, and for the ID types the form lists', () => {
    for (const key of ['name', 'street', 'city', 'state', 'zip', 'idType', 'idNumber', 'dob']) {
      expect(ID_READ_SYSTEM_PROMPT, key).toContain(`"${key}"`);
    }
    for (const type of BUY_RECEIPT_ID_TYPES) expect(ID_READ_SYSTEM_PROMPT, type).toContain(`"${type}"`);
    expect(ID_READ_SYSTEM_PROMPT).toContain('Never guess');
  });

  it('checks the answer before anything reaches the form', () => {
    expect(provider).toContain('return coerceIdRead(parseIdReadJson(text), now);');
  });

  it('stores nothing and logs nothing read off the card', () => {
    // No Storage, no table, no service role: the photo is in memory for the one request.
    for (const source of [provider, route]) {
      expect(source).not.toContain('.storage');
      expect(source).not.toContain(".from('");
      expect(source).not.toContain('createServiceClient');
      expect(source).not.toContain('console.log');
    }
    expect(provider).not.toContain('console.');
    // The route logs the provider's error message only.
    expect(route.match(/console\.\w+\(/g)).toEqual(['console.error(']);
    expect(route).toContain("console.error('[buy-receipts] id read failed', error instanceof Error ? error.message : error);");
  });

  it('names no sampling or thinking setting, so a newer model does not refuse the request', () => {
    const body = provider.slice(provider.indexOf('body: JSON.stringify({'), provider.indexOf('signal: controller.signal'));
    for (const setting of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice']) {
      expect(body, setting).not.toContain(setting);
    }
  });

  it('starts ticked on every new receipt and sends nothing while unticked', () => {
    expect(form).toContain('const [fillFromId, setFillFromId] = useState(true);');
    expect(form).toContain('if (fillFromId) void fillFromPhoto(blob);');
    // Clear puts the tick back.
    const startOver = form.slice(form.indexOf('function startOver()'), form.indexOf('async function enterCustomerMode()'));
    expect(startOver).toContain('setFillFromId(true);');
    // readIdPhoto is called from one place only.
    expect(form.match(/readIdPhoto\(/g)).toHaveLength(1);
  });

  it('fills against the form as it is when the answer arrives, and drops an answer for a photo that is gone', () => {
    expect(form).toContain('setDraft((current) => applyIdReadToDraft(current, read.fields));');
    expect(form).toContain('if (run !== idReadRun.current) return;');
  });

  it('shows no line listing what was filled (owner, 2026-10-09)', () => {
    expect(form).not.toMatch(/Filled:/);
    expect(field).not.toMatch(/Filled:/);
  });

  it('offers the box on the New receipt form only', () => {
    expect(field).toContain('Fill form from ID');
    expect(form).toContain('autoFill={{ checked: fillFromId, onChange: changeFillFromId, reading: readingId }}');
    expect(detail).not.toContain('autoFill');
    expect(detail).not.toContain('readIdPhoto');
  });
});
