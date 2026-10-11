# Find a Float

Find a Float is available at `/find-float` on the web and from the Floats tab on iOS. River pages open it with that river selected. It searches the active river/access catalog, not only featured editorial floats.

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

The UI has separate request/IP and search quotas from MCP: 120 attempts per IP per minute, 12 searches per IP, and 20 UI searches globally by default. `FLOAT_SEARCH_PER_IP_PER_MINUTE` and `FLOAT_SEARCH_GLOBAL_PER_MINUTE` configure work quotas. Both surfaces still share the existing aggregate heavy-work ceiling (120/minute by default); UI admission is additionally capped at one third of that ceiling. This prevents either surface from consuming the other’s search quota while protecting the shared backend. Production requires the existing Upstash limiter configuration. No schema migration is required.

`POST /api/float-search/places` accepts `{ query }` for an explicit US town lookup. It uses the existing server-side `MAPBOX_ACCESS_TOKEN`, a five-second upstream timeout and separate per-IP/global limits. Town results are temporary and include Mapbox attribution. Missing Mapbox service leaves location and river searches available.

## Location and navigation

Coordinates are rounded to two decimals on the device and again on the server. Search bodies use POST, private/no-store responses, and are excluded from application analytics and request monitoring. The only new persisted preference is boat type. Search state and scroll position are kept in memory for returning from the planner. Results expire after 30 minutes; inputs remain available for a new search. Expiry is checked on restoration, focus/foreground return, and while the result screen remains open. The existing iOS location hook retains its existing location-permission/cache behavior.

Cards name both endpoint access statuses, range, central estimate, river mileage, geographic proximity, condition cautions, estimate basis and reading time. A photo is labeled as a photo with its capture date when available. Plan this float carries the river, both endpoints and boat into the existing planner, which recalculates when opened. iOS names the boat beside the estimate and retains it when endpoints change, until a new plan/reset or river change. A newer reading/reference or an authoritative route/gauge correction may change the estimate. The web header intentionally puts Find a Float before Plan a Float: discovery comes before planning known endpoints.

## Verification

Regression coverage includes Cedar Grove → Akers surviving a five-hour shortlist, inclusive range boundaries, published times and boat mappings, loader-to-estimator input parity (including kayak, reversed published rows, gauge selection and missing references), missing final estimates, optional-loader failures, regulated/dangerous withholding, caution ordering, multi-river budget/radius/diversity, private endpoints, closures, cancellation and location redaction. Run `make check-web`, `make check-mobile`, and `make bundle-mobile`.

Release smoke check on iOS: allow/deny location; select a town and a river; search with each boat; open a result; close the planner and confirm the results/scroll/boat are restored. The native production bundle is checked without Apple credentials; device permission dialogs require a simulator or device.

Additional release checks: edit the take-out of a tube plan and confirm the boat label remains Tube; return after 30 minutes or background/foreground the app and confirm expired cards require a new search while preserving inputs; select a distant river and confirm radius is disabled and distances remain visible. Live preview timing and the native permission/navigation smoke check are separate from fixture tests.

Review verification (2026-10-11): all 3,525 tests plus 18 Today tests passed; web/mobile type checks, ESLint/token checks, iOS production export, and archive allowlist passed. The null-time regression also confirmed that the existing recommendation assessment already blocks missing durations; the explicit ranking guard is defense in depth. Live preview benchmarking is blocked by Vercel authentication (HTTP 401; browser redirects to sign-in), so no cold/warm response-time claim is made. Before leaving draft, run five-hour canoe searches with a 100-mile radius from Salem, Eminence and Springfield; record first request and warm-repeat latency, evaluated counts, failures and partial/deadline results. A first request does not prove a cold cache without deployment/cache evidence. Native permission/navigation QA remains outstanding.
