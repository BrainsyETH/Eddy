# Sharing previews — MVP

This implements the approved photo and illustration direction. Link images
contain scenery/artwork and a small Eddy signature. Names, put-in/take-out,
distance and saved estimates remain in HTML metadata. No link image or
description publishes a floatability verdict that could outlive its reading.
Opening the link is how a recipient gets current conditions.

## Artwork contract

- 1200 × 630, under 200 KB each. Photos are quality-85 JPEG (Current River
  187,963 bytes; Bagnell 144,150 bytes); illustrations remain PNG. OG and Twitter
  use the same source. This is our payload budget, not a claimed WhatsApp limit.
- 64 px brand inset and centered focal illustration. Check 2:1 and central
  630 × 630 crops. These are design stress tests, not guaranteed safe zones for
  every messaging app. The corner signature can disappear in a square crop;
  the page title/site name still identify the link.
- Current River and `ameren-bagnell-dam` use the approved archival photos.
  Other rivers/dams, gauges and access points use the matching Eddy icon.
  Unknown places never inherit another place's photograph.
- Saved plans use Eddy holding a map on a schematic route. It is not a map of
  the actual float and contains no user coordinates.
- Local artwork and embedded fonts make generation deterministic and offline.
  Runtime image responses read committed JPEG/PNG files, without service-role queries,
  provider calls or third-party image downloads. The image functions explicitly
  trace `public/share/*.png` and `public/share/*.jpg` into their deployment bundles.
- `src/lib/og/link-preview.ts` is the manifest for photo selection, source file,
  actual image caption and MIME type. River/dam `generateImageMetadata` uses it
  for route-specific alt text. Compatibility rewrites preserve the previous
  bare OG/Twitter endpoints; new metadata uses the `/preview` image ID.
- Mutable image endpoints use a one-day browser/CDN lifetime, without
  `immutable`. These paths may select different artwork in future releases.
  Local assets remove upstream runtime dependencies; missing deployment assets
  or other serving failures are still possible.

Regenerate from the web directory with `npm run share:render-previews` on the
repo's pinned Node version. Inputs are in `scripts/assets/link-previews`;
original Eddy icons were copied from the existing iOS/marketing assets.
Photo provenance and reuse terms are in `public/share/credits.txt`.
Commit inputs, renderer and outputs together; version filenames for revisions.
Already-sent chat previews may remain cached even after deployment.

## Behavior

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
- Reviewed the iOS gauge entry point: it calls `gaugeSharePath(provider, siteId)`.
  NWS/unknown providers return null, hiding Share for LID-only gauges. USGS IDs
  share `/gauges/<siteId>`; USACE IDs share `/dams/<damId>`. This PR does not add
  a native malformed-USGS-ID guard; normal provider IDs come from the API.

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
