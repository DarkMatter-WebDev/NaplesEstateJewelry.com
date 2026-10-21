import type { Metadata } from 'next';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import OfferUnavailable from '@/components/offers/OfferUnavailable';
import PayInvoiceClient, { type PayInvoiceData } from '@/components/pay/PayInvoiceClient';
import { createServiceClient } from '@/lib/supabase/service';
import { findRemoteInvoiceByToken, payOptionsOf, type RemoteInvoiceBundle } from '@/lib/remote-sale-server';
import { formatRemoteDue, remoteOtherWays } from '@/lib/remote-sale';
import { parseFullName } from '@/lib/person-name';
import { formatPublicPurity } from '@/types/sales';
import { isProductPurchasable } from '@/types/product';

interface Props {
  params: Promise<{ locale: string; token: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'es' ? 'Su factura' : 'Your invoice',
    robots: { index: false, follow: false },
    // The token is the whole permission — never let it travel in a Referer.
    referrer: 'no-referrer',
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * /pay/[token] — the private Pay online link in a remote-sale invoice email
 * (owner, mockup v2, 2026-10-21). Shows the invoice and the PayPal buttons
 * while it is open; otherwise a calm "paid / expired / cancelled / sold" card.
 * Nothing is reserved: if a listed piece sold since the invoice went out, the
 * page says so and takes no money.
 */
export default async function PayInvoicePage({ params }: Props) {
  const { locale, token } = await params;
  const isEs = locale === 'es';

  const service = createServiceClient();
  let found: RemoteInvoiceBundle | null = null;
  try {
    found = await findRemoteInvoiceByToken(service, decodeURIComponent(token));
  } catch (error) {
    console.error('Pay page lookup error:', error);
  }

  let soldPiece = false;
  if (found && found.state === 'open') {
    const listedIds = found.items.flatMap((item) => (item.product_id ? [item.product_id] : []));
    if (listedIds.length > 0) {
      const { data: products } = await service.from('products').select('id, status, quantity').in('id', listedIds);
      soldPiece = (products ?? []).length !== listedIds.length
        || (products ?? []).some((p) => !isProductPurchasable(p.status as string, p.quantity as number | null));
    }
  }

  let content;
  if (found && found.state === 'open' && found.invoice.pay_online && !soldPiece) {
    const { invoice, order, items } = found;
    const name = parseFullName(order.customer_name);
    const address = order.shipping_address ?? {};
    const data: PayInvoiceData = {
      token: invoice.pay_token,
      orderNumber: order.order_number,
      due: formatRemoteDue(invoice.expires_at, isEs),
      items: items.map((item) => ({
        id: item.id,
        title: item.title_snapshot,
        detail: [
          item.inventory_number ? `#${item.inventory_number}` : null,
          item.purity_snapshot ? formatPublicPurity(item.purity_snapshot) : null,
          item.gram_weight_snapshot ? `${item.gram_weight_snapshot} g` : null,
        ].filter(Boolean).join(' · '),
        image: item.image_snapshot,
        price: Number(item.price_snapshot),
      })),
      subtotal: Number(order.subtotal),
      shippingFee: Number(order.shipping_fee),
      ships: order.shipping_method === 'shipping',
      shippingLabel: Number(order.shipping_fee) > 0 ? (isEs ? 'Envío' : 'Shipping') : (isEs ? 'Envío · sin cargo' : 'Shipping · no charge'),
      otherWays: remoteOtherWays({ ...payOptionsOf(invoice), online: false }, order.order_number),
      message: invoice.message,
      prefill: {
        first_name: name.first,
        last_name: name.last,
        email: order.customer_email ?? '',
        phone: order.customer_phone ?? '',
        address_line1: text(address.line1),
        address_line2: text(address.line2),
        city: text(address.city),
        state: text(address.state),
        postal_code: text(address.postal_code),
      },
    };
    content = <PayInvoiceClient data={data} locale={locale} paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null} />;
  } else {
    const state = !found ? 'missing' : soldPiece ? 'sold' : found.state === 'open' ? 'offline' : found.state;
    const title = state === 'paid'
      ? (isEs ? 'Esta factura ya está pagada' : 'This invoice has been paid')
      : state === 'sold'
        ? (isEs ? 'Lo sentimos, una pieza se vendió' : 'Sorry, a piece on this invoice has sold')
        : state === 'expired'
          ? (isEs ? 'Este enlace de pago venció' : 'This payment link has expired')
          : state === 'offline'
            ? (isEs ? 'Esta factura se paga fuera de línea' : 'This invoice is paid offline')
            : (isEs ? 'Esta factura ya no está disponible' : 'This invoice is no longer available');
    const body = state === 'paid'
      ? (isEs ? 'Su recibo está en su correo electrónico. ¡Gracias!' : 'Your receipt is in your email. Thank you!')
      : state === 'expired'
        ? (isEs ? 'No se le ha cobrado nada. Llámenos y se lo enviamos de nuevo.' : 'You have not been charged. Call us and we will send it again.')
        : state === 'offline'
          ? (isEs ? 'Las formas de pagar están en el correo de la factura. Llámenos si tiene preguntas.' : 'The ways to pay are in the invoice email. Call us with any questions.')
          : (isEs ? 'No se le ha cobrado nada. Llámenos si desea hablar de esta u otra pieza.' : 'You have not been charged. Call us if you would like to talk about this or another piece.');
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
