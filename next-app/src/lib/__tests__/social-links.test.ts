import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SOCIAL_PROFILES, socialLinkLabel } from '../social-links';
import { FACEBOOK_URL, INSTAGRAM_URL, NEXTDOOR_URL, SAME_AS, TIKTOK_URL } from '../business-location';

// Social links (owner, 2026-11-01): homepage band above "Visit Us", the
// footer's own row, Contact (showroom column), About, the business cards, and
// sameAs. Official colour logos only.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('the four accounts', () => {
  it('are the real accounts, in order, each written as the brand writes it', () => {
    expect(SOCIAL_PROFILES.map((p) => p.name)).toEqual(['Instagram', 'Facebook', 'TikTok', 'Nextdoor']);
    expect(SOCIAL_PROFILES.map((p) => p.href)).toEqual([INSTAGRAM_URL, FACEBOOK_URL, TIKTOK_URL, NEXTDOOR_URL]);
    expect(TIKTOK_URL).toBe('https://www.tiktok.com/@naples_estate_jewelry');
    expect(NEXTDOOR_URL).toBe('https://nextdoor.com/page/naples-estate-jewelry-naples-fl/');
    for (const p of SOCIAL_PROFILES) expect(p.href).toMatch(/^https:\/\//);
  });

  it('all four are in sameAs (Google: "this is also us")', () => {
    for (const url of [INSTAGRAM_URL, FACEBOOK_URL, TIKTOK_URL, NEXTDOOR_URL]) expect(SAME_AS).toContain(url);
    expect(SAME_AS.some((u) => /naplesjewelrybuyers/.test(u))).toBe(false);
  });

  it('the screen-reader name says whose account and that it opens a new tab', () => {
    expect(socialLinkLabel('TikTok', false)).toBe('Naples Estate Jewelry on TikTok (opens in a new tab)');
    expect(socialLinkLabel('Nextdoor', true)).toBe('Naples Estate Jewelry en Nextdoor (se abre en una pestaña nueva)');
  });
});

describe('the logo files', () => {
  it('are REAL WebP (not PNG under a .webp name), 128 px square, small', async () => {
    for (const p of SOCIAL_PROFILES) {
      const file = join(process.cwd(), 'public', p.logo);
      const head = readFileSync(file).subarray(0, 12);
      expect(head.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(head.subarray(8, 12).toString('ascii')).toBe('WEBP');
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', 128, 128, true]);
      expect(statSync(file).size).toBeLessThan(16_000);
    }
  });
});

describe('where they appear', () => {
  const component = read('src', 'components', 'SocialFollow.tsx');

  it('every link opens a new tab safely, with the logo hidden from screen readers and the name on the link', () => {
    expect(component.match(/target="_blank"/g)?.length).toBe(2);
    expect(component.match(/rel="noopener noreferrer"/g)?.length).toBe(2);
    expect(component.match(/alt=""/g)?.length).toBe(2);
    expect(component.match(/aria-label=\{socialLinkLabel\(/g)?.length).toBe(2);
    // The mockup's dashed gold outline marked what was new — never built.
    expect(component).not.toMatch(/dashed/);
  });

  it('homepage: its own band right above "Visit Us"', () => {
    const home = read('src', 'app', '[locale]', '(home)', 'page.tsx');
    const band = home.indexOf('<SocialFollowTiles');
    expect(band).toBeGreaterThan(home.indexOf('<TestimonialsSection'));
    expect(band).toBeLessThan(home.indexOf('id={VISIT_ANCHOR_ID}'));
  });

  it('footer: its own row between the link columns and the address band', () => {
    const footer = read('src', 'components', 'layout', 'SiteFooter.tsx');
    const row = footer.indexOf('<SocialFollowFooterRow');
    expect(row).toBeGreaterThan(footer.indexOf("aria-label={isEs ? 'Enlaces legales' : 'Legal links'}"));
    expect(row).toBeLessThan(footer.indexOf('<address'));
    // Its own separator line on top; the address band's border-t closes it.
    expect(component).toMatch(/<nav\s+className="mt-4 border-t pt-4/);
    expect(component).toMatch(/justify-between/);
  });

  it('Contact: under the showroom details, never above the message form', () => {
    const panel = read('src', 'components', 'contact', 'VisitUsPanel.tsx');
    expect(panel.indexOf('<SocialFollowTiles')).toBeGreaterThan(panel.indexOf('{phoneHoursLabel(isEs)}'));
    const contact = read('src', 'app', '[locale]', 'contact', 'page.tsx');
    expect(contact).not.toMatch(/SocialFollow/);
  });

  it('About: under "Read what clients say on Google"', () => {
    const about = read('src', 'app', '[locale]', 'about', 'page.tsx');
    expect(about.indexOf('<SocialFollowTiles')).toBeGreaterThan(about.indexOf('Read what clients say on Google'));
    expect(about).toContain("'Follow Along'");
  });

  it('business cards: the official logos for all four, no hand-drawn glyphs', () => {
    const card = read('src', 'components', 'card', 'CardLanding.tsx');
    expect(card).toContain('SOCIAL_PROFILES.map(');
    expect(card).not.toMatch(/InstagramGlyph|FacebookGlyph/);
  });

  it('not on the call-first landing pages', () => {
    for (const page of [['free-evaluation', 'page.tsx'], ['sell', '[city]', 'page.tsx']]) {
      expect(read('src', 'app', '[locale]', ...page)).not.toMatch(/SocialFollow|SOCIAL_PROFILES/);
    }
  });
});
