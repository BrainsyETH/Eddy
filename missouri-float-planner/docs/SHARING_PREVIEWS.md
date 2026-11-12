# Sharing previews — MVP

This implements the approved photo and illustration direction. Link images
contain scenery/artwork and a small Eddy signature. A river page and a guide
also print their own name, which does not go stale. Put-in/take-out, distance
and saved estimates remain in HTML metadata. No link image or description
publishes a reading or a floatability verdict that could outlive it. Opening
the link is how a recipient gets current conditions.

## Artwork contract

- 1200 × 630, under 200 KB each. Photos are quality-85 JPEG (Current River
  187,963 bytes unnamed, about 172 KB with its name; Bagnell 144,150 bytes);
  illustrations remain PNG. OG and Twitter
  use the same source. This is our payload budget, not a claimed WhatsApp limit.
- 64 px brand inset and centered focal illustration. Check 2:1 and central
  630 × 630 crops. These are design stress tests, not guaranteed safe zones for
  every messaging app. The corner signature can disappear in a square crop;
  the page title/site name still identify the link.
- Current River and `ameren-bagnell-dam` use the approved archival photos.
  Other rivers/dams, gauges and access points use the matching Eddy icon.
  Unknown places never inherit another place's photograph.
- A river page's image (`/rivers/<state>/<slug>`) is that artwork with the
  river's name and state drawn on at request time (`src/lib/og/river-card.tsx`):
  the name sits bottom-left above the wordmark, the illustration moves right,
  and the photo's gradient deepens for contrast. The state line is dropped
  when the name already contains it ("Spring River (Missouri)"). A name takes
  the largest size that fits one line and wraps only below 66 px. The left
  placement means a central square crop can cut the name; the page title beside
  the thumbnail still names the river. The `/rivers` index, gauges, access
  points, dams and plans keep unnamed artwork.
- Saved plans use Eddy holding a map on a schematic route. It is not a map of
  the actual float and contains no user coordinates.
- Local artwork and embedded fonts make generation deterministic and offline.
  Runtime image responses read committed JPEG/PNG files, without service-role queries,
  provider calls or third-party image downloads. The two named images below add
  one cached public catalog read each. The image functions explicitly
  trace `public/share/*.png` and `public/share/*.jpg` into their deployment bundles.
- `src/lib/og/link-preview.ts` is the manifest for photo selection, source file,
  actual image caption and MIME type. River/dam `generateImageMetadata` uses it
  for route-specific alt text. Compatibility rewrites preserve the previous
  bare OG/Twitter endpoints; new metadata uses the `/preview` image ID.
- Mutable image endpoints use a one-day browser/CDN lifetime, without
  `immutable`. These paths may select different artwork in future releases.
  Local assets remove upstream runtime dependencies; missing deployment assets
  or other serving failures are still possible.

### Named images: river and guide cards

Two link images print a name and read one database row to get it: the river
card above (`riverCard()`, `src/lib/og/river-card.tsx`) and the guide card.
Guides (`/blog/<slug>`) get the Field Notebook card with the guide's title,
drawn by `blog/[slug]/opengraph-image` from `guideCard()`
(`src/lib/og/guide-card.ts`). The weekday Facebook guide post is a link post,
so that card is the post's picture.

- Both read with `createPublicCatalogClient`. These image routes are ISR, and
  Next refuses a `no-store` fetch while it renders one; supabase-js returns
  that refusal as `error` instead of throwing. A no-store client
  (`createAdminClient`, `createPublicReadClient`) therefore fails on every
  request without reaching the database. With the error ignored, every guide
  once shipped the generic "Float Trip Guide" card.
- A failed lookup throws. An error response is not cached and the next request
  retries; a generic card would be cached here and kept by Facebook. Only a
  slug with no published guide, or no river, gets the generic artwork.
- `sharing-previews.test.ts` fails if any `opengraph-image`/`twitter-image`
  route imports a no-store client, and checks both lookups request a cacheable
  read. `next dev` and a compile-only build render these routes on demand and
  cannot show the failure: check a full `next build` + `next start`, where the
  response carries `x-nextjs-cache`.
- Facebook keeps the picture it scraped. A corrected card reaches new posts;
  an existing post or a previously shared URL changes only after a rescrape
  (Meta's Sharing Debugger, or its `scrape=true` Graph call).

Regenerate from the web directory with `npm run share:render-previews` on the
repo's pinned Node version. Inputs are in `scripts/assets/link-previews`;
original Eddy icons were copied from the existing iOS/marketing assets.
Photo provenance and reuse terms are in `public/share/credits.txt`.
It also writes the name-ready river artwork (`river-name-v1.png`,
`river-current-name-v1.jpg`; the photo at quality 93, because the name is
composited on and the result re-encoded at 85). A re-render can rewrite an
untouched file with different bytes; commit only the files you meant to change.
Commit inputs, renderer and outputs together; version filenames for revisions.
Already-sent chat previews may remain cached even after deployment.

## Page metadata

- Every public page builds its Open Graph and Twitter tags with
  `publicPageMetadata()` (`src/lib/seo.ts`). Next.js replaces nested metadata
  instead of merging it, so a page that sets only a title and description
  inherits the root's whole `openGraph`, including the homepage `og:url`.
- The helper requires an image: a `SHARE_IMAGES` entry (the homepage card or
  one of the committed illustrations, each with its own alt text) or
  `ROUTE_SHARE_IMAGE` when the route segment ships its own
  `opengraph-image`/`twitter-image` files. A page's config image wins over a
  parent segment's image file; an image file in the page's own segment wins
  over its config.
- Titles never include "Eddy": the root template appends "| Eddy".
- `sharing-previews.test.ts` fails when a public route sets metadata without
  Open Graph, when a `ROUTE_SHARE_IMAGE` route lacks either image file, or
  when a title would render the brand twice.
- Tab and touch icons are local files (`src/app/favicon.ico`, `icon.png`,
  `apple-icon.png`), cropped from the iOS app icon so the face and sunglasses
  stay legible at 16 and 32 px.

## Share text

- A link share is the title and the link. Ordinary river shares carry no
  condition summary, on iOS (`shareLink`) or the web (`EddyQuote`): it would
  reach the recipient undated. A share that does state a condition, such as a
  future alert share, includes the observation's date, time and time zone.

- On iOS, a link share (`shareLink`: river, gauge, dam, access point, chart)
  hands the system sheet the URL as its only item, with the title as the mail
  subject (`eddy-ios/src/lib/sharePayload.ts`). React Native passes `message`
  and `url` to the sheet as two items, so the link in both used to arrive
  twice. **Unconfirmed on a device:** how Messages, Mail, WhatsApp and Copy
  present the single-item share has not been checked since this change.
- A float plan's share text ends with its link, inside the text on purpose: as
  a separate item, a target that accepts only one could keep the summary and
  drop the link. The plan sheet and the saved-float screen use the same wording
  (`planShareMessage`). The summary gives the float time when there is one and
  keeps the regulated-water note; a time withheld for today's water is omitted
  instead of described.
- A plan keeps one link. Sharing a saved float reuses its stored link, and
  sharing the same plan again reuses the one already created. When a link
  cannot be created the share still goes out with the trip details, and the
  plan sheet says the link is missing.
- On the web, a link share goes through `shareOrCopy` (`src/lib/share-link.ts`):
  the native sheet on touch devices, the clipboard elsewhere. Dismissing the
  sheet does nothing: no copy, no "Copied", no analytics event. A sheet that
  fails for another reason falls back to copying. A copy that fails says so
  ("Couldn’t copy"), and the planner, shared-plan and access-point buttons
  then offer the link in a prompt. `useShareLink` adds the label and an
  always-mounted screen-reader announcement. Gauge, dam and chart shares keep
  their own flow under ADR 0015. `share-link.test.ts` fails if another
  component calls `navigator.share` itself.
- River and access-point buttons share the page's canonical path on the
  current origin, not the address bar, so campaign parameters a visitor
  arrived with are not passed on. A campground share keeps the address bar:
  its query is the campground and dates.

## Behavior

- The Smart App Banner opens the related screen where the app has one:
  river guides open their river, `/find-float` opens Find a Float, and a
  shared chart opens its gauge with the shared view, or with
  `shareUnavailable=1` when the view can't be restored, so the screen says so
  instead of silently showing current conditions. Both come from
  `chartShareAppPath`, which the universal-link handler also uses. Pages
  without a related screen keep the default.
- The shared chart image's legend lists a series only when its plotted
  segments (gap-split, as drawn) intersect the shared window.
- Gauge redirects happen in `proxy.ts` before streaming, returning temporary HTTP 307
  directly to `/rivers/<state>/<slug>` and preserving the query. Only exact
  gauge detail paths perform bounded public catalog reads; image paths do not.
  A five-minute, 2,048-entry per-instance LRU cache coalesces concurrent reads
  and caches successful orphan lookups. Errors are never retained. Redirect
  responses use `no-store` so a reassigned primary river is not pinned in the
  browser. Proxy runs before the CDN: headers alone cannot avoid the lookup.
  Cold instances and first requests for distinct IDs still read the database.
  Standalone gauges stay on `/gauges/<siteId>`. Lookup failures return a
  retryable, noncached 503, never a guessed destination.
- Shared plans use the existing `get_float_plan_by_code` RPC and exact
  shortCode. Metadata reads do not increment views. They expose no account IDs,
  private notes, internal IDs or saved condition verdicts. Canonicals use
  `https://eddy.guide/plan/<shortCode>` regardless of the request host.
- API lookup errors return 503; an empty successful lookup returns 404. The
  recipient sees a retry action for network/server failures and a missing-link
  message only for confirmed 404. Cancelling web native Share does not copy a
  link as a side effect.
- Smart App Banners come from the preceding visibility/downloads PR (#1411).
  This change does not expand AASA paths or change native sharing payloads.
- The iOS gauge entry point calls `gaugeSharePath(provider, siteId)`.
  NWS/unknown providers return null, hiding Share for LID-only gauges. USGS and
  USACE stations share `/share/gauge/<provider>/<id>` (`shared/chart-share.ts`,
  ADR 0015), which also rejects malformed IDs.

## Validation and release checks

Automated tests cover redirect responses/query preservation, excluded image
paths, orphan gauges, outage handling, plan lookup outcomes and metadata privacy,
shortCode resolution, cache expiry/eviction/recovery, photo-specific alt/MIME,
image dimensions/byte budget and offline image responses.
Run `make check-web`. This sandbox disallows tsx CLI IPC; if needed run the same
test files with `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test …`
and the token check with `node --import tsx scripts/check-tailwind-tokens.ts`.

Before release, inspect the deployed raw HTML and image endpoints for Current
River, another river, Bagnell, another dam, an access point, a curated gauge,
an orphan gauge and a valid/missing shared plan. Confirm title, description,
image dimensions, Twitter metadata and banner in the initial crawler/Safari
HTML. Check a real HTTP Location header for gauge redirects, not meta refresh.

On physical devices, send each link through Messages, AirDrop, Copy Link and
Mail, plus WhatsApp and Slack. Open it with and without Eddy installed. Repeat
offline and with VoiceOver. Check compact/wide crops, title announcements,
cancel behavior and retry after reconnecting. Use a fresh URL when checking
preview changes because recipient apps cache unfurls. Fragments are not sent
to the server; confirm browser/client fragment retention on device.

The full cross-app/AASA contract test belongs with the later routing phase.
Plan-save idempotency, new native Share points, native activity-result telemetry
and optional rich image attachments are separate follow-up work.

### Checks completed for this PR

- Clean `next typegen`, source/test TypeScript and ESLint checks passed.
- 3,059 web tests and 16 Today tests passed via the equivalent Node loader.
- Production webpack compilation (`--experimental-build-mode compile`) passed.
  All 14 affected metadata image bundles include their artwork files.
- Fixture-backed HTTP checks passed for actual compiled image endpoints and
  crawler HTML metadata, plus a gauge HTTP redirect. No production reads/writes
  are required by this fixture exercise.
- Wide, 2:1 and central-square artwork was visually inspected. Physical-device
  share-sheet, recipient rendering and VoiceOver checks remain outstanding.

The additional webpack compile generated older route-type checks that reject
existing runtime exports in `api/me/gauge-alerts/route.ts` (`MAX_RULES_PER_USER`)
and `api/search/route.ts` (utility functions such as `parseOffsets`). These
files are unchanged here. A fresh output directory with the standard
`next typegen` command passes both TypeScript configs. This is a webpack-check
caveat tracked in [#1417](https://github.com/BrainsyETH/Eddy/issues/1417),
not a failure of the normal type-generation gate. A full production
prerender against live providers was not run.
