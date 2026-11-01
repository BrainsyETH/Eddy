-- Pending. Apply AFTER 20261101165213, whose definition this replaces.
--
-- Makes validate_river_data() return at most one row per (river_slug,
-- check_name), for every rule at once.
--
-- ── WHY ─────────────────────────────────────────────────────────────────
--
-- The trust ledger fingerprints check|entity|rule. A branch that emits two rows
-- for one river and rule is one identity reported twice, which indexEmitted()
-- refuses (src/lib/trust/ledger.test.ts), so the whole run is check_error and
-- every finding the check owns freezes. That is what mileage_equals_length did
-- from 2026-10-29; 20261101165213 fixed that one rule.
--
-- Four more branches can still do it, because each emits a row per gauge,
-- access point or pair rather than per river:
--
--   threshold_order           one per misordered gauge on the river
--   access_point_offline      one per launch more than 500 m from the line
--   access_point_not_snapped  one per unsnapped access point
--   mileage_order_mismatch    one per out-of-order neighbour pair
--
-- (The primary-gauge rules cannot: river_gauges_one_primary_per_river makes
-- at most one primary per river. gauge_missing_site_id is keyed by the gauge
-- station's own id.) None collides in production today; two unsnapped points
-- on one river would freeze the check again.
--
-- So the aggregation is done once, around the whole function, instead of per
-- branch: a rule added later cannot reintroduce the failure. Behaviour:
--
--   * exactly one row for a (river, rule): returned unchanged, detail and all,
--     so no existing finding's detail churns;
--   * several: one row, detail "N findings: a; b; c" in sorted order, so it
--     is deterministic run to run;
--   * severity: 'error' if any row was an error. Each rule emits one severity
--     today, so this only matters if that ever stops being true.
--
-- The branches inside are copied unchanged from 20261101165213.
--
-- review_river_activation() reads this function and blocks on any 'error'
-- row; fewer, merged rows block exactly the same rivers.

CREATE OR REPLACE FUNCTION public.validate_river_data()
RETURNS TABLE (
    river_slug TEXT,
    check_name TEXT,
    severity TEXT,
    detail TEXT
)
LANGUAGE sql
STABLE
AS $$
-- CHANGED (20261101173323): one row per (river, rule), whatever the branches
-- below emit. See the header. A single row keeps its detail verbatim.
SELECT raw.river_slug,
       raw.check_name,
       CASE WHEN bool_or(raw.severity = 'error') THEN 'error' ELSE 'warning' END,
       CASE WHEN count(*) = 1 THEN min(raw.detail)
            ELSE count(*)::text || ' findings: ' ||
                 string_agg(raw.detail, '; ' ORDER BY raw.detail)
       END
FROM (
    SELECT r.slug, 'missing_timezone', 'error', 'rivers.timezone is null or empty'
    FROM rivers r
    WHERE r.active = true AND (r.timezone IS NULL OR r.timezone = '')

    UNION ALL
    SELECT r.slug, 'missing_state', 'error', 'rivers.state is null or empty'
    FROM rivers r
    WHERE r.active = true AND (r.state IS NULL OR r.state = '')

    UNION ALL
    SELECT r.slug, 'missing_river_type', 'error', 'rivers.river_type is null'
    FROM rivers r
    WHERE r.active = true AND r.river_type IS NULL

    UNION ALL
    SELECT r.slug, 'missing_geometry', 'error', 'rivers.geom is null'
    FROM rivers r
    WHERE r.active = true AND r.geom IS NULL

    UNION ALL
    SELECT r.slug, 'missing_characteristics', 'warning',
           'no river_characteristics row (Eddy prompts fall back to type defaults)'
    FROM rivers r
    LEFT JOIN river_characteristics rc ON rc.river_id = r.id
    WHERE r.active = true AND rc.river_id IS NULL

    UNION ALL
    SELECT r.slug, 'missing_weather_point', 'warning',
           'no weather_lat/weather_lon (weather context unavailable for Eddy updates)'
    FROM rivers r
    WHERE r.active = true AND (r.weather_lat IS NULL OR r.weather_lon IS NULL)

    UNION ALL
    SELECT r.slug, 'missing_alert_terms', 'warning',
           'no alert_search_terms (NWS alerts cannot be matched to this river)'
    FROM rivers r
    WHERE r.active = true AND (r.alert_search_terms IS NULL OR array_length(r.alert_search_terms, 1) IS NULL)

    UNION ALL
    SELECT r.slug, 'ungauged_river', 'error',
           'no active river_gauges link — river cannot show a condition badge'
    FROM rivers r
    WHERE r.active = true
      AND NOT EXISTS (
          SELECT 1 FROM river_gauges rg
          JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
          WHERE rg.river_id = r.id AND gs.active = true
      )

    UNION ALL
    SELECT r.slug, 'no_primary_gauge', 'error',
           'river has gauges but none marked is_primary'
    FROM rivers r
    WHERE r.active = true
      AND EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = r.id AND rg.is_primary = true)

    UNION ALL
    SELECT r.slug, 'threshold_order', 'error',
           'thresholds not strictly increasing on gauge ' || gs.name ||
           ' (' || COALESCE(rg.threshold_unit, 'ft') || ')'
    FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.active = true
      AND (
          (rg.level_too_low IS NOT NULL AND rg.level_low IS NOT NULL AND rg.level_too_low >= rg.level_low)
       OR (rg.level_low IS NOT NULL AND rg.level_optimal_min IS NOT NULL AND rg.level_low >= rg.level_optimal_min)
       OR (rg.level_optimal_min IS NOT NULL AND rg.level_optimal_max IS NOT NULL AND rg.level_optimal_min >= rg.level_optimal_max)
       OR (rg.level_optimal_max IS NOT NULL AND rg.level_dangerous IS NOT NULL AND rg.level_optimal_max >= rg.level_dangerous)
       OR (rg.level_high IS NOT NULL AND rg.level_dangerous IS NOT NULL AND rg.level_high >= rg.level_dangerous)
      )

    UNION ALL
    SELECT r.slug, 'missing_thresholds', 'error',
           'gauge ' || gs.name || ' has no thresholds set'
    FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.active = true
      AND r.condition_rating_mode <> 'unrated'
      AND rg.is_primary = true
      AND rg.level_too_low IS NULL AND rg.level_low IS NULL
      AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL

    -- NEW (00164): primary gauge missing the TOP of its ladder. computeCondition()
    -- only returns 'dangerous' when level_dangerous IS NOT NULL (no flood-stage
    -- fallback), so a null here means the badge caps at 'high' at any flow. The
    -- ladder guard (optimal_min OR high present) keeps this from firing on a gauge
    -- that legitimately has no thresholds yet (already caught by missing_thresholds).
    UNION ALL
    SELECT r.slug, 'no_dangerous_anchor', 'warning',
           'primary gauge ' || gs.name || ' has no level_dangerous — the condition badge can never show "Dangerous" (it caps at High). Anchor it to a floater do-not-float level (NOT the NWS flood stage unless bank-full ≈ floater-danger on this reach).'
    FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.active = true AND rg.is_primary = true
      AND rg.level_dangerous IS NULL
      AND (rg.level_optimal_min IS NOT NULL OR rg.level_high IS NOT NULL)

    -- NEW (00164): primary gauge with optimal_min but no optimal_max. The
    -- 'flowing/ideal' band needs both bounds, so the whole floatable range
    -- collapses into 'good' and the badge never shows Flowing. Accuracy, not safety.
    UNION ALL
    SELECT r.slug, 'no_optimal_max_anchor', 'warning',
           'primary gauge ' || gs.name || ' has optimal_min but no optimal_max — the badge can never show "Flowing/ideal" (the floatable range collapses to Good).'
    FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.active = true AND rg.is_primary = true
      AND rg.level_optimal_min IS NOT NULL AND rg.level_optimal_max IS NULL

    -- NEW (00164): primary gauge missing the BOTTOM of its ladder. Without
    -- level_too_low the badge can never show 'Too Low — Not Recommended'; low water
    -- reads at best as 'Low'. Ladder guard as above.
    UNION ALL
    SELECT r.slug, 'no_too_low_anchor', 'warning',
           'primary gauge ' || gs.name || ' has no level_too_low — the badge can never show "Too Low" (bottom of the ladder).'
    FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.active = true AND rg.is_primary = true
      AND rg.level_too_low IS NULL
      AND (rg.level_optimal_min IS NOT NULL OR rg.level_low IS NOT NULL)

    UNION ALL
    SELECT r.slug, 'stale_gauge', 'warning',
           'gauge ' || gs.name || ' latest reading older than 24h (' ||
           COALESCE(to_char(latest.max_ts, 'YYYY-MM-DD HH24:MI'), 'never') || ')'
    FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    LEFT JOIN LATERAL (
        SELECT MAX(gr.reading_timestamp) AS max_ts
        FROM gauge_readings gr
        WHERE gr.gauge_station_id = gs.id
    ) latest ON true
    WHERE r.active = true AND gs.active = true AND rg.is_primary = true
      AND (latest.max_ts IS NULL OR latest.max_ts < now() - interval '24 hours')

    UNION ALL
    SELECT gs.id::text, 'gauge_missing_site_id', 'error',
           'gauge station "' || gs.name || '" has neither site_id_external nor usgs_site_id'
    FROM gauge_stations gs
    WHERE gs.active = true AND gs.site_id_external IS NULL AND gs.usgs_site_id IS NULL

    UNION ALL
    SELECT r.slug, 'access_point_offline', 'warning',
           'launch "' || ap.name || '" is ' ||
           round(ST_Distance(ap.location_orig::geography, r.geom::geography)::numeric) ||
           'm from the river line'
    FROM access_points ap
    JOIN rivers r ON r.id = ap.river_id
    WHERE ap.approved = true AND r.active = true
      AND ap.is_float_endpoint = true
      AND ap.off_channel_reason IS NULL
      AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
      AND ST_Distance(ap.location_orig::geography, r.geom::geography) > 500

    UNION ALL
    SELECT r.slug, 'access_point_not_snapped', 'warning',
           'access point "' || ap.name || '" has no location_snap' ||
           CASE WHEN ap.river_mile_downstream IS NOT NULL
                THEN ' but carries river_mile ' || ap.river_mile_downstream
                ELSE '' END
    FROM access_points ap
    JOIN rivers r ON r.id = ap.river_id
    WHERE ap.approved = true AND r.active = true AND ap.location_snap IS NULL

    UNION ALL
    SELECT river_slug, 'mileage_order_mismatch', 'warning', detail
    FROM (
        SELECT r.slug AS river_slug,
               'access points "' || ap.name || '" (mile ' || ap.river_mile_downstream ||
               ') and "' || lead(ap.name) OVER w || '" (mile ' ||
               lead(ap.river_mile_downstream) OVER w ||
               ') are ordered differently along the river geometry' AS detail,
               ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry) AS frac,
               lead(ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry)) OVER w AS next_frac
        FROM access_points ap
        JOIN rivers r ON r.id = ap.river_id
        WHERE ap.approved = true AND r.active = true
          AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
          AND ap.river_mile_downstream IS NOT NULL
          AND GeometryType(ST_LineMerge(r.geom::geometry)) = 'LINESTRING'
        WINDOW w AS (PARTITION BY r.id ORDER BY ap.river_mile_downstream, ap.name)
    ) pairs
    WHERE next_frac IS NOT NULL AND next_frac < frac - 0.01

    UNION ALL
    -- CHANGED (20261101165213): one row per river, and a point that really is the
    -- last thing on the line no longer counts as a placeholder. See the header.
    SELECT river_slug, 'mileage_equals_length', 'warning',
           count(*)::text || ' access point(s) carry a river_mile exactly equal to ' ||
           'rivers.length_miles but are not at the downstream end of the line — ' ||
           'likely clamped placeholders: ' ||
           string_agg(detail, '; ' ORDER BY detail)
    FROM (
        SELECT river_slug,
               '"' || nm || '" (mile ' || mile || ', ' ||
               CASE WHEN miles_above_end IS NULL THEN 'position on the line unknown'
                    ELSE round(miles_above_end, 2) || ' mi of line above its end' END ||
               ')' AS detail,
               miles_above_end
        FROM (
            SELECT r.slug AS river_slug,
                   ap.name AS nm,
                   ap.river_mile_downstream AS mile,
                   -- Only measurable on a single linestring with a snapped point;
                   -- anything else stays NULL and is still reported, because a
                   -- rule that cannot see the position cannot excuse the row.
                   CASE WHEN ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
                             AND GeometryType(ST_LineMerge(r.geom::geometry)) = 'LINESTRING'
                        THEN ((1 - ST_LineLocatePoint(ST_LineMerge(r.geom::geometry),
                                                      ap.location_snap::geometry))
                              * r.length_miles)::NUMERIC
                   END AS miles_above_end
            FROM access_points ap
            JOIN rivers r ON r.id = ap.river_id
            WHERE ap.approved = true AND r.active = true
              AND ap.river_mile_downstream IS NOT NULL AND r.length_miles IS NOT NULL
              AND ap.river_mile_downstream = r.length_miles
        ) eq
    ) placed
    WHERE miles_above_end IS NULL OR miles_above_end > 0.25
    GROUP BY river_slug

    UNION ALL
    SELECT river_slug, 'mileage_segment_implausible', 'warning',
           count(*)::text || ' segment(s) quote a mileage the river line cannot support: ' ||
           string_agg(detail, '; ' ORDER BY detail)
    FROM (
        SELECT river_slug,
               '"' || nm || '" to "' || next_nm || '" quotes ' || round(edit_d, 2) ||
               ' mi against ' || round(geo_d, 2) || ' mi of line (ratio ' ||
               round(edit_d / geo_d, 2) || ')' AS detail
        FROM (
            SELECT river_slug, nm, next_nm,
                   abs(next_mile - mile)::NUMERIC              AS edit_d,
                   (abs(next_frac - frac) * len)::NUMERIC      AS geo_d
            FROM (
                SELECT r.slug AS river_slug,
                       ap.name AS nm,
                       ap.river_mile_downstream AS mile,
                       r.length_miles AS len,
                       lead(ap.name) OVER w AS next_nm,
                       lead(ap.river_mile_downstream) OVER w AS next_mile,
                       ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry) AS frac,
                       lead(ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry)) OVER w AS next_frac
                FROM access_points ap
                JOIN rivers r ON r.id = ap.river_id
                WHERE ap.approved = true AND r.active = true
                  AND ap.is_float_endpoint = true
                  AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
                  AND ap.river_mile_downstream IS NOT NULL AND r.length_miles IS NOT NULL
                  AND GeometryType(ST_LineMerge(r.geom::geometry)) = 'LINESTRING'
                WINDOW w AS (PARTITION BY r.id
                             ORDER BY ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry),
                                      ap.name)
            ) seg
            WHERE next_frac IS NOT NULL
        ) d
        -- The half-mile floor guards BOTH tails, and it has to. Editorial miles are
        -- published to one decimal, so on a segment of a few hundred feet the
        -- rounding alone swamps the ratio: Big Piney's Peck's Last Resort to
        -- Wilderness Ridge Resort quotes 0.10 mi against 0.04 mi of line and scores
        -- 2.38 without anything being wrong with either row. A ratio is only
        -- evidence once the segment is long enough to carry one.
        WHERE geo_d >= 0.5
          AND (edit_d / geo_d > 2.0 OR edit_d / geo_d < 0.5)
    ) flagged
    GROUP BY river_slug

    UNION ALL
    SELECT r.slug, 'unrated_has_thresholds', 'error',
           'Unrated release must have no recreational thresholds on any linked gauge'
    FROM public.rivers r WHERE r.active AND r.condition_rating_mode = 'unrated'
      AND EXISTS (
        SELECT 1 FROM public.river_gauges rg WHERE rg.river_id = r.id
          AND cardinality(array_remove(ARRAY[
            rg.level_too_low, rg.level_low, rg.level_optimal_min, rg.level_optimal_max,
            rg.level_high, rg.level_dangerous, rg.alt_level_too_low, rg.alt_level_low,
            rg.alt_level_optimal_min, rg.alt_level_optimal_max, rg.alt_level_high,
            rg.alt_level_dangerous], NULL)) > 0
      )
) AS raw (river_slug, check_name, severity, detail)
GROUP BY raw.river_slug, raw.check_name
$$;
