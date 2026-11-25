import type { Metadata } from 'next';
import LegalPolicyPage from '@/components/legal/LegalPolicyPage';
import { getLegalMetadata } from '@/lib/legal-metadata';
import { getSpanishLegalCopy, spanishShippingSections } from '@/lib/spanish-legal-copy';
import { addressOneLine, hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getLegalMetadata('shipping', locale);
}

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function ShippingPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const spanishCopy = getSpanishLegalCopy('shipping', locale);
  // Admin-editable hours: the ES module constant froze the DEFAULT hours line
  // at import, so rebuild the ES sections with the live schedule here. Never
  // mutate the shared SPANISH_LEGAL_COPY object — the other legal pages read it.
  const schedule = await getStoreHours();
  const spanishSections = spanishCopy ? spanishShippingSections(hoursLine(schedule, true)) : null;

  return (
    <LegalPolicyPage
      locale={locale}
      path="/shipping"
      title={spanishCopy?.title ?? 'Shipping Policy'}
      updated={spanishCopy?.updated}
      intro={spanishCopy?.intro}
      sections={spanishSections ?? [
        {
          title: isEs ? 'Opciones de Entrega' : 'Fulfillment Options',
          bullets: [
            `Free local pickup at our showroom, ${addressOneLine()} — ${hoursLine(schedule, false)}.`,
            'Priority insured and express overnight insured shipping for eligible items.',
            'Every shipped order is fully insured for its purchase price.',
            'Items ship in discreet, unbranded packaging for your privacy and security.',
          ],
        },
        {
          title: isEs ? 'Garantía de Autenticidad' : 'Authenticity Guarantee',
          body: [
            'Every piece is guaranteed authentic and as described. If an item is ever materially misrepresented, our 5-day return guarantee applies — see the Returns & Refunds policy.',
          ],
        },
        {
          title: isEs ? 'Revisión de Dirección e Identidad' : 'Address and Identity Review',
          body: [
            'For high-value orders we may confirm your identity and shipping address before dispatch. This protects both you and us against fraud and the misdelivery of valuable items.',
          ],
        },
        {
          title: isEs ? 'Costos y Plazos de Envío' : 'Shipping Costs & Timing',
          body: [
            'Shipping options and costs are shown at checkout. A high-value order may need a specific insured-carrier arrangement; if so, we will contact you before shipping. We aim to dispatch confirmed orders promptly and share tracking once your item is on its way.',
          ],
        },
        {
          title: isEs ? 'Riesgo de Pérdida' : 'Risk of Loss',
          body: [
            'Because shipped orders are fully insured, a lost or damaged parcel is covered. Please inspect the packaging promptly on arrival and contact us immediately at (239) 404-8505 if there is any damage or delivery problem so we can file the claim.',
          ],
        },
        {
          title: isEs ? 'Destinos Restringidos' : 'Restricted Destinations',
          body: [
            'We may decline or cancel shipment to destinations where delivery, insurance, legal restrictions, or carrier limitations make safe fulfillment impractical.',
          ],
        },
      ]}
    />
  );
}
