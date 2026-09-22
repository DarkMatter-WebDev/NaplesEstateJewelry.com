import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import { AppIcon } from '@/components/AppIcon';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Liquidación de Patrimonios en Naples, FL'
      : 'Estate Liquidation Services in Naples, FL',
    description: isEs
      ? 'Servicios de patrimonio en Naples, Marco Island y Fort Myers, FL para patrimonios completos, herencias individuales y colecciones heredadas. Evaluación confidencial en el sitio, pago el mismo día y trabajo discreto con familias, abogados y fideicomisarios en todo el suroeste de Florida.'
      : 'Estate services in Naples, Marco Island, and Fort Myers FL for entire estates, single heirlooms, and inherited collections. Confidential on-site evaluation, same-day payment, and discreet work with families, attorneys, and trustees throughout Southwest Florida.',
    path: '/estate-services',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

const WHEN_FAMILIES_CALL = [
  {
    icon: 'family_restroom',
    titleEn: 'Inherited Collections',
    titleEs: 'Colecciones Heredadas',
    descEn: "A loved one has passed, and you've inherited jewelry, silver, or antiques you don't intend to keep. We handle everything discreetly and without pressure.",
    descEs: 'Un ser querido ha fallecido y ha heredado joyería, plata o antigüedades que no piensa conservar. Nos encargamos de todo de forma discreta y sin presión.',
  },
  {
    icon: 'home',
    titleEn: 'Downsizing & Moving',
    titleEs: 'Reducción y Mudanza',
    descEn: 'Moving to a smaller home, relocating north, or transitioning to assisted living. We come on-site, evaluate everything in one visit, and handle pickup.',
    descEs: 'Mudarse a una casa más pequeña, reubicarse al norte o hacer la transición a una vida asistida. Venimos al sitio, evaluamos todo en una visita y nos encargamos del retiro.',
  },
  {
    icon: 'gavel',
    titleEn: 'Probate & Trustee Sales',
    titleEs: 'Ventas de Sucesión y Fideicomiso',
    descEn: 'Working with attorneys or trustees to value and liquidate estate assets. We provide clear documentation and work to timelines.',
    descEs: 'Trabajando con abogados o fideicomisarios para valorar y liquidar activos del patrimonio. Proporcionamos documentación clara y trabajamos con plazos.',
  },
  {
    icon: 'inventory_2',
    titleEn: 'Full Household Liquidation',
    titleEs: 'Liquidación de Hogar Completo',
    descEn: 'Need an entire estate cleared, not just the jewelry? We can purchase the high-value items directly and coordinate the rest.',
    descEs: '¿Necesita despejar un patrimonio completo, no solo la joyería? Podemos comprar los artículos de alto valor directamente y coordinar el resto.',
  },
];

const HOW_IT_WORKS = [
  {
    num: '01',
    titleEn: 'Initial Phone Call',
    titleEs: 'Llamada Telefónica Inicial',
    descEn: "A brief conversation to understand the scope of the estate, your timeline, and what kind of help you need. No commitment.",
    descEs: 'Una breve conversación para entender el alcance del patrimonio, su calendario y qué tipo de ayuda necesita. Sin compromiso.',
  },
  {
    num: '02',
    titleEn: 'On-Site Evaluation',
    titleEs: 'Evaluación en el Sitio',
    descEn: 'We come to the home, walk through every category — jewelry, silver, watches, art, antiques — and identify what we can purchase and what we recommend handling separately.',
    descEs: 'Venimos a la casa, recorremos cada categoría — joyería, plata, relojes, arte, antigüedades — e identificamos qué podemos comprar y qué recomendamos manejar por separado.',
  },
  {
    num: '03',
    titleEn: 'Transparent Offer',
    titleEs: 'Oferta Transparente',
    descEn: 'Itemized offer with clear reasoning. You decide what to sell. Nothing leaves the home until we agree.',
    descEs: 'Oferta detallada con razonamiento claro. Usted decide qué vender. Nada sale de la casa hasta que estemos de acuerdo.',
  },
  {
    num: '04',
    titleEn: 'Same-Day Payment & Pickup',
    titleEs: 'Pago y Retiro el Mismo Día',
    descEn: 'Immediate payment by cash, check, or wire. We coordinate secure pickup and provide documentation of every item.',
    descEs: 'Pago inmediato en efectivo, cheque o transferencia. Coordinamos el retiro seguro y proporcionamos documentación de cada artículo.',
  },
];

export default async function EstateServicesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Servicios de Patrimonio' : 'Estate Services', path: '/estate-services' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative pt-14 pb-20 md:pt-20 md:pb-28 overflow-hidden border-b border-[#d0c5af]">
          <div className="absolute inset-0 z-0 opacity-50">
            <Image
              src="/assets/images/pages/pen.webp"
              alt="Estate documents"
              fill
              sizes="100vw"
              className="object-cover estate-pen-pan"
              style={{ objectPosition: 'center 46%' }}
              priority
            />
          </div>
          <div className="absolute inset-0 z-0 bg-[#f9f9f7]/60" />
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#f9f9f7]/75 via-[#f9f9f7]/30 to-[#f9f9f7]/95" />
          <div className="max-w-4xl mx-auto px-6 md:px-8 relative z-10">
            <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" />
            <span className="text-[#735c00] text-xs font-bold uppercase tracking-[0.4em]">
              {isEs ? 'Servicios de Liquidación de Patrimonio' : 'Estate Liquidation Services'}
            </span>
            <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-headline)] font-bold mt-4 mb-6 tracking-tight text-[#1a1c1c]">
              {isEs ? 'Asistencia Completa para Patrimonios' : 'Comprehensive Estate Assistance'}
            </h1>
            <p className="text-xl md:text-2xl text-[#4d4635] italic mb-12 max-w-3xl leading-relaxed">
              {isEs
                ? 'Desde piezas de herencia individuales hasta patrimonios domésticos completos, ayudamos a las familias a navegar el proceso de venta con orientación directa, confidencialidad completa y soluciones personalizadas.'
                : 'From single heirloom pieces to full household estates, we help families navigate the selling process with straightforward guidance, complete confidentiality, and personalized solutions.'}
            </p>
            <a
              href="tel:2394048505"
              className="group inline-flex items-center gap-6"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#735c00]/30 bg-white/60 shadow-[0_14px_38px_rgba(38,28,6,0.08)] transition group-hover:bg-[#735c00]">
                <AppIcon name="call" className="text-[#735c00] group-hover:text-white transition-colors" />
              </div>
              <div>
                <span className="block text-[#735c00] text-xs font-bold uppercase tracking-[0.3em] mb-1">
                  {isEs ? 'Respuesta Inmediata' : 'Immediate Response'}
                </span>
                <span className="text-3xl md:text-4xl font-[family-name:var(--font-headline)] font-bold text-[#1a1c1c]">
                  (239) 404-8505
                </span>
              </div>
            </a>
          </div>
        </section>

        {/* When Families Call Us */}
        <section className="py-16 md:py-24 bg-[#f3f3f3]">
          <div className="ultrawide-page-medium max-w-5xl mx-auto px-6 md:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-headline)] font-bold mb-6 tracking-tight">
                {isEs ? 'Cuando las Familias Nos Llaman' : 'When Families Call Us'}
              </h2>
              <p className="text-[#4d4635] text-lg max-w-3xl mx-auto">
                {isEs
                  ? 'Cada situación es diferente. Hemos ayudado a clientes en todas estas situaciones, a menudo durante momentos emocionalmente difíciles.'
                  : "Every situation is different. We've helped clients through all of these, often during emotionally difficult times."}
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {WHEN_FAMILIES_CALL.map(({ icon, titleEn, titleEs, descEn, descEs }) => (
                <div key={icon} className="rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_14px_38px_rgba(38,28,6,0.06)]">
                  <AppIcon name={icon}
                    className="text-[#735c00] block mb-4"
                    style={{ fontSize: '2.5rem' }}
                   />
                  <h3 className="text-xl font-[family-name:var(--font-headline)] font-bold mb-3">
                    {isEs ? titleEs : titleEn}
                  </h3>
                  <p className="text-[#4d4635] leading-relaxed text-sm">{isEs ? descEs : descEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-6 md:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-headline)] font-bold mb-4 tracking-tight">
                {isEs ? 'Cómo Funciona' : 'How It Works'}
              </h2>
            </div>
            <div className="space-y-4">
              {HOW_IT_WORKS.map(({ num, titleEn, titleEs, descEn, descEs }) => (
                <div
                  key={num}
                  className="flex flex-col rounded-2xl bg-white px-6 py-8 shadow-[0_14px_38px_rgba(38,28,6,0.06)] md:flex-row md:items-center md:px-8"
                >
                  <span className="text-[#e9c349] font-[family-name:var(--font-headline)] text-4xl md:mr-12 mb-4 md:mb-0 opacity-50 font-bold italic">
                    {num}
                  </span>
                  <div className="flex-1">
                    <h4 className="text-xl font-[family-name:var(--font-headline)] font-bold mb-1">
                      {isEs ? titleEs : titleEn}
                    </h4>
                    <p className="text-[#4d4635] text-sm leading-relaxed">{isEs ? descEs : descEn}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Guide link (2026-09-02): what a family should do BEFORE step 01. */}
            <p className="mt-10 text-center text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>¿No sabe por dónde empezar? Nuestra guía <Link href={isEs ? '/es/estate-services/selling-inherited-jewelry' : '/estate-services/selling-inherited-jewelry'} className="font-semibold text-[#735c00] underline underline-offset-2">Vender joyas heredadas: qué hacer primero</Link> explica qué no tocar, cómo separar lo que tiene y qué necesita un albacea.</>
              ) : (
                <>Not sure where to start? Our guide <Link href="/estate-services/selling-inherited-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">Selling inherited jewelry: what to do first</Link> covers what not to touch, how to sort what you have, and what an executor needs.</>
              )}
            </p>
            {/* Sister-shop link (2026-09-21, owner-approved): whole-house contents go
                to the antiques site. Body link only — never in schema, sameAs, the
                footer, or the silver pages (SEO_LEAD_AUDIT.md 2026-09-21). */}
            <p className="mt-3 text-center text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>¿Necesita vaciar toda la casa — muebles, arte, porcelana, plata antigua? Nuestra tienda hermana, <a href="https://naplesantiquesllc.com/estate-services/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#735c00] underline underline-offset-2">Naples Antiques and Estate Services</a>, se encarga del contenido completo del patrimonio (sitio en inglés).</>
              ) : (
                <>Clearing the whole house — furniture, art, porcelain, antique silver? Our sister shop, <a href="https://naplesantiquesllc.com/estate-services/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#735c00] underline underline-offset-2">Naples Antiques and Estate Services</a>, handles full estate contents.</>
              )}
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28 bg-[#f3f3f3]">
          <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
            <h2 className="text-4xl md:text-5xl font-[family-name:var(--font-headline)] font-bold mb-6 tracking-tight">
              {isEs ? '¿Listo para Hablar?' : 'Ready to Talk?'}
            </h2>
            <p className="text-[#4d4635] text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
              {isEs
                ? 'El trabajo de patrimonio a menudo es urgente y emocionalmente pesado. Llámenos o envíenos un mensaje directamente — haremos el proceso tan sencillo como sea posible.'
                : "Estate work is often time-sensitive and emotionally heavy. Call or text us directly — we'll make the process as straightforward as possible."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
              <a
                href="tel:2394048505"
                className="gold-button"
              >
                (239) 404-8505
              </a>
              <Link
                href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                className="outline-button"
              >
                {isEs ? 'Programar una Consulta' : 'Schedule a Consultation'}
              </Link>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
