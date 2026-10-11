# Find a Float

Find a Float is available directly at `/find-float`. Discovery links in the web header, iOS Floats tab and river pages are off by default until the release checks pass. River links open it with that river selected. It searches the active river/access catalog, not only featured editorial floats.

## Rollout

Set these server environment variables on the intended Vercel environment and redeploy. Only the exact value `true` enables discovery; unset or any other value leaves it off.

| Variable | Controls | Enable after |
| --- | --- | --- |
| `FLOAT_SEARCH_ENABLED` | Web header (desktop and mobile) and active river-page button | Live benchmarks and service configuration checks |
| `FLOAT_SEARCH_IOS_ENABLED` | iOS Floats-tab and river-page buttons, via `/api/app-config` → `features.floatSearch` | Endpoints are live and native device checks pass |

The switches are independent, so web can launch while iOS stays unlisted. The native flag defaults off on missing/failed configuration and refreshes through the existing startup/foreground app-config flow, subject to its cache. No schema migration or native dependency is needed. The web river link lives in the canonical river guide page, not the unused legacy `RiverHeader` component.

These are discovery switches, not authorization or API shutdown switches. Direct page/app links and both POST endpoints remain reachable for QA with the existing rate limits. Enable preview discovery for testers or use direct links while production stays unlisted. Changing a Vercel environment variable requires a deployment; this is not an instant runtime kill switch.

## Matching and estimates

The requested time is an approximate trip duration, including ordinary stops. A request matches when it falls inside the range, including both endpoints: 4–7 hours and 3–5 hours both match five hours. Shorter and longer alternatives appear separately.

`calculateTripDuration` owns the timing calculation used by MCP screening and the authoritative route estimator. Published segment timings take precedence (kayaks use published canoe timings); otherwise the existing boat/CFS/stop model applies. Both paths retain dangerous-water and regulated-tailwater withholding. Bounded searches use stored percentile snapshots for reference flows; absent references retain the speed-band fallback. The public planner retains its existing live-USGS-then-snapshot policy. The calculation is shared, but a newer reading, different authoritative gauge, or live reference can refine the result when the planner opens.

Matches rank before alternatives. Within matches: ordinary conditions before conditional/low-water results, central-estimate distance in one-hour buckets, distance to the put-in, then narrower range and stable route ID. Alternative ranges also rank by distance from the requested duration. Geographic distance is never presented as a driving distance.

Screening continues to exclude `too_low`, `high`, and `dangerous`, including positioned gauges within the route. Full route checks remove `not_recommended` results. Unknown/low readings can survive with the existing assessment's caution labels and typical-estimate basis. Closures and hazards use the existing recommendation checks.

Variety is a preference: reuse the existing overlap/put-in/reach selection, prefer at most two picks per river, then backfill. Selecting a river disables the river cap and the radius filter. Location still supplies geographic distance to the launch, and both apps disable the radius control with an explanation.

## Bounded API

`POST /api/float-search` accepts:

- `near: { lat, lng }` and/or `river` (slug or UUID).
- `radiusMiles` 10–300 (UI default 100), `targetHours` 0.5–12.
- `vesselType`: canoe, kayak, raft, tube; `publicOnly` defaults true.

One 20-second deadline covers the whole search, with two workers and at most six authoritative route estimates total. Candidate discovery pages the approved launch catalog in batches of 500 (10,000 ceiling), then checks up to 12 nearest rivers and at most 500 access points per river. Duration inputs are batched per river and request reads are coalesced. Published timings are indexed in memory. At most six assessed routes can be returned in total, with separate caps of five matches and three alternatives. Matches get the assessment budget first; alternatives do not displace matching routes just to fill a section. Missing data, truncated catalog coverage and timeouts are reported as partial when usable work completed. An operational failure or timeout with zero completed assessments returns HTTP 503 and a retry message. A successfully searched area with no eligible routes remains a valid empty result. Selected dam-release rivers explain why duration matching is unavailable, on the UI and MCP. MCP can use provisional screening after optional duration-input failures, preserves river-type withholding, and filters missing final times before ranking. Optional verified launch photos do not determine eligibility.

An unknown or inactive selected river returns HTTP 404 with “This river is not available for float search. Choose another river.” Malformed inputs return 400; a river lookup outage remains a retryable 503. Both apps display the server message. The iOS search POST does not automatically retry.

The UI has separate request/IP and search quotas from MCP: 120 attempts per IP per minute, 12 searches per IP, and 20 UI searches globally by default. `FLOAT_SEARCH_PER_IP_PER_MINUTE` and `FLOAT_SEARCH_GLOBAL_PER_MINUTE` configure work quotas. Both surfaces still share the existing aggregate heavy-work ceiling (120/minute by default); UI admission is additionally capped at one third of that ceiling. This prevents either surface from consuming the other’s search quota while protecting the shared backend. Production requires the existing Upstash limiter configuration. No schema migration is required.

`POST /api/float-search/places` accepts `{ query }` for an explicit US town lookup. It uses the existing server-side `MAPBOX_ACCESS_TOKEN`, a five-second upstream timeout and separate per-IP/global limits. Town results are temporary and include Mapbox attribution. Missing Mapbox service leaves location and river searches available.

## Location and navigation

Coordinates are rounded to two decimals on the device and again on the server. Search bodies use POST, private/no-store responses, and are excluded from application analytics and request monitoring. The only new persisted preference is boat type. Search state and scroll position are kept in memory for returning from the planner. Results expire after 30 minutes; inputs remain available for a new search. Expiry is checked on restoration, focus/foreground return, and while the result screen remains open. The existing iOS location hook retains its existing location-permission/cache behavior.

Cards name both endpoint access statuses, range, central estimate, river mileage, condition cautions, estimate basis and reading time. Cards do not show a distance to the put-in: proximity is straight-line, and in the Ozarks the drive can be much longer, so a number would invite the wrong comparison. Proximity only orders similar fits, and when a location was used both apps say so above the results (`FLOAT_SEARCH_PROXIMITY_NOTE`). The planner shows the drive once a float is opened. A photo is labeled as a photo with its capture date when available. Plan this float carries the river, both endpoints and boat into the existing planner, which recalculates when opened. iOS names the boat beside the estimate and retains it when endpoints change, until a new plan/reset or river change. A newer reading/reference or an authoritative route/gauge correction may change the estimate. Once enabled, the web header intentionally puts Find a Float before Plan a Float: discovery comes before planning known endpoints.

## MCP client release notes

`find_floats` keeps its input contract and now uses inclusive duration matching and the shared tiered ranking. Result ordering can change. Routes without an estimated duration are excluded from the ranked choices, and the additive `unavailableTimeCandidates` field reports withheld-time candidates. Each returned suggestion adds `durationMatch` (`match`, `shorter`, or `longer`). Selected regulated rivers explain why duration matching is unavailable. Clients should use these fields/labels rather than infer a duration match from list position; the output schema includes the additions. The UI discovery switches do not gate MCP tools.

## Verification

Regression coverage includes Cedar Grove → Akers surviving a five-hour shortlist, inclusive range boundaries, published times and boat mappings, loader-to-estimator input parity (including kayak, reversed published rows, gauge selection and missing references), missing final estimates, optional-loader failures, regulated/dangerous withholding, caution ordering, multi-river budget/radius/diversity, private endpoints, closures, cancellation and location redaction. Run `make check-web`, `make check-mobile`, and `make bundle-mobile`.

Release smoke check on iOS: allow/deny location; select a town and a river; search with each boat; open a result; close the planner and confirm the results/scroll/boat are restored. The native production bundle is checked without Apple credentials; device permission dialogs require a simulator or device.

Additional release checks: edit the take-out of a tube plan and confirm the boat label remains Tube; return after 30 minutes or background/foreground the app and confirm expired cards require a new search while preserving inputs; select a distant river and confirm radius is disabled and distances remain visible. Live preview timing and the native permission/navigation smoke check are separate from fixture tests.

Before enabling public discovery:

- With both flags unset, verify desktop/mobile web navigation and both native entry points are hidden; direct links still work. Enable each flag independently and check only its intended surface. Check native missing-config fallback and foreground refresh.
- Benchmark five-hour canoe searches within 100 miles of Salem, Eminence and Springfield. Record deployment SHA, first/repeat latency, evaluated route counts, partial responses, failures and 429s, plus a modest concurrent run. Label caches cold only when deployment/cache evidence establishes that. Assess typical and slow responses, not just whether they fit the 20-second deadline.
- Confirm production `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `MAPBOX_ACCESS_TOKEN`, then exercise search and town lookup. Public `/api/health` only proves liveness; authenticated diagnostics report Mapbox presence, not limiter/service success. Do not record credential values.
- Keep native discovery off until the device checklist passes. An OTA release additionally requires a matching installed runtime fingerprint/channel; a successful JS export alone does not establish compatibility.

Quota increases, server caching and additional route-check backfill remain follow-ups driven by the measurements. The UI allowance is capped at one third of the shared heavy-work limit (at most 40/minute with the default 120 aggregate), even if `FLOAT_SEARCH_GLOBAL_PER_MINUTE` is higher. Replacements after six attempted full checks require increasing the total check cap; time remaining alone does not authorize more checks. No new cache or higher work budget ships with this rollout patch.

Review verification (2026-10-11): all 3,528 tests plus 18 Today tests passed; web/mobile type checks, ESLint/token checks, iOS production export, and archive allowlist passed. New rollout regressions cover independent default-off flags and real HTTP-handler/search behavior for missing/inactive rivers, lookup outages and valid empty results. The null-time regression also confirmed that the existing recommendation assessment already blocks missing durations; the explicit ranking guard is defense in depth. In the restricted container, tests and the token check use the equivalent Node `--import tsx` invocation because the tsx CLI IPC socket is blocked. Live preview benchmarking is blocked by Vercel authentication (HTTP 401; browser redirects to sign-in), so no cold/warm response-time claim is made. Before public discovery is enabled, run five-hour canoe searches with a 100-mile radius from Salem, Eminence and Springfield; record first request and warm-repeat latency, evaluated counts, failures and partial/deadline results. A first request does not prove a cold cache without deployment/cache evidence. Production service verification and native permission/navigation QA remain outstanding.
