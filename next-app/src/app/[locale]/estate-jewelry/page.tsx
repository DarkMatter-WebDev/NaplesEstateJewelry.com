import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import { AppIcon } from '@/components/AppIcon';
import { phoneHoursLabel, wayfindingSentence } from '@/lib/business-location';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    // 2026-10-19 (owner, mockup v1): plural "Buyers" — still the buyer-noun
    // slot of the 08-30 title split (home = "Sell…", /sell/naples = "Jewelry
    // Buyers…", this page = estate jewelry buyers). ≤ ~60 characters with the
    // suffix; the description keeps the phone last (DECISIONS 2026-09-08).
    title: isEs
      ? 'Compradores de Joyería de Patrimonio en Naples'
      : 'Estate Jewelry Buyers in Naples, FL',
    description: isEs
      ? 'Venda joyería heredada en Naples, FL — oro, diamantes, piezas antiguas y colecciones. Evaluación gratis, pago al aceptar. Llame al (239) 404-8505.'
      : 'Sell estate jewelry in Naples, FL — gold, diamonds, vintage pieces and inherited collections. Free evaluation, paid on agreement. Call (239) 404-8505.',
    path: '/estate-jewelry',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function EstateJewelryPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Comprador de Joyería de Patrimonio' : 'Estate Jewelry Buyer', path: '/estate-jewelry' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section
          className="relative flex items-center overflow-hidden min-h-[600px] md:min-h-[680px]"
          style={{ background: '#0e0f0f' }}
        >
          <div className="absolute inset-0 opacity-40">
            <Image
              src="/assets/images/pages/jeweler.webp"
              alt={isEs ? 'Joyero midiendo un anillo de patrimonio durante una evaluación privada' : 'Jeweler measuring an estate ring during a private evaluation'}
              fill
              sizes="100vw"
              priority
              className="object-cover object-center"
            />
          </div>
          <div className="container mx-auto px-6 md:px-12 relative z-10 py-16">
            <div className="max-w-2xl">
              <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="dark" />
              {/* Non-breaking spaces keep the last word, the dot and "Naples, FL"
                  together, so a phone never starts a line with "·" (ES wraps). */}
              <span
                className="text-xs font-bold uppercase tracking-[0.2em] mb-4 block"
                style={{ color: '#f2ca50', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'Compradores de Joyería de Patrimonio\u00a0·\u00a0Naples,\u00a0FL' : 'Estate Jewelry Buyers\u00a0·\u00a0Naples,\u00a0FL'}
              </span>
              {/* Non-breaking space + `text-balance`: a phone used to strand
                  "FL" alone on the last line (2026-10-19, mockup v1). */}
              <h1
                className="text-4xl md:text-6xl text-white font-bold mb-6 leading-tight text-balance"
                style={{ fontFamily: 'var(--font-headline)' }}
              >
                {isEs
                  ? 'Venda Joyería de Patrimonio en Naples,\u00a0FL'
                  : 'Sell Estate Jewelry in Naples,\u00a0FL'}
              </h1>
              <p className="text-lg leading-relaxed mb-10" style={{ color: '#d0c9bc' }}>
                {isEs
                  ? '¿Quiere vender joyería de oro, antigua o heredada? Somos compradores de joyería de patrimonio en Naples — una pieza o todo un joyero, con evaluación gratuita. Evaluamos el metal, el fabricante, las gemas y la época, explicamos la oferta y pagamos al aceptarla.'
                  : "Looking to sell gold, vintage, or inherited jewelry? We're Naples estate jewelry buyers — one piece or a whole jewelry box, with a free evaluation. We examine the metal, maker, gemstones, and era, explain our offer, and pay when you accept."}
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="tel:2394048505"
                  className="gold-button"
                >
                  {isEs ? 'LLAMAR (239) 404-8505' : 'CALL (239) 404-8505'}
                </a>
                <Link
                  href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                  className="outline-button"
                  style={{ borderColor: 'rgba(255,255,255,0.4)', color: 'white' }}
                >
                  {isEs ? 'Tasación Gratuita' : 'Free Appraisal'}
                </Link>
              </div>
              <p className="mt-4 text-sm" style={{ color: '#d0c9bc' }}>{phoneHoursLabel(isEs)}</p>
            </div>
          </div>
        </section>

        {/* How pieces are valued */}
        <section className="py-20 md:py-28" style={{ background: 'var(--color-background)' }}>
          <div className="ultrawide-page container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2
                className="text-3xl md:text-4xl font-bold mb-6 tracking-tight"
                style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
              >
                {isEs ? 'Cómo Valoramos Su Joyería' : 'How We Value Your Jewelry'}
              </h2>
              <p style={{ color: 'var(--color-on-surface-variant)' }}>
                {isEs
                  ? 'Valoramos cada pieza como joyería y como metal. Pesamos los metales preciosos y comprobamos su pureza con pruebas de ácido en el sitio. También consideramos el fabricante, las gemas, la época y el estado de la pieza. Cuando hace falta, organizamos análisis de metal XRF fuera del sitio.'
                  : 'We assess each piece as jewelry and as metal. We weigh precious metals and check their purity with onsite acid testing. We also consider the maker, gemstones, era, and condition. When needed, we arrange offsite XRF metal analysis.'}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="relative">
                <Image
                  src="/assets/images/pages/jeweler.webp"
                  alt={isEs ? 'Herramientas de joyería en el banco de trabajo' : "Jeweler's workbench with precision tools"}
                  width={700}
                  height={525}
                  className="w-full rounded-2xl object-cover shadow-xl"
                  style={{ aspectRatio: '4/3' }}
                />
              </div>

              <div className="flex flex-col gap-10">
                {[
                  {
                    title: isEs ? 'Fabricante y Procedencia' : 'Maker & Provenance',
                    body: isEs
                      ? 'Buscamos marcas del fabricante y revisamos cualquier documentación que conserve. Una firma de Cartier, Van Cleef & Arpels o Tiffany puede influir en el valor de reventa, junto con el diseño y el estado. No hace falta una firma para que evaluemos su joyería.'
                      : 'We look for maker\'s marks and review any paperwork you have. A Cartier, Van Cleef & Arpels, or Tiffany signature can affect resale value alongside design and condition. Your jewelry does not need a designer signature for an evaluation.',
                  },
                  {
                    title: isEs ? 'Calidad de las Gemas' : 'Gemstone Quality',
                    body: isEs
                      ? 'Revisamos las piedras montadas mediante inspección visual, investigación de mercado y los informes gemológicos disponibles. Si hace falta un análisis especializado, organizamos la evaluación fuera del sitio. Esta revisión de las gemas es distinta de las pruebas de ácido del metal.'
                      : 'We assess mounted stones through visual inspection, market research, and any available gemological reports. If specialist analysis is needed, we arrange an offsite assessment. This gemstone review is separate from acid testing the metal.',
                  },
                  {
                    title: isEs ? 'Era Histórica' : 'Historical Era',
                    body: isEs
                      ? 'Ya sea victoriano, Art Deco o Retro Moderno, el significado histórico de una pieza contribuye a su deseabilidad. Consideramos la era tanto como los materiales.'
                      : 'Whether Victorian, Art Deco, or Retro Modern, the historical significance of a piece contributes to its desirability. We consider the era as much as the materials.',
                  },
                ].map((item, i) => (
                  <div key={i}>
                    <h3
                      className="text-xl font-bold mb-3"
                      style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                    >
                      {item.title}
                    </h3>
                    <p className="leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {item.body}
                    </p>
                    {i < 2 && (
                      <div className="mt-6 h-px" style={{ background: 'var(--color-outline-variant)' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Evaluation process and showroom visits */}
        <section className="py-20 md:py-28" style={{ background: '#1a1c1c', color: 'white' }}>
          <div className="ultrawide-page container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-widest mb-6 block"
                  style={{ color: '#f2ca50', fontFamily: 'var(--font-label)' }}
                >
                  {isEs ? 'Evaluación Gratuita' : 'Free Evaluation'}
                </span>
                <h2
                  className="text-3xl md:text-4xl font-bold mb-8 leading-tight"
                  style={{ fontFamily: 'var(--font-headline)' }}
                >
                  {isEs
                    ? 'Qué Ocurre Durante Su Evaluación'
                    : 'What Happens at Your Evaluation'}
                </h2>
                <p className="text-lg mb-8 leading-relaxed" style={{ color: '#d0c9bc' }}>
                  {isEs
                    ? 'Traiga una pieza, joyería de uso diario o una colección heredada. Puede visitarnos sin cita durante el horario del salón o concertar una cita privada. Las visitas a domicilio están disponibles a solicitud para quienes prefieren no transportar sus piezas.'
                    : 'Bring one piece, everyday jewelry, or an inherited collection. Walk into our showroom during open hours or arrange a private appointment. Home visits are available on request if you would rather not transport your pieces.'}
                </p>
                <ul className="space-y-4 mb-10">
                  {[
                    isEs ? 'Revisamos el metal, las marcas y el estado de sus piezas' : 'We examine the metal, markings, and condition of your pieces',
                    isEs ? 'Explicamos la oferta; usted decide si desea vender' : 'We explain our offer; you decide whether to sell',
                    isEs ? 'Pago inmediato al aceptar la oferta' : 'Immediate payment when you accept the offer',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <AppIcon name="check_circle" className="text-sm" style={{ color: '#f2ca50', flexShrink: 0, marginTop: '0.1rem' }} />
                      <span
                        className="text-sm font-bold uppercase tracking-wide"
                        style={{ fontFamily: 'var(--font-label)', color: 'white' }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm mb-6 leading-relaxed" style={{ color: '#d0c9bc' }}>
                  {wayfindingSentence(isEs)}
                </p>
                <Link
                  href={isEs ? '/es/contact' : '/contact'}
                  className="gold-button inline-flex"
                >
                  {isEs ? 'Horario y Cómo Llegar' : 'Showroom Hours & Directions'}
                </Link>
              </div>

              <div
                className="flex items-center justify-center rounded-2xl p-6 shadow-[0_18px_54px_rgba(0,0,0,0.16)] md:p-10"
                style={{ background: 'var(--color-surface-container-highest)' }}
              >
                <div
                  className="flex w-full flex-col justify-center rounded-xl p-6 text-center md:p-8"
                  style={{ border: '1px solid rgba(115, 92, 0, 0.18)' }}
                >
                  <AppIcon name="verified"
                    className="mb-6 block"
                    style={{ color: 'var(--color-primary)', fontSize: '4rem' }}
                    aria-hidden="true"
                   />
                  <h3
                    className="text-2xl font-bold mb-4"
                    style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                  >
                    {isEs ? 'Una Oferta Clara' : 'An Offer You Can Understand'}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {isEs
                      ? 'Explicamos cómo el metal, el fabricante, las gemas y el estado de sus piezas influyen en la oferta según el mercado actual. La evaluación es gratuita y no tiene obligación de vender.'
                      : 'We explain how the metal, maker, gemstones, and condition of your pieces contribute to an offer based on the current market. The evaluation is free, with no obligation to sell.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Items We Buy */}
        <section className="py-20 md:py-28" style={{ background: 'var(--color-background)' }}>
          <div className="ultrawide-page container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
              <div className="max-w-xl">
                <h2
                  className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
                  style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                >
                  {isEs ? 'Joyería Que Compramos' : 'Jewelry We Buy'}
                </h2>
                <p style={{ color: 'var(--color-on-surface-variant)' }}>
                  {isEs
                    ? 'Compramos anillos de oro, cadenas, pulseras, aretes y joyería heredada, incluidas piezas rotas o sin firma. También evaluamos joyería antigua y de diseñador y relojes de lujo, tanto piezas individuales como colecciones.'
                    : 'We buy gold rings, chains, bracelets, earrings, and inherited jewelry, including broken or unsigned pieces. We also evaluate antique and designer jewelry and luxury watches, as individual pieces or collections.'}
                </p>
              </div>
              <Link
                href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                className="text-sm font-bold uppercase tracking-widest underline underline-offset-8 whitespace-nowrap"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'SOLICITAR TASACIÓN' : 'REQUEST AN APPRAISAL'}
              </Link>
            </div>

            {/* Gallery grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Main feature — Patek / signed watches */}
              <div className="relative group overflow-hidden rounded-2xl shadow-[0_18px_54px_rgba(38,28,6,0.08)]" style={{ minHeight: 400 }}>
                <Image
                  src="/assets/images/pages/patek.webp"
                  alt={isEs ? 'Reloj de lujo Patek Philippe' : 'Patek Philippe luxury watch'}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  style={{ objectPosition: 'center 68%' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                  <h4
                    className="text-2xl font-bold"
                    style={{ fontFamily: 'var(--font-headline)' }}
                  >
                    {isEs ? 'Joyería Firmada y Relojes' : 'Signed Jewelry & Watches'}
                  </h4>
                  <p
                    className="text-xs font-bold uppercase tracking-widest mt-2"
                    style={{ color: '#f2ca50', fontFamily: 'var(--font-label)' }}
                  >
                    Cartier · Rolex · Patek Philippe
                  </p>
                </div>
              </div>

              <div className="grid grid-rows-2 gap-4">
                {/* Gold & chains */}
                <div className="relative group overflow-hidden rounded-2xl shadow-[0_14px_38px_rgba(38,28,6,0.08)]" style={{ minHeight: 190 }}>
                  <Image
                    src="/assets/images/pages/gold.webp"
                    alt={isEs ? 'Joyería de oro y cadenas' : 'Gold jewelry and chains'}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                    <h4 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)' }}>
                      {isEs ? 'Anillos Antiguos' : 'Antique Rings'}
                    </h4>
                    <p
                      className="text-xs font-bold uppercase tracking-widest mt-1"
                      style={{ color: '#f2ca50', fontFamily: 'var(--font-label)' }}
                    >
                      Georgian · Victorian · Art Deco
                    </p>
                  </div>
                </div>

                {/* Estate pieces */}
                <div className="relative group overflow-hidden rounded-2xl shadow-[0_14px_38px_rgba(38,28,6,0.08)]" style={{ minHeight: 190 }}>
                  <Image
                    src="/assets/images/pages/signed.webp"
                    alt={isEs ? 'Broches y colgantes victorianos de oro' : 'Victorian gold brooches and pendants'}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                    <h4 className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)' }}>
                      {isEs ? 'Broches Victorianos' : 'Victorian Brooches'}
                    </h4>
                    <p
                      className="text-xs font-bold uppercase tracking-widest mt-1"
                      style={{ color: '#f2ca50', fontFamily: 'var(--font-label)' }}
                    >
                      {isEs ? 'Esmalte Heredado y Oro' : 'Heirloom Enamel & Gold'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Sibling crossover (2026-09-01). This is the top-nav "Sell"
                destination and, until now, the only sell page with no mention
                of silver at all — yet an inherited estate is jewelry AND the
                flatware chest. The FAQ's "Full list →" also lands here, so this
                line is where that reader finally meets the silver page. Uses
                the token colours this page is built on, not the #735c00
                literal the newer pages use. */}
            <p className="mt-10 text-center text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs ? (
                <>¿Vende más que joyería? También compramos <Link href={p('/gold-services')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>chatarra de oro</Link> y <Link href={p('/silver-services')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>cubertería y vajilla de plata esterlina</Link>. Si su colección incluye piezas con piedras, consulte nuestras <Link href={p('/diamond-buyers')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>evaluaciones de joyería con diamantes</Link>.</>
              ) : (
                <>Selling more than jewelry? We also buy <Link href={p('/gold-services')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>scrap gold</Link> and <Link href={p('/silver-services')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>sterling silver flatware and hollowware</Link>. If your collection includes pieces with stones, see our <Link href={p('/diamond-buyers')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>diamond jewelry evaluations</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* Credentials / Stats */}
        <section className="py-16 md:py-24" style={{ background: 'var(--color-surface-container-low)' }}>
          <div className="container mx-auto px-6 md:px-12 max-w-5xl text-center">
            <span
              className="text-xs font-bold uppercase tracking-[0.3em] mb-12 block"
              style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Nuestros Estándares' : 'Our Standards'}
            </span>
            <div className="flex flex-wrap justify-center gap-12 md:gap-24">
              {[
                { stat: isEs ? 'Pruebas en el Sitio' : 'Onsite Testing', label: isEs ? 'Pruebas de Metales Preciosos' : 'Precious Metal Checks' },
                { stat: '15+', label: isEs ? 'Años de Experiencia' : 'Years Experience' },
                { stat: isEs ? 'Raíces Locales' : 'Local Roots', label: isEs ? 'Nacido y criado en Naples' : 'Born & raised in Naples' },
                { stat: isEs ? 'Sin Obligación' : 'No Obligation', label: isEs ? 'Evaluación Gratuita' : 'Free Evaluation' },
              ].map((item) => (
                <div key={item.stat} className="flex flex-col items-center">
                  <span
                    className="text-2xl font-bold mb-2"
                    style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-primary)' }}
                  >
                    {item.stat}
                  </span>
                  <p
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                  >
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
