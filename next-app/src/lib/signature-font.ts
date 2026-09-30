import { Alex_Brush } from 'next/font/google';

/**
 * The cursive face for the owner's printed signature on the seller's copy of
 * a buy receipt (owner's pick, 2026-09-30: Alex Brush). Kept in its own
 * module so only the receipt paper pulls it in; nothing public loads it.
 */
export const signatureFont = Alex_Brush({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});
