import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import ClayMark, { type ClayMarkName } from '@/components/ClayMark';

interface Props {
  params: Promise<{ locale: string }>;
}

// SEO lander for the "jewelry appraisal naples" query family. The GBP holds
// the local-pack slot for these searches (secondary category "Jewelry
// appraiser") while the site had NO page — GSC 2026-08 read position 74 for
// "jewelry appraisal naples fl". This page explains the free-verbal-offer
// model; /free-evaluation stays the conversion/booking page and every CTA here
// funnels into it or the phone. ⚠️ The honesty framing (market appraisal vs.
// written insurance appraisal, which we do NOT sell — owner decision
// 2026-08-30) is the page's differentiator against fee-based appraisers; do
// not soften it into "we do everything".
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Tasación de Joyas Gratis en Naples, FL'
      : 'Free Jewelry Appraisal in Naples, FL',
    description: isEs
      // ≤ ~155 characters with the phone last (2026-09-08, DECISIONS.md).
      ? 'Tasaciones de joyas gratis en Naples, FL — oferta real en efectivo, en el acto. Pruebas XRF y de ácido, coordinación con GIA. Llame al (239) 404-8505.'
      : 'Free jewelry appraisals in Naples, FL — a real cash offer, on the spot. XRF and acid testing, GIA coordination, no appointment needed. Call (239) 404-8505.',
    path: '/jewelry-appraisal',
    locale,
  });
}

export default async function JewelryAppraisalPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/jewelry-appraisal`;

  const steps = [
    {
      mark: 'photo-location' as ClayMarkName,
      titleEn: 'Walk in, or send photos first',
      titleEs: 'Entre sin cita o envíe fotos primero',
      descEn: 'Come by the Shirley St showroom during open hours, or text a few photos to (239) 404-8505 for a ballpark before you make the trip.',
      descEs: 'Visite el salón de Shirley St durante el horario de atención, o envíe unas fotos al (239) 404-8505 para una idea del valor antes de venir.',
    },
    {
      mark: 'flask' as ClayMarkName,
      titleEn: 'Tested in front of you',
      titleEs: 'Probado frente a usted',
      descEn: 'Acid testing and XRF analysis for metals, loupe and gauge work for stones, maker and hallmark identification — and GIA coordination for significant diamonds.',
      descEs: 'Pruebas de ácido y análisis XRF para metales, lupa y calibrador para las piedras, identificación de fabricantes y sellos — y coordinación con GIA para diamantes importantes.',
    },
    {
      mark: 'cash' as ClayMarkName,
      titleEn: 'An honest number — and a real offer',
      titleEs: 'Un número honesto — y una oferta real',
      descEn: 'You get the value explained piece by piece, backed by a cash offer we will pay on the spot. No pressure, no obligation if you decline.',
      descEs: 'Le explicamos el valor pieza por pieza, respaldado por una oferta en efectivo que pagamos en el acto. Sin presión ni obligación si la rechaza.',
    },
  ] as const;

  const appraiseCards = [
    {
      mark: 'gold-seal' as ClayMarkName,
      href: p('/gold-services'),
      titleEn: 'Gold jewelry',
      titleEs: 'Joyería de oro',
      descEn: '8k–24k chains, rings, and bracelets — worn or broken included.',
      descEs: 'Cadenas, anillos y pulseras de 8k–24k — incluso gastadas o rotas.',
    },
    {
      mark: 'sterling-flatware' as ClayMarkName,
      href: p('/silver-services'),
      titleEn: 'Sterling silver',
      titleEs: 'Plata esterlina',
      descEn: 'Flatware sets, tea services, hollowware, and .925 jewelry.',
      descEs: 'Juegos de cubiertos, servicios de té, hollowware y joyería .925.',
    },
    {
      mark: 'heirloom' as ClayMarkName,
      href: p('/estate-jewelry'),
      titleEn: 'Estate & designer jewelry',
      titleEs: 'Joyería de patrimonio y de diseñador',
      descEn: 'Rings, brooches, bracelets and inherited pieces, with the maker, stones and metal considered together.',
      descEs: 'Anillos, broches, pulseras y piezas heredadas, con el fabricante, las piedras y el metal valorados en conjunto.',
    },
    {
      mark: 'watch' as ClayMarkName,
      href: p('/watch-buyers'),
      titleEn: 'Watches',
      titleEs: 'Relojes',
      descEn: 'Rolex, Omega, Cartier, and vintage pieces, running or not.',
      descEs: 'Rolex, Omega, Cartier y piezas vintage, funcionen o no.',
    },
    {
      mark: 'coins' as ClayMarkName,
      href: p('/bullion'),
      titleEn: 'Coins & bullion',
      titleEs: 'Monedas y lingotes',
      descEn: 'Gold and silver coins, bars, and junk silver of any mint.',
      descEs: 'Monedas de oro y plata, barras y plata de circulación de cualquier casa de moneda.',
    },
    {
      mark: 'heirloom' as ClayMarkName,
      href: p('/estate-services'),
      titleEn: 'Full estates',
      titleEs: 'Patrimonios completos',
      descEn: 'Complete collections for executors and families settling estates.',
      descEs: 'Colecciones completas para albaceas y familias liquidando patrimonios.',
    },
  ] as const;

  const faqs = [
    {
      qEn: 'How much does a jewelry appraisal cost in Naples?',
      qEs: '¿Cuánto cuesta una tasación de joyas en Naples?',
      aEn: 'Ours are free. We make our living buying and selling jewelry, not charging for opinions — the appraisal comes with a real offer, and there is no obligation to accept it.',
      aEs: 'Las nuestras son gratis. Nos ganamos la vida comprando y vendiendo joyas, no cobrando por opiniones — la tasación viene con una oferta real, y no hay obligación de aceptarla.',
    },
    {
      qEn: 'Is your appraisal the same as an offer?',
      qEs: '¿Su tasación es lo mismo que una oferta?',
      aEn: 'Yes — that is the point. Instead of a hypothetical number, you get what we will actually pay, today, explained openly. You are always free to shop it around; a fair number holds up to comparison.',
      aEs: 'Sí — de eso se trata. En lugar de un número hipotético, recibe lo que realmente pagaremos, hoy, explicado abiertamente. Siempre puede comparar; un número justo resiste la comparación.',
    },
    {
      qEn: 'Do you prepare written insurance appraisals?',
      qEs: '¿Preparan tasaciones escritas para seguros?',
      aEn: 'No — we do not sell paperwork. A written insurance appraisal states a retail replacement value for insuring a piece you are keeping, and it is a different service. If that is what you actually need, we will say so honestly and point you to a certified independent appraiser.',
      aEs: 'No — no vendemos papeleo. Una tasación escrita para seguros indica un valor de reposición para asegurar una pieza que usted conserva, y es un servicio distinto. Si eso es lo que realmente necesita, se lo diremos con honestidad y le indicaremos un tasador independiente certificado.',
    },
    {
      qEn: 'Do I need an appointment?',
      qEs: '¿Necesito una cita?',
      aEn: 'No — walk into our Shirley St showroom during open hours. Private appointments and home visits across Southwest Florida are available too.',
      aEs: 'No — entre a nuestro salón de Shirley St durante el horario de atención. También hay citas privadas y visitas a domicilio en todo el suroeste de Florida.',
    },
    {
      qEn: 'How long does it take?',
      qEs: '¿Cuánto tarda?',
      aEn: 'Most single pieces take minutes. Full estates and large flatware services take longer — we go through everything unhurried, in front of you.',
      aEs: 'La mayoría de las piezas individuales toman minutos. Los patrimonios completos y los juegos grandes de cubiertos toman más — revisamos todo con calma, frente a usted.',
    },
    {
      qEn: 'Can you appraise inherited jewelry I know nothing about?',
      qEs: '¿Pueden tasar joyas heredadas de las que no sé nada?',
      aEn: 'That is most of what we see. We identify makers, hallmarks, metals, and stones, and explain what matters and what does not — whether or not you sell.',
      aEs: 'Eso es la mayor parte de lo que vemos. Identificamos fabricantes, sellos, metales y piedras, y le explicamos qué importa y qué no — venda o no venda.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Tasación de Joyas' : 'Jewelry Appraisal', item: canonicalUrl },
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
        <section className="relative flex min-h-[480px] items-center overflow-hidden bg-[#1a1c1c]">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Gratis · En el Acto · Sin Cita' : 'Free · On the Spot · No Appointment Needed'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'Tasación de Joyas Gratis en Naples' : 'Free Jewelry Appraisal in Naples'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Traiga sus joyas, oro, plata esterlina, relojes o monedas a nuestro salón de Shirley St y reciba una respuesta directa sobre su valor — probado y pesado frente a usted, con una oferta real en efectivo que puede rechazar sin compromiso.'
                  : "Bring your jewelry, gold, sterling silver, watches, or coins to our Shirley St showroom and get a straight answer on what they're worth — tested and weighed in front of you, with a real cash offer you're free to walk away from."}
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

        {/* Market appraisal vs. written insurance appraisal */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Dos cosas muy distintas se llaman "tasación"' : 'Two very different things get called an "appraisal"'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'La mayoría de las personas que piden una tasación de joyas buscan una de dos cosas — y los joyeros rara vez explican la diferencia. Preferimos que sepa exactamente qué está recibiendo:'
                : "Most people asking for a jewelry appraisal want one of two things — and jewelers rarely explain the difference. We'd rather you know exactly what you're getting:"}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Lo que hacemos' : 'What we do'}
                </p>
                <span className="mb-3 inline-block rounded-full bg-[#e9c349] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#1a1c1c]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Gratis' : 'Free'}
                </span>
                <h3 className="mb-3 text-xl font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'Tasación de mercado — con una oferta real' : 'Market appraisal — with a real offer'}
                </h3>
                <p className="mb-3 text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'Lo que su pieza vale genuinamente en el mercado de hoy, respaldado por una oferta en efectivo que pagamos en el acto. Oro y plata pesados contra los precios spot en vivo, piedras examinadas, fabricantes y sellos identificados — todo frente a usted, en minutos.'
                    : 'What your piece is genuinely worth in today’s market, backed by a cash offer we’ll pay on the spot. Gold and silver weighed against live spot prices, stones examined, makers and hallmarks identified — all in front of you, in minutes.'}
                </p>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'Sin costo y sin obligación. Si el número no le conviene, se va con su pieza y con un mejor entendimiento de ella.'
                    : 'There’s no fee and no obligation. If the number isn’t right for you, you walk out with your piece and a better understanding of it.'}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Cuándo necesita un documento' : 'When you need paper'}
                </p>
                <h3 className="mb-3 mt-[26px] text-xl font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'Tasación escrita para seguros' : 'Written insurance appraisal'}
                </h3>
                <p className="mb-3 text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'Un documento formal que indica un valor de reposición al detalle, para asegurar una pieza que usted conserva. Ese número suele ser mucho más alto de lo que cualquier comprador paga — es lo que costaría un reemplazo nuevo, no lo que su pieza vale al venderla.'
                    : 'A formal document stating a retail replacement value, for insuring a piece you’re keeping. That number is typically far higher than what any buyer pays — it’s what a new replacement would cost, not what your piece sells for.'}
                </p>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'No vendemos papeleo. Si lo que realmente necesita es una tasación escrita para su seguro, se lo diremos con honestidad y le indicaremos un tasador independiente certificado.'
                    : 'We don’t sell paperwork. If a written insurance appraisal is what you actually need, we’ll say so honestly and point you to a certified independent appraiser.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="ultrawide-page mx-auto max-w-[1440px] px-4 py-20 md:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Cómo Funciona Su Tasación' : 'How Your Appraisal Works'}
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.mark} className="text-center">
                <ClayMark name={step.mark} size={88} className="mx-auto mb-5 block" />
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? `Paso ${i + 1}` : `Step ${i + 1}`}
                </p>
                <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? step.titleEs : step.titleEn}
                </h3>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-[#4d4635]">{isEs ? step.descEs : step.descEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What we appraise */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-20">
          <div className="ultrawide-page mx-auto max-w-[1440px] px-4 md:px-8">
            <h2 className="mb-10 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Qué Tasamos' : 'What We Appraise'}
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {appraiseCards.map((card) => (
                <Link
                  key={card.mark}
                  href={card.href}
                  className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <ClayMark name={card.mark} size={72} className="mb-4 block" />
                  <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? card.titleEs : card.titleEn}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? card.descEs : card.descEn}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Preguntas Sobre Tasaciones' : 'Appraisal FAQ'}
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
          {/* Guide links (2026-09-02): the identification and inheritance
              guides answer the two questions this page's visitors arrive with. */}
          <p className="mt-8 text-center text-sm leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>¿Quiere saber qué tiene antes de venir? Lea nuestra <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">guía de sellos</Link> — o, si está liquidando un patrimonio, <Link href={p('/estate-services/selling-inherited-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">qué hacer primero con joyas heredadas</Link>.</>
            ) : (
              <>Want to know what you have before you come in? Read our <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">hallmark guide</Link> — or, if you are settling an estate, <Link href={p('/estate-services/selling-inherited-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">what to do first with inherited jewelry</Link>.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="dollar" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Quiere saber qué valen sus piezas?' : 'Want to know what your pieces are worth?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Tasación gratuita, privada y sin obligación — en el salón o en su casa.'
                : 'Free, private, no-obligation appraisal — at the showroom or in your home.'}
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
