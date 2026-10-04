-- validate_river_data() uses PostGIS types/functions from the extensions schema.
-- Include it in the caller's fixed path so nested validation can resolve them.
ALTER FUNCTION public.review_river_activation(text[], jsonb, boolean)
  SET search_path = public, extensions, pg_temp;
