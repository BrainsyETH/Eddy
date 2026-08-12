# Research Brief: Dam, Tailwater & Fishery Ingestion Dossier

> Reusable deep-research prompt for onboarding one dam-controlled tailwater to
> Eddy. Return evidence, not production code. The coding/ingestion pass follows
> `TAILWATER-INGESTION.md` and may accept only independently verified facts.

Replace every `<PLACEHOLDER>` before starting:

- Dam: `<DAM_NAME>`
- Reservoir: `<LAKE_NAME>`
- Tailwater/river: `<TAILWATER_NAME>`
- State(s): `<STATE>`
- Suspected operator: `<OPERATOR_OR_UNKNOWN>`
- Initial official and local source leads: `<SOURCE_URLS>`

## Objective

Produce a source-complete evidence dossier that lets Eddy build a
fisherman-first destination page while preserving a hard distinction between:

1. what is measured at the dam;
2. what is measured at a downstream location;
3. what is scheduled or forecast;
4. what a source says about fishing or access; and
5. what Eddy can safely claim about present conditions.

Do not create code, migrations, production records, condition thresholds, or
unsourced prose. A missing value written as `UNKNOWN` is better than a plausible
one.

## Non-negotiable evidence rules

1. **Every atomic fact has a source.** Do not combine construction date,
   capacity, dimensions, and operator into one sourced sentence. One fact may
   be corrected without invalidating its neighbors.
2. **Use exact URLs.** Do not return abbreviated URLs, search-result URLs, or a
   publisher home page when a specific page, PDF, API response, or series page
   supports the claim.
3. **Prefer current primary sources.** Use the dam operator/PMA for operations,
   the state fish-and-wildlife agency for regulations and fishery boundaries,
   USGS/USACE for gauges, and the managing agency for access. Wikipedia,
   tourism pages, guide sites, forums, and resorts are discovery or local
   knowledge—not identifier, ownership, regulation, or capacity authorities.
4. **Record dates.** Every source entry needs `published_or_updated_at` when
   known and `retrieved_at`. Every accepted fact needs `last_verified_at`.
5. **Never average conflicts.** Record every claim, explain whether definitions
   or dates differ, and leave the production value unresolved when necessary.
6. **Keep units exact.** MW, MWh, generator count, cfs, stage/elevation, lake
   elevation, temperature, and dissolved oxygen are different measurements.
   Never convert or substitute them without an official conversion and an
   explicit inference label.
7. **Preserve location and datum.** Every water measurement must state where it
   is measured, its unit, vertical datum when applicable, cadence, observation
   versus forecast status, and source series identifier.
8. **Do not infer absence as zero.** A missing turbine series does not mean zero
   generation. A missing schedule does not mean no powerhouse. A seasonal DO
   sensor does not mean zero DO.
9. **Do not infer local wade safety.** Dam release, generator count, dam
   tailwater elevation, or a distant downstream gauge cannot by themselves
   establish whether a particular access is wadeable.
10. **Separate textual verification from map verification.** An official legal
    boundary description is not a mapped line or polygon until its landmarks
    have been placed and reviewed.

## Required research

### A. Identity and operating system

Research the dam, reservoir, river, operator, hydropower marketer, purposes,
coordinates, official identifiers, powerhouse presence, current installed
capacity, number of units, planned capacity changes, release phone, timezone,
and operating agencies.

Current and planned capacity must be separate facts. Reject nameplate values
that come only from a secondary source when a current operator document exists.
Historic or promotional engineering facts should remain in evidence unless
they materially help a fisherman understand the water.

### B. Live and forecast data feeds

Inventory every candidate source series for:

- total release;
- turbine release or generation flow;
- spillway/non-power release;
- generation/load;
- forward generation schedule;
- pool/headwater elevation;
- tailwater elevation at the dam;
- downstream stage/discharge;
- water temperature;
- dissolved oxygen;
- precipitation or relevant tributary gauges.

For each series return provider, office, exact identifier, exact URL/API route,
parameters, units, datum, cadence, latency, active/seasonal/discontinued status,
forecast/observation status, geographic position, reach represented, and known
limitations. Verify each identifier on the primary source independently of the
page that first mentioned it.

Explicitly answer:

- Is there a live stage/discharge gauge in the principal fishing reach?
- Which gauges are water-quality-only?
- Which gauges are discontinued?
- Does the schedule exclude spillway or non-power releases?
- Can “not generating” coexist with a material total release?

### C. Tailwater topology

Identify the official fishery extent and propose fishing/hydrologic reaches.
Reach boundaries must correspond to a real change such as:

- a major tributary or another dam-controlled inflow;
- a change in the representative gauge;
- a materially different fishing mode or water character;
- an official management boundary that changes the user decision.

Do not make every regulation zone a hydrologic reach. Return regulation zones
as independent overlays. A major confluence that changes both hydrology and
regulations should normally be a reach boundary.

For every proposed reach provide upstream/downstream landmarks, rationale,
candidate geometry or river mile, representative observations, tributary
influences, fishing character, and `verified`, `candidate`, or `unknown` status.

### D. Access points, boat ramps, campgrounds, and private services

Research all named:

- public boat ramps;
- walk-in or bank-fishing accesses;
- wade accesses;
- public and private campgrounds near the tailwater, whether or not they include
  river access;
- parks and campgrounds with direct river access;
- private or fee ramps;
- private resorts that are services but not public access.

**Campgrounds are required, not an optional enrichment.** Make a documented
search for federal, state, municipal, private-resort, and independent camping
options serving the fishery. If none are found, return an empty campground list
plus the agencies/directories searched. Do not infer that lodging, a resort, or
river frontage permits camping.

For every location return:

```json
{
  "name": "",
  "aliases": [],
  "access_types": ["boat_ramp", "walk_in", "bank", "wade", "campground"],
  "claimed_public": null,
  "public_status": "verified_public | verified_private | fee_access | candidate | unknown",
  "owner": null,
  "manager": null,
  "fee": null,
  "current_status": "open | closed | seasonal | unknown",
  "facility_lat": null,
  "facility_lon": null,
  "launch_lat": null,
  "launch_lon": null,
  "trailhead_lat": null,
  "trailhead_lon": null,
  "coordinate_status": "official_exact | corroborated | facility_centroid | candidate | unknown",
  "parking": null,
  "restrooms": null,
  "camping": {
    "available": null,
    "campground_type": "developed | primitive | dispersed | resort | unknown",
    "tent_sites": null,
    "rv_sites": null,
    "electric_sites": null,
    "full_hookup_sites": null,
    "reservations": "required | accepted | first_come | unknown",
    "reservation_url": null,
    "season": null,
    "nightly_fee": null,
    "river_access_included": null,
    "boat_ramp_included": null
  },
  "launch_limitations": null,
  "applicable_regulation_zones": [],
  "source_ids": [],
  "last_verified_at": "YYYY-MM-DD",
  "notes": ""
}
```

Do not set `verified_public` from a guide, resort, tourism page, map pin, or
historic map alone. Verify ownership, current availability, and coordinates
against the managing agency. Keep a facility centroid distinct from the actual
ramp or trailhead. Do not convert private river frontage into public access.
For campgrounds, verify site type, utilities, season, fees/reservations, and
whether river or ramp access is included against the operator's current page.

### E. Regulations and permits

Use the current state guidebook/code and agency updates. Research licenses,
trout permits, creel and length limits, tackle rules, closures, special areas,
night restrictions, emergency orders, and seasonal regulations.

For every rule return atomic rule text, authority, exact source URL, scope,
`effective_at`, `confirmed_current_at`, `expires_at`, “until further notice”
status, and re-verification cadence.

For every zone return:

- the exact official textual boundary;
- text verification status;
- proposed map geometry, if any;
- geometry verification status;
- permanent, seasonal, or temporary status.

Never treat an old guidebook as current merely because its zone description is
still useful. Record current creel rules separately from permanent zone rules.

### F. Stable fishing profile

Research officially supported species, stocking versus natural reproduction,
fishery character, seasonal patterns, reach-specific fishing modes, crowding,
and stable local knowledge. Attribute guide/resort observations.

Separate:

- `accepted_fact` — current primary or strongly corroborated evidence;
- `candidate_local_expert` — useful attributed guidance;
- `volatile_report` — dated fishing report, not evergreen copy;
- `promotional` — exclude from production unless independently verified.

Do not turn lure recommendations, “ideal flow” ranges, fish-per-mile claims, or
arrival-time folklore into safety thresholds.

### G. Release propagation and warnings

Capture local observations about rise/fall travel only as evidence. For each
estimate record source, assumed release pattern, destination, distance,
estimate, date, and the source’s safety disclaimer. Research horns, strobes,
posted warnings, areas where horns are not audible, and official release phone
numbers.

Never output a “safe until” time. Never label a propagation estimate measured
unless it comes from a documented, repeatable monitoring study.

### H. Condition-system supportability

Evaluate each possible display claim independently:

- raw total release at dam;
- generating/not generating/unknown;
- turbine versus non-power release;
- release rising/falling at the dam;
- schedule/forecast;
- pool elevation;
- tailwater elevation at the dam;
- temperature and DO at each sensor;
- downstream stage/discharge at each gauge;
- wadeable at a named access;
- boat-oriented or wade-oriented editorial guidance;
- dangerous/rapidly changing at a named reach.

For each return `production_safe`, `editorial_only`, or `unsupported`, with the
exact basis and limitation. Raw release can be production-safe while a
qualitative “high” classification remains unsupported. `Spillway release
active` may be supportable as an operational fact without implying a local
wade-depth verdict. A zero-generation interval is a **generation-idle window**,
not a “wading window”: total/non-power release may continue, and water already
released may still be moving through downstream reaches.

## Required output

Return one Markdown dossier with these sections in order:

1. Executive recommendation
2. Source register
3. Accepted atomic facts (JSON)
4. Candidate facts (JSON)
5. Conflicts and resolutions
6. Human decisions required
7. Proposed hydrologic/fishing topology
8. Regulation-zone overlays
9. Gauge and feed inventory (JSON)
10. Access-point, boat-ramp, and campground inventory (JSON)
11. Current regulations and permits
12. Stable fishing profile
13. Release-propagation evidence
14. Condition-system supportability matrix
15. Machine-readable handoff
16. Explicit `do_not_ingest` list

The machine-readable handoff must retain `source_ids`, verification status, and
last-verified dates. Candidate access must use `public_status: "candidate"` or
`unknown`, never `public: true`. Official textual regulation boundaries must
use `geometry_status: "pending"` until mapped and reviewed.

End with three separate verdicts:

- **Ready for stable/reference ingestion**
- **Ready for live-feed registration**
- **Blocked from condition or safety claims**

Do not collapse them into one overall “ready” label.
