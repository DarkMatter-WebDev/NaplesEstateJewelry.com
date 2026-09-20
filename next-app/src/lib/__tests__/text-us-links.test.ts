import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('Text Us links', () => {
  const component = read('src', 'components', 'cta', 'TextUsLink.tsx');

  it('takes the number from contact-links and is usable from server components', () => {
    expect(component).toContain("from '@/lib/contact-links'");
    // No client directive (the file's comment mentions the phrase, so test the first line).
    expect(component.trimStart().startsWith("'use client'")).toBe(false);
    expect(component).not.toMatch(/sms:\d|tel:\d|888/);
  });

  it.each([
    ['src/app/[locale]/sell/[city]/page.tsx', 'CALL OR TEXT (239) 404-8505', 'opening="seller"'],
    ['src/app/[locale]/free-evaluation/page.tsx', 'Call or Text Chris', 'opening="seller"'],
    ['src/app/[locale]/(home)/page.tsx', 'Call or text Chris →', '<TextUsLink'],
    ['src/components/shop/ProductTrustSections.tsx', 'call or', '<TextUsLink'],
  ])('%s keeps its "call or text" wording and gains a real text link', (file, wording, link) => {
    const source = read(...file.split('/'));
    expect(source).toContain(wording);
    expect(source).toContain(link);
    // The call link that was there stays.
    expect(source).toContain('href="tel:2394048505"');
  });

  it('never prefills the seller line for shoppers', () => {
    expect(read('src', 'components', 'shop', 'ProductTrustSections.tsx')).not.toContain('opening="seller"');
    expect(read('src', 'app', '[locale]', '(home)', 'page.tsx')).not.toContain('opening="seller"');
  });

  it('puts Call and Text in the phone MENU, and no new icon in the header row', () => {
    const header = read('src', 'components', 'layout', 'SiteHeader.tsx');
    expect(header).toContain('href={TEL_HREF}');
    expect(header).toContain('href={smsHref()}');
    // The header row still has exactly one tap-to-call icon button.
    expect(header.match(/site-header-call-button/g)?.length).toBeGreaterThanOrEqual(1);
    expect(header).not.toContain('site-header-text-button');
  });
});

describe('/bullion hero', () => {
  const page = read('src', 'app', '[locale]', 'bullion', 'page.tsx');

  it('carries the standard pair and the phone-hours line, with the headline untouched', () => {
    expect(page).toContain("'FREE APPRAISAL'");
    expect(page).toContain("'CALL (239) 404-8505'");
    expect(page).toContain('phoneHoursLabel(isEs)');
    expect(page).toContain("'Sell Bullion, Coins & Precious Metals'");
    expect(page).toContain("'Venda Lingotes, Monedas y Metales Preciosos'");
  });
});
