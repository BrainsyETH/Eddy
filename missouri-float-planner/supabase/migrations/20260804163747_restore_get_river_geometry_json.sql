-- APPLIED to production 2026-08-04 as 20260804163747, renamed from its
-- authoring timestamp to match. Verified after apply: the function returns 632
-- coordinates for the Current and 916 for the Meramec.
--
-- ── Found by the trust ledger's first scheduled run ──────────────────────
--
-- get_river_geometry_json() is defined in 00003_functions.sql and does not
-- exist in production. It is legacy drift — pre-00212, from the window
-- docs/legacy-schema-security-audit.md describes as unprovable by the forward
-- migration gate: "it prevents new drift but cannot prove that an older RLS
-- policy, grant, or CHECK constraint reached production." A function is the
-- same story.
--
-- ── What it has been costing ─────────────────────────────────────────────
--
-- /api/admin/river-health calls this RPC per river. PostgREST does not throw on
-- a missing function; it resolves with an error object. That route read only
-- `data`, so a missing function was indistinguishable from a river with no
-- geometry, and the page has been reporting "No geometry data found" for EVERY
-- river — while rivers.geom holds 632 points for the Current, 916 for the
-- Meramec, 158 for Courtois.
--
-- Nobody noticed, because nobody opens that page. Which is the argument the
-- whole trust ledger is built on: its first scheduled run raised the same
-- finding 24 times, and 24-out-of-24 is what made it obviously a broken check
-- rather than broken data.
--
-- src/app/api/rivers/[slug]/route.ts already knew. It carries an explicit
-- PGRST202 branch and a fallback to rivers.geom, added by someone who hit this
-- and worked around it locally instead of restoring the function. So the public
-- map kept working and the diagnostic page silently did not.
--
-- ── Why restore rather than add a second fallback ────────────────────────
--
-- The audit says record every mismatch as a forward-only corrective migration
-- or an explicitly accepted exception with an owner. This is the corrective
-- migration. Copying the fallback into a second call site would spread the
-- workaround rather than remove the cause, and there are three call sites.
--
-- Body is character-identical to 00003_functions.sql:326-341.

CREATE OR REPLACE FUNCTION get_river_geometry_json(p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
    v_geom GEOMETRY;
BEGIN
    SELECT geom INTO v_geom
    FROM rivers
    WHERE slug = p_slug;

    IF v_geom IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ST_AsGeoJSON(v_geom)::jsonb;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_river_geometry_json(TEXT) IS
    'River geometry as GeoJSON. Restored 2026-08-04 after the trust ledger found it absent from production; originally 00003_functions.sql.';
