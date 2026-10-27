import 'server-only';
import sharp from 'sharp';
import {
  CERT_READ_SYSTEM_PROMPT,
  coerceCertificateRead,
  parseCertificateReadJson,
  type CertificateRead,
} from '@/lib/tax-exempt';
import { AI_IMAGE_MAX_EDGE_PX, toOwnedBuffer } from '@/lib/product-image-encode';

// The server half of the certificate read (owner, 2026-10-27: "use AI to
// analyze the picture of the cert and fill in the details… similar to how we
// analyze the pic of IDs"). Same provider, same shape as
// `buy-receipt-id-read-provider.ts`: Anthropic only, AI_ID_READ_MODEL or
// AI_MODEL, no sampling settings, nothing logged from the document.
//
// A photo goes as a JPEG image; a PDF goes as a document block (the provider
// reads PDFs natively). The stored copy is written separately by the caller.

const CERT_READ_TIMEOUT_MS = 45_000;
const CERT_READ_MAX_TOKENS = 4000;

export class CertificateUnreadableFileError extends Error {}

export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

async function prepareImage(input: Buffer): Promise<Buffer> {
  return toOwnedBuffer(
    await sharp(input)
      .rotate()
      .resize(AI_IMAGE_MAX_EDGE_PX, AI_IMAGE_MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer(),
  );
}

export async function readCertificateWithAi(file: Buffer): Promise<CertificateRead> {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider !== 'anthropic') throw new Error('Certificate reading is only configured for the Anthropic provider.');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = (process.env.AI_ID_READ_MODEL || process.env.AI_MODEL || '').trim();
  if (!apiKey) throw new Error('Anthropic API key is not configured.');
  if (!model) throw new Error('AI model is not configured.');

  let block: Record<string, unknown>;
  if (isPdf(file)) {
    block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.toString('base64') } };
  } else {
    let image: Buffer;
    try {
      image = await prepareImage(file);
    } catch {
      throw new CertificateUnreadableFileError('not a readable picture');
    }
    block = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CERT_READ_TIMEOUT_MS);
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
        max_tokens: CERT_READ_MAX_TOKENS,
        system: [{ type: 'text', text: CERT_READ_SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Transcribe this certificate.' }] }],
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? `Certificate read failed with status ${response.status}.`);
    if (data?.stop_reason === 'refusal') throw new Error('The provider declined to read this document.');
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((part: { type?: string }) => part.type === 'text')
          .map((part: { text?: string }) => part.text ?? '')
          .join('\n')
      : '';
    return coerceCertificateRead(parseCertificateReadJson(text));
  } finally {
    clearTimeout(timeout);
  }
}
