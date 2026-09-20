import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Image from 'next/image';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import TradingViewMini from '@/components/trading/TradingViewMini';
import TradingViewTicker from '@/components/trading/TradingViewTicker';
import { AppIcon } from '@/components/AppIcon';
import ClayMark from '@/components/ClayMark';
import { phoneHoursLabel } from '@/lib/business-location';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Vender Lingotes y Monedas de Oro y Plata'
      : 'Sell Bullion, Gold & Silver Coins',
    description: isEs
      ? 'Venda lingotes y monedas de oro y plata, plata esterlina, platino, paladio y metales preciosos en Naples, FL. Ofertas justas según el mercado en vivo, pruebas claras, citas privadas y pago el mismo día en todo el suroeste de Florida.'
      : 'Sell gold and silver bullion, coins, sterling, platinum, palladium, and scrap precious metals in Naples FL. Fair live-market offers, clear testing, private appointments, and same-day payment throughout Southwest Florida.',
    path: '/bullion',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

const CHARTS = [
  { symbol: 'OANDA:XAUUSD', labelEn: 'Gold', labelEs: 'Oro' },
  { symbol: 'OANDA:XAGUSD', labelEn: 'Silver', labelEs: 'Plata' },
  { symbol: 'OANDA:XPTUSD', labelEn: 'Platinum', labelEs: 'Platino' },
  { symbol: 'OANDA:XPDUSD', labelEn: 'Palladium', labelEs: 'Paladio' },
];

const PROCESS_STEPS = [
  {
    mark: 'gold-seal',
    titleEn: '1. Identify & Sort',
    titleEs: '1. Identificar y Clasificar',
    descEn: 'We separate bullion, coins, sterling, scrap gold, platinum, and palladium, then note maker marks, denominations, and purity stamps.',
    descEs: 'Separamos lingotes, monedas, plata esterlina, chatarra de oro, platino y paladio, luego anotamos marcas del fabricante, denominaciones y sellos de pureza.',
  },
  {
    mark: 'scale',
    titleEn: '2. Test, Weigh & Calculate',
    titleEs: '2. Probar, Pesar y Calcular',
    descEn: 'Each item is weighed and checked for purity. The offer is based on verified precious-metal content and the current live market.',
    descEs: 'Cada artículo se pesa y verifica su pureza. La oferta se basa en el contenido de metal precioso verificado y el mercado actual en vivo.',
  },
  {
    mark: 'cash',
    titleEn: '3. Clear Offer & Payment',
    titleEs: '3. Oferta Clara y Pago',
    descEn: 'We walk through the math before you decide. If the offer works for you, payment is made the same day by cash, check, or wire.',
    descEs: 'Revisamos los cálculos antes de que decida. Si la oferta le funciona, el pago se realiza el mismo día en efectivo, cheque o transferencia.',
  },
] as const;

export default async function BullionPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Vender Lingotes y Monedas' : 'Sell Bullion & Coins', path: '/bullion' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Hero */}
        <section className="relative overflow-hidden pt-16 pb-16 md:pt-20 md:pb-24 border-b border-white/5">
          <div className="absolute inset-0 z-0">
            <Image
              src="/assets/images/pages/bullion.webp"
              alt="Precious metal bullion"
              fill
              sizes="100vw"
              className="object-cover bullion-pan"
              style={{ objectPosition: 'center 52%' }}
              priority
            />
          </div>
          <div className="absolute inset-0 z-0 bg-[#1a1c1c]/60" />
          <div className="max-w-5xl mx-auto px-6 md:px-8 text-center relative z-10">
            <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="dark" align="center" />
            <span className="text-[#e9c349] text-xs font-bold uppercase tracking-[0.4em]">
              {isEs ? 'Servicios de Metales Preciosos' : 'Precious Metals Estate Services'}
            </span>
            <h1 className="text-4xl md:text-5xl text-white font-[family-name:var(--font-headline)] font-bold mt-4 mb-6 tracking-tight">
              {isEs ? 'Venda Lingotes, Monedas y Metales Preciosos' : 'Sell Bullion, Coins & Precious Metals'}
            </h1>
            <p className="text-lg md:text-xl text-[#d7d0c3] italic max-w-3xl mx-auto leading-relaxed">
              {isEs
                ? 'Servicios privados de metales preciosos para lingotes de oro y plata, monedas, plata esterlina, platino, paladio y metales de chatarra, con pruebas claras, matemáticas de mercado en vivo y pago el mismo día.'
                : 'Private precious-metals estate services for gold and silver bullion, coins, sterling silver, platinum, palladium, and scrap metals, with clear testing, live-market math, and same-day payment. We explain the numbers before you decide.'}
            </p>
            {/* The pair every other seller lander's hero carries (DECISIONS →
                "Hero buttons on the buy-side landers include the phone"). This
                hero had nothing to tap until 2026-09-20 (owner-approved mockup). */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href={isEs ? '/es/free-evaluation' : '/free-evaluation'} className="gold-button">
                {isEs ? 'TASACIÓN GRATUITA' : 'FREE APPRAISAL'}
              </Link>
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
        </section>

        {/* Live Ticker */}
        <section
          id="live-prices"
          className="scroll-mt-28 py-3 bg-[#1a1c1c] border-y border-[#735c00]/35"
          aria-label={isEs ? 'Precios en vivo de metales preciosos' : 'Live gold, silver, platinum, and palladium prices'}
        >
          <TradingViewTicker />
        </section>

        {/* 4-up Charts */}
        <section id="live-charts" className="py-12 md:py-20 bg-[#f3f3f3]">
          <div className="ultrawide-page max-w-6xl mx-auto px-6 md:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-headline)] font-bold mb-3 tracking-tight">
                {isEs ? 'Precios en Vivo que Referenciamos' : 'Live Prices We Reference'}
              </h2>
              <p className="text-[#4d4635] max-w-2xl mx-auto text-sm leading-relaxed">
                {isEs
                  ? 'Precio spot actual para cada metal junto con su gráfico de 12 meses. Estos precios públicos le ayudan a ver el mercado que referenciamos al hacer una oferta.'
                  : 'Current spot price for each metal alongside its 12-month chart. These public prices help you see the market we reference when making an offer.'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {CHARTS.map(({ symbol, labelEn, labelEs }) => (
                <div
                  key={symbol}
                  className="overflow-hidden rounded-2xl border border-[#735c00]/30 bg-[#1a1c1c] shadow-[0_18px_54px_rgba(0,0,0,0.14)]"
                >
                  <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <h3 className="font-[family-name:var(--font-headline)] font-bold text-lg text-[#e9c349]">
                      {isEs ? labelEs : labelEn}
                    </h3>
                    <span className="text-xs text-[#d7d0c3] uppercase tracking-wider">Spot</span>
                  </div>
                  <div className="px-2 pb-2">
                    <TradingViewMini symbol={symbol} height={200} transparent={false} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-[#4d4635] text-xs italic mt-8 max-w-3xl mx-auto">
              {isEs
                ? 'Gráficos cortesía de TradingView. Los precios spot son un punto de referencia, no una promesa de pago. Las ofertas finales se basan en el spot en vivo, el peso verificado, la pureza, la forma y el margen acordado.'
                : 'Charts powered by TradingView. Spot prices are a reference point, not a promise of payout. Final offers are based on live spot, verified weight and purity, form, and agreed margin.'}
            </p>
            <p className="mt-4 text-center text-sm">
              <Link href={isEs ? '/es/spot-prices' : '/spot-prices'} className="font-semibold text-[#735c00] underline underline-offset-2">
                {isEs ? 'Vea cada gráfico a tamaño completo, con rangos de un día a cinco años →' : 'See each chart full size, with ranges from one day to five years →'}
              </Link>
            </p>
          </div>
        </section>

        {/* Evaluation Process */}
        <section className="py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-6 md:px-8">
            <div className="text-center mb-12">
              <span className="text-[#735c00] text-xs font-bold uppercase tracking-[0.4em]">
                {isEs ? 'Cómo Funciona la Venta' : 'How Selling Works'}
              </span>
              <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-headline)] font-bold mt-4 mb-4 tracking-tight">
                {isEs ? 'Un Proceso de Evaluación Claro y Justo' : 'A Clear, Fair Bullion Evaluation Process'}
              </h2>
              <p className="text-[#4d4635] leading-relaxed text-sm max-w-2xl mx-auto">
                {isEs
                  ? 'Traiga o fotografíe lo que tiene. Lo probamos y pesamos frente a usted, explicamos el cálculo del precio spot y le damos una oferta directa sin presión.'
                  : 'Bring or photograph what you have. We test and weigh it in front of you, explain the spot-price calculation, and give you a straightforward no-pressure offer.'}
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {PROCESS_STEPS.map(({ mark, titleEn, titleEs, descEn, descEs }) => (
                <div key={mark} className="rounded-2xl border border-[#d0c5af]/60 bg-white p-6 shadow-[0_14px_38px_rgba(38,28,6,0.06)]">
                  <ClayMark name={mark} size={88} className="block mb-3" />
                  <h3 className="font-[family-name:var(--font-headline)] font-bold text-lg mb-2">
                    {isEs ? titleEs : titleEn}
                  </h3>
                  <p className="text-[#4d4635] text-sm leading-relaxed">{isEs ? descEs : descEn}</p>
                </div>
              ))}
            </div>
            <div className="mt-12 rounded-2xl border border-[#735c00]/20 bg-[#735c00]/5 p-6 shadow-[0_14px_38px_rgba(38,28,6,0.05)] md:p-8">
              <p className="text-center text-[#4d4635] text-sm md:text-base leading-relaxed italic">
                <span className="text-[#735c00] font-[family-name:var(--font-headline)] not-italic font-bold">
                  {isEs ? 'Consejo:' : 'Tip:'}
                </span>{' '}
                {/* "sterling silver" links to the page that owns that query
                    (2026-09-01). /bullion was already drawing silver-flatware
                    impressions in Search Console with no path onward — this
                    was the only sibling sell page with no link to any other. */}
                {isEs ? 'Si tiene monedas, barras, ' : 'Have coins, bars, '}
                <Link
                  href={isEs ? '/es/silver-services' : '/silver-services'}
                  className="text-[#735c00] underline underline-offset-2 not-italic"
                >
                  {isEs ? 'plata esterlina' : 'sterling silver'}
                </Link>
                {isEs
                  ? ' o chatarra mezclada, eso es normal. '
                  : ", or scrap mixed together? That's normal. "}
                <Link
                  href={isEs ? '/es/contact' : '/contact'}
                  className="text-[#735c00] underline underline-offset-2 not-italic"
                >
                  {isEs ? 'Envíe fotos primero' : 'Send photos first'}
                </Link>{' '}
                {isEs
                  ? 'si quiere una idea rápida de lo que vale la pena traer.'
                  : "if you want a quick sense of what's worth bringing in."}
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28 bg-[#f3f3f3]">
          <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
            <h2 className="text-4xl md:text-5xl font-[family-name:var(--font-headline)] font-bold mb-6 tracking-tight">
              {isEs ? '¿Listo para Vender Lingotes o Metales Preciosos?' : 'Ready to Sell Bullion or Precious Metals?'}
            </h2>
            <p className="text-[#4d4635] text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
              {isEs
                ? 'Envíe fotos de sus monedas, barras, plata esterlina, chatarra de oro, platino o paladio. Le daremos una primera lectura práctica y, cuando sea necesario, programaremos una evaluación privada.'
                : 'Text photos of your coins, bars, sterling, scrap gold, platinum, or palladium. We will give you a practical first read and, when needed, schedule a private evaluation against the current market.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
              <Link
                href={isEs ? '/es/contact' : '/contact'}
                className="gold-button"
              >
                {isEs ? 'ENVIAR FOTOS AHORA' : 'Send Photos Now'}
              </Link>
              <a
                href="tel:2394048505"
                className="outline-button"
              >
                {isEs ? 'Llamar (239) 404-8505' : 'Call (239) 404-8505'}
              </a>
            </div>
            <div className="mt-8">
              <a
                href="https://share.google/yQQMAvFDiOLppBZ30"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[#735c00] hover:text-[#1a1c1c] transition-colors text-xs uppercase tracking-widest border-b border-[#735c00]/30 hover:border-[#735c00] pb-1"
              >
                <AppIcon name="star" className="text-base" fill="currentColor" />
                {isEs ? 'Leer reseñas en Google' : 'Read what clients say on Google'}
                <AppIcon name="arrow_outward" className="text-base" />
              </a>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
