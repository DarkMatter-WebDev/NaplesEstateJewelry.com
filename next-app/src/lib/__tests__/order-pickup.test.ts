import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPickupPaper,
  cleanIdLast4,
  cleanPickupEmail,
  idNameMatchesBuyer,
  isMissingPickupTable,
  isOrderPickupPath,
  isPickupCopies,
  isPickupOrder,
  normalizePickupDetails,
  orderPickupFolder,
  pickupCardStatus,
  pickupEmailRecipients,
  orderPickupIdPhotoPath,
  orderPickupSignaturePath,
  PICKUP_STATEMENT,
  PRIVATE_IMAGE_ATTR,
  privateImagePaths,
  withPrivateImages,
  type OrderPickupRow,
  type PickupPaperOrder,
} from '@/lib/order-pickup';
import { buildPickupEmail, pickupSignedLine } from '@/lib/order-pickup-email';

const ORDER_ID = '0b9d2f1e-6c1a-4f5b-9c33-1d2e3f4a5b6c';

const order: PickupPaperOrder = {
  order_number: 'NEJ-20261118-K7Q2M',
  customer_name: 'Margaret Collins',
  customer_email: 'margaret.c@example.com',
  customer_phone: '(239) 555-0142',
  created_at: '2026-11-18T20:05:00Z',
  order_items: [
    { inventory_number: '1043', title_snapshot: '14K Yellow Gold Wedding Band', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 4.2, quantity: 1, image_snapshot: '/assets/images/x.webp' },
    { inventory_number: '1187', title_snapshot: 'Vintage 9K Gold Signet Ring', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '9K', gram_weight_snapshot: 6.8, quantity: 1, image_snapshot: null },
  ],
};

const photoPath = orderPickupIdPhotoPath(ORDER_ID, 'aaaa');
const signaturePath = orderPickupSignaturePath(ORDER_ID, 'bbbb');

function pickup(overrides: Partial<OrderPickupRow> = {}): OrderPickupRow {
  return {
    order_id: ORDER_ID,
    picked_up_by: 'Margaret Collins',
    picked_up_by_buyer: true,
    id_type: 'Driver license',
    id_last4: '4821',
    id_photo_path: photoPath,
    sign_method: 'digital',
    signature_path: signaturePath,
    signed_name: 'Margaret Collins',
    signed_at: '2026-11-21T19:14:00Z',
    picked_up_at: '2026-11-21T19:14:00Z',
    emailed_at: null,
    emailed_to: null,
    logged_by_email: 'admin@example.com',
    updated_by_email: null,
    created_at: '2026-11-21T19:14:00Z',
    updated_at: '2026-11-21T19:14:00Z',
    ...overrides,
  };
}

function sheets(body: string): string[] {
  return body.split('<div class="nej-pickup-sheet">').slice(1);
}

describe('which orders get the Pickup card', () => {
  it('Local Pickup orders from checkout, offers and remote sales', () => {
    expect(isPickupOrder({ shipping_method: 'pickup', payment_method: 'paypal' })).toBe(true);
    expect(isPickupOrder({ shipping_method: 'pickup', payment_method: 'remote_zelle' })).toBe(true);
  });
  it('not shipped orders, and not in-store sales (carried out at the counter)', () => {
    expect(isPickupOrder({ shipping_method: 'shipping', payment_method: 'paypal' })).toBe(false);
    expect(isPickupOrder({ shipping_method: 'pickup', payment_method: 'in_store_cash' })).toBe(false);
    expect(isPickupOrder({ shipping_method: 'pickup', payment_method: 'in_store_split' })).toBe(false);
  });
});

describe('Log Pickup form checks', () => {
  it('the buyer: the name comes from the ORDER, never the browser', () => {
    const result = normalizePickupDetails({ buyer: true, name: 'Someone Typed', signMethod: 'paper' }, 'Margaret Collins');
    expect('value' in result && result.value.picked_up_by).toBe('Margaret Collins');
    expect('value' in result && result.value.picked_up_by_buyer).toBe(true);
  });
  it('someone else needs a name', () => {
    expect(normalizePickupDetails({ buyer: false, name: '  ' }, 'Margaret Collins')).toEqual({ error: 'Type the name of the person picking up.' });
    const ok = normalizePickupDetails({ buyer: false, name: ' John   Collins ' }, 'Margaret Collins');
    expect('value' in ok && ok.value.picked_up_by).toBe('John Collins');
  });
  it('ID type from the list only; last 4 = four letters or digits, upper-cased', () => {
    expect('error' in normalizePickupDetails({ idType: 'Library card' }, 'M C')).toBe(true);
    expect('error' in normalizePickupDetails({ idLast4: '12' }, 'M C')).toBe(true);
    const ok = normalizePickupDetails({ idType: 'Passport', idLast4: 'a1-b2' }, 'M C');
    expect('value' in ok && ok.value.id_type).toBe('Passport');
    expect('value' in ok && ok.value.id_last4).toBe('A1B2');
    expect(cleanIdLast4('')).toBeNull();
  });
  it('a printed name only for a finger signature (defaults to the person)', () => {
    const digital = normalizePickupDetails({ signMethod: 'digital', signedName: '' }, 'Margaret Collins');
    expect('value' in digital && digital.value.signed_name).toBe('Margaret Collins');
    const paper = normalizePickupDetails({ signMethod: 'paper', signedName: 'X' }, 'Margaret Collins');
    expect('value' in paper && paper.value.signed_name).toBeNull();
  });
  it('the email box is only a strict true', () => {
    const result = normalizePickupDetails({ email: 'yes' }, 'M C');
    expect('value' in result && result.value.email).toBe(false);
  });
  it('"To a different email": a real address (lower case), nothing when empty, refused when wrong', () => {
    const typed = normalizePickupDetails({ emailOther: '  Maria.Lopez@Yahoo.com ' }, 'M C');
    expect('value' in typed && typed.value.email_other).toBe('maria.lopez@yahoo.com');
    const empty = normalizePickupDetails({ emailOther: '' }, 'M C');
    expect('value' in empty && empty.value.email_other).toBeNull();
    expect('value' in normalizePickupDetails({}, 'M C')).toBe(true);
    for (const bad of ['maria', 'maria@yahoo', 'a@b.com, c@d.com', 'a b@c.com']) {
      expect(normalizePickupDetails({ emailOther: bad }, 'M C')).toEqual({ error: 'The other email address does not look right. Check it, or untick "To a different email".' });
    }
  });
});

describe('who gets the pickup copy (order email / a different email / both)', () => {
  const ORDER_EMAIL = 'margaret.c@example.com';
  it('order email only — the default, same as before', () => {
    expect(pickupEmailRecipients(ORDER_EMAIL, true, null)).toEqual([ORDER_EMAIL]);
  });
  it('a different email instead', () => {
    expect(pickupEmailRecipients(ORDER_EMAIL, false, 'maria.lopez@yahoo.com')).toEqual(['maria.lopez@yahoo.com']);
  });
  it('both — order email first', () => {
    expect(pickupEmailRecipients(ORDER_EMAIL, true, 'maria.lopez@yahoo.com')).toEqual([ORDER_EMAIL, 'maria.lopez@yahoo.com']);
  });
  it('the same address twice is sent once', () => {
    expect(pickupEmailRecipients(ORDER_EMAIL, true, ' Margaret.C@Example.com ')).toEqual([ORDER_EMAIL]);
  });
  it('an order with no email can still send to a different email', () => {
    expect(pickupEmailRecipients(null, true, 'maria.lopez@yahoo.com')).toEqual(['maria.lopez@yahoo.com']);
    expect(pickupEmailRecipients('', true, null)).toEqual([]);
  });
  it('neither ticked → nobody', () => {
    expect(pickupEmailRecipients(ORDER_EMAIL, false, null)).toEqual([]);
  });
  it('cleanPickupEmail rejects lists and blanks', () => {
    expect(cleanPickupEmail('a@b.co')).toBe('a@b.co');
    expect(cleanPickupEmail('a@b.co;c@d.co')).toBeNull();
    expect(cleanPickupEmail('   ')).toBeNull();
    expect(cleanPickupEmail(42)).toBeNull();
  });
});

describe('the name on the ID vs the buyer (a warning only)', () => {
  it('matches across card order, capitals, middle names and accents', () => {
    expect(idNameMatchesBuyer('COLLINS, MARGARET A', 'Margaret Collins')).toBe(true);
    expect(idNameMatchesBuyer('José Ramírez Jr', 'Jose Ramirez')).toBe(true);
  });
  it('flags a different person', () => {
    expect(idNameMatchesBuyer('John Smith', 'Margaret Collins')).toBe(false);
  });
  it('no name read = no warning', () => {
    expect(idNameMatchesBuyer(null, 'Margaret Collins')).toBe(true);
  });
});

describe('private storage paths', () => {
  it('live in the order\'s own folder, a new name each time', () => {
    expect(photoPath).toBe(`order-pickups/${ORDER_ID}/id-aaaa.webp`);
    expect(signaturePath.startsWith(`${orderPickupFolder(ORDER_ID)}/signature-`)).toBe(true);
    expect(isOrderPickupPath(ORDER_ID, photoPath)).toBe(true);
    expect(isOrderPickupPath(ORDER_ID, 'receipts/x/id.webp')).toBe(false);
    expect(isOrderPickupPath(ORDER_ID, `${orderPickupFolder(ORDER_ID)}/../x`)).toBe(false);
  });
  it('knows the "SQL not run" error', () => {
    expect(isMissingPickupTable({ code: '42P01' })).toBe(true);
    expect(isMissingPickupTable({ message: 'relation "public.order_pickups" does not exist' })).toBe(true);
    expect(isMissingPickupTable({ message: 'timeout' })).toBe(false);
    expect(isPickupCopies('both') && isPickupCopies('store') && !isPickupCopies('all')).toBe(true);
  });
});

describe('the pickup paper', () => {
  it('both copies in one job, store first', () => {
    const paper = buildPickupPaper(order, pickup(), { copies: 'both', hoursLine: 'Mon–Sat, 10 AM–4 PM' });
    const [store, customer] = sheets(paper.body);
    expect(sheets(paper.body)).toHaveLength(2);
    expect(store).toContain('STORE COPY');
    expect(customer).toContain('CUSTOMER COPY');
    expect(paper.css).toContain('break-after:page');
  });
  it('the STORE copy: ID line, ID photo, signature, staff line', () => {
    const [store] = sheets(buildPickupPaper(order, pickup(), { copies: 'store' }).body);
    expect(store).toContain('Driver license ····4821');
    expect(store).toContain(`${PRIVATE_IMAGE_ATTR}="${photoPath}"`);
    expect(store).toContain(`${PRIVATE_IMAGE_ATTR}="${signaturePath}"`);
    expect(store).toContain('>Staff<');
    expect(store).toContain('Signed electronically');
    expect(store).toContain('(the buyer)');
  });
  it('⛔ the CUSTOMER copy never carries the ID', () => {
    const [customer] = sheets(buildPickupPaper(order, pickup(), { copies: 'customer', hoursLine: 'Mon–Sat' }).body);
    expect(customer).not.toContain('4821');
    expect(customer).not.toContain('Driver license');
    expect(customer).not.toContain(photoPath);
    expect(customer).toContain(signaturePath);
    expect(customer).not.toContain('>Staff<');
    expect(customer).toContain('within 5 days of pickup');
  });
  it('a paper pickup: blank lines on the store copy, no signature row on the customer copy', () => {
    const paper = buildPickupPaper(order, pickup({ sign_method: 'paper', signature_path: null, signed_at: null, signed_name: null }), { copies: 'both' });
    const [store, customer] = sheets(paper.body);
    expect(store).toContain('Customer signature');
    expect(store).not.toContain('Signed electronically');
    expect(customer).not.toContain('Customer signature');
  });
  it('the blank sheet: store copy only, empty boxes, no private picture', () => {
    const paper = buildPickupPaper(order, null, { copies: 'both' });
    expect(sheets(paper.body)).toHaveLength(1);
    expect(paper.body).toContain('STORE COPY');
    expect(paper.body).not.toContain(PRIVATE_IMAGE_ATTR);
    expect(paper.title).toContain('Blank pickup sheet');
  });
  it('never a price; the statement is on it; text is escaped', () => {
    const paper = buildPickupPaper({ ...order, customer_name: '<b>X</b>' }, pickup({ picked_up_by: 'A <script>' }), { copies: 'both' });
    expect(paper.body).not.toMatch(/\$\d/);
    expect(paper.body).toContain(PICKUP_STATEMENT.replace(/'/g, '&#039;'));
    expect(paper.body).not.toContain('<script>');
    expect(paper.body).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
  it('private pictures are filled for printing, or drop out', () => {
    const paper = buildPickupPaper(order, pickup(), { copies: 'store' });
    expect(privateImagePaths(paper.body).sort()).toEqual([photoPath, signaturePath].sort());
    const filled = withPrivateImages(paper.body, new Map([[photoPath, 'blob:https://site/1']]));
    expect(filled).toContain('src="blob:https://site/1"');
    expect(filled).not.toContain(PRIVATE_IMAGE_ATTR);
    expect(filled).not.toContain(signaturePath);
  });
});

describe('the pickup email', () => {
  it('⛔ never the ID photo, ID details, the signature picture or a price', () => {
    const email = buildPickupEmail(order, pickup());
    for (const part of [email.html, email.text]) {
      expect(part).not.toContain('4821');
      expect(part).not.toContain('Driver license');
      expect(part).not.toContain(photoPath);
      expect(part).not.toContain(signaturePath);
      expect(part).not.toContain('order-pickups/');
      expect(part).not.toMatch(/\$\d/);
    }
    expect(email.subject).toBe('Your pickup receipt — Order NEJ-20261118-K7Q2M');
    expect(email.text).toContain('Returns: call or text');
    expect(email.html).toContain('Thank you for picking up your order, Margaret');
  });
  it('says how it was signed', () => {
    expect(pickupSignedLine(pickup())).toMatch(/^Signed electronically by Margaret Collins on /);
    expect(pickupSignedLine(pickup({ sign_method: 'paper', signature_path: null }))).toMatch(/^Signed in person at the showroom on November 21, 2026$/);
  });
});

describe('wiring guards', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
  it('the save route re-encodes to WebP and checks it, in the PRIVATE bucket', () => {
    const route = read('src/app/api/admin/orders/[id]/pickup/route.ts');
    expect(route).toContain('BUY_RECEIPT_ID_BUCKET');
    expect(route).toContain("produced.format !== 'webp'");
    expect(route).toContain("contentType: 'image/webp'");
    expect(route).not.toContain('product-images');
  });
  it('the Print Station fills private pictures before printing a sale paper', () => {
    expect(read('src/components/admin/buy-receipts/PrintStation.tsx')).toContain('fillPrivatePaper(row.paper)');
  });
  it('Delete Forever removes the pickup files', () => {
    expect(read('src/components/admin/OrdersPanel.tsx').match(/removeOrderPickupFiles\(/g)?.length).toBe(2);
  });
  it('the save route sends to the chosen addresses, first log only, one email each', () => {
    const route = read('src/app/api/admin/orders/[id]/pickup/route.ts');
    expect(route).toContain('current ? [] : pickupEmailRecipients(order.customer_email, details.email, details.email_other)');
    const server = read('src/lib/order-pickup-server.ts');
    expect(server).toContain('for (const to of recipients)');
    // One address per send — never both in one email's `to`.
    expect(server).toMatch(/replyTo: 'info@naplesestatejewelry\.com',\s+to,\s+subject/);
  });
  it('the typed address is never written onto the order', () => {
    const route = read('src/app/api/admin/orders/[id]/pickup/route.ts');
    expect(route).not.toMatch(/customer_email:\s*details/);
  });
  it('the signing box never scrolls the page under a finger', () => {
    expect(read('src/components/admin/pickup/PickupSignatureScreen.tsx')).toContain("touchAction: 'none'");
  });
});

describe('the Pickup card agrees with the Fulfillment card (owner, 2026-11-22)', () => {
  it('reads both the log and the Fulfillment status', () => {
    expect(pickupCardStatus(false, 'pending')).toBe('waiting');
    expect(pickupCardStatus(false, 'picked_up')).toBe('marked-no-log');
    expect(pickupCardStatus(true, 'picked_up')).toBe('logged');
    expect(pickupCardStatus(true, 'pending')).toBe('log-unmarked');
    expect(pickupCardStatus(false, null)).toBe('waiting');
  });

  it('the order page passes the live Fulfillment status into the card', () => {
    const page = readFileSync(join(process.cwd(), 'src/components/admin/OrderDetailPanel.tsx'), 'utf8');
    expect(page).toContain('fulfillmentStatus={order.fulfillment_status}');
    const card = readFileSync(join(process.cwd(), 'src/components/admin/pickup/OrderPickupPanel.tsx'), 'utf8');
    expect(card).toContain('pickupCardStatus(Boolean(pickup), fulfillmentStatus)');
    expect(card).toContain('marked picked up in Fulfillment');
  });
});
