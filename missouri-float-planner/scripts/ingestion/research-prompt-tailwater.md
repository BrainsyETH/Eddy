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

## Preflight: audit what Eddy already ships

Before researching the outside world, inspect the current repository and
production inventory. Do not write the dossier as if this is a greenfield
system. Record what already exists for the dam/tailwater in:

- the dam registry, CWMS resolver, schedule provider, and shared dam types;
- gauge stations, gauge readings, river links, sections, and migrations;
- web/API/iOS dam and river surfaces, alerts, and AI condition wording;
- existing river dossiers, access artifacts, and
  `verified-identifiers-<slug>.md` files;
- `validate_river_data()` and the activation script.

For each existing capability return its path or database identity, current
behavior, and whether this onboarding reuses, extends, corrects, or replaces it.
Existing implementation proves a mechanism is available; it does not by itself
prove that the same signal meaning or safety claim is valid for this tailwater.

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
11. **Reuse Eddy's identifier gate.** Research may propose identifiers, but it
    may not self-certify them. The independent pass must record every accepted
    USGS site, CWMS office/location/series, schedule code, park/agency ID, and
    other production identifier in the existing
    `verified-identifiers-<slug>.md` artifact (or its future shared successor).
    If the repository already verifies an ID, cite that artifact and confirm
    that the station/series is still active rather than creating a second
    verification convention.
12. **Assign signal roles.** A dam release station, upper-tailwater water-quality
    sensor, tributary gauge, post-confluence gauge, and far-downstream gauge are
    not interchangeable “representative gauges.” Give every signal one or more
    explicit roles and state which reaches it must not represent.

## Required research

### A. Identity and operating system

Research the dam, reservoir, river, operator, hydropower marketer, purposes,
coordinates, official identifiers, powerhouse presence, current installed
nameplate capacity, number of units, planned capacity changes, schedule/load
capability, release phone, timezone, and operating agencies.

Current installed nameplate, planned post-project nameplate, and the power
marketer's short-term scheduling capability must be separate facts. They may all
be correct while carrying different numbers. Any schedule-to-cfs conversion
must keep the marketer's published scheduling MW paired with its own published
full-power discharge; substituting installed nameplate into only one half
silently changes every estimate. Reject nameplate values that come only from a
secondary source when a current operator document exists. Historic or
promotional engineering facts should remain in evidence unless they materially
help a fisherman understand the water.

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
limitations. Also assign `signal_role` from `dam_release`, `generation`,
`schedule`, `water_quality`, `local_stage_discharge`, `post_confluence`,
`tributary`, or `far_downstream`, plus `must_not_represent` reaches. Verify each
identifier on the primary source independently of the page that first mentioned
it, and route it through Eddy's identifier-verification artifact.

Explicitly answer:

- Is there a live stage/discharge gauge in the principal fishing reach?
- Which gauges are water-quality-only?
- Which gauges are discontinued?
- What is the nearest active stage/discharge gauge below the dam, and which
  major tributaries or other dam releases enter before it?
- Does the schedule exclude spillway or non-power releases?
- Can “not generating” coexist with a material total release?

For every researched metric, classify current product support:

- `supported_existing` — Eddy already stores or renders it correctly;
- `requires_feed_registration` — the product supports the metric but this
  source is not registered;
- `requires_schema_ui` — the source publishes it, but Eddy has no honest storage
  or presentation concept yet;
- `evidence_only` — useful research context with no production destination.

For example, finding dissolved oxygen does not make it ingestible if Eddy has no
DO field or UI. Record the feed as evidence and mark `requires_schema_ui`; do not
force it into temperature, stage, or discharge columns.

### C. Tailwater topology

Identify the official fishery extent and propose fishing/hydrologic reaches.
Reach boundaries must correspond to a real change such as:

- a major tributary or another dam-controlled inflow;
- a change in the representative gauge;
- a materially different fishing mode or water character;
- an official management boundary that changes the user decision.

Explicitly inspect the nearest downstream gauge for intervening tributaries and
other dam-controlled inflows. A gauge immediately below a major confluence can
be valuable for the lower reach while being disqualified from representing the
upper tailwater. Record that as a known bias, not as a reason to discard the
gauge or silently apply it upstream.

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

### I. Activation and validation fit

Inspect the current activation and validation code and state exactly how this
tailwater would pass it. Do not assume “no threshold ladder” means warnings
only: the current ordinary-river validator may treat a primary gauge with no
thresholds as an activation-blocking error.

Return:

- which existing checks apply unchanged;
- which checks are ordinary-river-only and inapplicable;
- which tailwater-specific checks must replace them;
- whether a migration or validator change is required before activation;
- which unsupported condition badge, alert, or AI paths must remain disabled.

Do not recommend accepting permanent validation errors or warnings. A
ladder-less tailwater needs regime-aware validation: verify an active release
source, correct location/unit/timestamp handling, forecast labeling, missing and
stale behavior, and the absence of unsupported local-safety inference.

## Required output

Return one Markdown dossier with these sections in order:

1. Executive recommendation
2. Existing Eddy support inventory
3. Source register
4. Accepted atomic facts (JSON)
5. Candidate facts (JSON)
6. Conflicts and resolutions
7. Human/configuration decisions required
8. Proposed hydrologic/fishing topology
9. Regulation-zone overlays
10. Gauge and feed inventory with signal roles (JSON)
11. Product-support matrix by metric
12. Access-point, boat-ramp, and campground inventory (JSON)
13. Current regulations and permits
14. Stable fishing profile
15. Release-propagation evidence
16. Condition-system supportability matrix
17. Activation and regime-aware validation plan
18. Machine-readable handoff
19. Explicit `do_not_ingest` list

The machine-readable handoff must retain `source_ids`, verification status, and
last-verified dates. Candidate access must use `public_status: "candidate"` or
`unknown`, never `public: true`. Official textual regulation boundaries must
use `geometry_status: "pending"` until mapped and reviewed.

End with three separate verdicts:

- **Ready for stable/reference ingestion**
- **Ready for live-feed registration**
- **Blocked from condition or safety claims**

Do not collapse them into one overall “ready” label.
