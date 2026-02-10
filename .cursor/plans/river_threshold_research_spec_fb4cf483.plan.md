---
name: River Threshold Research Spec
overview: Create a robust specification document that defines how to research, document, and specify gauge-based river condition thresholds for the five uncalibrated rivers (Meramec, Niangua, Big Piney, Huzzah, Courtois), with Huzzah as priority, using gauge height by default and aligning with official closure/hazard designations.
todos: []
---

# River Condition Threshold Research Spec (Plan)

## Goal

Produce a **specification document** (not code or migrations) that:

- Defines a repeatable research process and data model for per-gauge river conditions.
- Prioritizes **Huzzah Creek** (one gauge: 07017200 – Steelville), then the other four rivers.
- Defaults to **gauge height (ft)**; uses **CFS** only when local sources or research justify it (e.g., narrow stage range like Current/Akers).
- Aligns **dangerous/high** thresholds with **NPS, USFS, or other authority** closure/hazard levels where available.
- Ensures conditions are **per gauge**, based on research and local knowledge, so the spec can later drive migrations and docs in the style of [docs/threshold-recalibration.md](missouri-float-planner/docs/threshold-recalibration.md).

---

## Scope

| River | Gauge(s) (USGS) | Priority |
|-------|------------------|----------|
| **Huzzah Creek** | 07017200 (Steelville) – primary | 1 |
| Meramec River | 07019000 (Eureka), 07018500 (Sullivan) | 2 |
| Niangua River | 06923500 (Hartville) | 3 |
| Big Piney River | 06930000 (Big Piney) | 4 |
| Courtois Creek | 07017610 (Berryman) | 5 |

Existing DB shape (no schema change in this spec): [supabase/migrations/00002_tables.sql](missouri-float-planner/supabase/migrations/00002_tables.sql) – `river_gauges` has `threshold_unit` ('ft' | 'cfs') and six levels: `level_too_low`, `level_low`, `level_optimal_min`, `level_optimal_max`, `level_high`, `level_dangerous`.

---

## Deliverable: Spec Document Contents

The spec will be a new doc (e.g. `docs/river-threshold-research-spec.md`) containing the following sections.

### 1. Research framework

- **Objective per gauge**: Define the six threshold values (and unit) that map to condition labels: Too Low, Low, Optimal (min–max), High, Dangerous.
- **Authority alignment**: For each gauge, identify and record:
- Any **official closure** level (NPS, USFS, state, county) and source.
- **NWS flood stage** (from USGS/waterdata) for context; dangerous threshold should be at or below closure/flood where applicable.
- **Unit choice**: Default **ft**. Use **CFS** only if (a) local sources (outfitters, guides, MSR) consistently use CFS, or (b) gauge stage has a very narrow range and CFS is more discriminative (document rationale).

### 2. Data to capture per gauge

For each gauge, the spec will require documenting:

- **Gauge**: USGS site ID, name, river, and which section it represents (e.g. upper/lower).
- **Unit**: ft or cfs, with one-sentence rationale if cfs.
- **Authority / closure**: Who closes or warns (e.g. USFS, NPS, MDC, outfitter policy), at what level (ft or cfs), and URL or citation.
- **Typical range**: Average or “normal” level from USGS/MSR/local sources (for sanity-checking thresholds).
- **Six thresholds** with short rationale (can mirror [threshold-recalibration.md](missouri-float-planner/docs/threshold-recalibration.md) table).
- **Key feedback**: Bullet list of local knowledge (e.g. “tubes best below X ft”, “below Y you’ll drag”, “above Z they don’t put in”).
- **Sources**: List of URLs and, if any, named contacts (outfitter, ranger).

### 3. Source checklist and usage

- **Primary sources** (from your list):
- [huzzahvalley.com/floating/](https://huzzahvalley.com/floating/) – Huzzah-specific (priority).
- [missouriscenicrivers.com](https://missouriscenicrivers.com) – levels and averages where available (Current, Eleven Point, Jacks Fork already used; check for Meramec/Niangua/Big Piney/Huzzah/Courtois).
- [rivers.moherp.org](https://rivers.moherp.org) – trip and level info.
- [waterdata.usgs.gov/state/Missouri/](https://waterdata.usgs.gov/state/Missouri/) – real-time and historical stage/flow; NWS flood stages.
- [missouricanoe.org/the-rivers/](https://missouricanoe.org/the-rivers/), [dillardmill.com/thoughts/floating-guide](https://www.dillardmill.com/thoughts/floating-guide), [ozarkfloating.com](https://www.ozarkfloating.com/) – general floating guidance and possible level mentions.
- [currentrivercanoe.com/crfloats.html](https://www.currentrivercanoe.com/crfloats.html) – Current only; use as pattern for “what to look for” (closure, optimal range).
- **Per source**: What to look for (closure level, “ideal” range, “too low” / “too high” mentions, ft vs cfs).

### 4. Output template (per gauge)

Spec will include a template so that when research is done, findings drop into the same structure as [threshold-recalibration.md](missouri-float-planner/docs/threshold-recalibration.md):

- Gauge name and USGS ID.
- Source(s).
- Table: Threshold | Old Value (current seed) | New Value | Rationale.
- Key Feedback (bullets).
- Authority closure/hazard (who, level, link).

This keeps the spec and future “recalibration” docs consistent and migration-ready.

### 5. Priority and order

- **Phase 1 – Huzzah**: Full research and one filled template for 07017200 (Steelville); confirm authority (e.g. USFS/MDC) and closure/hazard if any; decide ft vs cfs.
- **Phase 2–5**: Same process for Meramec (both gauges), Niangua, Big Piney, Courtois (order TBD or by traffic/request).

### 6. Out of scope in this spec

- No migration or seed SQL.
- No UI or API changes.
- No change to [src/lib/conditions.ts](missouri-float-planner/src/lib/conditions.ts) or gauge fetch logic; the spec only defines *what* to document so that a future implementation (migrations + optional threshold-recalibration doc updates) can be done from the spec.

---

## File to add

- **New file**: [docs/river-threshold-research-spec.md](missouri-float-planner/docs/river-threshold-research-spec.md) containing sections 1–5 above: research framework, data to capture per gauge, source checklist, output template, and priority order. The doc will reference existing [docs/threshold-recalibration.md](missouri-float-planner/docs/threshold-recalibration.md) and [supabase/seed/gauge_stations.sql](missouri-float-planner/supabase/seed/gauge_stations.sql) for current threshold values and gauge list.

---

## Summary

| Item | Action |
|------|--------|
| Scope | 5 rivers, 7 gauges total; Huzzah (1 gauge) first |
| Unit | Default ft; CFS only with documented rationale |
| Authority | Align dangerous/high with NPS/USFS/other closure or hazard levels |
| Granularity | Per-gauge conditions, research- and local-knowledge based |
| Deliverable | Single spec doc: research process + data model + source list + template + priority |
| Implementation | Spec only; no code or DB changes in this plan |