import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import { breadcrumbLd } from '@/lib/breadcrumb-ld';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import ClayMark from '@/components/ClayMark';

interface Props {
  params: Promise<{ locale: string }>;
}

// "Don't melt it yet" — the resale-vs-melt positioning page (owner's idea,
// 2026-09-03; mockup approved as is). The differentiator it states is the one
// a refiner-backed counter structurally cannot copy: we run a showroom and
// resell, so a piece can be priced as JEWELRY, not only as metal. Nested under
// /sell like the other guides; funnels into /free-evaluation.
//
// ⚠️ Claim rules (DECISIONS.md, "Guide pages"):
//  - The promise is "we price it both ways and pay whichever is higher" — the
//    same owner-confirmed wording /silver-services makes for flatware. NEVER
//    "we always pay more than melt", and never a resale percentage or figure.
//  - The melt example (20 g 14k chain, illustrative $2,600 spot, ≈ $978) is the
//    one already on /sell — keep the two pages in sync if either changes.
//  - Maker names come from /estate-jewelry (Tiffany & Co., Cartier, David
//    Yurman). Dental gold is NEVER priced in the showroom (sent out for karat
//    testing). "HGE" = plated. Owner approved every line of both lists 09-03.
//  - Talk about the melt-only MODEL ("melters", "refiner counters", "mail-in
//    buyers"); never name a competitor.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'No Funda Su Joyería Todavía' : "Don't Melt Your Jewelry Yet",
    description: isEs
      ? 'La mayoría de los compradores de oro en Naples solo funden. Nosotros revendemos: valoramos cada pieza como metal y como joya, y pagamos el mayor. Gratis y frente a usted.'
      : 'Most Naples gold buyers only melt. We resell, so we price every piece as metal and as jewelry and pay whichever is higher. Free, done in front of you.',
    path: '/sell/dont-melt-it',
    locale,
  });
}

export default async function DontMeltItPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');

  const faqs = [
    {
      qEn: 'Do you pay more than melt for everything?',
      qEs: '¿Pagan más que la fundición por todo?',
      aEn: 'No — and anyone who says they do is hiding it in the math. We pay more than melt when a piece is worth more as jewelry than as metal. When it is not, we say so and pay the honest melt price, worked out in front of you.',
      aEs: 'No — y quien diga que sí lo está escondiendo en la cuenta. Pagamos más que la fundición cuando una pieza vale más como joya que como metal. Cuando no es así, se lo decimos y pagamos el precio honesto de fundición, calculado frente a usted.',
    },
    {
      qEn: 'My piece is broken. Is it still worth bringing in?',
      qEs: 'Mi pieza está rota. ¿Vale la pena traerla?',
      aEn: 'Yes. A broken piece is usually a melt piece, and we price melt the same transparent way — but a signed piece, or one with good stones, can still carry value with a broken clasp. Let us look before you decide.',
      aEs: 'Sí. Una pieza rota suele ser una pieza de fundición, y valoramos la fundición con la misma transparencia — pero una pieza firmada, o con buenas piedras, puede conservar valor aun con el broche roto. Permítanos verla antes de decidir.',
    },
    {
      qEn: 'Should I remove the stones or take the piece apart first?',
      qEs: '¿Debo quitar las piedras o desarmar la pieza antes?',
      aEn: 'Please don’t. A piece that is still complete can be resold; a pile of parts can only be melted. You lose the second price the moment it comes apart.',
      aEs: 'Por favor, no. Una pieza completa se puede revender; un montón de partes solo se puede fundir. Pierde el segundo precio en el momento en que se desarma.',
    },
    {
      qEn: 'Do I need the box, papers, or a receipt?',
      qEs: '¿Necesito la caja, los papeles o el recibo?',
      aEn: 'No. They can help with signed pieces, so bring them if you have them, but the piece itself carries its maker’s marks and hallmarks — and that is what we read.',
      aEs: 'No. Ayudan con las piezas firmadas, así que tráigalos si los tiene, pero la pieza misma lleva las marcas del fabricante y los sellos — y eso es lo que leemos.',
    },
    {
      qEn: 'What about dental gold?',
      qEs: '¿Y el oro dental?',
      aEn: 'We buy it, but it is never priced in the showroom. The karat cannot be read reliably on dental work, so it goes out for testing and the offer follows the result.',
      aEs: 'Lo compramos, pero nunca se valora en el salón. El quilataje no se puede leer con fiabilidad en trabajos dentales, así que se envía a análisis y la oferta sigue al resultado.',
    },
    {
      qEn: 'Is there any cost or obligation?',
      qEs: '¿Tiene algún costo u obligación?',
      aEn: 'None. The evaluation is free, the math is done in front of you, and you can walk out with your pieces and both numbers.',
      aEs: 'Ninguno. La evaluación es gratuita, la cuenta se hace frente a usted, y puede irse con sus piezas y con ambos números.',
    },
  ];

  const crumbs = breadcrumbLd(locale, [
    { name: isEs ? 'Vender' : 'Sell to Us', path: '/sell' },
    { name: isEs ? 'No Lo Funda Todavía' : "Don't Melt It Yet", path: '/sell/dont-melt-it' },
  ]);

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: isEs ? f.qEs : f.qEn,
      acceptedAnswer: { '@type': 'Answer', text: isEs ? f.aEs : f.aEn },
    })),
  };

  // The melt column repeats the worked example from /sell so the two pages
  // never disagree. The resale column deliberately has NO number.
  const meltRows = [
    { kEn: '14k chain on the scale', kEs: 'Cadena de 14k en la báscula', v: '20.0 g' },
    { kEn: 'Pure gold (× 58.3%)', kEs: 'Oro puro (× 58.3%)', v: '11.7 g' },
    { kEn: 'Spot, illustrative', kEs: 'Spot, ilustrativo', v: '$2,600 / oz' },
    { kEn: 'Melt value', kEs: 'Valor de fundición', v: '≈ $978' },
    { kEn: 'Minus their spread', kEs: 'Menos su margen', v: '− ?', muted: true },
  ];
  const oursRows = [
    { kEn: 'Melt floor, worked out loud', kEs: 'Piso de fundición, calculado en voz alta', v: '≈ $978' },
    { kEn: 'Signed maker or hallmark?', kEs: '¿Firma o sello del fabricante?', v: isEs ? 'revisado' : 'checked' },
    { kEn: 'Wearable as it is?', kEs: '¿Se puede usar tal cual?', v: isEs ? 'revisado' : 'checked' },
    { kEn: 'Stones, style, demand in our showroom', kEs: 'Piedras, estilo, demanda en nuestro salón', v: isEs ? 'revisado' : 'checked' },
    { kEn: 'Resale offer, piece by piece', kEs: 'Oferta de reventa, pieza por pieza', v: isEs ? 'cuando supera la fundición' : 'when it beats melt', muted: true },
  ];

  const aboveMelt = [
    { tEn: 'Signed designer pieces', tEs: 'Piezas de diseñador firmadas', sEn: 'Tiffany & Co., Cartier, David Yurman, and similar marks', sEs: 'Tiffany & Co., Cartier, David Yurman y marcas similares' },
    { tEn: 'Complete, wearable pieces in good condition', tEs: 'Piezas completas y usables en buen estado', sEn: 'Clasps that work, links intact, nothing bent or crushed', sEs: 'Broches que funcionan, eslabones intactos, nada doblado ni aplastado' },
    { tEn: 'Pieces with real stones', tEs: 'Piezas con piedras genuinas', sEn: 'Diamonds and colored stones a melter would pop out and set aside', sEs: 'Diamantes y piedras de color que un fundidor sacaría y apartaría' },
    { tEn: 'Heavier vintage and antique work', tEs: 'Trabajo vintage y antiguo de más peso', sEn: 'Hand-made, period styles that people come to the showroom looking for', sEs: 'Estilos de época hechos a mano que la gente viene a buscar al salón' },
    { tEn: 'Sterling with a collector following', tEs: 'Plata esterlina con seguidores coleccionistas', sEn: 'The small top tier of patterns — the same rule as our flatware guide', sEs: 'El pequeño grupo de patrones de primer nivel — la misma regla de nuestra guía de cubertería' },
  ];
  const honestlyMelt = [
    { tEn: 'Broken or crushed pieces', tEs: 'Piezas rotas o aplastadas', sEn: 'Once it cannot be worn, the metal is the value', sEs: 'Cuando ya no se puede usar, el metal es el valor' },
    { tEn: 'Plain, thin, unsigned chains', tEs: 'Cadenas lisas, finas y sin firma', sEn: 'Priced by weight, purity, and spot, in front of you', sEs: 'Valoradas por peso, pureza y spot, frente a usted' },
    { tEn: 'Single earrings and odd findings', tEs: 'Aretes sueltos y piezas sueltas', sEn: 'Backs, clasps, broken bracelet sections', sEs: 'Traseros, broches, tramos rotos de pulsera' },
    { tEn: 'Dental gold', tEs: 'Oro dental', sEn: 'Sent out for karat testing first, never priced in the showroom; the offer follows the result', sEs: 'Se envía primero a análisis de quilataje, nunca se valora en el salón; la oferta sigue al resultado' },
    { tEn: 'Plated and gold-filled pieces', tEs: 'Piezas chapadas y gold-filled', sEn: 'HGE, GF, and plate marks mean little or no metal value', sEs: 'Los sellos HGE, GF y de chapado significan poco o ningún valor en metal' },
  ];

  const steps = [
    {
      tEn: 'The melt floor, out loud',
      tEs: 'El piso de fundición, en voz alta',
      bEn: 'Weight on the scale in front of you, purity tested in front of you, today’s spot on the screen. This is the number a melter would start from too.',
      bEs: 'El peso en la báscula frente a usted, la pureza probada frente a usted, el spot del día en la pantalla. Este es el número del que también partiría un fundidor.',
    },
    {
      tEn: 'The resale look',
      tEs: 'La mirada de reventa',
      bEn: 'Maker’s marks and hallmarks, condition, stones, and whether it is a piece our showroom customers actually ask for.',
      bEs: 'Marcas del fabricante y sellos, estado, piedras, y si es una pieza que los clientes de nuestro salón realmente piden.',
    },
    {
      tEn: 'The higher number',
      tEs: 'El número mayor',
      bEn: 'If the piece is worth more as jewelry than as metal, that is the offer. If it is not, you get the honest melt price with no spread hidden in the math.',
      bEs: 'Si la pieza vale más como joya que como metal, esa es la oferta. Si no, recibe el precio honesto de fundición sin un margen escondido en la cuenta.',
    },
  ];

  const cardClass = 'rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]';
  const labelClass = 'mb-3 text-xs font-bold uppercase tracking-[0.16em]';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(crumbs) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative flex min-h-[440px] items-center overflow-hidden bg-[#1a1c1c] py-12 md:py-16">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={crumbs} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Fundición vs. Reventa · Naples, FL' : 'Melt vs. Resale · Naples, FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? 'No Lo Funda Todavía. Valoramos la Joyería de Dos Maneras.' : 'Don’t Melt It Yet. We Price Jewelry Both Ways.'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'La mayoría de los compradores de oro y plata en Naples son fundidores. Solo pueden pagar una fracción del precio del metal, porque fundir es lo único que pueden hacer con su pieza. Nosotros tenemos un salón y revendemos, así que revisamos cada pieza de dos maneras y pagamos el número que resulte mayor.'
                  : 'Most gold and silver buyers in Naples are melters. They can only pay a slice of the metal price, because melting is all they can do with your piece. We run a showroom and resell, so we check every piece two ways and pay whichever number is higher.'}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'OFERTA GRATUITA DE DOS MANERAS' : 'GET A FREE BOTH-WAYS OFFER'}
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

        {/* Two prices, one piece */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Dos precios, una pieza' : 'Two prices, one piece'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Todos los compradores de la zona miran el mismo precio spot. La oferta de un fundidor es ese valor del metal menos su margen. La oferta de un revendedor parte del mismo piso y luego hace una segunda pregunta que el fundidor nunca puede hacer: ¿cuánto pagará alguien por usar esto?'
                : 'Every buyer in town watches the same spot price. A melter’s offer is that metal value minus their spread. A reseller’s offer starts from the same floor, then asks a second question the melter never can: what will someone pay to wear this?'}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className={cardClass}>
                <p className={`${labelClass} text-[#4d4635]`} style={{ fontFamily: 'var(--font-label)' }}>
                  {isEs ? 'Un comprador que solo funde' : 'A melt-only buyer'}
                </p>
                <p className="mb-4 text-xl font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'Un solo número' : 'One number'}
                </p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums">
                  {meltRows.map((r) => (
                    <div key={r.kEn} className="contents">
                      <dt className={r.muted ? 'text-[#8a8271]' : 'text-[#4d4635]'}>{isEs ? r.kEs : r.kEn}</dt>
                      <dd className={`m-0 whitespace-nowrap text-right font-semibold ${r.muted ? 'text-[#8a8271]' : 'text-[#1a1c1c]'}`}>{r.v}</dd>
                    </div>
                  ))}
                  <dt className="border-t border-[#d0c5af] pt-2 font-bold text-[#1a1c1c]">{isEs ? 'Su oferta' : 'Your offer'}</dt>
                  <dd className="m-0 border-t border-[#d0c5af] pt-2 text-right text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? 'un % de $978' : 'a % of $978'}
                  </dd>
                </dl>
                <p className="mt-4 text-xs leading-relaxed text-[#4d4635]">
                  {isEs ? (
                    <>La misma cuenta está en nuestra <Link href={p('/sell')} className="font-semibold text-[#735c00] underline underline-offset-2">guía para vender</Link>. No tiene nada de malo. Solo es la única cuenta que ellos tienen.</>
                  ) : (
                    <>The same math is on our <Link href={p('/sell')} className="font-semibold text-[#735c00] underline underline-offset-2">Sell guide</Link>. Nothing wrong with it. It is just the only math they have.</>
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-[#735c00] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]" style={{ boxShadow: 'inset 0 3px 0 #d4af37, 0 10px 28px rgba(38,28,6,0.04)' }}>
                <p className={`${labelClass} text-[#735c00]`} style={{ fontFamily: 'var(--font-label)' }}>
                  Naples Estate Jewelry
                </p>
                <p className="mb-4 text-xl font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {isEs ? 'El mismo número, y luego una segunda mirada' : 'The same number, then a second look'}
                </p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums">
                  {oursRows.map((r) => (
                    <div key={r.kEn} className="contents">
                      <dt className={r.muted ? 'text-[#8a8271]' : 'text-[#4d4635]'}>{isEs ? r.kEs : r.kEn}</dt>
                      <dd className={`m-0 text-right font-semibold ${r.muted ? 'text-[#8a8271]' : 'text-[#1a1c1c]'}`}>{r.v}</dd>
                    </div>
                  ))}
                  <dt className="border-t border-[#d0c5af] pt-2 font-bold text-[#1a1c1c]">{isEs ? 'Su oferta' : 'Your offer'}</dt>
                  <dd className="m-0 border-t border-[#d0c5af] pt-2 text-right text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                    {isEs ? 'el mayor de los dos' : 'the higher of the two'}
                  </dd>
                </dl>
                <p className="mt-4 text-xs leading-relaxed text-[#4d4635]">
                  {isEs
                    ? 'Sin porcentajes inventados. Algunas piezas honestamente son de fundición, y se lo diremos. Las que no lo son se pagan como joyas.'
                    : 'No invented percentages. Some pieces are honestly melt, and we will tell you so. The ones that aren’t get paid as jewelry.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Above melt vs. honestly melt */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Qué suele valer más que el metal, y qué honestamente no' : 'What tends to carry value above melt, and what honestly doesn’t'}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'La segunda mirada solo rinde cuando hay un comprador para la pieza en sí. Aquí está, más o menos, dónde cae esa línea en nuestro mostrador.'
              : 'The second look only pays off when there is a buyer for the piece itself. Here is roughly where that line falls at our counter.'}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className={cardClass}>
              <p className={`${labelClass} text-[#735c00]`} style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'A menudo vale más que el metal' : 'Often worth more than the metal'}
              </p>
              <ul className="m-0 list-none p-0">
                {aboveMelt.map((i) => (
                  <li key={i.tEn} className="flex items-start gap-3 border-t border-[#e3dccd] py-3 first:border-t-0">
                    <span aria-hidden="true" className="mt-2 block h-2.5 w-2.5 flex-none rounded-full bg-[#d4af37]" />
                    <div>
                      <p className="m-0 text-sm font-bold text-[#1a1c1c]">{isEs ? i.tEs : i.tEn}</p>
                      <p className="m-0 text-sm text-[#4d4635]">{isEs ? i.sEs : i.sEn}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className={cardClass}>
              <p className={`${labelClass} text-[#4d4635]`} style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Honestamente fundición, y se lo diremos' : 'Honestly melt, and we will say so'}
              </p>
              <ul className="m-0 list-none p-0">
                {honestlyMelt.map((i) => (
                  <li key={i.tEn} className="flex items-start gap-3 border-t border-[#e3dccd] py-3 first:border-t-0">
                    <span aria-hidden="true" className="mt-2 block h-2.5 w-2.5 flex-none rounded-full bg-[#bdb5a4]" />
                    <div>
                      <p className="m-0 text-sm font-bold text-[#1a1c1c]">{isEs ? i.tEs : i.tEn}</p>
                      <p className="m-0 text-sm text-[#4d4635]">{isEs ? i.sEs : i.sEn}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works at the counter */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className="mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Cómo funciona la oferta de dos maneras en el mostrador' : 'How the both-ways offer works at the counter'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs ? 'Nada sale de su vista, y usted escucha ambos números.' : 'Nothing leaves your sight, and you hear both numbers.'}
            </p>
            <ol className="m-0 mt-8 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.tEn} className={cardClass}>
                  <p className="mb-2 text-3xl font-bold leading-none text-[#735c00]" style={{ fontFamily: 'var(--font-headline)' }}>{i + 1}</p>
                  <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? s.tEs : s.tEn}</p>
                  <p className="m-0 text-sm leading-relaxed text-[#4d4635]">{isEs ? s.bEs : s.bEn}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>Tráigala al salón en 6240 Shirley St, Ste 104, Naples, o <Link href={evalHref} className="font-semibold text-[#735c00] underline underline-offset-2">programe una tasación gratuita</Link>. Visitas a domicilio a pedido para patrimonios grandes.</>
              ) : (
                <>Bring it to the showroom at 6240 Shirley St, Ste 104, Naples, or <Link href={evalHref} className="font-semibold text-[#735c00] underline underline-offset-2">book a free appraisal</Link>. Home visits on request for larger estates.</>
              )}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Antes de Venderle a un Fundidor' : 'Before You Sell to a Melter'}
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
              <>¿Quiere saber qué vale su oro en metal antes de venir? La cuenta completa está en <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su oro</Link>; para leer las marcas, vea <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">cómo leer los sellos</Link>.</>
            ) : (
              <>Want the metal math before you come in? It is all on <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your gold is worth</Link>; for reading the marks, see <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">how to read hallmarks</Link>.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="scale" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Conozca ambos números antes de que alguien encienda el soplete' : 'Get both numbers before anyone lights a torch'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Traiga su oro, plata y joyería al salón, o programe una evaluación gratuita. La manera en que valga más es la manera en que pagamos.'
                : 'Bring your gold, silver, and jewelry to the showroom, or book a free evaluation. Whichever way it prices higher is the way we pay.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <Link href={evalHref} className="gold-button">
                {isEs ? 'PROGRAMAR TASACIÓN GRATUITA' : 'SCHEDULE A FREE APPRAISAL'}
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
