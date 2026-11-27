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

/**
 * `signatureHtml`: Chris's signature block (lib/email-signature.ts), placed
 * above the unsubscribe footer. Passed for campaigns sent as "Chris" only
 * (owner, 2026-11-26) — a no-reply campaign gets none. Passed in rather than
 * imported because email-signature.ts imports escapeHtml from this file.
 */
export function withMarketingFooter(
  html: string,
  unsubscribeUrl: string,
  mailingAddress: string,
  language: 'en' | 'es' = 'en',
  options: { signatureHtml?: string } = {},
) {
  const words = FOOTER_WORDS[language];
  const signature = options.signatureHtml ? `\n<div style="margin:28px 0 0;">${options.signatureHtml}</div>` : '';
  return `${html}${signature}
<hr style="border:0;border-top:1px solid #e7dfcf;margin:32px 0 16px;" />
<p style="font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:#6f675c;">
  Naples Estate Jewelry<br />
  ${escapeHtml(mailingAddress).replace(/\n/g, '<br />')}<br />
  ${words.why}
  <a href="${escapeHtml(unsubscribeUrl)}" style="color:#735c00;">${words.unsubscribe}</a>
</p>`;
}
