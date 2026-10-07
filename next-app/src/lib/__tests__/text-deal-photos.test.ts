import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEAL_CARD_SHARED_TARGET_BYTES,
  DEAL_CARD_SOLO_TARGET_BYTES,
  DEAL_DETAIL_TARGET_BYTES,
  DEAL_MESSAGE_TARGET_BYTES,
  DEAL_PHOTO_MAX,
  dealLineFontSize,
  dealMediaPaths,
  dealPhotoCounter,
  dealPhotoList,
  dealPhotoUpdate,
  dealPictureBudget,
  formatPictureBytes,
  splitDealPhotos,
  withDealPhotoAdded,
  withDealPhotoAsMain,
  withDealPhotoRemoved,
} from '@/lib/text-alerts/deal-photos';

/**
 * Text deals carry up to five photos (owner, 2026-10-07): one main picture
 * with the full price card, up to four detail shots with a small price strip,
 * all in ONE message. Phones show them in a random order, so every picture
 * carries the price.
 */
const SRC = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('text-deal photos: the list', () => {
  it('holds five, the main one first, and reads a row without detail columns as one photo', () => {
    expect(DEAL_PHOTO_MAX).toBe(5);
    expect(dealPhotoList({ photo_path: 'a.webp' })).toEqual(['a.webp']);
    expect(dealPhotoList({ photo_path: 'a.webp', detail_photo_paths: null })).toEqual(['a.webp']);
    expect(dealPhotoList({ photo_path: 'a.webp', detail_photo_paths: ['b.webp', 'c.webp'] })).toEqual(['a.webp', 'b.webp', 'c.webp']);
    expect(dealPhotoList({ photo_path: null, detail_photo_paths: [] })).toEqual([]);
    // Never the same stored object twice — removing one would break the other.
    expect(dealPhotoList({ photo_path: 'a.webp', detail_photo_paths: ['a.webp', 'b.webp'] })).toEqual(['a.webp', 'b.webp']);
    expect(splitDealPhotos(['a.webp', 'b.webp', 'c.webp'])).toEqual({ photo_path: 'a.webp', detail_photo_paths: ['b.webp', 'c.webp'] });
    expect(splitDealPhotos([])).toEqual({ photo_path: null, detail_photo_paths: [] });
  });

  it('adds to the end, refuses a sixth and a repeat', () => {
    expect(withDealPhotoAdded([], 'a')).toEqual({ list: ['a'] });
    expect(withDealPhotoAdded(['a'], 'b')).toEqual({ list: ['a', 'b'] });
    expect(withDealPhotoAdded(['a', 'b'], 'a')).toHaveProperty('error');
    expect(withDealPhotoAdded(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual({ error: 'A deal holds up to 5 photos. Remove one to add another.' });
  });

  it('removing the main photo promotes the next one; "Make main" swaps into first place', () => {
    expect(withDealPhotoRemoved(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
    expect(withDealPhotoRemoved(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(withDealPhotoAsMain(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'b', 'a', 'd']);
    expect(withDealPhotoAsMain(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(withDealPhotoAsMain(['a', 'b'], 'zzz')).toEqual(['a', 'b']);
  });

  it('a photo change clears the rendered pictures, and a one-photo deal writes what it always wrote', () => {
    // No detail shots, row read before the SQL ran: the same two columns as before.
    expect(dealPhotoUpdate(['a'], false)).toEqual({ photo_path: 'a', card_path: null });
    expect(dealPhotoUpdate(['a', 'b'], false)).toEqual({ photo_path: 'a', card_path: null, detail_photo_paths: ['b'], detail_media_paths: [] });
    // Back down to one photo: the detail columns are emptied, not left behind.
    expect(dealPhotoUpdate(['a'], true)).toEqual({ photo_path: 'a', card_path: null, detail_photo_paths: [], detail_media_paths: [] });
    expect(dealPhotoUpdate([], true)).toEqual({ photo_path: null, card_path: null, detail_photo_paths: [], detail_media_paths: [] });
  });
});

describe('text-deal photos: what is sent', () => {
  it('sends the main picture FIRST, and nothing until every photo has its picture', () => {
    expect(dealMediaPaths({ photo_path: 'a', card_path: 'card.jpg' })).toEqual(['card.jpg']);
    expect(dealMediaPaths({ photo_path: 'a', card_path: null })).toBeNull();
    expect(dealMediaPaths({ photo_path: 'a', card_path: 'card.jpg', detail_photo_paths: ['b', 'c'], detail_media_paths: ['b.jpg', 'c.jpg'] })).toEqual(['card.jpg', 'b.jpg', 'c.jpg']);
    // A detail shot without its picture: not ready, so the send renders again first.
    expect(dealMediaPaths({ photo_path: 'a', card_path: 'card.jpg', detail_photo_paths: ['b', 'c'], detail_media_paths: ['b.jpg'] })).toBeNull();
    expect(dealMediaPaths({ photo_path: 'a', card_path: 'card.jpg', detail_photo_paths: ['b'], detail_media_paths: null })).toBeNull();
  });

  it('keeps a full message near 1 MB, and a one-photo deal on its old 600 KB rule', () => {
    expect(dealPictureBudget(0)).toEqual({ card: DEAL_CARD_SOLO_TARGET_BYTES, detail: DEAL_DETAIL_TARGET_BYTES });
    expect(DEAL_CARD_SOLO_TARGET_BYTES).toBe(600_000);
    const full = dealPictureBudget(DEAL_PHOTO_MAX - 1);
    expect(full.card).toBe(DEAL_CARD_SHARED_TARGET_BYTES);
    expect(full.card + (DEAL_PHOTO_MAX - 1) * full.detail).toBeLessThanOrEqual(DEAL_MESSAGE_TARGET_BYTES);
  });

  it('numbers every picture "Photo N of M" — the main one is 1 — and leaves a one-photo deal alone', () => {
    // Owner, 2026-10-07: "if they view the last one and see 'pic 5 of 5', they know
    // its the last one and to look at others" → mockup 4 → "option b, and use Photo".
    expect(dealPhotoCounter(0, 5)).toBe('Photo 1 of 5');
    expect(dealPhotoCounter(4, 5)).toBe('Photo 5 of 5');
    expect(dealPhotoCounter(1, 2)).toBe('Photo 2 of 2');
    expect(dealPhotoCounter(0, 1)).toBeNull();
    expect(dealPhotoCounter(0, 0)).toBeNull();
    const deals = read('lib/text-alerts/deals.ts');
    expect(deals).toContain('const total = details.length + 1;');
    expect(deals).toContain("badge: 'First reply wins', counter: dealPhotoCounter(0, total) }");
    // One gold tag, drawn the same way on the main picture and on the detail strip.
    const card = read('lib/text-alerts/card.ts');
    expect(card.match(/counterNode\(content\.counter,/g)).toHaveLength(2);
    expect(card).toContain("backgroundColor: '#e9c349'");
    expect(card).toContain("content.counter ? counterNode(content.counter, unit, 23) : null");
  });

  it('a long line shrinks to stay on ONE row instead of wrapping over the price; an ordinary line is untouched', () => {
    const ordinary = '14K byzantine chain · 20 in · 18.4 g';
    expect(dealLineFontSize(ordinary, 26, 3)).toBe(26);
    expect(dealLineFontSize('x'.repeat(57), 26, 3)).toBe(26);
    expect(dealLineFontSize('x'.repeat(58), 26, 3)).toBeLessThan(26);
    // The longest line the form takes (80 characters) still fits the row at the size it gets.
    const longest = dealLineFontSize('x'.repeat(80), 26, 3);
    expect(longest).toBeGreaterThanOrEqual(15);
    expect(80 * (0.56 * longest + 3)).toBeLessThanOrEqual(1080 - 72);
    // The detail strip's smaller line: full size for an ordinary line, one row at 80 characters.
    expect(dealLineFontSize(ordinary, 20, 2.6)).toBe(20);
    const stripLongest = dealLineFontSize('x'.repeat(80), 20, 2.6);
    expect(80 * (0.56 * stripLongest + 2.6)).toBeLessThanOrEqual(1080 - 72);
    const card = read('lib/text-alerts/card.ts');
    expect(card).toContain('dealLineFontSize(content.line, 26, 3)');
    expect(card).toContain('dealLineFontSize(content.line, 20, 2.6)');
  });

  it('prints sizes the way the composer shows them', () => {
    expect(formatPictureBytes(217_000)).toBe('212 KB');
    expect(formatPictureBytes(940_000)).toBe('918 KB');
    expect(formatPictureBytes(1_150_000)).toBe('1.1 MB');
  });
});

describe('text-deal photos: source guards', () => {
  it('one Twilio message carries every picture, in the order given', () => {
    const twilio = read('lib/text-alerts/twilio.ts');
    expect(twilio).toContain("form.append('MediaUrl', url)");
    expect(twilio).toContain('TWILIO_MEDIA_MAX = 10');
    const deals = read('lib/text-alerts/deals.ts');
    // The deal send and the test send both go through the ordered list.
    expect(deals.match(/sendTwilioMessage\(\{ to(: row\.phone_e164)?, body, mediaUrls \}\)/g)).toHaveLength(2);
    expect(deals).toContain('if (!dealMediaPaths(deal)) await buildDealMedia(service, deal);');
  });

  it('EVERY picture carries the price: the full card on the main photo, a small strip (price + line, no brand mark, no badge) on each detail shot', () => {
    // Owner's first test, 2026-10-07: the pictures of one text arrive in a random
    // order, so the price cannot live on the main picture alone ("option 3", then
    // "option a, price and the one line").
    const deals = read('lib/text-alerts/deals.ts');
    expect(deals.match(/renderDealCard\(/g)).toHaveLength(1);
    expect(deals).toContain('renderDealDetail(await readStoredPhoto(service, source), { price: deal.price_text, line: deal.title, counter: dealPhotoCounter(index + 1, total) }, budget.detail)');
    const card = read('lib/text-alerts/card.ts');
    const detail = card.slice(card.indexOf('export async function renderDealDetail('));
    expect(detail).toContain('renderStripLayer(');
    expect(detail).toContain('composite(');
    expect(detail).not.toContain('renderTextLayer');
    const strip = card.slice(card.indexOf('async function renderStripLayer('), card.indexOf('export async function renderDealDetail('));
    expect(strip).toContain('node(content.price,');
    expect(strip).toContain('node(content.line.toUpperCase(),');
    expect(strip).not.toContain('brandMark');
    expect(strip).not.toContain('badge');
    // The price sits above the line in one bottom-anchored column: a wrapped line cannot run over it.
    expect(strip).toContain("flexDirection: 'column'");
    // New words need new pictures on every photo: a word change clears the card, and the send renders all again.
    const route = read('app/api/admin/text-deals/[id]/route.ts');
    expect(route).toContain('.update({ ...input.value, card_path: null,');
  });

  it('photos change only on a draft, through requireAdmin, and a shared photo is never deleted', () => {
    const route = read('app/api/admin/text-deals/photo/route.ts');
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const body = route.slice(route.indexOf(`export async function ${method}(`));
      expect(body.indexOf('await requireAdmin()')).toBeGreaterThan(-1);
      expect(body.indexOf('await requireAdmin()')).toBeLessThan(body.indexOf('loadDraft(req)'));
    }
    expect(route).toContain("if (deal.status !== 'draft')");
    const deals = read('lib/text-alerts/deals.ts');
    expect(deals).toContain(".eq('status', 'draft')");
    // Reopen copies the detail shots; cleanup reads every other deal first and removes nothing if that read fails.
    expect(deals).toContain('...(details.length > 0 ? { detail_photo_paths: details } : {}),');
    expect(deals).toContain("console.error('[text-alerts] deal object cleanup skipped', error.message);\n    return 0;");
    expect(deals).toContain('await removeUnsharedObjects(service, [path], deal.id);');
  });

  it('the composer takes several photos at once and sends only after Preview', () => {
    const manager = read('components/admin/TextDealsManager.tsx');
    expect(manager).toContain('multiple onChange={onPhotos}');
    expect(manager).toContain('Make main');
    expect(manager).toContain('Shop name + price');
    expect(manager).toContain('with the price strip');
    expect(manager).not.toContain('nothing drawn on');
    expect(manager).not.toContain('sent as they are');
    expect(manager).toContain('Pictures as they will be sent');
    expect(manager).toContain('!pictures || confirmed === 0');
    // The outer wrapper is not a <label>: a tap on a thumbnail must not open the photo picker.
    expect(manager).not.toMatch(/<label className="block">\s*<span[^>]*>Photos/);
  });

  it('the SQL adds both columns and is safe to re-run', () => {
    const sql = readFileSync(join(process.cwd(), '..', 'supabase', 'text-deals-photos-2026-10.sql'), 'utf8');
    expect(sql).toContain("add column if not exists detail_photo_paths text[] not null default '{}'");
    expect(sql).toContain("add column if not exists detail_media_paths text[] not null default '{}'");
  });
});
