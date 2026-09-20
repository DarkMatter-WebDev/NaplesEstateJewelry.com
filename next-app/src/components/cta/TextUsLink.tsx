import type { CSSProperties, ReactNode } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { sellerTextBody, smsHref } from '@/lib/contact-links';

/**
 * A link that opens a text message to the shop (owner-approved mockup,
 * 2026-09-20).
 *
 * Why: four places on the site said "call or text" but only ever dialled. The
 * existing wording and call links stay; this sits beside them.
 *
 * - The number comes from `contact-links.ts` — the owner's cell, never the
 *   toll-free text-deals number.
 * - `opening="seller"` prefills "Hi, I have something I'd like to sell. Sending
 *   photos:" — use it on seller pages only. Buyer and mixed surfaces (product
 *   pages, the homepage, the menu) open an empty message.
 * - No `'use client'`: it is a plain anchor, usable from server and client
 *   components alike.
 */
export default function TextUsLink({
  isEs,
  children,
  opening = 'none',
  icon = true,
  className,
  style,
}: {
  isEs: boolean;
  children: ReactNode;
  opening?: 'seller' | 'none';
  icon?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <a href={smsHref(opening === 'seller' ? sellerTextBody(isEs) : undefined)} className={className} style={style}>
      {icon && <AppIcon name="sms" className="text-[1rem]" />}
      {children}
    </a>
  );
}
