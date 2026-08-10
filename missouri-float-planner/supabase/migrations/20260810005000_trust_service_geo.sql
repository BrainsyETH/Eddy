-- One row per located service: how far it is from the rivers it serves, and
-- whether something else is nearer.
--
-- ── The rule this makes permanent ─────────────────────────────────────────
--
-- Every service coordinate written in August 2026 was checked by hand against
-- the river the service is linked to, because a pin that lands nowhere near the
-- water a business serves is almost always the wrong business. That check
-- rejected seven candidates sitting 79 to 236 miles out — matches that name
-- similarity alone would have written — and, run across the whole table, found
-- six rows already filed against the wrong river (20260810003000).
--
-- It was a habit. This makes it a query, and src/lib/trust/checks/
-- service-geo-consistency.ts turns the query into a scheduled check.
--
-- ── One row per SERVICE, not per link ─────────────────────────────────────
--
-- Load-bearing. A service may serve several rivers, and after 20260810003000
-- four of them legitimately do: Float Eureka is 4.63 miles from the Kings and
-- 13.39 from the War Eagle; Wild Bill's is 1.26 from the Buffalo and 10.63 from
-- Crooked Creek. Emitting a row per link would let the caller fire on the far
-- one and file a permanent finding against correct data — the false positive
-- that teaches an operator to stop reading the list.
--
-- So the distance a caller should judge is `nearest_linked_miles`, a MIN across
-- every linked river, and `nearest_any_is_linked` answers the other question on
-- its own.
--
-- ── Why SQL rather than a loop over find_nearest_river() ──────────────────
--
-- That RPC returns only the single nearest river within a radius, which answers
-- half the question; the other half needs the distance to NAMED rivers. Doing it
-- per row would also cost ~300 round trips for 138 services and drag in the
-- deadline/partial machinery river-geometry.ts needs. One set-based query has no
-- truncation path at all, so `partial` can never be silently true — and it
-- matches validate_river_data() and trust_schema_invariants(), which are the
-- house pattern for exactly this.
--
-- ── Scope ─────────────────────────────────────────────────────────────────
--
-- Located rows that are not permanently closed. A closed business's pin is not
-- going to be corrected, and `serviceEligible` already refuses to draw it;
-- `temporarily_closed` stays in, because it comes back.
--
-- Rows with NO river link are returned, with linked_river_count = 0 and null
-- distances, rather than filtered out. A service with a pin and no link is
-- invisible to /api/rivers/[slug]/services entirely — excluding it would let the
-- check report a clean sweep over a population that omits exactly the rows most
-- likely to be wrong, which is silence reading as health.

CREATE OR REPLACE FUNCTION public.trust_service_geo()
RETURNS TABLE (
  service_id            uuid,
  service_name          text,
  service_type          text,
  city                  text,
  state                 text,
  linked_river_count    integer,
  linked_river_names    text[],
  nearest_linked_name   text,
  nearest_linked_miles  numeric,
  nearest_any_name      text,
  nearest_any_miles     numeric,
  nearest_any_is_linked boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
-- `extensions` is not optional: PostGIS lives there on Supabase, so a
-- search_path of public alone makes ST_Distance and the geography cast
-- unresolvable. Same declaration as the gauge search functions in 00196/00207.
SET search_path = public, extensions
AS $$
  WITH located AS (
    SELECT s.id,
           s.name,
           s.type::text  AS type,
           s.city,
           s.state,
           ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography AS pin
      FROM nearby_services s
     WHERE s.latitude IS NOT NULL
       AND s.longitude IS NOT NULL
       AND s.status <> 'permanently_closed'
  ),
  linked AS (
    SELECT l.id,
           count(*)::integer                                       AS link_count,
           array_agg(r.name ORDER BY r.name)                        AS river_names,
           min(ST_Distance(l.pin, r.geom::geography) / 1609.344)    AS min_miles
      FROM located l
      JOIN service_rivers sr ON sr.service_id = l.id
      JOIN rivers r          ON r.id = sr.river_id AND r.geom IS NOT NULL
     GROUP BY l.id
  ),
  -- The nearest linked river BY NAME, so the finding can say which one it
  -- measured rather than only how far.
  nearest_linked AS (
    SELECT DISTINCT ON (l.id)
           l.id,
           r.name                                            AS river_name,
           ST_Distance(l.pin, r.geom::geography) / 1609.344  AS miles
      FROM located l
      JOIN service_rivers sr ON sr.service_id = l.id
      JOIN rivers r          ON r.id = sr.river_id AND r.geom IS NOT NULL
     ORDER BY l.id, ST_Distance(l.pin, r.geom::geography)
  ),
  -- Ranges over ACTIVE rivers only, matching find_nearest_river: an inactive
  -- river is not somewhere Eddy would send anyone, so proposing it as the
  -- better answer would be noise.
  nearest_any AS (
    SELECT DISTINCT ON (l.id)
           l.id,
           r.name                                            AS river_name,
           ST_Distance(l.pin, r.geom::geography) / 1609.344  AS miles
      FROM located l
      JOIN rivers r ON r.geom IS NOT NULL AND r.active
     ORDER BY l.id, ST_Distance(l.pin, r.geom::geography)
  )
  SELECT l.id,
         l.name,
         l.type,
         l.city,
         l.state,
         COALESCE(k.link_count, 0),
         COALESCE(k.river_names, ARRAY[]::text[]),
         nl.river_name,
         round(nl.miles::numeric, 2),
         na.river_name,
         round(na.miles::numeric, 2),
         CASE
           WHEN na.river_name IS NULL THEN NULL
           ELSE na.river_name = ANY (COALESCE(k.river_names, ARRAY[]::text[]))
         END
    FROM located l
    LEFT JOIN linked k          ON k.id = l.id
    LEFT JOIN nearest_linked nl ON nl.id = l.id
    LEFT JOIN nearest_any na    ON na.id = l.id
   ORDER BY l.name;
$$;

COMMENT ON FUNCTION public.trust_service_geo() IS
  'One row per located, non-permanently-closed service: distance to the nearest river it is linked to (MIN across links), and the nearest active river overall. Read by the service_geo_consistency trust check. Services with no river link are returned with linked_river_count = 0, not filtered.';

-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on every new public
-- function to anon and authenticated DIRECTLY, so `revoke from public` alone
-- does not close it — see 20260804193216. This function reads the whole services
-- directory including rows RLS hides from anon, so it is service_role only.
REVOKE ALL ON FUNCTION public.trust_service_geo() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trust_service_geo() TO service_role;
