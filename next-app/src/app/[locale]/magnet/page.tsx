import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MagnetLanding, { magnetMetadata } from '@/components/magnet/MagnetLanding';
import { MAGNET_TRUCK_PHOTO } from '@/lib/magnet-landing';

/**
 * `/magnet` — the landing page behind the QR code on the vehicle magnets
 * (owner, 2026-11-23). The page itself is `MagnetLanding`.
 *
 * ⛔ HELD until the truck photo is set in `lib/magnet-landing.ts`: until then
 * the proxy keeps sending /magnet to /api/magnet (count + 302 to
 * /free-evaluation) and this route answers 404 for /en/magnet and /es/magnet.
 * Never indexed, never in the sitemap (guarded by `magnet-landing.test.ts`).
 */

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return magnetMetadata(locale);
}

export default async function MagnetPage({ params }: Props) {
  const { locale } = await params;
  if (!MAGNET_TRUCK_PHOTO) notFound();
  return <MagnetLanding locale={locale} truck={MAGNET_TRUCK_PHOTO} />;
}
