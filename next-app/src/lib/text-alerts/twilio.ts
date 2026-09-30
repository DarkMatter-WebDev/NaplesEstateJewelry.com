import 'server-only';
import { statusCallbackUrl, twilioConfig } from './config';

/**
 * Twilio Messages API over plain fetch — no SDK (the `twilio` package pulls
 * in a large dependency tree for the one POST we need). Every send carries
 * the status-callback URL so delivery results land in our tables without
 * any console configuration.
 *
 * ⛔ Never `await` this in a payment path and never rely on `after()` for it
 * on Netlify (memory: after-is-best-effort-on-netlify). Sends that MUST
 * happen are written to a table first and completed by the sweep.
 */
export class TwilioError extends Error {
  constructor(message: string, readonly code: number | null, readonly status: number | null) {
    super(message);
    this.name = 'TwilioError';
  }
}

export type SentMessage = {
  sid: string;
  status: string;
};

const REQUEST_TIMEOUT_MS = 15_000;

export async function sendTwilioMessage(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
}): Promise<SentMessage> {
  const config = twilioConfig();
  if (!config) throw new TwilioError('Twilio is not configured.', null, null);

  const form = new URLSearchParams();
  form.set('To', input.to);
  form.set('From', config.fromNumber);
  form.set('Body', input.body);
  form.set('StatusCallback', statusCallbackUrl());
  if (input.mediaUrl) form.set('MediaUrl', input.mediaUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      },
    );
    const json = (await response.json().catch(() => null)) as
      | { sid?: string; status?: string; code?: number; message?: string }
      | null;
    if (!response.ok || !json?.sid) {
      throw new TwilioError(
        json?.message ? `Twilio: ${json.message}` : `Twilio returned HTTP ${response.status}.`,
        typeof json?.code === 'number' ? json.code : null,
        response.status,
      );
    }
    return { sid: json.sid, status: json.status ?? 'queued' };
  } catch (error) {
    if (error instanceof TwilioError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TwilioError('Twilio did not answer within 15 seconds.', null, null);
    }
    throw new TwilioError(error instanceof Error ? error.message : 'Twilio request failed.', null, null);
  } finally {
    clearTimeout(timer);
  }
}
