# eddy.guide — Multi-State Scaling Audit & Data Ingestion Plan

> Readiness audit of the codebase against multi-state / multi-source expansion, a verified
> data-source landscape, a ranked target shortlist, a per-river ingestion runbook, and a phased
> roadmap. This document extends — and does not replace — `docs/RIVER_SCALING_PLAYBOOK.md`,
> which remains the operative guide for **in-Missouri** river additions.
>
> Audit date: 2026-07-01. All file/line references verified against the repo at that date.

---

## 1. Executive summary

Eddy's data layer is in better shape than a typical single-region app — condition thresholds, gauges,
access points, mileage, and sitemap/metadata are all data-driven — but the platform cannot take a
non-Missouri river today for five concrete reasons: flow ingestion is hardwired to the **legacy USGS
API that is being decommissioned in Q1 2027** (with possible degradation from August 2026), there is
no flow-provider abstraction (the gauge table *is* a USGS table), the schema has no
state/country/timezone on rivers, Central Time and Missouri (`area=MO`, park code `ozar`) are baked
into weather/alerts/social/AI code, and the entire Eddy AI layer (knowledge file, chat prompt, update
prompts, quote notes) encodes the spring-fed Ozark archetype as prose and hardcoded slug maps. The
right sequence is: do the **Phase 0 refactor** (USGS legacy→modern migration bundled with a
`FlowProvider` interface, multi-region schema columns, timezone parameterization, and moving four
hardcoded per-river maps into the database) while continuing **in-Missouri** growth on the existing
playbook, then run a **pilot on one adjacent Arkansas Ozark river** of the same hydrological
archetype to prove the runbook end-to-end, then scale down the ranked shortlist (Arkansas → Oklahoma
Illinois River → Texas Hill Country) in order of hydrological similarity, not market size. The single
biggest risk to scaling *well* is **unsafe model transfer**: the seven-level taxonomy's semantics
("low = scraping gravel bars", strainers as the #1 hazard, slow spring-fed recovery) and the float
speed model are calibrated to one river archetype, and applying them uncalibrated to a
dam-controlled, flashy rain-driven, or snowmelt river would produce condition advice that is wrong in
ways that endanger users — every new river must be classified by type and calibrated/validated
per-river before its condition badge goes live. The second risk is operational: per-river curation
(access law, hazards, thresholds, local knowledge) is 10–20 human-hours per river and is the true
rate limiter — the plan below queues it explicitly rather than pretending it automates away.
A significant licensing finding: **American Whitewater's terms prohibit data harvesting**, so it can
serve as a manual calibration reference or a formal partnership, but not an ingestion source.

---

## 2. Readiness findings

Severity: **blocker** = must be fixed before any non-Missouri river ships; **friction** = fix during
expansion (slows onboarding or degrades quality but doesn't prevent launch); **cosmetic** = branding
or copy.

### 2A. Must fix before any expansion (Phase 0)

#### F1 — Flow ingestion is on the legacy USGS API being decommissioned (blocker — and a continuity risk even with zero expansion)

- `src/lib/usgs/gauges.ts:77` — `new URL('https://waterservices.usgs.gov/nwis/iv/')` (current readings)
- `src/lib/usgs/gauges.ts:220` — `new URL('https://waterservices.usgs.gov/nwis/stat/')` (daily statistics)
- `src/lib/usgs/gauges.ts:449` — `new URL('https://waterservices.usgs.gov/nwis/iv/')` (7-day history)

USGS has announced WaterServices will be decommissioned in **Q1 2027**, with details on possible
intentional degradation/blackouts coming in H2 2026 and no degradation before **August 2026**. The
replacement is the modern OGC-based platform at `api.waterdata.usgs.gov` (`/latest-continuous`,
`/continuous`, `/daily`; API key required above a low request rate).

**Smallest change:** migrate the three fetch functions to the modern endpoints. **Recommended
change:** do the migration *as* the first implementation of the `FlowProvider` interface (F2), so the
work is done once. This is a prerequisite regardless of expansion.

#### F2 — No flow-provider abstraction; the gauge model is a USGS model (blocker)

- `supabase/migrations/00002_tables.sql:42` — `usgs_site_id TEXT UNIQUE NOT NULL` on `gauge_stations`;
  no `provider`/`source` column anywhere.
- `src/lib/usgs/gauges.ts` — USGS response types (`USGSResponse`, `USGSTimeSeries`), parameter codes
  `00060`/`00065` hardcoded at lines 80, 225, 452; parsing, unit assumptions, and freshness handling
  all live here with no interface in front of them.
- `src/app/api/cron/update-gauges/route.ts:7` — cron imports `fetchGaugeReadings` (USGS) directly;
  the polling loop is single-source.
- `src/app/api/conditions/[riverId]/route.ts:456` — the condition API response embeds a USGS
  monitoring-location URL (`usgsUrl`), leaking the provider into the public API and UI
  (`GaugeDetailView.tsx`, `RiverGaugeDetail.tsx` link to USGS directly).

An audit trace found **~21 files** that would need touching to add a second flow source (fetchers,
cron, condition API, types, admin, UI links, MCP/OpenAPI surfaces). A river whose flow comes from a
state DNR, USACE (dam releases), or a non-US agency cannot be represented at all today — the schema
cannot even store its gauge.

**Smallest change:**
1. Schema: add `provider TEXT NOT NULL DEFAULT 'usgs'` and `site_id_external TEXT` to
   `gauge_stations`; replace the unique constraint with `UNIQUE (provider, site_id_external)`;
   backfill from `usgs_site_id`.
2. Code: a `FlowProvider` interface (`fetchLatest`, `fetchHistory`, `fetchStats`, plus provider
   metadata: units, freshness cadence, provisional-data semantics, canonical public URL builder) with
   `USGSProvider` (modern API) as the first implementation. Cron groups stations by provider.
3. UI: build outbound gauge links from the provider registry, not a hardcoded USGS URL.

#### F3 — Rivers have no state, country, timezone, or jurisdiction (blocker)

- `supabase/migrations/00002_tables.sql` — `rivers` columns are
  `name, slug, geom, length_miles, …, region, nhd_feature_id, …`; `region` is free text
  ("Ozarks"). No `state`, `country`, `timezone`, no link to a managing/regulatory authority.
- `supabase/seed/rivers.sql:67` — `ON CONFLICT (slug)`: slugs are globally unique.

Two consequences: (a) nothing downstream can vary by state/timezone/authority because the data isn't
there; (b) **slug collisions are guaranteed at multi-state scale** — Missouri's Current River sits
next to Arkansas' Spring River, and "Black River", "White River", "Big Piney" recur across states.
Today `/rivers/black` can only ever be one river.

**Smallest change:** `ALTER TABLE rivers ADD COLUMN state TEXT, country TEXT DEFAULT 'US',
timezone TEXT DEFAULT 'America/Chicago', river_type TEXT` (see F7 for `river_type`), plus a
`managing_authorities` table (or at minimum `regulatory_authority TEXT` + `park_code TEXT`).
Decide the URL strategy now (see F9) because slug uniqueness and URL shape are coupled.

#### F4 — Central Time is baked into scheduling, social, AI generation, and UI (blocker)

- `src/lib/social/central-time.ts:4` — `const CT_ZONE = 'America/Chicago'` (at least it's one
  constant, with `'en-US'` locale at line 6).
- `src/types/database.ts:735` — `social_config.digest_time_cst` (timezone in the column name).
- `src/lib/social/post-scheduler.ts` — scheduling logic and comments assume CST posting times.
- `src/app/admin/social/page.tsx` — UI label "Time (CST)"; `src/app/api/og/social/route.tsx` renders
  a literal `' CST'` on social cards.
- `src/lib/eddy/generate-global-update.ts:70` (and `generate-update.ts`,
  `generate-gauge-update.ts`) — `toLocaleDateString(..., { timeZone: 'America/Chicago' })` in every
  AI-generated update.
- `vercel.json:13-55` — cron expressions are UTC chosen to line up with Central wall-clock times.

A Mountain- or Eastern-time river gets updates and posts timed and labeled wrong — "this evening"
generated at the wrong evening. This is a credibility problem for a conditions product.

**Smallest change:** add `rivers.timezone` (F3), thread it through `central-time.ts` (rename to
`local-time.ts`, take a zone parameter), replace `digest_time_cst` with `digest_time` +
`digest_timezone`, and make cron handlers iterate rivers by *river-local* wall-clock rather than
assuming one zone (run the cron hourly; each river fires when its local time matches).

#### F5 — Weather/alert sources are hardcoded to Missouri (blocker)

- `src/lib/nws/alerts.ts:35` — `'https://api.weather.gov/alerts/active?area=MO'`.
- `src/lib/nws/alerts.ts:98-107` — `RIVER_SEARCH_TERMS`: river→Missouri-county keyword map in code.
- `src/lib/weather/openweather.ts:19-28` — `RIVER_CITY_MAP`: hardcoded river→city/lat/lon map;
  line 39 hardcodes `units=imperial`.

**Smallest change:** derive the NWS `area=` parameter from `rivers.state` (note NWS is US-only —
non-US expansion needs a different alert provider behind a small interface); move county search
terms and the weather reference point (a lat/lon, which the schema already has via geometry — a
`weather_point` per river or derive from segment midpoint) into the database.

#### F6 — NPS integration is hardcoded to one park; regulatory authority is not modeled (blocker)

- `src/lib/nps/client.ts:11` — `const PARK_CODE = 'ozar'` (Ozark National Scenic Riverways only);
  `src/app/api/cron/sync-nps/route.ts:54` logs the same hardcoded code.
- Regulations shown to users are editorial JSON inside blog `guide_data`
  (`src/components/blog/RegulationsCard.tsx` renders a `Regulation[]` prop with no `authority`
  field; `src/types/blog.ts`).
- `supabase/migrations/00002_tables.sql:128` — `access_points.ownership` is free text
  ('MDC', 'NPS', …), which is actually fine, but display names are hardcoded
  (`src/constants/index.ts:108-113` — `MDC: 'Missouri Dept. of Conservation'`).

Buffalo National River (AR) is park `buff`; a state-park-managed river has no NPS park at all; an
Oklahoma scenic river is managed by a state commission. None of that fits today.

**Smallest change:** parameterize the NPS sync by park code stored per river; add a
`managing_authorities` table (`id, name, kind: federal/state/county/private, url`) referenced by
rivers and access points; add `authority` to the `Regulation` type. Regulations stay human-curated
(correct — there is no reliable regs API), but they should be structured rows with an authority and
source URL, not opaque JSON in migrations.

#### F7 — The condition system's *semantics* and the AI layer assume the Ozark archetype (blocker — safety)

The seven-level taxonomy itself is well built: `shared/condition-system.ts` is a single source of
truth for codes/labels/colors/severity, thresholds are **per-gauge-per-river data**
(`river_gauges.level_too_low … level_dangerous`, `threshold_unit IN ('ft','cfs')`, dual-unit support
via migration `00048`), evaluation is symmetric in SQL RPC and `src/lib/conditions.ts`, and there are
**no hardcoded fallback thresholds** (missing data → `unknown`). A new river's thresholds are pure
data. That is the right foundation.

But the *meaning* wrapped around those levels is Ozark-calibrated prose, hardcoded in the AI layer:

- `src/lib/chat/system-prompt.ts:12` — "You are Eddy, an expert **Missouri Ozark** float trip guide";
  lines 22-31 — hardcoded 9-river slug map; line 36 — "rivers outside your 9 covered rivers";
  line 43 — "Most Ozark rivers are Class I-II… strainers … are the #1 hazard"; lines 68-73 — routing
  strategy that names spring-fed rivers ("Dry weather: check spring-fed rivers first (Current, Jacks
  Fork, Eleven Point)").
- `src/lib/eddy/generate-update.ts:224-312` — update-generation system prompt: "low water means
  scraping on gravel bars", rising-water hazards described as strainers/undercut banks, recovery
  framing that assumes spring-fed damping.
- `EDDY_KNOWLEDGE.md:17-50` — the General section is Ozarks hydrology by name.
- `src/data/eddy-quotes.ts:9-18` — `RIVER_NOTES` per-river prose hardcoded in code.
- `src/lib/eddy/rain-lag.ts` — per-river recovery constants in code (duplicating knowledge-file
  prose — drift risk between the two).
- `src/lib/calculations/floatTime.ts:46-52` — float speed = per-vessel constants (from
  `vessel_types` seed) degraded by **global** multipliers (`* 0.75` low, `* 0.5` too_low). No
  per-river calibration; a dam-controlled tailwater or a big flatwater river breaks these numbers.

**This is a safety issue, not a style issue.** On a dam-controlled tailwater, "rising" can mean a
scheduled release wave, not rain; on a flashy Appalachian creek, "falling" can mean it's unrunnable
in six hours; "low = scraping but floatable" is false where low means exposed bedrock sieves.
Transferring Ozark semantics without per-river-type recalibration would produce actively dangerous
advice.

**Smallest change:** add a `river_type` enum on rivers (`spring_fed_float`, `dam_tailwater`,
`rain_flashy`, `snowmelt`, `flatwater`) plus a `river_characteristics` table (primary hazard types,
recovery behavior, floatable-low semantics, speed-curve overrides). Drive the chat/update prompts
from that data instead of hardcoded prose; make the slug map, strategy hints, and `RIVER_NOTES`
DB-driven. Per-river speed multipliers with the current values as defaults.

#### F8 — Map viewport constants are Missouri (blocker, small)

- `src/constants/index.ts:11-25` — `DEFAULT_MAP_CENTER { lng: -91.5, lat: 37.5 }`,
  `DEFAULT_MAP_CENTER_ZOOM = 7`, `MISSOURI_BOUNDS`.
- `src/lib/utils/geo.ts:72-79` — `isValidMissouriCoord()` exists but is **called nowhere** (so
  there's also no coordinate sanity check on data entry at all).

**Smallest change:** compute viewport from the river/region geometry being displayed (the data is in
PostGIS already); keep a per-region bounds table for landing views; make the validator take bounds
as a parameter and actually use it in the admin import path.

#### F9 — URL structure: data-driven but flat, and a state decision is needed *now* (blocker as a decision, not as code)

The good news, verified: routes are `/rivers/[slug]` with **no** hardcoded slug lists in routing;
`src/app/sitemap.ts` generates from the DB; `generateMetadata` builds titles from river rows;
breadcrumb and site JSON-LD are generic. Nothing 404s or mislabels when a non-MO river row appears.

The problem is strategic: slugs are globally unique (F3) and the flat namespace has no
state/region level for SEO to accrue to ("float trips in Arkansas" has no landing page). Retrofitting
`/rivers/arkansas/buffalo` after hundreds of MO URLs have earned links means a redirect project.

**Smallest change (decide, then cheap to do early):** recommend
`/rivers/[state]/[slug]` (e.g. `/rivers/missouri/current`, `/rivers/arkansas/buffalo`) with
**permanent redirects** from today's `/rivers/current` URLs, plus `/rivers/[state]` index pages.
Slug uniqueness becomes `(state, slug)`. Doing this in Phase 0 — while the URL count is small and
all MO — is dramatically cheaper than after expansion. (Owner decision; the alternative of keeping a
flat namespace with qualified slugs like `black-river-ar` works but forfeits the state-level SEO
hierarchy the primary channel wants.)

### 2B. Fix during expansion

#### F10 — Four per-river maps live in code, so "add a river" = "deploy code" (friction)

- `src/data/river-sections.ts:18-94` — `RIVER_SECTIONS` array (feeds Eddy update targeting).
- `src/lib/weather/openweather.ts:19-28` — `RIVER_CITY_MAP`.
- `src/data/eddy-quotes.ts:9-18` — `RIVER_NOTES`.
- `src/lib/chat/system-prompt.ts:22-31` — river→slug map (already inconsistent: line 30 lists
  Gasconade, which has **no** section in `EDDY_KNOWLEDGE.md` — the chat will call tools for it with
  no local knowledge).
- `scripts/import-nhd-rivers.ts:19` — `MISSOURI_RIVERS` config array inside the script.

The existing playbook (`docs/RIVER_SCALING_PLAYBOOK.md:102`) claims "No code changes are typically
required," but its own steps 9, 10, and Phase-2.1 edit `EDDY_KNOWLEDGE.md`, `river-sections.ts`, and
`import-nhd-rivers.ts`. Today a new river touches **4–6 files + a deploy**.
**Fix:** move all four maps to tables/columns; make the NHD import take a config file or DB row.

#### F11 — The knowledge base is a monolithic prose file with a token cliff (friction now, blocker ~20+ rivers)

- `EDDY_KNOWLEDGE.md` — 205 lines / ~12.4 KB (~3k tokens), General + per-river prose sections.
- `src/lib/eddy/knowledge.ts:105-137` — `getKnowledgeForTarget()` string-parses the markdown and
  injects General + the river's full section into **every** chat request
  (`src/lib/chat/system-prompt.ts:94-105`) and **every** cron update generation
  (`src/lib/eddy/generate-update.ts:481-485`).

At 9 rivers this is fine (~500 tokens/injection). The always-inject-whole-section pattern plus
General-section prose that is *wrong outside the Ozarks* (F7) makes this a scaling cliff: cron token
burn grows linearly with rivers×sections; the General section can't be shared across regions; and
the file is hand-edited per river with no validation, no authority/source fields, and duplication
against `rain-lag.ts` and DB thresholds (drift risk).
**Fix (when river count approaches ~15–20):** move per-river knowledge into a
`river_knowledge` table (structured fields: character, seasonal pattern, hazards, crowding, tips —
each with a source), generate the injected context per-river from rows, make the "General" section
per-region. Full vector retrieval is not needed at 100 rivers if injection stays per-river; a
summary-vs-detail split (short context for chat, full for update generation) keeps token cost flat.

#### F12 — River content and data fixes are shipped as SQL migrations (friction)

68 of 138 migrations touch river-specific data — guide content embedded as 180+-line JSON
migrations (`00102`, `00131`, …), gauge association fixes (`00034`, `00071`), threshold tweaks
(`00041`, `00051`). Migrations are for schema; using them as a content pipeline means every
curation fix is an engineer-gated deploy. The admin panels (`/admin/gauges`, `/admin/access-points`,
`/admin/hazards`, `/admin/pois`) already exist —
**fix:** finish the loop so guide/regulation content is admin-editable, and treat migrations-as-content as a smell in review.

#### F13 — Units are baked into column names and UI copy (friction; blocker only for non-US)

- Schema: `gauge_height_ft`, `discharge_cfs` (`00002_tables.sql:94-95`), `length_miles`,
  `distance_miles`, `river_mile_*` — units in column names throughout;
  `river_gauges.threshold_unit` only allows `'ft' | 'cfs'`.
- UI/copy: `°F` hardcoded (`GaugeWeather.tsx`, `CurrentReadingCard.tsx`), `mph`
  (`PlanSummary.tsx`, `FloatPlanCard.tsx`, formatters), `units=imperial`
  (`openweather.ts:39`), "2 mph" default in
  `src/app/api/rivers/[slug]/access/[accessSlug]/route.ts`, `'en-US'` locale in formatters.

**Recommendation:** do **not** build metric/i18n now — it's real cost with zero benefit for US
expansion. Contain it instead: keep canonical storage in ft/CFS/miles (documented), route all
user-facing formatting through the existing formatter modules (mostly true already), and treat
cumecs/°C/km as a conversion layer added when a non-US region is actually scheduled. Flag: US-only
is an assumption the owner should ratify.

### 2C. Cosmetic

- Branding/copy: `package.json` name `missouri-float-planner`; README, home page, about page,
  `llms.txt`/`llms-full.txt` say "Missouri Ozarks platform" and "9 covered rivers" — update at first
  expansion (note `llms.txt` matters for the AI-discoverability channel; keep it accurate).
- `src/components/mo-surface-water/*` + `/missouri-surface-water` page — an intentionally MO-specific
  visualization; keep for MO, don't generalize, add per-state equivalents only if they earn traffic.
- `src/app/about/page.tsx:257-258` — links users to `waterservices.usgs.gov`; update with F1.

---

## 3. Source landscape

Status verified 2026-07-01 unless marked *confirm*.

| Source | Provides | Coverage / gaps | Licensing & attribution | Integration effort | Role in abstraction |
|---|---|---|---|---|---|
| **USGS Water Data — modern OGC API** (`api.waterdata.usgs.gov`) | Stage + discharge, ~15-min continuous, daily stats | National (US); gauge density varies widely by state; many floatable reaches ungauged | Public domain; API key required above low request rate | **Migration from legacy is mandatory** (F1): 3 fetch functions + parsing; ~1 wk incl. tests | Primary `FlowProvider` implementation; legacy decommission Q1 2027, possible degradation from Aug 2026 |
| **NOAA NWPS API** (`api.water.noaa.gov/nwps/v1`; replaced AHPS March 2024) | Observed **and forecast** stage/flow per gauge, flood categories, ratings | US; forecasts only at forecast points (subset of gauges) | Public domain | Moderate: new provider + "forecast" concept in the model (schema has `nws_lid` on gauges already) | Second provider; unlocks *forward-looking* trip planning — a real product edge |
| **USACE CWMS Data API** (`cwms-data.usace.army.mil/cwms-data`) | Reservoir levels, releases, tailwater timeseries | US dam-controlled systems; office-by-office data quality varies (*confirm per target river*) | Public; no key for read (*confirm rate limits*) | Moderate-high: different site/timeseries identifiers | Required before onboarding any dam-controlled tailwater (e.g., TX Guadalupe below Canyon Lake, White River AR) |
| **American Whitewater NWI** | 6,000+ runs: gauge correlations, runnable ranges, dam schedules, permits, hazards | National; skews whitewater, not flatwater float | **TOS prohibits harvesting; personal, non-commercial reference only; no public API.** | N/A as an ingestion source | **Reference/calibration aid used manually by a human curator, or a formal partnership (owner decision).** Do not scrape. AW ranges inform but don't transfer to float profiles. |
| **NHD / NHDPlus HR** | Flowlines/centerlines for geometry + along-channel mileage | National; quality varies per reach | Public domain | Low — already integrated (`scripts/import-nhd-rivers.ts`, migration `00116`); needs config-not-code input (F10) | Geometry backbone; keep |
| **NPS API + RIDB/recreation.gov** | Campgrounds, facilities, POIs for federal units | Only where a park unit manages the river | Public; RIDB key already in use | Low: parameterize park code (F6); RIDB radius already works | One authority type among several in `managing_authorities` |
| **NWS alerts API** (`api.weather.gov`) | Weather/flood alerts by state/zone | US-only | Public domain | Low: derive `area=` from river state (F5) | Alert provider (needs interface only if non-US ever happens) |
| **OpenWeatherMap** | Current conditions per point | Global | Paid tiers; attribution per plan (*confirm plan terms*) | Low: kill `RIVER_CITY_MAP`, use per-river point (F5) | Weather provider, already fine |
| **OpenStreetMap** | Put-ins, ramps, waterway tags | Global, patchy for river access | **ODbL — attribution + share-alike on derived DB; review before bulk import** | Low-moderate | Seed candidate access points for the human curation queue; never publish unverified |
| **State agencies (AGFC, MDC, TPWD, OK Scenic Rivers/GRDA…)** | Access sites, regs, permits, some gauges | Per state, wildly heterogeneous; usually no API | Per agency (*confirm each*) | Human curation, not integration | The curation layer; encode results as structured rows with authority + source URL |
| **National Water Trails System** | Designated trail metadata | Sparse but high-signal | Public (*confirm reuse terms*) | Trivial (manual) | Target discovery input |
| **`floatmissouri_*.json`** (repo root) | Historical MO river/mile data used at import | MO only | **Provenance/licensing unverified — appears scraped from a third-party site; confirm rights before shipping derived data further** | Already used | Flag for owner review |

---

## 4. Target shortlist (ranked)

Scoring dimensions: market demand, data availability (gauges/NHD/access data), **similarity to the
proven Ozark archetype** (weighted highest — it's the safety and lift axis), outfitter density (B2B),
SEO opportunity, regulatory complexity.

**Rank 0 — Finish Missouri (parallel track, no Phase-0 dependency).** The existing playbook's queue
(Gasconade, North Fork of the White, Black, Bourbeuse…) runs on today's architecture, grows the moat,
and exercises the runbook. Keep shipping these while Phase 0 lands.

**Rank 1 — Arkansas Ozarks (first new state).** The same physiographic region across a state line:
spring-fed, gravel-bottomed float streams, Central Time, good USGS coverage, dense outfitter market,
NPS presence already familiar to the product.
- *Pilot river:* **Spring River (Mammoth Spring → Hardy)** — the closest Arkansas analog to the
  Missouri nine: dominated by a first-magnitude spring, floatable year-round, heavy outfitter
  traffic, USGS-gauged (*verify specific gauge siting vs. the floated reach during pilot research*).
  Alternates with the same logic: **Eleven Point (AR continuation)** — extends a river Eddy already
  models — or **Kings River**.
- *Flagship follow-on:* **Buffalo National River** — the biggest demand and SEO prize in the region,
  NPS-managed (park code `buff` slots into the parameterized F6 sync). **Caution:** the Buffalo is
  substantially **rain-driven and flashy**, not spring-damped — it is deliberately *second*, after
  the runbook is proven, with `river_type = rain_flashy` semantics and fresh calibration, not
  Ozark-default prose.
- Regulatory lift: moderate (AGFC access sites, NPS concessioner rules on the Buffalo).

**Rank 2 — Oklahoma: Illinois River (Tahlequah) + Barren Fork.** Ozark-adjacent hydrology, huge
float-outfitter market, Central Time, USGS-gauged. Regulatory nuance: a state Scenic Rivers regime
(managed under GRDA) — a good first test of the `managing_authorities` model on a non-NPS, non-MDC
authority. Moderate lift, high B2B fit.

**Rank 3 — Texas Hill Country: Guadalupe, San Marcos, Frio, Comal.** Very large demand and SEO
opportunity, strong outfitter density, Central Time. **Deliberate archetype step:** spring-fed
(Edwards Aquifer) *but* the lower Guadalupe is a **dam-controlled tailwater** (Canyon Lake releases)
— this is where the USACE provider gets built and validated, on a river type where release schedule,
not rain, is the condition driver. Higher lift; do not attempt before the provider abstraction and
river-type-aware prompts exist.

**Rank 4 — Upper Midwest NPS riverways: Namekagon/St. Croix (WI/MN), Niobrara (NE).**
Groundwater-damped, NPS-managed (the F6 parameterization pays off again), calmer seasonality;
Central Time. Solid similarity, thinner outfitter/B2B density than 1–3.

**Rank 5 — Tennessee: Buffalo (TN) and Duck.** Popular canoe-livery rivers, decent gauges — but
**Eastern/Central time-zone boundary and a hydrology mix** that makes them a fine fifth, not a
second.

**Explicitly deferred:** snowmelt-driven Western rivers, Appalachian flashy creeks as a class, and
whitewater-first regions — different archetypes, different safety envelopes, and AW (the best
calibration reference there) is not licensable for ingestion. Also deferred: anything non-US
(units, alerts provider, and NWS/USGS coverage all end at the border — see F13).

---

## 5. Per-river ingestion runbook

Extends `docs/RIVER_SCALING_PLAYBOOK.md` Part 2 to multi-state. Markers: **[A]** automatable,
**[A+H]** automated with mandatory human sign-off, **[H]** human curation required. Rough effort for
a same-archetype river; add 30–50% for a new state's first river (state-level research amortizes
across its later rivers).

1. **Candidate dossier** [H, 1–2 h] — confirm demand, outfitter presence, access legality
   (state riparian/navigability doctrine — *once per state*, then reusable), and that a usable gauge
   exists. Kill here if the data can't support the river.
2. **River-type classification** [H, 15 min, safety gate] — assign `river_type` and characteristics
   row (hazard profile, recovery behavior, low-water semantics). This drives which prompt semantics
   and speed defaults apply. Never inherited implicitly.
3. **Gauge selection & provider mapping** [A+H, 1–2 h] — enumerate candidate gauges via provider
   APIs (USGS `/monitoring-locations`, USACE catalog); score by distance-to-reach and intervening
   tributary drainage area (NHDPlus catchment areas make this computable). Human picks
   representative gauge(s) per section; document known bias (e.g., "gauge is 12 mi below take-out,
   two tributaries enter — readings run high"). Where no acceptable gauge exists → the river ships
   as **ungauged** (condition = `unknown`, planning-only) or doesn't ship. Drainage-area scaling
   ratios, where used, are recorded per river-gauge link, not global.
4. **Geometry + mileage** [A, 1–2 h] — NHD flowline import, direction verification, mile markers
   (existing scripts, once F10 makes them config-driven).
5. **Access points** [H with A seeding, 3–6 h] — seed candidates from OSM/state agency/NPS-RIDB
   sources into a review queue; human verifies each (legality, parking, fees, photos), then snap +
   mile-correct with existing scripts [A].
6. **Threshold calibration** [A+H, 2–4 h, safety gate] — bootstrap from historical percentiles
   (existing playbook method, run against the *modern* USGS daily-stats endpoint); adjust against
   ground truth: outfitter minimum-runnable levels, NPS/agency published guidance, AW ranges *read
   manually as reference* (licensing, §3). A human signs the six numbers. **No condition badge goes
   live on percentiles alone.**
7. **Speed calibration** [A+H, 1–2 h, safety gate] — validate float-time estimates against published
   outfitter/NPS float times for 2–3 reaches; set per-river speed-curve overrides if residuals
   exceed tolerance (target: within ~20% of published times).
8. **Knowledge entry** [H, 2–4 h] — structured `river_knowledge` rows (post-F11): character,
   seasonality, hazards, crowding, tips — each with source + authority. Quality bar per playbook
   tip #5: local knowledge, not encyclopedia facts.
9. **Regulations & permits** [H, 1–3 h] — structured rows with authority, effective dates, source
   URLs. Per-state legal groundwork (navigability, stream access law) done once per state and
   referenced.
10. **Weather/alert wiring** [A, <1 h] — per-river weather point; NWS area from state (post-F5).
11. **Automated validation** [A, minutes] — CI-style checks: gauge live within cadence; thresholds
    strictly ordered and inside the gauge's historical min/max; mileage monotonic along geometry;
    access points within N meters of the flowline and inside region bounds (finally using the F8
    validator); every active river has knowledge rows, ≥1 gauge or explicit `ungauged`, timezone,
    river_type; prompt/dataset consistency (no more Gasconade-style drift).
12. **QA & soft launch** [H, 1–2 h] — existing playbook Phase-5 checklist + timezone-correct Eddy
    update + a native review of one generated update for archetype-appropriate language; launch via
    `active = true`; thresholds marked provisional for 2–4 weeks of feedback-driven refinement
    (playbook tip #3).

**Total: ~12–20 h/river, ~60–70% human.** The honest headline: automation removes steps 3, 4, 10, 11
from human hands, but steps 5, 6, 8, 9 are irreducibly human and gate expansion velocity. Plan
curation capacity (in-house hours, contract locals, or outfitter partners) per ~10 rivers, and run
curation as a parallel queue: while one river is in QA, the next is in access-point review.

---

## 6. Phased roadmap

**Phase 0 — Refactor + USGS migration (before any non-MO river). ~4–6 engineering weeks.**
1. USGS legacy→modern migration **as** the `FlowProvider` interface (F1+F2), including the
   `provider`/`site_id_external` schema change. *This ships even if expansion is cancelled.*
2. Multi-region schema: `rivers.state/country/timezone/river_type`, `river_characteristics`,
   `managing_authorities` (F3, F6, F7).
3. Timezone parameterization end-to-end (F4).
4. De-hardcode the four per-river code maps + NWS/weather params (F5, F10).
5. URL decision + implementation with redirects while the URL set is small (F9 — owner decision
   first).
6. Automated validation suite (runbook step 11) — cheap now, priceless at 30 rivers.
   Risk: low — mostly mechanical; the USGS migration carries the only external-API risk and has a
   hard external deadline anyway. **Parallel track:** continue Missouri additions
   (Gasconade et al.) on the existing playbook throughout.

**Phase 1 — Pilot: one Arkansas river (Spring River, or Eleven Point AR). ~2–3 weeks calendar,
mostly curation.** Run the §5 runbook end-to-end on the new architecture. Success criteria, explicit:
float-time residuals within ~20% of published outfitter/NPS times on ≥3 reaches; thresholds
sign-off by a human with local ground truth; validation suite green; curation completed within the
budgeted hours (measure actual vs. §5 estimates — this number calibrates every later plan);
timezone/authority/metadata correct in every generated Eddy update; no Ozark-prose bleed-through in
chat answers about the pilot river. **Do not start Phase 2 until every criterion passes and the
runbook doc is updated with what broke.**

**Phase 2 — Arkansas buildout + forecast data. ~1 quarter.** 3–5 more AR rivers by shortlist order,
Buffalo National River included **with** its `rain_flashy` classification and fresh calibration;
NWPS provider for forecast-aware planning; knowledge-base restructure (F11) lands here, before the
river count makes it urgent; state landing pages go live (SEO).

**Phase 3 — Oklahoma, then Texas. ~1–2 quarters.** Illinois River (new authority type exercises
`managing_authorities`); then Hill Country with the **USACE provider** and dam-release semantics —
the first deliberate archetype extension, done where the market justifies the lift. Phase 4+ follows
the shortlist (Upper Midwest riverways, TN), each new archetype gated on per-type calibration.

Dependencies: Phase 1 depends on all of Phase 0; Buffalo depends on Phase-1-proven runbook;
Texas depends on USACE provider; nothing depends on metric/i18n (deferred).

---

## 7. Risks & open decisions

**Risk register**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| USGS legacy degradation begins Aug 2026 before migration ships | Medium | Product-wide outage of the core feature | Phase 0 item 1 first; it's scheduled before any expansion work |
| Ozark-calibrated semantics transferred to a different river type | High if unmanaged | **Safety** — wrong advice at dangerous levels | `river_type` gate (runbook step 2), per-river calibration sign-offs (steps 6–7), Buffalo deliberately sequenced after pilot |
| Curation bottleneck (10–20 h/river human work) | Certain | Expansion velocity is curation-limited, not code-limited | Budget curation capacity explicitly; parallel queue; per-state legal research amortized |
| AW data unusable (TOS prohibits harvesting) | Confirmed | Weakens calibration ground truth outside outfitter knowledge | Manual reference use by curators; pursue partnership if AW-dependent regions ever matter |
| Poor gauge density on a target river | Medium per river | River can't ship with a live condition badge | Kill-or-ungauged decision at runbook step 1/3, never a badge on a bad gauge |
| Slug/URL rework after expansion | High if F9 deferred | SEO regression on the primary channel | Decide and implement URL scheme in Phase 0 |
| `floatmissouri_*.json` provenance | Unverified | Licensing exposure on derived data | Owner to confirm rights; quarantine if unclear |
| Knowledge/prompt drift (file vs. DB vs. code constants) | Present today (Gasconade, rain-lag) | Wrong AI answers | Validation suite consistency checks; single source of truth per fact (F11) |
| Cron/token cost growth with river count | Certain, gradual | Cost, not correctness | Summary-vs-detail knowledge split (F11); monitor per-run token spend |

**Owner decisions needed before Phase 1**
1. **URL structure** (F9): adopt `/rivers/[state]/[slug]` with redirects now, or stay flat — SEO
   consequences are long-lived.
2. **First-state confirmation**: Arkansas, and which pilot river (Spring vs. Eleven Point AR vs.
   Kings) — recommendation above, but it's a market call.
3. **Curation staffing model**: in-house hours vs. contracted locals vs. outfitter partners, and the
   hours/month budget — this sets expansion velocity more than anything in this document.
4. **American Whitewater**: pursue a formal data partnership, or accept manual-reference-only use.
5. **Accuracy bar for new regions**: are provisional (percentile-bootstrapped, 2–4-week refined)
   thresholds acceptable at launch with a "provisional" label, or must outfitter validation precede
   any badge? (Missouri precedent: playbook launched with placeholders; recommend the stricter bar
   going forward given the safety framing.)
6. **US-only ratification** (F13): defer metric/i18n and non-US alerting until a non-US region is
   actually on the roadmap.
7. **`floatmissouri_*.json` licensing** review.

---

*Verification notes: USGS decommission timeline per the USGS Water Data blog ("WaterServices APIs
will be decommissioned early 2027"; no intentional degradation before Aug 2026). NWPS replaced AHPS
March 2024 (`api.water.noaa.gov/nwps/v1`). USACE CWMS Data API is public at
`cwms-data.usace.army.mil`. AW terms per americanwhitewater.org TOS. Items marked "confirm" were not
verifiable from primary sources during this audit and must be checked before reliance.*
