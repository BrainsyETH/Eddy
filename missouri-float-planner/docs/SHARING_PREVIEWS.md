# Sharing previews — MVP

This implements the approved photo and illustration direction. Link images
contain scenery/artwork and a small Eddy signature. Names, put-in/take-out,
distance and saved estimates remain in HTML metadata. No link image or
description publishes a floatability verdict that could outlive its reading.
Opening the link is how a recipient gets current conditions.

## Artwork contract

- 1200 × 630 PNG, under 500 KB each. OG and Twitter use the same source.
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
  Runtime image responses read committed PNGs, without service-role queries,
  provider calls or third-party image downloads. The image functions explicitly
  trace `public/share/*.png` into their deployment bundles.

Regenerate from the web directory with `npm run share:render-previews` on the
repo's pinned Node version. Inputs are in `scripts/assets/link-previews`;
original Eddy icons were copied from the existing iOS/marketing assets.
Photo provenance and reuse terms are in `public/share/credits.txt`.
Commit inputs, renderer and outputs together; version filenames for revisions.
Already-sent chat previews may remain cached even after deployment.

## Behavior

- Gauge redirects happen in `proxy.ts` before streaming, returning HTTP 308
  directly to `/rivers/<state>/<slug>` and preserving the query. Only exact
  gauge detail paths perform bounded public catalog reads; image paths do not.
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

## Validation and release checks

Automated tests cover redirect responses/query preservation, excluded image
paths, orphan gauges, outage handling, plan lookup outcomes and metadata privacy,
shortCode resolution, image dimensions/byte budget and offline image responses.
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
- 3,056 web tests after rebasing onto current main and 16 Today tests passed via the equivalent Node loader.
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
caveat, not a failure of the normal type-generation gate. A full production
prerender against live providers was not run.
