# Research Brief: New Missouri Float River — Onboarding Dossier (reusable)

> Reusable instance of the river-research template for onboarding a **new
> Missouri** river. Copy nothing — pass this whole file plus the one river's
> row from `scaffold-mo-dossiers.ts` as the task. Output feeds
> `scripts/ingestion/dossier.ts` → verification → ingestion.
>
> This is the **fast path**: Missouri's state-level scaffolding is already
> paid for by the existing 8 rivers and the Buffalo pilot. Do NOT re-research
> anything in the "Already solved for Missouri" block — reuse it verbatim.

---

## Already solved for Missouri (reuse — do NOT re-research)

| Field | Value |
|---|---|
| `state` / `country` | `MO` / `US` |
| `timezone` | `America/Chicago` |
| `riverType` default | `spring_fed_float` (prompts + speed curve already tuned) — **but see the St. Francis exception below; confirm per river** |
| threshold unit convention | **whatever the calibration source publishes** — `cfs` when the anchor comes from a moherp OBSERVED rating (most Wave-1 rivers), `ft` when it comes from a stage legend (St. Francis/Roselle). Do NOT default to ft; do NOT convert without the USGS rating. |
| `accessLaw` | Missouri navigability doctrine — **reuse the shared MO paragraph**, do not re-research per river (see below) |
| NWS alert wiring | MO county + town + river-name terms, same pattern as the existing rivers |

**Shared Missouri access-law paragraph** (drop into every MO dossier's
`accessLaw`, `confidence: medium`, and let one signoff confirm it once for the
whole state rather than per river): *Missouri follows the "navigable in fact"
doctrine — the public has a right to float and wade streams that are navigable
in fact, but the streambed and banks are frequently privately owned, so access
is legal from public road crossings, public land, and established accesses,
while portaging or camping on private gravel bars/banks can be trespass. There
is no statewide list of navigable streams; navigability is decided stream by
stream.* Cite the Missouri Attorney General / MDC stream-access guidance as the
source and mark `toVerify` once for the state.

## Non-negotiable rules (same safety bar as Buffalo)

1. **Every fact carries its source URL.** No source, no fact. Prefer primary
   sources (USGS, MDC — Missouri Department of Conservation, NWS/AHPS) over
   blogs; name the outfitter when citing one.
2. **Never invent identifiers.** USGS site numbers and the NHD feature id must
   be transcribed from a page you actually found. If you cannot find one, write
   `UNKNOWN` and add it to `toVerify` — a wrong id is far worse than a missing
   one. Candidate gauges in the scaffold are **leads, not verified** — confirm
   each site number on its `waterdata.usgs.gov/monitoring-location/<id>` page.
3. **Capture the reference datum on every water-level number.** Record the
   number, the unit (**ft vs cfs — never guess**), and **which USGS gauge** it
   refers to, quoting the source. If the source doesn't say which gauge, record
   the number but mark the reference `UNSTATED`.
4. **Corroboration for danger levels.** Any number driving `high` or
   `dangerous` needs **two independent sources**. `dangerous` is a *recreation*
   number — **the level at which a floater should not put on** — NOT the level at
   which the river floods its valley. **Anchor `dangerous` to floater
   "do-not-float" guidance** (outfitter "too high to float," the American
   Whitewater gauge-correlation ceiling on whitewater reaches, MDC safety
   language). **Use the NWS AHPS/NWPS flood stage as a CROSS-CHECK, not as the
   anchor** — treat flood stage as the `dangerous` source *only* where the gauge
   sits on the float reach and bank-full overflow roughly equals the do-not-float
   level (small reaches). On large downstream gauges and whitewater reaches the
   flood stage is far above floater-danger and will let a lethal flow badge merely
   "high" — see the WORKED WARNING below. Single-source danger numbers go in with
   `confidence: low` and a note; if no floater do-not-float source exists, leave
   `dangerous` UNSET and say so in `openQuestions` — do not fabricate it from
   flood stage.

   > **WORKED WARNING (first-wave evidence).** NWS minor-flood flow at
   > Gasconade/Hazelgreen (06928000) is ~31,013 cfs — about 30× the ~1,000 cfs
   > floatable max. St. Francis/Roselle (07034000) floods at 15 ft but the
   > whitewater paddler ceiling is 6 ft. Flood-stage → `dangerous` worked on
   > Black/Annapolis only because that small reach goes bank-full (8 ft ≈
   > 3,880 cfs) at roughly the do-not-float level. Do not generalize it.
5. **Distinguish what the source said from what you infer.** Label
   interpolations, unit conversions, and syntheses as yours.
6. **Record dates.** Flag anything stale (pre-2020).

## MANDATORY calibration sources — capture per gauge, verbatim

For each representative gauge on the river, capture ALL that exist before
anything else:

1. **`rivers.moherp.org` OBSERVED ratings** (the Missouri paddler gauge-rating
   site): the community trip-calibrated too_low/low/good/high bands for the
   gauge, quoted in the gauge's own unit (usually **cfs**). This is the PRIMARY
   floatability source. **Capture only the OBSERVED tier** — moherp's ESTIMATED
   (model) values and USGS percentiles are REJECTED as thresholds (Annapolis
   proved it: estimated Good 536 cfs vs observed 180 cfs, real trips at 189/192).
   Capture the corroborating trip reports (flow + date) too.
2. **MDC / outfitter floatability guidance** for the reach: the "too low to
   float / good / too high" statements, quoting the gauge and unit. Independent
   second source; also the best source for the **`dangerous` (do-not-float)**
   level, which moherp usually does not give.
3. **NWS AHPS/NWPS page for the USGS gauge** (`api.water.noaa.gov/nwps/v1/gauges/<LID>`
   or `water.noaa.gov`, the "flood categories" table): the **action / minor /
   moderate / major** stages in ft (and flow, if the gauge has a rating —
   often `-9999`/absent). Capture verbatim with the URL. **This is a CROSS-CHECK
   for the danger anchors, not the anchor itself** (see rule 4). Flood stage
   equals `dangerous` only on a small reach where bank-full ≈ do-not-float.

Record the **unit and reference gauge on every anchor**; do not convert ft↔cfs
without the USGS rating curve
(`waterdata.usgs.gov/nwisweb/get_ratings/?site_no=<id>&file_type=exsa`), and label
any conversion as your inference. If a source is missing for a gauge, say so in
`openQuestions`/`toVerify` — do not backfill from another gauge or from generic
Ozark assumptions.

## The reaches (research per-section, this is the core)

Divide the river into calibration reaches (a short river may be one reach; a
long one like the Gasconade several). Per reach, fill:

1. **Representative gauge** — which USGS gauge best reflects floatability on the
   reach, per MDC/outfitter usage, with bias notes (tributaries entering
   between gauge and reach; how far the gauge sits from the reach).
2. **Threshold anchors** — every level statement, mapped to `too_low` (not
   floatable) / `low` (scraping but floatable) / `optimal_min` & `optimal_max`
   (ideal range) / `high` (caution) / `dangerous` (do not float — a floater
   ceiling, per rule 4, NOT the flood stage). Record each as: level, value,
   **unit in whatever the source publishes (cfs for moherp OBSERVED; ft for a
   stage legend — never guess or convert without the USGS rating)**, reference
   gauge, `referenceGaugeIsPolled`, source, corroborating sources, confidence.
3. **Published float times** — put-in → take-out, distance, hours (range if
   given), craft, source. Get at least one per reach (MDC/outfitter trip pages).
4. **Hydrology character** — spring-fed vs rain-driven, seasonal window,
   rain-to-rise lag and drop rate if stated. Most MO Ozark floats are
   spring-influenced and forgiving; note any reach that is NOT.
5. **Hazards** — low-water dams, named rapids, strainers, bluff undercuts,
   whitewater sections (the St. Francis). Verbatim MDC/outfitter safety
   language where available.
6. **Local knowledge** — crowding (summer weekends), scenery landmarks,
   camping norms, water temperature, gravel-bar access etiquette.

## River-wide items

- **Identity**: NHD Permanent Identifier for the flowline
  (hydro.nationalmap.gov / NHDPlus HR; restrict to Missouri HUCs — the Ozarks
  are region 11 (White/Arkansas) and 10/07 for the Missouri/Mississippi
  drainages). Total river miles; difficulty rating.
- **Regulations**: MDC/state rules relevant to floating (no state PFD-under-7
  rule differences vs. federal — confirm), any county or conservation-area
  specifics, low-water-dam portage requirements. Cite authority + URL.
- **Access points**: every named put-in/take-out with GPS if MDC publishes it
  (MDC access list is authoritative for MO). Coordinates are **proposals** — a
  human places every point on the map.
- **Weather reference point**: the town best representing river weather (see the
  per-river scaffold suggestion; justify if you change it).
- **NWS alert search terms**: the Missouri counties the river runs through plus
  town and river names (pre-seeded in the scaffold; verify the county list).

## Output format

Return **one JSON document** conforming to `RiverDossier` in
`scripts/ingestion/dossier.ts` (identical field spec to the Buffalo dossier),
followed by a short narrative appendix (max 1 page): overall confidence, the
biggest source disagreements, and what a local expert should be asked.

## What NOT to do

- Do not average conflicting threshold numbers into one — record both with
  sources; the calibration signoff resolves them.
- Do not convert ft↔cfs yourself unless a source gives the rating; label any
  approximate correspondence as inference.
- Do not assume every MO river behaves like the Current/Meramec. The **St.
  Francis upper (Millstream Gardens → Silver Mines) is real whitewater**
  (Class II–IV, rain-dependent) — treat it as `rain_flashy`, not spring-fed.
- Do not soften MDC/NWS safety language.
