import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import { HeroSection, PageContainer } from '@/components/layout/ResponsiveLayout';
import InquiryForm from '@/components/contact/InquiryForm';
import MessageUsForm from '@/components/contact/MessageUsForm';
import VisitUsPanel from '@/components/contact/VisitUsPanel';
import { getStoreHours } from '@/lib/store-hours';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Contáctenos — Envíe Su Artículo' : 'Contact Us — Submit Your Item',
    description: isEs
      ? 'Envíe fotos de joyería, oro, plata, relojes, monedas o antigüedades. Visítenos en 6240 Shirley St, Ste 104, Naples — en horario del salón o con cita. (239) 404-8505.'
      : 'Submit photos of jewelry, gold, silver, watches, coins, or antiques. Visit us at 6240 Shirley St, Ste 104, Naples — showroom hours or by appointment. Call or text (239) 404-8505.',
    path: '/contact',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ submitted?: string; item?: string }>;
}

export default async function ContactPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { submitted, item } = await searchParams;
  const isEs = locale === 'es';
  const isSubmitted = submitted === '1';
  const inquiryItem = item ? decodeURIComponent(item) : null;

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Contáctenos' : 'Contact Us', path: '/contact' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">
        <div className="max-w-4xl mx-auto px-6 md:px-8 pt-8">
          <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" align="center" />
        </div>

        {inquiryItem ? (
          <>
            {/* Hero is kept ONLY for the product-inquiry flow (reached from a product
                page), which needs the heading context. The normal contact page has no
                hero and opens directly with the "Message Us Directly" section. */}
            <HeroSection
              className="border-b text-center"
              style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}
            >
              <PageContainer max="narrow">
                <span
                  className="text-xs font-bold uppercase tracking-[0.4em]"
                  style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                >
                  {isEs ? 'Consulta de Artículo' : 'Item Inquiry'}
                </span>
                <h1
                  className="responsive-title-lg font-bold mt-4 mb-6 tracking-tight"
                  style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                >
                  {isEs ? 'Consultar Sobre Este Artículo' : 'Inquire About This Item'}
                </h1>
                <p className="responsive-copy max-w-2xl mx-auto" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {isEs
                    ? 'Déjenos su nombre y número de teléfono y nos comunicaremos pronto.'
                    : 'Leave your name and phone number and we\'ll be in touch shortly.'}
                </p>
                {!isSubmitted && (
                  <div className="responsive-actions justify-center mt-10">
                    <a href="#inquiry-form" className="gold-button">
                      {isEs ? 'Enviar mensaje' : 'Send a message'}
                    </a>
                    <a href="tel:2394048505" className="outline-button">
                      {isEs ? 'Llamar (239) 404-8505' : 'Call (239) 404-8505'}
                    </a>
                  </div>
                )}
              </PageContainer>
            </HeroSection>

            <div id="inquiry-form">
              <InquiryForm locale={locale} itemName={inquiryItem} submitted={isSubmitted} />
            </div>
          </>
        ) : (
          <MessageUsForm locale={locale} storeHours={await getStoreHours()} />
        )}

        {/* Visit Us — the contact page had no address, no hours and no map
            until 2026-08-17, only a call button and a form. It is the first
            place someone looks for "where are you", so it carries the full
            two-sentence wayfinding line rather than the compact one. */}
        <VisitUsPanel locale={locale} />

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
