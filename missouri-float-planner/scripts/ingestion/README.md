# Eddy River Onboarding — Finalized Process

> **Canonical, end-to-end process for adding a new river to Eddy.** This is the
> reference to open first in any "add a river" session. It supersedes the
> scattered guidance by tying it together and folding in the corrections from the
> first ingestion wave (Buffalo + Bourbeuse / Gasconade / Black / St. Francis,
> 2026-07). The deep docs it builds on:
>
> - `dossier.ts` — the research-dossier schema + the gate taxonomy (the contract).
> - `ingest-dossier.ts` — the transform that turns a signed-off dossier into DB
>   rows and **mechanically enforces the gates**.
> - `research-prompt-missouri.md` — the brief handed to the research pass.
> - `scaffold-mo-dossiers.ts` — emits schema-valid STUBS for new MO rivers.
> - `DEPLOYMENT-STATUS.md` — the running record of what shipped + follow-ups.
> - `../../docs/MULTI_STATE_SCALING_PLAN.md` §5 — the two-layer design rationale.
> - `../../docs/RIVER_SCALING_PLAYBOOK.md` — the older manual playbook (its Part 2
>   predates this dossier pipeline; use **this** file for the data flow and keep
>   the playbook for the site-review checklist and the recommended-rivers list).

---

## The pipeline in one line

```
scaffold → research (dossier) → verify (identifiers) → sign-off (thresholds)
   → geometry (NHD) → ingest --apply → validate_river_data() → place access
   points [human] → services (outfitters/campgrounds) → activate [human]
   → cold-start Eddy prose
```

Every arrow is a gate. The two-layer design (research JSON ≠ DB write) is what
makes the gates real: **nothing crosses from "found" to "committed" without
passing its gate**, and the gates are enforced in code (`ingest-dossier.ts`), not
by discipline.

### Gate taxonomy (from `dossier.ts`)

| Gate | Meaning | Enforced by |
|---|---|---|
| `[verify]` | Identifiers (USGS site #, NHD id, park code, LID) checked against the **primary source** before ingest — research hallucinates ids. | `verified-identifiers-<slug>.md` must exist and contain every `gauges[].siteId`, else ingest refuses. |
| `[signoff]` | Thresholds + primary-gauge choice — the owner reviews before they drive a **live** badge. | `_status` must **begin** with `SIGNED-OFF`. |
| `[safety]` | `high`/`dangerous` anchors need `confidence: high` **or** ≥1 corroborating source — danger numbers never ship provisional. | ingest rejects a low-confidence, single-source danger anchor. |
| `[auto]` | Sanity: reference gauge is polled + in `gauges[]`, one unit per gauge, strictly increasing levels. | ingest computes and blocks. |
| `[manual]` | Access-point coordinates — a **human** places every point in `/admin/geography`. | ingest **never** writes access points. |

---

## What changed after Wave 1 (read this before researching)

The first wave shipped five rivers and, in doing so, proved several pieces of the
original process wrong. **These corrections are load-bearing — the un-corrected
rules produced silent safety gaps.**

| # | Original guidance | What Wave 1 showed | Finalized rule |
|---|---|---|---|
| 1 | **"`dangerous` ≈ NWS flood stage, `high` ≈ action stage"** (research-prompt rule 4) | Only valid when the gauge is *on the float reach and bank-full ≈ floater-danger*. At Gasconade/Hazelgreen the NWS minor-flood flow is **31,013 cfs** (~30× the floatable max of ~1,000); on the St. Francis whitewater the flood stage is **15 ft** vs a paddler ceiling of **6 ft**. Anchoring `dangerous` to flood stage there lets a lethal flood badge merely "High." | **Anchor `dangerous` to floater "do-not-float" guidance** (outfitter/paddler ceiling, AW gauge correlation). Use NWS flood stage as a **corroborating cross-check only**, and as the *primary* danger source **only** on a small reach where the gauge sits on the float water and bank-full overflow ≈ the do-not-float level (e.g. Black/Annapolis, 8 ft ≈ 3,880 cfs). See "Danger anchors" below. |
| 2 | "Use MDC/outfitter floatability + NWS as the calibration sources." | The workable calibration source turned out to be **`rivers.moherp.org` OBSERVED community trip ratings** (real trips logged at a known discharge). moherp **ESTIMATED** values and USGS percentiles were **wrong** — Annapolis estimated "Good" 536 cfs vs observed 180 cfs (real trips floated Good at 189/192). | **moherp OBSERVED = trusted (accuracy-approved). moherp ESTIMATED + USGS percentiles = REJECTED as thresholds.** Grow Eddy's own observed tier via `community_reports` over time. |
| 3 | "Threshold unit convention: **ft (stage)** for MO gauges." | moherp OBSERVED ratings are quoted in **cfs**, so Gasconade/Black/Bourbeuse/Buffalo shipped in **cfs**; only St. Francis (Roselle stage legend) is **ft**. | **Use the unit the calibration source publishes.** Never guess ft↔cfs; convert only with the USGS rating curve and label it inference. Record the unit + reference gauge on every anchor. |
| 4 | (Assumed every MO gauge streams from USGS.) | Roselle (07034000) USGS discharge **ended 1997**; live data comes from **NWS/NWPS**. Built `src/lib/flow-providers/nws.ts`; set `gauge_stations.provider='nws'`, `site_id_external=<LID>`. | For a dead-USGS-but-live-NWS gauge, use `provider='nws'`. **Confirm the gauge is actually reporting before activating** (a dropped gauge = no badge). |
| 5 | (One Supabase project assumed.) | Data was written to a **legacy project** while the app read prod → the geography admin showed a stale, smaller river set. | **Always `export EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur` before any `--apply`/`--write`.** `ingest-dossier.ts` and `preload-dossier-access-points.py` print the target ref and abort on mismatch. |
| 6 | "Access points: import CSV → snap." | The auto-placed / preloaded coordinates were **rough** (Hammer ~75 km off, Mill Creek ~18 km). A whole correction pass (migrations `00154`–`00160`) fixed coordinates against MDC Atlas / NPS / USFS / USGS. | Budget for a **coordinate-verification pass**. Load access points as **PENDING** (`approved=false`); a human verifies each pin against an official source and approves in `/admin/geography`. Points verified against an official source may be auto-`approved=true` by a correction migration; medium/low confidence stay pending. |
| 7 | `validate_river_data()` was the launch gate. | It only errored on *zero* thresholds or *out-of-order* levels — it never noticed a primary **missing the top or bottom of the ladder**, so St. Francis (no `dangerous`), Gasconade (no `dangerous`/`too_low`) and Black (no `optimal_max`) all shipped "green." | **Hardened (migration `00164`)**: `validate_river_data()` now **warns** on an active primary gauge missing `level_dangerous`, `level_optimal_max`, or `level_too_low`. A clean validate run now means the ladder is actually complete. |
| 8 | (Knowledge base was optional prose.) | Gasconade shipped **knowledge-less** before a gate existed. | **Every active river needs a `## <River>` section in `EDDY_KNOWLEDGE.md`** — `npm run check:eddy-knowledge` fails otherwise. |

---

## Phase-by-phase runbook

### Phase 0 — Pre-flight (once per session)

```bash
export EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur   # prod (FloatMe). Guardrail #5.
# NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must point at the SAME ref.
```

The production project is **`ilefwfpvphadsbptiaur`**. The app reads whatever
`NEXT_PUBLIC_SUPABASE_URL` points at; every write script must target the same one.

### Phase 1 — Scaffold

Add a row to `MO_RIVERS` in `scaffold-mo-dossiers.ts` (identity, region, counties,
towns, **gauge LEADS by name — not verified ids**, reach hint, river-type caution)
and run:

```bash
npx tsx scripts/ingestion/scaffold-mo-dossiers.ts   # won't overwrite existing dossiers
```

This emits a `dossiers/<slug>.json` **stub** with MO state-level scaffolding
pre-filled (`state`, `timezone`, the shared MO access-law paragraph, alert terms)
and `gauges`/`sections`/`accessPoints` empty. **North Fork (White), Elk, and James
already have seeds** in the scaffolder — they are the next-up candidates.

### Phase 2 — Research (fill the dossier)

Hand the stub **plus `research-prompt-missouri.md`** to a deep-research pass. The
output is one JSON document conforming to `RiverDossier`. The non-negotiables:
every fact carries a source URL; identifiers are transcribed, never invented
(`UNKNOWN` + add to `toVerify` if not found); the reference gauge + unit is
captured on every water-level number. **Calibrate per the "Danger anchors" and
moherp rules below — not the old flood-stage shortcut.**

### Phase 3 — Verify (the anti-hallucination pass)

Independently confirm every `gauges[].siteId` on its
`waterdata.usgs.gov/monitoring-location/<id>` page (and the NHD id, park code, NWS
LID). Write the results to **`dossiers/verified-identifiers-<slug>.md`**. Ingest
**refuses** any gauge id not present in that file — no file, no ingest.

### Phase 4 — Sign-off

The owner reviews the thresholds and the `primaryGaugeSiteId` choice, then sets
`_status` to **begin** with `SIGNED-OFF` (date + note). A dossier still marked
`STUB`/`AWAITING SIGNOFF` is refused. `primaryGaugeSiteId` **must** be one of the
calibrated (thresholded) gauges — it is never guessed.

### Phase 5 — Geometry (NHD)

Add the river to the `RIVERS` list in `scripts/import-nhd-rivers-from-tnm.ts`
(NHD HR HUC8, multi-HUC supported) and run with `--apply`. **Verify the endpoints
against the real mouth and the length against a published figure** — Big Piney
shipped a 47 km junk polyline that had to be re-imported. NHD flowlines are
downstream-oriented (`direction_verified=true`).

### Phase 6 — Ingest (dry-run, then `--apply`)

```bash
npx tsx scripts/ingestion/ingest-dossier.ts dossiers/<slug>.json           # dry run
npx tsx scripts/ingestion/ingest-dossier.ts dossiers/<slug>.json --apply   # write
```

Writes `rivers` (multi-region fields), `gauge_stations`, `river_gauges`
(thresholds + `is_primary` from `primaryGaugeSiteId`), `river_sections`,
`river_characteristics`. It **never** writes access points and **never** flips
`rivers.active`. After ingest, set any discontinued reference gauges it created to
`active=false` so the cron doesn't poll them.

### Phase 7 — Validate

```sql
SELECT * FROM validate_river_data() WHERE river_slug = '<slug>';
```

Resolve all **errors** before activating. After migration `00164`, also resolve or
consciously accept the **warnings** — `no_dangerous_anchor` / `no_optimal_max_anchor`
/ `no_too_low_anchor` mean the badge can't express part of its range (see below).

### Phase 8 — Access points [human]

Load candidates as **PENDING** (`approved=false`, `is_public=false`) — the enrich +
preload path is `preload-dossier-access-points.py`. Then a human verifies each pin
against an official source (MDC Atlas, NPS, USFS, Recreation.gov, USGS) and approves
it in `/admin/geography`. Coordinates are **never** script-written to `approved`.

### Phase 8.5 — Services [separate subsystem — now required]

Outfitters, campgrounds, and shuttles are **not** in the dossier schema. They
live in **`nearby_services`** (+ `service_rivers` M2M — `is_primary` = the river a
business mostly serves) and, for NPS-park rivers, **`nps_campgrounds`** (synced
from the NPS API by `park_code`). **This step was skipped for all five Wave-1
rivers — they shipped with 0 services while the original rivers carry 20–30 each.
Do not skip it again.**

Research per corridor (outfitter sites, Google/Yelp/TripAdvisor, chamber
directories; NPS / State Parks / USFS / MDC / AGFC for campgrounds). The repo's
`Data Gap Analysis` and `Business Database` PDFs are prior groundwork (75
businesses across 6 corridors, incl. Black, Gasconade, Spring AR). Load via CSV:

```bash
npx tsx scripts/import-services-csv.ts <file>.csv            # dry-run / validate
npx tsx scripts/import-services-csv.ts <file>.csv --import   # write
```

CSV (`scripts/services.template.csv`): `name, type (outfitter|campground|
cabin_lodge), river_slugs` (pipe-separated, first = `is_primary`), `phone, email,
website, reservation_url, booking_platform, latitude, longitude, services_offered`
(pipe-separated: `canoe_rental|shuttle|showers|…`), `tent_sites, rv_sites,
cabin_count, fee_range, season_open_month, season_close_month`. Idempotent by
`slug`. **Backlog:** backfill the five Wave-1 rivers (Black, Bourbeuse, Buffalo,
Gasconade, St. Francis) from the Business Database PDF.

### Phase 9 — Activate [human] + cold-start

```sql
UPDATE rivers SET active = true WHERE slug = '<slug>';   -- only after validate is clean
```

Then populate Eddy prose immediately instead of waiting for the daily cron:

```
GET /api/cron/generate-eddy-updates?river=<slug>   (Bearer $CRON_SECRET)
```

Confirm the `## <River>` knowledge section exists first (`npm run check:eddy-knowledge`).

### Phase 10 — Post-launch

Watch the first cron pass clear any `stale_gauge` warning; refine thresholds as
`community_reports` accumulate; add hero + access-point photos.

---

## The calibration bible (safety core)

### The 6-tier ladder and how the badge reads a *partial* one

`computeCondition()` (`src/lib/conditions.ts`) is the single source of truth. Key
behaviors when anchors are missing — this is why partial ladders are dangerous:

- **`level_dangerous` null → the badge can NEVER show "Dangerous."** There is *no*
  flood-stage fallback; it caps at "High" at any flow. (Fixed on St. Francis;
  still open on Gasconade.)
- **`optimal_max` null → never shows "Flowing/ideal."** The whole floatable range
  collapses into one "Good" band. (Black is this shape.)
- **`optimal_min`-only** still works: `good` floors at `optimal_min`. That's the
  moherp "Good begins at X" shape (Gasconade/Jerome 400 cfs, Black/Annapolis 180).
- **`too_low` null →** never shows "Too Low"; low water reads at best as "Low."

### Danger anchors — the corrected method (the #1 Wave-1 lesson)

`dangerous` = **the flow/stage at which a floater should not put on.** That is a
*recreation* number, not a *hydrology* number, and the two diverge:

1. **First source: floater do-not-float guidance.** Outfitter "too high to float,"
   paddler/AW gauge-correlation ceilings, MDC safety language. On whitewater
   (St. Francis) this is the American Whitewater reach's recommended maximum.
2. **Cross-check, don't equate, with NWS flood stage.** Fetch the NWPS flood
   categories (`api.water.noaa.gov/nwps/v1/gauges/<LID>`). Note NWPS returns
   `flow=-9999` when the gauge has no rating, so you often only get **stage (ft)**;
   converting to cfs needs the USGS rating table
   (`waterdata.usgs.gov/nwisweb/get_ratings/?site_no=<id>&file_type=exsa`).
3. **Only use flood stage AS the danger anchor when bank-full ≈ do-not-float** —
   i.e. the gauge is on the float reach and it goes over its banks at roughly the
   level floaters should already be off. True on small reaches (Black/Annapolis:
   NWS minor 8 ft = 3,880 cfs, genuinely dangerous). **False** on:
   - large downstream gauges — Gasconade/Hazelgreen NWS minor 21 ft = **31,013 cfs**,
     ~30× the ~1,000 cfs floatable max;
   - whitewater reaches — St. Francis/Roselle NWS minor **15 ft** vs the **6 ft**
     paddler ceiling.
   Anchoring to flood stage on those lets a deadly flow badge "High." **Don't.**
4. **If no floater do-not-float source exists, leave `dangerous` null** and record
   why in `openQuestions` — do **not** fabricate it from flood stage. The hardened
   validator now surfaces the gap loudly instead of it shipping silently.

`[safety]` gate: any `high`/`dangerous` anchor needs `confidence: high` or ≥1
corroborating source, or ingest refuses it.

### Primary gauge

`is_primary` drives the river-level badge and the Eddy update, and
`validate_river_data()` blocks activation (`no_primary_gauge`) until it's set.
Ingest sets it from `primaryGaugeSiteId` — which must be a calibrated gauge and is
never guessed.

---

## Launch checklist

- [ ] `EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur` exported; app URL matches.
- [ ] `verified-identifiers-<slug>.md` exists; every gauge id confirmed on USGS.
- [ ] `_status` begins with `SIGNED-OFF`; `primaryGaugeSiteId` set to a calibrated gauge.
- [ ] Geometry endpoints + length sanity-checked against the real river.
- [ ] `ingest-dossier.ts --apply` run clean; discontinued gauges set `active=false`.
- [ ] `validate_river_data()` → **0 errors**; ladder warnings resolved or consciously accepted.
- [ ] `## <River>` section in `EDDY_KNOWLEDGE.md`; `npm run check:eddy-knowledge` passes.
- [ ] Access points loaded PENDING; each verified + approved by a human in `/admin/geography`.
- [ ] Services loaded (`nearby_services` + `service_rivers`) — outfitters/campgrounds/shuttles; do not ship at 0.
- [ ] `rivers.active = true`; cold-start `generate-eddy-updates?river=<slug>` run.
- [ ] First cron pass observed; `stale_gauge` cleared.

---

## Worked reference — the Wave-1 rivers

Real shipped values, as calibration examples (primary gauge shown):

| River | Primary gauge | Provider | Unit | Ladder (too_low / low / opt / high / danger) | Notes |
|---|---|---|---|---|---|
| Buffalo (AR) | 07056000 St. Joe | usgs | cfs | 40 / 200 / 1130–3000 / 3000 / 8000 | complete; 4 reach gauges; NWS LID SJOA4 |
| Bourbeuse | 07016500 Union | usgs | cfs | 40 / 70 / 120–250 / 500 / 1000 | complete; reclassified `rain_flashy` at sign-off |
| Gasconade | 06928000 Hazelgreen | usgs | cfs | — / 100 / 200–1000 / 1000 / **—** | **no `dangerous`/`too_low`** (flood stage invalid here); lower reach opt-min only |
| St. Francis | 07034000 Roselle | **nws** | **ft** | 3 / — / 4–5 / (via opt_max) / **6** | whitewater; `dangerous=6` = paddler ceiling, NOT NWS flood (15 ft) |
| Black | 07061500 Annapolis | usgs | cfs | — / — / 180 / 1470 / 3880 | has `dangerous`; **no `optimal_max`** → never "Flowing" |
| Big Piney (inactive) | 06930000 | usgs | ft | 1.8 / 2.3 / 3.0–5.5 / 7 / 10 | complete ladder; `active=false` pending go/no-go |

Open follow-ups live in `DEPLOYMENT-STATUS.md`.
