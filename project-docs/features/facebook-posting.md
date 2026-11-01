# Facebook Page Posting

> Status 2026-08-03: the posting flow was live-verified end to end on 2026-08-01.
> After Meta proved an earlier replacement token was short-lived, the code began
> rejecting that class of credential before storage. The server-only
> `FACEBOOK_APP_SECRET` is now configured in local `.env.local` and all five
> Netlify deploy contexts, and local Settings is reconnected to **Naples Estate
> Jewelry** with a newly derived Page token whose Meta-reported data-access limit
> is **2026-10-31**. The original
> prepare → publish → API-delete flow was proven through the operator UI against the
> live Graph API. Post copy now leads with one personable AI-assisted sentence
> combining availability with a natural product reference, carries the clickable Shop link, and
> omits the inventory number (since 2026-08-01 both channels omit it —
> `buildPublicSpecLine`). The card's brand line is
> NAPLESESTATEJEWELRY.COM. Card-image choice is saved for both channels; Prepare
> generates the actual card (`supabase/social-card-source-2026-08.sql` applied
> 2026-08-01).
> Token-acquisition gotchas (use-case permissions, stale-scope OAuth failure,
> business-page invisibility in me/accounts) are recorded in `CHANGELOG.md`.
> Current local workflow also includes the guided preparation sequence, exact
> prepared framing, conservative status refresh, receipt-safe recovery, and the
> shared seven-slot Social Queues dashboard; deploy verification is in `TASKS.md`.

## What it is

Auto-posting products to the business's **Facebook Page** as multi-photo posts,
with the same operator flow as Instagram: prepare → review → publish (manual or
scheduled drip), per-product lineup and crop curation, the generated ad card as
slide one, and an auto-"SOLD" comment when an item sells.

## How it differs from Instagram — all driven by the Graph API

| | Instagram | Facebook |
|---|---|---|
| API host | graph.instagram.com | graph.facebook.com |
| Token | Instagram User token, 60-day, weekly refresh cron | Page token; Meta metadata is inspected, short-lived candidates are rejected, and finite expiry is tracked; no refresh cron |
| Publish | container two-step + FINISHED polling | unpublished photos + one feed post, synchronous |
| Delete | **impossible via API** (manual + "forget") | `DELETE /{post-id}` genuinely works |
| Edit after publish | impossible | possible (not built; review-first regardless) |
| Links in caption | dead text — `Store link in bio` directly above a typeable `Item: NaplesEstateJewelry.com/p/N` line | **clickable — post carries a full `Shop:` product URL** |
| Publishing quota | provider-enforced and queryable (100/24h) | no local or queryable provider cap |

## Architecture

Mirrors `lib/instagram/*` file-for-file: `client` (own fetch wrapper — API
clients are never shared between channels), `auth` (AES-256-GCM at rest under
`FACEBOOK_TOKEN_ENC_KEY`, page-vs-user token detection via the Page-only
`category` field, and server-only `/debug_token` inspection under
`FACEBOOK_APP_SECRET`), `store`, `mapping`, `images`, `sync`.

Two things ARE shared, deliberately:

- **Pure caption/lineup helpers** (`sentenceSummary`, `buildSpecLine`,
  `buildHashtags`, `resolveImageLineup`, `buildCardSpecs`) are imported from
  `lib/instagram/mapping` so a copy fix lands on both channels.
- **The rendition/card engine** (`lib/instagram/images` + `card`), with one
  critical boundary: Facebook writes under its own `facebook-renditions/`
  Storage prefix and its own `facebook_posts.rendition_paths` reference column
  (both in the GC scan). Sharing objects would let one channel's re-prepare
  delete files the other still references.

Tables: `facebook_connection` / `facebook_posts` / `facebook_sync_log`
(service-role only, RLS deny-all), from `supabase/facebook-sync.sql`.
`image_selection` and `image_crops` are baked in from day one. Routes:
`/api/admin/facebook/{connect,disconnect,status,settings,preview,images,sync,delete,drip,posts,refresh-status}`.
The crop-suggest endpoint is shared with Instagram (channel-agnostic photo
analysis). The scheduled drip (Supabase pg_cron job in
`supabase/scheduled-jobs-pg-cron-2026-09.sql` — the only scheduler since
2026-09-13; the old `facebook-drip.mts` Netlify function is deleted) runs on the
hour across the UTC-hour union needed for the allowed Eastern posting times in
both EDT and EST. `runScheduledDrip` claims nothing before publishing, so never
give it a second trigger. The due-row query is authoritative, so extra daylight-saving coverage
cannot publish early.

## Operator flow

Admin → Settings → **Facebook Posting**: first configure the Naples Estate
Jewelry Social app secret as server-only `FACEBOOK_APP_SECRET`; the public app
id defaults to `1551269126645242` and may be overridden by `FACEBOOK_APP_ID`.
The secret is currently present in the gitignored local environment and all
five Netlify deploy contexts; its value is intentionally never documented.
Then use Graph API Explorer to obtain a long-lived User token with
`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, and
`pages_manage_engagement`, derive the business Page token, and paste that Page
token. Per-product: the **Facebook** panel (editor drawer, Actions modal
card, or `/admin/products/[id]/facebook`) mirrors Instagram's — post preview
with the clickable link, lineup editor (max 9 photos + the card), crops,
queue/publish, and a real Remove that deletes the post from Facebook.

The owner flow is deliberately staged in the same way as Instagram: **1.
curate** photos/card and caption opening, **2. Save & prepare**, and **3.
review** before queueing or publishing. Save & prepare combines saving the
lineup/card setup with building the final upload, so there is no separate save
step to remember. Until that current review exists, queue, publish-to-both,
publish, and discard are not exposed; an edited opener requires **Update
prepared upload** first. Preparation is the only card-generation path: its
real card first appears in review, so no preview can be mistaken for a prepared
upload. Saving photo choices preserves a local caption draft. The **Save &
prepare** / Reset changes action row follows the completed photo/card controls,
not the Photos heading, so the owner adjusts the lineup before preparing it.
For Tiffany products, shared opener copy always uses **Tiffany & Co.** rather
than a shortened Tiffany reference.
Shared opener copy also normalizes em/en dashes to one space on each side while
leaving compound-word hyphens intact.

Connection is also staged defensively. A candidate must identify as a Page,
read one Page-feed id, match the stored Page id even when the connection is in
`needs_reauth`, and pass Meta `/debug_token` inspection. Invalid/wrong-app
tokens and finite tokens with less than 30 days remaining are rejected before
the encrypted token changes. For accepted finite tokens, the earliest positive
`expires_at` or `data_access_expires_at` is persisted and shown in Settings. A
null stored expiry means only that Meta reported no finite expiration; the UI
does not promise that every Page token is permanent.

Every editable lineup thumbnail uses the same post-crop contained-square
framing and sampled canvas color as preparation, so the lineup itself is the
single truthful preview. **Canvas** and **Crop** labels make that state easy to
scan. Canvas color uses a median border sample so a tight crop touching one
corner does not turn a cream studio sweep into white padding. The crop dialog
shows the source crop beside a live square prepared-post preview. **Crop → Fill
square** updates that preview and starts a centered square crop which remains
fully editable before Apply and normal Save & prepare.

A published panel also reconciles once on open and offers **Refresh Facebook
status**. Graph error 100/subcode 33 is only accepted as a remote deletion when
the same Page token still passes `/me` and a fresh one-item Page feed read; then
the local record becomes Removed and its renditions are cleaned up. New Page
Experience posts may expose a different numeric Page actor id in the public
permalink than Meta returned in the stored post id. Refresh can try that
permalink-derived composite id, but it never relaxes the profile/feed proof.
All permission/auth/network failures keep Published. **Already removed on
Facebook** is the confirmed local-only fallback.
Token connection now reads one Page feed id before storage, so a new token must
actually carry `pages_read_engagement`. Connected settings expose **Replace
Page token**: the old token remains active until the replacement passes the read
probe and matches the current Page id, so rotation does not require a risky
disconnect-first step. Refresh feedback is deliberately contained beneath its
button—quiet success/neutral text, with a Settings link for missing read
access—rather than using the panel-wide red error banner.

Publishing is receipt-first and recoverable. As soon as Meta returns a feed post
id, the row becomes Published before the optional permalink read-back. If the
request ends in the remaining gap after Meta creates the post, checkpointed
photo ids make the retry enter recovery before any new public write: the server
reads recent Page posts and accepts only one exact prepared-caption match created
after that checkpoint. Meta's "These photos were already posted" response uses
the same proof. Missing or ambiguous matches fail closed. The manager preserves
the prepared caption while an error is shown, reloads persisted state after a
failed action, and labels consumed-photo recovery explicitly so the owner is not
sent back through Prepare or invited to create a duplicate.

The Facebook lineup/crops are stored separately from Instagram's: curating one
never changes the other. Two cross-channel tools bridge that (2026-08-01):
**"Copy setup to Instagram/Facebook"** in each panel's lineup header copies the
saved lineup, crops, card source and background onto the other channel
(`/api/admin/social/copy-curation` — refused when the target post is live, and
the target must be re-Prepared), and **"Publish to both…"** opens a shared
side-by-side review modal (`SocialPublishBothModal`) that publishes Instagram
first (permanent channel — if it fails, nothing has gone out), then Facebook,
reporting per-channel results. API-published Instagram posts are NOT
auto-crossposted by Meta's linked-account sharing, so this never double-posts.

The mirrored setup note identifies the CARD-marked photo as the source of the
generated final card **as slide 1**. The finished first slide is reviewed before
publishing; it is never described in a way that suggests it follows the photos.

## Post shape (as of 2026-08-02)

```
{one personable opening sentence; optional AI generation, then admin-editable}

{spec line — no inventory number}

≈ $X at time of posting (based on $Y/oz {metal} spot).

🇪🇸 {Spanish line}

Shop: https://naplesestatejewelry.com/p/{inventory#}

{CTA — default: "Message us here or shop the full collection online."}

#up-to-3-relevant-hashtags
```

Spacing rule: exactly one blank line between every line — uniform rhythm, no
tight clusters (tested).

Facebook deliberately uses fewer hashtags than Instagram. The shared builder
orders product type, jewelry type, brand, product tags, and configured base tags
by relevance and removes duplicates/internal taxonomy; Facebook publishes only
the first three. Instagram keeps its separate, larger cap. Direct Tiffany brand
variants always normalize to `#tiffanyandco` before that ordering/deduplication.

Inside **Publish to both**, preparing Facebook from a ready Instagram setup (or
preparing Instagram from ready Facebook) copies the complete reviewed setup
from the ready side: caption, ordered photo lineup, exclusions, crops, card
source, and card background. The destination rebuilds fresh channel-specific
renditions from those copied choices. The complete stored wording is retained
while the target mapper substitutes the destination link block and hashtag footer: Instagram
gets `Store link in bio` + `Item: …`, while Facebook gets its clickable `Shop:`
URL. The
Prepare button names the full source setup it will use, and a refreshed caption
preview resets to the top. If both
channels are already ready but their openers differ, Publish is blocked and the
modal requires **Sync wording** or **Sync wording & photos**, using the page
that opened the modal as authoritative.

When both channels are ready, that authoritative direction is shown explicitly
and the old single Match action becomes three choices: **Sync wording** keeps
the destination photos, **Sync photos** keeps the destination reviewed caption,
and **Sync wording & photos** copies the complete setup. Every choice rebuilds
the destination review without publishing it.

The combined modal also offers **Schedule both posts** beside the public
publish action. It requires two current, wording-aligned reviews, opens the
shared fixed-time picker, queues both through their existing channel endpoints
without publishing, and shows a separate result for Instagram and Facebook.
Successful cards read **In posting queue**; queued previews continue to use
their stored prepared copy. Unqueue restores a still-prepared post to `review`
rather than stranding it in `pending` without Publish controls.

The top-level Admin **Social Queues** dashboard provides the Facebook schedule
in a separate section beside Instagram. It shows connection/scheduler health,
trailing-24-hour publishing activity, exact Eastern scheduled and queue-added
times, readiness, next/last runs, and row controls to edit, change time, or
remove while preserving prepared copy. Refresh is read-only. Product managers
and the dashboard share the same date-and-slot picker, limited to noon, 2 PM,
4 PM, 6 PM, 8 PM, 10 PM, and midnight Eastern. The Facebook drip selects queued `pending` and
`review` states with non-null `queued_at` and due `scheduled_for`, matching the
state written by `queueProduct`.
Ready rows on a connected Page also show **Post now** beside **Edit post**. Its
confirmation states that the reservation will be bypassed and the post becomes
public immediately, then delegates to the same receipt-first publish path used
by the Facebook manager. Cancellation sends no publish request. Confirmation
closes the modal into a locale-layout background widget that survives normal
client-side navigation. It expands for product/Page progress, auto-closes five
seconds after success, and leaves failures visible with Dismiss/Try again. Only
one social publish runs at a time in the tab.
Ready Facebook rows can also be manually selected, including **Select all
ready**, and sent through one **Post selected now** confirmation. The provider
uses the same receipt-first single-post path sequentially in visible queue order.
It stops on the first failure and retries from that item without intentionally
repeating completed entries.
**Latest Posts** shows up to 12 current published receipts with view, manage,
conservative refresh, and public comment controls. **Remove** crosses a second
permanent-action confirmation and delegates to the existing receipt-first
Facebook deletion path, which also removes the post's reactions/comments.
Opening a manager from this dashboard produces **Back to Social Queues** and
retains that origin across channel tabs; direct manager visits still return to
Products.

The shared queue-row action grid keeps a compact 160px minimum and fluidly
reduces label type, tracking, padding, gaps, and the edit icon at narrow
viewports, preventing adjacent button contents from crossing their borders.

`scheduled_for` is separate from the approval audit time in `queued_at`. The
queue has no daily post cap; each worker invocation processes a bounded batch of
at most 25 due rows, and later invocations continue any remainder. This requires
`supabase/social-scheduled-posting-2026-08.sql`, applied and browser-verified on
2026-08-02.

Preview starts with `Available now: {title}.` and makes no model call. A blank
**Optional AI direction** field appears before the editable opening. Skipping
Generate preserves the deterministic opening exactly; otherwise the admin may
enter up to 400 characters of tone/emphasis guidance and click
Generate/Regenerate AI opener. **Suggest AI direction** opens six one-click
presets: warm/conversational, heritage/craftsmanship, history/character,
holiday gifting, collector appeal, and styling/wearability. The chosen guidance
only fills the existing session-only direction field. The actual opening stays editable and the full
post/count updates immediately; Publish stays unavailable until Prepare saves
that draft. AI must add a conversational thought and vary its sentence
structure instead of merely rewriting the catalog title plus “available now.”
It prefers natural “This…” wording, may shorten the title, and must still
identify the product. Both AI and admin edits
reject “our,” links,
hashtags, inventory numbers, quotes, extra sentences, and availability
language for a non-available item. Invalid/unavailable AI output keeps the
safe fallback. The spot parenthetical appears only for
spot-linked prices; /p/ short links only when an inventory number exists
(fallback: full slug URL). No description body — deliberate; the spec line is
the extraction. The generated card carries a matching small price note.

Fail-closed rules are identical to Instagram's: no images → blocked; price
requested but spot data unavailable → blocked. The card leads every post and a
card render failure degrades to photos-only with a warning (never blocks).
The shared card renderer adds a small centered **NOW AVAILABLE** eyebrow in the
accent color immediately above the item title; it is presentation-only and does
not change the Facebook message.
Since 2026-08-01 evening the card **replaces its source photo** in the slides
(shared `buildRenditions` — the photo shows full-bleed inside the card, so the
standalone copy was a duplicate); prepared-slide thumbnails click open to a
shared full-size `PreparedSlideViewer` with previous/next arrows and left/right
keyboard navigation through the final ordered upload. The same viewer serves
Instagram. The image-toolbar **Remove** and action-row **Discard prepared
upload** actions use the common outlined destructive-button treatment, with
hover lift and press feedback.

## Not built (parity gaps shared with Instagram)

- `markPostSold()` exists but is not wired to the available→sold transition.
- Out-of-date detection (content_hash stored, nothing compares it).
- Bulk queueing.
- Post-text editing after publish (Facebook allows it; Instagram's flow shape
  was kept instead — delete/re-post or edit by hand on Facebook).
