import type { Metadata } from 'next';
import { OG_IMAGE, SITE_NAME, TITLE_SUFFIX } from '@/lib/seo';
import './globals.css';

// The <html>/<body> shell lives in [locale]/layout.tsx so `lang` can reflect the
// locale (en/es). This root layout is a passthrough that only owns global metadata
// and the globals.css import. The root not-found.tsx renders its own <html>.
// Brand FIRST, then the descriptor (owner, 2026-08-15). It previously ran
// "Sell Gold… | Naples Estate Jewelry", and Google routinely drops a trailing
// brand — it already prints the site name on its own line — so the result led
// with "Sell Gold" and never showed who we are. Leading with the brand is the
// one position Google will not strip.
//
// ⚠️ HOMEPAGE ONLY. The `template` below deliberately keeps the brand as a
// SUFFIX for interior pages: prefixing 24 characters there would push the part
// that actually distinguishes the page (a product name, a city) past Google's
// ~60-character display limit.
// "Sterling" was dropped 2026-08-15 to bring this to 65 characters, inside
// Google's ~60-char display so the trailing "in Naples, FL" — the local
// qualifier — stays visible instead of being truncated away. The term is not
// lost: it remains in this page's description, its visible copy, its JSON-LD,
// and in the /sell and /silver-services titles, which are the pages that should
// actually rank for it.
const SITE_TITLE = 'Naples Estate Jewelry - Sell Jewelry, Gold & Silver in Naples, FL';
const SITE_DESCRIPTION =
  'Naples gold, jewelry, and sterling silver buyer paying top dollar. We buy estate jewelry, gold, silver, diamonds, coins, and watches across Naples, Marco Island, Bonita Springs, Estero, Fort Myers & Cape Coral. Free appraisals at our Naples showroom or by appointment.';

export const metadata: Metadata = {
  title: {
    // Built from TITLE_SUFFIX so the <title> suffix and the one pageMetadata()
    // appends to og:title/twitter:title can never drift apart.
    template: `%s${TITLE_SUFFIX}`,
    default: SITE_TITLE,
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL('https://naplesestatejewelry.com'),
  // iOS Safari rewrites plain-text phone numbers (and dates/addresses) into
  // injected tel:/maps links BEFORE React hydrates, splitting server text
  // nodes and causing real hydration mismatches on iPhone/iPad (confirmed
  // live 2026-07-31 on the product-page trade-in line). Numbers we WANT
  // tappable are explicit <a href="tel:..."> links already.
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  // Defaults for every page that does NOT declare its own openGraph/twitter.
  // ⚠️ A page that declares either one REPLACES this block wholesale (Next
  // merges metadata shallowly), so it must re-declare siteName/type/images too.
  // The homepage does exactly that in order to localize; it imports the shared
  // constants below so the image path exists in one place only.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: 'https://naplesestatejewelry.com',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  // Google Search Console HTML-tag verification. The token is account-scoped,
  // so it verifies both the legacy https://naplesestatejewelry.co URL-prefix
  // property and the new https://naplesestatejewelry.com property (add the .com
  // property in Search Console after the domain switch deploys). Do not remove —
  // Search Console re-checks this tag periodically to keep properties verified.
  // Meta (2026-10-25): verifies naplesestatejewelry.com in the "Naples Estate
  // Jewelry" business portfolio (Business settings → Domains), which the
  // Instagram shop / product catalog requires. Public by design; Meta re-checks
  // it, so do not remove it while the catalog is in use.
  verification: {
    google: 'mOpCYI06DOHizh2_SK1_iWJ967utv2WO4T3OFmbLSsA',
    other: {
      'facebook-domain-verification': '6qraoa3bc9aa19chfta5mqr1cpbkkq',
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
