-- File: supabase/migrations/00148_embed_widget_cards.sql
-- Location-pinned embed cards ("Floatable From Here").
--
-- An embedder (outfitter / campground / vacation rental) pins their business
-- location once at setup. We resolve their nearest active river + access
-- point + drive time at that moment and persist it on this record, keyed by a
-- short public embed_id used in the iframe URL. Live condition is computed at
-- render time via get_river_condition_segment(river_id, location); everything
-- geo-expensive is resolved at install.
--
-- Drive time is cached directly on the record (one embedder = one launch
-- point) with drive_fetched_at for TTL checks, mirroring drive_time_cache's
-- 30-day / 1-hour-if-dangerous policy in the app layer.

CREATE TABLE IF NOT EXISTS embed_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Short public identifier used in widget URLs, e.g. 'emb_x7k2m9'.
    embed_id TEXT NOT NULL UNIQUE,

    -- The embedder's business
    business_name TEXT,
    address TEXT,
    location GEOMETRY(Point, 4326) NOT NULL,

    -- Resolved once at install (embedder confirms during onboarding)
    river_id UUID NOT NULL REFERENCES rivers(id) ON DELETE CASCADE,
    access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL,
    straight_line_miles NUMERIC(6, 2),

    -- Drive time from the business to the launch (Mapbox Directions, cached)
    drive_minutes NUMERIC(6, 1),
    drive_miles NUMERIC(6, 2),
    drive_fetched_at TIMESTAMPTZ,

    -- White-label-lite branding + the host's own conversion path
    logo_url TEXT,
    accent_color TEXT,
    cta_url TEXT,
    cta_label TEXT,

    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embed_widgets_location ON embed_widgets USING GIST(location);

-- Service-role only: the API routes read/write with the admin client. No
-- public policies — embed_ids are unguessable but records still hold business
-- contact details we don't want enumerable via PostgREST.
ALTER TABLE embed_widgets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Nearest active river to an arbitrary point.
-- KNN (<->) pre-ranks on the geometry GIST index; the outer query re-orders
-- by exact geography distance so near-ties at Missouri latitudes can't
-- misorder (geometry degrees compress longitude ~20% vs latitude here).
-- ============================================
CREATE OR REPLACE FUNCTION nearest_rivers_to_point(
    p_point GEOMETRY(Point, 4326),
    p_limit INT DEFAULT 3
) RETURNS TABLE (
    river_id UUID,
    slug TEXT,
    name TEXT,
    state TEXT,
    distance_meters NUMERIC
) AS $$
    SELECT c.id, c.slug, c.name, c.state, c.distance_meters
    FROM (
        SELECT
            r.id, r.slug, r.name, r.state,
            ST_Distance(r.geom::geography, p_point::geography)::NUMERIC(10, 1) AS distance_meters
        FROM rivers r
        WHERE r.active = TRUE AND r.geom IS NOT NULL
        ORDER BY r.geom <-> p_point
        LIMIT GREATEST(p_limit * 3, 10)
    ) c
    ORDER BY c.distance_meters ASC
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- ============================================
-- Nearest approved public access points to an arbitrary point, optionally
-- scoped to one river. Returns the river so onboarding can surface a
-- "wrong river?" disambiguation without a second query.
-- ============================================
CREATE OR REPLACE FUNCTION nearest_access_points_to_point(
    p_point GEOMETRY(Point, 4326),
    p_river_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 3
) RETURNS TABLE (
    access_point_id UUID,
    name TEXT,
    slug TEXT,
    type TEXT,
    river_id UUID,
    river_slug TEXT,
    river_name TEXT,
    river_mile NUMERIC,
    distance_meters NUMERIC,
    lng DOUBLE PRECISION,
    lat DOUBLE PRECISION
) AS $$
    SELECT c.id, c.name, c.slug, c.type, c.river_id, c.river_slug, c.river_name,
           c.river_mile, c.distance_meters, c.lng, c.lat
    FROM (
        SELECT
            ap.id, ap.name, ap.slug, ap.type,
            ap.river_id, r.slug AS river_slug, r.name AS river_name,
            ap.river_mile_downstream AS river_mile,
            ST_Distance(ap.location_snap::geography, p_point::geography)::NUMERIC(10, 1) AS distance_meters,
            ST_X(ap.location_snap) AS lng,
            ST_Y(ap.location_snap) AS lat
        FROM access_points ap
        JOIN rivers r ON r.id = ap.river_id
        WHERE ap.approved = TRUE
          AND ap.is_public = TRUE
          AND r.active = TRUE
          AND ap.location_snap IS NOT NULL
          AND (p_river_id IS NULL OR ap.river_id = p_river_id)
        ORDER BY ap.location_snap <-> p_point
        LIMIT GREATEST(p_limit * 5, 25)
    ) c
    ORDER BY c.distance_meters ASC
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;

COMMENT ON TABLE embed_widgets IS 'Location-pinned embed cards: one row per embedder business, resolved river/access/drive-time cached at install, keyed by public embed_id.';
COMMENT ON FUNCTION nearest_rivers_to_point IS 'Nearest active rivers to a point (exact geography distance, KNN-prefiltered). Used by embed onboarding.';
COMMENT ON FUNCTION nearest_access_points_to_point IS 'Nearest approved public access points to a point, optionally scoped to a river. Used by embed onboarding.';
