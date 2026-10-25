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
 * Twilio's hard cap per message is 1,600 characters; a deal stays under it.
 * Raised from 600 on 2026-10-24 for the Description box — still ONE message
 * (an MMS is billed per message, not by length).
 */
export const DEAL_TEXT_MAX = 1500;
/** How the comparable price reads (owner, 2026-10-24, mockup v1 question 1). Words only — never drawn on a picture. */
export const COMPARABLE_LABEL = 'Comparable retail';

/** One-time confirmation, sent after the web sign-up. Deals start only after YES. */
export function confirmationText(): string {
  return `${BRAND}: Reply YES to get text deals (unlisted pieces, photo + details + price, often at scrap or just above). Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.`;
}

/** The auto-reply to YES — the "opt-in message" on file with Twilio. */
export function optInReplyText(): string {
  return `${BRAND}: You're in. Text deals (photos of unlisted pieces with details and price) will come from this number a few times a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`;
}

/** The HELP text on file with Twilio (Twilio answers HELP itself on US numbers; this is for the record and for tests). */
export function helpText(): string {
  return `${BRAND} text deals. For help, call or text (239) 404-8505 or email info@naplesestatejewelry.com. Reply STOP to cancel.`;
}

/** The polite line for anyone who answers after the piece is spoken for. */
export const DEFAULT_SOLD_REPLY = `${BRAND}: Sorry, that one is spoken for. Next one soon.`;

/** Append the STOP line exactly once (a text the owner wrote may already carry it). */
export function withStopLine(text: string): string {
  const body = text.replace(/\s+/g, ' ').trim();
  return /reply stop/i.test(body) ? body : `${body} ${STOP_LINE}`;
}

/**
 * Sent to the buyer the moment the owner clicks "Mark sold to …" (owner,
 * 2026-09-17): it is theirs, and the owner will follow up on pickup or
 * shipping. Goes out as a picture message like every customer text.
 */
export function winnerText(copy: { title: string; price: string }): string {
  const what = [copy.title, copy.price].map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' - ');
  return withStopLine(`${BRAND}: It's yours - ${what}. We'll text you shortly to arrange pickup at our Naples showroom. Thank you!`);
}

/**
 * Sent to everyone ELSE who received the deal when it is marked sold (owner,
 * 2026-09-17: "so they know it's been taken"). Same words as the late-reply
 * auto-reply the owner chose for the deal, so the two never disagree.
 */
export function soldNoticeText(soldReplyText: string | null | undefined): string {
  return withStopLine(soldReplyText?.trim() || DEFAULT_SOLD_REPLY);
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
export function dealText(copy: DealCopy): string {
  const rows: Array<[string, string | null | undefined]> = [
    ['Item', copy.item],
    ['Metal', copy.metal],
    ['Size', copy.size],
    [COMPARABLE_LABEL, copy.comparable],
    ['Our price', copy.price],
  ];
  const list = rows
    .map(([label, value]) => [label, collapse(value ?? '')] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  const message = collapse(copy.message);
  const closing = /reply stop/i.test(message) ? message : [message, STOP_LINE].filter(Boolean).join('\n');
  const head = `${DEAL_TEXT_HEADING}\n\n${list}`;
  const base = `${head}\n\n${closing}`;

  let description = (copy.description ?? '').replace(/\r\n?/g, '\n').trim();
  const room = DEAL_TEXT_MAX - base.length - 2;
  if (description.length > room) description = room >= 40 ? `${description.slice(0, room - 1).trimEnd()}…` : '';
  const body = description ? `${head}\n\n${description}\n\n${closing}` : base;

  if (body.length <= DEAL_TEXT_MAX) return body;
  return `${body.slice(0, DEAL_TEXT_MAX - STOP_LINE.length - 2).trim()}…\n${STOP_LINE}`;
}

/** What the owner's cell receives when someone replies. */
export function forwardText(input: {
  fromPhone: string;
  name: string | null;
  dealTitle: string | null;
  body: string;
  isFirst: boolean;
}): string {
  const who = input.name ? `${input.name} ${formatUsPhone(input.fromPhone)}` : formatUsPhone(input.fromPhone) || input.fromPhone;
  const about = input.dealTitle ? ` on "${collapse(input.dealTitle)}"` : '';
  const first = input.isFirst ? ' [1st]' : '';
  const body = collapse(input.body) || '(photo or empty message)';
  return `${who}${about}${first}: ${body}`.slice(0, DEAL_TEXT_MAX);
}

export type InboundKind = 'confirm' | 'stop' | 'help' | 'reply';

const CONFIRM_WORDS = new Set(['yes', 'y', 'yeah', 'yep', 'yup', 'si', 'sí', 'start', 'unstop', 'subscribe']);
const STOP_WORDS = new Set(['stop', 'stopall', 'stop all', 'unsubscribe', 'cancel', 'end', 'quit']);
const HELP_WORDS = new Set(['help', 'info']);

/**
 * Case-insensitive, trimmed, trailing punctuation ignored: "YES", "yes",
 * "Yes!", "yes." all confirm. A sentence that merely contains "yes"
 * ("yes I'll take it") is a reply, not a confirmation — the confirmation
 * text asks for the one word, and a longer message is worth forwarding.
 */
export function classifyInbound(body: string | null | undefined): InboundKind {
  const normalized = (body ?? '')
    .toLowerCase()
    .replace(/[‘’'"]/g, '')
    .replace(/[!.?,\s]+$/g, '')
    .replace(/^[\s!.?,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'reply';
  if (STOP_WORDS.has(normalized)) return 'stop';
  if (HELP_WORDS.has(normalized)) return 'help';
  if (CONFIRM_WORDS.has(normalized)) return 'confirm';
  return 'reply';
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
