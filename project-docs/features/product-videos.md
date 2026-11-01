# Feature: Product Videos (Cloudflare Stream)

> Code-complete foundation as of **2026-07-17**. Deployment and real-provider
> validation are still pending.

## Locked product contract

- Exactly one saved video per product; a replacement remains a candidate until
  the listing Save commits it.
- MOV/MP4 mobile input, 5–15 seconds inclusive, at most 150 MB.
- Video bytes upload directly from the browser to Cloudflare Stream over TUS.
  Netlify provisions the one-time URL but never proxies the file body.
- The first product photo is the public poster. The video sits immediately
  after that cover image in mixed gallery order.
- Only `ready` videos appear publicly. The Stream iframe is not mounted or
  requested until the visitor selects the video tile.
- Cancel removes an uncommitted candidate. Remove and permanent product delete
  do not report success until Cloudflare accepts deletion. Replaced old assets
  are retried through `pending_delete_uid` if cleanup is interrupted.

## Data and routes

Run `supabase/product-videos-cloudflare-stream-2026-07.sql` to add:

- `product_videos`: the one active provider id and ready/playback metadata per
  product.
- `product_video_uploads`: short-lived admin-owned candidate sessions.
- `cloudflare_stream_webhook_events`: signature-verified idempotency hashes.

Server routes:

- `POST /api/admin/product-video/upload`: validates metadata and provisions a
  single-use direct TUS URL.
- `GET /api/admin/product-video/status`: recovers/resumes a candidate and polls
  processing state.
- `GET|DELETE /api/admin/product-video/[productId]`: admin state and
  provider-first candidate/active cleanup.
- `POST /api/admin/product-video/[productId]/commit`: staged Save/remove.
- `POST /api/webhooks/cloudflare-stream`: raw-body HMAC verification,
  timestamp replay window, idempotency, metadata update, and MP4 generation.

The public detail page reads a service-role projection only after resolving the
product. Shop list/grid queries are unchanged. A ready video gets separate
`VideoObject` JSON-LD with the first photo as `thumbnailUrl`; a ready generated
MP4 is used as `contentUrl` when available.

## Deployment checklist (owner)

1. SQL status: `supabase/product-videos-cloudflare-stream-2026-07.sql` was run
   in production on 2026-07-20.
2. Add these Netlify environment variables without recording their values in
   the project: `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE`, and
   `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
3. In Cloudflare Stream, configure the account webhook as
   `https://naplesestatejewelry.com/api/webhooks/cloudflare-stream` (the
   primary domain since the 2026-08-01 switch) using the
   same secret. Stream supports one webhook target per account, so reconcile
   any existing target rather than overwriting it blindly.
4. Deploy, then verify the Netlify CSP permits the customer Stream domain and
   `videodelivery.net` upload/playback requests.

## Required live validation matrix

Use a disposable draft product or explicitly owner-approved listing:

- iPhone Safari and iPad Safari: Choose from library and Record video.
- Reject 4.9s, 15.1s, empty/unsupported, and >150 MB files before upload.
- Interrupt Wi-Fi mid-upload, restore it, and confirm progress resumes without
  creating a second Stream asset.
- Cancel before Save and verify the candidate disappears from Stream.
- Save while processing; confirm the public page remains photo-only until the
  signed webhook/poll marks it ready.
- Confirm video order is cover photo, video, remaining photos on desktop and
  mobile; confirm no Stream iframe/request exists before selecting the tile.
- Replace a saved video and verify the old video remains public until Save,
  then disappears from Stream after Save. Exercise Remove and permanent product
  Delete and re-check the Stream dashboard for no orphan.
- Test processing failure and invalid processed duration. Confirm a clear admin
  error and provider cleanup.
- Inspect ready `VideoObject` with Rich Results tooling and verify no metadata
  is emitted for processing/failed video.

## Marketplace gate (not yet authorized)

Changing a product video marks linked Etsy/eBay rows `out_of_date`; the current
sync engines do **not** upload video. This is deliberate.

After a real Stream asset reaches ready state, request/download its exact
`downloads/default.mp4` and record an `ffprobe` report for container, video and
audio codecs, duration, resolution, and byte size. Then use that exact file in
one owner-approved controlled test:

- Etsy listing video: verify the current duration/size rules and that Etsy
  accepts the generated file while removing audio as expected.
- eBay Media API: create/upload/poll through `PENDING_UPLOAD`, `PROCESSING`, and
  `LIVE`, then attach the returned video id to the intended inventory item.

Only after both accept the same generated artifact should code add marketplace
video upload/checkpoints. Until then, do not execute marketplace video writes,
do not infer codec compatibility from the `.mp4` extension, and keep existing
image/inventory sync state machines unchanged.

## Automated/local verification recorded

- `npx tsc --noEmit` — pass.
- `npm run lint -- --max-warnings=0` — pass.
- `npm test` — pass, 23 files / 316 tests (five video tests).
- `npm run build` — pass, including all new dynamic API routes.
- Signed-in live preview — admin Product video section renders, expands, and
  exposes Choose video / Record video / no-video state. Provider upload and
  mixed ready-video playback remain deployment-gated.
