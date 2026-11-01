import type { Metadata } from 'next';
import Image from 'next/image';
import { pageMetadata } from '@/lib/seo';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import { PageContainer } from '@/components/layout/ResponsiveLayout';
import EvalForm from '@/components/free-evaluation/EvalForm';
import TextUsLink from '@/components/cta/TextUsLink';
import ClayMark, { type ClayMarkName } from '@/components/ClayMark';
import StorefrontPhoto from '@/components/StorefrontPhoto';
import { streetLine } from '@/lib/business-location';

/**
 * `/sellbymail` — UNLISTED "Sell to Us by Mail" page (owner, 2026-11-01,
 * mockup 1 + answers). The owner sends this link only to people and dealers
 * they know: it is in no menu, no footer, not the sitemap, and `noindex`.
 * The normal site header and footer stay, so a visitor can browse on.
 *
 * ⚠️ `DECISIONS.md` → "No mail-in page" (2026-08-30): Florida Ch. 538 Part III
 * registers buying precious metals/jewelry by mail as its own business class.
 * The owner was shown that research on 2026-11-01 and chose this unlisted page
 * for known clients and dealers — the owner's call. ⛔ Never link it from the
 * public site, never add it to the sitemap, never drop the noindex.
 *
 * Facts on the page are the owner's (2026-11-01): prepaid label, USPS / FedEx /
 * UPS by value, insured on the way in (coverage by value), photo ID before
 * payment, offer within one day of arrival, Zelle / bank transfer / mailed
 * check, return shipping paid by the customer. Don't add claims beyond them.
 *
 * Images (owner, 2026-11-01, option B): the owner's icon pack on each step and
 * a four-icon "What we buy" row, the owner photo beside the opener, and the
 * storefront photo (wide crop) in "Rather come in?" — all images the site
 * already uses; nothing new.
 */

const OWNER_PHOTO = '/assets/images/pages/chris-owner.webp';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return {
    ...pageMetadata({
      title: isEs ? 'Véndanos por Correo' : 'Sell to Us by Mail',
      description: isEs
        ? 'Envíe su oro, plata y joyería a nuestro salón de Naples con una etiqueta prepagada y reciba una oferta en un día.'
        : 'Ship your gold, silver and jewelry to our Naples showroom with a prepaid label and get an offer within one day of arrival.',
      path: '/sellbymail',
      locale,
    }),
    // Unlisted: reachable only by the link the owner sends.
    robots: { index: false, follow: false },
  };
}

interface Step {
  icon: ClayMarkName;
  title: [string, string];
  body?: [string, string];
  list?: [string, string][];
}

const STEPS: Step[] = [
  {
    icon: 'phone-signal',
    title: ['Tell us what you have', 'Cuéntenos qué tiene'],
    body: [
      'Call, text or email Chris with a short list — or send a few photos with the form below. We’ll confirm it’s a fit before anything ships.',
      'Llame, envíe un mensaje o un correo a Chris con una lista breve, o mándenos unas fotos con el formulario de abajo. Confirmaremos que es adecuado antes de que se envíe nada.',
    ],
  },
  {
    icon: 'shield',
    title: ['We send you a prepaid label', 'Le enviamos una etiqueta prepagada'],
    body: [
      'Addressed to our Naples showroom — USPS, FedEx or UPS, chosen by the value of what you’re sending. Your package is insured on its way to us, with coverage based on its value. You pay nothing to ship it to us.',
      'Dirigida a nuestro salón de Naples: USPS, FedEx o UPS, según el valor de lo que envía. Su paquete va asegurado en el camino hacia nosotros, con una cobertura según su valor. Enviárnoslo no le cuesta nada.',
    ],
  },
  {
    icon: 'heirloom',
    title: ['Box it up', 'Empáquelo'],
    list: [
      ['Wrap each piece, or bag it, so nothing rubs.', 'Envuelva o embolse cada pieza para que nada se roce.'],
      ['Put a list of what’s inside in the box.', 'Ponga en la caja una lista de lo que contiene.'],
      ['Fill empty space so nothing shifts.', 'Rellene el espacio vacío para que nada se mueva.'],
      ['Keep the tracking number.', 'Guarde el número de seguimiento.'],
    ],
  },
  {
    icon: 'house',
    title: ['We let you know it arrived', 'Le avisamos cuando llega'],
    body: [
      'We open your box and confirm what we received, against your list.',
      'Abrimos su caja y confirmamos lo que recibimos, comparándolo con su lista.',
    ],
  },
  {
    icon: 'scale',
    title: ['We evaluate every piece', 'Evaluamos cada pieza'],
    body: [
      'Each item is tested and weighed, and judged for what it is — a signed piece or a collectible is not priced as scrap.',
      'Cada pieza se prueba y se pesa, y se valora por lo que es: una pieza firmada o de colección no se cotiza como chatarra.',
    ],
  },
  {
    icon: 'pricing',
    title: ['Your offer — within one day of arrival', 'Su oferta, en un día desde la llegada'],
    body: [
      'An itemized offer, piece by piece, so you can sell some and keep the rest.',
      'Una oferta detallada, pieza por pieza, para que pueda vender algunas y quedarse con el resto.',
    ],
  },
  {
    icon: 'camera',
    title: ['Send a photo of your ID', 'Envíe una foto de su identificación'],
    body: [
      'Before we pay, send us a clear photo of your government-issued photo ID — we need it for every purchase.',
      'Antes de pagarle, envíenos una foto clara de su identificación oficial con foto; la necesitamos para cada compra.',
    ],
  },
  {
    icon: 'cash',
    title: ['Get paid, or get it back', 'Cobre, o recupérelo'],
    body: [
      'Accept, and we pay you by Zelle, bank transfer or mailed check. Anything you decide to keep is shipped back to you — return shipping is paid by you.',
      'Si acepta, le pagamos por Zelle, transferencia bancaria o cheque por correo. Lo que decida conservar se lo devolvemos; el envío de vuelta corre por su cuenta.',
    ],
  },
];

function Eyebrow({ children, className = '' }: { children: string; className?: string }) {
  return (
    <p
      className={`flex items-center justify-center gap-3 text-[0.65rem] font-bold uppercase tracking-[0.32em] ${className}`}
      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
    >
      <span aria-hidden="true" className="inline-block h-px w-8 flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
      {children}
      <span aria-hidden="true" className="inline-block h-px w-8 flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
    </p>
  );
}

const H2 = 'mt-4 text-center font-bold tracking-tight text-[clamp(1.6rem,3.6vw,2.4rem)] leading-[1.1]';
const CARD = 'rounded-2xl border bg-white p-[22px] shadow-[0_8px_20px_rgba(38,28,6,0.04)]';
const CARD_STYLE = { borderColor: 'var(--color-outline-variant)' } as const;

function ContactButtons({ isEs, className = '' }: { isEs: boolean; className?: string }) {
  return (
    <div className={`mt-7 flex flex-wrap justify-center gap-3 ${className}`}>
      <a href="tel:2394048505" className="gold-button">{isEs ? 'Llame al (239) 404-8505' : 'Call (239) 404-8505'}</a>
      <TextUsLink isEs={isEs} icon={false} className="outline-button">{isEs ? 'Mensaje de texto' : 'Text Us'}</TextUsLink>
      <a href="mailto:info@naplesestatejewelry.com?subject=Sell%20by%20mail" className="outline-button">{isEs ? 'Correo' : 'Email Us'}</a>
      <a href="#send-photos" className="outline-button">{isEs ? 'Enviar fotos' : 'Send Photos'}</a>
    </div>
  );
}

export default async function SellByMailPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const t = (pair: [string, string]) => (isEs ? pair[1] : pair[0]);
  const muted = { color: 'var(--color-on-surface-variant)' } as const;
  const headline = { fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' } as const;

  return (
    <>
      <SiteHeader />
      <main className="site-header-offset">
        {/* Opener */}
        <section
          className="responsive-section border-b"
          style={{ background: 'var(--color-surface-container-lowest)', borderColor: 'var(--color-outline-variant)' }}
        >
          {/* Text left, the owner photo right from lg; stacked (text, then
              photo) below lg. The photo is the page's largest image, so it
              carries `priority`. */}
          <PageContainer max="content" className="grid items-center gap-9 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="text-center lg:text-left">
            <Eyebrow className="lg:justify-start">{isEs ? 'Venda Desde Cualquier Lugar' : 'Sell From Anywhere'}</Eyebrow>
            <h1 className="mt-4 font-bold tracking-tight text-[clamp(2.1rem,5vw,3.5rem)] leading-[1.06]" style={headline}>
              {isEs ? 'Véndanos ' : 'Sell to Us '}
              <span style={{ color: 'var(--color-primary)' }}>{isEs ? 'por Correo.' : 'by Mail.'}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[44rem] text-[1.05rem] leading-relaxed lg:mx-0" style={muted}>
              {isEs
                ? '¿No puede venir a Naples? Envíe su oro, plata y joyería a nuestro salón con una etiqueta prepagada. Lo evaluamos todo y le hacemos una oferta en un día desde la llegada; venda lo que quiera, y lo que conserve se lo devolvemos.'
                : 'Can’t make it to Naples? Ship your gold, silver and jewelry to our showroom with a prepaid label. We evaluate everything and make you an offer within one day of arrival — sell what you like, and anything you keep comes back to you.'}
            </p>
            <span
              className="mt-5 inline-block rounded-full border px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.16em]"
              style={{
                color: 'var(--color-primary)',
                fontFamily: 'var(--font-label)',
                borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
                background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
              }}
            >
              {isEs ? 'Para clientes y comerciantes con quienes trabajamos' : 'For clients & dealers we work with'}
            </span>
            <ContactButtons isEs={isEs} className="lg:justify-start" />
            </div>
            <Image
              src={OWNER_PHOTO}
              alt={isEs
                ? 'Chris, el propietario, en la mesa de tasación del salón de Naples, con básculas y una cadena de oro'
                : 'Chris, the owner, at the appraisal table in the Naples showroom, with scales and a gold chain'}
              width={1302}
              height={1302}
              priority
              sizes="(min-width: 1024px) 26rem, (min-width: 640px) 34rem, 100vw"
              className="mx-auto aspect-[4/3] w-full max-w-[34rem] rounded-[18px] object-cover object-[50%_30%] lg:aspect-square lg:max-w-none"
              style={{ boxShadow: '0 22px 50px rgba(38, 28, 6, 0.18)' }}
            />
          </PageContainer>
        </section>

        {/* Steps */}
        <section className="responsive-section">
          <PageContainer max="content">
            <Eyebrow>{isEs ? 'Cómo Funciona' : 'How It Works'}</Eyebrow>
            <h2 className={H2} style={headline}>{isEs ? 'Ocho Pasos Sencillos' : 'Eight Simple Steps'}</h2>
            <ol className="mt-9 flex flex-wrap justify-center gap-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.title[0]}
                  className={`${CARD} basis-full sm:basis-[calc(50%-8px)] lg:basis-[calc(25%-12px)]`}
                  style={CARD_STYLE}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-[0.9rem] font-extrabold text-white"
                      style={{ background: 'linear-gradient(135deg, #dcb336, #b5890c)', fontFamily: 'var(--font-label)' }}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <ClayMark name={step.icon} size={76} />
                  </div>
                  <h3 className="mt-3 mb-1.5 text-[1.05rem] font-bold leading-snug" style={{ color: 'var(--color-on-surface)' }}>
                    <span className="sr-only">{isEs ? `Paso ${index + 1}: ` : `Step ${index + 1}: `}</span>
                    {t(step.title)}
                  </h3>
                  {step.body && <p className="text-[0.93rem] leading-relaxed" style={muted}>{t(step.body)}</p>}
                  {step.list && (
                    <ul className="mt-2 list-disc pl-[1.1rem] text-[0.9rem] leading-relaxed" style={muted}>
                      {step.list.map((item) => <li key={item[0]}>{t(item)}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </PageContainer>
        </section>

        {/* Details */}
        <section
          className="responsive-section border-y"
          style={{ background: 'var(--color-surface-container-low)', borderColor: 'var(--color-outline-variant)' }}
        >
          <PageContainer max="content">
            <Eyebrow>{isEs ? 'Bueno Saberlo' : 'Good to Know'}</Eyebrow>
            <h2 className={H2} style={headline}>{isEs ? 'Los Detalles' : 'The Details'}</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className={CARD} style={CARD_STYLE}>
                <h3 className="form-label">{isEs ? 'Cómo le pagamos' : 'Getting paid'}</h3>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {[['Zelle', 'Zelle'], ['Bank transfer', 'Transferencia bancaria'], ['Mailed check', 'Cheque por correo']].map((option) => (
                    <li
                      key={option[0]}
                      className="rounded-full border px-3 py-1.5 text-[0.8rem] font-bold"
                      style={{ borderColor: 'var(--color-outline-variant)', fontFamily: 'var(--font-label)', color: 'var(--color-on-surface)' }}
                    >
                      {isEs ? option[1] : option[0]}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.93rem] leading-relaxed" style={muted}>
                  {isEs ? 'Usted elige, una vez que acepta la oferta.' : 'You choose, once you accept the offer.'}
                </p>
              </div>
              <div className={CARD} style={CARD_STYLE}>
                <h3 className="form-label">{isEs ? 'Envío' : 'Shipping'}</h3>
                <ul className="list-disc pl-[1.1rem] text-[0.95rem] leading-[1.75]" style={{ color: 'var(--color-on-surface)' }}>
                  <li><b>{isEs ? 'Hacia nosotros:' : 'To us:'}</b> {isEs ? 'gratis y asegurado; le enviamos la etiqueta prepagada.' : 'free and insured — we send the prepaid label.'}</li>
                  <li><b>{isEs ? 'De vuelta a usted:' : 'Back to you:'}</b> {isEs ? 'lo que conserve; el envío corre por su cuenta.' : 'anything you keep, return shipping paid by you.'}</li>
                  <li>{isEs ? 'USPS, FedEx o UPS, según el valor.' : 'USPS, FedEx or UPS, by value.'}</li>
                </ul>
              </div>
              <div className={CARD} style={CARD_STYLE}>
                <h3 className="form-label">{isEs ? 'Qué compramos' : 'What we buy'}</h3>
                <ul className="mt-1 mb-3 flex gap-3.5" aria-hidden="true">
                  {([
                    ['chain', 'Gold', 'Oro'],
                    ['sterling-flatware', 'Sterling', 'Plata'],
                    ['gemstone', 'Diamonds', 'Diamantes'],
                    ['coins', 'Coins', 'Monedas'],
                  ] as const).map(([mark, en, es]) => (
                    <li key={mark} className="text-center text-[0.7rem] font-semibold leading-tight" style={{ ...muted, fontFamily: 'var(--font-label)' }}>
                      <ClayMark name={mark} size={56} className="mx-auto mb-1 block" />
                      {isEs ? es : en}
                    </li>
                  ))}
                </ul>
                <ul className="list-disc pl-[1.1rem] text-[0.95rem] leading-[1.75]" style={{ color: 'var(--color-on-surface)' }}>
                  <li>{isEs ? 'Oro y joyería de oro, de cualquier quilate, rota o entera' : 'Gold and gold jewelry — any karat, broken or whole'}</li>
                  <li>{isEs ? 'Plata esterlina y cubiertos' : 'Sterling silver and flatware'}</li>
                  <li>{isEs ? 'Joyería de patrimonio y de diseñador, diamantes' : 'Estate and designer jewelry, diamonds'}</li>
                  <li>{isEs ? 'Monedas y lingotes' : 'Coins and bullion'}</li>
                </ul>
              </div>
              <div className={CARD} style={CARD_STYLE}>
                <h3 className="form-label">{isEs ? '¿Prefiere venir?' : 'Rather come in?'}</h3>
                <p className="text-[0.95rem] leading-relaxed" style={muted}>
                  {isEs
                    ? `Nuestro salón de Naples está en ${streetLine()}. Pase durante el horario de atención, o pregunte por una visita a domicilio para una herencia grande.`
                    : `Our Naples showroom is at ${streetLine()} — walk in during showroom hours, or ask about a home visit for a larger estate.`}
                </p>
                <StorefrontPhoto locale={locale} aspect="2:1" className="mt-3.5" sizes="(min-width: 768px) 30rem, 100vw" />
              </div>
            </div>
          </PageContainer>
        </section>

        {/* Photo form (step 1's "send a few photos") */}
        <section id="send-photos" className="responsive-section scroll-mt-24">
          <PageContainer max="content">
            <Eyebrow>{isEs ? 'Empiece con Fotos' : 'Start With Photos'}</Eyebrow>
            <h2 className={H2} style={headline}>{isEs ? 'Envíenos Unas Fotos' : 'Send Us a Few Photos'}</h2>
            <p className="mx-auto mt-4 max-w-[38rem] text-center leading-relaxed" style={muted}>
              {isEs
                ? 'Unas fotos y una breve descripción bastan. Le contactaremos para confirmar y enviarle su etiqueta prepagada.'
                : 'A few photos and a short description are enough. We’ll get back to you to confirm and send your prepaid label.'}
            </p>
            <div className="mt-8">
              <EvalForm locale={locale} submitted={false} variant="sell-by-mail" />
            </div>
          </PageContainer>
        </section>

        {/* Final call */}
        <section
          className="responsive-section border-t text-center"
          style={{ background: 'var(--color-surface-container-lowest)', borderColor: 'var(--color-outline-variant)' }}
        >
          <PageContainer max="content">
            <h2 className={H2} style={headline}>{isEs ? '¿Listo para Enviar?' : 'Ready to Ship?'}</h2>
            <p className="mx-auto mt-3 max-w-[38rem]" style={muted}>
              {isEs ? 'Contáctenos y le enviaremos su etiqueta.' : 'Get in touch and we’ll send your label.'}
            </p>
            <ContactButtons isEs={isEs} />
          </PageContainer>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
