# eddy.guide — Float Data Accuracy & Modeling Audit

> Correctness audit of the float-trip data model (mileage, speed, time, and gauge/CFS
> anchoring) against hydrological reality and known ground truth. Findings trace real
> file paths, formulas, and constants, and — where possible — are confirmed against the
> **live production database** (`FloatMe`, Supabase `ilefwfpvphadsbptiaur`), queried
> read-only on 2026-07-01. Live-verified facts are marked **[live]**.

---

## 1. Executive summary

The float **distance** pipeline is the most trustworthy part of the stack: it is genuine
along-channel linear referencing (`ST_LineLocatePoint`/`ST_LineSubstring`) over real NHD
flowlines for 7 of 8 rivers, and the headline mileage number is differenced from
hand-entered guide miles, so it is roughly right. Almost everything downstream of the
gauge reading, however, is **plausible-looking but unvalidated**. The single largest
source of error is the **float-speed model**: speed is a flat per-vessel constant chosen
by a three-way condition step (`speedLowWater`/`speedNormal`/`speedHighWater` with 0.75×
and 0.5× multipliers) with **no dependence on discharge, gradient, or channel geometry** —
the classic "flat mph" bug the domain warns about. Against published outfitter/NPS float
times it runs **7–23% short on the spring-fed Current and 31–60% short on small creeks**,
and it is systematically **optimistic in exactly the optimal-flow band people most often
float in** — the dangerous direction, because it under-plans daylight. The intended
ground-truth path exists (`float_segments` + `get_segment_float_time`, sourced from
floatmissouri.org) but **[live] the `float_segments` table is empty (0 rows)**, so every
float time users see is the uncalibrated estimate, reported as a false-precision point
value ("~3 hours 50 minutes") with no range. The highest **safety** risks are threefold:
(1) those optimistic times; (2) **"Dangerous — Do Not Float" water still returns a
concrete float-time estimate** everywhere (the DB guard that returns `NULL` for dangerous
is dead code); and (3) **[live] all 20 condition-threshold rows are self-labeled
`editorial` guesses** with zero official NWS flood/action-stage backfill, and the schema's
contradictory Van Buren "river closes" value (5.0 ft in the fix migration vs 12.0 ft in
the seed) means a fresh rebuild would silently loosen a closure threshold by 2.4×. The
gauge→segment transfer is naive (nearest gauge applied to a whole reach, no drainage-area
scaling), and provisional USGS data is surfaced as authoritative (the `qualifiers` field
is parsed and then ignored). Net: **trust the miles, don't trust the minutes or the
condition bands without calibration.**

---

## 2. Scorecard

| Dimension | Rating | One-line justification |
|---|---|---|
| Provenance & freshness | **Weak** | Hourly ingest vs USGS ~15-min; provisional `qualifiers` parsed then ignored; 2–6 h staleness narrated as current; live-fallback hardcodes `accuracyWarning:false`. |
| Stage vs discharge integrity | **Adequate** | DB condition RPCs are now unit-aware (`00098`); but the plan endpoint's live-USGS fallback compares feet against CFS thresholds. |
| Gauge-to-segment representativeness | **Weak** | Nearest at/upstream gauge applied to the whole reach; **no drainage-area scaling or tributary-inflow adjustment**; only a distance warning. |
| Segment length accuracy | **Adequate** | Along-channel guide miles are sound; but `length_miles` disagrees with `ST_Length(geom)` by −18% to +56%, distorting fraction-based geometry; Big Piney is a crude 22-vertex line. |
| Float-speed model | **Unsafe** | Flat mph per condition band; no flow/gradient/geometry dependence; optimistic in the optimal band. |
| Float-time computation | **Unsafe** | Moving time presented as trip time; **dangerous water still gets a time**; calibrated path empty; false-precision point values. |
| Condition taxonomy mapping | **Weak** | **[live] 100% `editorial` thresholds**, round copy-pasted bands, `level_high` a dead near-duplicate of `optimal_max`. |
| Calibration & ground truth | **Unsafe** | No calibration loop; `float_segments` empty in prod; no residual analysis; all bands unvalidated. |
| Edge cases & failure modes | **Weak** | No stuck-sensor detection; stage/CFS conflation on fallback; confident time on flood water. |
| Uncertainty communication | **Weak** | Point estimates to the minute from a ±30% model; range only from the (empty) calibrated path. |
| Internal consistency | **Weak** | Four condition code paths + hard-coded chat/social speeds → same segment can disagree across map/widget/Eddy/API. |
| Optimization vs accuracy | **Adequate** | Mostly bounded; 1-h `revalidate` on fallback fetch and ~25 h-old "Eddy Says" prose are the real staleness-for-speed trades. |

---

## 3. Findings

### F1 — Float speed is a flat constant per condition band, with no flow dependence — *Severity: High (safety)*
**Evidence.** Speeds are three fixed mph values per vessel (`supabase/migrations/00005_seed_vessel_types.sql:4-8`): canoe `2.0 / 2.5 / 3.5`. `src/lib/calculations/floatTime.ts:27-60` selects one by condition code and applies fixed multipliers:
```
dangerous/high → speedHighWater (3.5)   flowing → speedNormal (2.5)   good → speedLowWater (2.0)
low → speedLowWater*0.75 (1.5)          too_low → speedLowWater*0.5 (1.0)
```
There is no term for discharge (CFS), gradient, or channel geometry. A river at 250 cfs and the same river at 900 cfs in the same band float at the identical assumed speed.

**Why it's wrong (physically implausible).** Open-channel velocity scales nonlinearly with discharge (`V = Q/A`; Manning `V = (1.49/n)·R^(2/3)·S^(1/2)`). A single mph per band cannot represent a swift spring-fed river and a shallow twisty creek at once. The calibration in §4 shows the model runs 7–23% short on the Current and 31–60% short on Huzzah Creek — the creek error is exactly the geometry the flat model can't see.

**Estimated error magnitude.** ±20–60% on trip time depending on segment character; systematically **optimistic** in the `flowing`/optimal band (the common case).

**Corrected approach.** Replace the band-step with a per-segment base speed (mph at a reference CFS) modulated by a flow factor, e.g. `V_eff = V_base · (Q/Q_ref)^0.3`, clamped to a floor (dragging/walking at very low flow) and a ceiling; then add explicit stop time (F3/F4 below). Tune `V_base` per segment to the published times in §4 and accept residuals as the metric.

---

### F2 — The calibrated ground-truth path is empty in production; every float time is the flat estimate, shown as a false-precision point value — *Severity: High*
**Evidence.** `/api/plan` first tries `get_segment_float_time` (hand-entered ranges from `float_segments`) and only falls back to `calculateFloatTime` when that returns nothing (`src/app/api/plan/route.ts:308-351`). **[live]** `select count(*) from float_segments` → **0 rows**. The table is created in `supabase/migrations/00011_float_segments.sql` and populated only by a standalone, never-deployed script (`scripts/import-float-segments.ts`, run manually via `npx tsx`) — it is not in any migration or seed. Consequently the `timeRange {min,max}` branch (`plan/route.ts:322-325`) never fires; the served value is `formatFloatTime(minutes)` → e.g. `"~3 hours 50 minutes"` (`floatTime.ts:81-94`), a point value rounded to the minute.

**Why it's wrong (provably; confirmed live).** A single integer minute count is emitted from a model whose own error is ±20–60% (F1). The one honest range the system can produce is structurally unreachable.

**Corrected approach.** Either (a) run `import-float-segments.ts` and expand it to all rivers so `get_segment_float_time` returns real ranges, or (b) have `calculateFloatTime` return a `{min,max}` band (e.g. base speed ±25%) and render it. Never display sub-15-minute precision on an estimate.

---

### F3 — "Dangerous — Do Not Float" water still returns a concrete float time; the DB guard is dead code — *Severity: High (safety)*
**Evidence.** `src/lib/calculations/floatTime.ts:28-31`: `case 'dangerous': speedMph = speeds.speedHighWater;` — dangerous returns a normal-looking time. The DB function that *does* guard it, `calculate_float_time` (`.../00081_rename_condition_codes.sql`, `WHEN 'dangerous' THEN NULL`), is **never called from any TS/TSX file** — it survives only in generated types (`src/types/database.ts`). Every user-facing surface (plan, chat `tool-handlers.ts`, social `post-types.ts`) uses the TS function. The plan only adds a warning string (`plan/route.ts:458-460`).

**Why it's wrong.** On a safety product, printing "~2 hours" beside "do not float" invites exactly the wrong behavior; the two code paths also contradict each other on the same input (one refuses, one answers).

**Corrected approach.** Make `calculateFloatTime` return `null` for `dangerous` (and arguably `too_low`), and have every surface render "—" / a closure message instead of a duration. Delete or wire up the DB guard so the contract is singular.

---

### F4 — 100% of condition thresholds are unvalidated `editorial` guesses; no official flood/action stage backfill — *Severity: High (safety)*
**Evidence.** **[live]** `select threshold_source, count(*) from river_gauges group by 1` → **all 20 rows `editorial`; 0 with `flood_stage_ft`; 0 with `threshold_source_url`.** Migration `00114_river_gauges_threshold_provenance.sql` added the `threshold_source / flood_stage_ft / action_stage_ft / nws_lid` columns and stamped every existing row `editorial`, intending an external backfill that never happened. Several bands are transparently copy-pasted round numbers — **[live]** Niangua Windyville and Big Piney/Houston/Tunnel Dam share the identical `…/5.0/7.0/10.0` block; the seed itself concedes `-- Thresholds are approximate` (`seed/gauge_stations.sql:172`). Only Doniphan is tied to a real percentile source (moherp.org, CFS).

**Why it's wrong (plausible-but-uncalibrated).** These bands are the sole driver of the seven-level safety label. Labeling water "Flowing – Ideal" or "Dangerous" from an un-sourced guess is confident-but-unverified. It is not *provably* wrong, but it is asserted, not validated — the exact failure the audit exists to catch.

**Corrected approach.** Backfill NWS AHPS `action_stage`/`flood_stage` per gauge (the `nws_lid` column already exists, e.g. `VBNM7` for Van Buren) and anchor `level_dangerous`/`level_high` to them; validate optimal bands against outfitter-published runnable ranges and USGS daily percentiles; set `threshold_source` truthfully per row.

---

### F5 — `rivers.length_miles` disagrees with the actual channel geometry, distorting all fraction↔mile geometry — *Severity: Medium-High*
**Evidence.** **[live]** `length_miles` vs `ST_Length(geom)`:

| river | length_miles (stored) | ST_Length(geom) mi | geom vertices | Δ |
|---|---|---|---|---|
| meramec | 108.5 | **169.2** | 551 | +56% |
| current | 134.2 | **171.6** | 632 | +28% |
| jacks-fork | 54.7 | **44.8** | 192 | −18% |
| big-piney | 68.4 | 47.2 | **22 (crude line)** | −31%, unreliable |
| niangua | 76.3 | 83.2 | 330 | +9% |
| eleven-point | 96.8 | 91.3 | 363 | −6% |
| huzzah | 32.6 | 35.1 | 166 | +8% |
| courtois | 28.3 | 30.8 | 158 | +9% |

`snap_to_river` and `get_float_segment` convert between mile and geometry fraction using `mile / length_miles` (`.../00010_update_mile_calculations.sql`), and `get_point_at_mile` places points at `mile/length_miles`. When `length_miles` is 28–56% off the true channel length, those fractions are wrong.

**Why it's wrong / bounded.** The **headline distance number is protected** — `get_float_segment` returns `ABS(end_mile − start_mile)` from hand-entered guide miles, not a geometry length — so mileage shown to users is fine. But the **rendered route polyline** (`ST_LineSubstring(geom, start_mile/length, end_mile/length)`) and every **mile-based point placement** (campgrounds/gauges/POIs via `get_point_at_mile`) are stretched/compressed by up to ~56% (Meramec) and can start/end well away from the true access point. Big Piney (22-vertex straight line) is unreliable for both geometry and any geometry-derived mileage.

**Corrected approach.** Set `length_miles = ST_Length(geom::geography)/1609.34` per river (or store each access point's `ST_LineLocatePoint` fraction directly and stop round-tripping through `length_miles`); re-import Big Piney NHD geometry.

---

### F6 — Contradictory committed values for the Van Buren "river closes" threshold; a rebuild silently loosens it 2.4× — *Severity: Medium (safety, latent)*
**Evidence.** `00051_fix_van_buren_gauge_thresholds.sql:17` sets `level_dangerous = 5.0` ("river closes at 5.0 ft", NPS/outfitter-sourced). `seed/gauge_stations.sql:303-308` sets the same gauge to `…/6.0/8.0/12.0` (`level_dangerous = 12.0`). Per `README.md` and `00053`'s own note, **migrations run before seeds**, so a fresh `supabase db reset` applies the seed last → `12.0`. **[live]** production currently reads `level_dangerous = 5.0` (opt_max 3.9 / high 4.0 — further admin-tuned), i.e. the *safe* value won historically.

**Why it matters.** The live DB is currently correct, but the repository contains two contradictory definitions of a life-safety closure threshold, and the documented build order favors the looser one. A reseed would relabel Current-at-Van-Buren water up to 12 ft (major flood) as merely "high" or even "flowing" up to 6 ft.

**Corrected approach.** Make the seed match the fix migration (single source of truth), or delete the threshold values from the seed and let the dedicated migration own them.

---

### F7 — Plan endpoint's live-USGS fallback conflates stage and CFS and suppresses the accuracy warning — *Severity: Medium*
**Evidence.** The DB RPC `get_river_condition_segment` is unit-aware (fixed in `00042`→`00098`, `comparison_value` CTE). But when it returns `unknown`/no reading, `/api/plan` refetches live USGS and calls the local `computeConditionFromReading` (`plan/route.ts:21-42`), which builds `ConditionThresholds` **without `thresholdUnit`** and calls `computeCondition(gaugeHeightFt, t)` **without `dischargeCfs`** (lines 40, 215, 274). It also hardcodes `accuracy_warning:false` (line 296). **[live]** the only CFS gauge in production is Doniphan (Current, mile 134, `1100/1500/2350/3350/3350/7800` cfs); for a lower-Current put-in that selects Doniphan with no cached reading, the fallback compares a **gauge height in feet (which for Doniphan reads near-zero/negative due to a datum offset)** against CFS thresholds → everything lands in `too_low`. The sibling `/api/conditions` fallback *does* pass unit+discharge (`conditions/[riverId]/route.ts:73`), so the two endpoints can disagree on the same input.

**Why it's wrong (provably, scoped).** It is a genuine stage-vs-CFS conflation, but only reachable on the fallback (no DB reading). **[live]** readings are fresh (~0.9 h old, 561,936 rows), so the DB path normally serves — this bites during a gauge/cron gap.

**Corrected approach.** Have `computeConditionFromReading` accept and pass `threshold_unit` + `dischargeCfs` (reuse the conditions-endpoint helper); compute a real `accuracy_warning` from the live timestamp.

---

### F8 — Four divergent condition/time code paths → the same segment can show different numbers on different surfaces — *Severity: Medium (consistency)*
**Evidence.** Condition resolves via: `get_river_condition_segment` (plan, by river-mile), `get_river_condition_segment`-by-point *or* `get_river_condition` (conditions endpoint), `get_river_condition` primary-gauge (river list / home dot / "Eddy Says", `src/lib/data/rivers.ts:67`), and TS `computeCondition` fallbacks with differing argument sets. Float time resolves via vessel-specific TS speeds (plan) but **hard-coded canoe speeds `{2.0,2.5,3.5}`** in chat (`tool-handlers.ts`) and social (`post-types.ts`), which also skip `get_segment_float_time` entirely. Different gauge selection (nearest-by-mile vs nearest-by-point vs primary) can yield different condition codes for the same put-in.

**Corrected approach.** One condition resolver and one time resolver behind a single function, consumed by every surface (map, plan widget, Eddy Says, chat, OG image, API/MCP).

---

### F9 — USGS provisional/estimated qualifiers are parsed and then ignored — *Severity: Medium*
**Evidence.** `src/lib/usgs/gauges.ts:6` declares `qualifiers: string[]`, but no code reads `.qualifiers`; the ingest upsert (`api/cron/update-gauges/route.ts`) stores no qualifier column. Provisional (`P`), estimated (`e`), and ice-affected readings are surfaced identically to approved (`A`) data.

**Why it's wrong.** Provisional `iv` data can be revised substantially; presenting it as authoritative on a safety product overstates confidence, especially after channel-altering floods when the rating curve has shifted.

**Corrected approach.** Persist the qualifier; surface a "provisional" note; optionally widen uncertainty when `P`/`e`.

---

### F10 — Freshness gaps: hourly ingest vs 15-min USGS, an unwired high-frequency path, and stale prose served as current — *Severity: Medium*
**Evidence.** Ingest cron is `0 * * * *` — **hourly** (`vercel.json`), while USGS `iv` updates ~every 15 min; the `x-high-frequency` 15-min path exists in `update-gauges/route.ts` but **no cron triggers it**, so even rapidly rising rivers ingest hourly. Non-cron `fetchGaugeReadings` uses `next.revalidate: 3600` (1 h) — on exactly the live-fallback paths. "Eddy Says" prose is regenerated by **daily** crons with `UPDATE_TTL_HOURS = 25`, and `overlayLiveConditions` only refreshes when the condition *code* crosses a bucket (`live-conditions.ts`) — within-band drift keeps day-old specifics. `RiverHeader.tsx:111,149` render the "updated N h ago" string only when `readingAgeHours < 24`, so a ≥24 h reading shows **no** age; `EddyQuote` shows generation time, not reading age. No stuck-sensor/flatline detection.

**Corrected approach.** Add a 15-min cron for `high_frequency_flag` gauges; always surface reading age and a provisional flag; add a variance/flatline check; gate overlaid prose on reading age, not just bucket change.

---

### F11 — Gauge-to-segment transfer is naive: one gauge reading applied to a whole reach, no drainage-area or tributary scaling — *Severity: Medium*
**Evidence.** `get_river_condition_segment` (`00098`) selects the nearest gauge at/upstream of the put-in (downstream/primary fallback) and applies **that gauge's** reading and thresholds to the segment. A grep for `drainage|tributary|scal|prorate` across `supabase/` finds only descriptive comments justifying hand-tuned thresholds — **no runtime proration**. The only mitigation is a distance `accuracy_warning`.

**Why it's wrong.** On the Current, Big Spring (one of the largest springs in the US) adds enormous flow between Two Rivers and Doniphan; a single upstream gauge can misstate a downstream reach by a large factor. Courtois uses the Huzzah gauge as an explicit proxy with no adjustment.

**Corrected approach.** For reaches far from their gauge or below major inputs, scale discharge by drainage-area ratio (`Q_seg ≈ Q_gauge · (A_seg/A_gauge)^b`, b≈0.8–1.0) before classifying, or interpolate between bracketing gauges.

---

### F12 — False precision throughout — *Severity: Low-Medium*
**Evidence.** `calculateFloatTime` rounds to the minute (`floatTime.ts:67`) and `formatFloatTime` prints "~3 hours 50 minutes"; distance renders to 0.1 mi (`formatDistance`); condition bands print to 0.1 ft. All from ±20–60% (time) / editorial (bands) inputs.

**Corrected approach.** Present time as a range or to the nearest quarter-hour; treat false precision as a defect, not a nicety.

---

### F13 — Reverse-direction 1.5× penalty and kayak==canoe in the (empty) calibrated path — *Severity: Low*
**Evidence.** `get_segment_float_time` (`00011`) multiplies upstream floats by a flat `1.5×` and returns canoe times for kayaks. Harmless today (table empty, F2) but wrong if populated: floating upstream is usually infeasible, not 1.5× slower, and kayaks are meaningfully faster than canoes.

---

## 4. Calibration results

There is **no calibration in production**; `float_segments` is empty (F2), and all thresholds are `editorial` (F4). The comparison below is what a calibration loop *would* find, using the app's **live** guide-mile distances and canoe speeds against published planning times (floatmissouri.org / NPS full-day conventions). App time uses `flowing`→2.5 mph (the optimal band people usually float in); the `good`→2.0 mph column is shown for contrast.

| Segment | live mi **[live]** | published (canoe) | app @2.5 (`flowing`) | app @2.0 (`good`) | residual vs mid (flowing) |
|---|---|---|---|---|---|
| Current: Akers → Pulltite | 9.6 | 4–6 h | 3 h 50 m | 4 h 48 m | **−23%** |
| Current: Pulltite → Round Spring | 8.9 | 3–5 h | 3 h 34 m | 4 h 27 m | −11% |
| Current: Round Spring → Two Rivers | 17.3 | 6–9 h | 6 h 55 m | 8 h 39 m | −8% |
| Current: Akers → Round Spring | 18.5 | 7–9 h | 7 h 24 m | 9 h 15 m | −7% |
| Huzzah (creek): Harpers → Valley Bridge | 6.0 | 3–4 h | 2 h 24 m | 3 h 00 m | **−31%** |
| Huzzah (creek): Blunts → Butts | 4.0 | 3–5 h | 1 h 36 m | 2 h 00 m | **−60%** |

**Systematic bias, not random scatter.** Every residual at optimal-band speed is **negative** — the model runs short — and the shortfall grows as segments get smaller and slower (creeks). This is the fingerprint of (a) a missing stop-time term and (b) a single mph that can't represent small twisty channels. Notably, the `good`→2.0 mph value matches the Current midpoints far better than the `flowing`→2.5 mph value, which suggests the "optimal ⇒ faster (2.5)" mapping is itself miscalibrated: on these rivers a realistic *trip* pace (with stops) is ~2.0 mph regardless of band. Also note the never-deployed `import-float-segments.ts` distances (e.g. Akers→Pulltite = 12 mi) are ~25% higher than the live guide miles (9.6 mi) — so even the dormant calibration data is internally inconsistent with the served mileage and would need reconciliation before use.

**Recommended acceptance metric.** Per-segment base speed tuned so median |residual| ≤ 10% against the published set, with an explicit stop-time allowance (e.g. +10–15 min per few hours) folded into "trip time," reported separately from "moving time."

---

## 5. Correctness roadmap

**Quick fixes (units, conflation, false precision, freshness flags, dead guards):**
1. Return `null`/closure text for `dangerous` (and `too_low`) in `calculateFloatTime`; stop printing a time for flood water (F3).
2. Pass `threshold_unit` + `dischargeCfs` into the plan endpoint's fallback `computeCondition`, and compute a real `accuracy_warning` (F7).
3. Fix the seed's Van Buren thresholds to match `00051` (F6).
4. Set `length_miles = ST_Length(geom)` per river; re-import Big Piney geometry (F5).
5. Render float time as a range / to the quarter-hour, not to the minute (F2, F12).
6. Persist and surface USGS `qualifiers` (provisional flag); always show reading age, including ≥24 h (F9, F10).
7. Collapse chat/social hard-coded speeds and the four condition paths onto single shared resolvers (F8).

**Deeper modeling work (the real accuracy gains):**
1. **Flow-dependent speed:** replace the band-step with a per-segment base speed modulated by `(Q/Q_ref)`, floored/ceilinged, plus explicit stop time (F1) — validate against §4 residuals.
2. **Populate + expand ground truth:** load `float_segments` for all rivers from outfitter/NPS times so `get_segment_float_time` returns real ranges, and stand up a residual/calibration loop (F2, F4).
3. **Backfill official stages:** fill NWS AHPS action/flood stages (via the existing `nws_lid`) and anchor `dangerous`/`high` to them; validate optimal bands against runnable ranges (F4).
4. **Gauge-to-segment transfer:** drainage-area scaling / multi-gauge interpolation for distant or below-major-spring reaches (F11).
5. **15-min ingest for rapid-change gauges** and stuck-sensor detection (F10).

---

## 6. What's sound (preserve through any refactor)

- **Along-channel distance via linear referencing** over real NHD flowlines for 7/8 rivers (`ST_LineLocatePoint`/`ST_LineSubstring`), with the headline mileage differenced from curated guide miles — the numbers are roughly right and channel-following.
- **DB condition RPCs are now unit-aware** (`00098`): CFS gauges compare discharge, ft gauges compare stage, with a surfaced fallback warning when the needed metric is missing. Keep this; extend it to the plan fallback (F7).
- **The "high starts at `optimal_max`" alignment** (`00098`/`00103`) keeps the badge and the conditions-bar needle consistent — a genuine internal-consistency win. (Note `level_high` is now a near-duplicate dead column; document or drop it.)
- **Timezone handling is correct:** USGS ISO timestamps with offset are stored in `TIMESTAMPTZ`, age math uses absolute epoch, and display uses `Intl` `America/Chicago` — no naive-Date truncation on the reading path.
- **Freshness plumbing exists and works:** **[live]** 561,936 readings, newest ~0.9 h old; the response already carries `readingTimestamp`/`readingAgeHours`/`accuracyWarning` — the gaps are in *surfacing* (F10), not in capture.
- **Gauge value sanitization** (dropping `-999999` sentinels and out-of-range stage/discharge) is present in `fetchGaugeReadings`.
- **Nearest-at/upstream gauge selection** is the right default instinct for multi-gauge rivers — it just needs flow transfer added, not replacement (F11).

---

*Prepared by static analysis of the codebase plus read-only queries against the live
`FloatMe` Supabase project (2026-07-01). No production data or code was modified. Where a
claim depends on migration-vs-seed run order, the live DB state is reported as
authoritative and marked **[live]**.*
