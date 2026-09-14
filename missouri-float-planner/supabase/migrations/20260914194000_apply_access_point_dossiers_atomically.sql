-- Apply a human-reviewed access-point dossier as one transaction.
--
-- The TypeScript importer owns planning: it decides insert versus update,
-- preserves omitted fields on existing rows, and prints the result. This
-- function owns only atomic application. If any operation or the final mileage
-- fill fails, PostgreSQL rolls the entire dossier back.

CREATE OR REPLACE FUNCTION public.apply_access_point_dossier(
    p_river_id UUID,
    p_plan JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_op       JSONB;
    v_payload  JSONB;
    v_action   TEXT;
    v_slug     TEXT;
    v_id       UUID;
    v_inserted INTEGER := 0;
    v_updated  INTEGER := 0;
    v_miles    INTEGER := 0;
    v_bad_keys TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.rivers WHERE id = p_river_id) THEN
        RAISE EXCEPTION 'apply_access_point_dossier: unknown river id %', p_river_id;
    END IF;

    IF jsonb_typeof(p_plan) <> 'array' THEN
        RAISE EXCEPTION 'apply_access_point_dossier: plan must be a json array, got %',
                        jsonb_typeof(p_plan);
    END IF;

    FOR v_op IN SELECT * FROM jsonb_array_elements(p_plan)
    LOOP
        v_action  := v_op->>'action';
        v_slug    := v_op->>'slug';
        v_payload := COALESCE(v_op->'payload', '{}'::JSONB);

        IF v_slug IS NULL OR v_slug = '' THEN
            RAISE EXCEPTION 'apply_access_point_dossier: an operation has no slug: %', v_op;
        END IF;

        SELECT string_agg(k, ', ' ORDER BY k) INTO v_bad_keys
        FROM jsonb_object_keys(v_payload) AS k
        WHERE k <> ALL (ARRAY[
            'name', 'type', 'is_public', 'ownership', 'managing_agency',
            'official_site_url', 'facilities', 'description', 'location_orig',
            'is_float_endpoint', 'types'
        ]::TEXT[]);
        IF v_bad_keys IS NOT NULL THEN
            RAISE EXCEPTION 'apply_access_point_dossier: unsupported payload key(s) for %: %',
                            v_slug, v_bad_keys;
        END IF;

        IF v_action = 'insert' THEN
            IF NOT (v_payload ?& ARRAY['name','type','location_orig','is_float_endpoint','types']) THEN
                RAISE EXCEPTION 'apply_access_point_dossier: insert for % lacks required fields', v_slug;
            END IF;
            IF jsonb_typeof(v_payload->'types') <> 'array'
               OR jsonb_array_length(v_payload->'types') = 0 THEN
                RAISE EXCEPTION 'apply_access_point_dossier: insert for % needs at least one role', v_slug;
            END IF;
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(v_payload->'types') AS roles(role)
                WHERE role <> ALL (ARRAY[
                    'access','bridge','boat_ramp','park','campground','gravel_bar'
                ]::TEXT[])
            ) THEN
                RAISE EXCEPTION 'apply_access_point_dossier: insert for % has an invalid role', v_slug;
            END IF;

            INSERT INTO public.access_points (
                river_id, slug, name, type, is_public, ownership,
                managing_agency, official_site_url, facilities, description,
                location_orig, approved, is_float_endpoint, types
            ) VALUES (
                p_river_id,
                v_slug,
                v_payload->>'name',
                v_payload->>'type',
                COALESCE((v_payload->>'is_public')::BOOLEAN, TRUE),
                v_payload->>'ownership',
                v_payload->>'managing_agency',
                v_payload->>'official_site_url',
                v_payload->>'facilities',
                v_payload->>'description',
                ST_SetSRID(ST_GeomFromGeoJSON(v_payload->>'location_orig'), 4326),
                FALSE,
                (v_payload->>'is_float_endpoint')::BOOLEAN,
                ARRAY(SELECT jsonb_array_elements_text(v_payload->'types'))
            );
            v_inserted := v_inserted + 1;

        ELSIF v_action = 'update' THEN
            -- Existing-row plans may never carry human review state. Refuse it
            -- here as well as in TypeScript so a hand-built RPC payload cannot
            -- bypass the boundary.
            IF v_payload ?| ARRAY['is_float_endpoint','types'] THEN
                RAISE EXCEPTION 'apply_access_point_dossier: update for % carries review state', v_slug;
            END IF;

            v_id := NULLIF(v_op->>'id', '')::UUID;
            IF v_id IS NULL THEN
                RAISE EXCEPTION 'apply_access_point_dossier: update for % has no id', v_slug;
            END IF;

            UPDATE public.access_points ap
            SET name = CASE WHEN v_payload ? 'name' THEN v_payload->>'name' ELSE ap.name END,
                type = CASE WHEN v_payload ? 'type' THEN v_payload->>'type' ELSE ap.type END,
                is_public = CASE WHEN v_payload ? 'is_public'
                                 THEN (v_payload->>'is_public')::BOOLEAN ELSE ap.is_public END,
                ownership = CASE WHEN v_payload ? 'ownership'
                                 THEN v_payload->>'ownership' ELSE ap.ownership END,
                managing_agency = CASE WHEN v_payload ? 'managing_agency'
                                       THEN v_payload->>'managing_agency' ELSE ap.managing_agency END,
                official_site_url = CASE WHEN v_payload ? 'official_site_url'
                                         THEN v_payload->>'official_site_url' ELSE ap.official_site_url END,
                facilities = CASE WHEN v_payload ? 'facilities'
                                  THEN v_payload->>'facilities' ELSE ap.facilities END,
                description = CASE WHEN v_payload ? 'description'
                                   THEN v_payload->>'description' ELSE ap.description END,
                location_orig = CASE WHEN v_payload ? 'location_orig'
                                     THEN ST_SetSRID(ST_GeomFromGeoJSON(v_payload->>'location_orig'), 4326)
                                     ELSE ap.location_orig END,
                updated_at = NOW()
            WHERE ap.id = v_id AND ap.river_id = p_river_id AND ap.slug = v_slug;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'apply_access_point_dossier: no matching row for update %/%',
                                p_river_id, v_slug;
            END IF;
            v_updated := v_updated + 1;

        ELSE
            RAISE EXCEPTION 'apply_access_point_dossier: unknown action % for %', v_action, v_slug;
        END IF;
    END LOOP;

    -- Since 00121 auto-snap maintains only location_snap + snap_distance_m.
    -- Filling still-null miles here keeps it in the same transaction as every
    -- row whose geometry produced them; curated non-null miles remain untouched.
    SELECT public.set_access_point_miles_from_geometry(p_river_id, FALSE) INTO v_miles;

    RETURN jsonb_build_object(
        'inserted', v_inserted,
        'updated', v_updated,
        'miles_set', v_miles
    );
END
$$;

COMMENT ON FUNCTION public.apply_access_point_dossier(UUID, JSONB) IS
    'Applies an already-reviewed access-point dossier plan atomically. Update payloads are presence-aware and cannot modify approval, endpoint eligibility, or roles; new rows are inserted pending with explicit roles and eligibility.';

REVOKE EXECUTE ON FUNCTION public.apply_access_point_dossier(UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_access_point_dossier(UUID, JSONB)
    TO service_role;
