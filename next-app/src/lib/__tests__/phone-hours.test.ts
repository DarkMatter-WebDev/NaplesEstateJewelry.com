import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHONE_HOURS, phoneContactPointSchema, phoneHours, phoneHoursLabel } from '@/lib/business-location';

// Option C (owner, 2026-09-08): the Business Profile's main hours stay the
// showroom's, and the phone's own hours are stated in words on three surfaces
// plus the site schema. One constant feeds all of them; these tests pin the
// wording each surface renders and that every surface actually uses it.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('phone hours — one constant, every surface', () => {
  it('formats the compact (card) and long (table) English forms and the Spanish form', () => {
    expect(PHONE_HOURS).toEqual({ opens: '09:00', closes: '18:00' });
    expect(phoneHoursLabel(false, 'compact')).toBe('Calls answered 9am–6pm, every day');
    expect(phoneHoursLabel(false, 'long')).toBe('Calls answered 9 AM – 6 PM, every day');
    expect(phoneHoursLabel(true)).toBe('Llamadas 9 a.m. – 6 p.m., todos los días');
    expect(phoneHours(false, 'compact').time).toBe('9am–6pm');
  });

  it('emits a ContactPoint with seven-day hoursAvailable that mirrors the constant', () => {
    const cp = phoneContactPointSchema();
    expect(cp['@type']).toBe('ContactPoint');
    expect(cp.telephone).toBe('+12394048505');
    expect(cp.hoursAvailable.dayOfWeek).toHaveLength(7);
    expect(cp.hoursAvailable.opens).toBe(PHONE_HOURS.opens);
    expect(cp.hoursAvailable.closes).toBe(PHONE_HOURS.closes);
  });

  it('is rendered on /card, the homepage Visit Us block and /spot-prices, and in the site schema', () => {
    expect(read('src', 'components', 'card', 'CardLanding.tsx')).toContain("phoneHours(isEs, 'compact')");
    expect(read('src', 'app', '[locale]', '(home)', 'page.tsx')).toMatch(/phoneHours(Label)?\(/);
    expect(read('src', 'app', '[locale]', 'spot-prices', 'page.tsx')).toContain('phoneHoursLabel(isEs)');
    expect(read('src', 'app', '[locale]', 'layout.tsx')).toContain('phoneContactPointSchema()');
  });
});

describe('gold + silver heroes carry a call button (2026-09-08)', () => {
  it('each hero has a tel: button and the silver rates survive as a text link', () => {
    const gold = read('src', 'app', '[locale]', 'gold-services', 'page.tsx');
    const silver = read('src', 'app', '[locale]', 'silver-services', 'page.tsx');
    // Hero + bottom CTA = two tel links per page (was one each).
    expect(gold.match(/href="tel:2394048505"/g)?.length).toBe(2);
    expect(silver.match(/href="tel:2394048505"/g)?.length).toBe(2);
    // The duplicate form link in the gold hero is gone.
    expect(gold).not.toContain("'GET AN ESTIMATE'");
    expect(silver).toContain('Today’s silver spot price →');
    expect(silver).not.toContain("'Current Silver Rates'");
  });
});
