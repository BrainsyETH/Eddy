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
  → approve topology, signal roles, and the ENTITY MODEL [human]
  → register dam + live/forecast series
  → import river geometry (NHD)
  → ingest stable fishery/reference facts
  → map regulation geometry [human]
  → verify access/ramp/campground data [human]
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

Then draft — do not yet approve — the **production entity model**:

- canonical display name;
- state and slug, checked against existing rows for collision;
- dedicated tailwater entity versus a reach of an existing river;
- upstream and downstream geometry endpoints, with a source for each;
- relationship to the dam entity;
- relationship to the larger river;
- whether future downstream coverage can extend this entity or must launch as
  its own.

It is a draft here and approved at the end of Phase 4 rather than now, because
the central question — dedicated entity or reach of a bigger river — depends on
what Phase 3 finds. On the White River the answer *is* the gauge landscape:
with no live gauge in the trophy reach and two different dams feeding the water
below, a generic `white-river` entity would have had no coherent primary
condition. You cannot know that before verifying the feeds.

Note that the **geometry endpoints are entity decisions**, not implementation
details. "Where does this river stop" and "can this entity extend downstream
later" are the same question, and the trim coordinates that answer it belong in
the approved model rather than in a script config.

## Phase 2 — Produce the evidence dossier

Run a one-time deep-research session with `research-prompt-tailwater.md`. Save
the unmodified output as a dated evidence artifact. The research pass may
classify evidence; it may not sign off production values.

Required outputs include exact source URLs, atomic facts, conflicts, topology,
feeds, accesses, regulation zones, condition supportability, and a
`do_not_ingest` list.

## Phase 3 — Independent verification

A second pass checks primary sources without relying on the research prose.

Use the same verification artifact as ordinary river ingestion, named
**`verified-identifiers-tailwater-<dam-id>.md`** — by the dam, not the river
slug, because verification happens *before* the entity model is approved and a
file named for a slug that may still change is a file that gets orphaned.

**A convention is not a gate.** For an ordinary river the artifact is enforced
mechanically: `ingest-dossier.ts` refuses to run when a dossier names a site the
file does not. A tailwater has no importer — it reaches production through the
registry and hand-written migrations — so until one exists, the implementation
PR must carry an automated check that:

- every registered release station and downstream gauge appears in an artifact;
- every CWMS office/location and schedule code appears;
- nothing listed under a `DO NOT WIRE` heading is registered anywhere.

`scripts/ingestion/verified-identifiers.test.ts` is that check. It parses the
artifacts' own `DO NOT WIRE` sections into an enforced denylist, so the document
and the mechanism are the same object and cannot drift apart. Without it, the
first tailwater's artifact was written by the same pass that chose the
identifiers and contradicted by nothing — self-graded, which is the failure this
gate exists to prevent.

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

The registry carries those roles in separate fields —
`UsaceDam.tailwater.releaseStationId` and `.downstreamGaugeSiteIds` (nearest
first) — so a tailwater states which release drives it and which gauges measure
it, rather than leaving one field to mean both. Both are required. Listing a
gauge does not endorse it as representative of the whole reach; distance and
intervening inflows live in the dossier and in `river_gauges`.

The wire is deliberately narrower: `DamTailwater.gaugeSiteId` carries the
nearest downstream gauge only, because a shipped iOS build opens a gauge screen
from that exact key. Server-side callers that need the whole set use
`tailwaterGaugeSiteIds()`.

Know what each field switches on before choosing it. `/api/high-water` lists a
dam only when one of its downstream gauges is graded elevated — so a tailwater
whose gauges carry no ladder never appears there, silently, no matter how much
water the dam is releasing. That is a defensible launch state; it is not a
defensible surprise. Decide it, write it down, and check the surface after
activation rather than assuming a dam with a release feed shows up everywhere a
dam can show up.

Now approve the entity model drafted in Phase 1, with Phase 3's findings in
hand. Record the decision and its date somewhere durable — an approval that
exists only in a chat message is not one.

**Gate:** unsupported claims get no condition code, threshold, notification, or
AI prompt language.

**Gate:** no river row, geometry, migration, or dam-to-river link is created
until the entity model and slug are approved. Everything downstream of this
point is expensive to reverse: a slug change means a migration, a regenerated
geometry, a registry edit, and any access points already placed against it.

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
- water temperature — Eddy has a home for this (`tailwaterTempF`);
- dissolved oxygen — Eddy has none, and no column it fits in. `requires_schema_ui`,
  not `requires_feed_registration`; the two are one bullet only in research
  writeups, never in an implementation plan;
- forward schedule.

Classify every metric before implementation:

- `supported_existing`;
- `requires_feed_registration`;
- `requires_schema_ui`;
- `evidence_only`.

Only the first two enter an ingestion implementation. A published DO series,
for example, remains `requires_schema_ui` until Eddy has a DO model and honest
surface; it must not be squeezed into existing gauge-reading columns.

Preserve source units. Preserve the source's time convention — SWPA publishes
hour-ENDING, and another marketer may not;
render it through shared schedule helpers. Missing metrics remain absent, never
zero. Forecasts and observations never share an unlabeled series.

When total release should behave as a river discharge, link it through the
normal flow-provider/gauge-reading path. Do not assign a water-quality-only
USGS station as a representative flow gauge.

**Gate:** live smoke tests must confirm a plausible value, timestamp, unit,
location, staleness state, and missing-data behavior for every registered
series.

## Phase 6 — Ingest stable/reference information

### First: the river row itself must be able to activate

Two columns block activation outright and neither is about the fishery, so
both are easy to leave for later and discover at the end:

- **`rivers.river_type` must be `dam_tailwater`.** It is a required column
  (`missing_river_type` is an error), it is already in the table's CHECK
  constraint, and regime-aware validation keys off it — a tailwater typed
  anything else gets graded as an ordinary river and fails on a ladder it
  should never have had.
- **`rivers.geom` must be populated.** `missing_geometry` is an error too.
  Geometry comes from NHD, the same way an ordinary river gets it: add the
  river to the `RIVERS` list in `scripts/import-nhd-rivers-from-tnm.ts` (NHD HR
  HUC8, multi-HUC supported) and run it with `--apply`. Then verify the
  endpoints against the real boundaries and the length against a published
  figure before trusting it — an earlier import shipped a 47 km junk polyline
  that had to be redone.

A tailwater's endpoints are worth checking twice, because its extent is a
management decision rather than a natural feature: the flowline runs to the
confluence, while the reach Eddy launched may stop at a bridge named in a
regulation.

### Then the reference facts

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

### Researched is not the same as launch-blocking

Keep the two rules apart, or every module becomes a launch dependency and the
page never ships:

- **searching is mandatory** — access points, ramps, campgrounds, all of it,
  and "none found" is a documented result rather than a skipped step;
- **unverified candidates stay unpublished** — they live in the evidence, not
  on the page;
- **everything published is fully verified** — no partial rows, no "probably
  public";
- **an empty verified set does not block activation.** A tailwater with no
  verified campground launches without a campground module; one with no
  verified access map launches without pins.

This is how the rest of Eddy already behaves: a metric a dam does not publish
is *absent* from its payload, never zero, and every consumer is built with a
nothing-to-show layout. A module that is honestly missing is a smaller problem
than a module that is present and wrong — and far smaller than a page that
never launches because one optional module could not be finished.

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

The ordinary river validator expects an active primary gauge and a condition
threshold ladder. A ladder-less tailwater does not merely warn — it cannot
activate at all, and **both** ways out are errors, which is why this reads as a
puzzle rather than a wall the first time:

```
primary gauge, no thresholds  →  missing_thresholds   error
gauges but none primary       →  no_primary_gauge     error
```

`activate-rivers.ts` auto-rolls-back on either. The three anchor checks added
in migration `00164` (`no_dangerous_anchor`, `no_optimal_max_anchor`,
`no_too_low_anchor`) are only warnings AND carry a ladder guard, so they fire on
a partial ladder and stay silent on an absent one — reading them alone suggests
the situation is milder than it is.

`20260812220000_regime_aware_validation_for_dam_tailwaters` resolves this for
`river_type = 'dam_tailwater'`: the four ladder checks stop applying, and four
others replace them in the same gate — `tailwater_no_release_source` (error),
`tailwater_release_stale` (warning, 12h), `tailwater_badge_ungated` (warning),
and `primary_gauge_no_flow_params` (error, every regime — a station publishing
neither 00060 nor 00065 cannot feed the condition system at all).

Inspect the live function before every launch anyway; the paragraph above is
true as written and will stop being true the day someone changes it.

Do not activate with validation **errors**, or with **unexplained warnings**,
and never add fabricated thresholds to make the validator green.

Errors and warnings are not the same thing and the rule must not treat them as
one. A warning frequently marks an intentional absence — no weather point yet,
no regulation geometry, no campground found, a badge a regime deliberately does
not have — and Eddy already ships some on purpose: `no_dangerous` and
`no_too_low` are left live on spring-fed rivers as documented gaps. A blanket
"no warnings" rule would forbid those, which in practice means it gets ignored,
which is warning fatigue arriving by a different road.

So: every warning still standing at activation is **explicitly waived, with a
reason, an owner, and a review date**. A waiver needs somewhere durable to live
or it rots — `activate-rivers.ts` reads the waiver list and prints only
*unwaived* warnings, and a waiver past its review date resurfaces on its own.

The regimes:

- ordinary rivers retain primary-gauge and ladder checks;
- dam tailwaters require an active release source, verified unit/location,
  usable timestamp and freshness behavior, and honest missing-data handling;
- scheduled projects require a verified schedule source, correct timezone/hour
  convention, forecast labeling, and the source disclaimer;
- local condition badges, alerts, and AI wording remain disabled unless their
  local rating is independently calibrated.

Exempting a tailwater from irrelevant ladder checks is acceptable only when the
tailwater-specific checks replace them in the same launch gate.

**The last of those is not enforced by validation, and cannot currently be.**
`computeCondition()` has no concept of `river_type`; it grades whatever
thresholds it is handed. So a tailwater whose primary gauge carries thresholds
IS being graded, with float-condition vocabulary, over release-at-dam numbers.
`tailwater_badge_ungated` names that hazard; it does not prevent it. Making the
badge itself regime-aware is a rendering change in `shared/condition-system.ts`,
and until it exists, "the badge stays off" is a human commitment, not a gate.

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
- temporary/emergency rules: on an automated schedule, at least weekly —
  **never during app startup or page render.** Re-verification is not
  retrieval, and the two must not be fused. Parsing a state agency's page while
  a fisherman opens Eddy puts their load time and their reliability behind
  someone else's web server, on the screen where that matters most. Instead:
  recheck on a schedule against the official source; store `checked_at`,
  `effective_at` and the source URL; display the last value Eddy verified;
  warn or suppress once the freshness window expires; **never silently retain
  an expired temporary rule.** Link out to the live official page — linking is
  cheap and always current, which is exactly what parsing at display time is
  trying and failing to be.

  Pick warn-versus-suppress per rule class, in advance, and not at the moment
  it fires. A creel limit is a legal claim, so an expired one suppresses and
  links out — a stale-data banner beside a wrong number is still a wrong
  number. A softer rule may be fine displayed with its date;
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
- [ ] `rivers.river_type` is `dam_tailwater` and `rivers.geom` is imported and
      endpoint-checked — both are activation errors, neither is about fish.
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
      found. Searching is mandatory; FINDING one is not, and an empty result
      does not block the page.
- [ ] Every PUBLISHED campground has verified type, utilities, fees/season,
      reservations and river/ramp-access status; unverified candidates remain
      unpublished.
- [ ] Private resorts remain private/fee services unless verified otherwise.
- [ ] MW, MWh, cfs, generator count, stage, and elevation remain distinct.
- [ ] Missing or seasonal metrics render as unknown/absent, never zero.
- [ ] Generation-idle periods are not labeled “water off” or “wading windows.”
- [ ] Release station and downstream gauges are separate registry fields, and
      every surface keyed off them (high-water especially) was checked after
      activation rather than assumed.
- [ ] Regime-aware validation replaces inapplicable ladder checks and passes
      without permanent errors or warnings.
- [ ] Live and failure-path smoke tests pass.
- [ ] Every activated claim has the appropriate independent signoff.
