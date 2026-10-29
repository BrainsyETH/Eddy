-- Agency evidence is separate from curated/public places. A feed refresh must
-- never move an approved launch, change its roles, or publish a lake ramp.
CREATE TABLE public.agency_gis_features (
  provider text NOT NULL CHECK (provider IN ('mdc', 'agfc')),
  source_id text NOT NULL,
  source_object_id text NOT NULL,
  source_layer_url text NOT NULL,
  source_feature_url text NOT NULL,
  name text,
  source_type text NOT NULL,
  waterbody text,
  owner text,
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  source_verified_at timestamptz,
  fetched_at timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  attributes jsonb NOT NULL CHECK (jsonb_typeof(attributes) = 'object'),
  access_point_id uuid REFERENCES public.access_points(id) ON DELETE SET NULL,
  PRIMARY KEY (provider, source_id)
);

CREATE INDEX agency_gis_features_access_point_idx
  ON public.agency_gis_features(access_point_id) WHERE access_point_id IS NOT NULL;

ALTER TABLE public.agency_gis_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agency_gis_features FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_gis_features TO service_role;

COMMENT ON TABLE public.agency_gis_features IS
  'Internal MDC/AGFC source inventory. Unreviewed agency features are not public places or verified float endpoints. Refreshes preserve curated access points and explicit source-to-place links.';
COMMENT ON COLUMN public.agency_gis_features.source_verified_at IS
  'Verification date supplied by the agency, when available. fetched_at is retrieval time and must never be presented as field verification.';
COMMENT ON COLUMN public.agency_gis_features.source_id IS
  'AGFC GlobalID; MDC area ID plus source coordinate fingerprint because OBJECTID can change on republishing. Moved MDC points require a new explicit match.';
