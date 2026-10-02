import { describe, expect, it } from 'vitest';
import { SPANISH_LEGAL_COPY } from '@/lib/spanish-legal-copy';

describe('Spanish legal policy copy', () => {
  it('provides complete localized copy for every legal route', () => {
    // 6 legal routes since 2026-08-01: the auction-terms and vendor-terms
    // pages were retired along with the auctions page (both URLs 301 to
    // /terms).
    expect(Object.keys(SPANISH_LEGAL_COPY)).toHaveLength(6);

    for (const [key, page] of Object.entries(SPANISH_LEGAL_COPY)) {
      expect(page.title).toBeTruthy();
      // Privacy + Cookie Preferences were rewritten 2026-10-02 for the Google
      // Ads measurement (lib/ads-tracking.ts); the other four are unchanged.
      expect(page.updated).toBe(key === 'privacy' || key === 'cookie-preferences' ? '2 de octubre de 2026' : '19 de junio de 2026');
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
