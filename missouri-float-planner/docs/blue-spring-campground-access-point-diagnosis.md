# Why Blue Spring Campground (NPS) Doesn’t Show Up as an Access Point on Jacks Fork

## Summary

**Root cause:** The **Blue Spring** access point for the Jacks Fork was never inserted. The seed only creates **Alley Spring** and **Eminence City Access** for Jacks Fork. NPS matching can only link a campground to an existing access point, so "Blue Spring Campground" from the NPS table has no Jacks Fork access point to attach to.

A secondary issue: even if Blue Spring AP existed, migration **00043** only fills in links where `nps_campground_id IS NULL`, so a wrong link from **00039** (e.g. Current River’s Blue Spring getting the NPS campground) would never be corrected for Jacks Fork.

---

## 1. Missing Blue Spring access point (main cause)

- **Seed** (`supabase/seed/access_points.sql`) only inserts two Jacks Fork access points:
  - Alley Spring  
  - Eminence City Access  

- **Blue Spring** (and Buck Hollow, South Prong, Bluff View, Rymers, Bay Creek, Shawnee Creek, Two Rivers) are **never inserted** in the seed or in any migration.

- **00028** and **jacks_fork_miles.sql** only do `UPDATE access_points SET ... WHERE name ILIKE '%Blue Spring%' AND river_id = jacks-fork`. They assume a row already exists, so they update zero rows if Blue Spring was never inserted.

- **NPS → access point linking** (00039 and 00043) only sets `access_points.nps_campground_id`. They do not create access points. So the NPS record "Blue Spring Campground" can never “show up as an access point” on Jacks Fork if there is no "Blue Spring" access point row.

**Conclusion:** Add the missing Jacks Fork access points (including Blue Spring) to the seed so that NPS "Blue Spring Campground" can be linked to a "Blue Spring" access point on Jacks Fork.

---

## 2. Order of operations and 00043 not fixing wrong links

- **00039** links NPS campgrounds to access points by **name only**, with **no river filter**. So "Blue Spring Campground" (NPS) matches any access point named "Blue Spring" (Current River and/or Jacks Fork).  
  If there is only one NPS "Blue Spring Campground" (e.g. the one near Current River), 00039 can assign that same campground to both Current’s and Jacks Fork’s Blue Spring APs (if both existed). If Current’s AP is processed first and “wins” the one NPS record, Jacks Fork’s Blue Spring AP could end up with no link or the wrong one.

- **00043** is intended to fix Jacks Fork NPS links using **name + proximity** (campground within 5 km of the access point). But it only runs:
  - `WHERE ... AND ap.nps_campground_id IS NULL`  
  So it **only fills in NULL**; it never overwrites an existing (wrong) link. If 00039 already set Jacks Fork’s Blue Spring to the Current River campground, 00043 will skip that row and the wrong link stays.

**Conclusion:** For Jacks Fork, 00043 should also correct **wrong** links (e.g. where the linked campground is not within 5 km of the Jacks Fork access point), not only rows where `nps_campground_id IS NULL`.

---

## 3. Proximity in 00043

00043 requires the NPS campground to be within **5 km** of the access point. If the NPS API has a single "Blue Spring Campground" with coordinates near **Current River**, that point will be far from the **Jacks Fork** Blue Spring access (different river). So even after adding the Blue Spring AP, 00043 would not link that NPS record to Jacks Fork’s Blue Spring unless the NPS data actually has a separate "Blue Spring Campground" (or equivalent) with coordinates near the Jacks Fork. If NPS has two such campgrounds (Current and Jacks Fork), both with lat/long, then once the Blue Spring AP exists, 00043 can link the correct one by distance.

---

## Changes made

1. **`supabase/seed/access_points.sql`**  
   - Insert the missing **Blue Spring** access point for Jacks Fork (and optionally the other expected points: South Prong, Buck Hollow, Bluff View, Rymers, Bay Creek, Shawnee Creek, Two Rivers) so that:
     - The NPS "Blue Spring Campground" has a Jacks Fork access point to link to.
     - 00028 and jacks_fork_miles have rows to update.

2. **Optional (recommended):** In **00043**, for Jacks Fork access points, also update rows where the **current** `nps_campground_id` points to a campground that is **not** within 5 km of that access point (i.e. clear wrong links and re-match by name + proximity), instead of only updating where `nps_campground_id IS NULL`.
