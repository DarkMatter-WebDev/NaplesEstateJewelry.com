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

// Guide for the site's stated primary persona — retirees, executors, and
// downsizing families holding inherited pieces (PROJECT_OVERVIEW) — and the
// "estate buyers near me" / "sell estate items near me" queries. Second of
// the three 2026-09-01 guides; funnels into /estate-services,
// /jewelry-appraisal and /free-evaluation.
//
// ⚠️ Every process claim is lifted from /estate-services (on-site walk-through
// of every category, itemized offer with reasoning, nothing leaves the home
// until agreed, same-day payment by cash/check/wire, documentation of every
// item, work with attorneys and trustees to timelines) and from advice the
// site already gives (don't clean or polish; incomplete sets count; never mail
// valuables off; ID at the counter). The DECISIONS rule stands: NO invented
// customer history — "what people bring us" claims need the owner's word
// first, so this page describes what to DO, not who has done it. Legal
// questions (probate, what an estate formally requires) are deferred to the
// family's attorney on purpose; the site is not the source of that advice.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    // Title 58 chars with the brand suffix (a "Where to Start" draft ran 65).
    title: isEs ? 'Vender Joyas Heredadas: Guía' : 'Selling Inherited Jewelry: A Guide',
    description: isEs
      ? 'Qué hacer primero con joyas, plata y relojes heredados: qué no tocar, cómo separarlos, qué necesita un albacea y cómo evaluarlo todo en una visita en Naples, FL.'
      : 'What to do first with inherited jewelry, silver, and watches: what not to touch, how to sort it, what an executor needs, and one evaluation in Naples, FL.',
    path: '/estate-services/selling-inherited-jewelry',
    locale,
  });
}

export default async function InheritedJewelryGuidePage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/estate-services/selling-inherited-jewelry`;

  const dont = [
    {
      titleEn: 'Don’t clean or polish anything',
      titleEs: 'No limpie ni pula nada',
      descEn: 'Tarnish on silver and wear on gold do not change the weight, and polishing removes metal while adding nothing to the price. Original surfaces also help identify age and maker.',
      descEs: 'La pátina de la plata y el desgaste del oro no cambian el peso, y pulir quita metal sin sumar nada al precio. Las superficies originales también ayudan a identificar la época y el fabricante.',
    },
    {
      titleEn: 'Don’t split up sets or pairs',
      titleEs: 'No separe juegos ni pares',
      descEn: 'A complete flatware service, a matched pair of earrings, a suite of brooch and earrings — together they are worth more than the pieces sold one at a time. Keep boxes together too.',
      descEs: 'Un juego de cubiertos completo, un par de aretes, un conjunto de broche y aretes — juntos valen más que las piezas vendidas una por una. Mantenga las cajas juntas también.',
    },
    {
      titleEn: 'Don’t throw out the paper',
      titleEs: 'No tire los papeles',
      descEn: 'Receipts, old appraisals, GIA reports, warranty cards, and service records help confirm what a piece is. They can raise an offer; they never lower one.',
      descEs: 'Recibos, tasaciones antiguas, informes GIA, tarjetas de garantía y registros de servicio ayudan a confirmar qué es una pieza. Pueden subir una oferta; nunca la bajan.',
    },
    {
      titleEn: 'Don’t mail it off, and don’t let it leave unpriced',
      titleEs: 'No lo envíe por correo ni deje que se vaya sin valorar',
      descEn: 'Mail-in buyers price your pieces where you cannot see the scale. Have everything tested, weighed, and priced in front of you, and let nothing leave your hands until you have agreed to a number.',
      descEs: 'Los compradores por correo valoran sus piezas donde usted no ve la báscula. Haga que todo se pruebe, se pese y se valore frente a usted, y no deje que nada salga de sus manos hasta haber acordado un número.',
    },
  ];

  const sort = [
    {
      kEn: 'Jewelry',
      kEs: 'Joyería',
      descEn: 'Anything stamped 8k–24k, 333, 585 or 750 is gold and has a floor value by weight. Signed pieces (Tiffany, Cartier, David Yurman), antique pieces, and anything with diamonds are priced as pieces, not as metal. Costume can wait — it is identified free, and it rarely changes the total.',
      descEs: 'Todo lo sellado 8k–24k, 333, 585 o 750 es oro y tiene un valor mínimo por peso. Las piezas firmadas (Tiffany, Cartier, David Yurman), las antiguas y todo lo que tenga diamantes se valoran como piezas, no como metal. La bisutería puede esperar — se identifica gratis y rara vez cambia el total.',
    },
    {
      kEn: 'Silver',
      kEs: 'Plata',
      descEn: 'Look at the back of a fork or the base of a bowl. STERLING, 925, or the English lion means solid silver with real melt value; EPNS, "silver on copper," and "quadruple plate" mean plate, which has essentially none. Partial sets and single serving pieces still count.',
      descEs: 'Mire el reverso de un tenedor o la base de un cuenco. STERLING, 925 o el león inglés significan plata maciza con valor de fundición real; EPNS, "silver on copper" y "quadruple plate" significan chapado, que prácticamente no tiene. Los juegos incompletos y las piezas de servir sueltas también cuentan.',
    },
    {
      kEn: 'Watches, coins, and the rest',
      kEs: 'Relojes, monedas y lo demás',
      descEn: 'Watches are watches, not scrap — running or not, with or without box and papers. Coins and bullion are priced against the live market. Art, antiques, and furniture: we will tell you what we can purchase and what is better handled separately.',
      descEs: 'Los relojes son relojes, no chatarra — funcionen o no, con o sin caja y papeles. Las monedas y los lingotes se valoran contra el mercado en vivo. Arte, antigüedades y muebles: le diremos qué podemos comprar y qué conviene manejar por separado.',
    },
  ];

  const faqs = [
    {
      qEn: 'Do I need to sort everything before you come?',
      qEs: '¿Necesito ordenar todo antes de que vengan?',
      aEn: 'No. Mixed and unsorted is completely normal — a drawer, a chest, a shoebox. We go through every category in one visit and sort as we go, in front of you.',
      aEs: 'No. Que esté mezclado y sin clasificar es completamente normal — un cajón, un cofre, una caja de zapatos. Recorremos cada categoría en una visita y clasificamos sobre la marcha, frente a usted.',
    },
    {
      qEn: 'Can you come to the house?',
      qEs: '¿Pueden venir a la casa?',
      aEn: 'Yes. Larger estates and families who would rather not transport valuables can request a home visit anywhere in Southwest Florida — Naples, Marco Island, Bonita Springs, Estero, Fort Myers, and Cape Coral. Smaller collections are welcome at our Shirley St showroom during open hours.',
      aEs: 'Sí. Los patrimonios grandes y las familias que prefieren no transportar objetos de valor pueden pedir una visita a domicilio en todo el suroeste de Florida — Naples, Marco Island, Bonita Springs, Estero, Fort Myers y Cape Coral. Las colecciones pequeñas son bienvenidas en nuestro salón de Shirley St durante el horario de atención.',
    },
    {
      qEn: 'I am the executor or trustee. What do you need from me?',
      qEs: 'Soy el albacea o fideicomisario. ¿Qué necesitan de mí?',
      aEn: 'Your ID at the sale, and whatever authority your attorney tells you the estate requires — we are not the source of that advice, but we work with attorneys and trustees to their timelines, and we document every item we purchase so the estate has a clear record.',
      aEs: 'Su identificación al momento de la venta, y la autorización que su abogado le indique que el patrimonio requiere — no somos la fuente de ese consejo, pero trabajamos con abogados y fideicomisarios según sus plazos, y documentamos cada artículo que compramos para que el patrimonio tenga un registro claro.',
    },
    {
      qEn: 'Do I need a written appraisal for the estate?',
      qEs: '¿Necesito una tasación escrita para el patrimonio?',
      aEn: 'Sometimes an estate or an insurer needs a formal written appraisal, which states a retail replacement value and is a different service from ours. We do free market appraisals backed by a real offer; if you need the paperwork, we will say so and refer you to a certified independent appraiser.',
      aEs: 'A veces un patrimonio o una aseguradora necesita una tasación escrita formal, que indica un valor de reposición al detalle y es un servicio distinto del nuestro. Hacemos tasaciones de mercado gratuitas respaldadas por una oferta real; si necesita el documento, se lo diremos y lo referiremos a un tasador independiente certificado.',
    },
    {
      qEn: 'What if most of it turns out not to be valuable?',
      qEs: '¿Y si la mayor parte resulta no ser valiosa?',
      aEn: 'Then we tell you that straight — no charge, no obligation. Costume jewelry and silverplate are identified for free. We purchase the pieces that carry real value and can help coordinate the rest, and you decide item by item; you can sell some and keep some.',
      aEs: 'Entonces se lo decimos directamente — sin costo ni compromiso. La bisutería y el chapado se identifican gratis. Compramos las piezas que tienen valor real y podemos ayudar a coordinar el resto, y usted decide pieza por pieza; puede vender algunas y conservar otras.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Servicios de Patrimonio' : 'Estate Services', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/estate-services` },
      { '@type': 'ListItem', position: 3, name: isEs ? 'Vender Joyas Heredadas' : 'Selling Inherited Jewelry', item: canonicalUrl },
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
        <section className="relative flex min-h-[440px] items-center overflow-hidden bg-[#1a1c1c]">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Guía para Familias y Albaceas · Naples, FL' : 'A Guide for Families & Executors · Naples, FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'Vender Joyas Heredadas: Qué Hacer Primero' : 'Selling Inherited Jewelry: What to Do First'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Un joyero, un cofre de plata, un reloj en su caja — y ninguna idea de qué es valioso y qué no. No hay prisa. Esto es lo que conviene hacer, y no hacer, antes de que nadie le diga un número.'
                  : "A jewelry box, a chest of silver, a watch in its case — and no idea what is valuable and what is not. There is no rush. Here is what to do, and not do, before anyone names a number."}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'PROGRAMAR UNA TASACIÓN' : 'SCHEDULE AN APPRAISAL'}
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

        {/* Before you do anything */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Antes de hacer nada' : 'Before you do anything'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Casi todo lo que reduce el valor de una herencia ocurre en las primeras semanas, con buena intención. Cuatro cosas que conviene dejar exactamente como están:'
                : 'Almost everything that lowers the value of an inheritance happens in the first few weeks, with the best of intentions. Four things to leave exactly as they are:'}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {dont.map((d) => (
                <div key={d.titleEn} className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
                  <h3 className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? d.titleEs : d.titleEn}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? d.descEs : d.descEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sort roughly */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Separe lo que tiene — a grandes rasgos' : 'Sort what you have — roughly'}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>No hace falta ser experto, y no hace falta terminar. Una pasada rápida por los sellos le dice a qué grupo pertenece cada cosa; nuestra <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">guía de sellos</Link> explica las marcas.</>
            ) : (
              <>You do not need to be an expert, and you do not need to finish. A quick pass over the marks tells you which pile each thing belongs in; our <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">hallmark guide</Link> explains the marks.</>
            )}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {sort.map((s) => (
              <div key={s.kEn} className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? s.kEs : s.kEn}
                </p>
                <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? s.descEs : s.descEn}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>Para la matemática detrás de las ofertas de metal, vea <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su oro</Link> y <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale la cubertería de plata</Link>. Para una evaluación de las piezas, vea <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">cómo vender joyería heredada en Naples</Link>.</>
            ) : (
              <>For the math behind metal offers, see <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your gold is worth</Link> and <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">what sterling flatware is worth</Link>. For a review of the pieces themselves, see <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">how to sell inherited jewelry in Naples</Link>.</>
            )}
          </p>
        </section>

        {/* One evaluation */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Una evaluación, no cinco' : 'One evaluation, not five'}
            </h2>
            <p className="mb-4 max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Un comprador de oro ve peso. Un comprador de plata ve onzas. Un comprador de joyería de patrimonio recorre cada categoría en una sola visita — joyería, plata, relojes, monedas, arte, antigüedades — y valora cada cosa por lo que es: la fundición como piso, las piezas firmadas y antiguas como piezas, los diamantes como piedras. Recibe una oferta detallada con el razonamiento a la vista, decide pieza por pieza, y nada sale de la casa hasta que esté de acuerdo.'
                : 'A gold buyer sees weight. A silver buyer sees ounces. An estate jewelry buyer walks through every category in a single visit — jewelry, silver, watches, coins, art, antiques — and prices each thing for what it is: melt as the floor, signed and antique pieces as pieces, diamonds as stones. You get an itemized offer with the reasoning shown, decide item by item, and nothing leaves the home until you agree.'}
            </p>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>Payment is the same day, by cash, check, or wire, with documentation of every item — the record an executor needs. That is the whole of our <Link href={p('/estate-services')} className="font-semibold text-[#735c00] underline underline-offset-2">estate service</Link>, and it starts with a phone call, not a commitment.</>
              ) : (
                <>Payment is the same day, by cash, check, or wire, with documentation of every item — the record an executor needs. That is the whole of our <Link href={p('/estate-services')} className="font-semibold text-[#735c00] underline underline-offset-2">estate service</Link>, and it starts with a phone call, not a commitment.</>
              )}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Preguntas Sobre Joyas Heredadas' : 'Inherited Jewelry FAQ'}
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
              <>¿Prefiere una respuesta sobre sus piezas y no en general? La <Link href={p('/jewelry-appraisal')} className="font-semibold text-[#735c00] underline underline-offset-2">tasación es gratuita</Link>, en el salón o en su casa.</>
            ) : (
              <>Rather have an answer about your pieces than in general? The <Link href={p('/jewelry-appraisal')} className="font-semibold text-[#735c00] underline underline-offset-2">appraisal is free</Link>, at the showroom or in your home.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="heirloom" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Cuando esté listo, estamos a una llamada' : 'When you are ready, we are a phone call away'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Privado, sin prisa y sin compromiso — en el salón de Naples o en la casa.'
                : 'Private, unhurried, and with no obligation — at the Naples showroom or at the home.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <a href="tel:2394048505" className="gold-button">
                (239) 404-8505
              </a>
              <Link
                href={evalHref}
                className="outline-button"
                style={{ borderColor: 'rgba(255,255,255,0.32)', color: 'white', background: 'rgba(255,255,255,0.08)' }}
              >
                {isEs ? 'PROGRAMAR UNA CONSULTA' : 'SCHEDULE A CONSULTATION'}
              </Link>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
