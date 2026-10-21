import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import { SERVICE_AREAS } from '@/lib/service-areas';
import { phoneHoursLabel } from '@/lib/business-location';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import ClayMark from '@/components/ClayMark';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  // Trimmed 2026-08-16: was "…& Sterling Silver in Southwest Florida", which
  // rendered at 81 characters with the brand suffix — the longest title on the
  // site, truncating mid-brand. "Sterling" is carried by /silver-services,
  // which is the page that should rank for it.
  const title = isEs
    ? 'Vender Oro, Joyería y Plata en el Suroeste de Florida'
    : 'Sell Gold, Jewelry & Silver in Southwest Florida';
  const description = isEs
    ? 'Venda joyería, oro, plata esterlina y cubertería en Naples y el suroeste de Florida. Evaluación gratis en el salón o a domicilio: (239) 404-8505.'
    : 'Sell jewelry, gold, sterling silver and flatware in Naples and Southwest Florida. Free showroom or home evaluations. Call (239) 404-8505.';
  // Was a hand-rolled openGraph block with no `images`, which meant this page —
  // one of the most shared on the site — posted a BLANK card. pageMetadata
  // restores the image, siteName, locale and the matching twitter tags.
  return pageMetadata({ title, description, path: '/sell', locale });
}

export default async function SellHubPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);

  const buyCategories = [
    { mark: 'gold-seal', en: 'Sell Gold', es: 'Vender Oro', href: '/gold-services' },
    { mark: 'sterling-flatware', en: 'Sell Sterling Silver', es: 'Vender Plata Esterlina', href: '/silver-services' },
    { mark: 'signet-ring', en: 'Sell Estate Jewelry', es: 'Vender Joyería de Patrimonio', href: '/estate-jewelry' },
    { mark: 'coins', en: 'Sell Coins & Bullion', es: 'Vender Monedas y Lingotes', href: '/bullion' },
  ] as const;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Vender' : 'Sell', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/sell` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative flex min-h-[480px] items-center overflow-hidden bg-[#1a1c1c]">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Compramos en Todo el Suroeste de Florida' : 'We Buy Across Southwest Florida'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs
                  ? 'Venda Oro, Joyería y Plata Esterlina'
                  : 'Sell Gold, Jewelry & Sterling Silver'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Compramos joyería, oro, plata esterlina y cubertería, desde una sola pieza hasta una colección heredada. También compramos monedas y relojes. Evaluación gratuita y pago inmediato al llegar a un acuerdo — en nuestro salón de Naples o en su casa.'
                  : 'We buy jewelry, gold, sterling silver and flatware, from a single piece to an inherited collection. We also buy coins and watches. Free evaluation and immediate payment upon agreement — at our Naples showroom or at your home.'}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={p('/free-evaluation')} className="gold-button">
                  {isEs ? 'TASACIÓN GRATUITA' : 'GET A FREE ESTIMATE'}
                </Link>
                <a
                  href="tel:2394048505"
                  className="outline-button"
                  style={{ borderColor: 'rgba(255,255,255,0.48)', color: 'white', background: 'rgba(255,255,255,0.08)' }}
                >
                  {isEs ? 'LLAMAR (239) 404-8505' : 'CALL (239) 404-8505'}
                </a>
              </div>
              <p className="mt-4 text-sm text-[#d7d0c3]">{phoneHoursLabel(isEs)}</p>
            </div>
          </div>
        </section>

        {/* What we buy */}
        <section className="ultrawide-page mx-auto max-w-[1440px] px-4 py-20 md:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Qué Compramos' : 'What We Buy'}
          </h2>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {buyCategories.map((c) => (
              <Link
                key={c.href}
                href={p(c.href)}
                className="group flex flex-col items-center rounded-2xl border border-[#d0c5af] bg-white p-8 text-center shadow-[0_14px_38px_rgba(38,28,6,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                <ClayMark name={c.mark} size={104} className="mb-4" />
                <span className="text-base font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? c.es : c.en}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Value guide — the math behind an offer. Added 2026-08-29 to deepen
            the hub: it sat at ~444 words, thinner than its own city pages.
            ⛔ This content lives HERE and only here. Adding it to the six
            /sell/[city] pages would raise their already-high shared-content
            ratio — the city pages LINK here instead. Purities are the exact
            karat fractions (14/24 = 58.3%; the "585" stamp is the European
            fineness mark). The worked example uses an ILLUSTRATIVE spot price
            and says so — never let it read as a live quote. */}
        <section className="border-t border-[#d0c5af]">
          <div className="ultrawide-page mx-auto max-w-[1440px] px-4 py-20 md:px-8">
            <h2 className="mb-3 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Lo Que Realmente Vale Su Oro' : 'What Your Gold Is Actually Worth'}
            </h2>
            <p className="mx-auto mb-12 max-w-xl text-center text-sm leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Cada oferta que reciba parte de los mismos tres números: el peso, la pureza y el precio spot del día. Esta es la matemática que nadie le muestra — para que pueda verificar el número de cualquier comprador, incluido el nuestro.'
                : 'Every offer you will ever get starts from the same three numbers: weight, purity, and the live spot price. Here is the math no one shows you — so you can check any buyer’s number, including ours.'}
            </p>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)] md:p-8">
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Pureza según el sello' : 'Purity by mark'}
                </h3>
                <table className="w-full border-collapse text-sm text-[#1a1c1c]">
                  <thead>
                    <tr className="border-b border-[#d0c5af] text-left">
                      <th scope="col" className="py-2 pr-4 font-bold">{isEs ? 'Sello' : 'Mark'}</th>
                      <th scope="col" className="py-2 text-right font-bold">{isEs ? 'Metal fino' : 'Fine metal content'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#e2e2e2]"><th scope="row" className="py-2 pr-4 text-left font-semibold">10k</th><td className="py-2 text-right text-[#4d4635]">{isEs ? '41.7% de oro' : '41.7% gold'}</td></tr>
                    <tr className="border-b border-[#e2e2e2]"><th scope="row" className="py-2 pr-4 text-left font-semibold">14k (585)</th><td className="py-2 text-right text-[#4d4635]">{isEs ? '58.3% de oro' : '58.3% gold'}</td></tr>
                    <tr className="border-b border-[#e2e2e2]"><th scope="row" className="py-2 pr-4 text-left font-semibold">18k (750)</th><td className="py-2 text-right text-[#4d4635]">{isEs ? '75.0% de oro' : '75.0% gold'}</td></tr>
                    <tr className="border-b border-[#e2e2e2]"><th scope="row" className="py-2 pr-4 text-left font-semibold">22k</th><td className="py-2 text-right text-[#4d4635]">{isEs ? '91.7% de oro' : '91.7% gold'}</td></tr>
                    <tr className="border-b border-[#e2e2e2]"><th scope="row" className="py-2 pr-4 text-left font-semibold">24k</th><td className="py-2 text-right text-[#4d4635]">{isEs ? '99.9% de oro' : '99.9% gold'}</td></tr>
                    <tr><th scope="row" className="py-2 pr-4 text-left font-semibold">{isEs ? 'Esterlina (925)' : 'Sterling (925)'}</th><td className="py-2 text-right text-[#4d4635]">{isEs ? '92.5% de plata' : '92.5% silver'}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-6">
                <div className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)] md:p-8">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                    {isEs ? 'La fórmula' : 'The formula'}
                  </h3>
                  <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? 'peso × pureza × precio spot' : 'weight × purity × spot price'}
                  </p>
                  <p className="text-sm leading-relaxed text-[#4d4635]">
                    {isEs
                      ? 'El spot se cotiza por onza troy — 31.1 gramos, algo más pesada que la onza común. Divida el precio spot entre 31.1 para obtener la tarifa por gramo.'
                      : 'Spot is quoted per troy ounce — 31.1 grams, a little heavier than a kitchen ounce. Divide the spot price by 31.1 for the per-gram rate.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)] md:p-8">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                    {isEs ? 'Ejemplo práctico' : 'Worked example'}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#4d4635]">
                    {isEs
                      ? 'Una cadena de 14k de 20 gramos contiene 20 × 58.3% ≈ 11.7 gramos de oro puro. Con el spot a un precio ilustrativo de $2,600 por onza, su valor de fundición es 11.7 × ($2,600 ÷ 31.1) ≈ $978. Ese valor de fundición es el piso sobre el que se construye una oferta honesta.'
                      : 'A 20-gram 14k chain holds 20 × 58.3% ≈ 11.7 grams of pure gold. With spot at an illustrative $2,600 per ounce, its melt value is 11.7 × ($2,600 ÷ 31.1) ≈ $978. That melt figure is the floor an honest offer is built on.'}
                  </p>
                </div>
              </div>
            </div>

            <p className="mx-auto mt-10 max-w-3xl text-center text-base leading-relaxed text-[#1a1c1c]">
              {isEs
                ? 'La fundición es el piso, no el techo. Las piezas firmadas, antiguas y de colección pueden valer bastante más intactas — y así las valoramos. Esa es la diferencia entre un comprador de oro y un comprador de joyería de patrimonio.'
                : 'Melt is the floor, not the ceiling. Signed, antique, and collectible pieces can be worth well more intact — and we price them that way. That is the difference between a gold buyer and an estate jewelry buyer.'}
            </p>
            {/* Guide links (2026-09-02): this section is the teaser; the full
                treatments live on the guide pages. */}
            <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>Guías completas: <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su oro</Link> · <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale la cubertería de plata</Link> · <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">cómo leer los sellos</Link> · <Link href={p('/estate-services/selling-inherited-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">vender joyas heredadas</Link> · <Link href={p('/sell/dont-melt-it')} className="font-semibold text-[#735c00] underline underline-offset-2">por qué no debe fundirla todavía</Link>.</>
              ) : (
                <>Full guides: <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your gold is worth</Link> · <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">what sterling flatware is worth</Link> · <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">how to read hallmarks</Link> · <Link href={p('/estate-services/selling-inherited-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">selling inherited jewelry</Link> · <Link href={p('/sell/dont-melt-it')} className="font-semibold text-[#735c00] underline underline-offset-2">why you shouldn’t melt it yet</Link>.</>
              )}
            </p>

            <h2 className="mb-8 mt-16 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Antes de Vender' : 'Before You Sell'}
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'Traiga todo' : 'Bring everything'}
                </h3>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs ? (
                    <>Cadenas rotas, aretes sueltos, oro dental, anillos de graduación, piezas sin sello, cajas de relojes de oro — el valor está en el metal, no en la condición. La <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline">cubertería de plata esterlina</Link> también cuenta, incluso los juegos incompletos. Y traiga una identificación oficial con foto — Florida la exige cuando compramos metales preciosos.</>
                  ) : (
                    <>Broken chains, single earrings, dental gold, class rings, unmarked pieces, gold watch cases — the value is in the metal, not the condition. <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline">Sterling silver flatware</Link> counts too, even incomplete sets. And bring a government photo ID — Florida requires it when we buy precious metals.</>
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'No limpie nada' : 'Don’t clean anything'}
                </h3>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs ? (
                    <>Nunca limpie una <Link href={p('/bullion')} className="font-semibold text-[#735c00] underline">moneda de colección</Link> — los coleccionistas pagan por las superficies originales, y una moneda limpiada vale menos de forma permanente. No pula la plata ni pague reparaciones antes de vender; ninguna de las dos suma un dólar a la oferta.</>
                  ) : (
                    <>Never clean a <Link href={p('/bullion')} className="font-semibold text-[#735c00] underline">collectible coin</Link> — collectors pay for original surfaces, and a cleaned coin is permanently worth less. Skip polishing sterling and skip pre-sale repairs; neither adds a dollar to the offer.</>
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'Por qué las ofertas varían' : 'Why offers differ'}
                </h3>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'Todos los compradores ven el mismo precio spot. La única variable es el porcentaje de la fundición que realmente pagan — el margen. Conociendo la matemática de arriba, puede escuchar una oferta y saber exactamente qué parte se está quedando el comprador.'
                    : 'Every buyer watches the same spot price. The only variable is the percentage of melt they actually pay — the spread. Once you know the math above, you can hear an offer and know exactly what cut is being kept.'}
                </p>
              </div>
            </div>

            <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-[#1a1c1c]">
              {isEs ? (
                <>Nosotros hacemos la cuenta en voz alta — el peso en la báscula frente a usted, la pureza probada frente a usted y el spot del día en la pantalla. Traiga sus piezas al salón o <Link href={p('/free-evaluation')} className="font-semibold text-[#735c00] underline">agende una tasación gratuita</Link>.</>
              ) : (
                <>We do the math out loud — weight on the scale in front of you, purity tested in front of you, and the day’s spot on the screen. Bring your pieces by the showroom, or <Link href={p('/free-evaluation')} className="font-semibold text-[#735c00] underline">book a free appraisal</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* Areas we serve */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-20">
          <div className="ultrawide-page mx-auto max-w-[1440px] px-4 md:px-8">
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'Áreas que Servimos' : 'Areas We Serve'}
              </h2>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Elija su ciudad para ver cómo compramos oro, joyería y plata localmente.'
                  : 'Choose your city to see how we buy gold, jewelry, and silver locally.'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICE_AREAS.map((a) => (
                <Link
                  key={a.slug}
                  href={p(`/sell/${a.slug}`)}
                  className="group rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <h3 className="mb-1 text-xl font-bold text-[#1a1c1c] group-hover:text-[#735c00]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? `Vender en ${a.city}, ${a.region}` : `Sell in ${a.city}, ${a.region}`}
                  </h3>
                  <p className="text-xs text-[#4d4635]" style={{ fontFamily: 'var(--font-label)' }}>
                    {a.nearby.slice(0, 4).join(' · ')}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Descubra lo que valen sus artículos' : 'Find out what your items are worth'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Evaluación gratuita y sin obligación en todo el suroeste de Florida.'
                : 'Free, no-obligation evaluation throughout Southwest Florida.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <Link href={p('/free-evaluation')} className="gold-button">
                {isEs ? 'PROGRAMAR CITA' : 'SCHEDULE APPOINTMENT'}
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
