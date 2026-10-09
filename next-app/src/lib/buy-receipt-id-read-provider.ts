import sharp from 'sharp';
import { ID_READ_SYSTEM_PROMPT, coerceIdRead, parseIdReadJson, type IdReadFields } from '@/lib/buy-receipt-id-read';
import { AI_IMAGE_MAX_EDGE_PX, toOwnedBuffer } from '@/lib/product-image-encode';

// The server half of "Fill form from ID" (owner, 2026-10-09): one photo of the
// seller's ID goes to the AI provider, the printed details come back.
//
// ⛔ This is the ONE place the ID photo leaves our own storage, and only when
// the owner left the box ticked (owner, 2026-10-09: "sending license to
// anthropic is ok"). Nothing is stored here and nothing read off the card is
// logged — not the values, not the model's reply.
//
// Anthropic-only, like `ai-translate.ts` (matches the configured provider).
// AI_ID_READ_MODEL picks a model for this job alone; otherwise AI_MODEL.
// The request names no sampling or thinking setting on purpose: newer models
// refuse some of them, and none is needed to copy text off a card.

const ID_READ_TIMEOUT_MS = 45_000;
const ID_READ_MAX_TOKENS = 4000;

/** Any sharp-readable picture → an upright JPEG no larger than the provider uses, with a mime type that is true. */
async function prepareIdImage(input: Buffer): Promise<Buffer> {
  return toOwnedBuffer(
    await sharp(input)
      .rotate()
      .resize(AI_IMAGE_MAX_EDGE_PX, AI_IMAGE_MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer(),
  );
}

export class IdReadUnreadableImageError extends Error {}

export async function readIdPhotoWithAi(photo: Buffer, now: Date = new Date()): Promise<IdReadFields> {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider !== 'anthropic') throw new Error('ID reading is only configured for the Anthropic provider.');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = (process.env.AI_ID_READ_MODEL || process.env.AI_MODEL || '').trim();
  if (!apiKey) throw new Error('Anthropic API key is not configured.');
  if (!model) throw new Error('AI model is not configured.');

  let image: Buffer;
  try {
    image = await prepareIdImage(photo);
  } catch {
    throw new IdReadUnreadableImageError('not a readable picture');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ID_READ_TIMEOUT_MS);
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
        max_tokens: ID_READ_MAX_TOKENS,
        system: [{ type: 'text', text: ID_READ_SYSTEM_PROMPT }],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') } },
              { type: 'text', text: 'Transcribe this ID.' },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `ID read request failed with status ${response.status}.`);
    }
    if (data?.stop_reason === 'refusal') throw new Error('The provider declined to read this picture.');
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((part: { type?: string }) => part.type === 'text')
          .map((part: { text?: string }) => part.text ?? '')
          .join('\n')
      : '';
    return coerceIdRead(parseIdReadJson(text), now);
  } finally {
    clearTimeout(timeout);
  }
}
