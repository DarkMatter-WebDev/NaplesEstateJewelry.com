# Instagram Posting

> Status 2026-08-03: **live and operator-verified.** The Instagram Business
> account is connected, token refresh is armed, and carousel publishing,
> preparation, status reconciliation, cross-channel sync, fixed-time queues, and
> route-persistent background publishing are implemented. Historical build and
> experiment detail lives in `project-docs/CHANGELOG.md`.

## Caption contract

`src/lib/instagram/mapping.ts` builds this reviewed caption shape:

```text
{one personable opening sentence; optionally AI-generated, then editable}

{public specification line}

≈ $X at time of posting (based on $Y/oz {metal} spot).

🇪🇸 {Spanish line}

Store link in bio
Item: NaplesEstateJewelry.com/p/{inventory number}

{CTA}

{Instagram hashtag set}
```

- The two link lines are adjacent, with normal paragraph spacing above and
  below. Instagram caption URLs are not relied upon as clickable links.
- The spot parenthetical appears only for spot-linked prices. Inventory numbers
  never appear in the specification line or alt text; the short `Item:` link is
  the only public inventory-number use.
- Instagram receives the larger discovery hashtag set. The shared hashtag
  builder gives Facebook only its first three relevant tags and canonicalizes
  Tiffany variants to `#tiffanyandco`.
- Tiffany wording normalizes to **Tiffany & Co.** Opening sentences never use a
  standalone `Tiffany` or `Tiffany and Co.` reference. Em/en dashes receive one
  space on both sides; compound-word hyphens are unchanged.

## AI opening sentence

- The deterministic default is `Available now: {title}.`; no model call happens
  unless the admin explicitly generates an opener.
- **Optional AI direction** accepts up to 400 characters. Shared suggestions are
  warm/conversational, heritage/craftsmanship, history/character, holiday
  gifting, collector appeal, and styling/wearability.
- Output should contribute a conversational thought, prefer natural “This…”
  phrasing, and identify the item without merely rearranging the catalog title.
- Generated and manually edited openers reject “our,” URLs, hashtags, inventory
  numbers, quotation marks, extra sentences, and availability claims for an
  unavailable item. Invalid or unavailable model output keeps the safe fallback.
- Any opener change after preparation requires **Update prepared upload** before
  queue or publish controls return.

## Guided owner flow

The manager exposes one sequence:

1. Curate the opening sentence, photo order, cover, crop, card source, and card
   background.
2. Click **Save & prepare** at the end of the photo controls.
3. Review the actual prepared caption and slides.
4. Schedule or publish only from the current review.

Preparation is the only card-generation path. The photo marked **CARD** becomes
the generated card at slide 1 and its standalone source photo is omitted only
when card rendering succeeds. A card failure preserves every source photo.
Until preparation is current, queue, publish-to-both, publish, and discard
controls stay hidden.

## Image framing and card behavior

- Curation thumbnails use the same post-crop contain-to-square framing and
  sampled canvas color as the prepared rendition. **Canvas** and **Crop** labels
  expose which behavior is active.
- Canvas color uses the median border ring so a tight object touching a corner
  does not incorrectly force white padding.
- The crop modal shows the editable source crop beside a live prepared-post
  preview. **Fill square** creates an editable centered crop; nothing persists
  until the normal Save & prepare action.
- `src/lib/instagram/backdrop.ts` detects backdrop color/uniformity and proposes
  content framing. `card.ts` renders the generated card; card failures degrade to
  photos-only instead of blocking the post.
- The card includes a centered **NOW AVAILABLE** eyebrow above the title. Cards
  share the source photo's backdrop family so shadows and dark-background pieces
  are not surrounded by unintended white bars.
- Prepared thumbnails open the shared keyboard-accessible slide viewer. Arrows
  and left/right keys traverse the exact upload order.
- Generated cards and renditions stay under the existing
  `instagram-renditions/` Storage prefix, which is included in Storage GC.

## Instagram/Facebook synchronization

When one channel prepares from the other, the target can copy:

- **Sync wording** — opening and shared caption body only.
- **Sync photos** — order, exclusions, crops, card source, and background only.
- **Sync wording & photos** — both sets of reviewed choices.

The target always rebuilds its own renditions and replaces only its
platform-specific link block and hashtag footer. The combined publish/schedule
dialog fails closed when two ready channels have mismatched reviewed wording.

## Scheduling and background publishing

- `/admin/social-queues` shows Instagram and Facebook independently with exact
  Eastern scheduled time, queue-added time, preparation readiness, recent
  publishing activity, worker health, and edit/reschedule/remove/publish-now
  actions.
- Allowed Eastern slots are noon, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM, and midnight.
  UI, API validation, database scheduling, and workers share this allowlist.
- `scheduled_for` is separate from approval audit time in `queued_at`. Workers
  run across the EDT/EST UTC-hour union, while the database due predicate prevents
  early publishing. There is no local daily cap; each invocation handles a
  bounded batch of 25 due rows. Instagram's provider quota may delay but never
  advance a post.
- Scheduling both channels requires current prepared reviews with matching
  openers. Each queue operation reports independently and does not publish.
- Removing a queued post restores its prepared review; it does not discard the
  caption or renditions.
- Queue **Post now** closes into the route-persistent lower-right background
  widget. One publish runs per tab. Success becomes a short notice; failure stays
  available for receipt-safe retry.
- Ready Instagram rows can be selected individually or all at once, then sent
  through one **Post selected now** confirmation. The widget processes them in
  queue order, stops on the first failure, and resumes at that item without
  intentionally repeating completed posts.
- **Latest Posts** shows up to 12 current published receipts with view, manage,
  conservative refresh, and public comment controls. Instagram removal remains
  manual: **Open to remove** takes the owner to Instagram, then Refresh status
  reconciles the local receipt. The modal never claims API deletion.
- Queue-originated manager links preserve **Back to Social Queues** across channel
  switches. Direct manager visits retain **Back to Products**.

The fixed-time pipeline requires the applied
`supabase/social-scheduled-posting-2026-08.sql` migration. Channel-specific
scheduled Netlify functions call the existing guarded drain routes.

## Status reconciliation

Opening a published Instagram manager performs one remote media read; **Refresh
Instagram status** repeats it. Missing media changes local state to Removed only
after `/me` proves the same account token is healthy. Authentication, permission,
network, or otherwise ambiguous failures preserve Published. **Already removed
on Instagram** is the explicit local-only escape hatch for an owner-deleted post.

Instagram's API cannot edit captions or delete posts after publishing, so the
review remains deliberately strict.

## Configuration

- Meta app: **Naples Estate Jewelry Social** (`1551269126645242`).
- Instagram app ID: `1561238015679345`.
- Business portfolio: **Naples Estate Jewelry**.
- Required permissions: `instagram_business_basic` and
  `instagram_business_content_publish`; comment management supports the SOLD
  comment path.
- Required server configuration: `INSTAGRAM_TOKEN_ENC_KEY` and
  `INSTAGRAM_CRON_SECRET`. `INSTAGRAM_APP_SECRET` is needed when exchanging or
  refreshing applicable token types. Values live only in Netlify/local secrets.
- `supabase/instagram-sync.sql` and the later social-scheduling migration are
  applied.

## Current constraints

- Development-mode Meta apps are limited to assigned tester accounts. Moving to
  broader accounts would require App Review and business verification.
- Rerouted rendition URLs must remain public Supabase Storage URLs; putting them
  behind `/api/*` risks edge-rate-limit interference with Meta fetchers.
- Legacy `/assets` products are fetched and re-hosted correctly, but completing
  the remaining Storage migration would simplify the pipeline.
- Every live Instagram test touches the real account. Keep deliberate publish
  tests small and review/delete them manually when appropriate.
- Whether a generated card or plain product photo performs better as the grid
  cover is a content-performance question, not an implementation blocker.
