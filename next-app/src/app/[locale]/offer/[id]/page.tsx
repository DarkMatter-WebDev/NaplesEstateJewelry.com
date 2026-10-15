import type { Metadata } from 'next';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import OfferCheckoutClient from '@/components/offers/OfferCheckoutClient';
import OfferUnavailable from '@/components/offers/OfferUnavailable';
import { createServiceClient } from '@/lib/supabase/service';
import { loadOfferProduct, type OfferProduct } from '@/lib/offers-server';
import { getProductImages } from '@/lib/sales';
import { hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

// Always live: the price, the item's status and its "Accept offers" box.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'es' ? 'Hacer una oferta' : 'Make an Offer',
    robots: { index: false, follow: false },
  };
}

/**
 * /offer/[id] — the buyer's "Make an Offer" page (owner, 2026-10-15). Only for
 * an item that is for sale, priced, and has its "Accept offers" box ticked.
 */
export default async function OfferPage({ params }: Props) {
  const { locale, id } = await params;
  const isEs = locale === 'es';
  const productId = decodeURIComponent(id);

  let loaded: OfferProduct | null = null;
  try {
    loaded = await loadOfferProduct(createServiceClient(), productId);
  } catch (error) {
    console.error('Offer page product load error:', error);
  }
  const productHref = `${isEs ? '/es' : ''}/shop/${encodeURIComponent(productId)}`;
  const pickupHoursLine = hoursLine(await getStoreHours(), isEs);

  return (
    <>
      <SiteHeader />
      <main className="site-header-offset">
        {loaded && loaded.acceptsOffers && loaded.purchasable && loaded.listedPrice ? (
          <OfferCheckoutClient
            mode="offer"
            locale={locale}
            paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null}
            pickupHoursLine={pickupHoursLine}
            item={{
              id: loaded.product.id,
              title: (isEs ? loaded.product.title_es : null) || loaded.product.title,
              image: getProductImages(loaded.product)[0] ?? null,
              listedPrice: loaded.listedPrice,
            }}
          />
        ) : (
          <OfferUnavailable
            isEs={isEs}
            title={isEs ? 'Esta pieza no acepta ofertas ahora' : "This piece isn't taking offers right now"}
            body={isEs
              ? 'Puede comprarla al precio publicado, o llamarnos y conversamos.'
              : 'You can buy it at the listed price, or call us and we can talk.'}
            productHref={loaded ? productHref : null}
          />
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
