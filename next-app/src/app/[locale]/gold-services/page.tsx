import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import TradingViewMini from '@/components/trading/TradingViewMini';
import GoldMarksTeaser from '@/components/gold/GoldMarksTeaser';
import FaqSection, { type Faq } from '@/components/FaqSection';
import { fetchSpotData } from '@/lib/spot-price';
import { AppIcon } from '@/components/AppIcon';
import ClayMark from '@/components/ClayMark';
import { phoneHoursLabel } from '@/lib/business-location';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Vender Oro en Naples, FL — Comprador de Oro'
      : 'Sell Gold in Naples, FL — Gold Buyer',
    // Phone in the description (2026-09-08): parity with the diamond, watch
    // and appraisal pages — a searcher who wants to call should not have to
    // click first. Claims are the page's own (tested in front of you, live
    // spot, immediate payment). ⚠️ Kept near 150 characters ON PURPOSE: Google
    // truncates around 155–160 on phones, and the phone number is the LAST
    // thing in the string — a longer sentence would cut off exactly the part
    // this change exists for.
    description: isEs
      ? 'Venda oro en Naples, FL — joyería, monedas, lingotes y oro dental. Probado frente a usted, precio spot en vivo, pago inmediato. Llame al (239) 404-8505.'
      : 'Sell gold in Naples, FL — jewelry, coins, bullion, dental gold. Tested in front of you, priced from live spot, paid immediately. Call (239) 404-8505.',
    path: '/gold-services',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

const KARAT_CARDS = [
  { karat: '24k', purity: '99.9% Pure', purityEs: '99.9% Puro', desc: 'The highest purity possible. Characteristically soft and bright orange-yellow. Common in bullion and investment bars.', descEs: 'La pureza más alta posible. Suave y de color amarillo-naranja brillante. Común en lingotes e inversiones.' },
  { karat: '22k', purity: '91.6% Pure', purityEs: '91.6% Puro', desc: 'Standard for sovereign coins and traditional high-end Indian and Middle Eastern jewelry designs.', descEs: 'Estándar para monedas soberanas y joyería tradicional de alta gama del sur de Asia y Oriente Medio.' },
  { karat: '18k', purity: '75.0% Pure', purityEs: '75.0% Puro', desc: "The luxury standard for fine jewelry. Marked as '18k' or '750'. Balanced durability and rich color.", descEs: 'El estándar de lujo para joyería fina. Marcado como "18k" o "750". Durabilidad y color equilibrados.' },
  { karat: '14k', purity: '58.3% Pure', purityEs: '58.3% Puro', desc: "The most common hallmark in North America. Marked '14k' or '585'. Ideal for everyday wear pieces.", descEs: 'La marca más común en América del Norte. Marcado "14k" o "585". Ideal para uso diario.' },
  { karat: '10k', purity: '41.7% Pure', purityEs: '41.7% Puro', desc: "The minimum standard to be legally called 'gold' in many regions. Highly durable due to alloy content.", descEs: 'El mínimo estándar para ser llamado "oro" legalmente en muchas regiones. Muy duradero.' },
];

const ACQUIRE_ITEMS = [
  { key: 'bullion', titleEn: 'Bullion & Coins', titleEs: 'Lingotes y Monedas', descEn: 'Sovereigns, Eagles, Krugerrands, and bars of any weight or mint.', descEs: 'Soberanos, Eagles, Krugerrands y barras de cualquier peso o casa de moneda.', img: '/assets/images/pages/bullion.webp' },
  { key: 'jewelry', titleEn: 'Fine Jewelry', titleEs: 'Joyería Fina', descEn: 'Designer pieces, wedding bands, necklaces, and heirloom estates.', descEs: 'Piezas de diseñador, anillos de boda, collares y patrimonios de familia.', img: '/assets/images/pages/gold.webp' },
  { key: 'scrap', titleEn: 'Scrap & Broken', titleEs: 'Chatarra y Roto', descEn: 'Damaged items, single earrings, and tangled chains are still highly valuable.', descEs: 'Los artículos dañados, aretes sueltos y cadenas enredadas siguen siendo muy valiosos.', img: '/assets/images/pages/scrap.jpg' },
  { key: 'dental', titleEn: 'Dental Gold', titleEs: 'Oro Dental', descEn: 'Crowns, bridges, and dental alloys. We provide competitive payouts for all dental gold.', descEs: 'Coronas, puentes y aleaciones dentales. Ofrecemos pagos competitivos para todo el oro dental.', img: '/assets/images/pages/dental.webp' },
];

/**
 * FAQ (2026-09-08) — the parity item from the "why are the calls about
 * diamonds?" investigation: the diamond, watch and appraisal pages carried a
 * FAQ + FAQPage schema, this page did not. Every answer restates copy that
 * already exists on this page or in the gold-worth guide; the dental and
 * plated answers follow the owner's rules (dental gold is SENT OUT for karat
 * testing and the offer follows the result; plated/gold-filled is never
 * bought as gold) — see `DECISIONS.md`.
 */
const GOLD_FAQS: readonly Faq[] = [
  {
    qEn: 'How do you price gold?',
    qEs: '¿Cómo valoran el oro?',
    aEn: 'Spot price is the live market starting point. We verify the karat, weight, and form of each piece in front of you, then explain how the current market translates into a clear offer — the same numbers you can follow on our live prices page.',
    aEs: 'El precio spot es el punto de partida del mercado en vivo. Verificamos los quilates, el peso y la forma de cada pieza frente a usted, y luego explicamos cómo el mercado actual se traduce en una oferta clara — los mismos números que puede seguir en nuestra página de precios en vivo.',
  },
  {
    qEn: 'Do you buy broken, damaged, or unmarked gold?',
    qEs: '¿Compran oro roto, dañado o sin marcar?',
    aEn: 'Yes. Damaged items, single earrings, and tangled chains are still gold and still valuable. Unmarked or antique pieces are verified with onsite acid and electronic testing at your appointment, with offsite XRF analysis through trusted lab partners when needed.',
    aEs: 'Sí. Los artículos dañados, los aretes sueltos y las cadenas enredadas siguen siendo oro y siguen teniendo valor. Las piezas sin marcar o antiguas se verifican con pruebas ácidas y electrónicas en el sitio durante su cita, y con análisis XRF externo a través de laboratorios de confianza cuando hace falta.',
  },
  {
    qEn: 'Do you buy dental gold?',
    qEs: '¿Compran oro dental?',
    aEn: 'Crowns, bridges, and dental alloys are real gold alloys and we buy them — but dental alloys vary widely, and the exact karat cannot be determined in the shop. We send dental gold out for testing to establish the exact karat before we buy, and the offer is set from that result rather than an estimate.',
    aEs: 'Las coronas, los puentes y las aleaciones dentales son aleaciones de oro reales y las compramos — pero varían mucho, y el quilataje exacto no puede determinarse en la tienda. Enviamos el oro dental a analizar para establecer el quilataje exacto antes de comprar, y la oferta se fija a partir de ese resultado, no de una estimación.',
  },
  {
    qEn: 'Do you buy gold-plated or gold-filled jewelry?',
    qEs: '¿Compran joyería chapada en oro o gold-filled?',
    aEn: 'We will identify it for free so you know for certain. Priced by gold content, plated pieces carry effectively none and gold-filled only a trace, so neither is bought as gold — but a plated piece can still be signed, antique, or collectible, and that is a different conversation.',
    aEs: 'La identificamos gratis para que lo sepa con certeza. Valoradas por su contenido de oro, las piezas chapadas prácticamente no tienen y las gold-filled solo una traza, así que ninguna se compra como oro — pero una pieza chapada puede ser firmada, antigua o de colección, y esa es otra conversación.',
  },
  {
    qEn: 'Do you buy gold coins and bullion?',
    qEs: '¿Compran monedas y lingotes de oro?',
    aEn: 'Yes — Sovereigns, Eagles, Krugerrands, and bars of any weight or mint, priced from the live spot market once weight and purity are verified in front of you.',
    aEs: 'Sí — soberanos, Eagles, Krugerrands y barras de cualquier peso o casa de moneda, valorados según el mercado spot en vivo una vez verificados el peso y la pureza frente a usted.',
  },
  {
    qEn: 'Do I need an appointment to sell gold in Naples?',
    qEs: '¿Necesito cita para vender oro en Naples?',
    aEn: 'No. Walk into our Shirley St showroom in North Naples during open hours, or book a private appointment — including home visits across Southwest Florida. Tested, weighed, and priced in front of you, with immediate payment.',
    aEs: 'No. Entre a nuestro salón de Shirley St en North Naples durante el horario de atención, o reserve una cita privada — incluidas visitas a domicilio en todo el suroeste de Florida. Probado, pesado y valorado frente a usted, con pago inmediato.',
  },
];

export default async function GoldServicesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const spot = await fetchSpotData();
  const goldSpot = spot.goldPerTroyOz ? Math.round(spot.goldPerTroyOz).toLocaleString('en-US') : null;

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Vender Oro' : 'Sell Gold', path: '/gold-services' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero. The photo is the shop's own hand of gold rings (owner's pick
            from four mockups, 2026-10-05) — it replaced gold bars and coins
            because the sellers this page is for bring jewelry. Frame, 40%
            photo over #1a1c1c and copy are unchanged. The source is a 900px
            wide phone photo: the owner chose it knowing it is soft on a wide
            screen. */}
        <section className="relative h-[640px] flex items-center bg-[#1a1c1c] overflow-hidden">
          <div className="absolute inset-0 opacity-40">
            <Image
              src="/assets/images/pages/gold-rings-hero.webp"
              alt="Gold and gemstone rings"
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="ultrawide-page relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 w-full">
            <div className="max-w-2xl">
              <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="dark" />
              <span className="text-[#e9c349] font-[family-name:var(--font-body)] text-xs font-bold tracking-[0.2em] uppercase block mb-4">
                {isEs ? 'Joyería de Oro, Monedas y Lingotes' : 'Gold Jewelry, Coins & Bullion'}
              </span>
              <h1 className="text-white font-[family-name:var(--font-headline)] text-4xl md:text-5xl font-bold mb-6 leading-tight">
                {isEs
                  ? 'Venda Oro en Naples, FL'
                  : 'Sell Gold in Naples, FL'}
              </h1>
              <p className="text-[#d7d0c3] text-lg mb-10 max-w-lg leading-relaxed">
                {isEs
                  ? 'Compramos joyería de oro, cadenas rotas, monedas y lingotes — una pieza o toda una colección. Evaluación gratuita en nuestro salón de Naples y pago inmediato al aceptar nuestra oferta.'
                  : 'We buy gold jewelry, broken chains, coins, and bullion — one piece or a whole collection. Free evaluation at our Naples showroom, with immediate payment when you accept our offer.'}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                  className="gold-button"
                >
                  {isEs ? 'TASACIÓN GRATUITA' : 'FREE APPRAISAL'}
                </Link>
                {/* 2026-09-08 (mockup approved): this was a SECOND link to the
                    same form ("Free Evaluation" beside "Get an Estimate"). The
                    phone is the action gold sellers actually take — the
                    diamond-calls investigation found the calls come from the
                    Business Profile while this hero steered everyone to a form.
                    Same white-outline style as the page's bottom CTA. */}
                <a
                  href="tel:2394048505"
                  className="outline-button"
                  style={{ borderColor: 'rgba(255,255,255,0.48)', color: 'white', background: 'rgba(255,255,255,0.08)', gap: '0.5rem' }}
                >
                  <AppIcon name="call" className="text-[1rem]" />
                  {isEs ? 'LLAMAR (239) 404-8505' : 'CALL (239) 404-8505'}
                </a>
              </div>
              <p className="mt-4 text-sm text-[#d7d0c3]">{phoneHoursLabel(isEs)}</p>
            </div>
          </div>
        </section>

        {/* Gold Spot Reference */}
        <section className="py-16 bg-[#f3f3f3] border-y border-[#d0c5af]">
          <div className="ultrawide-page max-w-[1440px] mx-auto px-4 md:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5">
                <span className="text-xs font-bold text-[#735c00] uppercase tracking-[0.2em] mb-4 block">
                  {isEs ? 'Referencia del Mercado en Vivo' : 'Live Market Reference'}
                </span>
                <h2 className="font-[family-name:var(--font-headline)] text-2xl md:text-3xl font-bold text-[#1a1c1c] mb-4">
                  {isEs ? 'Precio Spot del Oro' : 'Current Gold Spot Price'}
                </h2>
                <p className="text-sm text-[#4d4635] leading-relaxed">
                  {isEs
                    ? 'El precio spot es el punto de partida del mercado en vivo para el oro. Verificamos el quilataje, peso y forma de sus artículos, y le explicamos cómo el mercado actual se traduce en una oferta clara.'
                    : 'Spot price is the live market starting point for gold. We verify the karat, weight, and form of your items, then explain how the current market translates into a clear offer.'}
                </p>
                <p className="mt-4 text-sm">
                  <Link href={isEs ? '/es/spot-prices' : '/spot-prices'} className="font-semibold text-[#735c00] underline underline-offset-2">
                    {isEs ? 'Gráficos a tamaño completo del oro, la plata, el platino y el paladio →' : 'Full-size charts for gold, silver, platinum and palladium →'}
                  </Link>
                </p>
              </div>
              <div className="lg:col-span-7">
                <div className="overflow-hidden rounded-2xl border border-[#d0c5af] bg-white shadow-[0_18px_54px_rgba(38,28,6,0.07)]">
                  <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <h3 className="font-[family-name:var(--font-headline)] text-xl font-bold text-[#735c00]">Gold</h3>
                    {goldSpot ? (
                      <span className="text-sm font-bold text-[#1a1c1c]">
                        ${goldSpot}
                        <span className="text-xs font-normal text-[#4d4635] uppercase tracking-wider"> /oz</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[#4d4635] uppercase tracking-wider">Spot</span>
                    )}
                  </div>
                  <div className="px-2 pb-2">
                    <TradingViewMini symbol="OANDA:XAUUSD" height={220} transparent />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Items We Acquire */}
        <section className="ultrawide-page py-20 max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
            <div className="max-w-xl">
              <h2 className="font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold text-[#1a1c1c] mb-4">
                {isEs ? 'Artículos que Adquirimos' : 'Items We Acquire'}
              </h2>
              <p className="text-[#4d4635] text-sm leading-relaxed">
                {isEs
                  ? 'Compramos una amplia variedad de activos de oro, independientemente de su condición. Desde monedas de inversión impecables hasta joyería rota y chatarra industrial.'
                  : 'We purchase a wide variety of gold assets, regardless of their condition. From pristine investment coins to broken jewelry and industrial scrap.'}
              </p>
            </div>
            <Link
              href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
              className="outline-button inline-flex items-center gap-4 shrink-0"
              style={{ color: '#735c00' }}
            >
              {isEs ? 'INICIAR TASACIÓN' : 'START YOUR APPRAISAL'}
              <AppIcon name="trending_flat"  />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {ACQUIRE_ITEMS.map(({ key, titleEn, titleEs, descEn, descEs, img }) => (
              <div key={key} className="group cursor-pointer">
                <div className="mb-6 aspect-square overflow-hidden rounded-2xl bg-[#e8e8e8] shadow-[0_14px_38px_rgba(38,28,6,0.08)]">
                  {img ? (
                    <Image
                      src={img}
                      alt={isEs ? titleEs : titleEn}
                      width={400}
                      height={400}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ClayMark name="signet-ring" size={112} />
                    </div>
                  )}
                </div>
                <h3 className="font-[family-name:var(--font-headline)] text-lg font-bold mb-2">
                  {isEs ? titleEs : titleEn}
                </h3>
                <p className="text-[#4d4635] text-sm leading-relaxed">{isEs ? descEs : descEn}</p>
              </div>
            ))}
          </div>
          {/* Sibling crossover (2026-09-01) — the same closing line the
              2026-08-30 pages (/diamond-buyers, /jewelry-appraisal) carry.
              This page mentioned "sterling" twice and linked nowhere but
              /free-evaluation; a gold seller with a flatware chest had no path. */}
          <p className="mt-10 text-center text-sm leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>¿Vende más que oro? También compramos <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">plata esterlina</Link> y <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">joyería de patrimonio</Link>.</>
            ) : (
              <>Selling more than gold? We also buy <Link href={p('/silver-services')} className="font-semibold text-[#735c00] underline underline-offset-2">sterling silver</Link> and <Link href={p('/estate-jewelry')} className="font-semibold text-[#735c00] underline underline-offset-2">estate jewelry</Link>.</>
            )}
          </p>
        </section>

        {/* Decoding Gold Markings */}
        <section className="ultrawide-page py-20 max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold text-[#1a1c1c] mb-4">
              {isEs ? 'Marcas del Oro' : 'Decoding Gold Markings'}
            </h2>
            <div className="w-24 h-px bg-[#d0c5af] mx-auto" />
            <p className="mt-6 text-[#4d4635] text-sm max-w-xl mx-auto leading-relaxed">
              {isEs
                ? 'Entender la pureza de sus activos es el primer paso en una evaluación profesional.'
                : 'Understanding the purity of your assets is the first step in a professional estate evaluation. Use our guide to identify standard markings.'}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {KARAT_CARDS.map(({ karat, purity, purityEs, desc, descEs }) => (
              <div
                key={karat}
                className="flex flex-col items-center rounded-2xl border border-[#d0c5af] bg-white p-6 text-center shadow-[0_14px_38px_rgba(38,28,6,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-xl md:p-8"
              >
                <span className="font-[family-name:var(--font-headline)] text-4xl md:text-5xl font-bold text-[#735c00] mb-2">
                  {karat}
                </span>
                <span className="text-[10px] font-bold text-[#4d4635] uppercase tracking-wider mb-4">
                  {isEs ? purityEs : purity}
                </span>
                <div className="w-full h-px bg-[#d0c5af] mb-4 opacity-40" />
                <p className="text-xs text-[#4d4635] leading-relaxed">{isEs ? descEs : desc}</p>
              </div>
            ))}
          </div>
          {/* Guide links (2026-09-02): the karat cards are the teaser; the full
              math and the mark-reading live on their own guide pages. */}
          <p className="mt-10 text-center text-sm leading-relaxed text-[#4d4635]">
            {isEs ? (
              <>¿Quiere la cuenta completa? Lea <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su oro</Link> — la fórmula peso × pureza × spot con un ejemplo práctico — o nuestra <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">guía de sellos</Link> para saber qué tiene.</>
            ) : (
              <>Want the full math? Read <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your gold is worth</Link> — the weight × purity × spot formula with a worked example — or our <Link href={p('/jewelry-appraisal/hallmarks')} className="font-semibold text-[#735c00] underline underline-offset-2">hallmark guide</Link> to find out what you have.</>
            )}
          </p>
        </section>

        {/* Gold marks — teaser for the illustrated guide at
            /gold-services/gold-marks (2026-09-06, the gold twin of the silver
            lander's teaser). Sits right after "Decoding Gold Markings". */}
        <GoldMarksTeaser locale={locale} />

        {/* Unmarked / Vintage Gold */}
        <section className="bg-[#f3f3f3] py-20">
          <div className="ultrawide-page max-w-[1440px] mx-auto px-4 md:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold mb-6">
                  {isEs ? 'Oro Sin Marcar o Vintage' : 'Unmarked or Vintage Gold'}
                </h2>
                <p className="text-base text-[#4d4635] mb-8 leading-relaxed">
                  {isEs
                    ? 'No todo el oro tiene una marca legible, especialmente las piezas antiguas o hechas a medida. Verificamos la composición con pruebas ácidas y electrónicas en el sitio, y organizamos análisis XRF no destructivo a través de socios de laboratorio cuando es necesario.'
                    : 'Not all gold bears a legible hallmark, especially antique or custom-made pieces. We verify composition with onsite acid and electronic testing at your appointment, and arrange offsite, non-destructive XRF analysis through trusted lab partners when needed.'}
                </p>
                <div className="space-y-8">
                  <div className="flex gap-6">
                    <ClayMark name="xrf" size={64} className="flex-shrink-0 block" />
                    <div>
                      <h4 className="font-[family-name:var(--font-headline)] text-lg font-bold mb-2">
                        {isEs ? 'Espectrometría XRF' : 'XRF Spectrometry'}
                      </h4>
                      <p className="text-sm text-[#4d4635] leading-relaxed">
                        {isEs
                          ? 'La fluorescencia de rayos X (XRF) ofrece un desglose químico preciso de las aleaciones sin eliminar metal de su artículo.'
                          : 'Offsite X-Ray Fluorescence (XRF) provides a precise chemical breakdown of alloys without removing any metal from your item.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <ClayMark name="flask" size={64} className="flex-shrink-0 block" />
                    <div>
                      <h4 className="font-[family-name:var(--font-headline)] text-lg font-bold mb-2">
                        {isEs ? 'Prueba Ácida y Electrónica' : 'Acid & Electronic Testing'}
                      </h4>
                      <p className="text-sm text-[#4d4635] leading-relaxed">
                        {isEs
                          ? 'En el sitio de su cita usamos pruebas ácidas y verificación electrónica para confirmar los niveles de pureza.'
                          : 'Onsite at your appointment, we use professional touchstone acid testing and electronic verification to confirm purity levels.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl bg-[#e8e8e8] shadow-[0_18px_54px_rgba(38,28,6,0.08)]">
                  <div className="text-center px-8">
                    {/* Owner, 2026-09-05: the card is a 4:5 canvas, so a 144px mark
                        with a 14px caption left it mostly blank. Mark up to 220px
                        (responsive via --clay-size below) and the caption in the
                        headline face at title size. */}
                    <ClayMark name="purity-test" size={220} className="mx-auto mb-6 block" />
                    <p
                      className="text-2xl font-bold leading-tight md:text-3xl"
                      style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                    >
                      {isEs ? 'Pruebas de laboratorio en el sitio' : 'On-site & lab testing'}
                    </p>
                  </div>
                </div>
                <div className="absolute -bottom-8 -left-8 hidden rounded-2xl bg-[#2f3131] p-10 shadow-[0_18px_54px_rgba(0,0,0,0.22)] md:block">
                  <p className="text-[#e9c349] font-[family-name:var(--font-headline)] text-xl font-bold">
                    {isEs ? 'Precios del Mercado' : 'Live-Market Pricing'}
                  </p>
                  <p className="text-white text-[10px] tracking-widest mt-2 uppercase">
                    {isEs ? 'PROBADO ANTE USTED' : 'TESTED IN FRONT OF YOU'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ — same block the diamond page carries (FaqSection). */}
        <FaqSection
          isEs={isEs}
          heading={isEs ? 'Preguntas Sobre Vender Oro' : 'Selling Gold FAQ'}
          faqs={GOLD_FAQS}
          footer={
            isEs ? (
              <>¿Vende más que oro? También compramos <Link href="/es/silver-services" className="font-semibold text-[#735c00] underline underline-offset-2">plata esterlina</Link> y <Link href="/es/estate-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">joyería de patrimonio</Link>.</>
            ) : (
              <>Selling more than gold? We also buy <Link href="/silver-services" className="font-semibold text-[#735c00] underline underline-offset-2">sterling silver</Link> and <Link href="/estate-jewelry" className="font-semibold text-[#735c00] underline underline-offset-2">estate jewelry</Link>.</>
            )
          }
        />

        {/* Trust CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="max-w-2xl mx-auto px-4">
            {/* onDark: #2f3131 band — a black float shadow is invisible here. */}
            <ClayMark name="shield" size={96} onDark className="mx-auto mb-6 block" />
            <h2 className="text-white font-[family-name:var(--font-headline)] text-3xl md:text-4xl font-bold mb-6">
              {isEs ? 'Confidencialidad y Servicio Experto' : 'Confidentiality & Expert Service'}
            </h2>
            <p className="text-[#d7d0c3] text-base mb-10 leading-relaxed max-w-lg mx-auto">
              {isEs
                ? 'Visite nuestro salón de Naples durante el horario de atención o programe una visita privada a domicilio. Probamos y pesamos su oro, explicamos la oferta y pagamos al aceptarla.'
                : 'Visit our Naples showroom during open hours or arrange a private home visit. We test and weigh your gold, explain the offer, and pay when you accept.'}
            </p>
            <div className="flex flex-col md:flex-row justify-center gap-6">
              <Link
                href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                className="gold-button"
              >
                {isEs ? 'TASACIÓN GRATUITA' : 'FREE APPRAISAL'}
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
