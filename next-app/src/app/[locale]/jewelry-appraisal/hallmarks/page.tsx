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

type MarkRow = { mark: string; meanEn: string; meanEs: string };

// Module-level on purpose: a component defined inside the page function is
// re-created on every render (react-hooks/static-components).
function MarkTable({ rows, accent, label, isEs }: { rows: MarkRow[]; accent: string; label: string; isEs: boolean }) {
  return (
    <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_14px_38px_rgba(38,28,6,0.05)]">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: accent, fontFamily: 'var(--font-label)' }}>
        {label}
      </p>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((m) => (
            <tr key={m.mark} className="border-b border-[#e3dccd] last:border-b-0">
              <td className="py-2 pr-3 align-top font-bold text-[#1a1c1c]">{m.mark}</td>
              <td className="py-2 text-[#4d4635]">{isEs ? m.meanEs : m.meanEn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Identification guide for the "is this real gold / is this silver" query
// family (GSC: "is this silver", "value of piece", the appraisal queries) —
// third of the three 2026-09-01 guides. Funnels into /jewelry-appraisal and
// /free-evaluation. Every mark listed is a public standard; the testing
// language ("onsite acid testing at your appointment; offsite XRF when exact
// documentation is needed") is copied from /gold-services and
// /silver-services so the pages agree. ⚠️ /jewelry-appraisal's rule applies:
// we do free VERBAL appraisals and REFER written insurance appraisals — never
// let this page imply we issue paperwork. ⚠️ No photographs yet: the owner
// wants real marks from pieces actually bought; add them as photos of the
// shop's own pieces, never stock images.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Sellos: ¿Oro o Plata de Verdad?' : 'Hallmarks: Real Gold or Silver?',
    description: isEs
      ? 'Cómo leer las marcas de joyas y plata: sellos de oro 9K–24K y 585/750, 925 y sterling, marcas de chapado como EPNS y GF/GP, y cuándo hace falta una prueba real.'
      : 'How to read the marks on jewelry and silver: 9K–24K and 585/750 gold stamps, 925 and sterling, plate marks like EPNS and GF/GP, and when a stamp is not enough.',
    path: '/jewelry-appraisal/hallmarks',
    locale,
  });
}

export default async function HallmarksGuidePage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/jewelry-appraisal/hallmarks`;

  const goldMarks = [
    { mark: '9K · 375', meanEn: '37.5% gold — British, Irish, Australian; real gold, below the US minimum to be sold as "gold"', meanEs: '37.5% oro — británico, irlandés, australiano; oro real, por debajo del mínimo para venderse como "oro" en EE. UU.' },
    { mark: '10K · 417', meanEn: '41.7% gold — the lowest that can be sold as gold in the US', meanEs: '41.7% oro — el mínimo que puede venderse como oro en EE. UU.' },
    { mark: '14K · 585', meanEn: '58.3% gold — the most common North American mark', meanEs: '58.3% oro — el sello más común en Norteamérica' },
    { mark: '18K · 750', meanEn: '75% gold — the fine-jewelry standard', meanEs: '75% oro — el estándar de la joyería fina' },
    { mark: '22K · 916', meanEn: '91.7% gold — sovereigns, South Asian and Middle Eastern jewelry', meanEs: '91.7% oro — soberanos, joyería del sur de Asia y Oriente Medio' },
    { mark: '24K · 999', meanEn: '99.9% gold — bullion and investment pieces', meanEs: '99.9% oro — lingotes y piezas de inversión' },
    { mark: '14KP · 18KP', meanEn: '"Karat plumb" — exactly 14K / 18K, not a minimum. The P is NOT "plated"', meanEs: '"Karat plumb" — exactamente 14K / 18K, no un mínimo. La P NO es "plated" (chapado)' },
  ];
  const notGoldMarks = [
    { mark: 'GF · 1/20 12K GF', meanEn: 'Gold-filled: a bonded gold layer over base metal', meanEs: 'Gold-filled: una capa de oro unida sobre metal base' },
    { mark: 'GP · GEP · RGP', meanEn: 'Plated / electroplate / rolled — microscopic gold, no melt value', meanEs: 'Chapado / electrochapado / rolled — oro microscópico, sin valor de fundición' },
    { mark: '14K HGE · 18K HGE', meanEn: 'Heavy gold electroplate — the karat describes the plating, not the piece; base metal underneath', meanEs: 'Electrochapado grueso — el quilate describe el baño, no la pieza; metal base debajo' },
    { mark: 'Vermeil', meanEn: 'Gold over sterling — the silver is real, the gold is a layer', meanEs: 'Oro sobre esterlina — la plata es real, el oro es una capa' },
  ];
  const silverMarks = [
    { mark: 'STERLING · 925 · .925', meanEn: '92.5% silver — American, Mexican ("925 Mexico"), most modern', meanEs: '92.5% plata — americana, mexicana ("925 Mexico"), la mayoría moderna' },
    { mark: isEs ? 'León inglés (lion passant)' : 'Lion passant', meanEn: 'English sterling, with a city and date letter beside it', meanEs: 'Esterlina inglesa, con la letra de ciudad y fecha al lado' },
    { mark: '800 · 900', meanEn: 'Continental European silver, 80% / 90%', meanEs: 'Plata europea continental, 80% / 90%' },
    { mark: 'COIN', meanEn: 'American coin silver, about 90%, pre-1870', meanEs: 'Plata "coin" americana, alrededor del 90%, anterior a 1870' },
  ];
  const plateMarks = [
    { mark: 'EPNS · EP · EPBM', meanEn: 'Electroplated nickel silver / Britannia metal', meanEs: 'Alpaca / metal Britannia electrochapado' },
    { mark: isEs ? '"Quadruple plate" · "Silver on copper" · A1' : '"Quadruple plate" · "Silver on copper" · A1', meanEn: 'Plate grades — a thin skin over base metal', meanEs: 'Grados de chapado — una capa fina sobre metal base' },
    { mark: 'IS · "Silverplate" · "Community"', meanEn: 'International Silver / Oneida plate lines — says so outright', meanEs: 'Líneas de chapado de International Silver / Oneida — lo dice directamente' },
  ];

  const faqs = [
    {
      qEn: 'My ring has no stamp — is it fake?',
      qEs: 'Mi anillo no tiene sello — ¿es falso?',
      aEn: 'Not necessarily. Antique and custom-made pieces are often unmarked, and a stamp can wear away at a resize. We verify composition with onsite acid and electronic testing at your appointment, so an unmarked piece is never a lost cause.',
      aEs: 'No necesariamente. Las piezas antiguas y hechas a medida suelen no llevar sello, y un sello puede desgastarse al cambiar la talla. Verificamos la composición con pruebas ácidas y electrónicas en su cita, así que una pieza sin sello nunca es un caso perdido.',
    },
    {
      qEn: 'What does 585 mean?',
      qEs: '¿Qué significa 585?',
      aEn: '585 parts per thousand gold — 58.5%, the European way of writing 14K. 750 is 18K, 417 is 10K, 916 is 22K, and 999 is 24K.',
      aEs: '585 partes por mil de oro — 58.5%, la forma europea de escribir 14K. 750 es 18K, 417 es 10K, 916 es 22K y 999 es 24K.',
    },
    {
      qEn: 'Is 925 the same as sterling?',
      qEs: '¿925 es lo mismo que esterlina?',
      aEn: 'Yes — 925 is the numeric form of sterling, 92.5% silver. A piece marked either way is solid silver all the way through, which is what gives it melt value. Silverplate has none.',
      aEs: 'Sí — 925 es la forma numérica de esterlina, 92.5% plata. Una pieza marcada de cualquiera de las dos formas es plata maciza de principio a fin, y eso es lo que le da valor de fundición. El chapado no lo tiene.',
    },
    {
      qEn: 'Does gold-filled jewelry have any value?',
      qEs: '¿La joyería gold-filled tiene algún valor?',
      aEn: 'As metal, very little — a gold-filled piece carries only a few percent gold by weight, and plated pieces effectively none. Some signed or antique gold-filled pieces have collector value, which is a different question from melt. We will tell you which you have for free.',
      aEs: 'Como metal, muy poco — una pieza gold-filled tiene apenas un pequeño porcentaje de oro por peso, y las chapadas prácticamente nada. Algunas piezas gold-filled firmadas o antiguas tienen valor de colección, que es otra cuestión distinta de la fundición. Le decimos gratis cuál tiene.',
    },
    {
      qEn: 'Can you test my jewelry for free?',
      qEs: '¿Pueden probar mi joyería gratis?',
      aEn: 'Yes. Bring it to our Shirley St showroom in North Naples or book an appointment — we test and identify it in front of you at no charge and give you a real offer. We do not issue written insurance appraisals; for those we refer you to a certified independent appraiser.',
      aEs: 'Sí. Tráigala a nuestro salón de Shirley St en North Naples o reserve una cita — la probamos e identificamos frente a usted sin costo y le damos una oferta real. No emitimos tasaciones escritas para seguros; para eso lo referimos a un tasador independiente certificado.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Tasaciones Gratis' : 'Free Appraisals', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/jewelry-appraisal` },
      { '@type': 'ListItem', position: 3, name: isEs ? 'Guía de Sellos' : 'Hallmark Guide', item: canonicalUrl },
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
                {isEs ? 'Guía de Identificación · Naples, FL' : 'Identification Guide · Naples, FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? '¿Es Oro o Plata de Verdad? Lea los Sellos Primero' : 'Is It Real Gold or Sterling Silver? Read the Marks First'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'La mayoría de las piezas dicen lo que son — en letras demasiado pequeñas para leer sin lupa. Esto es lo que significan los sellos comunes, cómo se ven las imitaciones y los rellenos, y cuándo un sello no basta.'
                  : "Most pieces tell you what they are — in letters too small to read without a loupe. Here is what the common stamps mean, what the fakes and fillers look like, and when a stamp is not enough."}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'IDENTIFICACIÓN GRATUITA' : 'GET IT IDENTIFIED FREE'}
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

        {/* Gold marks */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Sellos de oro' : 'Gold marks'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Busque en el interior del anillo, en el cierre o en la lengüeta de la cadena, y en el reverso de broches y colgantes. Un número de tres cifras es la pureza en partes por mil; una "K" es el quilate.'
                : 'Look inside the ring, on the clasp or the tag of a chain, and on the back of brooches and pendants. A three-digit number is the purity in parts per thousand; a "K" is the karat.'}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <MarkTable rows={goldMarks} isEs={isEs} accent="#735c00" label={isEs ? 'Sellos que significan oro macizo' : 'Marks that mean solid gold'} />
              <MarkTable rows={notGoldMarks} isEs={isEs} accent="#993c1d" label={isEs ? 'Sellos que significan capa de oro' : 'Marks that mean a gold layer'} />
            </div>
            {/* 2026-09-06: the illustrated gold marks guide (31 photos) lives at
                /gold-services/gold-marks. */}
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>¿Quiere ver los sellos de verdad? Nuestra <Link href={p('/gold-services/gold-marks')} className="font-semibold text-[#735c00] underline underline-offset-2">guía ilustrada de sellos de oro</Link> muestra 31 fotos — 10K, 14K, 18K y 14KP; 585, 750 y 375; gold-filled, HGE y vermeil; sellos británicos; firmas de Cartier y Tiffany; y PT950.</>
              ) : (
                <>Want to see the real thing? Our <Link href={p('/gold-services/gold-marks')} className="font-semibold text-[#735c00] underline underline-offset-2">illustrated gold marks guide</Link> shows 31 photographs — 10K, 14K, 18K and 14KP; 585, 750 and 375; gold-filled, HGE and vermeil; British hallmarks; Cartier and Tiffany signatures; and PT950.</>
              )}
            </p>
          </div>
        </section>

        {/* Silver marks */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Sellos de plata' : 'Silver marks'}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'En cubertería y vajilla el sello está en el reverso del mango o en la base. La esterlina es plata maciza y tiene valor de fundición; el chapado es una capa microscópica sobre metal base, y su valor de fundición es prácticamente cero.'
              : 'On flatware and hollowware the mark is on the back of the handle or the underside. Sterling is solid silver and has melt value; plate is a microscopic layer over base metal, and its melt value is effectively zero.'}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <MarkTable rows={silverMarks} isEs={isEs} accent="#735c00" label={isEs ? 'Sellos que significan plata maciza' : 'Marks that mean solid silver'} />
            <MarkTable rows={plateMarks} isEs={isEs} accent="#993c1d" label={isEs ? 'Sellos que significan chapado' : 'Marks that mean plate'} />
          </div>
          {/* 2026-09-06: the illustrated silver marks guide (26 photos, most
              from the shop's own pieces) lives at /silver-services/silver-marks. */}
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>¿Quiere ver los sellos de verdad? Nuestra <Link href={p('/silver-services/silver-marks')} className="font-semibold text-[#735c00] underline underline-offset-2">guía ilustrada de sellos de plata</Link> muestra 26 fotos — E.P.N.S. y EPBM, el león británico, STERLING y plata de moneda, 925 y los sellos del mundo — la mayoría de piezas que pasaron por nuestro mostrador.</>
            ) : (
              <>Want to see the real thing? Our <Link href={p('/silver-services/silver-marks')} className="font-semibold text-[#735c00] underline underline-offset-2">illustrated silver marks guide</Link> shows 26 photographs — E.P.N.S. and EPBM, the British lion, STERLING and coin silver, 925 and the world marks — most from pieces that came across our own counter.</>
            )}
          </p>
        </section>

        {/* Tests and their limits */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Dos pruebas caseras — y sus límites' : 'Two home tests — and their limits'}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'El imán' : 'The magnet'}
                </p>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'El oro y la plata no son magnéticos. Si un imán fuerte se pega, hay acero o metal base — aunque un resorte de acero en un cierre puede engañar. Si no se pega, no prueba nada: el latón y muchas aleaciones tampoco son magnéticos.'
                    : 'Gold and silver are not magnetic. If a strong magnet grabs, there is steel or base metal in the piece — though a steel spring in a clasp can fool you. If it does not grab, that proves nothing: brass and many alloys are not magnetic either.'}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'El sello mismo' : 'The stamp itself'}
                </p>
                <p className="text-sm leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'Un sello es una afirmación, no una prueba. Los sellos pueden ser falsos, y una pieza chapada puede llevar "14K" en el cierre y latón en la cadena. Por eso todo comprador serio prueba el metal en vez de confiar en el sello.'
                    : 'A stamp is a claim, not a test. Stamps can be faked, and a plated piece can carry "14K" on the clasp with brass in the chain. That is why any serious buyer tests the metal rather than trusting the mark.'}
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Cómo lo resolvemos' : 'How we settle it'}
              </p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'En su cita usamos prueba ácida de piedra de toque y verificación electrónica para confirmar la pureza, frente a usted, y organizamos análisis XRF externo no destructivo cuando hace falta documentación exacta. Las piezas antiguas y a medida sin sello se prueban igual — un sello ausente nunca es un caso perdido.'
                  : 'At your appointment we use touchstone acid testing and electronic verification to confirm purity, in front of you, and arrange offsite non-destructive XRF analysis when exact documentation is needed. Unmarked antique and custom pieces are tested the same way — a missing stamp is never a lost cause.'}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Preguntas Sobre Sellos y Pruebas' : 'Hallmarks & Testing FAQ'}
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
              <>¿Ya sabe qué tiene? Vea <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su oro</Link>, <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su cubertería de plata</Link> o <Link href={p('/diamond-buyers/what-is-my-diamond-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su anillo de diamante</Link>.</>
            ) : (
              <>Know what you have now? See <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your gold is worth</Link>, <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">what your silver flatware is worth</Link> or <Link href={p('/diamond-buyers/what-is-my-diamond-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your diamond ring is worth</Link>.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="flask" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Quiere saberlo con certeza?' : 'Want to know for certain?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Probado e identificado frente a usted, gratis y sin compromiso — en el salón de Naples o en su casa.'
                : 'Tested and identified in front of you, free and with no obligation — at the Naples showroom or in your home.'}
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
