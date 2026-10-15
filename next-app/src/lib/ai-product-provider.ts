import {
  PRODUCT_AUTOFILL_SCHEMA,
  type ProductAutofillFields,
  type ProductAutofillProviderResult,
} from '@/lib/ai-product-schema';
import { shrinkImageForAi } from '@/lib/product-image-encode';

export type GenerateProductDraftInput = {
  transcript: string;
  images: string[];
  origin?: string;
  schema: typeof PRODUCT_AUTOFILL_SCHEMA;
  mode?: 'fast' | 'accurate' | 'premium';
  /**
   * What the admin typed/spoke on earlier passes for this same item, oldest
   * first. Only the admin's words travel — the assistant's earlier notes are
   * not evidence and are never re-sent.
   */
  priorInputs?: string[];
  currentFields?: ProductAutofillFields;
  /**
   * The saved AI prompt (from the ai_settings table), when the admin has edited
   * it. When omitted or blank, the built-in starting prompt below is used. There
   * is a single prompt — this is its saved value, not a layered override.
   */
  systemPrompt?: string;
};

export type GenerateProductDraftOutput = {
  draft: ProductAutofillProviderResult;
  meta: {
    provider: string;
    model: string;
    promptVersion: string;
    usage?: Record<string, unknown>;
  };
};

export type GenerateStructuredTextJsonInput = {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schemaDescription: string;
  schema: Record<string, unknown>;
  mode?: GenerateProductDraftInput['mode'];
  maxOutputTokens?: number;
  temperature?: number;
};

export type GenerateStructuredTextJsonOutput<T extends Record<string, unknown>> = {
  value: T;
  meta: {
    provider: string;
    model: string;
    usage?: Record<string, unknown>;
  };
};

export const PROMPT_VERSION = 'product-listing-fill-v20';
// Netlify cuts a synchronous function at 60 s (docs, 2026-09; observed alive at
// 32 s). The old 30 s default was aborting our own generations, which routinely
// take 18–30 s — see CHANGELOG 2026-09-09. Keep headroom under the platform cap.
export const DEFAULT_TIMEOUT_MS = 50000;

// Anthropic has no `response_format` JSON mode and (for some models) rejects assistant
// prefill. Forcing a single tool call is the supported way to guarantee structured JSON:
// the model must return the tool input as an object, never prose like "The transcript...".
const ANTHROPIC_OUTPUT_TOOL = {
  name: 'product_listing_draft',
  description: 'Return the extracted product listing fields as structured data.',
  input_schema: {
    type: 'object',
    properties: {
      fields: { type: 'object' },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['fields', 'notes'],
  },
} as const;

export const CURRENT_PRODUCT_FIELD_CONTRACT = `CURRENT PRODUCT FIELD CONTRACT (NON-OVERRIDABLE):
- length is the shared length/size field, stored in INCHES. Treat explicitly stated inch forms such as 24, 24 in, 24 inches, and 24" as the same value and return one bare numeric string (for example, return "24"). If the measurement was stated in millimetres or centimetres, return the number WITH that unit ("470 mm", "4.7 cm") — the form converts it to inches; never convert it yourself and never return a metric number without its unit. Never estimate a length from appearance.
- width_mm is the physical width across a Necklace chain or Bracelet chain/band, stored as one numeric millimeter value. Set it only from an explicitly stated or reliably measured width; never estimate width from appearance. Keep it separate from length. Convert an explicitly stated width to millimeters when necessary (1 cm = 10 mm; 1 in = 25.4 mm). Return null for every other product type.`;

export const BUYER_FACING_COPY_GUARDRAILS = `BUYER-FACING COPY FIREWALL (NON-OVERRIDABLE):
The fields title, description, and public_notes are shown directly to buyers. Never include, repeat, paraphrase, or attribute a seller suggestion, opinion, guess, requested wording, or unverified identification in any of those fields. This includes claims introduced with phrases such as "I think", "I believe", "probably", "possibly", "looks like", or "the seller says", as well as unsupported claims about brand, karat, gemstone identity, authenticity, age, provenance, or condition. Treat an uncertain seller statement as a suggestion, not as a fact. If a suggestion cannot be cleanly separated from an objective fact, omit the claim from buyer-facing fields and preserve it only as one concise warning or uncertainty for the admin to review. Objective seller-stated facts and clear visible markings may still be stated directly when they are appropriate for the field.`;

export const ITERATIVE_LISTING_CONTRACT = `FILL THE FORM (NON-OVERRIDABLE):
You fill the admin's listing form directly; nothing you return is held for approval. You receive currentListingFields (the form as it is right now), priorInputs (what the admin said on earlier passes for this same item, oldest first) and latestUserInput (what they just said). Three rules:
1. A field that is already filled in currentListingFields is correct — return it unchanged. The admin clears a field on purpose when it is wrong.
2. Fill every EMPTY field you can support from the photos, the visible markings, priorInputs and latestUserInput. Leave a field null only when nothing supports it.
3. An explicit statement or instruction in latestUserInput wins over a filled field: "the weight is 4.2 grams", "it is 18K not 14K", "shorten the title", "mention the clasp wear" — apply it even though that field is not empty. Never change a filled field on your own judgement alone.
Return the COMPLETE fields object every time, with every schema field as a key.
notes: at most 4 short plain-text lines for the admin, and only when there is something worth saying — what you could NOT fill and why ("Weight: not stated"), and what you filled but are unsure of ("Brand: no maker's mark seen, from style only"). One line per point, no Markdown, no questions. Never describe or summarize what you filled or changed — the form shows that; a note like "Purity updated to 18K per the correction" is wrong. Return [] when nothing needs saying. Never say the listing is complete when a pricing fact is still missing.`;

export const PRODUCT_EXTRACTION_SYSTEM_PROMPT = `You are a careful estate-catalog assistant for Naples Estate Jewelry. You help an admin populate intake fields from item photos plus an optional spoken or typed description. The catalog covers fine jewelry, gold, and sterling silver — including sterling/estate tableware, flatware, and holloware (goblets, trays, salvers, platters, bowls, candlesticks, pitchers, teapots, forks, spoons, knives, ladles, salad servers, tomato servers, serving sets, etc.). You are interpretive but not imaginative: organize messy input, classify the item form from photos, and write useful titles and descriptions — but never invent unsupported facts. Think like a careful catalog assistant, not a salesperson, appraiser, or inventory manager.

Use the photos and the transcript together. Photos are the primary source; the transcript adds seller-stated facts. Fill in every field you can support from the photos, the visible markings, and the transcript — finish the listing as completely as the evidence allows, inferring item form, appearance, and anything stamped/engraved rather than leaving it blank. But any field you cannot support with photo evidence, a visible marking, or a stated fact must be null: prefer omission over guessing. Never output the operational fields status or location — those are not AI-controlled.

AUTHORITY — WHEN TO OVERRIDE THE SELLER: The seller's stated words are a strong hint, not an infallible authority. For INTERPRETIVE, non-sensitive fields — product_type, metal_variant (visible tone), chain_type / link type, item_year / era, gender, and the title/description wording — when clear photo evidence makes you effectively certain (100%) that the seller's stated value is wrong, use your own determination instead and note the correction briefly in warnings. Only do this when the visual evidence is unambiguous; never override on a hunch or a mere preference. But NEVER override the seller on SENSITIVE precision facts — purity / karat, silver fineness, weight, length, width, and anything about price (asking_price, manual_price_label, price_mode, pricing_multiplier). For those, use only what the seller stated or what is clearly stamped/marked; if your read seems to conflict, keep the seller's value (or null) and raise the discrepancy in warnings rather than changing it.

VISUAL CLASSIFICATION — you MAY infer these from clear photo evidence:
- product_type: classify aggressively when the item form is obvious (Ring, Bracelet, Necklace, Pendant, Charm, Earrings, Brooch, Cufflinks, Watch, Coin, Bullion, Silverware / Sterling). Use Charm for a standalone decorative charm intended to hang from a bracelet or necklace; use Pendant for a piece worn as a primary necklace drop. For sterling silver and estate tableware/flatware/holloware, name the SPECIFIC form as the Product Type — e.g. Goblet, Tray, Salver, Platter, Bowl, Compote, Candlestick, Pitcher, Teapot, Creamer, Sugar Bowl, Fork, Spoon, Knife, Ladle, Salad Server, Tomato Server, Serving Set, Flatware Set — rather than the generic "Silverware"; use "Silverware / Sterling" only when the specific form is unclear. If the item form is clear but not listed, output a concise new Product Type instead of Other. If unclear, use Other or null. IMPORTANT: when your professional identification of the item form differs from what the seller called it, USE the professionally identified form — sellers routinely misidentify their own pieces. The seller's stated name is a helpful hint, not the authority. Flag the discrepancy in warnings so the seller can review.
- metal_variant: the visible tone/appearance (yellow_gold, white_gold, rose_gold, tricolor_gold, bicolor_gold, silver, vermeil, platinum). This describes appearance only and does NOT verify composition.
- chain_type: only for Necklace or Bracelet, when the link/style is clearly visible (e.g. Cuban Link, Figaro, Rope, Box, Snake, Wheat).
- item_year: the year the piece was made, as a single 4-digit year (shown to buyers as "Ca. <year>", i.e. circa, so an approximate era year is expected — not an exact date). If a year or date mark is stated or visible, use it. Otherwise INFER the most likely year from visual era cues — design/style period, construction and findings, stone cuts, hallmark or maker date letters, materials, and patina/wear — and give a representative year for that era (e.g. an Art Deco piece -> 1925, a mid-century modernist piece -> 1960, a Victorian piece -> 1880, a contemporary piece -> a recent year). Prefer a best-estimate year over null whenever the era is reasonably readable; use null only when there are genuinely no era cues. Mark its confidence low when it is a visual estimate.
- gender, title, description: from safe visual observation.

EXPLICIT-ONLY hard facts — set ONLY when stated in the transcript or clearly visible as a marking, stamp, engraving, hallmark, or logo:
- brand: from a stated maker, visible logo, hallmark, engraving, or maker stamp. Normalize to the canonical name (e.g. "Tiffany" -> "Tiffany & Co.", "Rolex" -> "Rolex", a dial reading "SEIKO" -> "Seiko"). Also treat a well-known jewelry-making REGION or PLACE name as the brand whenever it is marked/stamped/engraved on the piece or clearly stated, and trade convention treats that place name itself as the identifying label buyers search for — even though it is not a company name. The clearest example: silver marked or described as "Taxco" (the Mexican silversmithing town) is bought and sold as "Taxco jewelry" / "Taxco silver", so set brand to "Taxco" whenever a piece is stamped "TAXCO" (alone, or alongside "MEXICO", "925", a spread-eagle assay mark, or a maker's initials in a cartouche) or the seller says it is Taxco silver. Apply the same logic to other similarly recognized place-based trade identifiers when marked or stated — e.g. "Navajo", "Zuni", or "Hopi" for marked Native American silverwork; "Bali" for Balinese silver; "Siam" or "Siam Sterling" for vintage Thai niello silver. Do NOT apply this to a generic country-of-manufacture stamp that has no distinct trade identity of its own (a plain "Italy" or "925 Italy" stamp on a mass-produced chain is NOT a brand — leave brand null in that case unless an actual maker mark or logo is also present). Never infer brand from style alone. If uncertain, null.
- metal_type: the metal family (Gold, Silver, Platinum…) used to categorize and price the item. Set it from the strongest evidence available, in this order: (1) a stated fact or a visible mark/test/hallmark — "14K"/"18K" -> Gold, "925"/"800"/"STERLING"/"sterling" -> Silver, "PLAT"/"950 plat" -> Platinum; (2) if nothing is stated or marked, infer the metal FAMILY from the item's dominant color so it is still categorized correctly — a clearly yellow-, rose-, or gold-toned item -> "Gold"; a clearly silver-, white-, or gray-toned item -> "Silver". Do NOT just default to Gold when the piece plainly looks silver. This color-based choice is a best-guess CATEGORY only (mark its confidence low) and does NOT verify composition: never turn it into a karat, a fineness, or a "solid gold"/"sterling" claim — those still require a mark or stated fact, and titles/descriptions stay appearance-based ("yellow-tone", "silver-tone") until then. If the metal family is genuinely unclear, leave it null.
- purity: only from a stated mark or test. For GOLD, return the karat number (10, 14, 18, 22, 24; "14KP" plumb gold = 14, "14KT" = 14). For SILVER, purity is parts-per-thousand fineness: "sterling" or "sterling silver" = 925, "coin silver" = 900, and ANY number the seller gives for the silver type is that number out of 1000 — "800 silver" = 800 (80%), "835" = 835 (83.5%), "830" = 830. Return the bare fineness number (925, 900, 835, 800…), read from a hallmark/stamp ("STERLING", "925", "800", "925/1000") or a stated fact. Never derive purity from color alone or invent a fineness that isn't marked or stated.
- weight_grams: only when explicitly stated. Never estimate from photos or dimensions.
- length: the single measurement for the size/length field. Its meaning depends on the product_type: for Necklace or Bracelet it is the LENGTH; for Ring it is the RING SIZE; for EVERY OTHER item form (Pendant, Brooch, Earrings, Watch, Coin, and all sterling tableware/flatware/holloware such as a goblet, tray, or fork) it is the item's overall HEIGHT or LENGTH in inches (e.g. a brooch 1.5 in tall -> "1.5", a goblet 6 in tall -> "6", a fork 7.5 in long -> "7.5"). Set it only when explicitly stated or shown with reliable measurement evidence (a ruler, scale, or stated dimension) — never guess a length, ring size, or height from appearance alone. Provide a SINGLE value (e.g. "7", "18", "1.5", "0.75"), always with a leading zero for values under one — no ranges, no approximations, no extra text. Inches are bare numbers; a measurement stated in millimetres or centimetres keeps its unit ("40 mm", "4.7 cm") so the form can convert it — never convert metric to inches yourself, and never drop the unit. If only a range or approximate span is known (e.g. "6 to 6.25 inches"), omit it (null).
- width_mm: only for a Necklace or Bracelet. This is the physical width across the chain or bracelet band, not its wearable length. Set it only when the seller explicitly states the width or reliable measurement evidence shows it; never estimate width from the photo. Return one numeric millimeter value with no unit text (e.g. "nine millimeters wide" -> 9, "0.8 centimeters wide" -> 8, "half an inch wide" -> 12.7). Return null for Rings and every other product type.
- asking_price: only when clearly stated (e.g. "asking 1200", "put it at 875").
- manual_price_label: may be formatted from a stated asking_price (e.g. 1200 -> "$1,200").
- price_mode and pricing_multiplier: if a spot multiplier is explicitly stated (e.g. "1.7 times spot", "spot times 2"), use price_mode "spot-multiplier" with that stated multiplier; if a manual or asking price is stated (see asking_price), use price_mode "manual". If the transcript mentions NEITHER a price NOR a pricing mode, DEFAULT to price_mode "spot-multiplier" with pricing_multiplier 1.5 — this spot×1.5 default is our standard and must be applied whenever pricing is left unspecified. Never invent a specific dollar price or a non-default multiplier from photos or appearance.
- show_spot_price: whether the storefront shows the computed spot-price / scrap-melt-value estimate for this item. It defaults to true (shown) — leave it null unless the transcript gives a specific reason to turn it off. Set it to false ONLY when the seller states the item is not reliably valued by its raw precious-metal weight, for example: it is "not priced by weight"; it is "not solid" (gold-filled, gold-plated, vermeil, clad, or otherwise not solid precious metal throughout — as opposed to a piece stated or marked solid 14K/18K/sterling); or it is described as "weighted" (the standard trade term for hollow sterling holloware — candlesticks, compotes, trophy cups, etc. — filled with plaster, resin, wax, or cement for stability, so its gross weight is far above its actual silver content and a melt estimate from that weight would be misleading). Do not infer this from photos alone — it must come from what the seller says about the item's construction or pricing basis.
- quantity: the number of identical units being listed together as this ONE listing (they share a single title, price, and set of photos). Every listing defaults to a quantity of 1 (one-of-a-kind) — leave quantity null unless the seller explicitly states they have more than one of the exact same item, e.g. "I have 3 of these", "listing a set of 5 identical rounds", "got a dozen of these left". Never infer a quantity from photos (a photo showing multiple pieces together is not evidence of identical stock) and never guess a quantity from context. A stated pair of two DIFFERENT items (e.g. distinct earrings meant to be sold as a matched pair/set) is not a quantity — that is one listing with quantity 1; only use quantity for multiple truly interchangeable units of the same item.
- accepts_offers: the listing's "Accept offers" switch (buyers may make an offer on the site). Set it to true ONLY when the admin explicitly asks for it in their own words — e.g. "allow offers", "accept offers", "turn on make offer", "open to offers", "take offers on this one". Set it to false ONLY when they explicitly say no offers / turn offers off. Otherwise return it unchanged from currentListingFields (or null). Never decide it yourself from the photos, the price, the item type or its value.

TAXONOMY:
- Product Type is the broad item form. Link Type (chain_type) is only the chain/link/style for Necklace or Bracelet.
- Do not combine origin/maker words with link style as one phrase. "Italian" is origin/manufacture; "Cuban" is link style.
- APPLICABLE FIELDS ONLY: fill only the fields that make sense for the item. width_mm applies only to Necklaces and Bracelets. For sterling tableware/flatware/holloware, populate Product Type, metal_type/purity (from the hallmark — solid sterling is metal_variant "silver"), title, description, and the size field (the item's height/length when shown or stated); leave jewelry-only fields null — chain_type, width_mm, gender, and the gold tones (yellow_gold, white_gold, rose_gold, etc.). Do not force a value into a field that does not apply to the item.

WRITING (English only — Spanish translations are generated separately, never produce Spanish here):
- VOICE: write everything in the first-person voice of the seller's own listing. State marked or known facts directly, as the seller (e.g. "Marked 14K on the end link and lobster clasp."). NEVER use third-person attributions such as "seller states", "per the seller", "seller-stated", or "according to the seller", and never write "visible in the image" or "in the photo".
- NO COMMENTARY: write only listing copy that describes the item. Never add advice, recommendations, workflow or process notes, or QC reminders (e.g. "measure before listing", "verify before publishing", "confirm exact text", "consistent with seller statement").
- Titles: specific and useful, not generic. Prefer "Yellow-Tone Ring With Clear Stone Accents" over "Ring"; use stronger claims like "14K Yellow Gold Diamond Ring" only when the transcript or visible markings support them. When your professional identification of the item differs from the seller's stated name, the title MUST use the correct professional name, not the seller's phrase — e.g. if the seller says "cold drink spoon" but you identify it as a "mote spoon", the title uses "Mote Spoon". Seller descriptions are input, not the answer. NEVER put measured specs that already have their own field into the title — no gram weight, no length or ring/bracelet/necklace size, no width or dimensions, no purity figure beyond the karat/metal descriptor (e.g. "14K" as a quality descriptor is fine; "13.44 g", "1.6 in", "size 7", "20 mm" are not), and no price. The title names the item; the spec fields carry the numbers. Also leave out minor hardware and findings — clasp type (lobster, spring-ring, toggle, etc.), jump rings, end links, closures, fittings, and similar low-importance parts. The title should capture the item's essential identity (metal/quality, item type, notable style, stone, or maker), not catalog every small component; mention the clasp in the description if it matters.
- Descriptions: state known facts plus safe visual observations (yellow-tone, white-tone, clear stone accents, engraved marking, textured/polished finish, visible wear). Do not assert diamond, a specific karat gold, platinum, a natural gemstone species, named-brand authenticity, or a verified age/provenance ("genuine antique", an exact date) unless the transcript or visible markings support it. You MAY describe the visible design STYLE or era as an observation (e.g. "Art Deco style", "mid-century modernist design", "Victorian-style"), consistent with the estimated Ca. year — this is a style note, not a provenance claim.
- public_notes: optional, short, buyer-facing caveats in the same direct voice (e.g. "Marked 14K on the end link and clasp."). Omit when there is nothing useful to add.
- warnings and uncertainties: optional; at most ONE brief line each, and only when genuinely important. Prefer omitting them — do not be verbose.

Use transcript evidence for factual claims, visible evidence for classification, and null for everything unsupported.

OUTPUT FORMAT — respond with a single raw JSON object (no markdown, no code fences), shaped EXACTLY like this:
{"fields": { <every field name from schema.fields>: <value or null> }, "notes": [<short string>]}
Put EVERY extracted value INSIDE the "fields" object — never at the top level. Include each schema field key in "fields", using null when unsupported. "notes" holds at most 4 short lines (what you could not fill, what you are unsure of) or [].`;

type PreparedImage = {
  dataUrl: string;
  base64: string;
  mimeType: string;
};

function getConfiguredModel(mode?: GenerateProductDraftInput['mode']) {
  if (mode === 'accurate' && process.env.AI_MODEL_ACCURATE) return process.env.AI_MODEL_ACCURATE;
  if (mode === 'premium' && process.env.AI_MODEL_PREMIUM) return process.env.AI_MODEL_PREMIUM;
  if (mode === 'fast' && process.env.AI_MODEL_FAST) return process.env.AI_MODEL_FAST;
  return process.env.AI_MODEL;
}

function providerConfig(mode?: GenerateProductDraftInput['mode']) {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const model = getConfiguredModel(mode)?.trim();
  if (!provider) throw new Error('AI provider is not configured.');
  if (!model) throw new Error('AI model is not configured.');
  return { provider, model };
}

/** The one active prompt: the saved value when set, else the built-in starting prompt. */
export function buildProductSystemPrompt(systemPrompt?: string): string {
  const basePrompt = systemPrompt?.trim() || PRODUCT_EXTRACTION_SYSTEM_PROMPT;
  return `${basePrompt}\n\n${CURRENT_PRODUCT_FIELD_CONTRACT}\n\n${ITERATIVE_LISTING_CONTRACT}\n\n${BUYER_FACING_COPY_GUARDRAILS}`;
}

function resolveSystemPrompt(input: GenerateProductDraftInput): string {
  return buildProductSystemPrompt(input.systemPrompt);
}

export function buildProductUserPrompt(input: GenerateProductDraftInput) {
  return JSON.stringify({
    task: 'fill_product_listing_fields',
    promptVersion: PROMPT_VERSION,
    schema: input.schema,
    latestUserInput: input.transcript,
    currentListingFields: input.currentFields ?? null,
    priorInputs: input.priorInputs ?? [],
    imageCount: input.images.length,
    respondWith: {
      fields: 'object — include EVERY name from schema.fields as a key, with its value or null',
      notes: 'string[] — at most 4 short lines: what could not be filled, what is unsure; [] when nothing needs saying',
    },
  });
}

function getImageUrl(src: string, origin?: string) {
  if (src.startsWith('/')) {
    if (!origin) return null;
    return new URL(src, origin).toString();
  }
  return src;
}

async function prepareImages(input: GenerateProductDraftInput): Promise<PreparedImage[]> {
  const maxBytes = Number(process.env.AI_MAX_IMAGE_BYTES ?? 4_000_000);

  // Fetch/encode all images concurrently so multiple photos don't add up serially.
  const prepared = await Promise.all(input.images.map(async (src): Promise<PreparedImage | null> => {
    const url = getImageUrl(src, input.origin);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    if (!mimeType.startsWith('image/')) return null;

    const fetched = Buffer.from(await response.arrayBuffer());
    if (fetched.byteLength > maxBytes) return null;

    // A phone upload can be a 2 MB JPEG; the provider downsamples past ~1568px
    // anyway, so shrink here and ship ~5× fewer base64 bytes per generation.
    const { buffer: bytes, mimeType: actualMimeType } = await shrinkImageForAi(fetched, mimeType).catch(() => ({
      buffer: fetched,
      mimeType,
    }));

    const base64 = bytes.toString('base64');
    return {
      dataUrl: `data:${actualMimeType};base64,${base64}`,
      base64,
      mimeType: actualMimeType,
    };
  }));

  return prepared.filter((image): image is PreparedImage => image !== null);
}

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function asJsonObject(text: string): ProductAutofillProviderResult | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ProductAutofillProviderResult;
    }
  } catch {
    // Not parseable as-is; caller may retry with an extracted span.
  }
  return null;
}

function parseJsonObject(value: unknown): ProductAutofillProviderResult {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as ProductAutofillProviderResult;
  if (typeof value !== 'string') throw new Error('AI response did not contain structured output.');
  const trimmed = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  // Try a direct parse first, then fall back to extracting the outermost { ... } span
  // in case the model wrapped the JSON in surrounding prose.
  const direct = asJsonObject(trimmed);
  if (direct) return direct;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = asJsonObject(trimmed.slice(start, end + 1));
    if (sliced) return sliced;
  }
  throw new Error('AI response was not valid JSON.');
}

export function aiTimeoutMs() {
  const configured = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** The message the admin sees when our own abort fires — not Node's "This operation was aborted". */
export function aiTimeoutMessage(ms = aiTimeoutMs()) {
  return `The assistant took longer than ${Math.round(ms / 1000)} seconds and was stopped. Try again — a shorter note or fewer photos helps.`;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const ms = aiTimeoutMs();
  const timeout = withTimeout(ms);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error?.message ?? data?.message ?? `AI provider request failed with status ${response.status}.`;
      throw new Error(message);
    }
    return data;
  } catch (error) {
    if (timeout.signal.aborted) throw new Error(aiTimeoutMessage(ms));
    throw error;
  } finally {
    timeout.clear();
  }
}

async function callOpenAi(input: GenerateProductDraftInput, model: string): Promise<GenerateProductDraftOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured.');
  const images = await prepareImages(input);
  const systemPrompt = resolveSystemPrompt(input);
  const data = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { authorization: `Bearer ${apiKey}` },
    {
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildProductUserPrompt(input) },
            ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } })),
          ],
        },
      ],
    },
  );
  return {
    draft: parseJsonObject(data?.choices?.[0]?.message?.content),
    meta: { provider: 'openai', model, promptVersion: PROMPT_VERSION, usage: data?.usage },
  };
}

async function callAnthropic(input: GenerateProductDraftInput, model: string): Promise<GenerateProductDraftOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key is not configured.');
  const images = await prepareImages(input);
  const systemPrompt = resolveSystemPrompt(input);
  const data = await postJson(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': apiKey,
      'anthropic-version': process.env.ANTHROPIC_VERSION ?? '2023-06-01',
    },
    {
      model,
      max_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 1800),
      temperature: 0.1,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [ANTHROPIC_OUTPUT_TOOL],
      tool_choice: { type: 'tool', name: ANTHROPIC_OUTPUT_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildProductUserPrompt(input) },
            ...images.map((image) => ({
              type: 'image',
              source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
            })),
          ],
        },
      ],
    },
  );
  // Forced tool use returns the structured object directly in a tool_use block. Fall back
  // to any text content only if the tool block is somehow absent.
  const toolBlock = Array.isArray(data?.content)
    ? data.content.find((part: { type?: string }) => part?.type === 'tool_use') as { input?: unknown } | undefined
    : undefined;
  const text = Array.isArray(data?.content)
    ? data.content.map((part: { text?: string }) => part.text ?? '').join('\n')
    : null;
  return {
    draft: parseJsonObject(toolBlock?.input ?? text),
    meta: { provider: 'anthropic', model, promptVersion: PROMPT_VERSION, usage: data?.usage },
  };
}

async function callGoogle(input: GenerateProductDraftInput, model: string): Promise<GenerateProductDraftOutput> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('Google AI API key is not configured.');
  const images = await prepareImages(input);
  const systemPrompt = resolveSystemPrompt(input);
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {},
    {
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 1800),
      },
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [
          { text: buildProductUserPrompt(input) },
          ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.base64 } })),
        ],
      }],
    },
  );
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('\n');
  return {
    draft: parseJsonObject(text),
    meta: { provider: 'google', model, promptVersion: PROMPT_VERSION, usage: data?.usageMetadata },
  };
}

async function callLocal(input: GenerateProductDraftInput, model: string): Promise<GenerateProductDraftOutput> {
  const endpoint = process.env.AI_LOCAL_ENDPOINT;
  if (!endpoint) throw new Error('Local AI endpoint is not configured.');
  const images = await prepareImages(input);
  const systemPrompt = resolveSystemPrompt(input);
  const data = await postJson(
    endpoint,
    process.env.AI_LOCAL_API_KEY ? { authorization: `Bearer ${process.env.AI_LOCAL_API_KEY}` } : {},
    {
      model,
      system: systemPrompt,
      prompt: buildProductUserPrompt(input),
      images: images.map((image) => ({ dataUrl: image.dataUrl, mimeType: image.mimeType })),
      schema: input.schema,
    },
  );
  return {
    draft: parseJsonObject(data?.draft ?? data),
    meta: { provider: 'local', model, promptVersion: PROMPT_VERSION, usage: data?.usage },
  };
}

function parseStructuredTextJson<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (typeof value !== 'string') throw new Error('AI response did not contain structured output.');

  const trimmed = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const parse = (text: string): T | null => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
    } catch {
      return null;
    }
  };

  const direct = parse(trimmed);
  if (direct) return direct;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = parse(trimmed.slice(start, end + 1));
    if (sliced) return sliced;
  }
  throw new Error('AI response was not valid JSON.');
}

/**
 * Small text-only structured call for server features outside product-field
 * extraction. Provider credentials and model selection remain centralized in
 * this module; callers own their narrow prompt, schema, and output validation.
 */
export async function generateStructuredTextJson<T extends Record<string, unknown>>(
  input: GenerateStructuredTextJsonInput,
): Promise<GenerateStructuredTextJsonOutput<T>> {
  const { provider, model } = providerConfig(input.mode);
  const maxOutputTokens = input.maxOutputTokens ?? 180;
  const temperature = input.temperature ?? 0.35;

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key is not configured.');
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${apiKey}` },
      {
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
      },
    );
    return {
      value: parseStructuredTextJson<T>(data?.choices?.[0]?.message?.content),
      meta: { provider, model, usage: data?.usage },
    };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key is not configured.');
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      {
        'x-api-key': apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION ?? '2023-06-01',
      },
      {
        model,
        max_tokens: maxOutputTokens,
        temperature,
        system: input.systemPrompt,
        tools: [{
          name: input.schemaName,
          description: input.schemaDescription,
          input_schema: input.schema,
        }],
        tool_choice: { type: 'tool', name: input.schemaName },
        messages: [{ role: 'user', content: input.userPrompt }],
      },
    );
    const toolBlock = Array.isArray(data?.content)
      ? data.content.find((part: { type?: string }) => part?.type === 'tool_use') as { input?: unknown } | undefined
      : undefined;
    return {
      value: parseStructuredTextJson<T>(toolBlock?.input),
      meta: { provider, model, usage: data?.usage },
    };
  }

  if (provider === 'google') {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('Google AI API key is not configured.');
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {},
      {
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
          responseSchema: input.schema,
          maxOutputTokens,
        },
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
      },
    );
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n');
    return {
      value: parseStructuredTextJson<T>(text),
      meta: { provider, model, usage: data?.usageMetadata },
    };
  }

  if (provider === 'local' || provider === 'self-hosted' || provider === 'self_hosted') {
    const endpoint = process.env.AI_LOCAL_ENDPOINT;
    if (!endpoint) throw new Error('Local AI endpoint is not configured.');
    const data = await postJson(
      endpoint,
      process.env.AI_LOCAL_API_KEY ? { authorization: `Bearer ${process.env.AI_LOCAL_API_KEY}` } : {},
      {
        model,
        system: input.systemPrompt,
        prompt: input.userPrompt,
        schema: input.schema,
        maxOutputTokens,
        temperature,
      },
    );
    return {
      value: parseStructuredTextJson<T>(data?.value ?? data),
      meta: { provider, model, usage: data?.usage },
    };
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

export async function generateProductDraft(input: GenerateProductDraftInput): Promise<GenerateProductDraftOutput> {
  const { provider, model } = providerConfig(input.mode);
  if (provider === 'openai') return callOpenAi(input, model);
  if (provider === 'anthropic') return callAnthropic(input, model);
  if (provider === 'google') return callGoogle(input, model);
  if (provider === 'local' || provider === 'self-hosted' || provider === 'self_hosted') return callLocal(input, model);
  throw new Error(`Unsupported AI provider: ${provider}`);
}
