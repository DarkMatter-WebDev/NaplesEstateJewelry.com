import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateProductDraft } from '@/lib/ai-product-provider';
import { fetchStoredSystemPrompt } from '@/lib/ai-settings-store';
import {
  PRODUCT_AUTOFILL_SCHEMA,
  coerceProductAutofill,
} from '@/lib/ai-product-schema';
import { mentionsOffers } from '@/lib/offers';

const MAX_TRANSCRIPT_LENGTH = 8000;
const MAX_PRIOR_INPUTS = 8;
const MAX_PRIOR_INPUT_LENGTH = 1800;
const MAX_PRIOR_INPUTS_TOTAL_LENGTH = 8000;
const DEFAULT_MAX_IMAGES = 2;
// Successful generations only — a failed or timed-out attempt must not eat a
// slot, or retrying a broken run locks the admin out for an hour (2026-09-09).
const HOURLY_LIMIT = Number(process.env.AI_RATE_LIMIT_HOURLY ?? 30);
const DAILY_LIMIT = Number(process.env.AI_RATE_LIMIT_DAILY ?? 100);

type UsageRecord = { timestamps: number[] };
const usageByUser = new Map<string, UsageRecord>();

function pruneUsage(record: UsageRecord, now: number) {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  record.timestamps = record.timestamps.filter((timestamp) => timestamp > dayAgo);
}

function isRateLimited(userId: string) {
  const now = Date.now();
  const record = usageByUser.get(userId) ?? { timestamps: [] };
  pruneUsage(record, now);
  usageByUser.set(userId, record);
  const hourAgo = now - 60 * 60 * 1000;
  const hourlyCount = record.timestamps.filter((timestamp) => timestamp > hourAgo).length;
  return hourlyCount >= HOURLY_LIMIT || record.timestamps.length >= DAILY_LIMIT;
}

function recordUsage(userId: string) {
  const record = usageByUser.get(userId) ?? { timestamps: [] };
  record.timestamps.push(Date.now());
  usageByUser.set(userId, record);
}

function isAllowedImageSource(value: string) {
  if (value.startsWith('/assets/')) return true;
  try {
    const url = new URL(value);
    return url.pathname.includes('/storage/v1/object/public/product-images/')
      || url.pathname.includes('/storage/v1/object/sign/product-images/');
  } catch {
    return false;
  }
}

/** The admin's earlier inputs for this item, oldest first; newest kept when over budget. */
function sanitizePriorInputs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const inputs = value
    .slice(-MAX_PRIOR_INPUTS)
    .map((item) => (typeof item === 'string' ? item.replace(/\u0000/g, '').trim().slice(0, MAX_PRIOR_INPUT_LENGTH) : ''))
    .filter(Boolean);

  while (inputs.reduce((total, item) => total + item.length, 0) > MAX_PRIOR_INPUTS_TOTAL_LENGTH) {
    inputs.shift();
  }
  return inputs;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  if (isRateLimited(user.id)) {
    console.warn('[ai-product-fill] rate_limited', { userId: user.id });
    return NextResponse.json({ error: 'AI listing limit reached. Please try again later.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return NextResponse.json({ error: `Transcript is too long. Limit is ${MAX_TRANSCRIPT_LENGTH} characters.` }, { status: 400 });
  }

  const maxImages = Math.max(0, Number(process.env.AI_MAX_IMAGES ?? DEFAULT_MAX_IMAGES));
  const images = Array.isArray(body?.images)
    ? body.images.map(String).filter(isAllowedImageSource).slice(0, maxImages)
    : [];

  // Photos are the primary source; transcript is optional. Photo-only is allowed,
  // but at least one usable input must be present.
  if (images.length === 0 && !transcript) {
    return NextResponse.json({ error: 'Add at least one photo to generate a listing.' }, { status: 400 });
  }
  const mode = body?.mode === 'accurate' || body?.mode === 'premium' || body?.mode === 'fast' ? body.mode : undefined;
  const priorInputs = sanitizePriorInputs(body?.priorInputs);
  const currentFields = body?.currentFields && typeof body.currentFields === 'object' && !Array.isArray(body.currentFields)
    ? coerceProductAutofill({ fields: body.currentFields }).fields
    : undefined;

  // The one admin-editable AI prompt (Settings panel). Null = nothing saved yet,
  // so the built-in starting prompt is used.
  const storedSystemPrompt = await fetchStoredSystemPrompt(supabase);

  try {
    const result = await generateProductDraft({
      transcript,
      images,
      origin: new URL(req.url).origin,
      schema: PRODUCT_AUTOFILL_SCHEMA,
      mode,
      priorInputs,
      currentFields,
      systemPrompt: storedSystemPrompt ?? undefined,
    });
    const draft = coerceProductAutofill(result.draft);
    // "Accept offers" moves only on the admin's own words (owner, 2026-10-15):
    // without an offers word in what they just said, the model's value is
    // dropped and the box keeps whatever the form already has.
    if (!mentionsOffers(transcript)) draft.fields.accepts_offers = null;
    recordUsage(user.id);
    const populatedFields = Object.entries(draft.fields)
      .filter(([, value]) => value !== null && value !== '')
      .map(([key]) => key);

    const rawDraft = result.draft as Record<string, unknown> | null;
    const rawTopLevelKeys = rawDraft && typeof rawDraft === 'object' ? Object.keys(rawDraft) : typeof rawDraft;
    const rawHadNestedFields = !!(rawDraft && typeof rawDraft.fields === 'object' && rawDraft.fields !== null);

    console.info('[ai-product-fill] success', {
      userId: user.id,
      provider: result.meta.provider,
      model: result.meta.model,
      promptSource: storedSystemPrompt ? 'saved' : 'built-in',
      priorInputCount: priorInputs.length,
      populatedFields,
      noteCount: draft.notes.length,
      rawTopLevelKeys,
      rawHadNestedFields,
      elapsedMs: Date.now() - startedAt,
      usage: result.meta.usage,
    });

    return NextResponse.json({ draft, meta: result.meta });
  } catch (error) {
    console.error('[ai-product-fill] failed', {
      userId: user.id,
      elapsedMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Unknown AI error',
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'AI listing generation failed.',
    }, { status: 500 });
  }
}
