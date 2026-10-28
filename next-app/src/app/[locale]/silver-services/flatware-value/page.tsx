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

// Informational guide pressing the site's proven silver momentum (GSC 2026-08:
// pos 1.0 for "best place to sell silver flatware near me"; Google's local-pack
// justification cites the site's flatware content by name). Targets the
// "what is sterling flatware worth" query family and funnels into
// /silver-services and /free-evaluation.
//
// ⚠️ Owner framing rule (2026-08-30): only a small TOP tier of makers/patterns
// carries real collector premiums ("patterns such as Tiffany Chrysanthemum,
// Georg Jensen"). Do NOT list mid-tier makers as premium-worthy, and do NOT
// discount ordinary sets in copy either — every set gets checked against the
// collector market before it is priced. Keep that balance if this page is
// ever edited.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Guía del Valor de la Cubertería de Plata'
      : 'Sterling Silver Flatware Value Guide',
    description: isEs
      // Trimmed 2026-09-01 (measured: EN 173 → 151, ES 210 → 190 chars): Bing's
      // analyzer flagged the EN description as too long and Google truncates
      // near 160. "with a worked example" / "con ejemplo práctico" was the only
      // clause dropped — every claim stays. ES still runs long; Spanish does,
      // and Bing has not indexed the ES twin, so it was left readable rather
      // than squeezed under 160.
      ? 'Cuánto vale realmente la cubertería de plata esterlina: sellos de esterlina vs. chapado, la matemática peso × 92.5% × spot, la trampa de los cuchillos y cuándo un patrón supera la fundición.'
      : 'What sterling silver flatware is actually worth: sterling vs. plate marks, the weight × 92.5% × spot math, the knife trap, and when patterns beat melt.',
    path: '/silver-services/flatware-value',
    locale,
  });
}

export default async function FlatwareValueGuidePage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/silver-services/flatware-value`;

  const faqs = [
    {
      qEn: 'Should I polish my silver before selling it?',
      qEs: '¿Debo pulir mi plata antes de venderla?',
      aEn: 'No — leave it exactly as it is. Tarnish does not change the weight, and polishing removes a little silver every time while adding nothing to the price. We buy sets straight out of the chest.',
      aEs: 'No — déjela exactamente como está. La pátina no cambia el peso, y cada pulida quita un poco de plata sin sumar nada al precio. Compramos juegos tal como salen del cofre.',
    },
    {
      qEn: 'Do monograms lower the value?',
      qEs: '¿Los monogramas bajan el valor?',
      aEn: 'For melt value, not at all — the silver weighs the same. On collected patterns a monogram can narrow the resale market somewhat, but it matters less than sellers fear. Bring it in either way.',
      aEs: 'Para el valor de fundición, en absoluto — la plata pesa lo mismo. En patrones coleccionados un monograma puede reducir algo el mercado de reventa, pero importa menos de lo que se teme. Tráigala de todos modos.',
    },
    {
      qEn: 'Is silverplate worth anything at all?',
      qEs: '¿El chapado de plata vale algo?',
      aEn: 'As metal, essentially nothing — the silver layer is microscopic. We will identify what you have for free so you know for sure, and the better makers and forms can still carry modest decorative value.',
      aEs: 'Como metal, prácticamente nada — la capa de plata es microscópica. Le identificamos gratis lo que tiene para que lo sepa con certeza, y los mejores fabricantes y formas aún pueden tener un valor decorativo modesto.',
    },
    {
      qEn: 'Do you buy single pieces and partial sets?',
      qEs: '¿Compran piezas sueltas y juegos incompletos?',
      aEn: 'Yes — single serving pieces, partial sets, and mixed drawers. Unusual serving pieces are often the most valuable items in the box, so never assume a lone ladle is not worth the trip.',
      aEs: 'Sí — piezas de servir sueltas, juegos incompletos y cajones mixtos. Las piezas de servir inusuales suelen ser lo más valioso de la caja, así que nunca asuma que un cucharón solo no vale el viaje.',
    },
    {
      qEn: 'Who buys sterling silver flatware near me?',
      qEs: '¿Quién compra cubertería de plata esterlina cerca de mí?',
      aEn: 'We do — Naples Estate Jewelry, at our Shirley St showroom in North Naples, serving all of Southwest Florida with home visits for larger estates. Everything is weighed and priced in front of you.',
      aEs: 'Nosotros — Naples Estate Jewelry, en nuestro salón de Shirley St en North Naples, sirviendo a todo el suroeste de Florida con visitas a domicilio para patrimonios grandes. Todo se pesa y se valora frente a usted.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Vender Plata Esterlina' : 'Sell Sterling Silver', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/silver-services` },
      { '@type': 'ListItem', position: 3, name: isEs ? 'Guía del Valor de la Cubertería' : 'Flatware Value Guide', item: canonicalUrl },
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

  const sterlingMarks = [
    { markEn: 'STERLING', markEs: 'STERLING', meanEn: 'American solid silver, 925/1000', meanEs: 'Plata maciza americana, 925/1000' },
    { markEn: '925 / .925', markEs: '925 / .925', meanEn: 'The same standard, in numeric form', meanEs: 'El mismo estándar, en forma numérica' },
    { markEn: isEs ? 'León inglés' : 'Lion passant', markEs: 'León inglés (lion passant)', meanEn: 'English sterling hallmark', meanEs: 'Sello inglés de plata esterlina' },
  ];
  const plateMarks = [
    { markEn: 'EPNS / EP', markEs: 'EPNS / EP', meanEn: 'Electroplated nickel silver', meanEs: 'Alpaca electrochapada' },
    { markEn: 'IS · "Deep Silver"', markEs: 'IS · "Deep Silver"', meanEn: 'International Silver plate lines', meanEs: 'Líneas de chapado de International Silver' },
    { markEn: '"Silverplate"', markEs: '"Silverplate"', meanEn: 'Says so outright — sentiment, not melt', meanEs: 'Lo dice directamente — valor sentimental, no de fundición' },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative flex min-h-[440px] items-center overflow-hidden bg-[#1a1c1c] py-12 md:py-16">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'La Matemática Honesta · Naples, FL' : 'The Honest Math · Naples, FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? '¿Cuánto Vale Realmente la Cubertería de Plata Esterlina?' : 'What Is Sterling Silver Flatware Actually Worth?'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'El servicio para doce de la abuela está en su cofre, y cada comprador que llama cuenta una historia distinta. Así funciona el valor en realidad — la misma cuenta que hacemos en voz alta en nuestro salón de Naples — para que pueda verificar el número de cualquiera, incluido el nuestro.'
                  : "Grandmother's service for twelve is sitting in a chest, and every buyer you call tells a different story. Here is how the value really works — the same math we do out loud at our Naples showroom — so you can check anyone's number, including ours."}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'TASACIÓN GRATUITA DE CUBERTERÍA' : 'GET A FREE FLATWARE APPRAISAL'}
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

        {/* Sterling or plate */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Primero: ¿esterlina o chapado?' : 'First: sterling or plate?'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Todo depende de esto. La esterlina es plata maciza al 92.5% de principio a fin; el chapado es una capa microscópica de plata sobre metal base, y su valor de fundición es prácticamente cero. El reverso de cualquier pieza le dice cuál tiene:'
                : 'Everything depends on this. Sterling is solid 92.5% silver all the way through; silverplate is a microscopic layer of silver over base metal, and its melt value is effectively zero. The back of any piece tells you which you have:'}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Sellos que significan esterlina' : 'Marks that mean sterling'}
                </p>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {sterlingMarks.map((m) => (
                      <tr key={m.markEn} className="border-b border-[#e3dccd] last:border-b-0">
                        <td className="py-2 pr-3 font-bold text-[#1a1c1c]">{isEs ? m.markEs : m.markEn}</td>
                        <td className="py-2 text-[#4d4635]">{isEs ? m.meanEs : m.meanEn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#993c1d]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Sellos que significan chapado' : 'Marks that mean plate'}
                </p>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {plateMarks.map((m) => (
                      <tr key={m.markEn} className="border-b border-[#e3dccd] last:border-b-0">
                        <td className="py-2 pr-3 font-bold text-[#1a1c1c]">{isEs ? m.markEs : m.markEn}</td>
                        <td className="py-2 text-[#4d4635]">{isEs ? m.meanEs : m.meanEn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* The math */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'La matemática detrás de toda oferta honesta' : 'The math every honest offer starts from'}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'La fórmula' : 'The formula'}
              </p>
              <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'peso × 92.5% × precio spot' : 'weight × 92.5% × spot price'}
              </p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'El spot de la plata se cotiza por onza troy (31.1 g). La esterlina es 92.5% fina, así que una onza troy pesada de esterlina contiene 0.925 oz de plata real.'
                  : 'Silver spot is quoted per troy ounce (31.1 g). Sterling is 92.5% fine, so a weighed troy ounce of sterling carries 0.925 oz of actual silver.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Ejemplo práctico' : 'Worked example'}
              </p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Las piezas totalmente de esterlina de un servicio para doce — tenedores, cucharas y piezas de servir — pesan 58 onzas troy. Eso es 58 × 92.5% ≈ 53.7 oz de plata fina. Con el spot a un precio ilustrativo de $35, el valor de fundición es 53.7 × $35 ≈ $1,880. Ese valor de fundición es el piso sobre el que se construye una oferta honesta.'
                  : 'The all-sterling pieces of a service for twelve — forks, spoons, and serving pieces — weigh 58 troy oz. That is 58 × 92.5% ≈ 53.7 oz of fine silver. With spot at an illustrative $35 per ounce, melt value is 53.7 × $35 ≈ $1,880. That melt figure is the floor an honest offer is built on.'}
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#993c1d]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'La trampa de los cuchillos' : 'The knife trap'}
            </p>
            <p className="text-sm leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Los cuchillos parecen pesados pero por dentro casi no son plata: el mango es una capa fina de esterlina sobre relleno de cemento, y la hoja es de acero inoxidable. Un comprador que pesa los cuchillos enteros junto con los tenedores está inflando la báscula para justificar una tarifa menor por onza. Nosotros pesamos los cuchillos por separado y le decimos exactamente cómo se cuentan.'
                : "Knives look heavy but usually aren't silver inside: the handle is a thin sterling shell over cement filler, and the blade is stainless steel. A buyer who weighs whole knives in with the forks is padding the scale to justify a lower per-ounce rate. We weigh knives separately and tell you exactly how they are counted."}
            </p>
          </div>
        </section>

        {/* Above melt */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Cuándo la cubertería vale más que la fundición' : 'When flatware is worth more than melt'}
            </h2>
            <p className="mb-4 max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'La fundición es el piso, no el techo. Un pequeño grupo de primer nivel — patrones como Tiffany Chrysanthemum, los diseños de Georg Jensen y nombres de ese calibre — puede alcanzar verdaderas primas de colección, y las piezas de servir inusuales (tijeras para uvas, cucharones de ponche, juegos de pescado) a veces superan a un cajón entero de cucharas.'
                : 'Melt is the floor, not the ceiling. A small top tier — patterns such as Tiffany Chrysanthemum, Georg Jensen designs, and names of that caliber — can carry genuine collector premiums, and unusual serving pieces (grape shears, punch ladles, fish sets) sometimes outdo an entire drawer of spoons.'}
            </p>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>No hay forma de saberlo desde una lista. Cotejamos cada juego contra el mercado de coleccionistas antes de valorarlo como plata — frente a usted, gratis y en minutos. Esa revisión es la diferencia entre un comprador de plata y un <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">especialista en plata de patrimonio</Link>.</>
              ) : (
                <>There is no way to know from a list. We check every set against the collector market before we price it as silver — in front of you, free, in minutes. That check is the difference between a scrap buyer and an <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">estate silver specialist</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Preguntas Sobre el Valor de la Cubertería' : 'Flatware Value FAQ'}
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
              <>¿Prefiere una respuesta sobre sus piezas y no en general? La <Link href={p('/jewelry-appraisal')} className="font-semibold text-[#735c00] underline underline-offset-2">tasación es gratuita</Link> y sin cita.</>
            ) : (
              <>Rather have an answer about your set than in general? The <Link href={p('/jewelry-appraisal')} className="font-semibold text-[#735c00] underline underline-offset-2">appraisal is free</Link>, no appointment needed.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="sterling-flatware" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Listo para saber qué vale su juego?' : 'Ready to find out what your set is worth?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Pesado, probado y valorado frente a usted — en el salón de Naples o en su casa.'
                : 'Weighed, tested, and priced in front of you — at the Naples showroom or in your home.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <Link href={evalHref} className="gold-button">
                {isEs ? 'PROGRAMAR TASACIÓN' : 'SCHEDULE A FREE APPRAISAL'}
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
