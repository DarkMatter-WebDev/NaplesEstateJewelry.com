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

// Guide for sellers of Navajo, Zuni, Hopi and other Southwestern silver and
// turquoise — the topic /estate-jewelry never covered (2026-10-22, owner,
// mockup v1). Nested under its parent like the other guides; linked from the
// parent's "Native American, Turquoise & Taxco Silver" band and from
// /silver-services.
//
// ⚠️ The owner's point leads the page: much of the value in this category
// depends on the particular artist. Process claims ("we look up the hallmark
// before we name a number", "we price it both ways", "we test it in front of
// you", the Taxco answer) were read and kept by the owner on the mockup. The
// style notes are general knowledge, not customer history. No photo until the
// owner has one of a real piece (own photos only — never generated).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Vender Joyería Nativa Americana en Naples' : 'Sell Native American Jewelry in Naples',
    description: isEs
      ? 'Plata y turquesa navajo, zuni y hopi: por qué el artista importa más, qué revisamos y cómo la valoramos en Naples, FL. Llame al (239) 404-8505.'
      : 'Navajo, Zuni, and Hopi silver and turquoise: why the artist matters most, what we check, and how we price it in Naples, FL. Call (239) 404-8505.',
    path: '/estate-jewelry/native-american-jewelry',
    locale,
  });
}

const STYLES = [
  {
    kEn: 'Navajo (Diné)',
    kEs: 'Navajo (Diné)',
    descEn: 'Heavy sterling, stamped and hand-worked silver, and large turquoise stones: cuffs, concho belts, squash blossom necklaces, bolo ties, and rings.',
    descEs: 'Plata esterlina gruesa, plata estampada y trabajada a mano, y piedras de turquesa grandes: brazaletes, cinturones de conchos, collares squash blossom, corbatas bolo y anillos.',
  },
  {
    kEn: 'Zuni',
    kEs: 'Zuni',
    descEn: 'Known for fine stonework: inlay, channel inlay, and needlepoint and petit point clusters of small, matched stones set in silver.',
    descEs: 'Conocida por su fino trabajo en piedra: incrustación, incrustación en canal y racimos needlepoint y petit point de piedras pequeñas e iguales montadas en plata.',
  },
  {
    kEn: 'Hopi',
    kEs: 'Hopi',
    descEn: 'Overlay: two layers of silver, the top one cut out in a design over a darkened background layer.',
    descEs: 'Overlay: dos capas de plata, la superior recortada con un diseño sobre una capa de fondo oscurecida.',
  },
  {
    kEn: 'Santo Domingo (Kewa) Pueblo',
    kEs: 'Pueblo de Santo Domingo (Kewa)',
    descEn: 'Heishi — fine hand-rolled shell and stone beads — and mosaic inlay necklaces and earrings.',
    descEs: 'Heishi — finas cuentas de concha y piedra pulidas a mano — y collares y aretes con incrustación de mosaico.',
  },
];

const PRICE = [
  {
    kEn: 'The artist',
    kEs: 'El artista',
    descEn: 'A hallmark we can identify matters most. Gallery receipts, trading post tags, and old paperwork help confirm who made a piece. Bring them if you have them.',
    descEs: 'Lo que más importa es un sello que podamos identificar. Los recibos de galerías, las etiquetas de trading posts y los papeles antiguos ayudan a confirmar quién hizo una pieza. Tráigalos si los tiene.',
  },
  {
    kEn: 'The silver',
    kEs: 'La plata',
    descEn: 'Sterling has real value as metal, and that is the floor of any offer. “Nickel silver,” “German silver,” and “alpaca” look similar and have essentially none. We test it in front of you.',
    descEs: 'La plata esterlina tiene valor real como metal, y ese es el piso de cualquier oferta. La «alpaca» y la «plata alemana» se parecen y prácticamente no valen nada. La probamos frente a usted.',
  },
  {
    kEn: 'The turquoise',
    kEs: 'La turquesa',
    descEn: 'Natural turquoise is worth more than stabilized, reconstituted (“block”), or dyed stone. If a stone needs specialist analysis, we say so and arrange it.',
    descEs: 'La turquesa natural vale más que la estabilizada, la reconstituida («block») o la teñida. Si una piedra necesita un análisis especializado, se lo decimos y lo organizamos.',
  },
  {
    kEn: 'Age and condition',
    kEs: 'Época y estado',
    descEn: 'Older pieces with honest wear are often the ones collectors want. Missing stones, cracks, and heavy repairs lower the price; we explain how much.',
    descEs: 'Las piezas antiguas con un desgaste natural suelen ser las que buscan los coleccionistas. Las piedras faltantes, las grietas y las reparaciones grandes bajan el precio; le explicamos cuánto.',
  },
];

const BEFORE = [
  {
    leadEn: 'Don’t polish it.',
    leadEs: 'No la pula.',
    restEn: 'The dark background on Hopi overlay and stamped silver is part of the design, and polishing removes metal.',
    restEs: 'El fondo oscuro del overlay hopi y de la plata estampada es parte del diseño, y pulir quita metal.',
  },
  {
    leadEn: 'Keep sets together.',
    leadEs: 'Mantenga los juegos unidos.',
    restEn: 'A necklace with its matching earrings or bracelet is worth more as a set.',
    restEs: 'Un collar con sus aretes o su pulsera a juego vale más como juego.',
  },
  {
    leadEn: 'Bring the paperwork',
    leadEs: 'Traiga los papeles',
    restEn: '— receipts, tags, cards, letters from the artist or gallery.',
    restEs: '— recibos, etiquetas, tarjetas, cartas del artista o de la galería.',
  },
  {
    leadEn: 'If you decide to sell,',
    leadEs: 'Si decide vender,',
    restEn: 'bring a government photo ID — Florida requires it when we buy precious metals.',
    restEs: 'traiga una identificación oficial con foto — Florida la exige cuando compramos metales preciosos.',
  },
];

const FAQS = [
  {
    qEn: 'Is my piece worth more than its silver?',
    qEs: '¿Mi pieza vale más que su plata?',
    aEn: 'Often, if it is signed by a known artist or is fine older work. We price it both ways — as silver and as a piece — and tell you which is higher and why.',
    aEs: 'A menudo, si está firmada por un artista conocido o es un buen trabajo antiguo. La valoramos de las dos maneras — como plata y como pieza — y le decimos cuál es mayor y por qué.',
  },
  {
    qEn: 'It isn’t signed. Do you still buy it?',
    qEs: 'No está firmada. ¿La compran igual?',
    aEn: 'Yes. Unsigned pieces are priced on their silver, their stones, and the quality of the work. Many good older pieces were never signed.',
    aEs: 'Sí. Las piezas sin firma se valoran por su plata, sus piedras y la calidad del trabajo. Muchas buenas piezas antiguas nunca se firmaron.',
  },
  {
    qEn: 'How do I know if it is really Native American made?',
    qEs: '¿Cómo sé si de verdad es de hechura nativa americana?',
    aEn: 'We look at the hallmark, the construction, and the materials, and tell you honestly what we think it is. Look-alike pieces made elsewhere are common, and we will say so when we see one.',
    aEs: 'Revisamos el sello, la construcción y los materiales, y le decimos con honestidad qué creemos que es. Las imitaciones hechas en otros lugares son comunes, y se lo diremos cuando veamos una.',
  },
  {
    qEn: 'Do you also buy Mexican Taxco silver?',
    qEs: '¿También compran plata mexicana de Taxco?',
    aEn: 'Yes. Maker-marked Taxco silver — William Spratling, Los Castillo, Hector Aguilar, and others — is priced as jewelry. Unmarked pieces are priced on their silver.',
    aEs: 'Sí. La plata de Taxco con marca del fabricante — William Spratling, Los Castillo, Héctor Aguilar y otros — se valora como joyería. Las piezas sin marca se valoran por su plata.',
  },
  {
    qEn: 'Do I need an appointment?',
    qEs: '¿Necesito una cita?',
    aEn: 'No. Walk into the Shirley St showroom during open hours, or call to arrange a private appointment. Home visits are available on request.',
    aEs: 'No. Visite el salón de Shirley St durante el horario de atención o llame para concertar una cita privada. Las visitas a domicilio están disponibles a solicitud.',
  },
];

export default async function NativeAmericanJewelryGuidePage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/estate-jewelry/native-american-jewelry`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Comprador de Joyería de Patrimonio' : 'Estate Jewelry Buyer', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/estate-jewelry` },
      { '@type': 'ListItem', position: 3, name: isEs ? 'Joyería Nativa Americana' : 'Native American Jewelry', item: canonicalUrl },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
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
                {isEs ? 'Joyería Nativa Americana y Turquesa\u00a0·\u00a0Naples,\u00a0FL' : 'Native American & Turquoise Jewelry\u00a0·\u00a0Naples,\u00a0FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white text-balance md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'Vender Joyería Nativa Americana y de Turquesa en Naples' : 'Selling Native American & Turquoise Jewelry in Naples'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'Un brazalete navajo, una pulsera zuni con incrustaciones, un collar squash blossom comprado en un viaje al Oeste hace décadas. Gran parte de esta joyería vale más que su plata — y cuánto más depende sobre todo de quién la hizo. Esto es lo que revisamos, y lo que usted puede comprobar en casa.'
                  : 'A Navajo cuff, a Zuni inlay bracelet, a squash blossom necklace bought on a trip out West decades ago. Much of this jewelry is worth more than its silver — and how much more depends mostly on who made it. Here is what we look at, and what you can check at home.'}
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

        {/* The artist */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'La mayor parte del valor está en el artista' : 'Most of the value is in the artist'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Dos collares squash blossom pueden pesar lo mismo y valer cantidades muy distintas. Una pieza de un artista reconocido, o de una familia de plateros conocida, puede venderse por muchas veces el valor de su plata. Una pieza turística sin firma suele valorarse más cerca de su plata y sus piedras.'
                : 'Two squash blossom necklaces can weigh the same and be worth very different amounts. A piece by a recognized artist, or from a well-known family of silversmiths, can sell for many times the value of its silver. An unsigned tourist piece is usually priced closer to its silver and stones.'}
            </p>
            <p
              className="mt-7 max-w-3xl rounded-r-xl border-l-4 border-[#b5890c] bg-white px-6 py-5 text-lg font-bold leading-relaxed text-[#1a1c1c]"
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {isEs
                ? 'Por eso lo primero que hacemos es buscar el sello del artista — normalmente estampado o grabado en el reverso — e investigarlo antes de decirle un número.'
                : 'So the first thing we do is look for the artist’s hallmark — usually stamped or engraved on the back — and research it before we name a number.'}
            </p>
          </div>
        </section>

        {/* Styles */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Los estilos, en breve' : 'The styles, briefly'}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'No hace falta saber cuál es cuál — se lo diremos. Pero los nombres le ayudan a describir lo que tiene cuando llame.'
              : 'You do not need to know which is which — we will tell you. But the names help you describe what you have when you call.'}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {STYLES.map((s) => (
              <div key={s.kEn} className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? s.kEs : s.kEn}
                </h3>
                <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? s.descEs : s.descEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What decides the price */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Qué decide el precio' : 'What decides the price'}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {PRICE.map((s) => (
                <div key={s.kEn} className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                    {isEs ? s.kEs : s.kEn}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? s.descEs : s.descEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Before you bring it in */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Antes de traerla' : 'Before you bring it in'}
          </h2>
          <ul className="max-w-3xl list-disc space-y-3 pl-5 text-base leading-relaxed text-[#4d4635]">
            {BEFORE.map((b) => (
              <li key={b.leadEn}>
                <strong className="text-[#1a1c1c]">{isEs ? b.leadEs : b.leadEn}</strong> {isEs ? b.restEs : b.restEn}
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-3xl px-4 md:px-8">
            <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Preguntas Sobre Joyería Nativa Americana' : 'Native American Jewelry FAQ'}
            </h2>
            <div className="flex flex-col gap-4">
              {FAQS.map((f) => (
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
                <>¿Vende todo un joyero? Vea <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">cómo compramos joyería de patrimonio en Naples</Link> y nuestra <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">página de plata esterlina</Link>.</>
              ) : (
                <>Selling a whole jewelry box? See <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">how we buy estate jewelry in Naples</Link> and our <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">sterling silver page</Link>.</>
              )}
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="gemstone" size={96} onDark className="mx-auto mb-6 block" />
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
