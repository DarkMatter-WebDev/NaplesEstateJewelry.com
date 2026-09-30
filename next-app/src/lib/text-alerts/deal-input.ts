/**
 * The owner's deal form → a clean row (pure, testable).
 * The price is stored as typed but normalised to "$1,460" when a bare number
 * comes in; the message defaults to the wording on file with Twilio.
 */
export const DEFAULT_DEAL_MESSAGE = 'Not on the website. First reply takes it. Pickup at our Naples showroom or we ship.';
export const DEAL_TITLE_MAX = 80;
export const DEAL_PRICE_MAX = 20;
export const DEAL_MESSAGE_MAX = 300;

export type DealInput = { title: string; price_text: string; message: string };

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

export function normalizeDealInput(body: unknown): { value: DealInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const title = String(source.title ?? '').replace(/\s+/g, ' ').trim();
  const price = formatDealPrice(String(source.price ?? source.price_text ?? ''));
  const message = String(source.message ?? '').replace(/\s+/g, ' ').trim() || DEFAULT_DEAL_MESSAGE;
  if (!title) return { error: 'Add the one line (what the piece is).' };
  if (title.length > DEAL_TITLE_MAX) return { error: `Keep the line under ${DEAL_TITLE_MAX} characters.` };
  if (!price) return { error: 'Enter a price, e.g. 1460.' };
  if (message.length > DEAL_MESSAGE_MAX) return { error: `Keep the message under ${DEAL_MESSAGE_MAX} characters.` };
  return { value: { title, price_text: price, message } };
}
