-- Query appendix for docs/river-access-data-audit-2026-09-14.md
--
-- The audit says every number came from a query against production and that the
-- query is quoted so it can be re-run. The queries were not in fact committed.
-- This file is that record.
--
-- Target: ilefwfpvphadsbptiaur (FloatMe, production). Every statement here is
-- read-only. Observation timestamps are recorded per section; re-running later
-- will not reproduce them exactly, which is the point of writing the row
-- manifests down rather than only the SQL that generated them.
--
-- Two conventions used throughout:
--   * "usable" = approved = true AND is_float_endpoint = true. Those are the
--     two flags that decide whether a reader can see a point and plan from it
--     (RLS policy "Approved access points are viewable by everyone";
--     src/lib/access-points/endpoint-resolver.ts).
--   * GEOMETRY MILE = ST_LineLocatePoint(geom, pt) * length_miles, which is what
--     snap_to_river() computes. It is NOT interchangeable with the stored
--     river_mile_downstream — see src/lib/geo/mile-index.ts:12-31 on the
--     editorial vs geometry mile systems.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Baseline counts                          observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- Result: 24 active rivers; 401 access points on active rivers; 309 approved;
--         92 pending; 188 services linked to an active river; 34 NPS
--         campgrounds snapped to an active river.

SELECT
  (SELECT count(*) FROM rivers WHERE active)                                   AS active_rivers,
  (SELECT count(*) FROM access_points a JOIN rivers r ON r.id = a.river_id
    WHERE r.active)                                                            AS ap_total,
  (SELECT count(*) FROM access_points a JOIN rivers r ON r.id = a.river_id
    WHERE r.active AND a.approved)                                             AS ap_approved,
  (SELECT count(*) FROM access_points a JOIN rivers r ON r.id = a.river_id
    WHERE r.active AND NOT coalesce(a.approved, false))                        AS ap_pending,
  (SELECT count(*) FROM nps_campgrounds c JOIN rivers r ON r.id = c.snap_river_id
    WHERE r.active)                                                            AS nps_campgrounds;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Per-river coverage                       observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- Feeds the "Usable endpoints per river" and unserved-reach tables.

SELECT r.slug,
       round((ST_Length(r.geom::geography) / 1609.344)::numeric)               AS geom_mi,
       count(*) FILTER (WHERE a.approved)                                      AS approved,
       count(*) FILTER (WHERE a.approved AND a.is_float_endpoint)              AS usable,
       count(*) FILTER (WHERE NOT coalesce(a.approved, false))                 AS pending,
       round(min(a.river_mile_downstream)
             FILTER (WHERE a.approved AND a.is_float_endpoint), 1)             AS first_mi,
       round(max(a.river_mile_downstream)
             FILTER (WHERE a.approved AND a.is_float_endpoint), 1)             AS last_mi
FROM rivers r
LEFT JOIN access_points a ON a.river_id = r.id
WHERE r.active
GROUP BY r.slug, r.geom
ORDER BY r.slug;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Interior gaps between consecutive usable endpoints
-- ═══════════════════════════════════════════════════════════════════════════
-- 36 gaps of >= 12 mi at the time of the audit. Largest: big-river Leadwood ->
-- Washington State Park, 43.9 mi.

WITH ep AS (
  SELECT r.slug, a.name, a.river_mile_downstream mi,
         lead(a.name)                  OVER w AS nxt,
         lead(a.river_mile_downstream) OVER w AS nxt_mi
  FROM rivers r
  JOIN access_points a ON a.river_id = r.id
  WHERE r.active AND a.approved AND a.is_float_endpoint
    AND a.river_mile_downstream IS NOT NULL
  WINDOW w AS (PARTITION BY r.slug ORDER BY a.river_mile_downstream)
)
SELECT slug, name, round(mi, 1) from_mi, nxt, round(nxt_mi, 1) to_mi,
       round(nxt_mi - mi, 1) gap_mi
FROM ep
WHERE nxt_mi - mi >= 12
ORDER BY gap_mi DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Segment plausibility — the ratio population   observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- THE CENTRAL DIAGNOSTIC. Not "does the stored mile match geometry" — that
-- disagreement is deliberate on editorial-mile rivers. The invariant that
-- survives BOTH mile systems is that a real channel is longer than its
-- generalised NHD line, so editorial_delta / geometry_delta should sit around
-- 1.0-1.5 and can never be far below 1.0.
--
-- Result over 272 pairs with a geometry delta > 0.25 mi:
--     ratio < 0.60   ......  6   impossible
--     0.60 - 0.90    ...... 29   mostly 0.1-mi rounding on short segments
--     0.90 - 1.60    ..... 236   normal sinuosity  (min 0.90, max 1.54)
--     1.60 - 2.50    ......  0
--     ratio > 2.50   ......  1   niangua Williams Ford -> Moon Valley, 6.51
--
-- The empty 1.54-6.51 band is what makes a threshold defensible.

WITH ep AS (
  SELECT r.slug, a.name,
         a.river_mile_downstream AS ed,
         (ST_LineLocatePoint(r.geom, coalesce(a.location_snap, a.location_orig))
            * r.length_miles)::numeric AS geo
  FROM rivers r
  JOIN access_points a ON a.river_id = r.id
  WHERE r.active AND a.approved AND a.is_float_endpoint
    AND coalesce(r.geometry_starts_at_headwaters, true)
), pr AS (
  SELECT slug, name, ed, geo,
         lead(name) OVER w AS nxt, lead(ed) OVER w AS ned, lead(geo) OVER w AS ngeo
  FROM ep
  WINDOW w AS (PARTITION BY slug ORDER BY geo)
)
SELECT slug, name, nxt,
       round(abs(ned - ed), 2)   AS editorial_mi,
       round(abs(ngeo - geo), 2) AS line_mi,
       round(abs(ned - ed) / nullif(abs(ngeo - geo), 0), 2) AS ratio
FROM pr
WHERE nxt IS NOT NULL AND abs(ngeo - geo) > 0.25
ORDER BY ratio;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4b. MANIFEST — the implausible pairs                  observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- river        | put-in -> take-out                          | edit | line | ratio
-- -------------+---------------------------------------------+------+------+------
-- niangua      | Williams Ford Access -> Moon Valley         |10.10 | 1.55 | 6.51
-- huzzah       | Dillard Mill -> Highway 49 Bridge           | 0.10 | 1.44 | 0.07
-- niangua      | Riverfront Campground -> Bennett Spring     | 0.20 | 0.75 | 0.27
-- niangua      | Lead Mine -> Herrick Ford                   | 0.40 | 1.09 | 0.37
-- meramec      | Campbell Bridge -> Riverview Ranch          | 0.20 | 0.53 | 0.38
-- meramec      | Onondaga Cave SP -> Ozark Outdoors          | 0.10 | 0.26 | 0.38
-- niangua      | Bennett Spring -> Hidden Valley Outfitters  | 0.30 | 0.77 | 0.39
--
-- A pair names an implausible SEGMENT, not a bad ROW: either endpoint could be
-- wrong. Only Williams Ford is independently isolated — every other Niangua
-- point sits ~25.5 mi below its geometry mile and it sits 33.4 below. The three
-- Niangua rows also share endpoints (Bennett Spring and Herrick Ford each
-- appear twice), so they must be resolved per endpoint, not per pair.


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Why access_point_offline never fires
-- ═══════════════════════════════════════════════════════════════════════════
-- The rule in validate_river_data() measures location_snap against the river
-- line. location_snap is ST_LineInterpolatePoint output (00010:36), so it lies
-- ON the line and the distance is ~0 for every row. Result: snap_to_river_m is
-- 0.000-0.005 everywhere while orig_to_river_m reaches 1000 m.

SELECT r.slug, ap.name,
       round(ST_Distance(ap.location_snap::geography, r.geom::geography)::numeric, 3) AS snap_to_river_m,
       round(ST_Distance(ap.location_orig::geography, r.geom::geography)::numeric, 1) AS orig_to_river_m,
       round(ap.snap_distance_m, 1) AS stored_snap_m
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved AND r.active AND ap.location_snap IS NOT NULL
ORDER BY orig_to_river_m DESC
LIMIT 10;

-- MANIFEST — approved points over 250 m from the line   observed 2026-09-14
-- river      | name                                  | snap_m | is_float_endpoint
-- -----------+---------------------------------------+--------+------------------
-- current    | Echo Bluff State Park                 |  1055  | false
-- buffalo    | Buffalo City                          |  1001  | true
-- niangua    | Ha Ha Tonka State Park                |   638  | true
-- big-piney  | Boiling Spring Access                 |   458  | true
-- jacks-fork | MDC South Prong Access                |   410  | true
-- courtois   | Courtois-Huzzah Confluence            |   386  | true
-- meramec    | Lucky Clover Resort                   |   302  | true
-- meramec    | Spanish Claim Access                  |   289  | true
-- meramec    | Woodson K. Woods Memorial CA          |   284  | true
-- black      | Lesterville Access                    |   278  | true
--
-- Echo Bluff is deliberately off-channel and NOT a launch
-- (20260826174017_echo_bluff_is_on_sinking_creek.sql:138-150). Buffalo City is
-- the traditional Buffalo take-out, on the White River below the confluence.
-- Ha Ha Tonka sits on the Lake of the Ozarks arm. Those three are exceptions to
-- record, not defects to fix.


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The legacy floatmissouri pending rows              observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- 68 rows created 2026-01-22 02:05 UTC .. 2026-01-26 17:39 UTC by
-- scripts/import-floatmissouri.ts, whose own header warns it duplicates and
-- mislocates.
--
-- NOTE: a created_at window alone is the WRONG selector. Three well-formed
-- records (meramec Scotia Bridge Access 101 m / Steelville City Park 239 m /
-- Fishing Spring Road 225 m) share the window, and jacks-fork Bunker Hill was
-- created 2026-01-26, outside a naive 01-22/01-23 window. Classify by
-- mislocation instead, and check float_plans before deleting anything.

WITH legacy AS (
  SELECT a.id, r.slug AS rslug, a.slug AS aslug, a.name,
         round(a.snap_distance_m, 0) AS snap_m,
         (a.snap_distance_m > 1500) AS mislocated,
         EXISTS (SELECT 1 FROM float_plans p
                 WHERE p.start_access_id = a.id OR p.end_access_id = a.id) AS plan_ref
  FROM access_points a
  JOIN rivers r ON r.id = a.river_id
  WHERE r.active AND coalesce(a.approved, false) = false
    AND a.created_at::date <= '2026-01-31'
)
SELECT count(*)                                                        AS total,
       count(*) FILTER (WHERE mislocated AND NOT plan_ref)             AS delete_safely,
       count(*) FILTER (WHERE mislocated AND plan_ref)                 AS mislocated_but_plan_ref,
       count(*) FILTER (WHERE NOT mislocated AND NOT plan_ref)         AS triage_well_snapped,
       count(*) FILTER (WHERE NOT mislocated AND plan_ref)             AS well_snapped_plan_ref
FROM legacy;
-- Result: 68 | 54 | 1 | 9 | 4


-- ═══════════════════════════════════════════════════════════════════════════
-- 6b. MANIFEST — the 54 rows safe to delete             observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- Mislocated (> 1500 m from the line) AND referenced by no float_plan.
-- (river_slug, access_point_slug):
--
--    ('courtois', 'brazil-low-water-bridge-on-road-between-hwy'),
--    ('courtois', 'butts-low-water-bridge'),
--    ('courtois', 'hazel-creek-recreation-area-and'),
--    ('courtois', 'huzzah-conservation-area-and'),
--    ('courtois', 'junction-with-huzzah-creek'),
--    ('courtois', 'private-campground-and'),
--    ('current',  'current-view'),
--    ('current',  'dun-roven-unimproved'),
--    ('eleven-point', 'hwy-142-bridge'),
--    ('huzzah',   'access-at-low-water-bridge'),
--    ('huzzah',   'brazil-low-water-bridge-on-road-between-hwy'),
--    ('huzzah',   'butts-low-water-bridge'),
--    ('huzzah',   'dillard'),
--    ('huzzah',   'hwy'),
--    ('huzzah',   'hwy-8-bridge'),
--    ('huzzah',   'junction-with-huzzah-creek'),
--    ('huzzah',   'private'),
--    ('huzzah',   'private-campground-and'),
--    ('huzzah',   'red-bluff-on-right'),
--    ('meramec',  'ackerman'),
--    ('meramec',  'allenton'),
--    ('meramec',  'bird-8217-s-nest-access-crawford-county-on-rig'),
--    ('meramec',  'boat-ramp-8211-meramec-state-park-on-left'),
--    ('meramec',  'catawissa-conservation-area-and'),
--    ('meramec',  'flamm-city'),
--    ('meramec',  'hillcrest-park-private'),
--    ('meramec',  'huzzah-conservation-area-and'),
--    ('meramec',  'hwy'),
--    ('meramec',  'hwy-21-bridge'),
--    ('meramec',  'hwy-30-47-bridge'),
--    ('meramec',  'hwy-66-bridge'),
--    ('meramec',  'meramec-state-park-boat-ramp-from-hwy'),
--    ('meramec',  'onondaga-state-park'),
--    ('meramec',  'pacific-palisades-conservation-area-and'),
--    ('meramec',  'pickle-ford-huff-ford'),
--    ('meramec',  'private'),
--    ('meramec',  'private-concrete-boat-ramp-on-left'),
--    ('meramec',  'river-8216-round-conservation-area-and-access'),
--    ('meramec',  'st'),
--    ('meramec',  'valley-park-city'),
--    ('meramec',  'winter-county-park-with-ramps-on-right'),
--    ('niangua',  'access-near-mouth-of-bank-branch'),
--    ('niangua',  'barclay-conservation-area-and'),
--    ('niangua',  'bennett-spring-branch-on-right'),
--    ('niangua',  'for-next-two-miles-there-are-several-private'),
--    ('niangua',  'ford-slab'),
--    ('niangua',  'fort-niangua-private'),
--    ('niangua',  'gilbettson-ford'),
--    ('niangua',  'ho-humm-private'),
--    ('niangua',  'hwy-64-bridge'),
--    ('niangua',  'mountain-creek-on-right'),
--    ('niangua',  'oldhams-private'),
--    ('niangua',  'private'),
--    ('niangua',  'smith-ford')


-- ═══════════════════════════════════════════════════════════════════════════
-- 6c. MANIFEST — the 14 legacy rows to RETAIN and triage  observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- Nearest approved neighbour on the same river, to separate duplicates from
-- genuine unreviewed candidates.
--
-- river        | legacy name                | snap_m | nearest approved          | d_m
-- -------------+----------------------------+--------+---------------------------+------
-- eleven-point | MDC Myrtle                 |    70  | Myrtle Access             |   23   duplicate
-- eleven-point | Boze Mill Spring on left   |    63  | Boze Mill Float Camp      |   53   duplicate  [plan_ref]
-- current      | Van Buren City Access      |    53  | Van Buren Riverfront Park |   63   duplicate  [plan_ref]
-- eleven-point | Hwy 19  Bridge             |    34  | Greer Spring             |  168   check      [plan_ref]
-- meramec      | Fishing Spring Road        |   225  | Lucky Clover Resort       |  184   check
-- jacks-fork   | Bunker Hill                |    89  | Rymers Access             |  660   candidate
-- meramec      | Scotia Bridge Access       |   101  | Scotts Ford               | 1492   candidate
-- courtois     | Hwy 8 Bridge               |   700  | Highway 8 Bridge          | 1544   name clash
-- current      | Chilton Access - Private   |    51  | Big Tree                  | 1720   candidate
-- eleven-point | Hwy 160 Bridge             |  1001  | Cane Bluff                | 2020   candidate  [plan_ref]
-- meramec      | Steelville City Park       |   239  | Bird's Nest Access        | 2425   candidate
-- current      | Beal Landing on left       |  1058  | Big Spring                | 3004   candidate
-- courtois     | County Road Bridge         |    41  | Highway 8 Bridge          | 3397   candidate
-- courtois     | Berryman Campground        |  3342  | (mislocated)              |    -   [plan_ref]


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. float_plans that block a delete                    observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- float_plans.start_access_id / end_access_id are NO ACTION (00002:234-235), so
-- a bare DELETE aborts with 23503. 12 plans reference 5 legacy rows. All 12
-- have user_id IS NULL — but per 00184_float_plans_private_read.sql:9-11 that
-- is "every plan saved by the accountless web today", i.e. the normal product,
-- NOT evidence of a test artefact. They are share-by-link readable and must not
-- be deleted on this evidence.

SELECT p.id, p.user_id IS NOT NULL AS has_user, p.created_at::date AS created,
       sa.name AS start_name, ea.name AS end_name
FROM float_plans p
LEFT JOIN access_points sa ON sa.id = p.start_access_id
LEFT JOIN access_points ea ON ea.id = p.end_access_id
WHERE p.start_access_id IN (SELECT a.id FROM access_points a JOIN rivers r ON r.id = a.river_id
                            WHERE r.active AND NOT coalesce(a.approved,false)
                              AND a.created_at::date <= '2026-01-31')
   OR p.end_access_id   IN (SELECT a.id FROM access_points a JOIN rivers r ON r.id = a.river_id
                            WHERE r.active AND NOT coalesce(a.approved,false)
                              AND a.created_at::date <= '2026-01-31')
ORDER BY p.created_at;
-- Result: 12 plans, all user_id IS NULL, 2026-01-22 .. 2026-01-28, across
-- Van Buren City Access (5), Hwy 19 Bridge (3), Hwy 160 Bridge (2),
-- Berryman Campground (1), Boze Mill Spring on left (1).


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. FK inventory for access_points                     observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- What blocks a delete, what cascades, and what silently unlinks.

SELECT tc.table_name AS child_table, kcu.column_name AS child_col, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu       ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'access_points' AND ccu.column_name = 'id'
ORDER BY tc.table_name;

-- Result, with reference counts against the 68 legacy rows:
--   float_plans.start_access_id / end_access_id  NO ACTION   12  <- BLOCKS
--   float_segments.put_in_id / take_out_id       SET NULL     3  (all huzzah "Butts")
--   river_photos.access_point_id                 SET NULL     1
--   access_point_services.access_point_id        CASCADE      0
--   campsite_facilities.access_point_id          SET NULL     0
--   community_reports.access_point_id            SET NULL     0
--   drive_time_cache.start/end_access_id         CASCADE      0
--   embed_widgets.access_point_id                SET NULL     0
--
-- segment_cache also cascades (00006:32-33), which is exactly what
-- invalidate_segment_cache(p_access_point_id) would delete — so a SQL-level
-- DELETE needs no explicit cache call. An UPDATE does, because it fires no
-- cascade.


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. MANIFEST — the 21 non-legacy pending rows          observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- Created 2026-03 .. 2026-07. MAX_SNAP_M = 250 in
-- scripts/ingestion/import-dossier-access-points.ts:41 is the repo's own bar
-- for a launch, so these split at 250 m.
--
-- VERIFIED (< 250 m) — 16:
--   meramec        Meramec State Park (Lower Ramp)      2 m   [river_mile NULL]
--   st-francis     Gruner Ford (Hwy H bridge)           2 m
--   courtois       Bass River Low-Water Bridge          2 m
--   black          Mill Creek                           4 m
--   gasconade      Barlow Ford                          8 m
--   bourbeuse      Laubinger Ford                       8 m
--   gasconade      Indian Ford (MO 42 Bridge)          12 m
--   courtois       County Road 654 Bridge (Sugar Grove)17 m
--   gasconade      Ruby's Landing                      31 m
--   huzzah         Highway 8 Bridge (Lower)            40 m
--   black          Twin Rivers Landing                 40 m
--   gasconade      Mt. Sterling Bridge (US 50)         41 m
--   niangua        Big John Access                     57 m
--   buffalo        Shine Eye                           65 m
--   gasconade      Whitehouse Ford                    145 m
--   niangua        Charity Access                     227 m
--
-- EXCEPTION / RESEARCH (> 250 m) — 5:
--   eleven-point   Turner Mill North                  316 m
--   bryant-creek   Tecumseh Access (The Forks)        922 m
--   meramec        Huzzah CA / Highway E Access       996 m   [river_mile NULL]
--   black          Parks Bluff Campground            1089 m
--   spring-river-mo Robert E. Talbot Access          1139 m
--
-- Plus gasconade "Odin Access" (9715 m, river_mile NULL) which is pending from
-- 2026-07 but mislocated and belongs with the research set.

SELECT r.slug, a.name, a.type, round(a.snap_distance_m, 0) AS snap_m,
       round(a.river_mile_downstream, 1) AS mi, a.managing_agency,
       a.created_at::date AS created
FROM rivers r
JOIN access_points a ON a.river_id = r.id
WHERE r.active AND NOT coalesce(a.approved, false)
  AND a.created_at::date > '2026-01-31'
ORDER BY a.snap_distance_m;


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Camping coverage per river                        observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- james, kings-river and spring-river-mo return 0 from every source.

SELECT r.slug,
  (SELECT count(*) FROM service_rivers sr JOIN nearby_services s ON s.id = sr.service_id
    WHERE sr.river_id = r.id AND s.type::text = 'campground')                  AS svc_camp,
  (SELECT count(*) FROM nps_campgrounds c WHERE c.snap_river_id = r.id)        AS nps_camp,
  (SELECT count(*) FROM access_points a
    WHERE a.river_id = r.id AND a.approved AND a.type = 'campground')          AS ap_camp,
  (SELECT count(*) FROM campsite_facilities f
     JOIN nps_campgrounds c ON c.id = f.nps_campground_id
    WHERE c.snap_river_id = r.id AND f.enabled)                                AS live_nps
FROM rivers r WHERE r.active ORDER BY r.slug;

-- Buffalo detail: 11 NPS campgrounds, 4 with an enabled campsite_facilities
-- row. Missing: Kyles Landing (33 sites), Ozark (32), Rush (12), Carver (8),
-- Spring Creek (12), South Maumee (0), Woolum (0). Current is 17/17 and
-- Jacks Fork 6/6, so this is a coverage gap, not a broken sync.


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Services with no coordinates                      observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- 39 services whose PRIMARY river is active have latitude IS NULL. Three more
-- are geocoded far from their river. No service anywhere carries a
-- google_place_id (0 of 188).

SELECT r.slug, s.name, s.type::text, s.city, s.state, s.status::text,
       CASE WHEN s.latitude IS NULL THEN NULL
            ELSE round((ST_Distance(
                   ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography,
                   r.geom::geography) / 1609.344)::numeric, 1) END AS mi_from_river,
       s.geocode_source
FROM service_rivers sr
JOIN nearby_services s ON s.id = sr.service_id
JOIN rivers r ON r.id = sr.river_id
WHERE r.active AND sr.is_primary
  AND (s.latitude IS NULL
       OR ST_Distance(ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography,
                      r.geom::geography) > 16093)
ORDER BY mi_from_river DESC NULLS FIRST;


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Empty roles array                                 observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- 92 approved points carry types = '{}', concentrated in 11 rivers where every
-- point is empty. Cause: import-dossier-access-points.ts writes only the
-- singular `type`. Also 6 points advertise a boat_ramp amenity without the
-- role and 5 advertise camping without the campground role.

SELECT r.slug, count(*) AS approved,
       count(*) FILTER (WHERE a.types IS NULL OR cardinality(a.types) = 0) AS empty_types
FROM rivers r
JOIN access_points a ON a.river_id = r.id
WHERE r.active AND a.approved
GROUP BY r.slug
HAVING count(*) FILTER (WHERE a.types IS NULL OR cardinality(a.types) = 0) > 0
ORDER BY empty_types DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Shuttle anchor coverage                           observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- driving_lat is NULL on all 443 access points, which is why /api/plan removed
-- drive time from PlanResult. The comment at src/app/api/plan/route.ts saying
-- "372 of 406" is stale.

SELECT count(*) AS all_ap,
       count(*) FILTER (WHERE driving_lat IS NULL) AS no_driving,
       count(*) FILTER (WHERE directions_override IS NOT NULL) AS has_override
FROM access_points;


-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Hazard coverage                                   observed 2026-09-14
-- ═══════════════════════════════════════════════════════════════════════════
-- 22 hazard records across all active rivers; 12 of 24 rivers have none,
-- including current, jacks-fork, buffalo and eleven-point. 6 have no geometry.
-- NOTE: joining river_hazards to access_points in one query produces a
-- cartesian product and inflates these counts — an earlier draft of the audit
-- did exactly that and reported 36/29/57 hazards per river. Count them alone.

SELECT r.slug, count(*) AS hazards,
       count(*) FILTER (WHERE h.location IS NULL) AS no_geom,
       string_agg(DISTINCT h.type, ',') AS types
FROM rivers r
JOIN river_hazards h ON h.river_id = r.id
WHERE r.active AND coalesce(h.active, true)
GROUP BY r.slug ORDER BY hazards DESC;

SELECT string_agg(slug, ', ' ORDER BY slug) AS rivers_with_no_hazards
FROM rivers
WHERE active AND id NOT IN (SELECT river_id FROM river_hazards WHERE active);
