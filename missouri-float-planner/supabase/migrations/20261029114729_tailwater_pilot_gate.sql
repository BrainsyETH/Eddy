-- Per-river tailwater pilot gate. Changes the activation review only; it
-- activates no river and stages none (20261029115032 stages Norfork).
-- activate-rivers.ts activates only a dossier whose tailwaterPilot passes.
--
-- ── Why the blanket refusal goes ────────────────────────────────────────────
-- 20261004002112 made review_river_activation refuse every dam_tailwater river
-- with "requires the separate pilot acceptance review", and gave that review
-- nowhere to be recorded. No evidence could ever satisfy it, so the Norfork
-- pilot (docs/TAILWATER_PLAN.md, October 3 and 15 reviews) had no path to
-- publication. The gate now asks for the review itself, per river, in the same
-- readiness payload as the six ordinary criteria:
--
--   tailwaterPilot: { status: 'verified', reviewedBy, reviewedAt, evidence[],
--                     floatEndpoints: [access slugs] }
--
-- Two further tailwater-only checks keep what the blanket refusal protected:
--
--   tailwater_requires_unrated — a tailwater publishes dam observations, not a
--     recreational ladder. A generic float ladder is not a release-safety model,
--     so a tailwater activates only under the explicit unrated policy.
--   tailwater_scope_mismatch — activating a river exposes every approved float
--     endpoint, and a reviewed short corridor does not authorize the rest
--     (TAILWATER_REVIEW_2026-10-15.md). The review must name exactly the
--     endpoints the database would publish. White (23) and Taneycomo (5) cannot
--     pass on a two-ramp corridor review; their wider sets need their own.
SET LOCAL search_path = public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.review_river_activation(
  p_slugs text[], p_readiness jsonb, p_apply boolean DEFAULT false
) RETURNS TABLE(river_slug text, check_name text, severity text, detail text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, extensions, pg_temp AS $$
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
      SELECT r.slug, 'condition_mode_review_mismatch', 'error',
             'Conditions review must explicitly match the stored rating mode'
      FROM public.rivers r WHERE r.slug = ANY(p_slugs)
        AND coalesce(p_readiness -> r.slug -> 'conditions' ->> 'ratingMode', 'rated')
            IS DISTINCT FROM r.condition_rating_mode
      UNION ALL
      -- Tailwater presentation has its own acceptance review, recorded per river.
      SELECT r.slug, 'tailwater_pilot_review', 'error',
             'Tailwater activation requires a verified, attributed and evidenced tailwaterPilot review (docs/TAILWATER_PLAN.md)'
      FROM public.rivers r WHERE r.slug = ANY(p_slugs) AND r.river_type = 'dam_tailwater'
        AND ((p_readiness -> r.slug -> 'tailwaterPilot' ->> 'status') IS DISTINCT FROM 'verified'
          OR nullif(btrim(p_readiness -> r.slug -> 'tailwaterPilot' ->> 'reviewedBy'), '') IS NULL
          OR nullif(btrim(p_readiness -> r.slug -> 'tailwaterPilot' ->> 'reviewedAt'), '') IS NULL
          OR (p_readiness -> r.slug -> 'tailwaterPilot' ->> 'reviewedAt')::timestamptz > now()
          OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(p_readiness -> r.slug -> 'tailwaterPilot' -> 'evidence') = 'array'
                   THEN p_readiness -> r.slug -> 'tailwaterPilot' -> 'evidence' ELSE '[]'::jsonb END
            ) e WHERE jsonb_typeof(e) = 'string' AND nullif(btrim(e #>> '{}'), '') IS NOT NULL
          ))
      UNION ALL
      -- A generic float ladder is not a release-safety model.
      SELECT r.slug, 'tailwater_requires_unrated', 'error',
             'A tailwater publishes release readings without recreational bands; condition_rating_mode must be unrated'
      FROM public.rivers r WHERE r.slug = ANY(p_slugs) AND r.river_type = 'dam_tailwater'
        AND r.condition_rating_mode IS DISTINCT FROM 'unrated'
      UNION ALL
      -- Activation publishes every approved endpoint; the review must name them all.
      SELECT r.slug, 'tailwater_scope_mismatch', 'error',
             'tailwaterPilot.floatEndpoints must name exactly the approved float endpoints: '
             || coalesce(array_to_string(published.slugs, ', '), 'none')
      FROM public.rivers r
      CROSS JOIN LATERAL (
        SELECT array_agg(a.slug ORDER BY a.slug) AS slugs FROM public.access_points a
        WHERE a.river_id = r.id AND a.approved AND a.is_float_endpoint
      ) published
      CROSS JOIN LATERAL (
        SELECT array_agg(DISTINCT e #>> '{}' ORDER BY e #>> '{}') AS slugs
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_readiness -> r.slug -> 'tailwaterPilot' -> 'floatEndpoints') = 'array'
               THEN p_readiness -> r.slug -> 'tailwaterPilot' -> 'floatEndpoints' ELSE '[]'::jsonb END
        ) e WHERE jsonb_typeof(e) = 'string'
      ) reviewed
      WHERE r.slug = ANY(p_slugs) AND r.river_type = 'dam_tailwater'
        AND published.slugs IS DISTINCT FROM reviewed.slugs
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

REVOKE ALL ON FUNCTION public.review_river_activation(text[], jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_river_activation(text[], jsonb, boolean) TO service_role;

