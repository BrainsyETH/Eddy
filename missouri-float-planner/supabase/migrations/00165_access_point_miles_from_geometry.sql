-- File: supabase/migrations/00165_access_point_miles_from_geometry.sql
-- Populate river_mile_downstream / river_mile_upstream for a river's access
-- points from the river geometry.
--
-- Why this exists: since 00121, auto_snap_access_point() only maintains
-- location_snap + snap_distance_m and deliberately leaves the mile markers
-- alone (the old auto-mile was unreliable and clobbered hand-corrected values).
-- The recent per-river correction migrations therefore supply river_mile_*
-- explicitly. For a brand-new river whose access points have no curated float-
-- chart miles yet, the geometry-derived mile (fraction of the flowline from the
-- headwaters × length_miles, via snap_to_river) is deterministic, monotonic
-- downstream, and internally consistent — exactly what the float planner needs
-- to order accesses and compute segment distances.
--
-- This helper is idempotent: it recomputes from the CURRENT location_orig +
-- geometry every call, so re-running after a coordinate fix just refreshes.
-- It intentionally does NOT overwrite a point that already carries a non-null
-- river_mile_downstream (so later hand-curated float-chart miles win); pass
-- p_force := TRUE to recompute those too.

CREATE OR REPLACE FUNCTION set_access_point_miles_from_geometry(
    p_river_id UUID,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH computed AS (
        SELECT ap.id,
               s.river_mile AS dn,
               GREATEST(r.length_miles - s.river_mile, 0)::NUMERIC(6,2) AS up
        FROM access_points ap
        JOIN rivers r ON r.id = ap.river_id
        CROSS JOIN LATERAL snap_to_river(ap.location_orig, ap.river_id) s
        WHERE ap.river_id = p_river_id
          AND ap.location_orig IS NOT NULL
          AND (p_force OR ap.river_mile_downstream IS NULL)
    )
    UPDATE access_points ap
    SET river_mile_downstream = c.dn,
        river_mile_upstream = c.up
    FROM computed c
    WHERE ap.id = c.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_access_point_miles_from_geometry IS
  'Sets river_mile_downstream/upstream for a river''s access points from the flowline geometry via snap_to_river (mile 0 = headwaters). Skips points that already have a downstream mile unless p_force. Idempotent.';
