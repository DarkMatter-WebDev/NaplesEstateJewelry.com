import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import ClayMark from '@/components/ClayMark';

interface Props {
  params: Promise<{ locale: string }>;
}

// Keep the established route for diamond jewelry evaluations. The owner's
// 2026-09-10 acquisition focus is jewelry, gold and sterling collections;
// this page no longer broadly solicits loose or lab-grown stones. That is a
// marketing emphasis, not a new refusal policy. Keep the resale explanation.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Evaluación de Joyas con Diamantes en Naples, FL' : 'Diamond Jewelry Evaluations in Naples, FL',
    // ≤ ~155 characters with the phone LAST (2026-09-08 rule, DECISIONS.md):
    // Google truncates around 155–160 on phones and the number is the point.
    description: isEs
      ? 'Evaluamos joyas con diamantes en Naples, FL: oro, piedras y diseño en conjunto. Para piedras sueltas, llame primero al (239) 404-8505.'
      : 'Diamond jewelry evaluations in Naples, FL — rings, bracelets and estate pieces valued as a whole. For loose stones, call first: (239) 404-8505.',
    path: '/diamond-buyers',
    locale,
  });
}

export default async function DiamondBuyersPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/diamond-buyers`;

  const factors = [
    {
      kEn: 'The stone',
      kEs: 'La piedra',
      titleEn: 'The 4Cs, seen honestly',
      titleEs: 'Las 4C, vistas con honestidad',
      descEn: 'We assess carat, cut, color and clarity as part of the complete piece. Bring any existing grading reports; we coordinate GIA verification for significant stones when needed.',
      descEs: 'Evaluamos los quilates, el corte, el color y la claridad como parte de la joya completa. Traiga los informes que tenga; coordinamos la verificación con GIA para piedras importantes cuando hace falta.',
    },
    {
      kEn: 'The market',
      kEs: 'El mercado',
      titleEn: 'Real resale demand',
      titleEs: 'Demanda real de reventa',
      descEn: 'Shapes and sizes move differently — a one-carat round sells faster than a three-carat marquise. We buy against today’s actual market, not a chart from a decade ago.',
      descEs: 'Las formas y los tamaños se mueven distinto — un redondo de un quilate se vende más rápido que un marquise de tres. Compramos según el mercado real de hoy, no según una tabla de hace una década.',
    },
    {
      kEn: 'The mounting',
      kEs: 'La montura',
      titleEn: 'Gold counts too',
      titleEs: 'El oro también cuenta',
      descEn: 'The setting is weighed and priced as gold at live spot — added to the stone value, never ignored. Signed pieces (Tiffany, Cartier) are priced as pieces, not parts.',
      descEs: 'La montura se pesa y se valora como oro al precio spot en vivo — sumada al valor de la piedra, nunca ignorada. Las piezas firmadas (Tiffany, Cartier) se valoran como piezas, no como partes.',
    },
  ] as const;

  const faqs = [
    {
      qEn: 'How much can I sell my diamond ring for?',
      qEs: '¿Por cuánto puedo vender mi anillo de diamantes?',
      aEn: 'It depends on the stone’s carat, cut, color, and clarity, the current resale market for its shape and size, and the gold in the mounting. That is why we evaluate in person and explain each factor — a real number beats an online guess. The evaluation is free.',
      aEs: 'Depende de los quilates, el corte, el color y la claridad de la piedra, del mercado actual de reventa para su forma y tamaño, y del oro de la montura. Por eso evaluamos en persona y explicamos cada factor — un número real vale más que una estimación en línea. La evaluación es gratuita.',
    },
    {
      qEn: 'What should I bring for a jewelry evaluation?',
      qEs: '¿Qué debo traer para evaluar mis joyas?',
      aEn: 'Bring the jewelry and any grading reports, boxes or paperwork you already have. We can assess jewelry without papers. If you decide to sell, bring a government photo ID — Florida requires it when we buy precious metals. For loose stones, call first to discuss what you have and whether we can help before making a trip.',
      aEs: 'Traiga las joyas y los informes, cajas o documentos que ya tenga. Podemos evaluar joyas sin documentación. Si decide vender, traiga una identificación oficial con foto — Florida la exige cuando compramos metales preciosos. Para piedras sueltas, llame primero para explicar qué tiene y confirmar si podemos ayudarle antes de venir.',
    },
    {
      qEn: 'Why is the offer less than my insurance appraisal says?',
      qEs: '¿Por qué la oferta es menor que lo que dice mi tasación del seguro?',
      aEn: 'An insurance appraisal states retail replacement value — what a jeweler would charge to sell you a new equivalent, at full margin. Resale is a different market, and any buyer’s honest offer will be below that paper number. We would rather explain the difference than surprise you with it.',
      aEs: 'Una tasación de seguro indica el valor de reposición al detalle — lo que un joyero cobraría por venderle un equivalente nuevo, con margen completo. La reventa es un mercado distinto, y la oferta honesta de cualquier comprador estará por debajo de ese número en papel. Preferimos explicar la diferencia antes que sorprenderlo con ella.',
    },
    {
      qEn: 'Where can I sell an engagement ring in Naples?',
      qEs: '¿Dónde puedo vender un anillo de compromiso en Naples?',
      aEn: 'At our Shirley St showroom in North Naples — walk in during open hours, or book a private appointment, including home visits across Southwest Florida. Tested, weighed, and priced in front of you, paid on the spot.',
      aEs: 'En nuestro salón de Shirley St en North Naples — entre durante el horario de atención o reserve una cita privada, incluidas visitas a domicilio en todo el suroeste de Florida. Probado, pesado y valorado frente a usted, con pago en el acto.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Joyas con Diamantes' : 'Diamond Jewelry', item: canonicalUrl },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: isEs ? f.qEs : f.qEn,
      acceptedAnswer: { '@type': 'Answer', text: isEs ? f.aEs : f.aEn },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative flex min-h-[460px] items-center overflow-hidden bg-[#1a1c1c]">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Privado · Discreto · Pago en el Acto' : 'Private · Discreet · Paid on the Spot'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'Evaluación de Joyas con Diamantes en Naples' : 'Diamond Jewelry Evaluations in Naples'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Evaluamos anillos, pulseras, aretes y joyas heredadas como piezas completas: el oro, las piedras, el fabricante y el estado cuentan. Traiga una pieza o su colección junto con las demás joyas que desea vender. Para piedras sueltas, llame primero para confirmar si podemos ayudarle.'
                  : 'We evaluate rings, bracelets, earrings and inherited jewelry as complete pieces: the gold, stones, maker and condition all count. Bring one piece or your collection along with the other jewelry you want to sell. For loose stones, call first to discuss whether we can help.'}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'TASACIÓN GRATUITA' : 'GET A FREE APPRAISAL'}
                </Link>
                <a
                  href="tel:2394048505"
                  className="outline-button"
                  style={{ borderColor: 'rgba(255,255,255,0.48)', color: 'white', background: 'rgba(255,255,255,0.08)' }}
                >
                  {isEs ? 'LLAMAR (239) 404-8505' : 'CALL (239) 404-8505'}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* What drives the offer */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Lo que un diamante realmente vale al venderlo' : 'What a diamond is really worth when you sell'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'El número de una vieja tasación de seguro es un valor de reposición al detalle — más o menos lo que un joyero cobraría por venderle uno nuevo. La reventa es un mercado distinto, y quien no se lo diga lo está preparando para una decepción. Lo que realmente determina su oferta:'
                : "The number on an old insurance appraisal is a retail replacement value — roughly what a jeweler would charge to sell you a new one. Resale is a different market, and anyone who won't say so is setting you up for disappointment. What actually drives your offer:"}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {factors.map((f) => (
                <div key={f.kEn} className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                    {isEs ? f.kEs : f.kEn}
                  </p>
                  <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? f.titleEs : f.titleEn}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? f.descEs : f.descEn}</p>
                </div>
              ))}
            </div>
            {/* 2026-10-27: the seller-framed diamond guide, with the full color
                and clarity chart, lives at /diamond-buyers/what-is-my-diamond-worth. */}
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>¿Quiere la explicación completa? Nuestra guía <Link href={p('/diamond-buyers/what-is-my-diamond-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">¿Cuánto vale mi anillo de diamante al venderlo?</Link> recorre la tasación frente a la oferta, las 4C, la forma, natural o de laboratorio — y la tabla completa de color y claridad.</>
              ) : (
                <>Want the whole explanation? Our guide <Link href={p('/diamond-buyers/what-is-my-diamond-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">What is my diamond ring worth when I sell it?</Link> walks through appraisal vs. offer, the 4Cs, shape, natural or lab-grown — and the full color and clarity chart.</>
              )}
            </p>
          </div>
        </section>

        {/* Collection context */}
        <section className="mx-auto max-w-3xl px-4 py-16 text-center md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Una joya o una colección heredada' : 'One piece or an inherited collection'}
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'Un anillo heredado puede llegar junto con cadenas de oro, broches, cubiertos de plata esterlina y otras piezas de la familia. Podemos revisarlo todo en la misma visita, explicar el valor de cada pieza y dejar que usted decida qué desea vender. La evaluación es privada, gratuita y sin obligación.'
              : 'An inherited ring may come with gold chains, brooches, sterling flatware and other family pieces. We can review them in the same visit, explain each piece’s value and let you decide what to sell. The evaluation is private, free and without obligation.'}
          </p>
        </section>

        {/* FAQ */}
        <section className="border-t border-[#d0c5af] bg-[#f3f3f3] py-20">
          <div className="mx-auto max-w-3xl px-4 md:px-8">
            <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Preguntas Sobre Joyas con Diamantes' : 'Diamond Jewelry FAQ'}
            </h2>
            <div className="flex flex-col gap-4">
              {faqs.map((f) => (
                <details key={f.qEn} className="group rounded-2xl border border-[#d0c5af] bg-white p-5 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                  <summary className="cursor-pointer list-none text-base font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? f.qEs : f.qEn}
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-[#4d4635]">{isEs ? f.aEs : f.aEn}</p>
                </details>
              ))}
            </div>
            <p className="mt-8 text-center text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>¿Vende más que diamantes? También compramos <Link href={p('/gold-services')} className="font-semibold text-[#735c00] underline underline-offset-2">oro</Link>, <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">plata esterlina</Link> y <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">joyería de patrimonio</Link>.</>
              ) : (
                <>Selling more than diamonds? We also buy <Link href={p('/gold-services')} className="font-semibold text-[#735c00] underline underline-offset-2">gold</Link>, <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">sterling silver</Link>, and <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">estate jewelry</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="signet-ring" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Qué joyas desea vender?' : 'What jewelry would you like to sell?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Cuéntenos sobre sus joyas, oro o plata esterlina. Evaluación gratuita en el salón o visita a domicilio con cita.'
                : 'Tell us about your jewelry, gold or sterling silver. Free evaluation at the showroom, or a home visit by appointment.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <Link href={evalHref} className="gold-button">
                {isEs ? 'PROGRAMAR TASACIÓN' : 'SCHEDULE AN APPRAISAL'}
              </Link>
              <a
                href="tel:2394048505"
                className="outline-button"
                style={{ borderColor: 'rgba(255,255,255,0.32)', color: 'white', background: 'rgba(255,255,255,0.08)' }}
              >
                {isEs ? 'LLAMAR (239) 404-8505' : 'CALL (239) 404-8505'}
              </a>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
