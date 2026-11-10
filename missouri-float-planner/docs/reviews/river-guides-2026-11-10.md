# River guide refresh — November 10, 2026

## Scope and release state

Prepared on `codex/river-guides-refresh`. Production content has not been updated. The content refresh is a separate, guarded operation after deploying the renderer and local images. No URL, publication date or status changes are included.

All 25 published guides were reviewed. The original seven received substantial copy and factual corrections; the newer eighteen received targeted edits, route-distance alignment and clearer access-overview labels. This is an editorial review, not an assertion that every access, business or seasonal claim was checked in the field.

## Confirmed corrections

- Huzzah/Courtois: replace the unrelated Big River gauge with Huzzah Creek near Steelville, USGS 07014000. Courtois advice identifies it as a proxy.
- Meramec: use Steelville 07013000 and acknowledge spring base flow. Remove unsupported blanket cutoff and “falling means fine” advice.
- Current: 134 miles describes the combined protected Current/Jacks Fork system. Correct the Jerktail fee claim. Add the approved Big Spring → T. L. Wright Memorial Access planner connection and 36.2 mapped miles.
- Remove unsupported fixed times, crowd guarantees and river-wide beginner/summer promises from the original seven. Estimate times through the existing planner on request.
- Correct Cave Spring entry wording to match the current NPS exceptions. Remove the unrelated Ha Ha Tonka source from Tunnel Dam advice.
- Remove the Hickory Landing image from Akers → Pulltite: it depicts a different stretch.

## Coverage and remaining image work

The table counts explicit article photos; the original seven can also display existing access-photo fallbacks. Those fallback slots need separate location/rights review and are not all blank on the live site. A numbered route card is an intentional fallback when a matching photo and reuse rights are not established. Existing legacy images are retained except the known mismatch above; their presence is not a new rights approval. New route/sight photography includes an exact-location caption and source/license links.

| River | Featured routes | Explicit route photos | Newly credited route photos | Image follow-up |
|---|---:|---:|---:|---|
| Big Piney River | 3 | 0 | 0 | Review or source photos for route 1, 2, 3. |
| Big River | 3 | 0 | 0 | Review or source photos for route 1, 2, 3. |
| Black River | 2 | 1 | 1 | Review or source photos for route 2. |
| Bourbeuse River | 2 | 0 | 0 | Review or source photos for route 1, 2. |
| Bryant Creek | 2 | 0 | 0 | Review or source photos for route 1, 2. |
| Buffalo National River | 3 | 0 | 0 | Review or source photos for route 1, 2, 3. |
| Caddo River | 2 | 0 | 0 | Review or source photos for route 1, 2. |
| Courtois Creek | 3 | 0 | 0 | Review or source photos for route 1, 2, 3. |
| Crooked Creek | 3 | 1 | 1 | Review or source photos for route 1, 2. |
| Current River | 6 | 5 | 1 | River hero and Round Spring sight photo added. Review or source photos for route 3. |
| Eleven Point River | 4 | 4 | 0 | No empty route-photo slot. |
| Elk River | 0 | 0 | 0 | Replace otter hero when a matching licensed photograph is available. Access overview; no route cards. |
| Gasconade River | 2 | 0 | 0 | Jerome autumn hero added. Review or source photos for route 1, 2. |
| Huzzah Creek | 4 | 4 | 0 | No empty route-photo slot. |
| Jacks Fork River | 4 | 0 | 0 | Review or source photos for route 1, 2, 3, 4. |
| James River | 3 | 0 | 0 | Review or source photos for route 1, 2, 3. |
| Kings River | 1 | 0 | 0 | Review or source photos for route 1. |
| Meramec River | 4 | 4 | 0 | No empty route-photo slot. |
| Mulberry River | 2 | 0 | 0 | Review or source photos for route 1, 2. |
| Niangua River | 4 | 4 | 0 | No empty route-photo slot. |
| North Fork River | 2 | 0 | 0 | Review or source photos for route 1, 2. |
| Spring River (Arkansas) | 1 | 1 | 1 | No empty route-photo slot. |
| Spring River (Missouri) | 0 | 0 | 0 | Access overview; no route cards. |
| St. Francis River | 2 | 0 | 0 | Review or source photos for route 1, 2. |
| War Eagle Creek | 2 | 2 | 2 | No empty route-photo slot. |

The Elk photo candidate found in a USGS report could not be downloaded in this environment; another Noel photo was all-rights-reserved. Neither was used. Elk and Spring River (Missouri) remain access overviews until their missing launch/portage facts are verified. No routes or services were invented.

## Implementation details that matter at release

- Shared UI: searchable/state-filtered guide index with all initial links rendered on the server; real route-geometry overview; selected route uses Eddy coral/orange; no empty directory heading or TOC link.
- Photo assets: new Current and Gasconade hero/card WebPs plus Round Spring. Existing reviewed photographs fill five newer route cards; the Current route photo is also corrected and credited. Images retain location-specific captions and attribution.
- SEO: preserve all guide slugs, canonicals and existing indexability. Visible update dates, Article/OG modification dates and sitemap dates come only from `guide_data.editorial_updated_at`; operational timestamps and source-review dates do not refresh search dates.
- The Current detail API had an older HTML article even though the website uses structured guide data. Structured guide responses now expose `guideData` and `articleUrl`, and suppress the obsolete HTML body. General article bodies are unchanged.
- Release script: dry-run default; fingerprint comparison against all 25 reviewed baselines; approved endpoint/direction/mileage preflight; compare-and-set per-row writes; readback verification; reruns skip already applied rows. A concurrent editor change stops the release rather than overwriting their work.
- Measurement: `guide_planner_click` and `guide_access_click` reuse existing GA4 protections. Search Console page data was read for the requested October 11–November 7 baseline window; a row absent from the result is not evidence that a page is unindexed. Evaluate post-release windows with seasonal context and the small sample in mind.

## Validation and release checks

- Read-only data preflight: all 25 current editorial fingerprints match; all 64 selected routes validate against approved endpoint miles. No production updates made.
- Targeted unit checks: 24 passing, including repeat/concurrent-editor refresh cases, projection bounds, malformed geometry, large geometry and editorial-date validation.
- Shared presentation rendered successfully for Current, Black, Gasconade, Elk and Spring River (Missouri), using captured public access/geometry fixtures and reviewed copy. Live embeds are labelled as fixtures.
- Automated guide browser checks passed in App CI run 42847209394 at 1440, 390 and 320 pixels: route selection, planner estimates (including stale/error states), search/filtering, no-JavaScript guide links and horizontal overflow. The fixture does not assert live water conditions or field access. CI screenshots were downloaded and inspected. That review led to a follow-up byline wrapping fix and a visible stroke in place of the SVG focus box; the PR records the rerun result.
- TypeScript and ESLint pass (18 existing warnings). The `make check-web` wrapper reaches a sandbox IPC restriction in the `tsx` CLI. Equivalent token lint and the complete test list pass with the supported Node loader: 5,102 tests, zero failures. CI also passed the full suite and the iOS typecheck, lint and bundle. The production Next.js build passes. After the screenshot polish, 23 focused byline/SEO, naming and geometry checks pass.
- CI has two separate failures outside the guide checks: the dependency audit reports the Zod advisory GHSA-mrhx-c7xc-m3w5 in the existing Coinbase/x402 dependency tree; national-map smoke checks time out waiting for a snapshot label and a gauge interaction. Dependency declarations, the lockfile and national-map code are unchanged by this PR. These failures remain visible; they are not waived by the guide checks.

For release, confirm the final PR checks and review its screenshots for Current (long guide), Black (mixed photo coverage), Gasconade (new hero), Elk and Spring River (Missouri) (empty route/directory states). Deploy assets/renderer, preview the content batch again, then apply and verify the live pages after cache expiry. The live content batch has not been applied by this implementation session.
