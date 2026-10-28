import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import type { Crumb } from '@/lib/breadcrumb-ld';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import { PageContainer } from '@/components/layout/ResponsiveLayout';
import ClayMark, { type ClayMarkName } from '@/components/ClayMark';

/**
 * `/guides` — one page that lists every guide the site already has (owner,
 * 2026-10-27; mockup 1 approved: label "Guides", inherited jewelry first, the
 * dark appraisal band kept).
 *
 * Rules:
 *
 * - This is an INDEX, not a copy. Each card carries the guide's own title, one
 *   line that says only what that guide already says, and a link. ⛔ Never
 *   paste a guide's opening paragraph here — that is how a hub turns into
 *   duplicate content, and the guides must keep ranking on their own URLs.
 * - The guides stay nested under their parent service pages
 *   (`DECISIONS.md` → "Guide pages live UNDER their parent"); this page only
 *   points at them. ⛔ Never move a guide to `/guides/<slug>`.
 * - A destination, not a ranking page: sitemap 0.5 like `/reviews` and
 *   `/spot-prices`, linked from the About menu and the footer's Company
 *   column. No phone contact bar (it is for the seller landers; every guide
 *   it links to shows the bar itself).
 * - Adding a guide = one entry in GUIDES below (+ `sitemap.ts` for the guide).
 *
 * Guarded by `lib/__tests__/guides-page.test.ts`.
 */

interface Props {
  params: Promise<{ locale: string }>;
}

interface GuideEntry {
  path: string;
  mark: ClayMarkName;
  sectionEn: string;
  sectionEs: string;
  /** The guide page's own <title>, so the card and the page it opens agree. */
  titleEn: string;
  titleEs: string;
  lineEn: string;
  lineEs: string;
}

// Order (owner, 2026-10-27): inherited jewelry first — the broadest one — then
// gold, sterling silver, hallmarks, diamonds (added the same evening), Native
// American. The two marks guides have no clay mark of their own; the acid-test
// bottle and the magnet stand in; the gemstone is the diamond guide's.
const GUIDES: GuideEntry[] = [
  {
    path: '/estate-services/selling-inherited-jewelry',
    mark: 'heirloom',
    sectionEn: 'Estates',
    sectionEs: 'Patrimonios',
    titleEn: 'Selling Inherited Jewelry: A Guide',
    titleEs: 'Vender Joyas Heredadas: Guía',
    lineEn: 'What to sort first, what not to clean, and how an estate buyer prices each piece.',
    lineEs: 'Qué ordenar primero, qué no limpiar y cómo un comprador de patrimonio valora cada pieza.',
  },
  {
    path: '/gold-services/what-is-my-gold-worth',
    mark: 'gold-seal',
    sectionEn: 'Gold',
    sectionEs: 'Oro',
    titleEn: 'What Is My Gold Worth?',
    titleEs: '¿Cuánto Vale Mi Oro?',
    lineEn: 'Karat percentages, the weight × purity × spot math, and where a fair offer sits above melt.',
    lineEs: 'Los porcentajes de cada quilate, la cuenta peso × pureza × spot y dónde queda una oferta justa por encima de la fundición.',
  },
  {
    path: '/gold-services/gold-marks',
    mark: 'purity-test',
    sectionEn: 'Gold',
    sectionEs: 'Oro',
    titleEn: 'Gold Marks Guide: 14K, 585, 750, GF & HGE',
    titleEs: 'Guía de Sellos de Oro: 14K, 585, 750, GF',
    lineEn: '31 real stamp photos — which marks mean solid gold and which mean plated.',
    lineEs: '31 fotos de sellos reales: cuáles significan oro macizo y cuáles chapado.',
  },
  {
    path: '/silver-services/silver-marks',
    mark: 'magnet',
    sectionEn: 'Sterling Silver',
    sectionEs: 'Plata Esterlina',
    titleEn: 'Silver Marks Guide: EPNS, Lion, Sterling, 925',
    titleEs: 'Guía de Sellos de Plata: EPNS, León, 925',
    lineEn: 'Photos of the stamps that mean sterling, and the ones that mean plate.',
    lineEs: 'Fotos de los sellos que significan esterlina y de los que significan chapado.',
  },
  {
    path: '/silver-services/flatware-value',
    mark: 'sterling-flatware',
    sectionEn: 'Sterling Silver',
    sectionEs: 'Plata Esterlina',
    titleEn: 'Sterling Silver Flatware Value Guide',
    titleEs: 'Guía del Valor de la Cubertería de Plata',
    lineEn: 'Sterling vs. plate, the weight × 92.5% × spot math, the knife trap, and when a pattern beats melt.',
    lineEs: 'Esterlina vs. chapado, la cuenta peso × 92.5% × spot, la trampa de los cuchillos y cuándo un patrón supera la fundición.',
  },
  {
    path: '/jewelry-appraisal/hallmarks',
    mark: 'flask',
    sectionEn: 'Appraisal',
    sectionEs: 'Tasación',
    titleEn: 'Hallmarks: Real Gold or Silver?',
    titleEs: 'Sellos: ¿Oro o Plata de Verdad?',
    lineEn: 'How to read the small stamps on jewelry, and the marks that look like gold but are not.',
    lineEs: 'Cómo leer los sellos pequeños de las joyas, y los que parecen oro pero no lo son.',
  },
  {
    path: '/diamond-buyers/what-is-my-diamond-worth',
    mark: 'gemstone',
    sectionEn: 'Diamonds',
    sectionEs: 'Diamantes',
    titleEn: 'What Is My Diamond Ring Worth When I Sell It?',
    titleEs: '¿Cuánto Vale Mi Anillo de Diamante al Venderlo?',
    lineEn: 'Appraisal vs. offer, the 4Cs as they change the price, natural or lab-grown — and the full color and clarity chart.',
    lineEs: 'Tasación vs. oferta, las 4C tal como cambian el precio, natural o de laboratorio — y la tabla completa de color y claridad.',
  },
  {
    path: '/estate-jewelry/native-american-jewelry',
    mark: 'estate-jewelry',
    sectionEn: 'Estate Jewelry',
    sectionEs: 'Joyería de Patrimonio',
    titleEn: 'Sell Native American Jewelry in Naples',
    titleEs: 'Vender Joyería Nativa Americana en Naples',
    lineEn: 'Navajo, Zuni and Hopi work and Taxco silver — priced as pieces, not by weight.',
    lineEs: 'Trabajo navajo, zuni y hopi y plata de Taxco — valorados como piezas, no por peso.',
  },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Guías para Vender Oro, Plata y Joyas' : 'Seller Guides: Gold, Silver & Estate Jewelry',
    // ≤ ~155 characters with the phone LAST (2026-09-08 rule, DECISIONS.md).
    description: isEs
      ? 'Guías claras sobre lo que valen el oro, la plata esterlina y las joyas de patrimonio al venderlos: quilates, sellos, cubertería, herencias. (239) 404-8505.'
      : 'Plain-English guides to what gold, sterling silver and estate jewelry are worth when you sell: karats, hallmarks, flatware, heirlooms. Call (239) 404-8505.',
    path: '/guides',
    locale,
  });
}

export default async function GuidesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const p = (path: string) => (isEs ? `/es${path}` : path);

  const crumbs: Crumb[] = [{ name: isEs ? 'Guías' : 'Guides', path: '/guides' }];

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">
        {/* Light, centred opener — the /reviews shape, so the About-menu
            destinations read as one family. */}
        <section
          className="border-b"
          style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
        >
          <PageContainer max="content" className="py-14 text-center md:py-20">
            <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" align="center" />
            <p
              className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.35em]"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Guías Para Vendedores · Naples, FL' : 'Seller Guides · Naples, FL'}
            </p>
            <h1
              className="text-4xl font-bold tracking-tight md:text-5xl"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              {isEs ? 'Guías' : 'Guides'}
            </h1>
            <p
              className="mx-auto mt-5 max-w-2xl text-base leading-relaxed md:text-lg"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {isEs
                ? 'Guías claras sobre lo que valen su oro, su plata esterlina y sus joyas de patrimonio — la misma cuenta que hacemos en voz alta en el salón. Lea primero, o simplemente tráigalo: la evaluación es gratis de cualquier modo.'
                : 'Plain-English guides to what your gold, sterling silver and estate jewelry are worth — the same math we do out loud at the showroom. Read first, or just bring it in: the evaluation is free either way.'}
            </p>
          </PageContainer>
        </section>

        <section className="py-12 md:py-16">
          <PageContainer max="content">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
              {GUIDES.map((g) => (
                <Link
                  key={g.path}
                  href={p(g.path)}
                  className="grid grid-cols-[5.5rem_1fr] items-start gap-4 rounded-2xl border border-[#d0c5af] bg-white p-5 shadow-[0_10px_28px_rgba(38,28,6,0.04)] transition-shadow hover:shadow-[0_14px_38px_rgba(38,28,6,0.10)] md:gap-5 md:p-6"
                >
                  <ClayMark name={g.mark} size={88} />
                  <div>
                    <span
                      className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[0.24em]"
                      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                    >
                      {isEs ? g.sectionEs : g.sectionEn}
                    </span>
                    <h2 className="mb-2 text-xl font-bold leading-snug text-[#1a1c1c] md:text-2xl" style={{ fontFamily: 'var(--font-headline)' }}>
                      {isEs ? g.titleEs : g.titleEn}
                    </h2>
                    <p className="mb-3 text-sm leading-relaxed text-[#4d4635] md:text-[0.95rem]">
                      {isEs ? g.lineEs : g.lineEn}
                    </p>
                    <span className="text-[0.8rem] font-bold text-[#735c00]" style={{ fontFamily: 'var(--font-label)' }}>
                      {isEs ? 'Leer la guía →' : 'Read the guide →'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </PageContainer>
        </section>

        {/* The same close every guide has: the evaluation, or the phone. */}
        <section className="bg-[#1a1c1c] py-16 text-center md:py-20">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: 'var(--font-headline)' }}>
              {isEs ? '¿Prefiere que lo veamos en persona?' : 'Rather have it looked at?'}
            </h2>
            <p className="mx-auto mb-8 max-w-lg text-base leading-relaxed text-[#d7d0c3]">
              {isEs
                ? 'Tráigalo a nuestro salón de Shirley St en North Naples — probado, pesado y valorado frente a usted, sin compromiso.'
                : 'Bring it to our Shirley St showroom in North Naples — tested, weighed and priced in front of you, no obligation.'}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href={p('/free-evaluation')} className="gold-button">
                {isEs ? 'TASACIÓN GRATUITA' : 'FREE APPRAISAL'}
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
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
