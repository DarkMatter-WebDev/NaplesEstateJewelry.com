import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import { PageContainer, Section } from '@/components/layout/ResponsiveLayout';
import ShowroomAddress from '@/components/ShowroomAddress';
import ShowroomHours from '@/components/ShowroomHours';
import CopyAddressButton from '@/components/CopyAddressButton';
import { SocialFollowTiles } from '@/components/SocialFollow';
import { mapsUrl, wayfindingSentence } from '@/lib/business-location';
import GoogleWordmark from '@/components/GoogleWordmark';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Sobre Chris — Comprador de Joyería en Naples'
      : 'About Chris — Naples Estate Jewelry Buyer',
    description: isEs
      ? 'Conozca a Chris, especialista en joyería de patrimonio y antigüedades con más de 15 años en Naples. Visítenos en nuestro salón de Naples o con cita privada.'
      : 'Meet Chris, Naples estate jewelry and antiques specialist with 15+ years in Southwest Florida. Visit our Naples showroom or book a private appointment.',
    path: '/about',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Sobre Chris' : 'About Chris', path: '/about' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative overflow-hidden pt-12 pb-16 md:pt-16 md:pb-24 border-b border-white/5">
          <div className="absolute inset-0 z-0">
            <Image
              src="/assets/images/pages/trust.webp"
              alt=""
              fill
              sizes="100vw"
              priority
              className="object-cover"
              style={{ objectPosition: 'center 76%' }}
            />
            <div className="absolute inset-0 bg-black/50" />
          </div>
          <PageContainer max="narrow" className="text-center relative z-10">
            <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="dark" align="center" />
            <span
              className="text-xs font-bold uppercase tracking-[0.4em]"
              style={{ color: '#f2ca50', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Nosotros' : 'About'}
            </span>
            <h1
              className="responsive-title-lg text-white font-bold mt-4 mb-6 tracking-tight"
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {isEs
                ? 'Una Herencia de Confianza en el Suroeste de Florida'
                : 'A Heritage of Trust in Southwest Florida'}
            </h1>
            <p className="responsive-copy italic max-w-2xl mx-auto" style={{ color: '#d8d1c2' }}>
              {isEs
                ? 'Nacido y criado en Naples, Chris ha pasado más de 15 años trabajando en privado con familias locales para adquirir joyería fina, plata esterlina, antigüedades, oro y colecciones heredadas.'
                : 'Born and raised in Naples, Chris has spent 15+ years working privately with local families to acquire fine jewelry, sterling silver, antiques, gold, and inherited collections.'}
            </p>
          </PageContainer>
        </section>

        {/* Meet Chris */}
        <Section
          style={{ background: 'var(--color-surface-container-low)' }}
        >
          <PageContainer max="content">
            <div className="grid gap-[clamp(2rem,5vw,4rem)] md:grid-cols-2 md:items-center">
              <div className="w-full">
                <div className="relative">
                  <div
                    className="absolute -top-10 -left-10 w-32 h-32 rounded-full blur-3xl"
                    style={{ background: 'var(--color-primary)', opacity: 0.1 }}
                  />
                  <Image
                    src="/assets/images/pages/chris-owner.webp"
                    alt={isEs ? 'Chris de Naples Estate Jewelry' : 'Chris of Naples Estate Jewelry'}
                    width={520}
                    height={600}
                    className="relative z-10 mx-auto w-full max-w-[520px] rounded-2xl object-cover shadow-2xl md:scale-105 md:-rotate-2"
                  />
                </div>
              </div>

              <div className="w-full">
                <h2
                  className="responsive-title-md font-bold mb-8 tracking-tight"
                  style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                >
                  {isEs ? 'Conozca a Chris' : 'Meet Chris'}
                </h2>
                <div
                  className="space-y-5 leading-relaxed text-lg"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  <p>
                    {isEs ? (
                      <>Nacido y criado en Naples, Chris ha pasado <strong style={{ color: 'var(--color-primary)' }}>más de 15 años</strong> trabajando directamente con clientes privados en todo el suroeste de Florida para adquirir joyería fina, <Link href="/es/silver-services" className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>plata esterlina</Link>, antigüedades, oro y colecciones heredadas.</>
                    ) : (
                      <>Born and raised in Naples, Chris has spent <strong style={{ color: 'var(--color-primary)' }}>15+ years</strong> working directly with private clients throughout Southwest Florida to acquire fine jewelry, <Link href="/silver-services" className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>sterling silver</Link>, antiques, gold, and inherited collections.</>
                    )}
                  </p>
                  <p>
                    {isEs
                      ? 'Al mantener un solo salón compartido y trabajar en gran medida con cita, mantenemos los gastos generales bajos y trasladamos esos ahorros como algunos de los pagos más competitivos de la región. Cada consulta se maneja de forma personal y confidencial - sin presión, sin intermediarios y sin obligación.'
                      : 'By keeping to one small shared showroom and working largely by appointment, we keep overhead low and pass those savings on as some of the most competitive payouts in the region. Every consultation is handled personally and confidentially - no pressure, no middlemen, and no obligation.'}
                  </p>
                  <p>
                    {isEs
                      ? 'Ya sea que esté pensando en vender una sola reliquia familiar o liquidar un patrimonio multigeneracional, Chris aporta un enfoque discreto e informado a cada conversación.'
                      : 'Whether you\'re considering selling a single heirloom or liquidating a multi-generational estate, Chris brings a discreet, informed approach to every conversation.'}
                  </p>
                </div>

                <div className="mt-10 grid grid-cols-1 gap-5 min-[390px]:grid-cols-2 md:gap-6">
                  {[
                    { stat: '15+', label: isEs ? 'Años de Experiencia' : 'Years Experience' },
                    { stat: '100%', label: isEs ? 'Privado y Confidencial' : 'Private & Confidential' },
                    { stat: isEs ? 'Mismo Día' : 'Same-Day', label: isEs ? 'Pago Disponible' : 'Payment Available' },
                    { stat: isEs ? 'Salón' : 'Showroom', label: isEs ? 'Abierto en Naples' : 'Open in Naples' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="border-l-2 pl-4"
                      style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 40%, transparent)' }}
                    >
                      <div
                        className="text-3xl font-bold"
                        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}
                      >
                        {item.stat}
                      </div>
                      <div
                        className="text-sm uppercase tracking-wider mt-1"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PageContainer>
        </Section>


        {/* Showroom.
            The About page carried no address at all, and mentioned the store
            only in passing inside a paragraph about overhead ("one small shared
            showroom"), which reads as an explanation of pricing rather than an
            invitation. This section states the plain fact — there is a room,
            here is where it is, you may come in.

            ⚠️ Every string comes from lib/business-location.ts. Do not retype
            the address here; NAP consistency is a ranking factor and this is
            exactly the kind of page where a stale suite number survives. */}
        <Section>
          <PageContainer max="narrow" className="text-center">
            <span
              className="text-xs font-bold uppercase tracking-[0.4em]"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Visítenos' : 'Visit Us'}
            </span>
            <h2
              className="responsive-title-md font-bold mt-4 mb-6 tracking-tight"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              {isEs ? 'Ahora Tenemos Salón en Naples' : 'We Now Have a Naples Showroom'}
            </h2>
            <div
              className="space-y-5 leading-relaxed text-lg"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              <p>
                {isEs
                  ? 'Durante años trabajamos únicamente con cita y visitas a domicilio. Ahora también puede vernos en persona: tenemos un salón en Naples donde puede traer sus piezas, recibir una evaluación gratuita y cobrar el mismo día.'
                  : 'For years we worked by appointment and home visit only. Now you can also see us in person — we keep a showroom in Naples where you can bring your pieces in, get a free evaluation, and be paid the same day.'}
              </p>
              <p>{wayfindingSentence(isEs)}</p>
              <p>
                {isEs
                  ? 'Y si tiene un patrimonio grande o prefiere no transportar objetos de valor, Chris sigue acudiendo a su domicilio a pedido, en todo el suroeste de Florida.'
                  : 'And if you have a larger estate, or would rather not transport valuables, Chris still comes to you on request, anywhere in Southwest Florida.'}
              </p>
            </div>

            <div
              className="mt-10 inline-flex flex-col gap-3 border-t border-b py-4"
              style={{ borderColor: 'var(--color-outline-variant)' }}
            >
              <span
                className="text-[0.6875rem] font-bold uppercase tracking-[0.3em]"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'Horario' : 'Hours'}
              </span>
              <ShowroomHours locale={locale} className="responsive-copy" />
            </div>

            {/* Copy button is a SIBLING of the maps link — a <button> inside an
                <a> is invalid HTML and browsers break one of the two. */}
            <div
              className="mt-8 flex items-start justify-center gap-2 text-sm"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              <a
                href={mapsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="hover-underline-grow"
                style={{ color: 'inherit' }}
              >
                <ShowroomAddress locale={locale} />
              </a>
              <CopyAddressButton locale={locale} />
            </div>

            <div className="responsive-actions justify-center mt-8">
              <a href={mapsUrl()} target="_blank" rel="noopener noreferrer" className="gold-button">
                {isEs ? 'Cómo llegar' : 'Get directions'}
              </a>
              <Link href={isEs ? '/es/contact' : '/contact'} className="outline-button">
                {isEs ? 'Ver mapa y contacto' : 'See the map and contact us'}
              </Link>
            </div>
          </PageContainer>
        </Section>

        {/* CTA */}
        <Section
          style={{ background: 'var(--color-surface-container-low)' }}
        >
          <PageContainer max="narrow" className="text-center">
            <h2
              className="responsive-title-lg font-bold mb-6 tracking-tight"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              {isEs ? '¿Listo para Comenzar una Conversación?' : 'Ready to Start a Conversation?'}
            </h2>
            <p className="text-lg mb-10 max-w-2xl mx-auto" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'Llame o envíe un mensaje de texto a Chris directamente, o programe una consulta privada en un momento que le convenga.'
                : 'Call or text Chris directly, or schedule a private consultation at a time that works for you.'}
            </p>
            <div className="responsive-actions justify-center">
              <a href="tel:2394048505" className="gold-button">
                (239) 404-8505
              </a>
              <Link
                href={isEs ? '/es/contact' : '/contact'}
                className="outline-button"
              >
                {isEs ? 'Contáctenos' : 'Contact Us'}
              </Link>
            </div>
            <div className="mt-8">
              <a
                href="https://share.google/yQQMAvFDiOLppBZ30"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-text inline-flex items-center gap-2 border-b pb-1 text-sm font-bold uppercase tracking-widest transition-colors"
                style={{ color: 'var(--color-primary)', borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)', fontFamily: 'var(--font-label)' }}
              >
                <span>{isEs ? 'Lea lo que dicen los clientes en ' : 'Read what clients say on '}<GoogleWordmark height="1.5em" /></span>
                <span aria-hidden="true">-&gt;</span>
              </a>
            </div>
            {/* Follow Along (owner, 2026-11-01): the four social accounts. */}
            <SocialFollowTiles isEs={isEs} label={isEs ? 'Síganos' : 'Follow Along'} className="mt-9" />
          </PageContainer>
        </Section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
