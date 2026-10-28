import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import ClayMark from '@/components/ClayMark';
import GradeChartScale from '@/components/GradeChartScale';

interface Props {
  params: Promise<{ locale: string }>;
}

// The diamond guide (owner, 2026-10-27; mockup 2 approved): written for
// SELLERS, in the flatware-guide layout, nested under /diamond-buyers. The
// 4Cs are explained as what each does to an OFFER, and the full color and
// clarity scales sit in one linear chart (id="color-clarity-chart") that the
// owner pulls up at the counter — every grade in order, best to worst, one
// line each. Since 2026-10-28 (chart B) each scale is a `GradeChartScale`:
// compact by default (chips + a tapped grade's line + one line per band),
// "Show every grade" expands to the full list and is remembered per device.
// Owner facts baked in (DECISIONS.md → the /guides entry):
//   ⛔ never a refusal of loose stones — "we do, when the stone and the
//      price make sense; call first";
//   ⛔ never a resale multiplier — offers run "from a fraction of the
//      appraisal to a decent majority of it … depending on when and who";
//   lab-grown: bought at a nominal price (identified free, said plainly);
//   a GIA report is the seller's cost; old European / old mine cuts are
//   priced as antique stones, often as part of a piece.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? '¿Cuánto Vale Mi Anillo de Diamante al Venderlo?' : 'What Is My Diamond Ring Worth When I Sell It?',
    // ≤ ~155 characters with the phone LAST (2026-09-08 rule, DECISIONS.md).
    description: isEs
      ? 'Valor de reventa de un anillo de diamante: tasación vs. oferta, las 4C, forma, natural o de laboratorio, y la tabla de color y claridad. (239) 404-8505.'
      : 'Diamond ring resale value, explained for sellers: appraisal vs. offer, the 4Cs, shape, natural or lab-grown, and the full color and clarity chart. Call (239) 404-8505.',
    path: '/diamond-buyers/what-is-my-diamond-worth',
    locale,
  });
}

type ColorBand = 'colorless' | 'near' | 'faint' | 'veryLight' | 'light';
type ClarityBand = 'fl' | 'vvs' | 'vs' | 'si' | 'i';

const BAND_STYLE: Record<ColorBand | ClarityBand, { bg: string; fg: string }> = {
  colorless: { bg: '#ffffff', fg: '#1a1c1c' },
  near: { bg: '#fbf7ea', fg: '#1a1c1c' },
  faint: { bg: '#f6ecc6', fg: '#1a1c1c' },
  veryLight: { bg: '#efdc9a', fg: '#1a1c1c' },
  light: { bg: '#e2c25f', fg: '#1a1c1c' },
  fl: { bg: '#ffffff', fg: '#1a1c1c' },
  vvs: { bg: '#f3f3f3', fg: '#1a1c1c' },
  vs: { bg: '#e8e8e8', fg: '#1a1c1c' },
  si: { bg: '#dadada', fg: '#1a1c1c' },
  i: { bg: '#c7c7c7', fg: '#1a1c1c' },
};

export default async function DiamondWorthGuidePage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const evalHref = p('/free-evaluation');
  const canonicalUrl = `https://naplesestatejewelry.com${isEs ? '/es' : ''}/diamond-buyers/what-is-my-diamond-worth`;

  const appraisalCards = [
    {
      kEn: 'What the appraisal says', kEs: 'Lo que dice la tasación',
      tEn: 'Retail replacement value', tEs: 'Valor de reposición al detalle',
      dEn: 'What it would cost to walk into a jewelry store and buy a comparable ring new, at full retail margin — written for your insurance company, often by the store that sold the ring, often years ago.',
      dEs: 'Lo que costaría entrar en una joyería y comprar un anillo comparable nuevo, con el margen completo del detalle — escrito para su aseguradora, a menudo por la tienda que vendió el anillo, a menudo hace años.',
      accent: '#735c00',
    },
    {
      kEn: 'What a buyer pays', kEs: 'Lo que paga un comprador',
      tEn: 'Today’s resale value', tEs: 'El valor de reventa de hoy',
      dEn: 'What the stone and the mounting are worth on the secondary market right now. No store margin, no marketing, and today’s prices — which have moved a long way since many appraisals were written.',
      dEs: 'Lo que valen la piedra y la montura en el mercado secundario ahora mismo. Sin margen de tienda, sin publicidad y a precios de hoy — que han cambiado mucho desde que se escribieron muchas tasaciones.',
      accent: '#993c1d',
    },
  ];

  const fourCs = [
    {
      kEn: 'Carat', kEs: 'Quilates',
      tEn: 'Weight, and the walls at 1.00 and 2.00', tEs: 'El peso, y los escalones en 1.00 y 2.00',
      dEn: 'Price per carat steps up at the round numbers. A 0.95-carat stone and a 1.02-carat stone look identical on the hand and sell for noticeably different money. We weigh loose stones on a calibrated scale and estimate mounted ones from their measurements.',
      dEs: 'El precio por quilate sube de golpe en los números redondos. Una piedra de 0.95 quilates y una de 1.02 se ven iguales en la mano y se venden por cifras claramente distintas. Pesamos las piedras sueltas en una báscula calibrada y estimamos las montadas por sus medidas.',
    },
    {
      kEn: 'Color', kEs: 'Color',
      tEn: 'D to Z — the steps matter most on big stones', tEs: 'De D a Z — los escalones pesan más en piedras grandes',
      dEn: 'Near-colorless (G–J) is where most estate rings sit, and one color step there moves a one-carat stone by a modest amount. The same step on a three-carat stone is real money. A warm stone in a yellow-gold mounting is less penalized than the chart suggests, because that is how it will be sold again.',
      dEs: 'La mayoría de los anillos de patrimonio están en el rango casi incoloro (G–J), y ahí un escalón de color mueve una piedra de un quilate una cantidad modesta. El mismo escalón en una de tres quilates es dinero de verdad. Una piedra cálida en una montura de oro amarillo se penaliza menos de lo que sugiere la tabla, porque así se volverá a vender.',
    },
    {
      kEn: 'Clarity', kEs: 'Claridad',
      tEn: 'Eye-clean is the line that matters', tEs: 'Limpia a simple vista: la línea que importa',
      dEn: 'Flawless to I3 on paper; in resale the question is whether an inclusion shows to the naked eye. A VS2 or SI1 stone that is eye-clean sells close to the grades above it. A visible black inclusion or a feather at the edge is priced down hard, whatever the paper says.',
      dEs: 'De Flawless a I3 en el papel; en la reventa la pregunta es si una inclusión se ve a simple vista. Una piedra VS2 o SI1 limpia a simple vista se vende cerca de los grados superiores. Una inclusión negra visible o una fisura en el borde se castiga fuerte, diga lo que diga el papel.',
    },
    {
      kEn: 'Cut', kEs: 'Talla',
      tEn: 'Proportions, light — and old cuts are not bad cuts', tEs: 'Proporciones, luz — y las tallas antiguas no son malas tallas',
      dEn: 'A well-cut round brilliant is the most liquid stone there is. Old European and old mine cuts from antique rings are not downgraded for being different: they are priced as antique stones, often as part of a piece worth more intact than taken apart.',
      dEs: 'Un brillante redondo bien tallado es la piedra más fácil de vender que existe. Las tallas europea antigua y old mine de los anillos antiguos no se rebajan por ser distintas: se valoran como piedras antiguas, muchas veces como parte de una pieza que vale más entera que desmontada.',
    },
  ];

  const shapes = [
    { sEn: 'Round brilliant', sEs: 'Brillante redondo', dEn: 'The deepest market by far — easiest to resell, so it earns the fullest offer.', dEs: 'El mercado más profundo con diferencia — el más fácil de revender, así que recibe la oferta más completa.' },
    { sEn: 'Oval · Cushion · Emerald · Princess', sEs: 'Oval · Cojín · Esmeralda · Princesa', dEn: 'Real demand, a little behind rounds; condition and proportions matter more.', dEs: 'Demanda real, un poco por detrás de los redondos; el estado y las proporciones importan más.' },
    { sEn: 'Marquise · Pear · Heart', sEs: 'Marquesa · Pera · Corazón', dEn: 'A narrower pool of buyers, so these are priced lower per carat than a round of the same grades.', dEs: 'Un grupo de compradores más reducido, así que se valoran por debajo de un redondo de los mismos grados.' },
    { sEn: 'Melee (the tiny accent stones)', sEs: 'Melee (las piedras pequeñas de acento)', dEn: 'Close to no resale value on their own; they count as part of the piece, not as diamonds.', dEs: 'Casi sin valor de reventa por sí solas; cuentan como parte de la pieza, no como diamantes.' },
  ];

  // The color scale, every grade in order (GIA D–Z). One line each; the band
  // note says what the band does to an offer.
  const colorBands: { band: ColorBand; nameEn: string; nameEs: string; offerEn: string; offerEs: string }[] = [
    { band: 'colorless', nameEn: 'Colorless (D–F)', nameEs: 'Incoloro (D–F)', offerEn: 'The top band; priced highest per carat and the steps between D, E and F are only visible to a grader.', offerEs: 'La banda superior; la más cara por quilate, y los pasos entre D, E y F solo los ve un gradador.' },
    { band: 'near', nameEn: 'Near colorless (G–J)', nameEs: 'Casi incoloro (G–J)', offerEn: 'Where most estate rings sit. White to the eye in a mounting; each step costs a modest amount on a one-carat stone.', offerEs: 'Donde están la mayoría de los anillos de patrimonio. Blancos a la vista en una montura; cada paso cuesta una cantidad modesta en un quilate.' },
    { band: 'faint', nameEn: 'Faint (K–M)', nameEs: 'Tenue (K–M)', offerEn: 'A warm tint you can see. Priced well below near-colorless — but flattered by yellow or rose gold, which softens the discount.', offerEs: 'Un tono cálido que se ve. Muy por debajo del casi incoloro — pero el oro amarillo o rosa lo favorece y suaviza el descuento.' },
    { band: 'veryLight', nameEn: 'Very light (N–R)', nameEs: 'Muy ligero (N–R)', offerEn: 'Light yellow or brown at a glance. Priced as a tinted stone; the steps within the band matter little.', offerEs: 'Amarillo o marrón ligero a primera vista. Se valora como piedra con tono; los pasos dentro de la banda importan poco.' },
    { band: 'light', nameEn: 'Light (S–Z)', nameEs: 'Ligero (S–Z)', offerEn: 'Obvious yellow or brown. Beyond Z a stone is graded as a fancy color on a different scale — and can be worth more again.', offerEs: 'Amarillo o marrón evidente. Más allá de Z la piedra se gradúa como color fantasía en otra escala — y puede volver a valer más.' },
  ];
  const colorGrades: { g: string; band: ColorBand; en: string; es: string }[] = [
    { g: 'D', band: 'colorless', en: 'No color at all, even to a grader. The rarest grade.', es: 'Sin ningún color, ni para un gradador. El grado más raro.' },
    { g: 'E', band: 'colorless', en: 'Colorless; only a grader comparing it against master stones can tell it from D.', es: 'Incoloro; solo un gradador comparándolo con piedras patrón lo distingue de D.' },
    { g: 'F', band: 'colorless', en: 'Colorless face-up; a grader sees a trace from the side. The last colorless grade.', es: 'Incoloro de frente; un gradador ve un rastro de lado. El último grado incoloro.' },
    { g: 'G', band: 'near', en: 'The first near-colorless grade; color shows only beside D–F master stones.', es: 'El primer grado casi incoloro; el color solo se nota junto a piedras patrón D–F.' },
    { g: 'H', band: 'near', en: 'Faint warmth to a grader against white; colorless to the eye in a mounting.', es: 'Leve calidez para un gradador sobre blanco; incoloro a la vista en una montura.' },
    { g: 'I', band: 'near', en: 'Slight warmth noticeable face-down on white; still white face-up in most settings.', es: 'Ligera calidez visible boca abajo sobre blanco; sigue blanco de frente en casi todas las monturas.' },
    { g: 'J', band: 'near', en: 'A faint tint an untrained eye can catch on a larger stone; disappears in yellow gold.', es: 'Un tono tenue que un ojo no entrenado capta en una piedra grande; desaparece en oro amarillo.' },
    { g: 'K', band: 'faint', en: 'Visible warmth; the first faint grade. Flattered by yellow or rose gold.', es: 'Calidez visible; el primer grado tenue. Lo favorece el oro amarillo o rosa.' },
    { g: 'L', band: 'faint', en: 'Noticeable light yellow.', es: 'Amarillo claro perceptible.' },
    { g: 'M', band: 'faint', en: 'Clearly warm; the last of the faint band.', es: 'Claramente cálido; el último de la banda tenue.' },
    { g: 'N', band: 'veryLight', en: 'Light yellow or brown, visible at a glance.', es: 'Amarillo o marrón ligero, visible a primera vista.' },
    { g: 'O', band: 'veryLight', en: 'Very light tint; slightly more than N.', es: 'Tono muy ligero; algo más que N.' },
    { g: 'P', band: 'veryLight', en: 'Very light tint.', es: 'Tono muy ligero.' },
    { g: 'Q', band: 'veryLight', en: 'Very light tint.', es: 'Tono muy ligero.' },
    { g: 'R', band: 'veryLight', en: 'Very light tint; the last of the band.', es: 'Tono muy ligero; el último de la banda.' },
    { g: 'S', band: 'light', en: 'Light yellow or brown, obvious to anyone.', es: 'Amarillo o marrón ligero, evidente para cualquiera.' },
    { g: 'T', band: 'light', en: 'Light tint.', es: 'Tono ligero.' },
    { g: 'U', band: 'light', en: 'Light tint.', es: 'Tono ligero.' },
    { g: 'V', band: 'light', en: 'Light tint.', es: 'Tono ligero.' },
    { g: 'W', band: 'light', en: 'Light tint.', es: 'Tono ligero.' },
    { g: 'X', band: 'light', en: 'Light tint.', es: 'Tono ligero.' },
    { g: 'Y', band: 'light', en: 'Light tint.', es: 'Tono ligero.' },
    { g: 'Z', band: 'light', en: 'The last grade on the D–Z scale; more color than this is “fancy.”', es: 'El último grado de la escala D–Z; más color que esto es «fantasía».' },
  ];

  const clarityBands: { band: ClarityBand; nameEn: string; nameEs: string; offerEn: string; offerEs: string }[] = [
    { band: 'fl', nameEn: 'Flawless (FL · IF)', nameEs: 'Sin defectos (FL · IF)', offerEn: 'Extremely rare; a premium that only a lab report can prove.', offerEs: 'Extremadamente raro; una prima que solo un informe de laboratorio puede demostrar.' },
    { band: 'vvs', nameEn: 'Very, very slightly included (VVS1 · VVS2)', nameEs: 'Inclusiones muy, muy leves (VVS1 · VVS2)', offerEn: 'Clean under the loupe to all but a grader; priced near the top.', offerEs: 'Limpia bajo la lupa para todos menos un gradador; cerca del tope.' },
    { band: 'vs', nameEn: 'Very slightly included (VS1 · VS2)', nameEs: 'Inclusiones muy leves (VS1 · VS2)', offerEn: 'Always eye-clean. The resale sweet spot: a VS2 earns nearly what the grades above it do.', offerEs: 'Siempre limpia a simple vista. El punto dulce de la reventa: una VS2 recibe casi lo mismo que los grados superiores.' },
    { band: 'si', nameEn: 'Slightly included (SI1 · SI2)', nameEs: 'Inclusiones leves (SI1 · SI2)', offerEn: 'Usually eye-clean at SI1, sometimes not at SI2 — the eye decides the price more than the letters.', offerEs: 'Normalmente limpia a simple vista en SI1, a veces no en SI2 — el ojo decide el precio más que las letras.' },
    { band: 'i', nameEn: 'Included (I1 · I2 · I3)', nameEs: 'Con inclusiones (I1 · I2 · I3)', offerEn: 'Visible to the naked eye; priced near the floor for the carat weight, the mounting often matters as much.', offerEs: 'Visibles a simple vista; cerca del piso para ese peso, y la montura suele importar tanto como la piedra.' },
  ];
  // nameEn/nameEs = what the abbreviation stands for; it is the first thing a
  // tapped clarity chip shows (owner, 10-28). The GIA terms stay in English in
  // the Spanish name, followed by their meaning.
  const clarityGrades: { g: string; band: ClarityBand; en: string; es: string; nameEn: string; nameEs: string }[] = [
    { g: 'FL', band: 'fl', en: 'No inclusions or blemishes visible at 10× magnification.', es: 'Sin inclusiones ni marcas visibles a 10 aumentos.', nameEn: 'Flawless', nameEs: 'Flawless — sin defectos' },
    { g: 'IF', band: 'fl', en: 'No inclusions at 10×; only minor surface blemishes.', es: 'Sin inclusiones a 10×; solo marcas superficiales menores.', nameEn: 'Internally Flawless', nameEs: 'Internally Flawless — sin defectos internos' },
    { g: 'VVS1', band: 'vvs', en: 'Inclusions so slight they are very difficult for a skilled grader to see at 10×.', es: 'Inclusiones tan leves que a un gradador experto le cuesta mucho verlas a 10×.', nameEn: 'Very, Very Slightly Included 1', nameEs: 'Very, Very Slightly Included 1 — inclusiones muy, muy leves' },
    { g: 'VVS2', band: 'vvs', en: 'Very, very slight inclusions, still difficult to see at 10×.', es: 'Inclusiones muy, muy leves, todavía difíciles de ver a 10×.', nameEn: 'Very, Very Slightly Included 2', nameEs: 'Very, Very Slightly Included 2 — inclusiones muy, muy leves' },
    { g: 'VS1', band: 'vs', en: 'Minor inclusions a grader finds with some effort at 10×; never visible to the eye.', es: 'Inclusiones menores que un gradador encuentra con algo de esfuerzo a 10×; nunca visibles a simple vista.', nameEn: 'Very Slightly Included 1', nameEs: 'Very Slightly Included 1 — inclusiones muy leves' },
    { g: 'VS2', band: 'vs', en: 'Minor inclusions somewhat easier to see at 10×; still eye-clean.', es: 'Inclusiones menores algo más fáciles de ver a 10×; todavía limpia a simple vista.', nameEn: 'Very Slightly Included 2', nameEs: 'Very Slightly Included 2 — inclusiones muy leves' },
    { g: 'SI1', band: 'si', en: 'Inclusions noticeable at 10×; usually eye-clean, which is why SI1 prices close to VS2.', es: 'Inclusiones notables a 10×; normalmente limpia a simple vista, por eso SI1 se valora cerca de VS2.', nameEn: 'Slightly Included 1', nameEs: 'Slightly Included 1 — inclusiones leves' },
    { g: 'SI2', band: 'si', en: 'Inclusions easy to see at 10×; sometimes visible to the naked eye, especially in larger stones.', es: 'Inclusiones fáciles de ver a 10×; a veces visibles a simple vista, sobre todo en piedras grandes.', nameEn: 'Slightly Included 2', nameEs: 'Slightly Included 2 — inclusiones leves' },
    { g: 'I1', band: 'i', en: 'Inclusions obvious at 10× and often visible to the eye; may affect brilliance.', es: 'Inclusiones evidentes a 10× y a menudo visibles a simple vista; pueden afectar el brillo.', nameEn: 'Included 1', nameEs: 'Included 1 — con inclusiones' },
    { g: 'I2', band: 'i', en: 'Obvious inclusions visible to the naked eye; brilliance clearly affected.', es: 'Inclusiones evidentes a simple vista; el brillo claramente afectado.', nameEn: 'Included 2', nameEs: 'Included 2 — con inclusiones' },
    { g: 'I3', band: 'i', en: 'Large, obvious inclusions; can affect durability. The bottom of the scale.', es: 'Inclusiones grandes y evidentes; pueden afectar la durabilidad. El final de la escala.', nameEn: 'Included 3', nameEs: 'Included 3 — con inclusiones' },
  ];

  const labCards = [
    {
      kEn: 'Why it matters', kEs: 'Por qué importa',
      tEn: 'Lab-grown stones have very little resale value', tEs: 'Las piedras de laboratorio tienen muy poco valor de reventa',
      dEn: 'A laboratory-grown diamond is a real diamond, but new ones now sell for a small fraction of what they cost a few years ago, and a used one has to compete with that falling new price. We do buy them — at a nominal price — and we will tell you plainly which you have, for free, before any number is discussed.',
      dEs: 'Un diamante de laboratorio es un diamante de verdad, pero los nuevos se venden hoy por una pequeña fracción de lo que costaban hace unos años, y uno usado compite con ese precio nuevo en caída. Los compramos — a un precio simbólico — y le diremos con claridad cuál tiene, gratis, antes de hablar de cifras.',
      accent: '#735c00',
    },
    {
      kEn: 'How we check', kEs: 'Cómo lo comprobamos',
      tEn: 'The loupe first, then the instrument', tEs: 'Primero la lupa, después el instrumento',
      dEn: 'Most lab-grown stones graded since the mid-2010s carry “Laboratory-Grown” and a report number laser-inscribed on the girdle, readable under a 10× loupe. Stones without an inscription go through a screening instrument, and a significant stone can be sent for a GIA report — the inscription is a clue, the lab is the proof.',
      dEs: 'La mayoría de las piedras de laboratorio graduadas desde mediados de los 2010 llevan «Laboratory-Grown» y un número de informe grabado con láser en el filetín, legible con una lupa de 10×. Las piedras sin grabado pasan por un instrumento de detección, y una piedra importante puede enviarse a GIA — el grabado es una pista, el laboratorio es la prueba.',
      accent: '#993c1d',
    },
  ];

  const mountingCards = [
    {
      kEn: 'The gold', kEs: 'El oro',
      tEn: 'Weighed and priced at live spot', tEs: 'Pesado y valorado al spot en vivo',
      dEn: 'The setting is gold, and it is weighed and priced at today’s spot price on top of the stone — never “thrown in.” Platinum mountings are priced as platinum.',
      dEs: 'La montura es oro, y se pesa y se valora al precio spot de hoy además de la piedra — nunca «de regalo». Las monturas de platino se valoran como platino.',
    },
    {
      kEn: 'The maker', kEs: 'El fabricante',
      tEn: 'Signed pieces are priced as pieces', tEs: 'Las piezas firmadas se valoran como piezas',
      dEn: 'A Tiffany, Cartier or Van Cleef & Arpels ring is worth more whole than as a stone plus scrap. So is a fine antique mounting. We check the shank for a signature and hallmarks before we think about melt.',
      dEs: 'Un anillo de Tiffany, Cartier o Van Cleef & Arpels vale más entero que como piedra más chatarra. Igual que una montura antigua fina. Revisamos el aro en busca de firma y sellos antes de pensar en la fundición.',
    },
  ];

  const bring = [
    { bEn: 'The ring, as it is.', bEs: 'El anillo, tal como está.', rEn: 'No need to clean or polish it; we will.', rEs: 'No hace falta limpiarlo ni pulirlo; lo hacemos nosotros.' },
    { bEn: 'Any lab report', bEs: 'Cualquier informe de laboratorio', rEn: '— GIA, AGS, IGI — and the matching report number on the girdle. Papers for a significant stone add real money because the next buyer trusts them too.', rEs: '— GIA, AGS, IGI — y el número de informe grabado en el filetín. Los papeles de una piedra importante suman dinero de verdad porque el siguiente comprador también confía en ellos.' },
    { bEn: 'The old appraisal,', bEs: 'La tasación antigua,', rEn: 'even if it is decades old. It tells us the stated grades and lets us show you where the gap comes from.', rEs: 'aunque tenga décadas. Nos dice los grados declarados y nos permite mostrarle de dónde sale la diferencia.' },
    { bEn: 'The box and receipt', bEs: 'La caja y el recibo', rEn: 'if you have them (branded pieces especially).', rEs: 'si los tiene (sobre todo en piezas de marca).' },
    { bEn: 'A government photo ID', bEs: 'Una identificación oficial con foto', rEn: 'if you decide to sell — Florida requires it when we buy precious metals.', rEs: 'si decide vender — Florida la exige cuando compramos metales preciosos.' },
  ];

  const faqs = [
    {
      qEn: 'How much can I sell my diamond ring for?',
      qEs: '¿Por cuánto puedo vender mi anillo de diamante?',
      aEn: 'It depends on the stone’s carat, color, clarity and cut, its shape, whether it is natural or lab-grown, today’s resale market, and the gold and maker of the mounting. That is why we evaluate in person and explain each factor — a real number beats an online guess. The evaluation is free.',
      aEs: 'Depende de los quilates, el color, la claridad y la talla de la piedra, de su forma, de si es natural o de laboratorio, del mercado de reventa de hoy, y del oro y el fabricante de la montura. Por eso evaluamos en persona y explicamos cada factor — un número real vale más que una estimación en línea. La evaluación es gratuita.',
    },
    {
      qEn: 'Why is your offer so much less than my appraisal?',
      qEs: '¿Por qué su oferta es mucho menor que mi tasación?',
      aEn: 'Because the appraisal states what a store would charge to sell you a new equivalent, with its full margin, usually at the prices of the year it was written. We pay today’s resale value. Honest offers run from a fraction of the appraisal to a decent majority of it, depending on when it was written and by whom — and we would rather show you the math than surprise you with it.',
      aEs: 'Porque la tasación indica lo que una tienda cobraría por venderle un equivalente nuevo, con su margen completo, normalmente a los precios del año en que se escribió. Nosotros pagamos el valor de reventa de hoy. Las ofertas honestas van desde una fracción de la tasación hasta una buena parte de ella, según cuándo y quién la escribió — y preferimos mostrarle la cuenta antes que sorprenderlo.',
    },
    {
      qEn: 'Do you buy lab-grown diamonds?',
      qEs: '¿Compran diamantes de laboratorio?',
      aEn: 'Yes, at a nominal price — their resale value is very low and we say so before any number is discussed, not after. We identify yours free of charge either way.',
      aEs: 'Sí, a un precio simbólico — su valor de reventa es muy bajo y lo decimos antes de hablar de cifras, no después. Identificamos el suyo gratis en cualquier caso.',
    },
    {
      qEn: 'Should I get a GIA report before selling?',
      qEs: '¿Debo obtener un informe GIA antes de vender?',
      aEn: 'For a significant stone a current GIA report can help, and we can coordinate one; the fee is the seller’s. For a smaller stone the fee rarely pays for itself — we can grade it in front of you and explain the result.',
      aEs: 'Para una piedra importante un informe GIA actual puede ayudar, y podemos coordinarlo; la tarifa corre por cuenta del vendedor. Para una piedra pequeña rara vez compensa — podemos graduarla frente a usted y explicarle el resultado.',
    },
    {
      qEn: 'Do you buy loose diamonds?',
      qEs: '¿Compran diamantes sueltos?',
      aEn: 'We do, when the stone and the price make sense — most diamonds we buy arrive in a ring, and jewelry, gold and sterling are our first business. Call first with the carat weight, any grades or report, and the shape, and we will tell you before you make the trip.',
      aEs: 'Sí, cuando la piedra y el precio tienen sentido — la mayoría de los diamantes que compramos llegan en un anillo, y la joyería, el oro y la plata esterlina son nuestro primer negocio. Llame primero con el peso en quilates, los grados o el informe que tenga y la forma, y le diremos antes de que haga el viaje.',
    },
    {
      qEn: 'Where can I sell an engagement ring in Naples?',
      qEs: '¿Dónde puedo vender un anillo de compromiso en Naples?',
      aEn: 'At our Shirley St showroom in North Naples — walk in during open hours or book a private appointment, with home visits across Southwest Florida for larger estates. Tested, weighed and priced in front of you, paid on the spot.',
      aEs: 'En nuestro salón de Shirley St en North Naples — entre durante el horario de atención o reserve una cita privada, con visitas a domicilio en todo el suroeste de Florida para patrimonios grandes. Probado, pesado y valorado frente a usted, con pago en el acto.',
    },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Joyas con Diamantes' : 'Diamond Jewelry', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/diamond-buyers` },
      { '@type': 'ListItem', position: 3, name: isEs ? '¿Cuánto Vale Mi Diamante?' : 'What Is My Diamond Worth?', item: canonicalUrl },
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

  const h2 = 'mb-4 text-3xl font-bold text-[#1a1c1c] md:text-4xl';
  const card = 'rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]';
  const label = 'mb-2 text-xs font-bold uppercase tracking-[0.18em]';
  const link = 'font-semibold text-[#735c00] underline underline-offset-2';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        {/* py: on phones the text is taller than min-h, so without it the
            breadcrumb and the buttons touch the dark band's edges (owner, 10-28). */}
        <section className="relative flex min-h-[440px] items-center overflow-hidden bg-[#1a1c1c] py-12 md:py-16">
          <div className="ultrawide-page relative z-10 mx-auto w-full max-w-[1440px] px-4 md:px-8">
            <div className="max-w-3xl">
              <BreadcrumbTrailFromLd ld={breadcrumbLd} />
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'La Matemática Honesta · Naples, FL' : 'The Honest Math · Naples, FL'}
              </span>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
                {isEs ? '¿Cuánto Vale Mi Anillo de Diamante al Venderlo?' : 'What Is My Diamond Ring Worth When I Sell It?'}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#d7d0c3]">
                {isEs
                  ? 'La tasación del cajón dice un número. Cada comprador al que llama dice otro. Así funciona en realidad el valor de reventa de un anillo de diamante — el mismo recorrido que hacemos en voz alta en nuestro salón de Naples — para que pueda verificar la oferta de cualquiera, incluida la nuestra.'
                  : "The appraisal in the drawer says one number. Every buyer you call says another. Here is how the resale value of a diamond ring actually works — the same walk-through we do out loud at our Naples showroom — so you can check anyone's offer, including ours."}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href={evalHref} className="gold-button">
                  {isEs ? 'EVALUACIÓN GRATUITA DE DIAMANTES' : 'GET A FREE DIAMOND EVALUATION'}
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

        {/* Appraisal vs. sale price */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Primero: una tasación no es un precio de venta' : 'First: an appraisal is not a sale price'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Casi todos los anillos de diamante llegan con una tasación, y casi todos los vendedores se sorprenden con la diferencia. Los dos números miden cosas distintas.'
                : 'Almost every diamond ring arrives with an appraisal, and almost every seller is surprised by the gap. The two numbers measure different things.'}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {appraisalCards.map((c) => (
                <div key={c.kEn} className={card}>
                  <p className={label} style={{ color: c.accent, fontFamily: 'var(--font-label)' }}>{isEs ? c.kEs : c.kEn}</p>
                  <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? c.tEs : c.tEn}</p>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? c.dEs : c.dEn}</p>
                </div>
              ))}
            </div>
            <div className={`mt-6 ${card}`}>
              <p className={label} style={{ color: '#993c1d', fontFamily: 'var(--font-label)' }}>
                {isEs ? 'Qué tan lejos están' : 'How far apart they are'}
              </p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs ? (
                  <>Las ofertas honestas van desde una fracción de la tasación hasta una buena parte de ella. Lo que decide dónde cae la suya es <b className="text-[#1a1c1c]">cuándo</b> se escribió la tasación y <b className="text-[#1a1c1c]">quién</b> la escribió: un número de hace veinte años, de la joyería que vendió el anillo, queda muy por encima del mercado de hoy; una tasación reciente de un tasador independiente suele quedar mucho más cerca. Tráigala de todos modos — nos dice los grados declarados de la piedra, y le mostraremos exactamente de dónde sale la diferencia.</>
                ) : (
                  <>Honest offers run anywhere from a fraction of the appraisal to a decent majority of it. What decides where yours lands is <b className="text-[#1a1c1c]">when</b> the appraisal was written and <b className="text-[#1a1c1c]">who</b> wrote it: a twenty-year-old number from the selling jeweler sits far above today’s market; a recent appraisal by an independent appraiser usually sits much closer. Bring it anyway — it tells us the stone’s stated grades, and we will show you exactly where the gap comes from.</>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* The 4Cs */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Las 4C — tal como cambian su oferta' : 'The 4Cs — as they change your offer'}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'Todas las tablas de graduación de internet explican las 4C para quien compra un anillo. Esto es lo que hace cada una con el precio cuando el que vende es usted.'
              : 'Every grading chart on the internet explains the 4Cs for someone buying a ring. This is what each one does to the price when you are the one selling.'}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {fourCs.map((c) => (
              <div key={c.kEn} className={card}>
                <p className={label} style={{ color: '#735c00', fontFamily: 'var(--font-label)' }}>{isEs ? c.kEs : c.kEn}</p>
                <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? c.tEs : c.tEn}</p>
                <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? c.dEs : c.dEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The color and clarity chart — every grade, in order */}
        <section id="color-clarity-chart" className="scroll-mt-24 border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'La tabla de color y claridad, en orden' : 'The color and clarity chart, in order'}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Las dos escalas completas, del mejor grado al peor — la misma tabla que tenemos delante en el mostrador. Toque cualquier grado para leer su línea, o muestre todos los grados a la vez. Con una lupa de 10× y una luz blanca usted puede seguir la graduación con nosotros.'
                : 'Both full scales, best to worst — the same chart we keep in front of us at the counter. Tap any grade to read its line, or show every grade at once. With a 10× loupe and a white light you can follow the grading along with us.'}
            </p>

            {/* Color */}
            <div className="mt-8">
              <GradeChartScale
                title={isEs ? 'Color — de D (incoloro) a Z (ligero)' : 'Color — D (colorless) to Z (light)'}
                grades={colorGrades.map((c) => ({ g: c.g, band: c.band, line: isEs ? c.es : c.en }))}
                bands={colorBands.map((b) => ({ band: b.band, name: isEs ? b.nameEs : b.nameEn, offer: isEs ? b.offerEs : b.offerEn }))}
                bandStyle={BAND_STYLE}
                storageKey="nej.diamond-chart.color.expanded"
                isEs={isEs}
              />
            </div>

            {/* Clarity */}
            <div className="mt-6">
              <GradeChartScale
                title={isEs ? 'Claridad — de FL (sin defectos) a I3 (con inclusiones)' : 'Clarity — FL (flawless) to I3 (included)'}
                grades={clarityGrades.map((c) => ({ g: c.g, band: c.band, line: isEs ? c.es : c.en, name: isEs ? c.nameEs : c.nameEn }))}
                bands={clarityBands.map((b) => ({ band: b.band, name: isEs ? b.nameEs : b.nameEn, offer: isEs ? b.offerEs : b.offerEn }))}
                bandStyle={BAND_STYLE}
                storageKey="nej.diamond-chart.clarity.expanded"
                isEs={isEs}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Grados según la escala de GIA, graduados a 10 aumentos. Un grado en el papel es la opinión de un laboratorio en una fecha; la piedra se gradúa de nuevo frente a usted.'
                : 'Grades follow the GIA scale, graded at 10× magnification. A grade on paper is one laboratory’s opinion on one date; the stone is graded again in front of you.'}
            </p>
          </div>
        </section>

        {/* Shape and size */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'La forma y el tamaño deciden qué tan rápido se vende' : 'Shape and size decide how fast it sells'}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-[#4d4635]">
            {isEs
              ? 'Dos piedras con los mismos grados pueden valer cantidades distintas para un comprador, porque el comprador tiene que volver a venderlas.'
              : 'Two stones with the same grades can be worth different amounts to a buyer, because the buyer has to sell them again.'}
          </p>
          <div className={`mt-8 ${card} !p-0 overflow-hidden`}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#fbf7ea]">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>{isEs ? 'Forma' : 'Shape'}</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>{isEs ? 'Cómo se revende' : 'How it resells'}</th>
                </tr>
              </thead>
              <tbody>
                {shapes.map((s) => (
                  <tr key={s.sEn} className="border-t border-[#e3dccd]">
                    <td className="px-5 py-3 align-top font-bold text-[#1a1c1c]">{isEs ? s.sEs : s.sEn}</td>
                    <td className="px-5 py-3 text-[#4d4635]">{isEs ? s.dEs : s.dEn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[#4d4635]">
            {isEs
              ? 'Un redondo de un quilate se vende más rápido que una marquesa de tres. Compramos según el mercado real de hoy, no según una tabla de hace una década.'
              : 'A one-carat round sells faster than a three-carat marquise. We buy against today’s actual market, not a chart from a decade ago.'}
          </p>
        </section>

        {/* Natural or lab-grown */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Natural o de laboratorio — y cómo lo sabemos' : 'Natural or lab-grown — and how we tell'}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {labCards.map((c) => (
                <div key={c.kEn} className={card}>
                  <p className={label} style={{ color: c.accent, fontFamily: 'var(--font-label)' }}>{isEs ? c.kEs : c.kEn}</p>
                  <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? c.tEs : c.tEn}</p>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? c.dEs : c.dEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The mounting */}
        <section className="mx-auto max-w-5xl px-4 py-20 md:px-8">
          <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'La montura también cuenta' : 'The mounting counts too'}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {mountingCards.map((c) => (
              <div key={c.kEn} className={card}>
                <p className={label} style={{ color: '#735c00', fontFamily: 'var(--font-label)' }}>{isEs ? c.kEs : c.kEn}</p>
                <p className="mb-2 text-lg font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? c.tEs : c.tEn}</p>
                <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? c.dEs : c.dEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What to bring + loose stones */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <h2 className={h2} style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? 'Qué traer' : 'What to bring'}</h2>
            <ul className="max-w-3xl list-disc space-y-2 pl-6 text-base leading-relaxed text-[#4d4635]">
              {bring.map((b) => (
                <li key={b.bEn}>
                  <b className="text-[#1a1c1c]">{isEs ? b.bEs : b.bEn}</b> {isEs ? b.rEs : b.rEn}
                </li>
              ))}
            </ul>
            <div className={`mt-10 ${card}`}>
              <p className={label} style={{ color: '#735c00', fontFamily: 'var(--font-label)' }}>{isEs ? 'Piedras sueltas' : 'Loose stones'}</p>
              <p className="text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Somos compradores de joyería, oro y plata esterlina ante todo, y la mayoría de los diamantes que compramos llegan en un anillo. Sí compramos diamantes sueltos cuando la piedra y el precio tienen sentido. Llame primero con el peso en quilates, los grados o el informe que tenga y la forma, y le diremos antes de que haga el viaje si es uno con el que podemos ayudar.'
                  : 'We are a jewelry, gold and sterling silver buyer first, and most diamonds we buy arrive in a ring. We do buy loose diamonds when the stone and the price make sense. Call first with the carat weight, any grades or report you have, and the shape, and we will tell you before you make the trip whether it is one we can help with.'}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
            {isEs ? 'Preguntas Sobre la Reventa de Diamantes' : 'Diamond Resale FAQ'}
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
              <>¿Vende más que un anillo? También compramos <Link href={p('/gold-services')} className={link}>oro</Link>, <Link href={p('/silver-services')} className={link}>plata esterlina</Link> y <Link href={p('/estate-jewelry')} className={link}>joyería de patrimonio</Link> — vea la página de <Link href={p('/diamond-buyers')} className={link}>joyas con diamantes</Link> y las demás <Link href={p('/guides')} className={link}>guías</Link>.</>
            ) : (
              <>Selling more than a ring? We also buy <Link href={p('/gold-services')} className={link}>gold</Link>, <Link href={p('/silver-services')} className={link}>sterling silver</Link> and <Link href={p('/estate-jewelry')} className={link}>estate jewelry</Link> — see the <Link href={p('/diamond-buyers')} className={link}>diamond jewelry</Link> page and the other <Link href={p('/guides')} className={link}>guides</Link>.</>
            )}
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <ClayMark name="signet-ring" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Traiga el anillo. Traiga la tasación.' : 'Bring the ring. Bring the appraisal.'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Evaluación gratuita en el salón, o visita a domicilio con cita. Le mostraremos cada número.'
                : 'Free evaluation at the showroom, or a home visit by appointment. We will show you every number.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <Link href={evalHref} className="gold-button">
                {isEs ? 'TASACIÓN GRATUITA' : 'GET A FREE APPRAISAL'}
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
