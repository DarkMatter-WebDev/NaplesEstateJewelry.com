import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { jsonLdHtml } from '@/lib/json-ld';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import { AppIcon } from '@/components/AppIcon';
import LinkedPhrase from '@/components/LinkedPhrase';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs
      ? 'Preguntas Frecuentes — Vender Oro y Joyería'
      : 'FAQ — Selling Estate Jewelry, Gold & Antiques',
    description: isEs
      ? 'Respuestas sobre vender joyería, oro, plata y antigüedades en Naples, FL. Consultas gratuitas en nuestro salón de Naples o con cita, y pago inmediato en efectivo.'
      : 'Answers on selling estate jewelry, gold, silver, and antiques in Naples FL. Free consultations at our Naples showroom or by appointment, and immediate cash payment.',
    path: '/faq',
    locale,
  });
}

interface Props {
  params: Promise<{ locale: string }>;
}

const FAQ_ITEMS = [
  {
    questionEn: 'Is the consultation free?',
    questionEs: '¿La consulta es gratuita?',
    answerEn: 'Yes. All consultations, evaluations, and offers are 100% free and come with no obligation. If we can\'t agree on a price, you owe nothing.',
    answerEs: 'Sí. Todas las consultas, evaluaciones y ofertas son 100% gratuitas y sin obligación. Si no podemos acordar un precio, no debe nada.',
  },
  {
    questionEn: 'How do I get a quick quote without an appointment?',
    questionEs: '¿Cómo obtengo una cotización rápida sin cita?',
    answerEn: 'Text clear photos of your items to (239) 404-8505. Include close-ups of any maker\'s marks, stamps, or signatures. In most cases, we can provide a preliminary range within the same day.',
    answerEs: 'Envíe fotos claras de sus artículos al (239) 404-8505. Incluya primeros planos de cualquier marca del fabricante, sellos o firmas. En la mayoría de los casos, podemos proporcionar un rango preliminar el mismo día.',
  },
  {
    questionEn: 'How is payment delivered?',
    questionEs: '¿Cómo se entrega el pago?',
    answerEn: 'We offer immediate payment by cash, certified check, or wire transfer depending on the size of the transaction and your preference. Payment is made the moment we reach an agreement — there is no waiting period.',
    answerEs: 'Ofrecemos pago inmediato en efectivo, cheque certificado o transferencia bancaria según el tamaño de la transacción y su preferencia. El pago se realiza en el momento en que llegamos a un acuerdo — no hay período de espera.',
  },
  {
    questionEn: 'Do you buy broken or damaged jewelry?',
    questionEs: '¿Compran joyería rota o dañada?',
    answerEn: 'Absolutely. We purchase damaged, broken, mismatched, and unworn jewelry regularly. The value of gold, platinum, sterling silver, and most gemstones is unaffected by minor damage, and we pay competitive market rates regardless of condition.',
    answerEs: 'Absolutamente. Compramos joyería dañada, rota, sin par y sin usar regularmente. El valor del oro, el platino, la plata esterlina y la mayoría de las piedras preciosas no se ve afectado por daños menores.',
  },
  {
    questionEn: 'What areas do you serve?',
    questionEs: '¿Qué áreas sirven?',
    answerEn: 'Our showroom is at 6240 Shirley St, Ste 104 in Naples, inside Sharon Lynch Collections — open during showroom hours or by appointment. We also buy throughout Southwest Florida — Marco Island, Bonita Springs, Estero, Fort Myers, Cape Coral, and surrounding communities — with home visits on request, and for larger collections or estate liquidations we will travel further.',
    answerEs: 'Nuestro salón está en 6240 Shirley St, Ste 104 en Naples, dentro de Sharon Lynch Collections — abierto durante el horario del salón o con cita. También compramos en todo el suroeste de Florida — Marco Island, Bonita Springs, Estero, Fort Myers, Cape Coral y comunidades aledañas — con visitas a domicilio a pedido, y para colecciones más grandes o liquidaciones de patrimonio viajamos más lejos.',
  },
  {
    questionEn: 'Do I need a formal evaluation before contacting you?',
    questionEs: '¿Necesito una evaluación formal antes de contactarlos?',
    answerEn: 'No. We perform our own private evaluation on site at no cost to you. If you do have prior paperwork, GIA reports, or original purchase receipts, please have them available — they can sometimes help us offer more.',
    answerEs: 'No. Realizamos nuestra propia evaluación privada en el sitio sin costo para usted. Si tiene documentación previa, informes GIA o recibos de compra originales, téngalos disponibles — a veces pueden ayudarnos a ofrecer más.',
  },
  {
    questionEn: 'What types of items do you purchase?',
    questionEs: '¿Qué tipos de artículos compran?',
    answerEn: 'We buy jewelry, gold, sterling silver flatware and hollowware, from single everyday pieces to complete inherited collections. Jewelry is evaluated as a complete piece, including its metal, stones and maker. We also buy designer pieces, watches, bullion, rare and pre-1965 silver coins, fine art and antique furniture.',
    answerEs: 'Compramos joyería, oro, cubertería y vajilla de plata esterlina, desde una sola pieza de uso diario hasta colecciones heredadas completas. Evaluamos cada joya como pieza completa, incluidos su metal, piedras y fabricante. También compramos piezas de diseñador, relojes, lingotes, monedas raras y de plata anteriores a 1965, arte fino y muebles antiguos.',
  },
  {
    questionEn: 'Is the process confidential?',
    questionEs: '¿El proceso es confidencial?',
    answerEn: 'Yes. All consultations are private and discreet, whether at the showroom or in your home. We never share client information, transaction details, or item photos. Most clients value that discretion, especially when handling inherited or sentimental collections.',
    answerEs: 'Sí. Todas las consultas son privadas y discretas, ya sea en el salón o en su casa. Nunca compartimos información del cliente, detalles de transacciones ni fotos de artículos. La mayoría de los clientes valoran esa discreción, especialmente cuando manejan colecciones heredadas o sentimentales.',
  },
];

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ questionEn, questionEs, answerEn, answerEs }) => ({
      '@type': 'Question',
      name: isEs ? questionEs : questionEn,
      acceptedAnswer: { '@type': 'Answer', text: isEs ? answerEs : answerEn },
    })),
  };

  // One crumbs array feeds both the JSON-LD and the visible trail.
  const crumbs = [{ name: isEs ? 'Preguntas Frecuentes' : 'FAQ', path: '/faq' }];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">

        {/* Header */}
        <section className="pt-12 pb-16 md:pt-16 md:pb-24 border-b border-[#d0c5af]">
          <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
            <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" align="center" />
            <span className="text-[#735c00] text-xs font-bold uppercase tracking-[0.4em]">
              {isEs ? 'Preguntas Frecuentes' : 'Common Questions'}
            </span>
            <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-headline)] font-bold mt-4 mb-6 tracking-tight">
              {isEs ? 'Preguntas Frecuentes' : 'Frequently Asked Questions'}
            </h1>
            <p className="text-xl text-[#4d4635] italic max-w-2xl mx-auto leading-relaxed">
              {isEs
                ? 'Respuestas rápidas a las preguntas que escuchamos con más frecuencia. Si la suya no está aquí, llámenos o envíenos un mensaje directamente.'
                : "Quick answers to the questions we hear most often. If yours isn't here, call or text us directly."}
            </p>
          </div>
        </section>

        {/* FAQ Accordion */}
        <section className="py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-6 md:px-8">
            <div className="space-y-3">
              {FAQ_ITEMS.map(({ questionEn, questionEs, answerEn, answerEs }) => (
                <details
                  key={questionEn}
                  className="group overflow-hidden rounded-2xl border border-[#d0c5af] bg-white shadow-[0_14px_38px_rgba(38,28,6,0.05)]"
                >
                  <summary className="flex justify-between items-center cursor-pointer px-6 py-5 hover:bg-[#f3f3f3] transition-colors list-none [&::-webkit-details-marker]:hidden">
                    <span className="font-[family-name:var(--font-headline)] font-bold text-lg pr-4">
                      {isEs ? questionEs : questionEn}
                    </span>
                    <AppIcon name="expand_more"
                      className="text-[#735c00] shrink-0 transition-transform group-open:rotate-180"
                     />
                  </summary>
                  <div className="px-6 pb-6 text-[#4d4635] leading-relaxed text-sm">
                    {questionEn === 'How do I get a quick quote without an appointment?' ? (
                      <>
                        {isEs
                          ? 'Envíe fotos claras de sus artículos al '
                          : 'Text clear photos of your items to '}
                        <a href="tel:2394048505" className="text-[#735c00] underline">(239) 404-8505</a>
                        {isEs
                          ? '. Incluya primeros planos de cualquier marca del fabricante, sellos o firmas. En la mayoría de los casos, podemos proporcionar un rango preliminar el mismo día.'
                          : ". Include close-ups of any maker's marks, stamps, or signatures. In most cases, we can provide a preliminary range within the same day."}
                      </>
                    ) : questionEn === 'What types of items do you purchase?' ? (
                      <>
                        {/* The answer string above also feeds the FAQPage
                            JSON-LD, so it is NOT duplicated here as JSX —
                            LinkedPhrase finds the span at render and links it.
                            Reword the phrase in FAQ_ITEMS and the link simply
                            drops; the copy cannot fork. (2026-09-01) */}
                        <LinkedPhrase
                          text={isEs ? answerEs : answerEn}
                          phrase={isEs ? 'cubertería y vajilla de plata esterlina' : 'sterling silver flatware and hollowware'}
                          href={isEs ? '/es/silver-services' : '/silver-services'}
                          className="text-[#735c00] underline"
                        />{' '}
                        <Link href={isEs ? '/es/estate-jewelry' : '/estate-jewelry'} className="text-[#735c00] underline">
                          {isEs ? 'Lista completa →' : 'Full list →'}
                        </Link>
                      </>
                    ) : (
                      isEs ? answerEs : answerEn
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 md:py-24 bg-[#f3f3f3]">
          <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-headline)] font-bold mb-6 tracking-tight">
              {isEs ? '¿Tiene una Pregunta Diferente?' : 'Have a Different Question?'}
            </h2>
            <p className="text-[#4d4635] text-lg mb-10 max-w-2xl mx-auto">
              {isEs
                ? 'Llámenos o envíenos un mensaje directamente. Sin centralita, sin intermediarios.'
                : 'Call or text us directly. No phone tree, no gatekeepers.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
              <a
                href="tel:2394048505"
                className="gold-button"
              >
                (239) 404-8505
              </a>
              <Link
                href={isEs ? '/es/free-evaluation' : '/free-evaluation'}
                className="outline-button"
              >
                {isEs ? 'Programar una Consulta' : 'Schedule a Consultation'}
              </Link>
            </div>
            <div className="mt-8">
              <a
                href="https://share.google/yQQMAvFDiOLppBZ30"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[#735c00] hover:text-[#1a1c1c] transition-colors text-xs uppercase tracking-widest border-b border-[#735c00]/30 hover:border-[#735c00] pb-1"
              >
                <AppIcon name="star" className="text-base" fill="currentColor" />
                {isEs ? 'Leer todas nuestras reseñas en Google' : 'Read all our reviews on Google'}
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
