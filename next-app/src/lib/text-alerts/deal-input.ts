/**
 * The owner's deal form → a clean row (pure, testable).
 * The prices are stored as typed but normalised to "$1,460" when a bare number
 * comes in; the message has a default the owner can edit per deal.
 *
 * Since 2026-10-24 (owner, mockup v1: "build it as drawn") a deal also has a
 * Comparable price (optional, "Comparable retail: $2,400" in the words only),
 * Metal + Purity (must-pick, with "Other / leave off"), an optional Size /
 * length and an optional Description (up to 1,000 characters, line breaks
 * kept). The line drawn on the pictures is BUILT from Purity + Metal + What
 * it is + Size (`dealLine`), so the owner no longer types the metal into it.
 *
 * Photos may come first: a draft saves with nothing typed
 * (`normalizeDealDraft`); what a deal needs is checked only when its pictures
 * are rendered (`dealReadyProblem`, called by Preview, the test and the send).
 *
 * ⛔ Text deals are PICKUP ONLY (owner, 2026-10-07: "remove or we ship.. we
 * dont want to ship these quick deals"). No text this feature writes by
 * itself may offer shipping — `lib/__tests__/text-alerts.test.ts` guards it.
 */
export const DEFAULT_DEAL_MESSAGE = 'Not on the website. First reply takes it. Pickup at our Naples showroom.';
export const DEAL_TITLE_MAX = 80;
export const DEAL_PRICE_MAX = 20;
export const DEAL_MESSAGE_MAX = 300;
export const DEAL_DESCRIPTION_MAX = 1000;
export const DEAL_SIZE_MAX = 40;

/** "Other / leave off": chosen on purpose, so the deal is ready, but nothing is printed. */
export const DEAL_LEAVE_OFF = 'none';

export const DEAL_METALS = [
  'Yellow Gold',
  'White Gold',
  'Rose Gold',
  'Two-Tone Gold',
  'Tricolor Gold',
  'Sterling Silver',
  'Silver',
  'Platinum',
  'Palladium',
] as const;

export const DEAL_PURITIES = ['10K', '14K', '18K', '22K', '24K', '925', '900', '800', '950'] as const;

export type DealInput = {
  title: string;
  price_text: string;
  message: string;
  description: string;
  comparable_price_text: string | null;
  metal: string;
  purity: string;
  size_text: string;
};

/** The parts of a deal its words and pictures are made from. Old rows have no detail columns. */
export type DealWords = {
  title: string;
  price_text: string;
  metal?: string | null;
  purity?: string | null;
  size_text?: string | null;
};

export function formatDealPrice(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9.]/g, '');
  if (!digits || !/^\d+(\.\d{1,2})?$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
  const whole = Number.isInteger(value);
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const oneLine = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Line breaks kept (at most one blank line in a row), spaces inside a line collapsed. */
export function cleanDealDescription(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pick(value: unknown, list: readonly string[]): string {
  const raw = oneLine(value).toLowerCase();
  if (!raw) return '';
  if (raw === DEAL_LEAVE_OFF) return DEAL_LEAVE_OFF;
  return list.find((item) => item.toLowerCase() === raw) ?? '';
}

/**
 * A draft as typed so far — every box may be empty (photos can come first).
 * Only what is typed WRONG is refused: a price that is not a price, a box
 * past its length.
 */
export function normalizeDealDraft(body: unknown): { value: DealInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const title = oneLine(source.title);
  const rawPrice = oneLine(source.price ?? source.price_text);
  const price = rawPrice ? formatDealPrice(rawPrice) : '';
  const rawComparable = oneLine(source.comparable ?? source.comparable_price_text);
  const comparable = rawComparable ? formatDealPrice(rawComparable) : null;
  const message = oneLine(source.message) || DEFAULT_DEAL_MESSAGE;
  const description = cleanDealDescription(source.description);
  const size = oneLine(source.size ?? source.size_text);
  if (title.length > DEAL_TITLE_MAX) return { error: `Keep "What it is" under ${DEAL_TITLE_MAX} characters.` };
  if (price === null) return { error: 'Enter a price, e.g. 1460.' };
  if (rawComparable && !comparable) return { error: 'Enter the comparable price as a number, e.g. 2400 — or leave it empty.' };
  if (size.length > DEAL_SIZE_MAX) return { error: `Keep the size under ${DEAL_SIZE_MAX} characters.` };
  if (description.length > DEAL_DESCRIPTION_MAX) return { error: `Keep the description under ${DEAL_DESCRIPTION_MAX} characters.` };
  if (message.length > DEAL_MESSAGE_MAX) return { error: `Keep the message under ${DEAL_MESSAGE_MAX} characters.` };
  return {
    value: {
      title,
      price_text: price,
      message,
      description,
      comparable_price_text: comparable,
      metal: pick(source.metal, DEAL_METALS),
      purity: pick(source.purity, DEAL_PURITIES),
      size_text: size,
    },
  };
}

/**
 * What a deal still needs before its pictures can be drawn, or null when it
 * is ready. Metal and Purity are must-pick (owner, 2026-10-24) — "Other /
 * leave off" counts as picked.
 */
export function dealReadyProblem(deal: DealWords): string | null {
  if (!deal.price_text?.trim()) return 'Enter a price, e.g. 1460.';
  if (!deal.title?.trim()) return 'Say what it is, e.g. "Rope chain · 18.4 g".';
  if (!deal.metal?.trim()) return 'Pick the metal (or "Other / leave off").';
  if (!deal.purity?.trim()) return 'Pick the purity (or "Other / leave off").';
  return null;
}

/** Full check: a draft that is also ready. */
export function normalizeDealInput(body: unknown): { value: DealInput } | { error: string } {
  const draft = normalizeDealDraft(body);
  if ('error' in draft) return draft;
  const problem = dealReadyProblem(draft.value);
  return problem ? { error: problem } : draft;
}

const shown = (value: string | null | undefined) => {
  const text = oneLine(value);
  return text && text !== DEAL_LEAVE_OFF ? text : '';
};

/** Purity + Metal as printed — "14K Yellow Gold", "925 Sterling Silver"; '' when both are left off or not picked. */
export function dealMetalLabel(deal: DealWords): string {
  return [shown(deal.purity), shown(deal.metal)].filter(Boolean).join(' ');
}

/** The size as printed, '' when there is none. */
export function dealSizeLabel(deal: DealWords): string {
  return shown(deal.size_text);
}

/**
 * The one line on the pictures and in the buyer's "It's yours" text: Purity +
 * Metal + What it is, then the size — "14K Yellow Gold Rope chain · 18.4 g ·
 * 22 in". A deal from before these boxes existed is just its line, as typed.
 * (The deal text itself lists each part on its own line — `dealText`.)
 */
export function dealLine(deal: DealWords): string {
  const head = [dealMetalLabel(deal), oneLine(deal.title)].filter(Boolean).join(' ');
  return [head, dealSizeLabel(deal)].filter(Boolean).join(' · ');
}

/**
 * The new detail columns for an insert or update: a box with something in it,
 * or any box the row already has (so it can be cleared). A blank box on a row
 * without the column is left out, so a deal still saves before
 * `supabase/text-deals-details-2026-10.sql` has run.
 */
export function dealDetailColumns(value: DealInput, row?: Record<string, unknown> | null): Record<string, string | null> {
  const columns: Record<string, string | null> = {
    description: value.description,
    comparable_price_text: value.comparable_price_text,
    metal: value.metal,
    purity: value.purity,
    size_text: value.size_text,
  };
  const out: Record<string, string | null> = {};
  for (const [key, entry] of Object.entries(columns)) {
    if (entry || (row && key in row)) out[key] = key === 'comparable_price_text' ? entry || null : entry ?? '';
  }
  return out;
}
