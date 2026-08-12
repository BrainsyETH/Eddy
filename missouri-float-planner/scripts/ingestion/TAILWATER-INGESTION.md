# Eddy Tailwater Onboarding — Canonical Process

> Use this process for a dam-controlled fishing reach. Ordinary rain- or
> spring-driven rivers continue to use `README.md` and `dossier.ts`. A tailwater
> may also become a normal river entity/reach, but its operational condition is
> sourced from releases, schedules, local gauges, and water-quality sensors—not
> automatically from the river threshold ladder.

## Pipeline

```text
audit existing Eddy support
  → scope the system
  → deep research evidence dossier
  → independent identifier/current-fact verification
  → approve topology and supported claims
  → register dam + live/forecast series
  → ingest stable fishery/reference facts
  → map regulation geometry [human]
  → verify access/ramp coordinates [human]
  → build fisherman-first page
  → live smoke test and safety review
  → activate
  → scheduled re-verification
```

Research evidence is not an ingestion manifest. A coding agent may not convert
every accepted-looking line in the dossier into production data. Each phase
below has its own gate.

## Phase 0 — Audit existing Eddy support

Before external research, inventory the repository and current data. Check the
dam registry and resolver, schedule provider, shared API contract, migrations,
gauge stations/readings, river and section links, existing dossiers and verified
identifier artifacts, access artifacts, alerts, web/API/iOS surfaces, AI
wording, and activation validation.

Record each relevant capability as `reuse`, `extend`, `correct`, or `missing`.
This prevents a research handoff from proposing a second implementation of a
pattern Eddy already ships. It also exposes product gaps early: a live source
can publish dissolved oxygen while Eddy still has no DO storage or UI.

An existing pattern proves mechanics, not semantics. Reusing a release provider
does not automatically decide which downstream gauge represents a reach or
authorize local wadeability claims.

## Phase 1 — Scope the system

Write down four distinct boundaries before researching:

1. the dam/reservoir project;
2. the hydrologic tailwater beginning at the dam;
3. the officially managed fishery;
4. the portion Eddy intends to launch.

They are often different. A no-fishing zone below the dam does not move the
hydrologic boundary. A state-managed trout boundary does not prove a single
condition source represents the entire distance.

## Phase 2 — Produce the evidence dossier

Run a one-time deep-research session with `research-prompt-tailwater.md`. Save
the unmodified output as a dated evidence artifact. The research pass may
classify evidence; it may not sign off production values.

Required outputs include exact source URLs, atomic facts, conflicts, topology,
feeds, accesses, regulation zones, condition supportability, and a
`do_not_ingest` list.

## Phase 3 — Independent verification

A second pass checks primary sources without relying on the research prose.
Use the same `verified-identifiers-<slug>.md` gate as ordinary river ingestion,
or its future shared successor; do not create a prose-only tailwater substitute.
Verify at minimum:

- dam/operator/PMA identifiers;
- CWMS office, location, and timeseries identifiers;
- SWPA or other schedule project code and hour convention;
- USGS site IDs, parameters, active dates, coordinates, and datums;
- current installed nameplate, planned post-upgrade nameplate, and separate
  schedule/load capability;
- official fishery extent;
- current regulation text and effective dates;
- owner/manager claims for any access proposed as public.

Record conflicts rather than choosing the newest-looking number. “Current” and
“planned” nameplate and “schedule capability” are separate values. Preserve a
power marketer's schedule MW/full-power-cfs pair for conversion even when it
differs from operator nameplate. A historic gauge remains metadata and must not
enter the polling path.

**Gate:** no identifier reaches a registry, migration, or database row until it
has been confirmed on its primary source.

## Phase 4 — Approve topology, signal roles, and claim vocabulary

Approve hydrologic/fishing reaches independently from regulation overlays.
Major tributaries, another dam-controlled inflow, a representative-gauge
change, and a material fishing-mode change are valid reach boundaries. Access
points and minor rule zones are usually map features, not separate reaches.

For every page claim, sign off one of:

- `operational_fact` — directly measured at a named location;
- `forecast` — scheduled or modeled and clearly labeled;
- `local_observation` — attributed editorial guidance;
- `unsupported` — stored only in evidence and not displayed.

Examples:

- `Total release at dam: 8,200 cfs` can be an operational fact.
- `Generating` can be an operational fact only when turbine flow supports it.
- `Not generating` does not imply low total release.
- A schedule gap is a generation-idle window, not a wading window.
- `Release rising at dam` does not imply the rise has reached Cotter.
- `Wadeable at Rim Shoals` is unsupported without a local, sourced rating.
- `Spillway release active` can be an operational fact without being converted
  into an unsourced local danger threshold.

Assign each live source an explicit role: dam release, generation, schedule,
water quality, local reach gauge, post-confluence gauge, tributary gauge, or
far-downstream gauge. A post-confluence gauge may represent a lower reach while
being prohibited from describing upstream water.

Prefer explicit identifiers such as `releaseStationId` and
`downstreamGaugeSiteIds` over overloading one `gaugeSiteId` with both meanings.
If the current contract permits only one field, document the temporary meaning
and required refactor rather than silently choosing a mixed downstream gauge.

**Gate:** unsupported claims get no condition code, threshold, notification, or
AI prompt language.

## Phase 5 — Register live and forecast sources

Dam pages are read-through surfaces. Register stable source metadata; do not
persist transient pool, schedule, or water-quality snapshots merely because
they appeared in the research dossier.

For USACE/SWPA projects, update the verified registry and resolver inputs in:

- `src/lib/flow-providers/usace-registry.ts`
- `src/lib/usace/resolve.ts`
- `src/lib/usace/swpa.ts`
- `shared/dam-types.ts` only when the shared wire contract truly changes

Keep independent fields for:

- total release;
- turbine/generation flow;
- spillway or non-power release when published;
- pool elevation;
- tailwater elevation at the dam;
- temperature/DO;
- forward schedule.

Classify every metric before implementation:

- `supported_existing`;
- `requires_feed_registration`;
- `requires_schema_ui`;
- `evidence_only`.

Only the first two enter an ingestion implementation. A published DO series,
for example, remains `requires_schema_ui` until Eddy has a DO model and honest
surface; it must not be squeezed into existing gauge-reading columns.

Preserve source units. Schedule load uses the source’s hour-ending convention;
render it through shared schedule helpers. Missing metrics remain absent, never
zero. Forecasts and observations never share an unlabeled series.

When total release should behave as a river discharge, link it through the
normal flow-provider/gauge-reading path. Do not assign a water-quality-only
USGS station as a representative flow gauge.

**Gate:** live smoke tests must confirm a plausible value, timestamp, unit,
location, staleness state, and missing-data behavior for every registered
series.

## Phase 6 — Ingest stable/reference information

Stable facts may include canonical names, operator, fishery extent, verified
species, stable reach descriptions, official source links, and verified
regulation text. Engineering trivia and promotional statistics stay in the
evidence dossier unless they support a user decision.

Do not ingest one compound paragraph where atomic facts are expected. Every
stored fact needs provenance and `last_verified_at`. Temporary regulations also
need `effective_at`, `expires_at` when known, `until_further_notice`, and a
re-verification cadence.

If Eddy has no regulation-summary or creel-limit surface, keep volatile limits
out of v1 production data and link the current official authority instead. Add
structured ingestion and re-verification only when a consuming surface exists.

**Gate:** a temporary regulation may display only with an official link,
effective/current dates, and a visible temporary-rule label.

## Phase 7 — Map regulation zones [human]

Store official legal text separately from geometry. Descriptions such as “the
first power line downstream,” “park boundary,” or “signed area” are
text-verified but not spatially verified.

For each zone record:

- exact official description;
- authority and URL;
- permanent/seasonal/temporary status;
- text verification status;
- geometry verification status;
- manually reviewed endpoints or polygon;
- last-verified date.

**Gate:** do not draw a precise rule overlay or answer “which rule applies
here?” until the geometry is manually reviewed.

## Phase 8 — Verify access points, boat ramps, and campgrounds [human]

Research candidates first; publish access second. For every candidate verify:

- official name and aliases;
- public, private, fee, seasonal, or unknown status;
- owner and manager;
- current open/closed status;
- boat ramp versus walk-in/bank/wade access;
- actual launch, parking, and trailhead coordinates;
- facilities and launch limitations;
- applicable regulation zones;
- authoritative URL and last-verified date.

Campground research is required for every tailwater, even when the result is
“none found.” Search federal, state, municipal, private-resort, and independent
operators serving the fishery. For every campground additionally verify:

- developed, primitive, dispersed, or resort camping;
- tent, RV, electric, and full-hookup availability;
- reservation policy and current reservation URL;
- operating season and current nightly/day-use fees when published;
- restrooms, potable water, showers, dump station, and other material
  facilities;
- whether camping includes direct river access or a boat ramp;
- whether access is public, guest-only, day-use-fee, or otherwise restricted.

A campground near the river is not automatically a river access, and a private
campground's gravel bar or ramp is not public merely because guests may use it.

An agency facility page can verify a park without verifying the ramp pin. A
tourism page, guide article, old map, geocoder, or private-resort page is not
enough to mark an access public. Store candidates as `public_status=candidate`
and coordinates as pending. Keep private resorts in the services system unless
their fee-access terms are explicitly verified.

Run the existing access importer only after producing the normal
`access-points/<slug>.json` artifact. Load pending, snap to the river, review
distance/order, then approve only the exact points that passed.

**Gate:** no candidate is published as public and no facility centroid is
presented as a boat ramp. No campground is published without verified camping
type, operator, current status, and an explicit river/ramp-access value.

## Phase 9 — Build the fisherman-first page

The page order is:

1. current operational state and freshness;
2. generation/release schedule and disclaimer;
3. plain-language explanation of each measurement;
4. tailwater map and verified access;
5. fishing/hydrologic reaches;
6. current regulations and overlays;
7. stable fishing profile and attributed local knowledge;
8. sources and last-reviewed dates.

Render only supported modules. A warmwater project need not show trout content;
a dam with no powerhouse must not show “0 generation”; a tailwater with no
verified access map may launch without candidate pins.

No countdown may say or imply “safe until.” Propagation estimates, if product
signoff permits them at all, must be attributed, visibly approximate, and
separate from live safety status.

Use “generation idle” or “no generation scheduled,” never “water off” or
“wading window,” unless an independently measured local condition actually
supports that statement. Non-power release may continue while turbines are
idle, and previously released water remains downstream.

## Phase 10 — Regime-aware validation and activation

The ordinary river validator currently expects an active primary gauge and a
condition threshold ladder. A primary gauge with no thresholds may be an
activation-blocking `missing_thresholds` error—not merely a set of warnings.
Inspect the live function before every launch.

Do not accept permanent validation errors/warnings and do not add fabricated
thresholds to make the validator green. Implement regime-aware validation:

- ordinary rivers retain primary-gauge and ladder checks;
- dam tailwaters require an active release source, verified unit/location,
  usable timestamp and freshness behavior, and honest missing-data handling;
- scheduled projects require a verified schedule source, correct timezone/hour
  convention, forecast labeling, and the source disclaimer;
- local condition badges, alerts, and AI wording remain disabled unless their
  local rating is independently calibrated.

Exempting a tailwater from irrelevant ladder checks is acceptable only when the
tailwater-specific checks replace them in the same launch gate.

Before activation, test:

- live total release against the operator’s current display;
- generating/not-generating against turbine flow, not total flow;
- non-power release behavior;
- stale, missing, seasonal, and daily-mean states;
- schedule date, timezone, hour-ending interpretation, ramp hours, and source
  disclaimer;
- upstream lake level versus tailwater elevation labels;
- every visible access pin and public/private label;
- every visible regulation against the current official source;
- reach selection around major confluences and gauge changes;
- web, API, iOS, alerts, and AI wording for unsupported safety inference.

Activation requires separate signoff for:

- stable/reference content;
- live-feed registration;
- access points;
- regulation geometry;
- condition/safety vocabulary.

One signoff does not imply the others.

## Phase 11 — Re-verification

Recheck on different cadences:

- live feed health and series resolution: automated, continuously;
- temporary/emergency rules: at least weekly and at app startup/display time
  when practical;
- annual guidebook regulations: at each effective-date cycle;
- access ownership, fees, and closures: seasonally;
- installed capacity and operator metadata: annually or when projects change;
- stable fishing prose: editorial review annually;
- local fishing reports: dated/expiring content, never evergreen ingestion.

If a source becomes stale or disappears, retain the last verified evidence but
degrade or hide the claim according to its risk. Do not silently fall back from
an official source to a blog or distant gauge.

## Launch checklist

- [ ] Four system boundaries are explicit.
- [ ] Existing Eddy support audited and every relevant capability classified as
      reuse, extend, correct, or missing.
- [ ] Exact primary-source URLs and identifiers independently verified.
- [ ] Existing identifier verification artifact reused; no parallel prose-only
      verification path created.
- [ ] Installed, planned, and schedule-capability MW are separate; schedule MW
      remains paired with its published full-power cfs.
- [ ] Every live source has an explicit signal role and upstream/downstream
      exclusions.
- [ ] Every metric is classified for current product support; schema/UI gaps are
      not mislabeled ingestion work.
- [ ] Raw operations, forecasts, local observations, and unsupported claims are
      distinct.
- [ ] No local wadeability inferred from dam release or a distant gauge.
- [ ] Major tributary/dam inflows represented in topology.
- [ ] Regulation text and geometry have separate statuses.
- [ ] Temporary rules carry effective/current dates and recheck cadence.
- [ ] Candidate access does not claim `public=true`.
- [ ] Ramp, parking, trailhead, and facility coordinates are not conflated.
- [ ] Required campground search completed; absence is documented when none are
      found.
- [ ] Campground type, utilities, fees/season, reservations, and river/ramp
      access are independently verified.
- [ ] Private resorts remain private/fee services unless verified otherwise.
- [ ] MW, MWh, cfs, generator count, stage, and elevation remain distinct.
- [ ] Missing or seasonal metrics render as unknown/absent, never zero.
- [ ] Generation-idle periods are not labeled “water off” or “wading windows.”
- [ ] Regime-aware validation replaces inapplicable ladder checks and passes
      without permanent errors or warnings.
- [ ] Live and failure-path smoke tests pass.
- [ ] Every activated claim has the appropriate independent signoff.
