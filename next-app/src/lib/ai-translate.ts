// English -> Spanish translation for product copy (title + description).
// Used by the "English now, Spanish on save" flow: the listing AI generates English
// only, and this fills the Spanish fields at save time.
//
// Anthropic-only for now (matches the configured provider). Set AI_TRANSLATE_MODEL to a
// fast model (e.g. claude-haiku-4-5-20251001) to keep saves snappy; otherwise falls back
// to AI_MODEL.

const TRANSLATE_TIMEOUT_MS = 20000;
const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 2400;

export type TranslateProductCopyInput = { title?: string | null; description?: string | null; notes?: string | null };
export type TranslateProductCopyResult = { title_es: string | null; description_es: string | null; notes_es: string | null };

const TRANSLATE_SYSTEM_PROMPT = `You are a professional English-to-Spanish translator for a fine estate jewelry shop in Naples, Florida. Translate the provided product copy into natural, professional Latin American Spanish appropriate for a US jewelry storefront. Keep brand names, proper nouns, karat marks (e.g. 14K), measurements, and numbers exactly as written. Do not add, remove, or invent information. Respond with a single raw JSON object (no markdown), shaped exactly: {"title_es": string|null, "description_es": string|null, "notes_es": string|null}. Use null for any input that was null or empty.`;

function parseTranslationJson(text: string): { title_es?: unknown; description_es?: unknown; notes_es?: unknown } | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanTranslated(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

/**
 * One Anthropic call that answers with a JSON object. Shared by every
 * translation here; throws a readable error when translation is not set up.
 */
async function requestTranslationJson(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens: number; timeoutMs?: number },
): Promise<Record<string, unknown> | null> {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider !== 'anthropic') {
    throw new Error('Translation is only configured for the Anthropic provider.');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = (process.env.AI_TRANSLATE_MODEL || process.env.AI_MODEL || '').trim();
  if (!apiKey) throw new Error('Anthropic API key is not configured.');
  if (!model) throw new Error('AI translation model is not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS ?? TRANSLATE_TIMEOUT_MS));
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
        max_tokens: options.maxTokens,
        temperature: 0,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }],
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Translation request failed with status ${response.status}.`);
    }
    const text = Array.isArray(data?.content)
      ? data.content.map((part: { text?: string }) => part.text ?? '').join('\n')
      : '';
    return parseTranslationJson(text) as Record<string, unknown> | null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateProductCopyToSpanish(
  input: TranslateProductCopyInput,
): Promise<TranslateProductCopyResult> {
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const notes = (input.notes ?? '').trim();
  if (!title && !description && !notes) return { title_es: null, description_es: null, notes_es: null };

  const userPrompt = JSON.stringify({
    task: 'translate_product_copy_to_spanish',
    title: title || null,
    description: description || null,
    notes: notes || null,
  });
  const parsed = await requestTranslationJson(TRANSLATE_SYSTEM_PROMPT, userPrompt, {
    maxTokens: Number(process.env.AI_TRANSLATE_MAX_TOKENS ?? 1200),
  });
  return {
    title_es: title ? cleanTranslated(parsed?.title_es, MAX_TITLE_LENGTH) : null,
    description_es: description ? cleanTranslated(parsed?.description_es, MAX_DESCRIPTION_LENGTH) : null,
    notes_es: notes ? cleanTranslated(parsed?.notes_es, MAX_DESCRIPTION_LENGTH) : null,
  };
}

/* ── Text deals + marketing email (2026-11-22, Spanish subscribers) ───────── */

const DEAL_TRANSLATE_SYSTEM_PROMPT = `You translate short text-message deals for a fine estate jewelry shop in Naples, Florida, from English into natural Latin American Spanish for Spanish-speaking customers in Florida. Address the customer formally (usted). Keep it short and plain, like a text message. Keep brand names, karat marks (14K, 18K, 925), weights, measurements and every number exactly as written; write inches as "pulg." and ring size as "talla". Never add information (no shipping, no prices, no promises) and never drop any. Respond with a single raw JSON object (no markdown), shaped exactly: {"title_es": string, "size_text_es": string, "description_es": string, "message_es": string}. Use "" for any input that was empty. Keep line breaks in the description.`;

export type DealWordsToTranslate = { title: string; size_text: string; description: string; message: string };
export type TranslatedDealWords = { title_es: string; size_text_es: string; description_es: string; message_es: string };

/** The words the owner typed on a text deal → Spanish. Throws when translation is not set up or fails. */
export async function translateDealWordsToSpanish(input: DealWordsToTranslate): Promise<TranslatedDealWords> {
  const clean = {
    title: input.title.trim(),
    size_text: input.size_text.trim(),
    description: input.description.trim(),
    message: input.message.trim(),
  };
  if (!clean.title && !clean.size_text && !clean.description && !clean.message) {
    return { title_es: '', size_text_es: '', description_es: '', message_es: '' };
  }
  const parsed = await requestTranslationJson(DEAL_TRANSLATE_SYSTEM_PROMPT, JSON.stringify({ task: 'translate_text_deal_to_spanish', ...clean }), {
    maxTokens: 1500,
  });
  if (!parsed) throw new Error('The translation came back empty. Try "Translate again".');
  const field = (key: keyof TranslatedDealWords, source: string, max: number) => (source ? cleanTranslated(parsed[key], max) ?? '' : '');
  return {
    title_es: field('title_es', clean.title, 80),
    size_text_es: field('size_text_es', clean.size_text, 40),
    description_es: field('description_es', clean.description, 1000),
    message_es: field('message_es', clean.message, 300),
  };
}

const EMAIL_TRANSLATE_SYSTEM_PROMPT = `You translate marketing emails for a fine estate jewelry shop in Naples, Florida, from English into natural Latin American Spanish for Spanish-speaking customers in Florida. Address the reader formally (usted). The body is HTML: translate ONLY the visible text and the alt / title attributes. Keep every tag, attribute, inline style, link URL, image URL, number, price, date, karat mark (14K, 925) and brand name exactly as written, in the same order. Never add or drop content. Respond with a single raw JSON object (no markdown), shaped exactly: {"subject_es": string, "html_es": string}.`;

/** Longest email body sent for translation; a longer one is translated by hand. */
export const EMAIL_TRANSLATE_MAX_HTML = 40_000;

/** A marketing email (subject + HTML) → Spanish, tags kept. Throws when translation is not set up or fails. */
export async function translateEmailToSpanish(input: { subject: string; html: string }): Promise<{ subject_es: string; html_es: string }> {
  const subject = input.subject.trim();
  const html = input.html.trim();
  if (!subject && !html) return { subject_es: '', html_es: '' };
  if (html.length > EMAIL_TRANSLATE_MAX_HTML) {
    throw new Error(`This email is too long to translate automatically (${html.length.toLocaleString('en-US')} characters; up to ${EMAIL_TRANSLATE_MAX_HTML.toLocaleString('en-US')}). Paste the Spanish yourself.`);
  }
  const parsed = await requestTranslationJson(EMAIL_TRANSLATE_SYSTEM_PROMPT, JSON.stringify({ task: 'translate_marketing_email_to_spanish', subject, html }), {
    // Spanish runs ~25% longer than English; HTML tokenizes densely.
    maxTokens: Math.min(16_000, Math.max(1_500, Math.ceil(html.length / 2))),
    timeoutMs: 55_000,
  });
  if (!parsed) throw new Error('The translation came back empty. Try again.');
  return {
    subject_es: subject ? cleanTranslated(parsed.subject_es, 180) ?? '' : '',
    html_es: html ? cleanTranslated(parsed.html_es, 100_000) ?? '' : '',
  };
}
