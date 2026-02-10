# Jacks Fork Gauge Stations – Diagnosis

## The three USGS gauge sites (official names)

| USGS Site ID | Official USGS name | Location |
|--------------|--------------------|----------|
| **07065200** | **Jacks Fork near Mountain View, MO** | Upper river, ~2 mi east of Mountain View (Texas Co.), drainage 185 mi² |
| **07065495** | **Jacks Fork at Alley Spring, MO** | At Alley Spring (Shannon Co.) – the one actually at the spring/mill |
| **07066000** | **Jacks Fork at Eminence, MO** | Lower river, near confluence with Current (Shannon Co.), drainage 398 mi² |

Sources: [USGS 07065200](https://waterdata.usgs.gov/monitoring-location/07065200/), [USGS 07065495](https://waterdata.usgs.gov/nwis/uv?site_no=07065495), [USGS 07066000](https://waterdata.usgs.gov/monitoring-location/07066000/).

---

## Why two gauges “say Alley Spring” but have different USGS numbers

Two different gauges are **incorrectly** labeled “Alley Spring” in the codebase, while the real Alley Spring gauge (07065495) is either missing or mislabeled.

### 1. **07065200** labeled “Alley Spring” (wrong)

- **Where:** `supabase/seed/gauge_stations.sql` and `scripts/fetch-gauge-stations.ts`.
- **Current:** Name is “Jacks Fork at Alley Spring, MO”.
- **Correct:** 07065200 is **Jacks Fork near Mountain View, MO** (upper river). Only **07065495** is at Alley Spring.

So the seed uses the wrong name for 07065200 and is the main source of the first “Alley Spring” label with the wrong USGS number.

### 2. **07066000** labeled “Alley Spring” (wrong)

- **Where:** `migrations/add_jacks_fork_gauge_stations.sql`.
- **Current:** That migration inserts 07066000 with name “Jacks Fork at Alley Spring”.
- **Correct:** 07066000 is **Jacks Fork at Eminence, MO**. Alley Spring is 07065495.

So if that migration has been run, the second “Alley Spring” with a different USGS number is 07066000, which is actually the Eminence gauge.

### 3. **07065495** (the real Alley Spring) mislabeled or missing

- **Official name:** Jacks Fork at Alley Spring, MO.
- **In codebase:**
  - **Not in seed:** `supabase/seed/gauge_stations.sql` only defines **07065200** for Jacks Fork.
  - **In `migrations/add_jacks_fork_gauge_stations.sql`:** 07065495 is inserted as “Jacks Fork at **Buck Hollow** near Mountain View”, which is incorrect; Buck Hollow is upstream and 07065495 is at Alley Spring.
  - **In `migrations/fix_jacks_fork_gauge_associations.sql`:** 07065495 is correctly described as “Jacks Fork at Alley Spring (middle)” and set as primary.

So the only gauge that should be named “Alley Spring” is **07065495**. The two that currently “say Alley Spring” with different USGS numbers are **07065200** (seed) and **07066000** (add_jacks_fork_gauge_stations), both misnamed.

---

## Summary

| USGS ID   | Should be named (USGS)        | Currently named in codebase |
|-----------|-------------------------------|------------------------------|
| 07065200  | Jacks Fork near Mountain View, MO | “Jacks Fork at Alley Spring, MO” (seed, fetch-gauge-stations) |
| 07065495  | Jacks Fork at Alley Spring, MO    | “Jacks Fork at Buck Hollow…” (add_jacks_fork_gauge_stations) or not in seed |
| 07066000  | Jacks Fork at Eminence, MO     | “Jacks Fork at Alley Spring” (add_jacks_fork_gauge_stations) |

**Root cause:** Copy/paste or outdated research: 07065200 was given the Alley Spring name (which belongs to 07065495), and a later migration then assigned “Alley Spring” to 07066000 and “Buck Hollow” to 07065495, reversing the real USGS names.

**Fix:** Use official USGS names everywhere: 07065200 = Mountain View, 07065495 = Alley Spring, 07066000 = Eminence; and ensure all three are present in seed/migrations with those names.

---

## Changes made in codebase

1. **`supabase/seed/gauge_stations.sql`**
   - 07065200 name set to **"Jacks Fork near Mountain View, MO"**.
   - 07065495 and 07066000 added with official names (**"Jacks Fork at Alley Spring, MO"** and **"Jacks Fork at Eminence, MO"**).
   - `river_gauges`: 07065495 (Alley Spring) set as primary for Jacks Fork; 07065200 and 07066000 linked as non-primary with appropriate thresholds.

2. **`scripts/fetch-gauge-stations.ts`**
   - 07065200 display name set to **"Jacks Fork near Mountain View, MO"**.

3. **`migrations/add_jacks_fork_gauge_stations.sql`**
   - 07065495 name set to **"Jacks Fork at Alley Spring, MO"** (was "Buck Hollow").
   - 07066000 name set to **"Jacks Fork at Eminence, MO"** (was "Alley Spring").
   - 07066510 insert removed (site not a Jacks Fork gauge per USGS).

4. **`src/app/gauges/page.tsx`**
   - Threshold description keys added for 07065495 (Alley Spring) and 07066000 (Eminence); 07065200 comment updated to "Mountain View (upper)".

**Existing databases:** Re-run seed or run a one-time update so `gauge_stations.name` and `river_gauges` match the above (e.g. update 07065200 name, insert 07065495/07066000 if missing, set 07065495 primary for Jacks Fork).
