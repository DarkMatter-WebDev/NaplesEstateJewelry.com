export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** The footer's words, per language (Spanish since 2026-11-22 — draft for the translator). */
const FOOTER_WORDS = {
  en: {
    why: 'You are receiving this marketing email because you subscribed or have a Naples Estate Jewelry account.',
    unsubscribe: 'Unsubscribe',
  },
  es: {
    why: 'Recibe este correo de mercadeo porque se suscribió o tiene una cuenta en Naples Estate Jewelry.',
    unsubscribe: 'Cancelar suscripción',
  },
} as const;

export function withMarketingFooter(html: string, unsubscribeUrl: string, mailingAddress: string, language: 'en' | 'es' = 'en') {
  const words = FOOTER_WORDS[language];
  return `${html}
<hr style="border:0;border-top:1px solid #e7dfcf;margin:32px 0 16px;" />
<p style="font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:#6f675c;">
  Naples Estate Jewelry<br />
  ${escapeHtml(mailingAddress).replace(/\n/g, '<br />')}<br />
  ${words.why}
  <a href="${escapeHtml(unsubscribeUrl)}" style="color:#735c00;">${words.unsubscribe}</a>
</p>`;
}
