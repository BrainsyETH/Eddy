# Lakes pilot — "On the lake" card previews, 2026-11-09

Captures of the Table Rock and Truman dam pages from a **production build**
(`next build` + `next start`) served against a local stand-in for Supabase's
REST surface, at 1280 px and 390 px widths, device scale 2. Taken to review
the pilot before any launch row exists in production
(`LAKES_AND_LAUNCHES_PLAN_2026-11-09.md` step 2).

What is real and what is not:

- **Table Rock's level and its seven-day line are real**: the current reading
  came from CWMS live through the page, and the history is eight days of the
  same hourly series fetched for the preview.
- **Truman's current level is real** (Ameren's daily report, read live by the
  page). **Its seven-day line is synthetic** preview history around the
  November pool, because Ameren challenges the environment the preview ran in
  and the cron that records the real history was not yet deployed.
- **The launch rows are fixtures** shaped like reviewed rows will be: real
  places from the Phase 0 queues with example methods, amenities and, at
  Truman, the Kansas City District's published thresholds. None of them has
  been reviewed; in production the card shows only approved rows.

| File | Shows |
| --- | --- |
| `table-rock-desktop-lake.webp` | Quiet week 4.4 ft under the conservation pool; the reference line stays off and the note says where it is |
| `truman-desktop-lake.webp` | Daily cadence labelled as such; thresholds per launch with the agency and the age of its data |
| `table-rock-phone-lake.webp`, `truman-phone-lake.webp` | The chart measured to its container so axis text keeps its size on a phone |

Reproducing the preview needs no credentials: a small HTTP server answering
`/rest/v1/lake_pool_readings`, `/rest/v1/lake_launches` and
`/rest/v1/access_points` with fixture JSON and everything else with `[]`,
and the app started with `NEXT_PUBLIC_SUPABASE_URL` pointed at it.
