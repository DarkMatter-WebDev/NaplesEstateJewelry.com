// Which pages show the phone contact bar (Call · Text · Directions).
//
// Owner-approved 2026-09-20 (mockup version B). The bar is for SELLERS, so it
// appears only on the pages a seller lands on — never on the homepage (its hero
// is budgeted to the pixel), the shop, checkout, account, the business-card
// pages or admin, where it would compete with the page's own action.
//
// ⛔ The bar is mounted once from the layout by this allow-list ON PURPOSE: the
// seller landers are the pages that rank, and this way their page files are
// never edited to carry it (`DECISIONS.md` → "Google Ads runs with NO site tag;
// the pages that rank are never edited for ads").

/** Seller sections. A section covers its own guide pages (`/gold-services/gold-marks`, …). */
export const CONTACT_BAR_SECTIONS = [
  '/gold-services',
  '/silver-services',
  '/estate-jewelry',
  '/estate-services',
  '/bullion',
  '/sell',
  '/free-evaluation',
  '/diamond-buyers',
  '/watch-buyers',
  '/jewelry-appraisal',
] as const;

/**
 * `/es/sell/naples` → `/sell/naples`. Also strips `/en`: during prerender the
 * pathname can carry the internal default-locale segment that the browser URL
 * never shows, and the server and client must agree or React re-renders.
 */
export function stripLocalePrefix(pathname: string): string {
  const path = pathname.replace(/^\/(en|es)(?=\/|$)/, '');
  return path === '' ? '/' : path;
}

export function showsContactBar(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = stripLocalePrefix(pathname).replace(/\/+$/, '') || '/';
  return CONTACT_BAR_SECTIONS.some((section) => path === section || path.startsWith(`${section}/`));
}
