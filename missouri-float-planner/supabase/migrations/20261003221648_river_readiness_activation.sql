-- Additive operator tools. No river, threshold or hazard is changed on install.
CREATE OR REPLACE FUNCTION public.audit_river_readiness(p_slugs text[] DEFAULT NULL)
RETURNS TABLE(river_slug text, check_name text, severity text, detail text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
WITH scoped AS (
  SELECT r.* FROM public.rivers r
  WHERE CASE WHEN p_slugs IS NULL THEN r.active ELSE r.slug = ANY(p_slugs) END
), ladders AS (
  SELECT r.slug, rg.gauge_station_id, rg.threshold_source, rg.threshold_source_url,
         gs.name AS gauge_name, band.unit AS threshold_unit, band.ladder
  FROM public.rivers r JOIN public.river_gauges rg ON rg.river_id = r.id
  JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
  CROSS JOIN LATERAL (VALUES
    (rg.threshold_unit, ARRAY[rg.level_too_low, rg.level_low, rg.level_optimal_min,
      rg.level_optimal_max, rg.level_high, rg.level_dangerous]),
    (CASE rg.threshold_unit WHEN 'ft' THEN 'cfs' WHEN 'cfs' THEN 'ft' END,
      ARRAY[rg.alt_level_too_low, rg.alt_level_low, rg.alt_level_optimal_min,
      rg.alt_level_optimal_max, rg.alt_level_high, rg.alt_level_dangerous])
  ) band(unit, ladder)
  WHERE r.active OR r.slug = ANY(p_slugs)
)
SELECT s AS river_slug, 'unknown_river' AS check_name, 'error' AS severity, 'No river matches this slug' AS detail
FROM unnest(p_slugs) s WHERE NOT EXISTS (SELECT 1 FROM scoped r WHERE r.slug = s)
UNION ALL
SELECT DISTINCT l.slug, 'threshold_provenance_missing', 'error',
       'Gauge ' || l.gauge_name || ' has recreational thresholds missing a source or URL'
FROM ladders l JOIN scoped r ON r.slug = l.slug WHERE cardinality(array_remove(l.ladder, NULL)) > 0
  AND (nullif(btrim(l.threshold_source), '') IS NULL OR nullif(btrim(l.threshold_source_url), '') IS NULL)
UNION ALL
SELECT DISTINCT l.slug, 'threshold_flood_source', 'warning',
       'Gauge ' || l.gauge_name || ': NWS flood metadata does not verify recreational thresholds'
FROM ladders l JOIN scoped r ON r.slug = l.slug WHERE cardinality(array_remove(l.ladder, NULL)) > 0
  AND l.threshold_source = 'nws_ahps'
UNION ALL
SELECT a.slug, 'identical_threshold_set', 'warning',
       'Gauge ' || a.gauge_name || ' matches distinct station ' || b.gauge_name ||
       ' on ' || b.slug || ' (' || a.threshold_unit || '); review provenance, do not infer copying'
FROM ladders a JOIN scoped r ON r.slug = a.slug
JOIN ladders b ON a.gauge_station_id <> b.gauge_station_id
  AND a.threshold_unit = b.threshold_unit AND a.ladder = b.ladder
WHERE cardinality(array_remove(a.ladder, NULL)) > 0
  AND (a.gauge_station_id < b.gauge_station_id OR NOT EXISTS (SELECT 1 FROM scoped s WHERE s.slug = b.slug))
UNION ALL
SELECT r.slug, 'no_structured_hazards', 'warning',
       'No active mapped hazards; review prose and route coverage. Empty does not mean hazard-free'
FROM scoped r WHERE NOT EXISTS (
  SELECT 1 FROM public.river_hazards h WHERE h.river_id = r.id AND h.active
)
UNION ALL
SELECT r.slug, 'primary_gauge_unavailable', 'error',
       'Primary gauge is inactive or lacks a reading in the required unit within 2 hours'
FROM scoped r JOIN public.river_gauges rg ON rg.river_id = r.id AND rg.is_primary
JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
LEFT JOIN LATERAL (
  SELECT reading_timestamp, gauge_height_ft, discharge_cfs
  FROM (
    SELECT reading_timestamp, gauge_height_ft, discharge_cfs
    FROM public.gauge_latest WHERE gauge_station_id = gs.id
    UNION ALL
    (SELECT reading_timestamp, gauge_height_ft, discharge_cfs
     FROM public.gauge_readings WHERE gauge_station_id = gs.id
     ORDER BY reading_timestamp DESC LIMIT 1)
  ) readings ORDER BY reading_timestamp DESC LIMIT 1
) gl ON true
WHERE r.river_type IS DISTINCT FROM 'dam_tailwater'
  AND (gs.active IS DISTINCT FROM true OR gl.reading_timestamp IS NULL
    OR gl.reading_timestamp < now() - interval '2 hours'
    OR gl.reading_timestamp > now() + interval '5 minutes'
    OR CASE WHEN rg.threshold_unit = 'cfs' THEN gl.discharge_cfs IS NULL
            WHEN rg.threshold_unit = 'ft' THEN gl.gauge_height_ft IS NULL ELSE true END)
$$;

-- Reuses the existing active-only validator without ever publishing an
-- unvalidated row. All updates and checks share one transaction. A nested
-- exception block rolls back previews and failed batches; genuine SQL errors
-- propagate and roll back the whole call. Existing active rows are preserved.
CREATE OR REPLACE FUNCTION public.review_river_activation(
  p_slugs text[], p_readiness jsonb, p_apply boolean DEFAULT false
) RETURNS TABLE(river_slug text, check_name text, severity text, detail text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE findings jsonb;
BEGIN
  IF p_slugs IS NULL OR cardinality(p_slugs) = 0 OR array_position(p_slugs, NULL) IS NOT NULL OR p_apply IS NULL THEN
    RAISE EXCEPTION 'Provide nonempty river slugs and an explicit apply flag';
  END IF;
  -- Consistent locking order for concurrent multi-river requests.
  PERFORM id FROM public.rivers WHERE slug = ANY(p_slugs) ORDER BY id FOR UPDATE;
  BEGIN
    UPDATE public.rivers SET active = true WHERE slug = ANY(p_slugs);
    SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO findings FROM (
      SELECT v.* FROM public.validate_river_data() v
      WHERE v.river_slug = ANY(p_slugs)
         OR (v.check_name = 'gauge_missing_site_id' AND v.river_slug IN (
           SELECT rg.gauge_station_id::text FROM public.river_gauges rg
           JOIN public.rivers r ON r.id = rg.river_id WHERE r.slug = ANY(p_slugs)
         ))
      UNION ALL
      SELECT a.* FROM public.audit_river_readiness(p_slugs) a
      UNION ALL
      SELECT s, 'readiness_incomplete', 'error', 'Unverified or unevidenced launch criterion: ' || c
      FROM unnest(p_slugs) s CROSS JOIN unnest(ARRAY['corridor','legalAccess','gauge','conditions','hazards','routing']) c
      WHERE (p_readiness -> s -> c ->> 'status') IS DISTINCT FROM 'verified'
         OR nullif(btrim(p_readiness -> s -> c ->> 'reviewedBy'), '') IS NULL
         OR nullif(btrim(p_readiness -> s -> c ->> 'reviewedAt'), '') IS NULL
         OR (p_readiness -> s -> c ->> 'reviewedAt')::timestamptz > now()
         OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_readiness -> s -> c -> 'evidence') = 'array'
                  THEN p_readiness -> s -> c -> 'evidence' ELSE '[]'::jsonb END
           ) e WHERE jsonb_typeof(e) = 'string' AND nullif(btrim(e #>> '{}'), '') IS NOT NULL
         )
      UNION ALL
      -- Tailwater presentation has its own acceptance tests. A generic float
      -- ladder is not a release-safety model; keep this gate explicit for now.
      SELECT r.slug, 'tailwater_pilot_review', 'error',
             'Tailwater activation requires the separate pilot acceptance review in docs/TAILWATER_PLAN.md'
      FROM public.rivers r WHERE r.slug = ANY(p_slugs) AND r.river_type = 'dam_tailwater'
    ) f;
    IF NOT p_apply OR EXISTS (SELECT 1 FROM jsonb_array_elements(findings) f WHERE f ->> 'severity' = 'error') THEN
      RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'Rollback activation preview or blocked batch';
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    -- PL/pgSQL local variables survive rollback of this database subtransaction.
    NULL;
  END;
  RETURN QUERY SELECT f.river_slug, f.check_name, f.severity, f.detail
  FROM jsonb_to_recordset(findings) AS f(river_slug text, check_name text, severity text, detail text);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_river_readiness(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_river_activation(text[], jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_river_readiness(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_river_activation(text[], jsonb, boolean) TO service_role;
