import Image from 'next/image';

/**
 * The storefront photograph — the one picture that answers "which door?".
 *
 * Owner, 2026-09-08: "add this storefront pic somewhere in the 'come see us
 * today' areas … to help guide customers to the right unit." Mockup-approved
 * placements: the homepage Visit Us block (beside the map), the contact page
 * Visit Us panel (above the map), the Naples city page's showroom band (above
 * "What to bring") and a short strip on `/card` under the address.
 *
 * The photo was replaced on 2026-10-03 (owner; three mockups): the new one
 * shows the Naples Estate Jewelry signs — in the window and by the bench — and
 * the teal unit on the left and the bright green one on the right, "for better
 * visual recognition". Those two colours are the point of the picture, so it
 * is shown at its natural wide shape everywhere except the `/card` strip, and
 * there is deliberately no square frame any more: a square cuts both
 * neighbours off (that is why the homepage pair went from two squares to a
 * wide photo beside the square map).
 *
 * ⛔ No caption anywhere (owner's call). The picture does the explaining; the
 * alt text below carries the same cues for screen readers and for Google
 * Images: the orange building, the white balcony, the teal and green
 * neighbours, Suite 104 as the centre glass door, our signs. The curb number
 * is not in the alt text any more — the owner's straightened photo cuts it at
 * the bottom edge. The neighbouring business's name is visible on the door
 * sign in the photo but is not written here — it was retired from these
 * surfaces on 2026-08-23 (DECISIONS.md).
 *
 * One component so the file name, alt text and framing stay identical on
 * every surface; a changed photo gets a NEW file name (next/image and the
 * Netlify CDN cache by URL — DECISIONS.md → "A changed photo gets a new file
 * name").
 */
type Props = {
  locale?: string;
  /**
   * Frame shape. `4:3` is the photo's natural shape (it is 1552×1142, so
   * under 1% comes off each side). `2:1` is the `/card` strip since
   * 2026-09-24: the height it gave up (about 21px at 375px) paid for the email
   * line above the buttons, so the page stayed exactly as tall as before
   * (owner: "crop or shorten the store photo … so that the line does not add
   * height to the entire page").
   */
  aspect?: '4:3' | '2:1';
  /** Accurate `sizes` for the slot — every fill image on this site carries one. */
  sizes: string;
  className?: string;
  /** Only the homepage may set this; everywhere else the photo is below the fold. */
  priority?: boolean;
};

const ASPECT: Record<NonNullable<Props['aspect']>, string> = {
  '4:3': '4 / 3',
  '2:1': '2 / 1',
};

/**
 * Where the crop sits. The strip keeps the BOTTOM of the photo — the ground
 * floor: the door, both signs, the neon OPEN — and trims the balcony and the
 * upper windows (approved in the 2026-10-03 mockup).
 */
const POSITION: Record<NonNullable<Props['aspect']>, string> = {
  '4:3': '50% 50%',
  '2:1': '50% 100%',
};

/** 1552×1142 WebP, encoded 2026-10-03 from the owner's straightened photo (sharp, q82 → 288 KB). */
export const STOREFRONT_PHOTO_SRC = '/assets/images/pages/showroom-storefront-v2.webp';

export default function StorefrontPhoto({ locale = 'en', aspect = '4:3', sizes, className = '', priority = false }: Props) {
  const isEs = locale === 'es';
  const alt = isEs
    ? 'Fachada del salón: edificio naranja de dos pisos con balcón blanco, entre un local turquesa y otro verde brillante; la Suite 104 es la puerta de vidrio del centro, en la planta baja, con letreros de Naples Estate Jewelry en la ventana y junto al banco.'
    : 'The showroom from the parking lot: an orange two-story building with a white balcony, between a teal unit and a bright green one; Suite 104 is the center glass door on the ground floor, with Naples Estate Jewelry signs in the window and by the bench.';

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
        className="object-cover"
        style={{ objectPosition: POSITION[aspect] }}
      />
    </div>
  );
}
