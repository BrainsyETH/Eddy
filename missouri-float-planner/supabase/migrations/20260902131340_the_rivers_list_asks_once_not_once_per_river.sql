-- 20260902131340_the_rivers_list_asks_once_not_once_per_river.sql
--
-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-02 13:13:40 UTC and
-- RECORDED as 20260902131340; authored as 20260831120000 and renamed to the
-- recorded version. Both invariants in the DO block at the foot passed against
-- the live rows: the batched function agreed with get_river_condition on every
-- compared column for every river, and answered for all 27 rivers with an
-- active primary gauge. Ledger: supabase/production-migrations.txt. The DDL
-- applied is this file's DDL verbatim; the header prose was abridged in
-- transit.
--
-- One call for every river's condition, instead of one call per river.
--
-- ── What this is for ────────────────────────────────────────────────────────
--
-- /api/rivers is the first request every list surface makes — the website's
-- river index, the iOS Reports tab, and the river screen, which cannot ask for
-- anything else until it has an id out of this list. src/lib/data/rivers.ts
-- assembles it, and its remaining fan-out is:
--
--     await Promise.all(rivers.map(river =>
--       supabase.rpc('get_river_condition', { p_river_id: river.id })))
--
-- Twenty-four round trips behind one CDN-cached endpoint, every one of them
-- taking a connection out of the pool while the other twenty-three wait for
-- one. The two queries beside it were batched already — the trend readings in
-- fetchTrendInputs, the put-in counts in fetchApprovedAccessPointCounts — and
-- rivers.ts's own comment has named the condition RPC as "the only per-river
-- call left" ever since.
--
-- 20260817231001 measured the per-call cost at ~13 ms after its seek fix (from
-- ~83 ms before it). That migration made each call cheap; this one stops making
-- twenty-four of them. What is left is latency and pool contention rather than
-- buffers, which is why it is a shape change here and not another index.
--
-- ── The classification is VERBATIM ──────────────────────────────────────────
--
-- Every threshold comparison, label, code, flood override, has_ladder guard and
-- accuracy warning below is copied character-for-character from
-- get_river_condition as 20260826162627 left it. Nothing is rephrased,
-- reordered or "simplified" — a second condition ladder that drifts from the
-- first is precisely the failure this repository has been bitten by four times
-- (see the header of packages/eddy-types/index.ts), and the two functions must
-- answer identically for the same river or the list and the page disagree about
-- whether a river is safe.
--
-- Only the SHAPE around it differs, in three ways, each forced by there being
-- many rivers rather than one:
--
--   1. primary_gauge selects DISTINCT ON (river_id) where the single-river
--      function selects LIMIT 1. Same rule — at most one primary gauge per
--      river — expressed per group.
--
--      It carries a tiebreak the original does not have. `LIMIT 1` with no
--      ORDER BY takes an arbitrary row if a river somehow has two active
--      primaries; DISTINCT ON must be told which, so it takes the lowest
--      gauge_station_id. That is a difference only in a state that should not
--      exist, and it resolves it deterministically rather than arbitrarily.
--
--   2. latest_reading is a LEFT JOIN LATERAL rather than a scalar subquery.
--      Both exist for the same reason and produce the same plan: the station id
--      is available as a value before gauge_readings is scanned, so
--      idx_gauge_readings_latest (gauge_station_id, reading_timestamp DESC)
--      yields the newest row as its first tuple. A scalar subquery cannot be
--      correlated per row here; LATERAL is the many-rivers spelling of it, and
--      it is the same shape get_latest_curated_readings uses.
--
--   3. river_id is on the wire, because a set of rows nobody can key is not an
--      answer to "the condition for each river".
--
-- ── Not scoped to active rivers ─────────────────────────────────────────────
--
-- Every river with a primary gauge is returned, and the caller keys by id.
-- Scoping to `active` would put the list endpoint's filter inside a function
-- that other callers may want for a page — rivers/[state]/[slug] loads by slug
-- with no active filter, as 20260826162627's header points out — and would make
-- this the second place that decides what "active" means.
--
-- ── get_river_condition stays ───────────────────────────────────────────────
--
-- Six other call sites ask about ONE river — both OG image routes, the river
-- page, /plan, /api/conditions and /api/rivers/[slug]/outlook — and asking for
-- twenty-seven rows to keep one would be this migration's own mistake in
-- reverse. This is an addition, not a replacement.

create or replace function public.get_river_conditions()
returns table (
    river_id uuid,
    condition_label text,
    condition_code text,
    gauge_height_ft numeric,
    discharge_cfs numeric,
    reading_timestamp timestamptz,
    reading_age_hours numeric,
    accuracy_warning boolean,
    accuracy_warning_reason text,
    gauge_name text,
    gauge_usgs_id text,
    threshold_unit text
)
language sql
stable
-- No PostGIS in this function, so it pins to '' rather than to
-- 'public, extensions' — the rule 00196's header sets out, followed by
-- get_latest_curated_readings. Every reference below is schema-qualified.
set search_path = ''
as $$
    with primary_gauge as (
        select distinct on (rg.river_id)
            rg.river_id,
            rg.gauge_station_id,
            rg.distance_from_section_miles,
            rg.accuracy_warning_threshold_miles,
            rg.threshold_unit as thresh_unit,
            rg.level_too_low,
            rg.level_low,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            rg.flood_stage_ft,
            gs.name as gauge_name,
            gs.usgs_site_id
        from public.river_gauges rg
        join public.gauge_stations gs on gs.id = rg.gauge_station_id
        where rg.is_primary = true
          and gs.active = true
        order by rg.river_id, rg.gauge_station_id
    )
    select
        pg.river_id,
        case
            when cv.is_flood then 'Dangerous - Do Not Float'
            when cv.has_ladder is not true then 'Unknown'
            when cv.compare_val is null then 'Unknown'
            when cv.compare_val >= pg.level_dangerous then 'Dangerous - Do Not Float'
            when cv.high_start is not null and cv.compare_val > cv.high_start then 'High Water - Use Caution'
            when cv.compare_val >= pg.level_optimal_min
                 and cv.compare_val <= pg.level_optimal_max then 'Flowing'
            when cv.compare_val >= coalesce(pg.level_low, pg.level_optimal_min) then 'Good - Floatable'
            when cv.compare_val >= pg.level_too_low then 'Low - Scraping Likely'
            else 'Too Low - Not Recommended'
        end,
        case
            when cv.is_flood then 'dangerous'
            when cv.has_ladder is not true then 'unknown'
            when cv.compare_val is null then 'unknown'
            when cv.compare_val >= pg.level_dangerous then 'dangerous'
            when cv.high_start is not null and cv.compare_val > cv.high_start then 'high'
            when cv.compare_val >= pg.level_optimal_min
                 and cv.compare_val <= pg.level_optimal_max then 'flowing'
            when cv.compare_val >= coalesce(pg.level_low, pg.level_optimal_min) then 'good'
            when cv.compare_val >= pg.level_too_low then 'low'
            else 'too_low'
        end,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::numeric(5,1),
        (pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
         or lr.age_hours > 6),
        case
            when pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
                then 'Gauge is ' || pg.distance_from_section_miles::text || ' miles from float section'
            when lr.age_hours > 6
                then 'Reading is ' || round(lr.age_hours)::text || ' hours old'
            else null
        end,
        pg.gauge_name,
        pg.usgs_site_id,
        pg.thresh_unit
    from primary_gauge pg
    -- The seek. One index descent per river against
    -- idx_gauge_readings_latest, in place of twenty-four separate statements
    -- each doing exactly this once. See point 2 in the header.
    left join lateral (
        select
            gr.gauge_height_ft,
            gr.discharge_cfs,
            gr.reading_timestamp,
            extract(epoch from (now() - gr.reading_timestamp)) / 3600 as age_hours
        from public.gauge_readings gr
        where gr.gauge_station_id = pg.gauge_station_id
        order by gr.reading_timestamp desc
        limit 1
    ) lr on true
    cross join lateral (
        select
            coalesce(
                case when pg.thresh_unit = 'cfs' then lr.discharge_cfs else lr.gauge_height_ft end,
                lr.gauge_height_ft
            ) as compare_val,
            coalesce(pg.level_optimal_max, pg.level_high) as high_start,
            (lr.gauge_height_ft is not null and pg.flood_stage_ft is not null
             and lr.gauge_height_ft >= pg.flood_stage_ft) as is_flood,
            -- The SQL half of hasLadder() in shared/condition-ladder.ts.
            -- Without it the CASE above falls through to 'too_low' for a
            -- gauge nobody has rated. See 20260826162627.
            (pg.level_too_low is not null or pg.level_low is not null
             or pg.level_optimal_min is not null or pg.level_optimal_max is not null
             or pg.level_high is not null or pg.level_dangerous is not null) as has_ladder
    ) cv;
$$;

comment on function public.get_river_conditions() is
  'Every river''s rated condition in one call, keyed by river_id. The classification is verbatim from get_river_condition(uuid) — the two must never diverge — and the newest reading per river is a LEFT JOIN LATERAL so each river costs one seek of idx_gauge_readings_latest. Exists because /api/rivers called the single-river RPC once per river; see src/lib/data/rivers.ts.';

grant execute on function public.get_river_conditions()
  to anon, authenticated, service_role;

-- ── Invariant: the batched answer must equal the per-river answer ───────────
--
-- Asserted against the live function on the live readings, for the reason
-- 20260826162627 gives for doing the same: the risk here is a ladder that
-- drifts, and no fixture in the repository runs either RPC.
--
-- Every column is compared, not just the code, because a label or an accuracy
-- warning that disagreed would be the same drift showing up somewhere quieter.
-- `is distinct from` throughout, so two NULLs match and a NULL against a value
-- does not.
DO $$
DECLARE
    bad text;
BEGIN
    SELECT string_agg(x.slug, ', ' ORDER BY x.slug) INTO bad
    FROM (
        SELECT r.slug
        FROM public.rivers r
        JOIN public.get_river_conditions() b ON b.river_id = r.id
        CROSS JOIN LATERAL public.get_river_condition(r.id) s
        WHERE b.condition_label          IS DISTINCT FROM s.condition_label
           OR b.condition_code           IS DISTINCT FROM s.condition_code
           OR b.gauge_height_ft          IS DISTINCT FROM s.gauge_height_ft
           OR b.discharge_cfs            IS DISTINCT FROM s.discharge_cfs
           OR b.reading_timestamp        IS DISTINCT FROM s.reading_timestamp
           OR b.accuracy_warning         IS DISTINCT FROM s.accuracy_warning
           OR b.accuracy_warning_reason  IS DISTINCT FROM s.accuracy_warning_reason
           OR b.gauge_name               IS DISTINCT FROM s.gauge_name
           OR b.gauge_usgs_id            IS DISTINCT FROM s.gauge_usgs_id
           OR b.threshold_unit           IS DISTINCT FROM s.threshold_unit
    ) x;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'get_river_conditions disagrees with get_river_condition on: %', bad;
    END IF;

    -- reading_age_hours is deliberately NOT in the comparison above: both
    -- functions compute it from now(), the two calls are microseconds apart,
    -- and at NUMERIC(5,1) — tenths of an hour — a difference could only come
    -- from the clock crossing a rounding boundary between them. Asserting on it
    -- would make this migration fail six seconds out of every 360.

    -- Every river the single-river RPC answers for, the batched one must also
    -- answer for. A row silently missing here is a river whose card loses its
    -- condition, which looks like a data problem rather than a code one.
    SELECT string_agg(r.slug, ', ' ORDER BY r.slug) INTO bad
    FROM public.rivers r
    JOIN public.river_gauges rg ON rg.river_id = r.id AND rg.is_primary
    JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id AND gs.active
    WHERE NOT EXISTS (
        SELECT 1 FROM public.get_river_conditions() b WHERE b.river_id = r.id
    );
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'get_river_conditions returned no row for: %', bad;
    END IF;
END $$;
