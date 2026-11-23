/**
 * The customer's "we received your inquiry" email from `/api/inquire`, in the
 * language of the page the form was sent from (2026-11-22 (3)).
 *
 * The free-evaluation, sell-by-mail and shop-inquiry forms send `locale`; a
 * form loaded before that change sends nothing and gets English, as before.
 * ⛔ The English email stays byte-identical — it is pinned in
 * `spanish-subscribers.test.ts`.
 */

export type InquiryLanguage = 'en' | 'es';

/** Only an exact 'es' is Spanish; anything else (missing, a File, junk) is English. */
export function inquiryLanguage(value: unknown): InquiryLanguage {
  return typeof value === 'string' && value.trim().toLowerCase() === 'es' ? 'es' : 'en';
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The lead forms' fixed titles, as a Spanish reader should see them. Shop items keep their own name. */
const SPANISH_LEAD_TITLES: Record<string, string> = {
  'Free Evaluation Request': 'Solicitud de evaluación gratuita',
  'Sell by Mail Request': 'Solicitud de venta por correo',
  'Submit Your Item': 'Su artículo',
};

export function inquiryConfirmationEmail(
  itemTitle: string,
  name: string,
  language: InquiryLanguage,
): { subject: string; html: string } {
  if (language === 'es') {
    const title = SPANISH_LEAD_TITLES[itemTitle] ?? itemTitle;
    return {
      subject: `Recibimos su consulta sobre: ${title}`,
      html: `<p>Hola ${esc(name)},</p>
               <p>Gracias por su interés en <strong>${esc(title)}</strong>. Nos comunicaremos con usted pronto.</p>
               <p>Si su pregunta es urgente, llámenos al <a href="tel:2394048505">(239) 404-8505</a>.</p>
               <p>— Naples Estate Jewelry</p>`,
    };
  }
  return {
    subject: `We received your inquiry about: ${itemTitle}`,
    html: `<p>Hi ${esc(name)},</p>
               <p>Thank you for your interest in <strong>${esc(itemTitle)}</strong>. We will be in touch with you shortly.</p>
               <p>For urgent questions, call us at <a href="tel:2394048505">(239) 404-8505</a>.</p>
               <p>— Naples Estate Jewelry</p>`,
  };
}
