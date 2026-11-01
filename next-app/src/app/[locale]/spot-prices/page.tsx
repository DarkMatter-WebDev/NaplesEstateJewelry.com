import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import { phoneHoursLabel } from '@/lib/business-location';
import { fetchMetalSpotPrices, GRAMS_PER_TROY_OZ, GRAMS_PER_PENNYWEIGHT } from '@/lib/spot-price';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import TradingViewTicker from '@/components/trading/TradingViewTicker';
import TradingViewSymbolOverview from '@/components/trading/TradingViewSymbolOverview';

interface Props {
  params: Promise<{ locale: string }>;
}

// /spot-prices — the dedicated live-prices page (owner idea 2026-09-06,
// mockup approved). A destination for social posts and the About menu:
// today's spot for all four metals as server-rendered TEXT (so the page is
// not empty to a crawler — the TradingView charts draw client-side and index
// as nothing), each chart full size with range tabs, and the per-gram metal
// value by karat, which is the one part with real search demand ("14k gold
// price per gram today").
//
// ⚠️ Framing rules carried over from the gold-worth guide and the bullion
// page: every figure here is METAL VALUE at spot, labelled "not an offer";
// no buyer margin percentage is stated anywhere; gold-filled / plated / HGE
// are not priced as gold; dental gold is sent out for testing before
// purchase. Karat fractions are the same ones the guide and /gold-services
// use so the pages can never disagree.
//
// ⚠️ Performance: the TradingView embeds are heavy and PSI mobile is bimodal
// (see memory). This page is linked FROM the sell pages, the About menu and
// the footer; nothing here is added to the homepage or the Sell flow.
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Precios del Oro y la Plata en Vivo' : 'Live Gold & Silver Prices Today',
    description: isEs
      ? 'Precio spot en vivo del oro, la plata, el platino y el paladio con gráficos a tamaño completo, y el valor del metal por gramo según el quilataje — los números que referenciamos al comprar en Naples, FL.'
      : 'Live spot prices for gold, silver, platinum and palladium with full-size charts, plus metal value per gram by karat — the numbers we reference when buying in Naples, FL.',
    path: '/spot-prices',
    locale,
  });
}

const METALS = [
  { key: 'gold', symbol: 'OANDA:XAUUSD', en: 'Gold', es: 'Oro' },
  { key: 'silver', symbol: 'OANDA:XAGUSD', en: 'Silver', es: 'Plata' },
  { key: 'platinum', symbol: 'OANDA:XPTUSD', en: 'Platinum', es: 'Platino' },
  { key: 'palladium', symbol: 'OANDA:XPDUSD', en: 'Palladium', es: 'Paladio' },
] as const;

// Same fractions as /gold-services/what-is-my-gold-worth and the /gold-services
// karat cards (guarded by lib/__tests__/spot-prices-page.test.ts).
const GOLD_KARATS = [
  { mark: '10k · 417', fine: 0.417 },
  { mark: '14k · 585', fine: 0.583 },
  { mark: '18k · 750', fine: 0.75 },
  { mark: '22k · 916', fine: 0.917 },
  { mark: '24k · 999', fine: 0.999 },
];
const SILVER_STANDARDS = [
  { en: 'Sterling · 925', es: 'Esterlina · 925', fine: 0.925 },
  { en: 'Coin silver · 900', es: 'Plata de moneda · 900', fine: 0.9 },
  { en: 'Fine silver · 999', es: 'Plata fina · 999', fine: 0.999 },
];

const usd = (n: number, digits = 2) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function formatUpdated(iso: string | null, isEs: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(isEs ? 'es-US' : 'en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export default async function SpotPricesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);
  const spot = await fetchMetalSpotPrices();
  const live = spot.source === 'api';
  const updated = live ? formatUpdated(spot.updatedAt, isEs) : null;
  const goldPerGram = spot.gold != null ? spot.gold / GRAMS_PER_TROY_OZ : null;
  const silverPerGram = spot.silver != null ? spot.silver / GRAMS_PER_TROY_OZ : null;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Precios de Metales en Vivo' : 'Live Metal Prices', item: `https://naplesestatejewelry.com${isEs ? '/es' : ''}/spot-prices` },
    ],
  };

  const sellLinks = [
    { href: p('/gold-services'), tEn: 'Sell Gold in Naples', tEs: 'Vender Oro en Naples', sEn: 'Jewelry, coins, dental, scrap — tested in front of you.', sEs: 'Joyería, monedas, oro dental, chatarra — probado frente a usted.' },
    { href: p('/silver-services'), tEn: 'Sell Sterling Silver', tEs: 'Vender Plata Esterlina', sEn: 'Flatware, tea services, holloware, bullion.', sEs: 'Cubertería, juegos de té, vajilla, lingotes.' },
    { href: p('/bullion'), tEn: 'Bullion & Coins', tEs: 'Lingotes y Monedas', sEn: 'Bars and rounds, Eagles, Maples, Krugerrands.', sEs: 'Barras y rounds, Eagles, Maples, Krugerrands.' },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero — the four spot figures as text. */}
        <section className="bg-[#1a1c1c] pb-10 pt-14 text-center md:pt-20">
          <div className="ultrawide-page mx-auto max-w-5xl px-4 md:px-8">
            <BreadcrumbTrailFromLd ld={breadcrumbLd} align="center" />
            <span className="mb-3 block text-xs font-bold uppercase tracking-[0.3em] text-[#e9c349]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Referencia del Mercado en Vivo · Naples, FL' : 'Live Market Reference · Naples, FL'}
            </span>
            <h1 className="mx-auto mb-4 max-w-3xl text-4xl font-bold leading-tight text-white md:text-5xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Precios del Oro, la Plata, el Platino y el Paladio en Vivo' : 'Live Gold, Silver, Platinum & Palladium Prices'}
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-[#d7d0c3] md:text-lg">
              {isEs
                ? 'Los mismos precios spot que referenciamos en el mostrador, actualizados durante el día. El spot es la base del mercado — una oferta se construye a partir de él después de verificar peso y pureza frente a usted.'
                : 'The same spot prices we reference at the counter, updated through the day. Spot is the market baseline — an offer is built from it after weight and purity are verified in front of you.'}
            </p>

            <dl className="mx-auto mb-3 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {METALS.map((m) => {
                const value = spot[m.key];
                return (
                  <div key={m.key} className="rounded-2xl border border-[#735c00]/45 bg-[#242626] px-4 py-4 text-left">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#d7d0c3]" style={{ fontFamily: 'var(--font-label)' }}>
                      {isEs ? m.es : m.en}
                    </dt>
                    <dd className="mt-1 text-2xl text-[#e9c349] md:text-3xl" style={{ fontFamily: 'var(--font-headline)' }}>
                      {live && value != null ? usd(value) : '—'}
                    </dd>
                    <dd className="text-[11px] text-[#9a917c]">{isEs ? 'por onza troy · USD' : 'per troy oz · USD'}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mb-8 text-xs text-[#9a917c]">
              {live
                ? (isEs
                    ? <>{updated ? `Actualizado ${updated} · ` : ''}se actualiza cada 5 minutos · fuente: gold-api.com</>
                    : <>{updated ? `Updated ${updated} · ` : ''}refreshes every 5 minutes · source: gold-api.com</>)
                : (isEs
                    ? 'El feed de precios no está disponible en este momento — los gráficos de abajo siguen en vivo desde TradingView.'
                    : 'The price feed is temporarily unavailable — the charts below are still live from TradingView.')}
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <Link href={p('/gold-services')} className="gold-button">{isEs ? 'VENDER ORO' : 'SELL GOLD'}</Link>
              <Link href={p('/silver-services')} className="gold-button">{isEs ? 'VENDER PLATA' : 'SELL SILVER'}</Link>
              <Link
                href={p('/bullion')}
                className="outline-button"
                style={{ borderColor: 'rgba(255,255,255,0.48)', color: 'white', background: 'rgba(255,255,255,0.08)' }}
              >
                {isEs ? 'VENDER LINGOTES Y MONEDAS' : 'SELL BULLION & COINS'}
              </Link>
            </div>
            {/* One sentence, not a fourth button (2026-09-08, mockup approved):
                the page's readers are checking a price; this turns that into
                a call while keeping the page's rules — spot is the reference,
                the number for THEIR pieces comes after verification, no margin
                is stated. The phone hours ride along (Option C). */}
            <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-[#d7d0c3]">
              {isEs ? '¿Tiene oro o plata para vender? ' : 'Have gold or silver to sell? '}
              <a href="tel:2394048505" className="hover-link hover-link-on-dark whitespace-nowrap font-bold text-[#e9c349]">
                {isEs ? 'Llame al (239) 404-8505' : 'Call (239) 404-8505'}
              </a>
              {isEs
                ? ' y le llevamos del spot de hoy a un número real por sus piezas. '
                : ' and we’ll walk you from today’s spot to a real number for your pieces. '}
              <span className="text-sm text-[#9a917c]">{phoneHoursLabel(isEs)}.</span>
            </p>
          </div>
        </section>

        {/* Ticker — same strip as /bullion. */}
        <section
          className="border-y border-[#735c00]/35 bg-[#141515] py-3"
          aria-label={isEs ? 'Precios en vivo de metales preciosos' : 'Live gold, silver, platinum, and palladium prices'}
        >
          <TradingViewTicker />
        </section>

        {/* Charts — one full-size chart per metal. */}
        <section className="border-b border-[#d0c5af] bg-[#f3f3f3] py-16 md:py-20">
          <div className="ultrawide-page mx-auto max-w-6xl px-4 md:px-8">
            <span className="block text-xs font-bold uppercase tracking-[0.3em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Gráficos' : 'Charts'}
            </span>
            <h2 className="mt-3 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Cada Metal, a Tamaño Completo' : 'Each Metal, Full Size'}
            </h2>
            <p className="mb-8 mt-3 max-w-2xl text-[15px] leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Toque un rango en cualquier gráfico — de un día a cinco años. Los precios son por onza troy en dólares.'
                : 'Tap a range on any chart — one day to five years. Prices are per troy ounce in U.S. dollars.'}
            </p>
            <div className="flex flex-col gap-6">
              {METALS.map((m) => (
                <div key={m.key} className="overflow-hidden rounded-2xl border border-[#735c00]/35 bg-[#1a1c1c] shadow-[0_18px_54px_rgba(0,0,0,0.14)]">
                  <div className="flex items-baseline justify-between px-5 pb-1 pt-4 md:px-6">
                    <h3 className="text-xl font-bold text-[#e9c349]" style={{ fontFamily: 'var(--font-headline)' }}>
                      {isEs ? m.es : m.en}
                    </h3>
                    <span className="text-[11px] uppercase tracking-[0.12em] text-[#9a917c]">
                      {m.symbol.replace('OANDA:', 'OANDA · ')} · USD / oz
                    </span>
                  </div>
                  <div className="px-2 pb-2">
                    <TradingViewSymbolOverview symbol={m.symbol} label={isEs ? m.es : m.en} height={380} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-xs italic leading-relaxed text-[#4d4635]">
              {isEs
                ? 'Gráficos cortesía de TradingView. Los precios spot son un punto de referencia, no una promesa de pago. Las ofertas finales se basan en el spot en vivo, el peso verificado, la pureza, la forma y el margen acordado.'
                : 'Charts powered by TradingView. Spot prices are a reference point, not a promise of payout. Final offers are based on live spot, verified weight and purity, form, and agreed margin.'}
            </p>
          </div>
        </section>

        {/* Per-gram metal value — text content with real search demand. */}
        <section className="py-16 md:py-20">
          <div className="ultrawide-page mx-auto max-w-6xl px-4 md:px-8">
            <span className="block text-xs font-bold uppercase tracking-[0.3em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Qué significa el spot por gramo' : 'What Spot Means Per Gram'}
            </span>
            <h2 className="mt-3 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Valor del Metal al Spot de Hoy' : "Metal Value at Today's Spot"}
              <span className="ml-3 inline-block rounded border border-[#993c1d] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.14em] text-[#993c1d]" style={{ fontFamily: 'var(--font-label)' }}>
                {isEs ? 'no es una oferta' : 'not an offer'}
              </span>
            </h2>
            <p className="mb-8 mt-3 max-w-2xl text-[15px] leading-relaxed text-[#4d4635]">
              {isEs
                ? 'La joyería se pesa en gramos, pero el spot se cotiza por onza troy (31.1 g). Estos son los valores del metal puro dentro de cada quilataje o estándar a los precios de arriba — el piso sobre el que se construye una oferta honesta. Cambian con el mercado y se recalculan cada cinco minutos.'
                : 'Jewelry is weighed in grams, but spot is quoted per troy ounce (31.1 g). These are the pure-metal values inside each karat or standard at the prices above — the floor an honest offer is built on. They change with the market and are recalculated every five minutes.'}
            </p>

            {live && goldPerGram != null && silverPerGram != null ? (
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <div className="overflow-x-auto rounded-2xl border border-[#d0c5af] bg-white shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-[#fbf9f3] text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                        <th className="px-4 py-3">{isEs ? 'Oro' : 'Gold'}</th>
                        <th className="px-4 py-3">{isEs ? 'Ley' : 'Fineness'}</th>
                        <th className="px-4 py-3 text-right">{isEs ? 'Por gramo' : 'Per gram'}</th>
                        <th className="px-4 py-3 text-right">{isEs ? 'Por pennyweight (dwt)' : 'Per pennyweight (dwt)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GOLD_KARATS.map((k) => (
                        <tr key={k.mark} className="border-t border-[#ece7db]">
                          <td className="px-4 py-3 font-bold text-[#1a1c1c]">{k.mark}</td>
                          <td className="px-4 py-3 text-[#4d4635]">{(k.fine * 100).toFixed(1)}% {isEs ? 'oro' : 'gold'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#1a1c1c]">{usd(goldPerGram * k.fine)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#1a1c1c]">{usd(goldPerGram * k.fine * GRAMS_PER_PENNYWEIGHT)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-[#d0c5af] bg-white shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-[#fbf9f3] text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                        <th className="px-4 py-3">{isEs ? 'Plata' : 'Silver'}</th>
                        <th className="px-4 py-3">{isEs ? 'Ley' : 'Fineness'}</th>
                        <th className="px-4 py-3 text-right">{isEs ? 'Por gramo' : 'Per gram'}</th>
                        <th className="px-4 py-3 text-right">{isEs ? 'Por onza troy' : 'Per troy oz'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SILVER_STANDARDS.map((s) => (
                        <tr key={s.en} className="border-t border-[#ece7db]">
                          <td className="px-4 py-3 font-bold text-[#1a1c1c]">{isEs ? s.es : s.en}</td>
                          <td className="px-4 py-3 text-[#4d4635]">{(s.fine * 100).toFixed(1)}% {isEs ? 'plata' : 'silver'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#1a1c1c]">{usd(silverPerGram * s.fine)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#1a1c1c]">{usd(spot.silver! * s.fine)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-[#d0c5af] bg-white px-5 py-4 text-sm text-[#4d4635]">
                {isEs
                  ? 'La tabla por gramo vuelve en cuanto el feed de precios esté disponible.'
                  : 'The per-gram table returns as soon as the price feed is available again.'}
              </p>
            )}

            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[#4d4635]">
              {isEs ? (
                <>Las piezas gold-filled, chapadas y &quot;HGE&quot; no se valoran como oro — el quilataje en ellas describe un recubrimiento. El oro dental se envía a analizar antes de la compra. Vea <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale su oro</Link> y <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">cuánto vale la cubertería de plata</Link> para la matemática completa con ejemplos.</>
              ) : (
                <>Gold-filled, plated and &quot;HGE&quot; pieces are not priced as gold — the karat on them describes a coating. Dental gold is sent out for testing before purchase. See <Link href={p('/gold-services/what-is-my-gold-worth')} className="font-semibold text-[#735c00] underline underline-offset-2">what your gold is worth</Link> and <Link href={p('/silver-services/flatware-value')} className="font-semibold text-[#735c00] underline underline-offset-2">what sterling flatware is worth</Link> for the full math with worked examples.</>
              )}
            </p>
          </div>
        </section>

        {/* From spot to an offer */}
        <section className="border-y border-[#d0c5af] bg-[#f3f3f3] py-16 md:py-20">
          <div className="ultrawide-page mx-auto max-w-6xl px-4 md:px-8">
            <span className="block text-xs font-bold uppercase tracking-[0.3em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Del spot a una oferta' : 'From Spot to an Offer'}
            </span>
            <h2 className="mb-8 mt-3 text-3xl font-bold text-[#1a1c1c] md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Cómo Usamos Estos Números' : 'How We Use These Numbers'}
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { tEn: '1. Weigh', tEs: '1. Pesar', en: 'Calibrated scales, in grams and troy ounces, on the counter where you can see them. Stones and non-metal parts are separated out first.', es: 'Básculas calibradas, en gramos y onzas troy, sobre el mostrador donde puede verlas. Las piedras y las partes que no son metal se separan primero.' },
                { tEn: '2. Test', tEs: '2. Probar', en: 'Marks are read, then confirmed — acid test or XRF for purity, a magnet for plated cores. A stamp is a claim; the metal is the proof.', es: 'Se leen los sellos y luego se confirman — prueba ácida o XRF para la pureza, un imán para núcleos chapados. Un sello es una afirmación; el metal es la prueba.' },
                { tEn: '3. Price', tEs: '3. Valorar', en: "Live spot × verified weight × purity gives the metal value; sets, coins and signed pieces are also checked against the collector market, and you're paid whichever is higher.", es: 'Spot en vivo × peso verificado × pureza da el valor del metal; los juegos, monedas y piezas firmadas también se cotejan con el mercado de coleccionistas, y se le paga el que resulte mayor.' },
              ].map((s) => (
                <div key={s.tEn} className="rounded-2xl border border-[#d0c5af] bg-white p-6 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
                  <b className="mb-2 block text-lg text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? s.tEs : s.tEn}</b>
                  <p className="text-sm leading-relaxed text-[#4d4635]">{isEs ? s.es : s.en}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sell links */}
        <section className="py-16 text-center">
          <div className="ultrawide-page mx-auto max-w-4xl px-4 md:px-8">
            <span className="block text-xs font-bold uppercase tracking-[0.3em] text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
              {isEs ? 'Venda con confianza' : 'Sell With Confidence'}
            </span>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {sellLinks.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-2xl border border-[#d0c5af] bg-white p-5 text-left shadow-[0_10px_28px_rgba(38,28,6,0.04)] transition-transform duration-200 hover:-translate-y-0.5">
                  <b className="block text-base text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{isEs ? l.tEs : l.tEn}</b>
                  <span className="mt-1 block text-sm leading-relaxed text-[#4d4635]">{isEs ? l.sEs : l.sEn}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#2f3131] py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Listo para una Evaluación Profesional?' : 'Ready for a Professional Evaluation?'}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Traiga las piezas — pesadas, probadas y valoradas contra estos precios, frente a usted, en nuestro salón de Naples o en su casa.'
                : 'Bring the pieces — weighed, tested and priced against these prices, in front of you, at our Naples showroom or in your home.'}
            </p>
            <div className="flex flex-col justify-center gap-6 md:flex-row">
              <Link href={p('/free-evaluation')} className="gold-button">
                {isEs ? 'PROGRAMAR UNA CITA' : 'SCHEDULE A TIME'}
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
