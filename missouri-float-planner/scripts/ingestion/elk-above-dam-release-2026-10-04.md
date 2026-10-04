# Elk inventory release — 2026-10-04

The owner clarified the scope on October 4: publish Elk using Eddy's existing
river, access-point, campground/service, POI and gauge features. Outfitter
packages, their advertised distances and their craft-specific durations are
**not release requirements**. This replaces the earlier three-private-trip
release definition. No activation rule or review control has been removed.

## Production inventory

The data-only batch in `elk-inventory-2026-10-04.sql` was previewed with rollback,
then applied to `ilefwfpvphadsbptiaur`. The existing importer supplied its merge,
collision and field-provenance decisions; the existing atomic database RPCs
applied them. Expected-row and concurrent-update checks were included.

| App feature | Verified inventory | Publication behavior |
|---|---|---|
| Public access | Pineville 0.26, Mount Shira 7.78, Cowskin 21.17 | All three approved listings; Pineville and Mount Shira are planner endpoints. Cowskin keeps its existing endpoint exclusion across Shadow Lake Dam. Road and parking information populated from MDC. |
| Camping/services | Ten active linked listings with coordinates and contact details | Seven updated; Trestle Park, Sycamore Landing and The Spot added. All ten carry camping offerings. Existing slugs/links preserved; 95 field-source records recorded. |
| Private access research | Kozy 0.43, Trestle 6.55, Wayside 11.33 | Now present in the database as unapproved, non-endpoint candidates. Each can be reviewed independently; none blocks the public inventory. |
| POIs | Sugar-creek headwater confluence and Indian Creek confluence | Two active on-water markers. |
| Springs | No verified mainstem visitor stop established by the research | No invented spring marker. Additional verified stops are normal enrichment. |
| Gauge | USGS Noel 07188925, primary, curated, stage in feet | Measurements/history with `condition_rating_mode=unrated`; twelve recreational anchors remain null. Eleven stored readings verified, latest 14:15 UTC. |
| Mapped obstructions | Elk Springs Road crossing 6.52; Shadow Lake Dam 11.61 | Existing route hazard presentation; no inferred crossing procedure or water-level cutoff. |

The ten services are Wayside/Elk River Floats, Kozy Kamp, Eagles Nest,
River Ranch Resort, Shady Beach, Big Elk, Two Sons, Trestle Park,
Sycamore Landing and The Spot. Campground business pins do not become launch
pins. The private campground listings do not claim live booking availability.

## Readiness in the actual app

- **Corridor:** the full river is listed; initial planner endpoints are above
  Shadow Lake Dam. The lower-river Cowskin listing stays available independently.
- **Legal access:** the published inventory uses the three agency-listed public
  accesses. The I-49/MO-59 bridge pins and Lanagan remain excluded. Private
  candidates remain pending; their property review is not this release's gate.
- **Gauge/conditions:** Noel polling is working. Readings-only presentation is
  provided by #1418; no transfer calibration or outfitter opening decision is used.
- **Hazards:** the known crossing and dam are structured records. Pineville to
  Mount Shira includes the crossing in the planner's normal hazard section.
  This is a mapped feature, not a claim about a permitted carry or safe passage.
- **Routing:** production `get_float_segment` returns a valid 34-vertex,
  7.52-mile Pineville–Mount Shira segment (checked 15:20 UTC). Approved/endpoint
  checks reject Cowskin and the pending private pins. With no published pair
  duration, the unrated planner uses its normal **typical-time estimate**.

The old requirements to validate three private pairs, reconcile advertised
6/6/12-mile products, attach craft-specific times or obtain an operator trip
approval are withdrawn. `publishedFloatTimes` and this batch's service-route
entries are empty. Historical research remains in Git history and the earlier
research review; it is not the activation checklist.

## Deployment

Merge #1418, then integrate #1424 into main and verify the web/API deployment.
Run the ordinary activation preview with this dossier and a fresh Noel reading,
then use the same atomic activation RPC. Do not bypass its findings.

The next iOS build carries the improved unrated labels and downstream-dam
presentation. Existing iOS builds already decline to grade empty ladders and
show in-route hazards. This inventory release introduces no approved Wayside
endpoint, so it does not depend on an old client displaying the new downstream
dam field. iOS distribution is not an outfitter-data prerequisite.

The four earlier migrations and crossing migration are already applied:
`20261004044101`, `20261004044114`, `20261004044139`,
`20261004044150`, `20261004045234`. This inventory update is data only.

## Verification and remaining enrichment

Service read-back matches all planned fields at the database's six-decimal
coordinate precision. No new service-quality debt or duplicate-contact findings.
Public endpoint approval and private candidate exclusion are preserved. The
excluded Lanagan record retains null Elk miles. Database batch leaves Elk inactive.

Web and test TypeScript checks and ESLint passed; design-token checks and all
3,087 tests passed using `node --import tsx` because the workspace disallows the
`tsx` CLI's IPC socket. No application code changed in this inventory correction. The deployed shuttle endpoint
returns a plausible 6.46-mile / 15-minute drive for Pineville–Mount Shira and
rejects Cowskin. The atomic database activation preview returned no findings
after this scope correction; Elk remained inactive during the preview.

Additional private launch approvals, permitted photos and further documented
POIs are incremental data work. They are not prerequisites for publishing the
verified inventory. No phone call or field inspection is claimed.

Sources: MDC [Pineville](https://mdc.mo.gov/discover-nature/places/city-pineville-elk-river-access),
[Mount Shira](https://mdc.mo.gov/discover-nature/places/mount-shira-access),
[Cowskin](https://mdc.mo.gov/discover-nature/places/cowskin-access);
operator sources and per-field attribution in `services-elk-release-2026-10-04.csv`;
`elk-trestle-crossing.json` for the mapped structure.
