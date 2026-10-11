# Find a Float

Find a Float is available at `/find-float` on the web and from the Floats tab on iOS. River pages open it with that river selected. It searches the active river/access catalog, not only featured editorial floats.

## Matching and estimates

The requested time is an approximate trip duration, including ordinary stops. A request matches when it falls inside the range, including both endpoints: 4–7 hours and 3–5 hours both match five hours. Shorter and longer alternatives appear separately.

`calculateTripDuration` owns the timing calculation used by MCP screening and the authoritative route estimator. Published segment timings take precedence (kayaks use published canoe timings); otherwise the existing boat/CFS/stop model applies. Both paths retain dangerous-water and regulated-tailwater withholding. Historical reference flows come from the same stored percentile snapshots in search and the planner; absent references retain the existing speed-band fallback.

Matches rank before alternatives. Within matches: ordinary conditions before conditional/low-water results, central-estimate distance in half-hour buckets, distance to the put-in, then narrower range and stable route ID. Alternative ranges also rank by distance from the requested duration. Geographic distance is never presented as a driving distance.

Screening continues to exclude `too_low`, `high`, and `dangerous`, including positioned gauges within the route. Full route checks remove `not_recommended` results. Unknown/low readings can survive with the existing assessment's caution labels and typical-estimate basis. Closures and hazards use the existing recommendation checks.

Variety is a preference: reuse the existing overlap/put-in/reach selection, prefer at most two picks per river, then backfill. Selecting a river disables the river cap.

## Bounded API

`POST /api/float-search` accepts:

- `near: { lat, lng }` and/or `river` (slug or UUID).
- `radiusMiles` 10–300 (UI default 100), `targetHours` 0.5–12.
- `vesselType`: canoe, kayak, raft, tube; `publicOnly` defaults true.

One 20-second deadline covers the whole search, with two workers and at most six authoritative route estimates total. Candidate discovery pages the approved launch catalog in batches of 500 (10,000 ceiling), then checks up to 12 nearest rivers and at most 500 access points per river. Duration inputs are batched per river and request reads are coalesced. Published timings are indexed in memory. Up to five matches and three alternatives are returned, within that shared estimate budget. Missing data, truncated catalog coverage and timeouts are reported as partial; an empty result describes only the routes checked. Optional verified launch photos do not determine eligibility.

The endpoint uses the existing MCP admission buckets, so moving the same expensive search to the UI cannot bypass the shared global work allowance. Production requires the existing Upstash limiter configuration. No schema migration is required.

`POST /api/float-search/places` accepts `{ query }` for an explicit US town lookup. It uses the existing Mapbox account/token, a five-second upstream timeout and separate per-IP/global limits. Town results are temporary and include Mapbox attribution. Missing Mapbox service leaves location and river searches available.

## Location and navigation

Coordinates are rounded to two decimals on the device and again on the server. Search bodies use POST, private/no-store responses, and are excluded from application analytics and request monitoring. The only new persisted preference is boat type. Search state, town results and scroll position are kept in memory for returning from the planner. The existing iOS location hook retains its existing location-permission/cache behavior.

Cards name both endpoint access statuses, range, central estimate, river mileage, geographic proximity, condition cautions, estimate basis and reading time. A photo is labeled as a photo with its capture date when available. Plan this float carries the river, both endpoints and boat into the existing planner, which recalculates when opened. A newer reading/reference or an authoritative route/gauge correction may change the estimate.

## Verification

Regression coverage includes Cedar Grove → Akers surviving a five-hour shortlist, inclusive range boundaries, published times and boat mappings, shared-model parity, regulated/dangerous withholding, caution ordering, multi-river budget/radius/diversity, private endpoints, closures, cancellation and location redaction. Run `make check-web`, `make check-mobile`, and `make bundle-mobile`.

Release smoke check on iOS: allow/deny location; select a town and a river; search with each boat; open a result; close the planner and confirm the results/scroll/boat are restored. The native production bundle is checked without Apple credentials; device permission dialogs require a simulator or device.
