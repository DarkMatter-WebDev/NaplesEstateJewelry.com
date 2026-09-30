import { describe, expect, it } from 'vitest';
import { SPANISH_LEGAL_COPY } from '@/lib/spanish-legal-copy';

describe('Spanish legal policy copy', () => {
  it('provides complete localized copy for every legal route', () => {
    // 6 legal routes since 2026-08-01: the auction-terms and vendor-terms
    // pages were retired along with the auctions page (both URLs 301 to
    // /terms).
    expect(Object.keys(SPANISH_LEGAL_COPY)).toHaveLength(6);

    for (const page of Object.values(SPANISH_LEGAL_COPY)) {
      expect(page.title).toBeTruthy();
      expect(page.updated).toBe('19 de junio de 2026');
      expect(page.sections.length).toBeGreaterThan(0);
      for (const section of page.sections) {
        expect(section.title).toBeTruthy();
        expect((section.body?.length ?? 0) + (section.bullets?.length ?? 0)).toBeGreaterThan(0);
      }
    }
  });

  it('contains Spanish body copy rather than the previous English openings', () => {
    const allCopy = JSON.stringify(SPANISH_LEGAL_COPY);
    expect(allCopy).not.toContain('Contact information, including');
    expect(allCopy).not.toContain('We operate a small-business website');
    expect(allCopy).not.toContain('Local pickup by appointment');
    expect(allCopy).not.toContain('If bidding is enabled');
  });
});
