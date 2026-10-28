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

// Seller-intent lander for the watch query cluster (GSC, 16 months to
// 2026-09-01: "sell jewelry watch naples", "fort myers cartier watch buyer",
// "sell rolex submariner fort myers", "vintage watch buyer near me", "sell
// watches for cash" — impressions with no page to land on). Watches were the
// one category the site buys with no service page: every /sell/[city] card
// said "Rolex, Omega, Cartier, and vintage timepieces, running or not, with or
// without box and papers" and linked nowhere. Built 2026-09-01 on the
// /diamond-buyers template. ⚠️ Every claim here already existed on the site
// (city cards, /free-evaluation, the FAQ's signed-brand list) or is an
// objective secondary-market fact; nothing about the owner's pricing,
// authentication tooling, or brand preferences was invented. Add specifics
// only with the owner's word.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Vender Relojes en Naples, FL' : 'Sell Watches in Naples, FL',
    // Phone added 2026-09-08 (it was the one buy-side lander without it);
    // ≤ ~155 characters with the number last — see DECISIONS.md.
    description: isEs
      ? 'Venda relojes en Naples, FL — Rolex, Omega, Cartier y vintage; funcionen o no, con o sin papeles. Pago en el acto. Llame al (239) 404-8505.'
      : 'Sell watches in Naples, FL — Rolex, Omega, Cartier, vintage; running or not, papers or not. Private evaluation, paid on the spot. Call (239) 404-8505.',
    path: '/watch-buyers',
    locale,
  });
}

export default async function WatchBuyersPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/watch-buyers`;

  const factors = [
    {
      kEn: 'The watch',
      kEs: 'El reloj',
      titleEn: 'Reference, condition, originality',
      titleEs: 'Referencia, condición, originalidad',
      descEn: 'The exact model and reference, whether it runs and keeps time, the state of the case and dial, and whether the parts are original. We go through it in front of you and tell you what we see.',
      descEs: 'El modelo y la referencia exactos, si funciona y mantiene la hora, el estado de la caja y la esfera, y si las piezas son originales. Lo revisamos frente a usted y le decimos lo que vemos.',
    },
    {
      kEn: 'The paperwork',
      kEs: 'La documentación',
      titleEn: 'Box and papers help — they are not required',
      titleEs: 'La caja y los papeles ayudan — no son obligatorios',
      descEn: 'A complete set — box, warranty card, service records — adds real value and makes authentication faster. A watch on its own is still very sellable; we buy them that way regularly.',
      descEs: 'Un juego completo — caja, tarjeta de garantía, registros de servicio — añade valor real y agiliza la autenticación. Un reloj solo sigue siendo muy vendible; los compramos así con regularidad.',
    },
    {
      kEn: 'The market',
      kEs: 'El mercado',
      titleEn: 'Real secondary-market demand',
      titleEs: 'Demanda real del mercado secundario',
      descEn: 'Models move differently: a steel sports Rolex is in constant demand, while a gold dress watch or a lesser-known name moves more slowly. We buy against today’s actual market, not a decade-old price list.',
      descEs: 'Los modelos se mueven distinto: un Rolex deportivo de acero tiene demanda constante, mientras que un reloj de vestir en oro o una marca menos conocida se mueve más despacio. Compramos según el mercado real de hoy, no según una lista de precios de hace una década.',
    },
  ] as const;

  const faqs = [
    {
      qEn: 'Do I need the box and papers to sell my watch?',
      qEs: '¿Necesito la caja y los papeles para vender mi reloj?',
      aEn: 'No. They add value and make authentication faster, so bring them if you have them — but we regularly buy watches with neither.',
      aEs: 'No. Añaden valor y agilizan la autenticación, así que tráigalos si los tiene — pero compramos con regularidad relojes sin ninguno de los dos.',
    },
    {
      qEn: 'Do you buy watches that are not running?',
      qEs: '¿Compran relojes que no funcionan?',
      aEn: 'Yes — running or not. A watch that has stopped still has value in its case, movement, and name; we price it honestly for what it is and tell you why.',
      aEs: 'Sí — funcionen o no. Un reloj parado sigue teniendo valor en su caja, su movimiento y su nombre; lo valoramos con honestidad por lo que es y le explicamos por qué.',
    },
    {
      qEn: 'Which watch brands do you buy?',
      qEs: '¿Qué marcas de relojes compran?',
      aEn: 'Rolex, Omega, Cartier, Patek Philippe, and vintage timepieces are the ones we see most. If you are not sure what you have, bring it in — the evaluation is free and there is no obligation.',
      aEs: 'Rolex, Omega, Cartier, Patek Philippe y relojes vintage son los que más vemos. Si no está seguro de lo que tiene, tráigalo — la evaluación es gratuita y sin compromiso.',
    },
    {
      qEn: 'Why is the offer below what the watch cost new?',
      qEs: '¿Por qué la oferta es menor de lo que costó el reloj nuevo?',
      aEn: 'A retail price carries the brand’s margin and the retailer’s. Resale is a different market, and on most models any honest buyer’s offer will sit below the retail number. We would rather explain the difference than surprise you with it.',
      aEs: 'Un precio de venta al público incluye el margen de la marca y el del minorista. La reventa es un mercado distinto, y en la mayoría de los modelos la oferta honesta de cualquier comprador estará por debajo del precio de tienda. Preferimos explicar la diferencia antes que sorprenderlo con ella.',
    },
    {
      qEn: 'Where can I sell a Rolex in Naples?',
      qEs: '¿Dónde puedo vender un Rolex en Naples?',
      aEn: 'At our Shirley St showroom in North Naples — walk in during open hours, or book a private appointment, including home visits across Southwest Florida. Examined and priced in front of you, paid on the spot.',
      aEs: 'En nuestro salón de Shirley St en North Naples — entre durante el horario de atención o reserve una cita privada, incluidas visitas a domicilio en todo el suroeste de Florida. Revisado y valorado frente a usted, con pago en el acto.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Vender Relojes' : 'Sell Watches', item: canonicalUrl },
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
        <section className="relative flex min-h-[460px] items-center overflow-hidden bg-[#1a1c1c] py-12 md:py-16">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Privado · Discreto · Pago en el Acto' : 'Private · Discreet · Paid on the Spot'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'Venda Relojes en Naples — Rolex, Omega, Cartier y Vintage' : 'Sell Watches in Naples — Rolex, Omega, Cartier & Vintage'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Relojes de lujo y vintage — funcionen o no, con o sin caja y papeles. Una evaluación privada con el razonamiento explicado abiertamente, y el pago en el momento en que acepta. Un reloj suele ser lo más personal de un patrimonio; lo mantenemos sin prisas y enteramente en sus términos.'
                  : 'Luxury and vintage watches — running or not, with or without box and papers. A private evaluation with the reasoning explained openly, and payment the moment you accept. A watch is often the most personal thing in an estate; we keep it unhurried and entirely on your terms.'}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'TASACIÓN GRATUITA DE RELOJES' : 'GET A FREE WATCH APPRAISAL'}
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
              {isEs ? 'Lo que un reloj realmente vale al venderlo' : 'What a watch is really worth when you sell'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Lo que pagó — o lo que cuesta uno nuevo en la tienda — no es el número de reventa, y quien no se lo diga lo está preparando para una decepción. Lo que realmente determina su oferta:'
                : "What you paid — or what a new one costs at retail — is not the resale number, and anyone who won't say so is setting you up for disappointment. What actually drives your offer:"}
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
          </div>
        </section>

        {/* Life's timeline */}
        <section className="mx-auto max-w-3xl px-4 py-16 text-center md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Se vende en los tiempos de la vida' : "Sold on life's timeline"}
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'El Rolex de un padre que llegó con la herencia, un reloj comprado para una ocasión y usado dos veces, una mejora que dejó el anterior en un cajón. Sea lo que sea que lo traiga, la evaluación ocurre en privado, a su ritmo, sin juicios y sin presión — y usted se va con el pago en la mano o con el reloj en la muñeca, nunca con un "tal vez".'
              : 'A father’s Rolex that came with the estate, a watch bought for a milestone and worn twice, an upgrade that left the old one in a drawer. Whatever brings you in, the evaluation happens in private, at your pace, with no judgment and no pressure — and you leave with payment in hand or your watch still on your wrist, never a maybe.'}
          </p>
        </section>

        {/* FAQ */}
        <section className="border-t border-[#d0c5af] bg-[#f3f3f3] py-20">
          <div className="mx-auto max-w-3xl px-4 md:px-8">
            <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Preguntas Sobre Vender Relojes' : 'Selling Watches FAQ'}
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
                <>¿Vende más que un reloj? También compramos <Link href={p('/gold-services')} className="font-semibold text-[#735c00] underline underline-offset-2">oro</Link>, <Link href={p('/diamond-buyers')} className="font-semibold text-[#735c00] underline underline-offset-2">diamantes</Link>, <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">plata esterlina</Link> y <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">joyería de patrimonio</Link>.</>
              ) : (
                <>Selling more than a watch? We also buy <Link href={p('/gold-services')} className="font-semibold text-[#735c00] underline underline-offset-2">gold</Link>, <Link href={p('/diamond-buyers')} className="font-semibold text-[#735c00] underline underline-offset-2">diamonds</Link>, <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">sterling silver</Link>, and <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">estate jewelry</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="watch" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Listo para un número honesto por su reloj?' : 'Ready for an honest number on your watch?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Evaluación gratuita, privada y sin obligación — en el salón o en su casa.'
                : 'Free, private, no-obligation evaluation — at the showroom or in your home.'}
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
