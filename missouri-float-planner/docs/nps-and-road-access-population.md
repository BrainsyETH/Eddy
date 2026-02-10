# Why NPS Campground Data and Road Access Aren’t Populated

## 1. NPS campground data

**Where it comes from:** The `nps_campgrounds` table is **not** seeded. It is filled only by the **NPS sync**:

- **Endpoint:** `POST /api/cron/sync-nps`
- **Auth:** `Authorization: Bearer <CRON_SECRET>` (requires `CRON_SECRET` in env)
- **Code:** `src/app/api/cron/sync-nps/route.ts` → `syncNPSData()` in `src/lib/nps/sync.ts`, which calls the NPS API and upserts into `nps_campgrounds`.

**If NPS campground data is empty:**

1. **Run the sync** at least once (e.g. weekly cron or manually):
   ```bash
   curl -X POST "https://your-app.com/api/cron/sync-nps" \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
2. Ensure `CRON_SECRET` is set in the environment.
3. After sync, **link campgrounds to access points** so the UI can show “NPS Campground Info”:
   - Migrations 00039 and 00043 (and 00044) set `access_points.nps_campground_id` by name + proximity.
   - If you added the Blue Spring access point in seed after those ran, run the UPDATE in `00044_jacks_fork_nps_campground_links.sql` so Jacks Fork points (including Blue Spring) get linked.

So: **NPS data is empty until the sync cron runs and links are applied.**

---

## 2. Road access

**Where it comes from:** “Road Access” in the app is the **`access_points.road_access`** column. It is **not** from NPS. It is set by:

- **Migrations:** 00026 (Current), 00027 (Eleven Point), 00028 (Jacks Fork) do `UPDATE access_points SET road_access = '...', facilities = '...' WHERE name ILIKE '...' AND river_id = ...`.
- **Seed:** The seed INSERTs do **not** include `road_access` or `facilities`; those columns were added in 00025 and backfilled by the migrations above.

**If Road Access (or Facilities) is missing for an access point:**

1. **Access point added after migrations:** If the row was created in seed (or elsewhere) **after** 00028 ran (e.g. Blue Spring), it was never updated by that migration, so `road_access` and `facilities` stay NULL.
2. **Fix:** Either include `road_access` and `facilities` in the seed INSERT for that point (so new/reseeded DBs have them), or add a new migration that `UPDATE`s those columns for the affected access points.

So: **Road Access is empty for any access point that didn’t exist when 00026/00027/00028 ran, unless we add it to seed or a later migration.**
