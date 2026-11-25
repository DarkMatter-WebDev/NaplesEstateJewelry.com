import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkAiOpening,
  cleanItemForAi,
  normalizeOwnerOpening,
  openingLabel,
  openingUserPrompt,
  OPENING_SYSTEM_PROMPT,
  piecesForAi,
} from '@/lib/follow-up-opening';
import { normalizeThankYouNote, THANK_YOU_NOTE_MAX } from '@/lib/thank-you-note';

describe('what the AI is given (2026-11-25)', () => {
  it('item names only: money, weights, sizes and quantity prefixes are cut out', () => {
    expect(cleanItemForAi('14K yellow gold sapphire ring, 4.2 g')).toBe('14K yellow gold sapphire ring');
    expect(cleanItemForAi('Scrap 14K gold, 22.1 g — $1,140.00')).toBe('Scrap 14K gold');
    expect(cleanItemForAi('3 x American Silver Eagles')).toBe('American Silver Eagles');
    expect(cleanItemForAi('Sterling flatware set, 61 ozt')).toBe('Sterling flatware set');
    expect(cleanItemForAi('Diamond studs 1.02 ctw')).toBe('Diamond studs');
    expect(cleanItemForAi('Rope chain 20" 5mm')).toBe('Rope chain');
    expect(cleanItemForAi('  ')).toBe('');
    expect(piecesForAi(['Ring, 2 g', '', null, '$40.00'])).toEqual(['Ring']);
  });

  it('the prompt carries name, language, pieces and the note — and nothing else', () => {
    const prompt = JSON.parse(openingUserPrompt({ audience: 'seller', language: 'es', firstName: 'Margaret', pieces: ['sapphire ring'], note: " her late mother's ring " }));
    expect(prompt).toEqual({ audience: 'seller', language: 'Spanish', first_name: 'Margaret', pieces: ['sapphire ring'], owner_note: "her late mother's ring" });
  });

  it('the instructions forbid prices, reviews, days and greetings, and keep {when}', () => {
    expect(OPENING_SYSTEM_PROMPT).toContain('{when}');
    expect(OPENING_SYSTEM_PROMPT).toMatch(/Never:[\s\S]*prices/);
    expect(OPENING_SYSTEM_PROMPT).toMatch(/reviews, Google/);
    expect(OPENING_SYSTEM_PROMPT).toContain('Never invent facts');
  });
});

describe("the checks the AI's answer must pass", () => {
  it('accepts a plain, warm opening with {when} once and a karat mark', () => {
    expect(checkAiOpening("It was a pleasure meeting you {when}. Thank you for trusting us with your mother's 14K sapphire ring — I know a piece like that carries a lot of memories.")).toEqual({
      ok: true,
      text: "It was a pleasure meeting you {when}. Thank you for trusting us with your mother's 14K sapphire ring — I know a piece like that carries a lot of memories.",
    });
    expect(checkAiOpening('"Fue un placer conocerle {when}. Gracias por confiarnos su juego de té de plata."')).toMatchObject({ ok: true, text: 'Fue un placer conocerle {when}. Gracias por confiarnos su juego de té de plata.' });
  });

  it.each([
    ['It was a pleasure meeting you yesterday. Thank you for your ring.', 'a day (must be {when})'],
    ['It was great to meet you {when}. Thank you for the ring — we paid a fair price for it.', 'money or pricing'],
    ['Thanks for the 22.1 grams of gold you brought in {when}, it was lovely to meet you.', 'a number'],
    ['Thank you for coming in {when}. If you enjoyed it, please leave us a review on Google.', 'the review'],
    ['Hi Margaret, it was lovely to meet you {when} and see your ring.', 'a greeting'],
    ['It was a pleasure meeting you {when}. Visit www.example.com for more.', 'a link or address'],
    ['It was a pleasure meeting you {when}. Enjoy 10% off your next purchase.', 'an offer or promise'],
    ['Thank you {first_name} for trusting us with your ring {when}.', 'an unknown fill-in word'],
    ['Too short.', 'too short'],
  ])('refuses %s', (text, reason) => {
    expect(checkAiOpening(text)).toEqual({ ok: false, reason });
  });

  it('refuses more than three sentences and a second {when}', () => {
    expect(checkAiOpening('It was lovely {when}. Thank you. Truly. Really. Again.')).toEqual({ ok: false, reason: 'too many sentences' });
    expect(checkAiOpening('It was lovely to meet you {when}, and {when} again for the ring.')).toEqual({ ok: false, reason: '{when} more than once' });
  });
});

describe("the owner's own opening (Upcoming → Edit)", () => {
  it('keeps plain words and the three fill-in words; refuses others', () => {
    expect(normalizeOwnerOpening('  Great to see you {when}, {first_name}!  ')).toEqual({ value: 'Great to see you {when}, {first_name}!' });
    expect(normalizeOwnerOpening('')).toHaveProperty('error');
    expect(normalizeOwnerOpening('Thanks {review_link}')).toEqual({ error: '{review_link} is not a fill-in word here. Use {when}, {first_name} or {item}, or plain words.' });
  });

  it('labels say who wrote it', () => {
    expect(openingLabel('ai', true)).toBe('Written by the AI for this person');
    expect(openingLabel('owner', true)).toBe('Your wording');
    expect(openingLabel(null, false)).toBe('Standard wording (AI openings are off)');
  });
});

describe('"Note for the thank-you email" — internal only, never printed (owner, 2026-11-25)', () => {
  it('one line, up to 300 characters; empty = no note', () => {
    expect(normalizeThankYouNote("  her late\nmother's ring ")).toEqual({ value: "her late mother's ring" });
    expect(normalizeThankYouNote('')).toEqual({ value: null });
    expect(normalizeThankYouNote('x'.repeat(THANK_YOU_NOTE_MAX + 1))).toHaveProperty('error');
  });

  const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');

  it('no paper, print, station, receipt email, invoice, print-out or gift slip can reach it', () => {
    const neverThere = [
      'components/admin/buy-receipts/BuyReceiptSheet.tsx',
      'components/admin/buy-receipts/BuyReceiptPrintHost.tsx',
      'components/admin/buy-receipts/PrintStation.tsx',
      'components/admin/buy-receipts/ReceiptPrintControls.tsx',
      'components/admin/buy-receipts/buy-receipt-sheet-css.ts',
      'lib/buy-receipt-email.ts',
      'lib/buy-receipt-mailer.ts',
      'lib/buy-receipts.ts',
      'lib/order-receipt-paper.ts',
      'app/[locale]/admin/orders/[id]/invoice/page.tsx',
      'app/[locale]/admin/orders/[id]/print/page.tsx',
      'app/[locale]/admin/orders/[id]/gift-slip/page.tsx',
    ];
    for (const file of neverThere) {
      expect(src(file), file).not.toMatch(/thank_you_note|thankYouNote|ThankYouNote/);
    }
    // The shared select lists never carry it (pages, routes and the station all use BUY_RECEIPT_COLUMNS).
    expect(src('lib/buy-receipts.ts')).toContain('export const BUY_RECEIPT_COLUMNS');
    expect(src('app/[locale]/admin/orders/[id]/page.tsx')).not.toMatch(/ORDER_DETAIL_COLUMNS[^;]*thank_you_note/);
  });

  it('the box is outside the paper and hidden from print, with the words "never printed"', () => {
    const card = src('components/ThankYouNoteCard.tsx'.replace('components/', 'components/admin/'));
    expect(card).toContain('print:hidden');
    expect(card).toContain('Internal only · never printed');
    const detail = src('components/admin/buy-receipts/BuyReceiptDetail.tsx');
    expect(detail.indexOf('<ThankYouNoteCard')).toBeGreaterThan(detail.indexOf('<ReceiptPrintControls'));
  });
});
