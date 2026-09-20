'use client';

import { usePathname } from 'next/navigation';
import { AppIcon } from '@/components/AppIcon';
import { showsContactBar } from '@/lib/contact-bar-paths';
import { CONTACT_PHONE_DISPLAY, TEL_HREF, directionsHref, sellerTextBody, smsHref } from '@/lib/contact-links';

/**
 * Phone contact bar — Call · Text · Directions, fixed to the bottom of the
 * seller pages on phones (owner-approved mockup, version B, 2026-09-20).
 *
 * Why: sellers reach the shop by walking in, calling, the form or a text; on a
 * phone the three fastest of those should always be one thumb away. Directions
 * is here because walk-ins have been the strongest channel.
 *
 * - Mounted ONCE in `[locale]/layout.tsx`; `showsContactBar` decides the pages,
 *   so no ranking page file is edited to carry it.
 * - `position: fixed` → no layout shift. The page's bottom padding and the
 *   cookie notice's lift are in `globals.css` (`[data-mobile-contact-bar]`),
 *   resolved with `:has()` so nothing here needs JavaScript or a flash.
 * - z-30: above page content, below the header, the drawers (40/50) and the
 *   cookie notice (70).
 * - Links come from `contact-links.ts` — the owner's cell, never the text-deals
 *   number. Spanish says "Llegar": "Cómo llegar" does not fit three across at
 *   320px.
 */
export default function MobileContactBar({ locale }: { locale: string }) {
  const pathname = usePathname();
  if (!showsContactBar(pathname)) return null;

  const isEs = locale === 'es';

  return (
    <nav
      data-mobile-contact-bar
      className="mobile-contact-bar md:hidden"
      aria-label={isEs ? 'Contacto rápido' : 'Quick contact'}
    >
      <a href={TEL_HREF} className="mobile-contact-bar-call" aria-label={`${isEs ? 'Llamar' : 'Call'} ${CONTACT_PHONE_DISPLAY}`}>
        <AppIcon name="call" className="text-[1rem]" />
        {isEs ? 'Llamar' : 'Call'}
      </a>
      <a href={smsHref(sellerTextBody(isEs))} aria-label={`${isEs ? 'Enviar un mensaje de texto al' : 'Text'} ${CONTACT_PHONE_DISPLAY}`}>
        <AppIcon name="sms" className="text-[1rem]" />
        {isEs ? 'Texto' : 'Text'}
      </a>
      <a href={directionsHref()} target="_blank" rel="noopener noreferrer" aria-label={isEs ? 'Cómo llegar al salón' : 'Directions to the showroom'}>
        <AppIcon name="location_on" className="text-[1rem]" />
        {isEs ? 'Llegar' : 'Directions'}
      </a>
    </nav>
  );
}
