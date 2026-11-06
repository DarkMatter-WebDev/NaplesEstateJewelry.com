import type { Metadata } from 'next';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import AvailabilityRequestClient from '@/components/offers/AvailabilityRequestClient';
import OfferUnavailable from '@/components/offers/OfferUnavailable';
import { createServiceClient } from '@/lib/supabase/service';
import { loadOfferProduct, type OfferProduct } from '@/lib/offers-server';
import { getProductImages } from '@/lib/sales';
import { formatCheckoutCurrency } from '@/lib/checkout-pricing';

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

// Always live: the price, the item's status and its "Confirm availability first" box.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'es' ? 'Consultar disponibilidad' : 'Check Availability',
    robots: { index: false, follow: false },
  };
}

/**
 * /availability/[id] — Check Availability (owner, 2026-11-05, mockup 1). Only
 * for an item that is for sale, priced, and has its "Confirm availability
 * first" box ticked. A short form, no payment; the owner answers by email with
 * a private Buy link or a "this piece has sold".
 */
export default async function AvailabilityPage({ params }: Props) {
  const { locale, id } = await params;
  const isEs = locale === 'es';
  const productId = decodeURIComponent(id);

  let loaded: OfferProduct | null = null;
  try {
    loaded = await loadOfferProduct(createServiceClient(), productId);
  } catch (error) {
    console.error('Availability page product load error:', error);
  }
  const productHref = `${isEs ? '/es' : ''}/shop/${encodeURIComponent(productId)}`;
  const ready = loaded && loaded.confirmAvailability && loaded.purchasable && loaded.listedPrice;

  return (
    <>
      <SiteHeader />
      <main className="site-header-offset">
        {ready && loaded ? (
          <AvailabilityRequestClient
            locale={locale}
            item={{
              id: loaded.product.id,
              title: (isEs ? loaded.product.title_es : null) || loaded.product.title,
              image: getProductImages(loaded.product)[0] ?? null,
              price: formatCheckoutCurrency(loaded.listedPrice ?? 0),
            }}
          />
        ) : loaded && !loaded.confirmAvailability && loaded.purchasable ? (
          <OfferUnavailable
            isEs={isEs}
            title={isEs ? 'Esta pieza está lista para comprar' : 'This piece is ready to buy'}
            body={isEs
              ? 'No hace falta preguntar: puede agregarla al carrito en su página.'
              : 'No need to ask — you can add it to your cart on its page.'}
            productHref={productHref}
          />
        ) : (
          <OfferUnavailable
            isEs={isEs}
            title={isEs ? 'Esta pieza ya no está disponible' : 'This piece is no longer available'}
            body={isEs
              ? 'Llámenos o envíenos un texto y le ayudamos a encontrar una pieza similar.'
              : 'Call or text us and we’ll help you find a similar piece.'}
            productHref={loaded ? productHref : null}
          />
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
