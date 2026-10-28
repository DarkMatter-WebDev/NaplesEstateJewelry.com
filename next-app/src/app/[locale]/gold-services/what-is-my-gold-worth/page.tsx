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

// Informational guide for the "what is my gold worth" query family — the gold
// side of /silver-services/flatware-value (2026-09-01, first of three guides).
// Funnels into /gold-services and /free-evaluation. Every number here is the
// SAME number the site already uses: karat fractions from the /sell value
// guide and /gold-services karat cards, troy ounce 31.1 g, and the identical
// worked example (20 g 14k chain, illustrative $2,600 spot → ≈ $978) so the
// two pages can never disagree. ⚠️ The spot figure is ILLUSTRATIVE and says so
// — never let it read as a live quote. ⚠️ No buyer margin percentage is stated
// anywhere; the owner has never published one and this page must not invent
// it. "Gold-filled / plated is not bought as gold" follows from pricing by gold
// content, not from a claim about the owner's counter. ⚠️ Dental gold: the
// owner CANNOT determine its karat in the shop — it is sent out for testing
// before purchase (owner, 2026-09-02); never let this page imply an on-the-spot
// dental offer.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? '¿Cuánto Vale Mi Oro?' : 'What Is My Gold Worth?',
    description: isEs
      ? 'Lo que su oro vale realmente al venderlo: la pureza según el sello (8k–24k), la matemática peso × pureza × spot con ejemplo, y cuándo una pieza vale más que la fundición.'
      : 'What your gold is actually worth when you sell: purity by mark (8k–24k), the weight × purity × spot math with a worked example, and when a piece beats melt.',
    path: '/gold-services/what-is-my-gold-worth',
    locale,
  });
}

export default async function GoldWorthGuidePage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/gold-services/what-is-my-gold-worth`;

  // Owner, 2026-09-02: include the low and obscure karats (9k and below, the
  // odd British / Middle Eastern / Thai standards) and the two marks people
  // misread most — "14K HGE" (plated, not 14k) and "14KP" (plumb, not plated).
  const karats = [
    { mark: '8k · 333', fineEn: '33.3% gold', fineEs: '33.3% de oro' },
    { mark: '9k · 375', fineEn: '37.5% gold', fineEs: '37.5% de oro' },
    { mark: '10k · 417', fineEn: '41.7% gold', fineEs: '41.7% de oro' },
    { mark: '12k · 500', fineEn: '50.0% gold', fineEs: '50.0% de oro' },
    { mark: '14k · 585', fineEn: '58.3% gold', fineEs: '58.3% de oro' },
    { mark: '15k · 625', fineEn: '62.5% gold', fineEs: '62.5% de oro' },
    { mark: '18k · 750', fineEn: '75.0% gold', fineEs: '75.0% de oro' },
    { mark: '20k · 833', fineEn: '83.3% gold', fineEs: '83.3% de oro' },
    { mark: '21k · 875', fineEn: '87.5% gold', fineEs: '87.5% de oro' },
    { mark: '22k · 916', fineEn: '91.7% gold', fineEs: '91.7% de oro' },
    { mark: '23k · 958', fineEn: '95.8% gold', fineEs: '95.8% de oro' },
    { mark: '24k · 999', fineEn: '99.9% gold', fineEs: '99.9% de oro' },
    { mark: '14KP · 18KP', fineEn: 'plumb — exactly 14k / 18k', fineEs: 'plumb — exactamente 14k / 18k' },
  ];
  const notGold = [
    { mark: 'GF · 1/20 12K GF', meanEn: 'Gold-filled — a bonded layer, a few percent gold by weight', meanEs: 'Gold-filled — una capa unida, un pequeño porcentaje de oro por peso' },
    { mark: 'GP · GEP', meanEn: 'Gold-plated / electroplate — a microscopic layer, no melt value', meanEs: 'Chapado / electrochapado — una capa microscópica, sin valor de fundición' },
    { mark: '14K HGE · 18K HGE', meanEn: 'Heavy gold electroplate — the karat describes the plating, not the piece; base metal underneath, no melt value', meanEs: 'Electrochapado grueso — el quilate describe el baño, no la pieza; metal base debajo, sin valor de fundición' },
    { mark: 'RGP', meanEn: 'Rolled gold plate — the same idea as gold-filled, thinner', meanEs: 'Rolled gold plate — la misma idea que gold-filled, más delgado' },
    { mark: isEs ? 'Vermeil' : 'Vermeil', meanEn: 'Gold over sterling silver — the silver counts, the gold layer does not', meanEs: 'Oro sobre plata esterlina — la plata cuenta, la capa de oro no' },
  ];

  const faqs = [
    {
      qEn: 'Is 10k gold worth selling?',
      qEs: '¿Vale la pena vender oro de 10k?',
      aEn: 'Yes. 10k is 41.7% gold, so a piece is worth a little under half of what the same weight in 24k would bring — but it is real gold and it is priced by weight like everything else. Class rings and older chains are often 10k.',
      aEs: 'Sí. El 10k es 41.7% oro, así que una pieza vale algo menos de la mitad de lo que daría el mismo peso en 24k — pero es oro real y se valora por peso como todo lo demás. Los anillos de graduación y las cadenas antiguas suelen ser de 10k.',
    },
    {
      qEn: 'Do you buy gold-plated or gold-filled jewelry?',
      qEs: '¿Compran joyería chapada en oro o gold-filled?',
      aEn: 'We will identify it for free so you know for certain. Priced by gold content, plated pieces carry effectively none and gold-filled only a trace, so neither is bought as gold — but a plated piece can still be signed, antique, or collectible, and that is a different conversation.',
      aEs: 'Lo identificamos gratis para que lo sepa con certeza. Valorado por contenido de oro, el chapado prácticamente no tiene y el gold-filled apenas una traza, así que ninguno se compra como oro — pero una pieza chapada aún puede ser firmada, antigua o de colección, y esa es otra conversación.',
    },
    {
      qEn: 'What about dental gold?',
      qEs: '¿Y el oro dental?',
      aEn: 'Crowns, bridges, and dental alloys are real gold alloys and we buy them — but dental alloys vary widely, and the exact karat cannot be determined in the shop. We send dental gold out for testing to establish the exact karat before we buy, and the offer is set from that result rather than an estimate.',
      aEs: 'Las coronas, los puentes y las aleaciones dentales son aleaciones de oro reales y las compramos — pero varían mucho, y el quilate exacto no se puede determinar en la tienda. Enviamos el oro dental a analizar para establecer el quilate exacto antes de comprarlo, y la oferta se fija según ese resultado, no según una estimación.',
    },
    {
      qEn: 'Does the offer change with the gold price?',
      qEs: '¿La oferta cambia con el precio del oro?',
      aEn: 'Yes — every offer starts from the live spot price on the day you sell, which is why the number on a piece is not fixed. We show the live gold price on our gold page so you can see the market we are pricing against.',
      aEs: 'Sí — toda oferta parte del precio spot en vivo del día en que vende, por eso el número de una pieza no es fijo. Mostramos el precio del oro en vivo en nuestra página de oro para que vea el mercado contra el que valoramos.',
    },
    {
      qEn: 'Where can I sell gold in Naples?',
      qEs: '¿Dónde puedo vender oro en Naples?',
      aEn: 'At our Shirley St showroom in North Naples — walk in during open hours or book a private appointment, with home visits across Southwest Florida on request. Every piece is tested, weighed, and priced in front of you, and paid on the spot.',
      aEs: 'En nuestro salón de Shirley St en North Naples — entre durante el horario de atención o reserve una cita privada, con visitas a domicilio en todo el suroeste de Florida a pedido. Cada pieza se prueba, se pesa y se valora frente a usted, con pago en el acto.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Vender Oro' : 'Sell Gold', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/gold-services` },
      { '@type': 'ListItem', position: 3, name: isEs ? '¿Cuánto Vale Mi Oro?' : 'What Is My Gold Worth?', item: canonicalUrl },
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
        <section className="relative flex min-h-[440px] items-center overflow-hidden bg-[#1a1c1c] py-12 md:py-16">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'La Matemática Honesta · Naples, FL' : 'The Honest Math · Naples, FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? '¿Cuánto Vale Realmente Su Oro?' : 'What Is Your Gold Actually Worth?'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Un cajón de cadenas, un anillo de graduación, una pulsera rota — y cada comprador dice un número distinto. Así funciona el valor en realidad: la misma cuenta que hacemos en voz alta en nuestro salón de Naples, para que pueda verificar la oferta de cualquiera, incluida la nuestra.'
                  : "A drawer of chains, a class ring, a broken bracelet — and every buyer names a different number. Here is how the value really works: the same math we do out loud at our Naples showroom, so you can check anyone's offer, including ours."}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'TASACIÓN GRATUITA DE ORO' : 'GET A FREE GOLD APPRAISAL'}
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

        {/* Karat */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Primero: ¿de qué quilate es?' : 'First: what karat is it?'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Casi ningún oro de joyería es puro — se alea para que dure. El quilate indica cuánto del peso es oro real, y el sello suele estar en el cierre, el interior del anillo o el reverso del broche. Los números europeos (585, 750) dicen lo mismo en partes por mil.'
                : "Almost no jewelry gold is pure — it is alloyed to make it durable. The karat says how much of the weight is real gold, and the stamp is usually on the clasp, inside the ring, or on the back of the brooch. European numbers (585, 750) say the same thing in parts per thousand."}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Pureza según el sello' : 'Purity by mark'}
                </p>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {karats.map((k) => (
                      <tr key={k.mark} className="border-b border-[#e3dccd] last:border-b-0">
                        <td className="py-2 pr-3 font-bold text-[#1a1c1c]">{k.mark}</td>
                        <td className="py-2 text-right text-[#4d4635]">{isEs ? k.fineEs : k.fineEn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#993c1d]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Sellos que NO significan oro macizo' : 'Marks that do NOT mean solid gold'}
                </p>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {notGold.map((m) => (
                      <tr key={m.mark} className="border-b border-[#e3dccd] last:border-b-0">
                        <td className="py-2 pr-3 font-bold text-[#1a1c1c]">{m.mark}</td>
                        <td className="py-2 text-[#4d4635]">{isEs ? m.meanEs : m.meanEn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Por debajo de 10k — 8k (333) y 9k (375) — es común en piezas británicas, irlandesas, australianas y europeas antiguas: es oro real, valorado por su contenido menor, aunque en EE. UU. no pueda venderse como "oro". Los quilates poco comunes — 12k, 15k (británico antiguo), 20k, 21k y 23k (joyería de Oriente Medio y Tailandia) — son la misma aritmética. Y "14KP" no significa "14k plated" (chapado): la P es de plumb — la aleación es exactamente 14k, no un mínimo. Un sello que sí significa chapado es "14K HGE", en la tabla de la derecha.'
                : 'Below 10k — 8k (333) and 9k (375) — is common on British, Irish, Australian, and older European pieces: it is real gold, priced by its lower content, even though it cannot be sold as "gold" in the US. The unusual karats — 12k, 15k (older British), 20k, 21k, and 23k (Middle Eastern and Thai jewelry) — are the same arithmetic. And "14KP" does not mean "14k plated": the P stands for plumb — the alloy is exactly 14k, not a minimum. The mark that does mean plated is "14K HGE", in the table on the right.'}
            </p>
          </div>
        </section>

        {/* Weight + the math */}
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
                {isEs ? 'peso × pureza × precio spot' : 'weight × purity × spot price'}
              </p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'El spot se cotiza por onza troy — 31.1 gramos, algo más pesada que la onza común. Divida el precio spot entre 31.1 para obtener la tarifa por gramo. Algunos compradores cotizan por pennyweight (dwt, 1.555 g) — es la misma cuenta con otra unidad.'
                  : 'Spot is quoted per troy ounce — 31.1 grams, a little heavier than a kitchen ounce. Divide the spot price by 31.1 for the per-gram rate. Some buyers quote per pennyweight (dwt, 1.555 g) — the same math in a different unit.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Ejemplo práctico' : 'Worked example'}
              </p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Una cadena de 14k de 20 gramos contiene 20 × 58.3% ≈ 11.7 gramos de oro puro. Con el spot a un precio ilustrativo de $2,600 por onza, su valor de fundición es 11.7 × ($2,600 ÷ 31.1) ≈ $978. Ese valor de fundición es el piso sobre el que se construye una oferta honesta.'
                  : 'A 20-gram 14k chain holds 20 × 58.3% ≈ 11.7 grams of pure gold. With spot at an illustrative $2,600 per ounce, its melt value is 11.7 × ($2,600 ÷ 31.1) ≈ $978. That melt figure is the floor an honest offer is built on.'}
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#993c1d]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Lo que no cuenta como oro' : 'What does not count as gold'}
            </p>
            <p className="text-sm leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Las piedras, los resortes de acero de los cierres, los mecanismos de reloj y el relleno de las piezas huecas pesan pero no son oro. Un comprador honesto los resta antes de pesar — o los valora aparte, como hacemos con los diamantes. Una báscula de cocina en gramos le da una idea razonable en casa; nosotros pesamos en básculas calibradas frente a usted.'
                : "Stones, the steel springs in clasps, watch movements, and the filler in hollow pieces weigh something but are not gold. An honest buyer deducts them before weighing — or prices them separately, as we do with diamonds. A kitchen scale in grams gets you a reasonable idea at home; we weigh on calibrated scales in front of you."}
            </p>
          </div>
        </section>

        {/* Above melt */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Cuándo una pieza vale más que la fundición' : 'When a piece is worth more than melt'}
            </h2>
            <p className="mb-4 max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'La fundición es el piso, no el techo. Las piezas firmadas (Tiffany, Cartier), las antiguas y las de colección pueden valer bastante más intactas; los diamantes de una montura se valoran como piedras, no como peso; y un reloj es un reloj, no chatarra. Todo buyer honesto guarda un margen entre la fundición y la oferta — así funciona el negocio. Lo que distingue a un comprador es cuánto valor de la pieza reconoce más allá del metal, y si le muestra la cuenta.'
                : 'Melt is the floor, not the ceiling. Signed pieces (Tiffany, Cartier), antique and collectible pieces can be worth well more intact; diamonds in a mounting are priced as stones, not as weight; and a watch is a watch, not scrap. Every honest buyer keeps a margin between melt and the offer — that is how the business works. What separates buyers is how much of a piece’s value they recognize beyond the metal, and whether they show you the math.'}
            </p>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>Por eso cotejamos cada pieza como joya antes de valorarla como oro — frente a usted, gratis y en minutos. Esa revisión es la diferencia entre un comprador de oro y un <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">comprador de joyería de patrimonio</Link>.</>
              ) : (
                <>That is why we check every piece as jewelry before we price it as gold — in front of you, free, in minutes. That check is the difference between a gold buyer and an <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">estate jewelry buyer</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Preguntas Sobre el Valor del Oro' : 'Gold Value FAQ'}
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
              <>¿No está seguro de qué tiene? Nuestra <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">guía de sellos</Link> explica las marcas, o <Link href={p('/gold-services')} className="font-semibold text-[#735c00] underline underline-offset-2">vea el precio del oro en vivo</Link> en nuestra página de oro.</>
            ) : (
              <>Not sure what you have? Our <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">hallmark guide</Link> explains the marks, or <Link href={p('/gold-services')} className="font-semibold text-[#735c00] underline underline-offset-2">see the live gold price</Link> on our gold page.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="gold-seal" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Listo para saber qué vale su oro?' : 'Ready to find out what your gold is worth?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Probado, pesado y valorado frente a usted — en el salón de Naples o en su casa.'
                : 'Tested, weighed, and priced in front of you — at the Naples showroom or in your home.'}
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
