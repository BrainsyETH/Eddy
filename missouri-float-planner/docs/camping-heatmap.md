# Camping heatmap implementation and rollout

## What this branch adds

- Read-only `/api/camping/availability`: facility-first catalog, sparse per-night observations, 300/300 edge cache, and complete paginated reads. No provider calls from user requests.
- A four-row Today card and `/camping` expanded screen. Location stays on the phone; nearby means 120 straight-line miles, with a separately labeled saved-river/regional fallback.
- Fourteen comparison cells, absolute opening-count shades, explicit unknown/closed/unreleased/full marks, seven-night selectable controls, external booking links, and optional map destinations.
- On-demand individual site lists in the expanded screen and service callouts. Site responses are cached briefly for up to eight facilities. No eager per-row site fetches.
- Date windows shared between server and phone. Cached catalogs roll forward at Chicago midnight; newly uncovered nights remain unknown.

## Findings that changed the plan

Availability history is pruned seven days behind the current date. An empty retained history cannot prove never observed. The response therefore uses `fresh`, `stale`, and `unknown`, with “No recent observations” rather than “Never checked.” `last_synced_at` is not used as an observation timestamp.

Fresh means at least one current-horizon valid observation; every cell separately checks `checkedAt` against `maxObservationAgeSeconds` (72 hours). The feature never promises one site for an entire stay. The map strip and overview share status semantics and absolute count buckets (1–2, 3–9, 10+). The strip now uses teal fills and a neutral full outline; exact selected-night counts remain visible. Include existing map sheets in visual QA for this shared change.

There is no general NPS-only detail route or service callout deep-link route. Their expanded heatmap row provides the calendar, sites, website, and booking destination. Verified access-point destinations open the existing map using its supported focus parameters; this does not force a particular map-sheet tab.

First-come notes come from `nps_campgrounds.sites_first_come`. No permanent first-come claim is inferred from a transient walk-up site status. Booking links do not add date parameters. The three district booking pages were verified at Recreation.gov:

- https://www.recreation.gov/camping/campgrounds/10344948
- https://www.recreation.gov/camping/campgrounds/10344874
- https://www.recreation.gov/camping/campgrounds/10344920

Loop links use their curated source facility ID and explicitly say Book through district permit.

## Rollout flag

The existing app-config table uses fixed boolean columns, not a generic JSON flag map. To avoid a schema migration for this staged release, the server adds `features.campingHeatmap` from the server-only `CAMPING_HEATMAP_ENABLED` environment variable. Only the exact string `true` enables it. Missing config, errors, older API responses, and malformed client flag values leave it off.

This is a deployment-controlled flag, not an immediately editable database switch. Set the variable only after the new API and compatible iOS build have passed device QA. Disable/remove it and redeploy to roll back. Clients refresh config at startup, on resume, and every five minutes; the existing app-config CDN policy is 60/300 seconds. Allow up to roughly eleven minutes plus request time after a server change while the app remains open, and refresh on return from background. Failed config fetches clear enablement. Unrelated core defaults remain unchanged.

The flag gates both Today and direct entry into `/camping`, plus the service-callout site feature. The additive read-only API can remain deployed while UI is disabled.

## Verification

A read-only run of the actual loader using public Supabase permissions returned:

- 36 tracked campground facilities, all with usable coordinates.
- 35 with some fresh horizon data; one remained visible without observations.
- 49 untracked directory entries.
- 34 tracked booking links; missing links fall back to available campground information.
- No enabled aggregate-plus-loop overlap in the inspected catalog.

These are a September 28 UTC snapshot, not hard-coded coverage expectations. No database records were changed. The four newly added state parks remain untracked until their separate provider integration is completed.

Tests cover type parity, aliases, loop overlap, source states, expiry boundaries, missing dates, midnight/DST, nearby scope, count buckets, database failures, pagination, and fail-closed flag normalization. Tests are registered in the web package's explicit test script.

Before release, perform real-device QA for light/dark themes, large text, VoiceOver, low bandwidth, denied location, return from background, and long expanded site lists. Automated bundling is not a substitute for these checks. In particular, visually verify the shared date headings, heatmap legend, expanded-row scrolling, and return-to-map behavior.
