import { FACEBOOK_URL, INSTAGRAM_URL, NEXTDOOR_URL, TIKTOK_URL } from '@/lib/business-location';

// The four social accounts, in the order they appear everywhere (owner,
// 2026-11-01: homepage band, footer row, Contact, About, the business cards).
//
// The logos are each brand's OFFICIAL colour mark, from its own brand
// resources (owner: "use original logos … not drawn ones … use color"):
// Instagram gradient glyph + Facebook primary logo (Meta Brand Resource
// Center), TikTok icon (TikTok Developers logo pack), Nextdoor house in Lawn
// green (about.nextdoor.com/us-media). Only the transparent margin was trimmed
// and the mark scaled to 128 px WebP — ⛔ never recolour, redraw or reshape
// them (each brand's guidelines forbid it), and keep them smaller than our own
// brand. A "Follow us" row is the one context Meta allows Instagram and
// Facebook to sit beside other networks.
//
// The URLs live in business-location.ts, where they also feed `sameAs`.

export interface SocialProfile {
  /** Written exactly as each brand writes its own name. */
  name: 'Instagram' | 'Facebook' | 'TikTok' | 'Nextdoor';
  href: string;
  logo: string;
}

export const SOCIAL_PROFILES: readonly SocialProfile[] = [
  { name: 'Instagram', href: INSTAGRAM_URL, logo: '/assets/images/social/instagram.webp' },
  { name: 'Facebook', href: FACEBOOK_URL, logo: '/assets/images/social/facebook.webp' },
  { name: 'TikTok', href: TIKTOK_URL, logo: '/assets/images/social/tiktok.webp' },
  { name: 'Nextdoor', href: NEXTDOOR_URL, logo: '/assets/images/social/nextdoor.webp' },
];

/** Screen-reader name for a logo link ("opens in a new tab" because it does). */
export function socialLinkLabel(name: SocialProfile['name'], isEs: boolean): string {
  return isEs
    ? `Naples Estate Jewelry en ${name} (se abre en una pestaña nueva)`
    : `Naples Estate Jewelry on ${name} (opens in a new tab)`;
}
