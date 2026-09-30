import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio request signing (pure, testable).
 *
 * Twilio signs every webhook it sends: HMAC-SHA1 over the exact URL it
 * requested followed by every POST field's name + value, sorted by name,
 * keyed with the account's Auth Token, base64-encoded, in the
 * `X-Twilio-Signature` header. Anyone can POST to our webhook; only Twilio
 * can produce that header, so a bad or missing signature is dropped.
 *
 * The URL must be the one configured in the Twilio console — with the
 * public host (SITE_URL), not whatever Netlify shows the function.
 */
export function expectedTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data = url + Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join('');
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(expectedTwilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** `application/x-www-form-urlencoded` body → plain object (last value wins, as Twilio sends no repeats we care about). */
export function formBodyToParams(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) params[key] = value;
  return params;
}
