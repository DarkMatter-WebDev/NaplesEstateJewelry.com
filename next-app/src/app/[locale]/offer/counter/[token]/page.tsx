import type { Metadata } from 'next';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import OfferCheckoutClient from '@/components/offers/OfferCheckoutClient';
import OfferUnavailable from '@/components/offers/OfferUnavailable';
import { createServiceClient } from '@/lib/supabase/service';
import { findCounterByToken, type CounterLookup } from '@/lib/offers-server';
import { formatOfferDeadline } from '@/lib/offers';
import { getProductImages } from '@/lib/sales';
import { parseFullName } from '@/lib/person-name';
import { hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';

interface Props {
  params: Promise<{ locale: string; token: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'es' ? 'Su contraoferta' : 'Your counter-offer',
    robots: { index: false, follow: false },
    // The token is the whole permission — never let it travel in a Referer.
    referrer: 'no-referrer',
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * /offer/counter/[token] — the private Buy-now link from a counter-offer email
 * (owner, 2026-10-15). One piece, the agreed price, paid at once through the
 * normal checkout route; the link works once and for 72 hours.
 */
export default async function CounterOfferPage({ params }: Props) {
  const { locale, token } = await params;
  const isEs = locale === 'es';

  let lookup: CounterLookup = { state: 'missing' };
  try {
    lookup = await findCounterByToken(createServiceClient(), decodeURIComponent(token));
  } catch (error) {
    console.error('Counter page lookup error:', error);
  }
  const pickupHoursLine = hoursLine(await getStoreHours(), isEs);

  let content;
  if (lookup.state === 'live') {
    const { offer, product } = lookup.counter;
    const name = parseFullName(offer.customer_name);
    const address = offer.shipping_address ?? {};
    content = (
      <OfferCheckoutClient
        mode="counter"
        locale={locale}
        paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null}
        pickupHoursLine={pickupHoursLine}
        item={{
          id: product.product.id,
          title: (isEs ? product.product.title_es : null) || product.product.title,
          image: getProductImages(product.product)[0] ?? null,
          listedPrice: product.listedPrice ?? offer.listed_price ?? offer.counter_amount ?? 0,
        }}
        counter={{
          token: decodeURIComponent(token),
          amount: offer.counter_amount ?? 0,
          until: formatOfferDeadline(offer.counter_expires_at, isEs),
          note: offer.counter_note,
          prefill: {
            first_name: name.first,
            last_name: name.last,
            email: offer.customer_email,
            phone: offer.customer_phone,
            shippingMethod: offer.shipping_method,
            address_line1: text(address.line1),
            address_line2: text(address.line2),
            city: text(address.city),
            state: text(address.state),
            postal_code: text(address.postal_code),
          },
        }}
      />
    );
  } else {
    const title = lookup.state === 'sold'
      ? (isEs ? 'Lo sentimos, esta pieza se vendió' : 'Sorry, this piece has sold')
      : lookup.state === 'used'
        ? (isEs ? 'Esta contraoferta ya se pagó' : 'This counter-offer has been paid')
        : (isEs ? 'Esta contraoferta ya no está disponible' : 'This counter-offer is no longer available');
    const body = lookup.state === 'used'
      ? (isEs ? 'Su recibo está en su correo electrónico.' : 'Your receipt is in your email.')
      : (isEs
          ? 'No se le ha cobrado nada. Llámenos si desea hablar de otra pieza o de una nueva oferta.'
          : 'You have not been charged. Call us if you would like to talk about this or another piece.');
    content = <OfferUnavailable isEs={isEs} title={title} body={body} productHref={null} />;
  }

  return (
    <>
      <SiteHeader />
      <main className="site-header-offset">{content}</main>
      <SiteFooter locale={locale} />
    </>
  );
}
