import Image from 'next/image';

// Google's own colour wordmark (owner, 2026-11-01: "use the real google logo /
// word in its signature colors"). The file is Google's official SVG
// (Wikimedia Commons `Google_2015_logo.svg`), never redrawn — same rule as the
// social logos. Its alt is "Google", so a sentence reads the same with the
// image as with the word ("50+ Google reviews", "Read on Google").
//
// ⛔ ONCE PER SECTION (owner rule, 2026-11-01): "only use the color google
// logo once on each section … using it too much looks bad". Every other
// "Google" in the same section stays the plain word. See DECISIONS.md.
//
// Inline in running text: sized in `em` so it follows the surrounding type,
// and lowered so the letters sit on the text's baseline. An SVG is already
// sharp at any size, so it skips the image optimizer. `pill` sets it on a
// small white pill — for dark or gold backgrounds, where its blue/green or its
// yellow "o" would disappear.

export const GOOGLE_WORDMARK_SRC = '/assets/images/brands/google.svg';
/** Share of the wordmark's height below its letters' baseline (the "g" tail). */
export const GOOGLE_DESCENT_RATIO = (92 - 69.35) / 92;

export default function GoogleWordmark({
  height = '1.2em',
  pill = false,
  className = '',
}: {
  height?: string;
  pill?: boolean;
  className?: string;
}) {
  const image = (
    <Image
      src={GOOGLE_WORDMARK_SRC}
      alt="Google"
      width={272}
      height={92}
      unoptimized
      className={pill ? 'block w-auto' : `inline-block w-auto ${className}`}
      // The letters' baseline sits at y = 69.35 of the 92-unit viewBox (only
      // the "g" hangs below), so lowering the image by (92 − 69.35) / 92 of
      // its own height puts "Google" exactly on the text's baseline at any
      // size (owner, 2026-11-01: the logo "sits a little bit higher").
      style={pill ? { height } : { height, verticalAlign: `calc(${height} * ${-GOOGLE_DESCENT_RATIO})` }}
    />
  );
  if (!pill) return image;
  // Padding as shares of the logo's height. The letters ride high in the
  // image (the "g" tail fills its bottom 0.24), so the TOP gets that much
  // more padding — the letters, not the image, sit in the pill's middle.
  return (
    <span
      className={`inline-flex items-center rounded-full bg-white align-middle ${className}`}
      style={{
        paddingInline: `calc(${height} * 0.48)`,
        paddingTop: `calc(${height} * (0.17 + ${GOOGLE_DESCENT_RATIO}))`,
        paddingBottom: `calc(${height} * 0.17)`,
      }}
    >
      {image}
    </span>
  );
}
