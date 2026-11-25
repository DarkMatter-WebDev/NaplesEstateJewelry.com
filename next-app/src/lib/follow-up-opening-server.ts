import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { firstNameOf, type FollowUpLanguage, type FollowUpSettings } from '@/lib/follow-ups';
import {
  checkAiOpening,
  isOpeningSource,
  OPENING_MAX_TRIES,
  OPENING_SYSTEM_PROMPT,
  openingUserPrompt,
  piecesForAi,
  type OpeningInput,
  type OpeningSource,
} from '@/lib/follow-up-opening';
import { loadSpanishItemTitles } from '@/lib/order-language-server';

/**
 * The AI-written opening of each thank-you (owner, 2026-11-25). Pure rules:
 * `lib/follow-up-opening.ts`. Columns (supabase/follow-ups-ai-openings-2026-11.sql):
 * `follow_up_messages.opening / opening_source / opening_at / opening_tries`,
 * read and written ONLY here, on their own queries — never in MESSAGE_COLUMNS,
 * so every follow-ups page keeps working before the SQL (it then shows and
 * sends the standard line).
 *
 * When: the 15-minute sweep writes openings for queued step-1 emails, soonest
 * first, a few per run (`writeDueOpenings`), so the Preview in Upcoming shows
 * what will go out. "Send now" on a row without one writes it first. Saving a
 * receipt's / order's "Note for the thank-you email", or editing the receipt /
 * order, clears an AI opening so it is written again (`resetOpenings`). An
 * opening the owner typed is never replaced.
 */

const MESSAGES = 'follow_up_messages';
const OPENING_COLUMNS = 'id, opening, opening_source, opening_tries';
const AI_TIMEOUT_MS = 9_000;

export type OpeningState = { opening: string | null; source: OpeningSource | null; tries: number };

/** The openings of these rows; null when the columns are not there yet (SQL not run). */
export async function loadOpenings(client: SupabaseClient, ids: string[]): Promise<Map<string, OpeningState> | null> {
  const map = new Map<string, OpeningState>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 150) {
    const part = unique.slice(i, i + 150);
    if (part.length === 0) continue;
    const { data, error } = await client.from(MESSAGES).select(OPENING_COLUMNS).in('id', part);
    if (error) return null;
    for (const row of (data ?? []) as Array<{ id: string; opening: string | null; opening_source: string | null; opening_tries: number | null }>) {
      map.set(row.id, {
        opening: row.opening,
        source: isOpeningSource(row.opening_source) ? row.opening_source : null,
        tries: Number(row.opening_tries ?? 0) || 0,
      });
    }
  }
  return map;
}

/** The opening columns exist (supabase/follow-ups-ai-openings-2026-11.sql has run). */
export async function openingsReady(client: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await client.from(MESSAGES).select('opening_source').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export function aiOpeningsConfigured(): boolean {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === 'anthropic'
    && Boolean(process.env.ANTHROPIC_API_KEY)
    && Boolean((process.env.AI_FOLLOW_UP_MODEL || process.env.AI_TRANSLATE_MODEL || process.env.AI_MODEL || '').trim());
}

/** One Anthropic call → the raw opening text. Throws a readable error. */
async function askForOpening(input: OpeningInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = (process.env.AI_FOLLOW_UP_MODEL || process.env.AI_TRANSLATE_MODEL || process.env.AI_MODEL || '').trim();
  if (process.env.AI_PROVIDER?.trim().toLowerCase() !== 'anthropic' || !apiKey || !model) {
    throw new Error('The AI is not set up on this server.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION ?? '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        temperature: 0.7,
        system: [{ type: 'text', text: OPENING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [{ type: 'text', text: openingUserPrompt(input) }] }],
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? `The AI answered ${response.status}.`);
    return Array.isArray(data?.content) ? data.content.map((part: { text?: string }) => part.text ?? '').join(' ') : '';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The AI took too long.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type RowForOpening = { id: string; audience: 'seller' | 'buyer'; language: FollowUpLanguage; name: string | null; source_type: 'buy_receipt' | 'order'; source_id: string };

/** What the AI is given for one row: item names (cleaned) + the owner's note. */
async function openingInputFor(client: SupabaseClient, row: RowForOpening): Promise<OpeningInput> {
  let descriptions: string[] = [];
  let note: string | null = null;
  if (row.source_type === 'buy_receipt') {
    // Needs the items + thank_you_note column grant (the SQL); a failed read gives an input with no pieces.
    const { data } = await client.from('buy_receipts').select('items, thank_you_note').eq('id', row.source_id).maybeSingle();
    const items = Array.isArray(data?.items) ? (data.items as Array<{ description?: string | null }>) : [];
    descriptions = items.map((item) => item.description ?? '');
    note = (data?.thank_you_note as string | null | undefined) ?? null;
  } else {
    const [{ data: items }, { data: order }] = await Promise.all([
      client.from('order_items').select('title_snapshot, product_id').eq('order_id', row.source_id),
      client.from('orders').select('thank_you_note').eq('id', row.source_id).maybeSingle(),
    ]);
    const list = (items ?? []) as Array<{ title_snapshot: string | null; product_id: string | null }>;
    const spanish = row.language === 'es' ? await loadSpanishItemTitles(client, list.map((item) => item.product_id)).catch(() => new Map<string, string>()) : new Map<string, string>();
    descriptions = list.map((item) => (item.product_id && spanish.get(item.product_id)) || item.title_snapshot || '');
    note = (order?.thank_you_note as string | null | undefined) ?? null;
  }
  return { audience: row.audience, language: row.language, firstName: firstNameOf(row.name), pieces: piecesForAi(descriptions), note };
}

export type WriteOpeningResult = { ok: true; opening: string } | { ok: false; error: string };

/**
 * Ask the AI for this row's opening, check it, store it. A refused / failed
 * answer counts a try; after OPENING_MAX_TRIES the row gets the standard line
 * (`opening_source = 'standard'`) and no more calls.
 */
export async function writeOpening(client: SupabaseClient, row: RowForOpening, tries: number, options: { replaceOwner?: boolean } = {}): Promise<WriteOpeningResult> {
  const now = new Date().toISOString();
  let result: WriteOpeningResult;
  try {
    const input = await openingInputFor(client, row);
    const checked = checkAiOpening(await askForOpening(input));
    result = checked.ok ? { ok: true, opening: checked.text } : { ok: false, error: `The AI's wording was not used (${checked.reason}).` };
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const nextTries = tries + 1;
  const update = result.ok
    ? { opening: result.opening, opening_source: 'ai', opening_at: now, opening_tries: nextTries }
    : nextTries >= OPENING_MAX_TRIES
      ? { opening: null, opening_source: 'standard', opening_at: now, opening_tries: nextTries }
      : { opening_tries: nextTries };
  // Never over an opening the owner typed in the meantime — unless the owner pressed Rewrite on it.
  let query = client.from(MESSAGES).update(update).eq('id', row.id);
  if (!options.replaceOwner) query = query.or('opening_source.is.null,opening_source.neq.owner');
  const { error } = await query;
  if (error) return { ok: false, error: `Could not save the opening: ${error.message}` };
  if (!result.ok) console.warn('[follow-ups] opening not written:', row.id, result.error);
  return result;
}

/**
 * The sweep's step: queued step-1 rows with no opening yet, soonest first,
 * until `budgetMs` or `max` is used. Returns how many were written; nothing
 * happens before the SQL, with the AI off, or when the AI is not set up.
 */
export async function writeDueOpenings(
  client: SupabaseClient,
  settings: FollowUpSettings,
  options: { budgetMs: number; max: number },
): Promise<{ written: number; failed: number }> {
  const out = { written: 0, failed: 0 };
  if (!settings.aiOpenings || !aiOpeningsConfigured()) return out;
  const started = Date.now();
  const { data, error } = await client
    .from(MESSAGES)
    .select('id, audience, language, name, source_type, source_id, send_at, opening_source, opening_tries')
    .eq('step', 1)
    .in('status', ['scheduled', 'waiting'])
    .is('opening_source', null)
    .lt('opening_tries', OPENING_MAX_TRIES)
    .order('send_at', { ascending: true, nullsFirst: false })
    .limit(options.max);
  if (error) return out; // columns not there yet (SQL not run)
  for (const row of (data ?? []) as Array<RowForOpening & { opening_tries: number | null }>) {
    if (Date.now() - started > options.budgetMs) break;
    const written = await writeOpening(client, row, Number(row.opening_tries ?? 0) || 0);
    if (written.ok) out.written += 1;
    else out.failed += 1;
  }
  return out;
}

/** "Send now" / Rewrite: the row's opening written right now (the owner is waiting on the click). */
export async function writeOpeningNow(client: SupabaseClient, id: string): Promise<WriteOpeningResult> {
  if (!aiOpeningsConfigured()) return { ok: false, error: 'The AI is not set up on this server.' };
  const { data, error } = await client
    .from(MESSAGES)
    .select('id, audience, language, name, source_type, source_id, step, status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'Unknown email.' };
  if (data.step !== 1) return { ok: false, error: 'Only the thank-you email has an opening line.' };
  // A Rewrite starts the tries again, and replaces even the owner's own wording (they asked for it).
  return writeOpening(client, data as RowForOpening, 0, { replaceOwner: true });
}

/** Upcoming → Edit (owner's words) / Standard wording. */
export async function setOpening(client: SupabaseClient, id: string, value: { source: 'owner'; text: string } | { source: 'standard' }): Promise<string | null> {
  const update = value.source === 'owner'
    ? { opening: value.text, opening_source: 'owner', opening_at: new Date().toISOString() }
    : { opening: null, opening_source: 'standard', opening_at: new Date().toISOString() };
  const { data, error } = await client
    .from(MESSAGES)
    .update(update)
    .eq('id', id)
    .eq('step', 1)
    .in('status', ['scheduled', 'waiting', 'failed', 'skipped', 'not_sent'])
    .select('id');
  if (error) return /opening/.test(error.message) ? 'Run supabase/follow-ups-ai-openings-2026-11.sql in Supabase first.' : error.message;
  return data && data.length > 0 ? null : 'This email was already sent.';
}

/**
 * The receipt / order changed (its items, or its "Note for the thank-you
 * email"): its queued thank-you's AI opening is cleared so the sweep writes it
 * again. An opening the owner typed stays. Never throws.
 */
export async function resetOpenings(client: SupabaseClient, sourceType: 'buy_receipt' | 'order', sourceId: string): Promise<void> {
  try {
    await client
      .from(MESSAGES)
      .update({ opening: null, opening_source: null, opening_at: null, opening_tries: 0 })
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('step', 1)
      .in('status', ['scheduled', 'waiting'])
      .or('opening_source.is.null,opening_source.neq.owner');
  } catch {
    // Before the SQL there is nothing to clear.
  }
}
