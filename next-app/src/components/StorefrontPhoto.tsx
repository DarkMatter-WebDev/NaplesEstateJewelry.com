import Image from 'next/image';

/**
 * The storefront photograph — the one picture that answers "which door?".
 *
 * Owner, 2026-09-08: "add this storefront pic somewhere in the 'come see us
 * today' areas … to help guide customers to the right unit." Mockup-approved
 * placements: the homepage Visit Us block (beside the map, 4:3), the contact
 * page Visit Us panel (above the map), the Naples city page's showroom band
 * (above "What to bring") and a 16:9 thumbnail on `/card` under the address.
 *
 * ⛔ No caption anywhere (owner's call). The picture does the explaining; the
 * alt text below carries the same cues for screen readers and for Google
 * Images: the orange building, the white balcony, Suite 104 as the centre
 * glass door, the 104 painted on the curb. The neighbouring business's name
 * is visible on the door sign in the photo but is not written here — it was
 * retired from these surfaces on 2026-08-23 (DECISIONS.md).
 *
 * One component so the file name, alt text and framing stay identical on
 * every surface; a changed photo gets a NEW file name (next/image and the
 * Netlify CDN cache by URL — DECISIONS.md → "A changed photo gets a new file
 * name").
 */
type Props = {
  locale?: string;
  /**
   * Frame shape. `4:3` is the photo's natural shape; the others crop it.
   * `2:1` is the `/card` thumbnail since 2026-09-24: the height it gave up
   * (about 21px at 375px) paid for the email line above the buttons, so the
   * page stayed exactly as tall as before (owner: "crop or shorten the store
   * photo … so that the line does not add height to the entire page").
   */
  aspect?: '4:3' | '16:9' | '2:1' | '1:1';
  /** Accurate `sizes` for the slot — every fill image on this site carries one. */
  sizes: string;
  className?: string;
  /** Only the homepage may set this; everywhere else the photo is below the fold. */
  priority?: boolean;
};

const ASPECT: Record<NonNullable<Props['aspect']>, string> = {
  '4:3': '4 / 3',
  '16:9': '16 / 9',
  '2:1': '2 / 1',
  '1:1': '1 / 1',
};

/** 1600×1200 WebP, encoded 2026-09-08 from the owner's photo (sharp, q74). */
export const STOREFRONT_PHOTO_SRC = '/assets/images/pages/showroom-storefront.webp';

export default function StorefrontPhoto({ locale = 'en', aspect = '4:3', sizes, className = '', priority = false }: Props) {
  const isEs = locale === 'es';
  const alt = isEs
    ? 'Fachada del salón: edificio naranja de dos pisos con balcón blanco; la Suite 104 es la puerta de vidrio del centro, en la planta baja, con el 104 pintado en el bordillo.'
    : 'The showroom from the parking lot: an orange two-story building with a white balcony; Suite 104 is the center glass door on the ground floor, with 104 painted on the curb.';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${className}`}
      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)', aspectRatio: ASPECT[aspect] }}
    >
      <Image
        src={STOREFRONT_PHOTO_SRC}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // The door and the curb number sit in the lower half of the frame, so
        // any crop keeps the bottom and trims the sky/balcony top instead.
        className="object-cover"
        style={{ objectPosition: aspect === '4:3' ? '50% 50%' : '50% 65%' }}
      />
    </div>
  );
}
