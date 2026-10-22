import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import TradingViewMini from '@/components/trading/TradingViewMini';
import { fetchSpotData } from '@/lib/spot-price';
import { AppIcon } from '@/components/AppIcon';
import ClayMark, { type ClayMarkName } from '@/components/ClayMark';
import { TESTIMONIALS } from '@/lib/testimonials';
import SilverMarksTeaser from '@/components/silver/SilverMarksTeaser';
import FaqSection, { type Faq } from '@/components/FaqSection';
import { phoneHoursLabel } from '@/lib/business-location';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    // "Silver Buyer" restated "Sell Silver"; those characters now carry the
    // exact phrase instead. This is the page that should own "sell sterling
    // silver naples", and it previously had the term everywhere EXCEPT its
    // title. With the template applied this renders at 58 characters, inside
    // Google's display limit.
    title: isEs
      ? 'Vender Plata Esterlina en Naples, FL'
      : 'Sell Sterling Silver in Naples, FL',
    // Phone in the description (2026-09-08): parity with the diamond, watch
    // and appraisal pages. "By weight or by pattern, whichever is higher" is
    // the page's own owner-confirmed flatware rule. ⚠️ Kept near 150
    // characters on purpose — Google truncates around 155–160 on phones and
    // the phone number is the last thing in the string.
    description: isEs
      ? 'Venda plata esterlina en Naples, FL — cubertería, juegos de té, monedas, lingotes. Valorada por peso o por patrón, la mayor. Llame al (239) 404-8505.'
      : 'Sell sterling silver in Naples, FL — flatware, tea services, coins, bullion. Priced by weight or pattern, whichever is higher. Call (239) 404-8505.',
    path: '/silver-services',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

// `icon` is the placeholder shown while an item has no photograph. It is
// per-item rather than one shared fallback, which previously drew the same
// flatware icon beside both "Estate Flatware" and "Tea Services".
const GALLERY_ITEMS = [
  { key: 'flatware', titleEn: 'Estate Flatware', titleEs: 'Cubertería de Patrimonio', subEn: 'Full Sets & Individual Pieces', subEs: 'Juegos Completos y Piezas Individuales', img: '/assets/images/pages/silver-marks/ebay-flatware-set-v2.webp', icon: 'dining' },
  { key: 'tea', titleEn: 'Tea Services', titleEs: 'Servicios de Té', subEn: 'Holloware & Serving Trays', subEs: 'Vajilla y Bandejas', img: '/assets/images/pages/silver-marks/ebay-tea-tray-service.webp', icon: 'emoji_food_beverage' },
  { key: 'coins', titleEn: 'Bullion & Coins', titleEs: 'Lingotes y Monedas', subEn: '99.9% Pure Investment Silver', subEs: 'Plata de Inversión 99.9% Pura', img: '/assets/images/pages/silver-bullion.webp', icon: 'toll' },
  { key: 'jewelry', titleEn: 'Fine Jewelry', titleEs: 'Joyería Fina', subEn: 'Designer & Vintage Collections', subEs: 'Colecciones de Diseñador y Vintage', img: '/assets/images/pages/ring.jpg', icon: 'diamond' },
];

/**
 * FAQ (2026-09-08) — parity with the diamond, watch and appraisal pages
 * (the "why are the calls about diamonds?" investigation). Every answer
 * restates copy already on this page: the sterling-or-plate marks, the
 * owner-confirmed "price both ways, pay the higher" flatware rule with its
 * small top tier (never a maker list), weighted pieces priced on the silver
 * actually there, monograms and tarnish, coins and bullion at spot.
 */
const SILVER_FAQS: readonly Faq[] = [
  {
    qEn: 'Is my silver sterling or plated?',
    qEs: '¿Mi plata es esterlina o chapada?',
    aEn: 'The mark tells you. Sterling is marked "925", "Sterling", or the British lion passant, and every gram counts. Plate is usually marked "EPNS", "Silver on Copper", or "Quadruple Plate" — a thin layer over base metal with little melt value. If there is no mark, we test it in front of you.',
    aEs: 'El sello lo dice. La esterlina lleva "925", "Sterling" o el león pasante británico, y cada gramo cuenta. El chapado suele decir "EPNS", "Silver on Copper" o "Quadruple Plate" — una capa fina sobre metal base con poco valor de fundición. Si no hay sello, la probamos frente a usted.',
  },
  {
    qEn: 'How do you price sterling flatware and tea services?',
    qEs: '¿Cómo valoran la cubertería y los juegos de té de plata esterlina?',
    aEn: 'Both ways, piece by piece: by weight at the live silver spot price, and as a pattern for the small top tier — Tiffany Chrysanthemum, Georg Jensen designs, and names of that caliber — and we pay whichever is higher. A full service with its serving pieces is what collectors of a pattern want most.',
    aEs: 'De las dos maneras, pieza por pieza: por peso al precio spot de la plata en vivo, y como patrón para el pequeño grupo de élite — Tiffany Chrysanthemum, los diseños de Georg Jensen y nombres de ese calibre — y pagamos la mayor de las dos. Un juego completo con sus piezas de servir es lo que más buscan los coleccionistas de un patrón.',
  },
  {
    qEn: 'Do monograms or tarnish lower the offer?',
    qEs: '¿Los monogramas o el deslustre bajan la oferta?',
    aEn: 'A monogram rarely changes a melt-value offer, and on collected patterns it matters less than sellers fear. Leave the tarnish alone — polishing removes silver and adds nothing to the price.',
    aEs: 'Un monograma rara vez cambia una oferta por valor de fundición, y en los patrones de colección importa menos de lo que temen los vendedores. Deje el deslustre como está — pulir quita plata y no suma nada al precio.',
  },
  {
    qEn: 'What about weighted candlesticks and compotes?',
    qEs: '¿Y los candelabros y compoteras con peso añadido?',
    aEn: 'Pieces marked weighted or reinforced are mostly cement or pitch inside a thin sterling shell. We price them honestly, on the silver that is actually there — no surprises at the counter.',
    aEs: 'Las piezas marcadas weighted o reinforced son en su mayoría cemento o brea dentro de una capa fina de esterlina. Las valoramos con honestidad, por la plata que realmente hay — sin sorpresas en el mostrador.',
  },
  {
    qEn: 'Do you buy silver coins and bullion?',
    qEs: '¿Compran monedas y lingotes de plata?',
    aEn: 'Yes. Spot price is the live market baseline; for coins and bullion we confirm weight and purity first, then use the current market to explain a straightforward offer.',
    aEs: 'Sí. El precio spot es la referencia del mercado en vivo; para monedas y lingotes confirmamos primero el peso y la pureza, y luego usamos el mercado actual para explicar una oferta directa.',
  },
  {
    qEn: 'Do I need an appointment to sell silver in Naples?',
    qEs: '¿Necesito cita para vender plata en Naples?',
    aEn: 'No. Walk into our Shirley St showroom in North Naples during open hours, or book a private appointment — including home visits across Southwest Florida. Weighed, tested, and priced in front of you, with immediate payment.',
    aEs: 'No. Entre a nuestro salón de Shirley St en North Naples durante el horario de atención, o reserve una cita privada — incluidas visitas a domicilio en todo el suroeste de Florida. Pesado, probado y valorado frente a usted, con pago inmediato.',
  },
];

export default async function SilverServicesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const spot = await fetchSpotData();
  const silverSpot = spot.silverPerTroyOz ? spot.silverPerTroyOz.toFixed(2) : null;

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Vender Plata Esterlina' : 'Sell Sterling Silver', path: '/silver-services' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">


        {/* Hero */}
        <section className="relative h-[640px] flex items-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <Image
              src="/assets/images/pages/silver.webp"
              alt="Silver estate pieces"
              fill
              sizes="100vw"
              className="object-cover grayscale opacity-80"
              priority
            />
            {/* Text-holding wash. The old left→right gradient (solid → 60% at the
                midpoint → transparent) only protected text that stayed in the
                left half — true on desktop, false on phones and tablets where
                the text box spans ~92% of the width. Measured 2026-09-06 from
                the real image: body text 1.06:1 at 375px, 1.46:1 at 768px
                (AA needs 4.5:1). Below lg the whole hero gets a 90% wash (the
                photo stays as texture); from lg the gradient holds solid to
                45%, 90% at 60% (past the 704px text edge at 1200px) and fades
                to 30% at the right so the silver still shows. */}
            <div className="absolute inset-0 bg-[#f9f9f7]/90 lg:bg-transparent lg:bg-gradient-to-r lg:from-[#f9f9f7] lg:from-45% lg:via-[#f9f9f7]/90 lg:via-60% lg:to-[#f9f9f7]/30" />
          </div>
          <div className="ultrawide-page relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 w-full">
            <div className="max-w-2xl">
              <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" />
              <span className="text-[#735c00] text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                {isEs ? 'Cubertería, Juegos de Té y Joyería' : 'Flatware, Tea Services & Jewelry'}
              </span>
              <h1 className="font-[family-name:var(--font-headline)] text-4xl md:text-5xl font-bold text-[#1a1c1c] mb-6 leading-tight">
                {isEs
                  ? 'Venda Plata Esterlina en Naples'
                  : 'Sell Sterling Silver in Naples'}
              </h1>
              <p className="text-lg text-[#4d4635] mb-10 max-w-xl leading-relaxed">
                {isEs
                  ? 'Compramos cubertería de plata esterlina, juegos de té, monedas y joyería — una pieza o toda una colección. Identificamos su plata y explicamos la oferta.'
                  : 'We buy sterling flatware, tea services, coins, and jewelry — one piece or a full collection. We identify your silver and explain our offer.'}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                  className="gold-button"
                >
                  {isEs ? 'TASACIÓN GRATUITA' : 'Free Appraisal'}
                </Link>
                {/* 2026-09-08 (mockup approved): "Current Silver Rates" → the
                    phone. Silver sellers call; the rates survive as the text
                    link below, pointing at the live-prices page the next
                    section links as well. */}
                <a href="tel:2394048505" className="outline-button" style={{ gap: '0.5rem' }}>
                  <AppIcon name="call" className="text-[1rem]" />
                  {isEs ? 'LLAMAR (239) 404-8505' : 'CALL (239) 404-8505'}
                </a>
              </div>
              <p className="mt-4 text-sm text-[#4d4635]">{phoneHoursLabel(isEs)}</p>
              <Link
                href={isEs ? '/es/spot-prices' : '/spot-prices'}
                className="mt-4 inline-block text-sm font-semibold text-[#735c00] underline underline-offset-2"
              >
                {isEs ? 'Precio spot de la plata hoy →' : 'Today’s silver spot price →'}
              </Link>
            </div>
          </div>
        </section>

        {/* Silver Spot Reference */}
        <section className="py-16 bg-[#f3f3f3] border-y border-[#d0c5af]">
          <div className="ultrawide-page max-w-[1440px] mx-auto px-4 md:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5">
                <span className="text-xs font-bold text-[#735c00] uppercase tracking-[0.2em] mb-4 block">
                  {isEs ? 'Referencia del Mercado en Vivo' : 'Live Market Reference'}
                </span>
                <h2 className="font-[family-name:var(--font-headline)] text-2xl md:text-3xl font-bold text-[#1a1c1c] mb-4">
                  {isEs ? 'Precio Spot de la Plata' : 'Current Silver Spot Price'}
                </h2>
                <p className="text-sm text-[#4d4635] leading-relaxed">
                  {isEs
                    ? 'El precio spot establece la línea de base del mercado en vivo para la plata. Para plata esterlina, monedas y lingotes, confirmamos el peso y la pureza, luego explicamos una oferta directa.'
                    : 'Spot price gives us the live market baseline for silver. For sterling, coins, and bullion, we confirm weight and purity first, then use the current market to explain a straightforward offer.'}
                </p>
                <p className="mt-4 text-sm">
                  <Link href={isEs ? '/es/spot-prices' : '/spot-prices'} className="font-semibold text-[#735c00] underline underline-offset-2">
                    {isEs ? 'Gráficos a tamaño completo de la plata, el oro, el platino y el paladio →' : 'Full-size charts for silver, gold, platinum and palladium →'}
                  </Link>
                </p>
              </div>
              <div className="lg:col-span-7">
                <div className="overflow-hidden rounded-2xl border border-[#d0c5af] bg-white shadow-[0_18px_54px_rgba(38,28,6,0.07)]">
                  <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <h3 className="font-[family-name:var(--font-headline)] text-xl font-bold text-[#735c00]">Silver</h3>
                    {silverSpot ? (
                      <span className="text-sm font-bold text-[#1a1c1c]">
                        ${silverSpot}
                        <span className="text-xs font-normal text-[#4d4635] uppercase tracking-wider"> /oz</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[#4d4635] uppercase tracking-wider">Spot</span>
                    )}
                  </div>
                  <div className="px-2 pb-2">
                    <TradingViewMini symbol="OANDA:XAGUSD" height={220} transparent />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Fine Silver Estate Services — "what we buy". Moved up from the
            bottom of the page 2026-09-06 (owner-approved split mockup): a
            seller should meet what we buy right after the spot price, not
            after 1,300 words about hallmarks. */}
        <section className="ultrawide-page py-20 max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="mb-12 flex items-end justify-between">
            <div>
              <span className="text-xs font-bold text-[#735c00] uppercase tracking-[0.2em] mb-3 block">
                {isEs ? 'Qué compramos' : 'What We Buy'}
              </span>
              <h2 className="font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold">
                {isEs ? 'Servicios de Plata Fina' : 'Fine Silver Estate Services'}
              </h2>
              <p className="text-sm text-[#4d4635] mt-2">
                {isEs
                  ? 'Especializados en colecciones de patrimonio de alto valor y lingotes profesionales.'
                  : 'Specializing in high-value estate collections and professional bullion.'}
              </p>
            </div>
            <div className="hidden md:block h-px flex-grow mx-8 bg-[#d0c5af]" />
          </div>
          {/* 2026-09-06: tiles were 3:4 portrait with a fixed 300×400 next/image —
              rendered at ~450px wide on a 2-column tablet view, so a landscape
              photo was cropped to portrait AND upscaled ("fuzzy", owner). Now
              square, four across from md, and `fill` + `sizes` so the image
              is served at the tile's real size. `sizes` is ~1.5x the tile width because
              object-cover scales a 3:2 landscape photo to the SQUARE tile's height. */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {GALLERY_ITEMS.map(({ key, titleEn, titleEs, subEn, subEs, img, icon }) => (
              <div key={key} className="group cursor-pointer">
                <div className="relative mb-4 aspect-square overflow-hidden rounded-2xl bg-[#e8e8e8] shadow-[0_14px_38px_rgba(38,28,6,0.08)]">
                  {img ? (
                    <Image
                      src={img}
                      alt={isEs ? titleEs : titleEn}
                      fill
                      sizes="(min-width: 768px) 33vw, 68vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <AppIcon name={icon}
                        className="text-[#7f7663]"
                        style={{ fontSize: '3rem' }}
                       />
                    </div>
                  )}
                </div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#1a1c1c]">
                  {isEs ? titleEs : titleEn}
                </h4>
                <p className="text-xs text-[#4d4635] mt-1">{isEs ? subEs : subEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Scientific Testing Method — "how we buy" (moved up 2026-09-06). */}
        <section className="bg-[#2f3131] text-white py-20">
          <div className="ultrawide-page max-w-[1440px] mx-auto px-4 md:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <h2 className="font-[family-name:var(--font-headline)] text-3xl font-bold mb-6">
                  {isEs ? 'Nuestro Método de Prueba Científica' : 'Our Scientific Testing Method'}
                </h2>
                <p className="text-sm text-[#d7d0c3] mb-8 leading-relaxed">
                  {isEs
                    ? 'Empleamos estándares analíticos rigurosos para asegurar que reciba el máximo valor por sus activos. Nuestras pruebas no destructivas protegen la integridad de sus piezas.'
                    : 'We employ rigorous analytical standards to ensure you receive the maximum value for your assets. Our non-destructive testing protects the integrity of your pieces.'}
                </p>
                <div className="flex items-center gap-2 text-[#e9c349]">
                  <AppIcon name="verified_user" className="text-lg" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isEs ? 'REVISIÓN CUIDADOSA DEL MERCADO' : 'CAREFUL MARKET REVIEW'}
                  </span>
                </div>
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { mark: 'scale', titleEn: 'Precision Weight', titleEs: 'Peso de Precisión', descEn: 'Using calibrated Ohaus scales to measure in Troy ounces and Grams for pinpoint accuracy.', descEs: 'Usando básculas Ohaus calibradas para medir en onzas Troy y gramos con precisión.' },
                  { mark: 'magnet', titleEn: 'Magnetism', titleEs: 'Magnetismo', descEn: 'Silver is non-magnetic. We use rare-earth neodymium testing to identify ferrous cores.', descEs: 'La plata no es magnética. Usamos pruebas de neodimio para identificar núcleos ferrosos.' },
                  { mark: 'flask', titleEn: 'Assay Analysis', titleEs: 'Análisis de Ensayo', descEn: 'Onsite acid testing at your appointment; offsite XRF spectrometry when exact assay documentation is needed.', descEs: 'Prueba ácida en el sitio; espectrometría XRF externa cuando se necesita documentación exacta.' },
                ].map(({ mark, titleEn, titleEs, descEn, descEs }) => (
                  <div key={mark} className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-[0_16px_44px_rgba(0,0,0,0.12)]">
                    {/* onDark: this section is a dark band, so the float shadow
                        would be invisible. The gold disc went with the icon —
                        gold clay on a #735c00 circle is gold on gold. */}
                    <ClayMark name={mark as ClayMarkName} size={80} onDark className="mb-6 block" />
                    <h4 className="font-[family-name:var(--font-headline)] text-lg font-bold mb-4 text-[#e9c349]">
                      {isEs ? titleEs : titleEn}
                    </h4>
                    <p className="text-sm text-[#d7d0c3] leading-relaxed">{isEs ? descEs : descEn}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sterling or plate? — 2026-09-06: the former "Identifying Silver: A
            Professional Guide" cards and the "Flatware, Tea Services & the
            Silverplate Question" section were two answers to the same
            question on one page. Merged under one heading (owner-approved
            split mockup). The illustrated marks section now lives at
            /silver-services/silver-marks and is teased below. */}
        <section className="ultrawide-page py-20 max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="text-center mb-14">
            <h2 className="font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold mb-4">
              {isEs ? '¿Esterlina o Chapada? La Diferencia lo Es Casi Todo' : 'Sterling or Plate? The Difference Is Nearly Everything'}
            </h2>
            <div className="w-20 h-px bg-[#735c00] mx-auto mb-6" />
            <p className="max-w-xl mx-auto text-sm leading-relaxed text-[#4d4635]">
              {isEs
                ? 'La pregunta que más respondemos: ¿es esterlina o es chapada? El sello lo dice — la esterlina vale su peso, el chapado es casi todo metal base.'
                : 'The most common question we answer: is it sterling, or is it plated? The mark tells you — sterling is worth its weight, plate is mostly base metal.'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Sterling Silver */}
            <div className="flex flex-col rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_18px_54px_rgba(38,28,6,0.06)] md:p-10">
              <div className="mb-8">
                <span className="text-[10px] font-bold text-[#735c00] uppercase tracking-widest">
                  {isEs ? 'Activo Premium' : 'Premium Asset'}
                </span>
                <h3 className="font-[family-name:var(--font-headline)] text-2xl font-bold mt-2">
                  {isEs ? 'Plata Esterlina (.925)' : 'Sterling Silver (.925)'}
                </h3>
              </div>
              <p className="text-sm text-[#4d4635] mb-8 leading-relaxed">
                {isEs
                  ? 'La plata esterlina genuina consiste en 92.5% de plata pura. Es un metal precioso de calidad de inversión que mantiene valor intrínseco de mercado independientemente de su condición.'
                  : 'Genuine sterling silver consists of 92.5% pure silver. It is an investment-grade precious metal that maintains intrinsic market value regardless of condition.'}
              </p>
              <ul className="space-y-4 mb-8 flex-grow">
                {[
                  { en: 'Hallmarks: Look for "925", "Sterling", or the British Lion Passant.', es: 'Marcas: Busque "925", "Sterling" o el León Pasante Británico.' },
                  { en: 'Natural Tarnish: Develops a warm, dark patina over time.', es: 'Pátina Natural: Desarrolla una pátina oscura y cálida con el tiempo.' },
                  { en: 'Resonant Sound: Produces a long, high-pitched ring when tapped.', es: 'Sonido Resonante: Produce un tono largo y agudo al golpearlo.' },
                ].map((item) => (
                  <li key={item.en} className="flex items-start gap-3">
                    <AppIcon name="verified" className="text-[#735c00] text-sm mt-0.5" />
                    <span className="text-sm">{isEs ? item.es : item.en}</span>
                  </li>
                ))}
              </ul>
              {/* Was a grey placeholder until 2026-09-06: a repoussé sterling
                  tea and coffee service with kettle on stand (eBay sold-listing
                  photo, owner's choice; provenance in CHANGELOG 2026-09-06). */}
              <div className="relative aspect-video overflow-hidden rounded-xl bg-[#f3f3f3]">
                <Image
                  src="/assets/images/pages/silver-marks/ebay-tea-service.webp"
                  alt={isEs ? 'Juego de té y café de plata esterlina repujada' : 'Repoussé sterling silver tea and coffee service'}
                  fill
                  sizes="(min-width: 768px) 45vw, 90vw"
                  className="object-cover"
                />
              </div>
            </div>

            {/* Silver Plate */}
            <div className="flex flex-col rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_18px_54px_rgba(38,28,6,0.06)] md:p-10">
              <div className="mb-8">
                <span className="text-[10px] font-bold text-[#4d4635] uppercase tracking-widest">
                  {isEs ? 'Metal Base' : 'Base Metal'}
                </span>
                <h3 className="font-[family-name:var(--font-headline)] text-2xl font-bold mt-2">
                  {isEs ? 'Plata Chapada' : 'Silver Plate'}
                </h3>
              </div>
              <p className="text-sm text-[#4d4635] mb-8 leading-relaxed">
                {isEs
                  ? 'El chapado en plata implica una fina capa de plata electrodepositada sobre metales base como cobre o latón. Estos artículos tienen valor estético pero valor metálico limitado.'
                  : 'Silver plating involves a thin layer of silver electroplated over base metals like copper or brass. These items hold aesthetic value but limited metal melt value.'}
              </p>
              <ul className="space-y-4 mb-8 flex-grow">
                {[
                  { en: 'Hallmarks: Often marked "EPNS", "Silver on Copper", or "Quadruple Plate".', es: 'Marcas: Frecuentemente marcado "EPNS", "Silver on Copper" o "Quadruple Plate".' },
                  { en: 'Base Metal Reveal: Often shows "bleeding" where brass or copper shows through.', es: 'Metal Base Visible: A menudo muestra latón o cobre a través del revestimiento.' },
                  { en: 'Dull Sound: Produces a short, flat "clunk" when tapped.', es: 'Sonido Apagado: Produce un sonido corto y plano al golpearlo.' },
                ].map((item) => (
                  <li key={item.en} className="flex items-start gap-3">
                    <AppIcon name="info" className="text-[#7f7663] text-sm mt-0.5" />
                    <span className="text-sm text-[#4d4635]">{isEs ? item.es : item.en}</span>
                  </li>
                ))}
              </ul>
              {/* Was a grey placeholder until 2026-09-06: the E.P.N.S. stamp
                  itself, large — the thing a seller should go and look for. */}
              <div className="relative aspect-video overflow-hidden rounded-xl bg-[#f3f3f3]">
                <Image
                  src="/assets/images/pages/silver-marks/ebay-epns-crafton.webp"
                  alt={isEs ? 'Sello E.P.N.S. bajo una tetera chapada' : 'E.P.N.S. stamp under a plated teapot'}
                  fill
                  sizes="(min-width: 768px) 45vw, 90vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          {/* Flatware & silverplate — added 2026-08-29 (step 2 of the content
              plan; owner approved the mockup and confirmed the price-both-ways
              claim). All statements are objective silver-domain facts;
              Chantilly and Francis I really are patterns carried in the shop.
              There is no /es prefix helper on this page, so hrefs are built
              inline like its other links. Folded under the Sterling-or-Plate
              heading 2026-09-06. */}
          <div className="text-center mt-16 mb-10">
            <h3 className="font-[family-name:var(--font-headline)] text-2xl md:text-3xl font-bold">
              {isEs ? 'Cubertería, Juegos de Té y la Cuestión del Chapado' : 'Flatware, Tea Services & the Silverplate Question'}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <span className="text-[10px] font-bold text-[#735c00] uppercase tracking-widest">
                {isEs ? 'Maciza — vale la fundición o más' : 'Solid — worth melt or more'}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Busque Sterling, 925 o el león inglés (lion passant). Los fabricantes americanos posteriores a 1868 casi siempre lo indican por escrito. Si dice sterling, cada gramo cuenta — cubertería, juegos de té, bandejas y piezas de servir por igual.'
                  : 'Look for Sterling, 925, or the English lion passant. American makers after about 1868 nearly always say it outright. If it says sterling, every gram counts — flatware, tea services, trays, and serving pieces alike.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <span className="text-[10px] font-bold text-[#993c1d] uppercase tracking-widest">
                {isEs ? 'Chapada — casi todo metal base' : 'Plated — mostly base metal'}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? "EPNS, 'quadruple plate', 'silver on copper' y la mayoría de la vajilla de hotel son una capa fina de plata sobre metal base, con poco valor de fundición. Le diremos cuál es cuál gratis — antes de que cruce la ciudad cargando un cofre con esperanzas."
                  : "EPNS, 'quadruple plate,' 'silver on copper,' and most hotel ware are a thin silver skin over base metal, with little melt value. We will tell you which is which for free — before you haul a chest across town hoping."}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_10px_28px_rgba(38,28,6,0.04)] mb-6">
            <span className="text-[10px] font-bold text-[#735c00] uppercase tracking-widest">
              {isEs ? 'Patrones que pueden superar la fundición' : 'Patterns that can beat melt'}
            </span>
            <p className="mt-3 text-sm leading-relaxed text-[#4d4635]">
              {/* Aligned 2026-08-31 with the owner's top-tier-only framing rule
                  (DECISIONS → "Premium-pattern framing"): no maker list implying
                  broad premiums, no discounting ordinary sets. The price-both-ways
                  promise and the we-stock-these credibility stay. */}
              {isEs
                ? 'Un pequeño grupo de primer nivel — patrones como Tiffany Chrysanthemum, los diseños de Georg Jensen y nombres de ese calibre — puede valer más como cubertería que como metal, y las piezas de servir inusuales a veces también. Por eso calculamos el precio de ambas formas, pieza por pieza, y pagamos el que resulte mayor. Gorham Chantilly y Reed & Barton Francis I son patrones que también vendemos en nuestra propia tienda: este es nuestro terreno.'
                : 'A small top tier — patterns such as Tiffany Chrysanthemum, Georg Jensen designs, and names of that caliber — can be worth more as flatware than as metal, and unusual serving pieces sometimes join them. That is why we price every set both ways, piece by piece, and pay whichever is higher. Gorham Chantilly and Reed & Barton Francis I are patterns we also sell in our own shop: this is our lane.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <span className="text-[10px] font-bold text-[#735c00] uppercase tracking-widest">
                {isEs ? 'Piezas con relleno' : 'Weighted pieces'}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Los candelabros y compotas marcados weighted o reinforced son en su mayoría cemento o brea dentro de una capa fina de esterlina. Los valoramos con honestidad, por la plata que realmente contienen — sin sorpresas en el mostrador.'
                  : 'Candlesticks and compotes marked weighted or reinforced are mostly cement or pitch inside a thin sterling shell. We price them honestly, on the silver that is actually there — no surprises at the counter.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#d0c5af] bg-white p-8 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
              <span className="text-[10px] font-bold text-[#735c00] uppercase tracking-widest">
                {isEs ? 'Monogramas y pulido' : 'Monograms & polish'}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#4d4635]">
                {isEs
                  ? 'Un monograma rara vez cambia una oferta por valor de fundición, y en los patrones coleccionados importa menos de lo que se teme. Y deje la pátina en paz — pulir quita plata y no suma nada al precio.'
                  : 'A monogram rarely changes a melt-value offer, and on collected patterns it matters less than sellers fear. And leave the tarnish alone — polishing removes silver and adds nothing to the price.'}
              </p>
            </div>
          </div>

          {/* Flatware photo — 2026-09-06 (eBay sold-listing photo, owner's
              choice). Gorham Chantilly: a place setting with its serving
              pieces — the pattern the shop itself stocks. */}
          <figure className="mx-auto mb-10 max-w-3xl overflow-hidden rounded-2xl border border-[#d0c5af] bg-white shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
            <div className="relative aspect-[16/9]">
              <Image
                src="/assets/images/pages/silver-marks/ebay-flatware-chantilly.webp"
                alt={isEs ? 'Cubertería Gorham Chantilly con piezas de servir' : 'Gorham Chantilly flatware with serving pieces'}
                fill
                sizes="(min-width: 1024px) 768px, 90vw"
                className="object-cover"
              />
            </div>
            <figcaption className="px-5 py-3 text-center text-xs leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Un servicio completo con sus piezas de servir — aquí Gorham Chantilly — es lo que más buscan los coleccionistas de un patrón.'
                : 'A full service with its serving pieces — here Gorham Chantilly — is what collectors of a pattern want most.'}
            </figcaption>
          </figure>

          <p className="text-center text-sm leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>¿No está seguro de lo que vale su juego? Nuestra <Link href="/es/silver-services/flatware-value" className="font-semibold text-[#735c00] underline">guía del valor de la cubertería</Link> recorre toda la matemática — esterlina vs. chapado, la trampa de los cuchillos y cuándo un patrón supera la fundición.</>
            ) : (
              <>Not sure what your set is worth? Our <Link href="/silver-services/flatware-value" className="font-semibold text-[#735c00] underline">flatware value guide</Link> walks the full math — sterling vs. plate, the knife trap, and when patterns beat melt.</>
            )}
          </p>
        </section>

        {/* Reading the marks — teaser. The 26-photo section itself moved to
            /silver-services/silver-marks on 2026-09-06 (owner: the lander
            should explain how and what we buy; the guide is one click
            deeper). Four photos + the link; copy in the component. */}
        <SilverMarksTeaser locale={locale} />

        {/* Recently Through Our Doors — proof strip (2026-08-31, owner-approved
            mockup). ⚠️ REAL pieces only: these are actual catalog items (every
            shop piece was bought from a local seller — that is what "through
            our doors" means), the photos are our own product shots, and the
            links go to live product pages, which persist after a sale. Never
            swap in mock sets, stock photos, or invented specs — provability is
            the point of a proof strip, and fabricated purchase records were
            explicitly declined (see TASKS 2026-08-31). The quote renders from
            the single testimonial source, verbatim rule and all. Curated by
            hand: swap the three entries whenever the owner wants new features. */}
        <section className="py-20">
          <div className="ultrawide-page mx-auto max-w-[1440px] px-4 md:px-8">
            <h2 className="mb-3 text-center text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Recién Pasaron por Nuestras Manos' : 'Recently Through Our Doors'}
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-center text-sm leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Cada pieza de plata en nuestra tienda fue comprada a un vendedor del suroeste de Florida — muchas veces sobre este mismo mostrador. Algunas que llegaron recientemente:'
                : 'Every silver piece in our shop was bought from a Southwest Florida seller — often across this very counter. A few that came through recently:'}
            </p>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  href: isEs ? '/es/shop/tiffany-co-sterling-silver-punch-ladle-acanthus-pattern-pat-1895-53' : '/shop/tiffany-co-sterling-silver-punch-ladle-acanthus-pattern-pat-1895-53',
                  img: 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/1782170694128-nykplolon98.webp',
                  kEn: 'Top-tier maker',
                  kEs: 'Fabricante de primer nivel',
                  tEn: 'Tiffany & Co. Sterling Punch Ladle — Acanthus, Pat. 1895',
                  tEs: 'Cucharón de Ponche Tiffany & Co. — Acanthus, Pat. 1895',
                  altEn: 'Tiffany & Co. sterling silver punch ladle in the Acanthus pattern',
                  altEs: 'Cucharón de ponche Tiffany & Co. de plata esterlina, patrón Acanthus',
                },
                {
                  href: isEs ? '/es/shop/whiting-sterling-silver-handled-grape-shears-with-german-steel-blades-127' : '/shop/whiting-sterling-silver-handled-grape-shears-with-german-steel-blades-127',
                  img: 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/1784566893659-wxbgr1ugg4p.webp',
                  kEn: 'Unusual serving piece',
                  kEs: 'Pieza de servir inusual',
                  tEn: 'Whiting Sterling-Handled Grape Shears, German Steel Blades',
                  tEs: 'Tijeras para Uvas Whiting con Mango de Plata Esterlina',
                  altEn: 'Whiting sterling silver handled grape shears with German steel blades',
                  altEs: 'Tijeras para uvas Whiting con mango de plata esterlina y hojas de acero alemán',
                },
                {
                  href: isEs ? '/es/shop/bill-tompkins-american-coin-silver-hand-chased-repousse-coffee-pot-early-19th-century-55' : '/shop/bill-tompkins-american-coin-silver-hand-chased-repousse-coffee-pot-early-19th-century-55',
                  img: 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/1782676328908-a4nxdwju3zi.webp',
                  kEn: 'Estate hollowware',
                  kEs: 'Hollowware de patrimonio',
                  tEn: 'Ball, Tompkins & Black Coin Silver Repoussé Coffee Pot, Early 19th C.',
                  tEs: 'Cafetera Repujada de Plata Coin Ball, Tompkins & Black, Principios del S. XIX',
                  altEn: 'Ball, Tompkins & Black American coin silver hand-chased repoussé coffee pot',
                  altEs: 'Cafetera americana de plata coin repujada a mano de Ball, Tompkins & Black',
                },
              ].map((piece) => (
                <Link
                  key={piece.href}
                  href={piece.href}
                  className="group overflow-hidden rounded-2xl border border-[#d0c5af] bg-white shadow-[0_14px_38px_rgba(38,28,6,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="relative aspect-square w-full bg-[#f3f3f3]">
                    <Image
                      src={piece.img}
                      alt={isEs ? piece.altEs : piece.altEn}
                      fill
                      sizes="(max-width: 767px) 100vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-5">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                      {isEs ? piece.kEs : piece.kEn}
                    </p>
                    <p className="text-[15px] font-bold leading-snug text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                      {isEs ? piece.tEs : piece.tEn}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            {(() => {
              const linda = TESTIMONIALS.find((t) => t.name === 'Linda Cusumano');
              if (!linda) return null;
              return (
                <figure className="mx-auto mt-12 max-w-2xl text-center">
                  <blockquote>
                    <p className="text-lg leading-relaxed text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>
                      “{isEs ? linda.quoteEs : linda.quote}”
                    </p>
                  </blockquote>
                  <figcaption className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8a8677]" style={{ fontFamily: 'var(--font-label)' }}>
                    Linda Cusumano · {isEs ? 'Reseña de Google' : 'Google review'}
                  </figcaption>
                </figure>
              );
            })()}
          </div>
        </section>

        {/* FAQ — same block the diamond page carries (FaqSection). */}
        <FaqSection
          isEs={isEs}
          heading={isEs ? 'Preguntas Sobre Vender Plata' : 'Selling Silver FAQ'}
          faqs={SILVER_FAQS}
          footer={
            isEs ? (
              <>¿Vende más que plata? También compramos <Link href="/es/gold-services" className="font-semibold text-[#735c00] underline underline-offset-2">oro</Link> y <Link href="/es/estate-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">joyería de patrimonio</Link>. ¿Joyería de plata navajo, zuni o de Taxco? Vea <Link href="/es/estate-jewelry/native-american-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">cómo valoramos la joyería nativa americana y de turquesa</Link>.</>
            ) : (
              <>Selling more than silver? We also buy <Link href="/gold-services" className="font-semibold text-[#735c00] underline underline-offset-2">gold</Link> and <Link href="/estate-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">estate jewelry</Link>. Navajo, Zuni, or Taxco silver jewelry? See <Link href="/estate-jewelry/native-american-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">how we value Native American and turquoise jewelry</Link>.</>
            )
          }
        />

        {/* CTA */}
        <section className="bg-[#f3f3f3] border-y border-[#d0c5af] py-24 text-center">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold mb-6">
              {isEs ? '¿Listo para una Evaluación Profesional?' : 'Ready for a Professional Evaluation?'}
            </h2>
            <p className="text-base text-[#4d4635] mb-10 leading-relaxed max-w-xl mx-auto">
              {isEs
                ? 'Programe una evaluación privada para plata esterlina, cubertería, vajilla, monedas y lingotes, en nuestro salón de Naples o en su casa. Revisamos las piezas claramente y le presentamos una oferta directa con pago inmediato.'
                : 'Schedule a private evaluation for sterling silver, flatware, holloware, coins, and bullion — at our Naples showroom or in your home. We review the pieces clearly and provide a straightforward offer with prompt payment.'}
            </p>
            <div className="flex flex-col md:flex-row gap-4 justify-center">
              <Link
                href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                className="gold-button"
              >
                {isEs ? 'PROGRAMAR UNA CITA' : 'Schedule a Time'}
              </Link>
              <a
                href="tel:2394048505"
                className="outline-button"
              >
                {isEs ? 'Llamar (239) 404-8505' : 'Call (239) 404-8505'}
              </a>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
