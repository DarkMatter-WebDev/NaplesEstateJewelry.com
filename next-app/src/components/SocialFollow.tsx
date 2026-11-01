import Image from 'next/image';
import { SOCIAL_PROFILES, socialLinkLabel } from '@/lib/social-links';

// "Follow Us" links to the four social accounts (owner, 2026-11-01, mockups
// 1–2). Server-rendered, no client JS. Two shapes:
//  - SocialFollowTiles: eyebrow + logo-and-name pills — homepage band above
//    "Visit Us", Contact (showroom column), About (closing section).
//  - SocialFollowFooterRow: the footer's own full-width row of logos between
//    two separator lines, spread across most of the width.
// The logos are the brands' official marks — see lib/social-links.ts before
// touching them.

/** Gold eyebrow with rules, the same as the homepage's "Visit Us" label. */
function Eyebrow({ label, align }: { label: string; align: 'center' | 'start' }) {
  return (
    <p
      className={`flex items-center gap-3 text-[0.65rem] font-bold uppercase tracking-[0.32em] ${align === 'center' ? 'justify-center' : 'justify-start'}`}
      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
    >
      <span aria-hidden="true" className="inline-block h-px w-8 flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
      {label}
      {align === 'center' && (
        <span aria-hidden="true" className="inline-block h-px w-8 flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
      )}
    </p>
  );
}

export function SocialFollowTiles({
  isEs,
  label,
  align = 'center',
  twoColumn = false,
  lede,
  className = '',
}: {
  isEs: boolean;
  label: string;
  /** One line under the eyebrow (homepage only). */
  lede?: string;
  align?: 'center' | 'start';
  /** Always a 2 × 2 grid (a narrow column, e.g. Contact); otherwise one row from md up. */
  twoColumn?: boolean;
  className?: string;
}) {
  const list = twoColumn
    ? 'grid w-full max-w-[22rem] grid-cols-2 gap-2.5'
    : `grid w-full max-w-[22rem] grid-cols-2 gap-2.5 md:flex md:w-auto md:max-w-none md:flex-wrap md:gap-3 ${align === 'center' ? 'md:justify-center' : ''}`;
  return (
    <div className={className}>
      <Eyebrow label={label} align={align} />
      {lede && (
        <p className="mx-auto mt-3 max-w-[34rem] text-[0.95rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
          {lede}
        </p>
      )}
      <ul className={`mt-5 ${list} ${align === 'center' ? 'mx-auto' : ''}`}>
        {SOCIAL_PROFILES.map((profile) => (
          <li key={profile.name}>
            <a
              href={profile.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={socialLinkLabel(profile.name, isEs)}
              className={`lift-tile flex items-center gap-2.5 rounded-full border py-2 pl-2.5 pr-4 text-[0.85rem] font-bold no-underline ${twoColumn ? '' : 'md:inline-flex'}`}
              style={{
                background: 'var(--color-surface-container-lowest)',
                borderColor: 'var(--color-outline-variant)',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-label)',
                boxShadow: '0 8px 20px rgba(38, 28, 6, 0.04)',
              }}
            >
              <Image src={profile.logo} alt="" width={28} height={28} unoptimized className="h-7 w-7 flex-shrink-0" />
              {profile.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SocialFollowFooterRow({ isEs }: { isEs: boolean }) {
  return (
    <nav
      className="mt-4 border-t pt-4 text-center md:mt-10 md:pt-6"
      style={{ borderColor: 'var(--color-outline-variant)' }}
      aria-label={isEs ? 'Redes sociales' : 'Social media'}
    >
      <p
        className="mb-3.5 text-[0.6rem] font-bold uppercase tracking-[0.3em] md:mb-[1.125rem]"
        style={{ fontFamily: 'var(--font-label)', color: 'var(--color-on-surface-variant)' }}
      >
        {isEs ? 'Síganos' : 'Follow Us'}
      </p>
      <ul className="mx-auto flex w-[84%] max-w-[60rem] items-center justify-between md:w-[80%]">
        {SOCIAL_PROFILES.map((profile) => (
          <li key={profile.name}>
            <a
              href={profile.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={socialLinkLabel(profile.name, isEs)}
              title={profile.name}
              className="lift-icon block"
            >
              <Image src={profile.logo} alt="" width={40} height={40} unoptimized className="h-[34px] w-[34px] md:h-10 md:w-10" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
