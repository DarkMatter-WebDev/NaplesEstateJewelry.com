/**
 * Follow-ups (owner, 2026-11-24, mockup 1 "Yes, build it" with style A and the
 * default answers): one thank-you email after every buy receipt (sellers) and
 * every paid order (shop buyers), a later step 2 for each that starts OFF, a
 * queue the owner can step into, and a log. Admin → Follow-ups.
 *
 * This file is the pure part — timing, wording, rendering, readiness rules —
 * so all of it is tested without a database. The database / sending half is
 * `lib/follow-ups-server.ts`.
 *
 * ⛔ Google's review policy: every seller / buyer gets the SAME email. The
 * review is asked "if you have a minute", never "if you enjoyed it", and there
 * is no happy → Google / unhappy → private split ("review gating"). No reward
 * for reviewing (FTC 16 CFR 465). The review link is in step 1 only.
 */

import { escapeHtml } from '@/lib/marketing-email-html';
import { formatSocialScheduleInput, parseSocialScheduleInput } from '@/lib/social-queue-schedule';

export const FOLLOW_UPS_SQL_FILE = 'supabase/follow-ups-2026-11.sql';

export type FollowUpAudience = 'seller' | 'buyer';
export type FollowUpStep = 1 | 2;
export type FollowUpLanguage = 'en' | 'es';

export const FOLLOW_UP_STATUSES = ['waiting', 'scheduled', 'sending', 'sent', 'skipped', 'not_sent', 'failed', 'cancelled'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_DELAYS = ['next_morning', '24h', '48h', '72h'] as const;
export type FollowUpDelay = (typeof FOLLOW_UP_DELAYS)[number];

export const FOLLOW_UP_DELAY_LABELS: Record<FollowUpDelay, string> = {
  next_morning: 'Next morning at 10:00 AM',
  '24h': '24 hours later',
  '48h': '2 days later',
  '72h': '3 days later',
};

/** 10:00 AM Eastern — "the next morning". */
export const FOLLOW_UP_SEND_HOUR = 10;
/** Hour-based delays that land outside 9 AM – 6 PM Eastern move to the next 10 AM. */
export const FOLLOW_UP_QUIET_BEFORE = 9;
export const FOLLOW_UP_QUIET_FROM = 18;
/** One thank-you (step 1) per email address in this many days. */
export const FOLLOW_UP_REPEAT_DAYS = 90;
/** A buy / sale older than this is never scheduled automatically (owner default 5). */
export const FOLLOW_UP_DISCOVERY_DAYS = 14;
/** Orders are looked at this far back, so a slow delivery still gets its thank-you. */
export const FOLLOW_UP_ORDER_LOOKBACK_DAYS = 30;
/** Shipped with no "Delivered" from the carrier → thank them this long after shipping. */
export const FOLLOW_UP_DELIVERY_FALLBACK_DAYS = 7;
/** Step 2: sellers 6 months after the thank-you, buyers 30 days. */
export const FOLLOW_UP_STEP2_DAYS: Record<FollowUpAudience, number> = { seller: 182, buyer: 30 };
/** Step-2 rows appear in Upcoming this many days before they are due. */
export const FOLLOW_UP_STEP2_LOOKAHEAD_DAYS = 7;

const DAY_MS = 24 * 3600_000;

// ---- Settings ---------------------------------------------------------------

export type FollowUpTemplate = { subject: string; body: string };
export type FollowUpTemplateKey = `${FollowUpAudience}-${FollowUpStep}-${FollowUpLanguage}`;

export type FollowUpSettings = {
  autoSend: boolean;
  sellerStep1: boolean;
  sellerStep2: boolean;
  buyerStep1: boolean;
  buyerStep2: boolean;
  sellerDelay: FollowUpDelay;
  buyerDelay: FollowUpDelay;
  /** Only the templates the owner edited; the rest use DEFAULT_FOLLOW_UP_TEMPLATES. */
  templates: Partial<Record<FollowUpTemplateKey, FollowUpTemplate>>;
  startedAt: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
};

export const DEFAULT_FOLLOW_UP_SETTINGS: FollowUpSettings = {
  autoSend: true,
  sellerStep1: true,
  sellerStep2: false,
  buyerStep1: true,
  buyerStep2: false,
  sellerDelay: 'next_morning',
  buyerDelay: 'next_morning',
  templates: {},
  startedAt: null,
  updatedAt: null,
  updatedByEmail: null,
};

export function normalizeDelay(value: unknown): FollowUpDelay {
  return (FOLLOW_UP_DELAYS as readonly string[]).includes(value as string) ? (value as FollowUpDelay) : 'next_morning';
}

export function isTemplateKey(value: unknown): value is FollowUpTemplateKey {
  return typeof value === 'string' && /^(seller|buyer)-(1|2)-(en|es)$/.test(value);
}

/** Keeps only well-formed, non-empty templates. */
export function normalizeTemplates(value: unknown): FollowUpSettings['templates'] {
  const out: FollowUpSettings['templates'] = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isTemplateKey(key) || !raw || typeof raw !== 'object') continue;
    const subject = String((raw as { subject?: unknown }).subject ?? '').trim();
    const body = String((raw as { body?: unknown }).body ?? '').replace(/\r\n/g, '\n').trim();
    if (subject && body) out[key] = { subject: subject.slice(0, FOLLOW_UP_SUBJECT_MAX), body: body.slice(0, FOLLOW_UP_BODY_MAX) };
  }
  return out;
}

export const FOLLOW_UP_SUBJECT_MAX = 150;
export const FOLLOW_UP_BODY_MAX = 4000;

export function settingsFromRow(row: Record<string, unknown> | null | undefined): FollowUpSettings {
  if (!row) return { ...DEFAULT_FOLLOW_UP_SETTINGS };
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    autoSend: bool(row.auto_send, true),
    sellerStep1: bool(row.seller_step1, true),
    sellerStep2: bool(row.seller_step2, false),
    buyerStep1: bool(row.buyer_step1, true),
    buyerStep2: bool(row.buyer_step2, false),
    sellerDelay: normalizeDelay(row.seller_delay),
    buyerDelay: normalizeDelay(row.buyer_delay),
    templates: normalizeTemplates(row.templates),
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    updatedByEmail: typeof row.updated_by_email === 'string' ? row.updated_by_email : null,
  };
}

export type FollowUpSettingsPatch = Partial<Pick<FollowUpSettings, 'autoSend' | 'sellerStep1' | 'sellerStep2' | 'buyerStep1' | 'buyerStep2' | 'sellerDelay' | 'buyerDelay'>> & {
  /** One template to save; `null` resets that one to the default. */
  template?: { key: FollowUpTemplateKey; value: FollowUpTemplate | null };
};

/** Validates an admin PATCH body. Returns the column updates, or an error. */
export function settingsPatchToRow(
  body: unknown,
  current: FollowUpSettings,
): { row: Record<string, unknown> } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Nothing to save.' };
  const input = body as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  const flags: Array<[keyof FollowUpSettings, string]> = [
    ['autoSend', 'auto_send'],
    ['sellerStep1', 'seller_step1'],
    ['sellerStep2', 'seller_step2'],
    ['buyerStep1', 'buyer_step1'],
    ['buyerStep2', 'buyer_step2'],
  ];
  for (const [key, column] of flags) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') return { error: `${key} must be on or off.` };
    row[column] = input[key];
  }
  for (const [key, column] of [['sellerDelay', 'seller_delay'], ['buyerDelay', 'buyer_delay']] as const) {
    if (input[key] === undefined) continue;
    if (!(FOLLOW_UP_DELAYS as readonly string[]).includes(input[key] as string)) return { error: 'Pick a delay from the list.' };
    row[column] = input[key];
  }
  if (input.template !== undefined) {
    const template = input.template as { key?: unknown; value?: unknown } | null;
    if (!template || !isTemplateKey(template.key)) return { error: 'Unknown email.' };
    const next = { ...current.templates };
    if (template.value === null) {
      delete next[template.key];
    } else {
      const value = template.value as { subject?: unknown; body?: unknown } | undefined;
      const subject = String(value?.subject ?? '').trim();
      const text = String(value?.body ?? '').replace(/\r\n/g, '\n').trim();
      if (!subject) return { error: 'The subject line is empty.' };
      if (!text) return { error: 'The email text is empty.' };
      if (subject.length > FOLLOW_UP_SUBJECT_MAX) return { error: `Keep the subject under ${FOLLOW_UP_SUBJECT_MAX} characters.` };
      if (text.length > FOLLOW_UP_BODY_MAX) return { error: `Keep the email under ${FOLLOW_UP_BODY_MAX} characters.` };
      const unknownToken = findUnknownToken(`${subject}\n${text}`);
      if (unknownToken) return { error: `${unknownToken} is not a fill-in word. Use one from the list under the box.` };
      next[template.key] = { subject, body: text };
    }
    row.templates = next;
  }
  if (Object.keys(row).length === 0) return { error: 'Nothing to save.' };
  return { row };
}

export function stepEnabled(settings: FollowUpSettings, audience: FollowUpAudience, step: FollowUpStep): boolean {
  if (audience === 'seller') return step === 1 ? settings.sellerStep1 : settings.sellerStep2;
  return step === 1 ? settings.buyerStep1 : settings.buyerStep2;
}

export function delayFor(settings: FollowUpSettings, audience: FollowUpAudience): FollowUpDelay {
  return audience === 'seller' ? settings.sellerDelay : settings.buyerDelay;
}

// ---- Time (Eastern) ---------------------------------------------------------

/** "2026-11-24" — the calendar date in Naples. */
export function easternDate(value: Date): string {
  return formatSocialScheduleInput(value).slice(0, 10);
}

function easternHour(value: Date): number {
  return Number(formatSocialScheduleInput(value).slice(11, 13));
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for an Eastern calendar date. */
function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function atSendHour(date: string): Date {
  const hh = String(FOLLOW_UP_SEND_HOUR).padStart(2, '0');
  const parsed = parseSocialScheduleInput(`${date}T${hh}:00`);
  if (!parsed) throw new Error(`Could not place ${date} 10:00 in Eastern time.`);
  return parsed;
}

/** 10:00 AM Eastern on the next calendar day after `event`; a Sunday moves to Monday. */
export function nextMorningAfter(event: Date): Date {
  let date = addCalendarDays(easternDate(event), 1);
  if (weekdayOf(date) === 0) date = addCalendarDays(date, 1);
  return atSendHour(date);
}

/** The first 10:00 AM Eastern (Monday–Saturday) at or after `t`. */
export function nextSlotAtOrAfter(t: Date): Date {
  let date = easternDate(t);
  for (let i = 0; i < 9; i += 1) {
    if (weekdayOf(date) !== 0) {
      const slot = atSendHour(date);
      if (slot.getTime() >= t.getTime()) return slot;
    }
    date = addCalendarDays(date, 1);
  }
  throw new Error('Could not find the next send time.');
}

/**
 * When a thank-you goes out.
 * - next_morning: 10 AM the day after the visit (Sunday → Monday).
 * - 24h / 48h / 72h: that long after; outside 9 AM – 6 PM or on a Sunday it
 *   moves to the next 10 AM.
 * - Either way, a time already past (found late, or a backfill) becomes the
 *   next 10 AM from now — never a burst at 9 PM.
 */
export function computeSendAt(event: Date, delay: FollowUpDelay, now: Date): Date {
  let base: Date;
  if (delay === 'next_morning') {
    base = nextMorningAfter(event);
  } else {
    const hours = delay === '24h' ? 24 : delay === '48h' ? 48 : 72;
    base = new Date(event.getTime() + hours * 3600_000);
    const hour = easternHour(base);
    if (weekdayOf(easternDate(base)) === 0 || hour < FOLLOW_UP_QUIET_BEFORE || hour >= FOLLOW_UP_QUIET_FROM) {
      base = nextSlotAtOrAfter(base);
    }
  }
  return base.getTime() < now.getTime() ? nextSlotAtOrAfter(now) : base;
}

/** Step 2: its delay after the thank-you went out, at the next 10 AM. */
export function step2SendAt(step1SentAt: Date, audience: FollowUpAudience): Date {
  return nextSlotAtOrAfter(new Date(step1SentAt.getTime() + FOLLOW_UP_STEP2_DAYS[audience] * DAY_MS));
}

const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "today" / "yesterday" / "on Monday" / "recently" — the visit, seen from the send day. */
export function relativeDayWord(event: Date | null, send: Date, language: FollowUpLanguage): string {
  if (!event) return language === 'es' ? 'hace poco' : 'recently';
  const eventDate = easternDate(event);
  const sendDate = easternDate(send);
  const [ey, em, ed] = eventDate.split('-').map(Number);
  const [sy, sm, sd] = sendDate.split('-').map(Number);
  const days = Math.round((Date.UTC(sy, sm - 1, sd) - Date.UTC(ey, em - 1, ed)) / DAY_MS);
  if (days <= 0) return language === 'es' ? 'hoy' : 'today';
  if (days === 1) return language === 'es' ? 'ayer' : 'yesterday';
  if (days < 7) {
    const weekday = weekdayOf(eventDate);
    return language === 'es' ? `el ${WEEKDAYS_ES[weekday]}` : `on ${WEEKDAYS_EN[weekday]}`;
  }
  return language === 'es' ? 'hace poco' : 'recently';
}

// ---- Wording ----------------------------------------------------------------

export const FOLLOW_UP_TOKENS: Array<{ token: string; help: string }> = [
  { token: '{first_name}', help: 'Their first name ("there" / nothing if we have no name)' },
  { token: '{when}', help: 'today · yesterday · on Monday · recently' },
  { token: '{item}', help: 'Buyers: the piece they bought ("14K rope chain and 1 more piece")' },
  { token: '{phone}', help: '(239) 404-8505' },
  { token: '{review_link}', help: 'The Google review link, as the words "share your experience on Google"' },
];

const KNOWN_TOKENS = new Set(FOLLOW_UP_TOKENS.map((entry) => entry.token));

/** The first `{word}` that is not a fill-in word, or null. */
export function findUnknownToken(text: string): string | null {
  for (const match of text.matchAll(/\{[^{}\s]{1,40}\}/g)) {
    if (!KNOWN_TOKENS.has(match[0])) return match[0];
  }
  return null;
}

/**
 * The built-in wording (mockup 1, style A — "a note from Chris"). The owner can
 * edit any of them in Admin → Follow-ups → Edit emails; an edit is stored in
 * `follow_up_settings.templates` and "Reset to ours" removes it.
 * Spanish: written here, ◻ translator review open (TASKS).
 */
export const DEFAULT_FOLLOW_UP_TEMPLATES: Record<FollowUpTemplateKey, FollowUpTemplate> = {
  'seller-1-en': {
    subject: 'Thank you, {first_name}',
    body: [
      'Hi {first_name},',
      'Thank you for coming in {when} and trusting us with your jewelry. I hope the visit was easy and that you left feeling you were treated fairly.',
      "If any question comes up about your receipt — or you find more pieces you'd like us to look at — just reply to this email, or call or text me at {phone}.",
      'And if you have a minute, a few words about your visit on Google would mean a lot. It helps other families in Naples find someone they can trust: {review_link}.',
      'Thank you again,\nChris',
    ].join('\n\n'),
  },
  'seller-1-es': {
    subject: 'Gracias, {first_name}',
    body: [
      'Hola {first_name}:',
      'Gracias por visitarnos {when} y por confiarnos sus joyas. Espero que la visita haya sido sencilla y que se haya ido sintiendo que lo tratamos con justicia.',
      'Si le surge cualquier pregunta sobre su recibo — o encuentra más piezas que quiera que veamos — simplemente responda a este correo, o llámeme o envíeme un mensaje de texto al {phone}.',
      'Y si tiene un minuto, unas palabras sobre su visita en Google significarían mucho. Ayudan a otras familias de Naples a encontrar a alguien de confianza: {review_link}.',
      'Gracias de nuevo,\nChris',
    ].join('\n\n'),
  },
  'seller-2-en': {
    subject: "Whenever you're ready",
    body: [
      'Hi {first_name},',
      "It's been a few months since your visit, and I wanted to say thank you again. If you come across more jewelry, gold, silver or coins you'd like looked at, I'm here — come by the showroom during store hours, or ask about a home visit.",
      'Just reply to this email, or call or text me at {phone}.',
      'Chris',
    ].join('\n\n'),
  },
  'seller-2-es': {
    subject: 'Cuando usted guste',
    body: [
      'Hola {first_name}:',
      'Han pasado unos meses desde su visita y quería darle las gracias de nuevo. Si encuentra más joyas, oro, plata o monedas que quiera que veamos, aquí estoy — venga a la tienda en nuestro horario o pregunte por una visita a domicilio.',
      'Solo responda a este correo, o llámeme o envíeme un mensaje de texto al {phone}.',
      'Chris',
    ].join('\n\n'),
  },
  'buyer-1-en': {
    subject: 'Thank you, {first_name} — I hope you love it',
    body: [
      'Hi {first_name},',
      "Thank you for buying your {item} from us. I hope it's everything you hoped for.",
      "If anything isn't right, or you have a question about it, just reply to this email or call or text me at {phone}.",
      'And if you have a minute, a few words on Google would mean a lot — it helps other people find us: {review_link}.',
      'Thank you again,\nChris',
    ].join('\n\n'),
  },
  'buyer-1-es': {
    subject: 'Gracias, {first_name} — espero que le encante',
    body: [
      'Hola {first_name}:',
      'Gracias por comprarnos su {item}. Espero que sea todo lo que esperaba.',
      'Si algo no está bien, o tiene alguna pregunta, simplemente responda a este correo o llámeme o envíeme un mensaje de texto al {phone}.',
      'Y si tiene un minuto, unas palabras en Google significarían mucho — ayudan a otras personas a encontrarnos: {review_link}.',
      'Gracias de nuevo,\nChris',
    ].join('\n\n'),
  },
  'buyer-2-en': {
    subject: 'Caring for your {item}',
    body: [
      'Hi {first_name},',
      "A month in — I hope you're enjoying your {item}. A few simple things keep a piece looking its best:",
      "Store it on its own in a soft pouch or a lined box so it doesn't scratch other pieces. Take it off before swimming, cleaning with household chemicals, or putting on lotion. For most gold, warm water with a drop of mild dish soap and a soft cloth is all it needs.",
      'If it ever needs a professional clean or a check of the clasp, bring it by — or call or text me at {phone}.',
      'Chris',
    ].join('\n\n'),
  },
  'buyer-2-es': {
    subject: 'Cómo cuidar su {item}',
    body: [
      'Hola {first_name}:',
      'Ya pasó un mes — espero que esté disfrutando su {item}. Algunas cosas sencillas mantienen una pieza como nueva:',
      'Guárdela por separado en una bolsita suave o una caja forrada para que no raye otras piezas. Quítesela antes de nadar, de limpiar con productos químicos o de ponerse crema. Para la mayoría del oro, basta con agua tibia, una gota de jabón suave para platos y un paño suave.',
      'Si alguna vez necesita una limpieza profesional o revisar el broche, tráigala — o llámeme o envíeme un mensaje de texto al {phone}.',
      'Chris',
    ].join('\n\n'),
  },
};

export function templateKey(audience: FollowUpAudience, step: FollowUpStep, language: FollowUpLanguage): FollowUpTemplateKey {
  return `${audience}-${step}-${language}`;
}

export function templateFor(settings: FollowUpSettings, audience: FollowUpAudience, step: FollowUpStep, language: FollowUpLanguage): FollowUpTemplate {
  const key = templateKey(audience, step, language);
  return settings.templates[key] ?? DEFAULT_FOLLOW_UP_TEMPLATES[key];
}

/** "MARGARET ELLISON" → "Margaret"; "mary-ann o'neil" → "Mary-Ann"; empty → null. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first || !/\p{L}/u.test(first)) return null;
  const isAllOneCase = first === first.toUpperCase() || first === first.toLowerCase();
  if (!isAllOneCase) return first;
  return first.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`);
}

/** "14K rope chain" / "14K rope chain and 2 more pieces" / "piece". */
export function itemPhrase(titles: Array<string | null | undefined>, language: FollowUpLanguage): string {
  const clean = titles.map((title) => String(title ?? '').trim()).filter(Boolean);
  if (clean.length === 0) return language === 'es' ? 'pieza' : 'piece';
  const first = clean[0].length > 80 ? `${clean[0].slice(0, 77).trimEnd()}…` : clean[0];
  const more = clean.length - 1;
  if (more === 0) return first;
  if (language === 'es') return `${first} y ${more} ${more === 1 ? 'pieza más' : 'piezas más'}`;
  return `${first} and ${more} more ${more === 1 ? 'piece' : 'pieces'}`;
}

const REVIEW_WORDS: Record<FollowUpLanguage, string> = {
  en: 'share your experience on Google',
  es: 'compartir su experiencia en Google',
};

const FOOTER_WORDS: Record<FollowUpLanguage, { seller: string; buyer: string; unsubscribe: string }> = {
  en: {
    seller: "You're receiving this because you sold to us.",
    buyer: "You're receiving this because you bought from us.",
    unsubscribe: 'Unsubscribe',
  },
  es: {
    seller: 'Recibe este correo porque nos vendió.',
    buyer: 'Recibe este correo porque nos compró.',
    unsubscribe: 'Cancelar suscripción',
  },
};

export type FollowUpRenderInput = {
  audience: FollowUpAudience;
  language: FollowUpLanguage;
  name: string | null;
  eventAt: Date | null;
  sendAt: Date;
  item: string | null;
  phone: string;
  reviewUrl: string;
  unsubscribeUrl: string;
  businessName: string;
  mailingAddress: string;
};

export type RenderedFollowUp = { subject: string; html: string; text: string };

function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{[a-z_]+\}/g, (token) => (token in values ? values[token] : token));
}

/** Tidies what a missing name leaves behind: "Hola :" → "Hola:", double spaces → one. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+([,:;.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** The email as it goes out: style A (a plain note), the footer added here. */
export function renderFollowUp(template: FollowUpTemplate, input: FollowUpRenderInput): RenderedFollowUp {
  const firstName = firstNameOf(input.name);
  const when = relativeDayWord(input.eventAt, input.sendAt, input.language);
  const item = input.item ?? itemPhrase([], input.language);
  const reviewWords = REVIEW_WORDS[input.language];
  const footer = FOOTER_WORDS[input.language];

  const plainValues: Record<string, string> = {
    '{first_name}': firstName ?? (input.language === 'es' ? '' : 'there'),
    '{when}': when,
    '{item}': item,
    '{phone}': input.phone,
  };

  // Subject: plain text, and a missing name drops cleanly ("Thank you, " → "Thank you").
  const subjectRaw = fillTokens(template.subject, { ...plainValues, '{first_name}': firstName ?? '', '{review_link}': reviewWords });
  const subject = subjectRaw.replace(/,\s*(—|$)/, (_m, dash: string) => (dash ? ` ${dash}` : '')).replace(/\s{2,}/g, ' ').trim();

  const paragraphs = template.body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const textParagraphs = paragraphs.map((paragraph) =>
    tidy(fillTokens(paragraph, { ...plainValues, '{review_link}': `${reviewWords} (${input.reviewUrl})` })),
  );
  const text = [
    ...textParagraphs,
    '—',
    `${input.businessName} · ${input.mailingAddress}`,
    footer[input.audience],
    `${footer.unsubscribe}: ${input.unsubscribeUrl}`,
  ].join('\n\n');

  const link = `<a href="${escapeHtml(input.reviewUrl)}" style="color:#735c00;text-decoration:underline;">${escapeHtml(reviewWords)}</a>`;
  // The link goes in AFTER escaping, through a marker escaping leaves alone.
  const marker = '\u0000review\u0000';
  const paragraphStyle = 'margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#222222;';
  const htmlParagraphs = paragraphs.map((paragraph) => {
    const lines = tidy(fillTokens(paragraph, { ...plainValues, '{review_link}': marker })).split('\n').map((line) => line.trim());
    const rendered = lines.map((line) => {
      if (line === 'Chris') return `<span style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#222222;">Chris</span>`;
      return escapeHtml(line).split(marker).join(link);
    });
    return `<p style="${paragraphStyle}">${rendered.join('<br />')}</p>`;
  });

  const html = `<!DOCTYPE html><html lang="${input.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:28px 22px 24px;">
${htmlParagraphs.join('\n')}
<p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#666666;">${escapeHtml(input.businessName)} &middot; <span style="white-space:nowrap;">${escapeHtml(input.phone)}</span></p>
<hr style="border:0;border-top:1px solid #e7dfcf;margin:26px 0 14px;" />
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#6f675c;">${escapeHtml(input.businessName)}<br />${escapeHtml(input.mailingAddress)}<br />${escapeHtml(footer[input.audience])} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#735c00;">${escapeHtml(footer.unsubscribe)}</a></p>
</div>
</body></html>`;

  return { subject, html, text };
}

// ---- Buyer readiness --------------------------------------------------------

export type BuyerOrderState = {
  paymentStatus: string | null;
  orderStatus: string | null;
  fulfillmentStatus: string | null;
  shippingMethod: string | null;
  deletedAt: string | null;
  createdAt: string;
  /** From the Local Pickup log, when one was logged. */
  pickedUpAt: string | null;
  /** When the tracking row was created (≈ when it shipped). */
  trackingCreatedAt: string | null;
  /** The carrier's "Delivered" time (raw EasyPost datetime). */
  deliveredAt: string | null;
};

export type BuyerReadiness =
  | { kind: 'ready'; eventAt: Date }
  | { kind: 'waiting'; reason: 'pickup' | 'shipping' | 'delivery' }
  | { kind: 'cancelled'; reason: string };

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Is a buyer's order ready for its thank-you, and what day does it thank them for?
 * - picked up (incl. in-store): the pickup-log time, else when the order was
 *   made (first look) or now (it was waiting and just turned "picked up");
 * - shipped: the carrier's Delivered time; with none, 7 days after shipping;
 * - pending / packed: waiting; cancelled / refunded / deleted: cancelled.
 */
export function buyerReadiness(order: BuyerOrderState, now: Date, options: { firstLook: boolean; waitingSince: string | null }): BuyerReadiness {
  if (order.deletedAt) return { kind: 'cancelled', reason: 'The order was deleted.' };
  if (order.paymentStatus !== 'paid') return { kind: 'cancelled', reason: `The order is ${String(order.paymentStatus ?? 'not paid').replace(/_/g, ' ')}.` };
  if (order.orderStatus === 'cancelled' || order.orderStatus === 'refunded') return { kind: 'cancelled', reason: `The order was ${order.orderStatus}.` };
  if (order.fulfillmentStatus === 'cancelled') return { kind: 'cancelled', reason: 'The order was cancelled.' };

  if (order.fulfillmentStatus === 'picked_up') {
    const logged = parseTime(order.pickedUpAt);
    if (logged) return { kind: 'ready', eventAt: logged };
    return { kind: 'ready', eventAt: options.firstLook ? parseTime(order.createdAt) ?? now : now };
  }

  if (order.fulfillmentStatus === 'shipped') {
    const delivered = parseTime(order.deliveredAt);
    if (delivered) return { kind: 'ready', eventAt: delivered };
    const shippedSince = parseTime(order.trackingCreatedAt) ?? parseTime(options.waitingSince) ?? (options.firstLook ? parseTime(order.createdAt) : null) ?? now;
    const fallback = new Date(shippedSince.getTime() + FOLLOW_UP_DELIVERY_FALLBACK_DAYS * DAY_MS);
    if (fallback.getTime() <= now.getTime()) return { kind: 'ready', eventAt: fallback };
    return { kind: 'waiting', reason: 'delivery' };
  }

  return { kind: 'waiting', reason: order.shippingMethod === 'shipping' ? 'shipping' : 'pickup' };
}

export const WAIT_REASON_LABELS: Record<'pickup' | 'shipping' | 'delivery', string> = {
  pickup: 'Waits for pickup',
  shipping: 'Waits for it to ship',
  delivery: 'Waits for "Delivered", then 10 AM next morning',
};

/** True when a step-1 email went to this address within the repeat window before `at`. */
export function thankedRecently(sentAt: Array<string | null | undefined>, at: Date): Date | null {
  let latest: Date | null = null;
  for (const value of sentAt) {
    const sent = parseTime(value);
    if (!sent) continue;
    if (at.getTime() - sent.getTime() < FOLLOW_UP_REPEAT_DAYS * DAY_MS && sent.getTime() <= at.getTime()) {
      if (!latest || sent > latest) latest = sent;
    }
  }
  return latest;
}

/** "Wed Nov 25, 10:00 AM" (Eastern). */
export function formatFollowUpTime(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseTime(value ?? null);
  if (!date) return '—';
  const local = formatSocialScheduleInput(date);
  const [datePart, timePart] = local.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const weekday = WEEKDAYS_EN[weekdayOf(datePart)].slice(0, 3);
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
  const [hh, mm] = timePart.split(':').map(Number);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  const thisYear = easternDate(new Date()).slice(0, 4) === String(year);
  return `${weekday} ${monthName} ${day}${thisYear ? '' : `, ${year}`}, ${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export const FOLLOW_UP_AUDIENCE_LABEL: Record<FollowUpAudience, string> = { seller: 'Seller', buyer: 'Buyer' };

export function stepName(audience: FollowUpAudience, step: FollowUpStep): string {
  if (step === 1) return audience === 'seller' ? 'Thank you for coming in' : 'Thank you for your purchase';
  return audience === 'seller' ? "Whenever you're ready again" : 'Care tips for your piece';
}
