import { escapeHtml } from '@/lib/marketing-email-html';
import { addressOneLine } from '@/lib/business-location';
import { BUSINESS_PHONE, SITE_DOMAIN_LABEL, getSiteUrl, pinPhoneToOneLine } from '@/lib/order-email-branding';
import { formatCheckoutCurrency } from '@/lib/checkout-pricing';
import {
  formatOfferDeadline,
  percentOfListed,
  shippingMethodLabel,
  type OfferBuyerEmail,
} from '@/lib/offers';

/**
 * The "Make an Offer" emails (owner, 2026-10-15). Pure builders — the senders
 * live in lib/offers-server.ts.
 *
 * Buyer emails go from noreply, so they never invite a reply: they say "call or
 * text" (the rule every order email follows). An accepted offer sends NO email
 * from here — the normal PAID receipt from finalizePaidOrder() is the buyer's
 * "accepted" email.
 */

export type OfferEmailInput = {
  kind: OfferBuyerEmail;
  isEs: boolean;
  customerName: string;
  productTitle: string;
  productUrl: string;
  amount: number;
  total: number;
  expiresAt: string | null;
  counterAmount?: number | null;
  /** The owner's message (counter or decline), quoted and signed "— Chris". */
  ownerNote?: string | null;
  counterUrl?: string | null;
  counterExpiresAt?: string | null;
};

export type BuiltEmail = { subject: string; html: string; text: string };

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

function frame(eyebrow: string, heading: string, bodyHtml: string, isEs: boolean): string {
  const footer = `${escapeHtml(isEs ? '¿Preguntas? Llame o envíe un mensaje de texto al' : 'Questions? Call or text')} ${pinPhoneToOneLine(escapeHtml(BUSINESS_PHONE))}.`;
  return `
    <div style="margin:0;padding:0;background:#f8f6ef;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d1a14;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d5c697;">
            <tr><td style="padding:24px 28px 14px;border-bottom:1px solid #d5c697;">
              <div style="color:#735c00;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
              <h1 style="margin:8px 0 0;color:#1d1a14;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;">${escapeHtml(heading)}</h1>
            </td></tr>
            <tr><td style="padding:20px 28px 24px;font-size:15px;line-height:1.55;color:#1d1a14;">
              ${bodyHtml}
              <p style="margin:20px 0 0;font-size:13px;color:#746b5b;">${footer}</p>
              <!-- Website, then the address on its OWN line, both centred (owner,
                   2026-10-15): side by side the address ran on after the link and
                   its end wrapped onto a new line on a phone. nowrap keeps it whole. -->
              <div style="margin:16px 0 0;padding-top:14px;border-top:1px solid #eadfbd;font-size:12px;line-height:1.6;color:#9a8f7a;text-align:center;">
                <div><a href="${escapeHtml(getSiteUrl())}" style="color:#735c00;font-weight:600;text-decoration:underline;">${escapeHtml(SITE_DOMAIN_LABEL)}</a></div>
                <div style="white-space:nowrap;">${escapeHtml(addressOneLine())}</div>
              </div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:18px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#735c00;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px;">${escapeHtml(label)}</a></p>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;">${text}</p>`;
}

export function buildOfferBuyerEmail(input: OfferEmailInput): BuiltEmail {
  const { isEs } = input;
  const name = escapeHtml(firstName(input.customerName));
  const item = escapeHtml(input.productTitle);
  const amount = formatCheckoutCurrency(input.amount);
  const total = formatCheckoutCurrency(input.total);
  const deadline = formatOfferDeadline(input.expiresAt, isEs);
  const textFooter = [isEs ? `¿Preguntas? Llame o envíe un texto al ${BUSINESS_PHONE}.` : `Questions? Call or text ${BUSINESS_PHONE}.`, SITE_DOMAIN_LABEL];

  switch (input.kind) {
    case 'received': {
      const subject = isEs ? `Recibimos su oferta de ${amount}` : `We received your offer of ${amount}`;
      const heading = isEs ? 'Recibimos su oferta' : 'We received your offer';
      const lines = isEs
        ? [
            `Hola ${name}, gracias por su oferta de <strong>${escapeHtml(amount)}</strong> por <strong>${item}</strong>.`,
            `PayPal está reteniendo <strong>${escapeHtml(total)}</strong> (oferta + envío + impuestos). <strong>Solo se le cobrará si aceptamos.</strong>`,
            `Le responderemos antes del <strong>${escapeHtml(deadline)}</strong>. Si no aceptamos, o si no respondemos a tiempo, la retención se libera y no se le cobra nada.`,
          ]
        : [
            `Hi ${name}, thank you for your offer of <strong>${escapeHtml(amount)}</strong> on <strong>${item}</strong>.`,
            `PayPal is holding <strong>${escapeHtml(total)}</strong> (offer + shipping + tax). <strong>You'll only be charged if we accept.</strong>`,
            `We'll answer by <strong>${escapeHtml(deadline)}</strong>. If we don't accept — or don't answer in time — the hold is released and you are not charged.`,
          ];
      const html = frame(isEs ? 'Oferta recibida' : 'Offer received', heading, lines.map(p).join('') + button(input.productUrl, isEs ? 'Ver la pieza' : 'View the piece'), isEs);
      const text = [heading, '', ...lines.map(stripTags), '', input.productUrl, '', ...textFooter].join('\n');
      return { subject, html, text };
    }
    case 'declined':
    case 'expired':
    case 'item_sold': {
      const heading = input.kind === 'declined'
        ? (isEs ? 'Su oferta no fue aceptada esta vez' : "Your offer wasn't accepted this time")
        : input.kind === 'expired'
          ? (isEs ? 'Su oferta venció' : 'Your offer expired')
          : (isEs ? 'Esta pieza se vendió' : 'This piece has sold');
      const subject = `${heading} — ${input.productTitle}`;
      const why = input.kind === 'declined'
        ? (isEs
            ? `Gracias por su oferta de <strong>${escapeHtml(amount)}</strong> por <strong>${item}</strong>. No podemos aceptarla esta vez.`
            : `Thank you for your offer of <strong>${escapeHtml(amount)}</strong> on <strong>${item}</strong>. We aren't able to accept it this time.`)
        : input.kind === 'expired'
          ? (isEs
              ? `No pudimos responder a su oferta de <strong>${escapeHtml(amount)}</strong> por <strong>${item}</strong> a tiempo.`
              : `We weren't able to answer your offer of <strong>${escapeHtml(amount)}</strong> on <strong>${item}</strong> in time.`)
          : (isEs
              ? `<strong>${item}</strong> se vendió mientras su oferta de <strong>${escapeHtml(amount)}</strong> estaba abierta.`
              : `<strong>${item}</strong> sold while your offer of <strong>${escapeHtml(amount)}</strong> was open.`);
      const released = isEs
        ? '<strong>La retención de PayPal se liberó — no se le cobró nada.</strong> Su banco puede tardar unos días en mostrarlo.'
        : "<strong>PayPal's hold has been released — you were not charged.</strong> Your bank may take a few days to show it.";
      // The owner's own words on a decline (owner, 2026-10-15: like eBay),
      // between the reason and the release line. Expired / sold have none.
      const note = input.kind === 'declined' && input.ownerNote ? [ownerNoteLine(input.ownerNote)] : [];
      const lines = [isEs ? `Hola ${name},` : `Hi ${name},`, why, ...note, released];
      const cta = input.kind === 'item_sold'
        ? button(`${getSiteUrl()}${isEs ? '/es' : ''}/shop`, isEs ? 'Ver la tienda' : 'Browse the shop')
        : button(input.productUrl, isEs ? 'Ver la pieza' : 'View the piece');
      const html = frame(isEs ? 'Su oferta' : 'Your offer', heading, lines.map(p).join('') + cta, isEs);
      const text = [heading, '', ...lines.map(stripTags), '', input.productUrl, '', ...textFooter].join('\n');
      return { subject, html, text };
    }
    case 'countered': {
      const counter = formatCheckoutCurrency(input.counterAmount ?? 0);
      const until = formatOfferDeadline(input.counterExpiresAt ?? null, isEs);
      const subject = isEs ? `Una contraoferta por ${input.productTitle}` : `A counter-offer on ${input.productTitle}`;
      const heading = isEs ? `Podemos hacerlo por ${counter}` : `We can do ${counter}`;
      const lines = [
        isEs
          ? `Hola ${name}, gracias por su oferta de <strong>${escapeHtml(amount)}</strong>. Liberamos la retención de su pago. Esta es nuestra contraoferta:`
          : `Hi ${name}, thanks for your offer of <strong>${escapeHtml(amount)}</strong>. We've released the hold on your payment. Here is our counter-offer:`,
        ...(input.ownerNote ? [ownerNoteLine(input.ownerNote)] : []),
        isEs
          ? `Este precio es solo para usted hasta el <strong>${escapeHtml(until)}</strong>. Es una pieza única, así que es para quien pague primero.`
          : `This price is just for you until <strong>${escapeHtml(until)}</strong>. It's one of a kind, so it goes to whoever pays first.`,
      ];
      const label = isEs ? `Comprar ahora por ${counter}` : `Buy now at ${counter}`;
      const html = frame(isEs ? 'Contraoferta' : 'Counter-offer', heading, lines.map(p).join('') + button(input.counterUrl ?? input.productUrl, label), isEs);
      const text = [heading, '', ...lines.map(stripTags), '', `${label}: ${input.counterUrl ?? input.productUrl}`, '', ...textFooter].join('\n');
      return { subject, html, text };
    }
  }
}

export type OwnerOfferEmailInput = {
  offerId: string;
  productTitle: string;
  inventoryNumber: string | null;
  amount: number;
  listedPrice: number | null;
  total: number;
  shippingMethod: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  message: string | null;
  expiresAt: string | null;
  adminUrl: string;
};

export function buildOwnerOfferEmail(input: OwnerOfferEmailInput): BuiltEmail {
  const amount = formatCheckoutCurrency(input.amount);
  const pct = percentOfListed(input.amount, input.listedPrice);
  const item = input.inventoryNumber ? `${input.productTitle} (#${input.inventoryNumber})` : input.productTitle;
  const listed = input.listedPrice
    ? `Listed at ${formatCheckoutCurrency(input.listedPrice)}${pct != null ? ` (${pct}%)` : ''}.`
    : '';
  const deadline = formatOfferDeadline(input.expiresAt);
  const subject = `New offer: ${amount} on ${input.productTitle}`;
  const contact = `${input.customerName} · ${input.customerPhone} · ${input.customerEmail} · ${shippingMethodLabel(input.shippingMethod)}`;
  const lines = [
    `<strong>${escapeHtml(item)}</strong>`,
    `${escapeHtml(listed)} ${escapeHtml(contact)}`,
    ...(input.message ? [`&ldquo;${escapeHtml(input.message)}&rdquo;`] : []),
    `PayPal is holding <strong>${escapeHtml(formatCheckoutCurrency(input.total))}</strong>. Answer by <strong>${escapeHtml(deadline)}</strong> or it expires.`,
  ];
  const html = frame('NaplesEstateJewelry.com — New Offer', `New offer — ${amount}`, lines.map(p).join('') + button(input.adminUrl, 'Open Offers'), false);
  const text = [
    `New offer — ${amount}`,
    item,
    listed,
    contact,
    ...(input.message ? [`"${input.message}"`] : []),
    `PayPal is holding ${formatCheckoutCurrency(input.total)}. Answer by ${deadline} or it expires.`,
    '',
    `Open Offers: ${input.adminUrl}`,
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}

function ownerNoteLine(note: string): string {
  return `<em>&ldquo;${escapeHtml(note)}&rdquo; — Chris</em>`;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
