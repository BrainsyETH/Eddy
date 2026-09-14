-- Restore the upper-Niangua access chain from MDC's live GIS, without rebasing
-- the published FloatMissouri mile index.
--
-- SOURCES (checked 2026-09-14):
--   MDC place pages:
--     https://mdc.mo.gov/discover-nature/places/charity-access (area 8249)
--     https://mdc.mo.gov/discover-nature/places/big-john-access (area 7010)
--     https://mdc.mo.gov/discover-nature/places/williams-ford-access (area 9008)
--   MDC Discover Nature ArcGIS feature service:
--     https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer
--
-- Layer 17 (Boat Ramps) places Charity at -92.983741758884122,
-- 37.51980535885081 and Big John at -93.043858867544444,
-- 37.64176700355199. Layer 9 (Entry Points) places Williams Ford at
-- -92.953851, 37.692403. The corresponding MDC area maps identify Charity's
-- concrete ramp, Big John's gravel-bar boat launch, and Williams Ford's access
-- road/ford.
--
-- These pins settle the apparent Williams Ford mile defect. Against the live
-- Niangua line, Big John -> Williams is 10.94 mi for a published 10.90, and
-- Williams -> Moon Valley is 9.92 mi for a published 10.10. Keep the curated
-- 1.30 / 12.20 / 22.30 mile chain exactly as published.
--
-- Charity is different. Its official ramp lies 19.1 line-miles above Big John,
-- while its stored 0.10 and Big John's 1.30 came from different index origins.
-- Correct the pin and endpoint role, but leave it pending until that datum
-- boundary has an explicit product representation. Publishing it now would
-- quote a 1.2-mile trip for roughly 19 miles of river.

DO $niangua$
DECLARE
    populated       BOOLEAN;
    approved_before INTEGER;
    approved_after  INTEGER;
    n_missing       INTEGER;
    n_bad           INTEGER;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
    IF NOT populated THEN
        RAISE NOTICE 'access_points is empty (from-scratch build); nothing to correct.';
        RETURN;
    END IF;

    SELECT count(*) INTO n_missing
    FROM (VALUES
        ('charity-access', FALSE, 0.10::NUMERIC),
        ('big-john-access', FALSE, 1.30::NUMERIC),
        ('williams-ford', TRUE, 12.20::NUMERIC),
        ('moon-valley', TRUE, 22.30::NUMERIC)
    ) AS expected(slug, approved, mile)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.access_points ap
        JOIN public.rivers r ON r.id = ap.river_id
        WHERE r.slug = 'niangua'
          AND ap.slug = expected.slug
          AND ap.approved IS NOT DISTINCT FROM expected.approved
          AND ap.river_mile_downstream = expected.mile
    );
    IF n_missing <> 0 THEN
        RAISE EXCEPTION 'refusing: % upper-Niangua prerequisite row(s) changed or disappeared',
                        n_missing;
    END IF;

    SELECT count(*) INTO approved_before
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'niangua' AND ap.approved;

    UPDATE public.access_points ap
    SET location_orig = ST_SetSRID(
            ST_MakePoint(-92.983741758884122, 37.51980535885081), 4326
        ),
        type = 'access',
        types = ARRAY['access', 'boat_ramp']::TEXT[],
        is_float_endpoint = TRUE,
        managing_agency = 'MDC',
        ownership = 'MDC',
        updated_at = NOW()
    FROM public.rivers r
    WHERE r.id = ap.river_id
      AND r.slug = 'niangua'
      AND ap.slug = 'charity-access'
      AND ap.approved = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'refusing: Charity Access was not the expected pending row';
    END IF;

    UPDATE public.access_points ap
    SET location_orig = ST_SetSRID(
            ST_MakePoint(-93.043858867544444, 37.64176700355199), 4326
        ),
        type = 'access',
        types = ARRAY['access', 'boat_ramp']::TEXT[],
        is_float_endpoint = TRUE,
        managing_agency = 'MDC',
        ownership = 'MDC',
        approved = TRUE,
        approved_at = NOW(),
        updated_at = NOW()
    FROM public.rivers r
    WHERE r.id = ap.river_id
      AND r.slug = 'niangua'
      AND ap.slug = 'big-john-access'
      AND ap.approved = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'refusing: Big John Access was not the expected pending row';
    END IF;

    UPDATE public.access_points ap
    SET location_orig = ST_SetSRID(ST_MakePoint(-92.953851, 37.692403), 4326),
        updated_at = NOW()
    FROM public.rivers r
    WHERE r.id = ap.river_id
      AND r.slug = 'niangua'
      AND ap.slug = 'williams-ford'
      AND ap.approved = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'refusing: Williams Ford was not the expected published row';
    END IF;

    -- The auto_snap_access_point trigger must have accepted all three agency
    -- coordinates as plausible float-access pins.
    SELECT count(*) INTO n_bad
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'niangua'
      AND ap.slug IN ('charity-access', 'big-john-access', 'williams-ford')
      AND (ap.location_snap IS NULL OR ap.snap_distance_m > 250);
    IF n_bad <> 0 THEN
        RAISE EXCEPTION 'refusing: % corrected MDC pin(s) failed the 250 m snap gate', n_bad;
    END IF;

    -- Nothing in this correction may replace the authoritative editorial mile
    -- values. In particular, the geometry helper would write a different datum.
    SELECT count(*) INTO n_bad
    FROM (VALUES
        ('charity-access', 0.10::NUMERIC),
        ('big-john-access', 1.30::NUMERIC),
        ('williams-ford', 12.20::NUMERIC),
        ('moon-valley', 22.30::NUMERIC)
    ) AS expected(slug, mile)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.access_points ap
        JOIN public.rivers r ON r.id = ap.river_id
        WHERE r.slug = 'niangua'
          AND ap.slug = expected.slug
          AND ap.river_mile_downstream = expected.mile
    );
    IF n_bad <> 0 THEN
        RAISE EXCEPTION 'refusing: % curated Niangua mile(s) changed', n_bad;
    END IF;

    -- Re-run the same invariant as mileage_segment_implausible, narrowly over
    -- the two source-backed consecutive segments repaired here.
    WITH pairs(start_slug, end_slug) AS (VALUES
        ('big-john-access', 'williams-ford'),
        ('williams-ford', 'moon-valley')
    ), measured AS (
        SELECT
            p.start_slug,
            p.end_slug,
            abs(b.river_mile_downstream - a.river_mile_downstream) AS quoted_mi,
            abs(
                ST_LineLocatePoint(r.geom, b.location_snap)
                - ST_LineLocatePoint(r.geom, a.location_snap)
            ) * ST_Length(r.geom::GEOGRAPHY) / 1609.344 AS line_mi
        FROM pairs p
        JOIN public.access_points a ON a.slug = p.start_slug
        JOIN public.access_points b ON b.slug = p.end_slug
        JOIN public.rivers r
          ON r.id = a.river_id AND r.id = b.river_id AND r.slug = 'niangua'
    )
    SELECT count(*) INTO n_bad
    FROM measured
    WHERE line_mi < 0.5 OR quoted_mi / line_mi NOT BETWEEN 0.5 AND 2.0;
    IF n_bad <> 0 THEN
        RAISE EXCEPTION 'refusing: % repaired Niangua segment(s) remain implausible', n_bad;
    END IF;

    SELECT count(*) INTO approved_after
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'niangua' AND ap.approved;
    IF approved_after - approved_before <> 1 THEN
        RAISE EXCEPTION 'refusing: Niangua approved count moved by %, expected 1',
                        approved_after - approved_before;
    END IF;

    PERFORM 1
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'niangua'
      AND ap.slug = 'charity-access'
      AND ap.approved = FALSE
      AND ap.is_float_endpoint = TRUE
      AND ap.types @> ARRAY['access', 'boat_ramp']::TEXT[];
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Charity must remain held with its sourced launch role intact';
    END IF;

    RAISE NOTICE 'MDC pins corrected for Charity, Big John and Williams Ford.';
    RAISE NOTICE 'Big John published; Charity remains held on the unresolved datum boundary.';
END
$niangua$;
