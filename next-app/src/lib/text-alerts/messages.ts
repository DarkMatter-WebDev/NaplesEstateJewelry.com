/**
 * Text alerts — the words (pure, testable).
 *
 * Every outbound text is composed here so the registration Twilio approved
 * (CHANGELOG 2026-09-15 evening: sample message, opt-in reply, HELP reply)
 * and what actually goes out stay the same words. Keyword matching is what a
 * person types, not what a spec says: "yes", "Yes!", " YES " all confirm.
 */
import { formatUsPhone } from '@/lib/subscriber-phone';

export const BRAND = 'Naples Estate Jewelry';
export const STOP_LINE = 'Reply STOP to opt out.';

/**
 * The subscriber's language (2026-11-22, owner: "give them an option to sign up
 * in Spanish and send them everything translated"). `homepage_subscribers.locale`.
 * Every function below takes it and defaults to English, whose words are
 * unchanged byte for byte. ⛔ Spanish texts still say STOP / HELP: those are
 * the words Twilio acts on. Spanish wording is a draft for the translator.
 */
export type TextLanguage = 'en' | 'es';
export function textLanguage(value: unknown): TextLanguage {
  return value === 'es' ? 'es' : 'en';
}
export const STOP_LINE_ES = 'Responda STOP para cancelar.';
const STOP_PATTERN = /reply stop|responda stop/i;
/**
 * Twilio's hard cap per message is 1,600 characters; a deal stays under it.
 * Raised from 600 on 2026-10-24 for the Description box — still ONE message
 * (an MMS is billed per message, not by length).
 */
export const DEAL_TEXT_MAX = 1500;
/** How the comparable price reads (owner, 2026-10-24, mockup v1 question 1). Words only — never drawn on a picture. */
export const COMPARABLE_LABEL = 'Comparable retail';

/** One-time confirmation, sent after the web sign-up. Deals start only after YES ("Sí" counts too). */
export function confirmationText(language: TextLanguage = 'en'): string {
  if (language === 'es') {
    return `${BRAND}: Responda SÍ para recibir ofertas por texto (piezas que no están en el sitio, con foto, detalles y precio, muchas veces a precio de metal o apenas por encima). Pueden aplicarse tarifas de mensajes y datos. La frecuencia de mensajes varía. Responda STOP para cancelar, HELP para ayuda.`;
  }
  return `${BRAND}: Reply YES to get text deals (unlisted pieces, photo + details + price, often at scrap or just above). Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.`;
}

/** The auto-reply to YES — the "opt-in message" on file with Twilio. */
export function optInReplyText(language: TextLanguage = 'en'): string {
  if (language === 'es') {
    return `${BRAND}: Ya está inscrito. Las ofertas por texto (fotos de piezas que no están en el sitio, con detalles y precio) llegarán desde este número unas cuantas veces al mes. Pueden aplicarse tarifas de mensajes y datos. Responda HELP para ayuda, STOP para cancelar.`;
  }
  return `${BRAND}: You're in. Text deals (photos of unlisted pieces with details and price) will come from this number a few times a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`;
}

/**
 * The HELP text on file with Twilio (Twilio answers HELP itself on US numbers;
 * the English is for the record and for tests). The Spanish one is OURS to
 * send: Twilio does not know "AYUDA".
 */
export function helpText(language: TextLanguage = 'en'): string {
  if (language === 'es') {
    return `${BRAND}, ofertas por texto. Para ayuda, llame o escriba al (239) 404-8505 o escriba a info@naplesestatejewelry.com. Responda STOP para cancelar.`;
  }
  return `${BRAND} text deals. For help, call or text (239) 404-8505 or email info@naplesestatejewelry.com. Reply STOP to cancel.`;
}

/**
 * Sent once when someone stops with a SPANISH word (ALTO, PARAR, …). Twilio
 * answers the English STOP words itself and blocks the number; it does not
 * know the Spanish ones, so the site marks the number stopped and says so.
 */
export function spanishOptOutText(): string {
  return `${BRAND}: No recibirá más mensajes de texto. Para volver a inscribirse, responda SÍ.`;
}

/** The polite line for anyone who answers after the piece is spoken for. */
export const DEFAULT_SOLD_REPLY = `${BRAND}: Sorry, that one is spoken for. Next one soon.`;
export const DEFAULT_SOLD_REPLY_ES = `${BRAND}: Lo sentimos, esa pieza ya fue apartada. Pronto habrá otra.`;

/** The deal's "spoken for" line in a language: the owner's words, or the default. */
export function soldReplyFor(language: TextLanguage, english: string | null | undefined, spanish: string | null | undefined): string {
  if (language === 'es') return spanish?.trim() || DEFAULT_SOLD_REPLY_ES;
  return english?.trim() || DEFAULT_SOLD_REPLY;
}

/** Append the STOP line exactly once (a text the owner wrote may already carry it). */
export function withStopLine(text: string, language: TextLanguage = 'en'): string {
  const body = text.replace(/\s+/g, ' ').trim();
  return STOP_PATTERN.test(body) ? body : `${body} ${language === 'es' ? STOP_LINE_ES : STOP_LINE}`;
}

/**
 * Sent to the buyer the moment the owner clicks "Mark sold to …" (owner,
 * 2026-09-17): it is theirs, and the owner will follow up on pickup or
 * shipping. Goes out as a picture message like every customer text.
 */
export function winnerText(copy: { title: string; price: string }, language: TextLanguage = 'en'): string {
  const what = [copy.title, copy.price].map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' - ');
  if (language === 'es') {
    return withStopLine(`${BRAND}: ¡Es suya! - ${what}. Le escribiremos en breve para coordinar la recogida en nuestra tienda de Naples. ¡Gracias!`, 'es');
  }
  return withStopLine(`${BRAND}: It's yours - ${what}. We'll text you shortly to arrange pickup at our Naples showroom. Thank you!`);
}

/**
 * Sent to everyone ELSE who received the deal when it is marked sold (owner,
 * 2026-09-17: "so they know it's been taken"). Same words as the late-reply
 * auto-reply the owner chose for the deal, so the two never disagree.
 */
export function soldNoticeText(soldReplyText: string | null | undefined, language: TextLanguage = 'en'): string {
  return withStopLine(soldReplyText?.trim() || (language === 'es' ? DEFAULT_SOLD_REPLY_ES : DEFAULT_SOLD_REPLY), language);
}

export type DealCopy = {
  /** What it is, as typed, e.g. "Rope chain · 18.4 g" → "Item: Rope chain · 18.4 g". */
  item: string;
  /** Purity + metal, e.g. "14K Yellow Gold" (`dealMetalLabel` in deal-input); empty = no Metal line. */
  metal?: string | null;
  /** e.g. "22 in"; empty = no Size line. */
  size?: string | null;
  /** Pre-formatted, e.g. "$1,460" → "Our price: $1,460". */
  price: string;
  /** Optional, pre-formatted, e.g. "$2,400" → "Comparable retail: $2,400", the line above Our price. */
  comparable?: string | null;
  /** Optional, line breaks kept; its own paragraph under the list. */
  description?: string | null;
  /** The owner's closing message, e.g. "Not on the website. First reply takes it. Pickup at our Naples showroom." */
  message: string;
};

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The first line of every deal text (layout B, owner 2026-10-24). */
export const DEAL_TEXT_HEADING = `${BRAND} - Text Deal`;
export const DEAL_TEXT_HEADING_ES = `${BRAND} - Oferta por texto`;
export const COMPARABLE_LABEL_ES = 'Precio comparable al detalle';

/** The list labels of a deal text, per language. */
const DEAL_LABELS: Record<TextLanguage, { item: string; metal: string; size: string; comparable: string; price: string }> = {
  en: { item: 'Item', metal: 'Metal', size: 'Size', comparable: COMPARABLE_LABEL, price: 'Our price' },
  es: { item: 'Artículo', metal: 'Metal', size: 'Medida', comparable: COMPARABLE_LABEL_ES, price: 'Nuestro precio' },
};

/**
 * The deal text that rides with the pictures — layout B, "full list" (owner,
 * 2026-10-24, mockup v2: "Build layout B (full list) with 'Our price'"):
 *
 *   Naples Estate Jewelry - Text Deal
 *
 *   Item: Rope chain · 18.4 g
 *   Metal: 14K Yellow Gold
 *   Size: 22 in
 *   Comparable retail: $2,400
 *   Our price: $1,460
 *
 *   <description>
 *
 *   <closing message>
 *   Reply STOP to opt out.
 *
 * One fact per line because a text carries no styling — line breaks are the
 * only layout that survives Twilio and the phone. A box left empty (no size,
 * "Other / leave off", no comparable price) is not listed. The STOP line is
 * its own last line, never duplicated when the owner already typed it. A
 * text over the cap loses the end of the description first, never the list,
 * the closing message or STOP.
 */
export function dealText(copy: DealCopy, language: TextLanguage = 'en'): string {
  const labels = DEAL_LABELS[language];
  const stopLine = language === 'es' ? STOP_LINE_ES : STOP_LINE;
  const rows: Array<[string, string | null | undefined]> = [
    [labels.item, copy.item],
    [labels.metal, copy.metal],
    [labels.size, copy.size],
    [labels.comparable, copy.comparable],
    [labels.price, copy.price],
  ];
  const list = rows
    .map(([label, value]) => [label, collapse(value ?? '')] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  const message = collapse(copy.message);
  const closing = STOP_PATTERN.test(message) ? message : [message, stopLine].filter(Boolean).join('\n');
  const head = `${language === 'es' ? DEAL_TEXT_HEADING_ES : DEAL_TEXT_HEADING}\n\n${list}`;
  const base = `${head}\n\n${closing}`;

  let description = (copy.description ?? '').replace(/\r\n?/g, '\n').trim();
  const room = DEAL_TEXT_MAX - base.length - 2;
  if (description.length > room) description = room >= 40 ? `${description.slice(0, room - 1).trimEnd()}…` : '';
  const body = description ? `${head}\n\n${description}\n\n${closing}` : base;

  if (body.length <= DEAL_TEXT_MAX) return body;
  return `${body.slice(0, DEAL_TEXT_MAX - stopLine.length - 2).trim()}…\n${stopLine}`;
}

/** What the owner's cell receives when someone replies. "(ES)" after the number = answer in Spanish. */
export function forwardText(input: {
  fromPhone: string;
  name: string | null;
  dealTitle: string | null;
  body: string;
  isFirst: boolean;
  spanish?: boolean;
}): string {
  const base = input.name ? `${input.name} ${formatUsPhone(input.fromPhone)}` : formatUsPhone(input.fromPhone) || input.fromPhone;
  const who = input.spanish ? `${base} (ES)` : base;
  const about = input.dealTitle ? ` on "${collapse(input.dealTitle)}"` : '';
  const first = input.isFirst ? ' [1st]' : '';
  const body = collapse(input.body) || '(photo or empty message)';
  return `${who}${about}${first}: ${body}`.slice(0, DEAL_TEXT_MAX);
}

export type InboundKind = 'confirm' | 'stop' | 'help' | 'reply';

const CONFIRM_WORDS = new Set(['yes', 'y', 'yeah', 'yep', 'yup', 'si', 'sí', 'start', 'unstop', 'subscribe']);
/** The English stop words — Twilio answers these itself and blocks the number. */
const STOP_WORDS = new Set(['stop', 'stopall', 'stop all', 'unsubscribe', 'cancel', 'end', 'quit']);
/** Spanish stop words (2026-11-22): Twilio does not know them, so WE mark the number stopped and answer once. */
const STOP_WORDS_ES = new Set(['alto', 'parar', 'pare', 'cancelar', 'detener', 'darme de baja']);
const HELP_WORDS = new Set(['help', 'info']);
/** "AYUDA": Twilio does not answer it, so the site sends the Spanish help line. */
const HELP_WORDS_ES = new Set(['ayuda']);

function normalizeInbound(body: string | null | undefined): string {
  return (body ?? '')
    .toLowerCase()
    .replace(/[‘’'"¡¿]/g, '')
    .replace(/[!.?,\s]+$/g, '')
    .replace(/^[\s!.?,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Case-insensitive, trimmed, trailing punctuation ignored: "YES", "yes",
 * "Yes!", "yes." all confirm. A sentence that merely contains "yes"
 * ("yes I'll take it") is a reply, not a confirmation — the confirmation
 * text asks for the one word, and a longer message is worth forwarding.
 */
export function classifyInbound(body: string | null | undefined): InboundKind {
  const normalized = normalizeInbound(body);
  if (!normalized) return 'reply';
  if (STOP_WORDS.has(normalized) || STOP_WORDS_ES.has(normalized)) return 'stop';
  if (HELP_WORDS.has(normalized) || HELP_WORDS_ES.has(normalized)) return 'help';
  if (CONFIRM_WORDS.has(normalized)) return 'confirm';
  return 'reply';
}

/** True for a Spanish stop / help word — the ones Twilio does not answer, so the site does. */
export function isSpanishKeyword(body: string | null | undefined): boolean {
  const normalized = normalizeInbound(body);
  return STOP_WORDS_ES.has(normalized) || HELP_WORDS_ES.has(normalized);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * TwiML for a webhook response: an empty <Response/> or one <Message>. With
 * `mediaUrl` the message is an MMS (<Body> + <Media>), which keeps it in the
 * same phone thread as the picture deals — see `brandMediaUrl()` in config.
 */
export function twiml(message?: string | null, mediaUrl?: string | null): string {
  if (!message) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const body = escapeXml(message);
  const inner = mediaUrl ? `<Body>${body}</Body><Media>${escapeXml(mediaUrl)}</Media>` : body;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${inner}</Message></Response>`;
}
