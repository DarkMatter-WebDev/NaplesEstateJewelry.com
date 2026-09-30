import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeCloudflareVideo, verifyCloudflareWebhook } from '@/lib/cloudflare-stream';
import {
  buildProductMediaItems,
  normalizeCloudflareVideoState,
  validateProductVideoFile,
  PRODUCT_VIDEO_MIN_DURATION_SECONDS,
  PRODUCT_VIDEO_MAX_DURATION_SECONDS,
  PRODUCT_VIDEO_MAX_SIZE_BYTES,
} from '@/lib/product-video';

const MIN = PRODUCT_VIDEO_MIN_DURATION_SECONDS;
const MAX = PRODUCT_VIDEO_MAX_DURATION_SECONDS;

describe('product video constraints', () => {
  // MECHANISM: boundaries DERIVED from the constants, so retuning a limit
  // re-baselines these automatically. They used to hardcode 4.9 / 15.1 / 16 and
  // the string "at least 5" — asserting the old policy rather than the rule.
  it('accepts a normal iPhone MOV and rejects duration/size violations', () => {
    const mid = (MIN + MAX) / 2;
    expect(validateProductVideoFile({ size: 20_000_000, durationSeconds: mid, type: 'video/quicktime', name: 'IMG_0001.MOV' })).toEqual([]);
    expect(validateProductVideoFile({ size: 1, durationSeconds: MIN - 0.1, type: 'video/mp4', name: 'clip.mp4' })[0])
      .toContain(`at least ${MIN}`);
    expect(validateProductVideoFile({ size: PRODUCT_VIDEO_MAX_SIZE_BYTES + 1, durationSeconds: MAX + 0.1, type: 'video/mp4', name: 'clip.mp4' }))
      .toHaveLength(2);
  });

  it('accepts exactly at both boundaries — the limits are inclusive', () => {
    for (const durationSeconds of [MIN, MAX]) {
      expect(validateProductVideoFile({ size: 1_000, durationSeconds, type: 'video/mp4', name: 'clip.mp4' }))
        .toEqual([]);
    }
    expect(validateProductVideoFile({ size: PRODUCT_VIDEO_MAX_SIZE_BYTES, durationSeconds: MIN, type: 'video/mp4', name: 'clip.mp4' }))
      .toEqual([]);
  });

  // The message the USER reads must state the limit actually enforced.
  //
  // ⚠️ THIS TEST READS THE SOURCE ON PURPOSE, and that is not squeamishness —
  // a behavioural assertion CANNOT catch this defect. Asserting the returned
  // string equals `Video must be at least ${MIN} seconds long.` passes on the
  // buggy code, because while MIN is 5 the interpolated and the hardcoded
  // strings are byte-identical. Verified: reverting the source to a literal
  // while leaving MIN at 5 left all 8 tests green.
  //
  // Only reading the source distinguishes "derived" from "coincidentally
  // equal". A combined mutation (retune the constant AND revert the message)
  // does fail a behavioural test, which is how this hole hid — it looked
  // mutation-tested. Credit to the Deep Field team for naming the general form:
  // for duplication defects the test must read the source, because any
  // behavioural assertion is satisfied by the bug whenever the duplicate
  // currently agrees.
  it('interpolates its limits in the SOURCE rather than restating them', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/product-video.ts'),
      'utf8',
    );
    const messageLines = source
      .split('\n')
      .filter((l) => /errors\.push\(/.test(l) && /seconds long|seconds or shorter|MB or smaller/.test(l));

    // All three limit messages must be present and none may restate a number.
    expect(messageLines).toHaveLength(3);
    for (const line of messageLines) {
      // The constant may be wrapped (the size message divides it to MB), so
      // require it INSIDE an interpolation rather than immediately after `${`.
      expect(line, `message restates a literal instead of interpolating: ${line.trim()}`)
        .toMatch(/\$\{[^}]*PRODUCT_VIDEO_(MIN_DURATION|MAX_DURATION|MAX_SIZE)[A-Z_]*/);
      expect(line, `bare number in a limit message: ${line.trim()}`)
        .not.toMatch(/(?:least|be)\s+\d+\s*(?:seconds|MB)/);
    }
  });

  // Behavioural companion — weaker, but pins that the wired-up message is the
  // one users actually receive. Retained knowing it cannot catch the literal.
  it('returns the derived message to the caller', () => {
    expect(validateProductVideoFile({ size: 1, durationSeconds: MIN - 0.1, type: 'video/mp4', name: 'c.mp4' })[0])
      .toBe(`Video must be at least ${MIN} seconds long.`);
    expect(validateProductVideoFile({ size: 1_000, durationSeconds: MAX + 0.1, type: 'video/mp4', name: 'c.mp4' })[0])
      .toBe(`Video must be ${MAX} seconds or shorter.`);
  });

  // POLICY: deliberately bare literals. This is the product contract — a
  // 5-to-15-second clip, 150 MB — not our tuning. If someone changes a
  // constant, THIS is what should object; the mechanism tests above should not.
  it('pins the 5-15 second, 150 MB product contract', () => {
    expect(PRODUCT_VIDEO_MIN_DURATION_SECONDS).toBe(5);
    expect(PRODUCT_VIDEO_MAX_DURATION_SECONDS).toBe(15);
    expect(PRODUCT_VIDEO_MAX_SIZE_BYTES).toBe(150 * 1024 * 1024);
  });

  it('maps Cloudflare states without exposing an unready asset', () => {
    expect(normalizeCloudflareVideoState({ status: { state: 'pendingupload' } })).toBe('uploading');
    expect(normalizeCloudflareVideoState({ readyToStream: false, status: { state: 'ready' } })).toBe('processing');
    expect(normalizeCloudflareVideoState({ readyToStream: true, status: { state: 'ready' } })).toBe('ready');
  });

  it('places the single video directly after the cover image', () => {
    expect(buildProductMediaItems(3, true)).toEqual([
      { type: 'image', index: 0 },
      { type: 'video', index: -1 },
      { type: 'image', index: 1 },
      { type: 'image', index: 2 },
    ]);
    expect(buildProductMediaItems(2, false)).toEqual([{ type: 'image', index: 0 }, { type: 'image', index: 1 }]);
  });
});

describe('Cloudflare Stream processing and webhooks', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
    process.env.CLOUDFLARE_STREAM_API_TOKEN = 'token';
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = 'customer-code';
    process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = 'webhook-secret';
  });

  afterEach(() => { process.env = { ...previousEnv }; });

  it('rejects a provider-ready video outside the locked 5–15 second contract', () => {
    const value = normalizeCloudflareVideo({ uid: 'uid', readyToStream: true, duration: 16, status: { state: 'ready' } });
    expect(value.status).toBe('failed');
    expect(value.error_code).toBe('DURATION_OUT_OF_RANGE');
  });

  it('accepts an authentic current webhook and rejects tampering and stale replay', () => {
    const rawBody = JSON.stringify({ uid: 'abc', readyToStream: true });
    const time = 1_700_000_000;
    const signature = createHmac('sha256', 'webhook-secret').update(`${time}.${rawBody}`).digest('hex');
    expect(verifyCloudflareWebhook({ rawBody, signatureHeader: `time=${time},sig1=${signature}`, nowSeconds: time }).valid).toBe(true);
    expect(verifyCloudflareWebhook({ rawBody: `${rawBody} `, signatureHeader: `time=${time},sig1=${signature}`, nowSeconds: time }).valid).toBe(false);
    expect(verifyCloudflareWebhook({ rawBody, signatureHeader: `time=${time},sig1=${signature}`, nowSeconds: time + 301 }).valid).toBe(false);
  });
});
