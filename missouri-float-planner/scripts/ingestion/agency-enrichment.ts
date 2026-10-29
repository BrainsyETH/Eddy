/**
 * Researched facts for the agency GIS candidates, compiled into one guarded SQL
 * transaction. Research and the reviewer's decisions live in one JSON file; the
 * SQL is reproducible from it and refuses to run against a row that changed.
 */
import { isLaunchRole } from '../../src/lib/access-points/launch-roles';

const KINDS = ['access', 'bridge', 'boat_ramp', 'park', 'campground', 'gravel_bar'] as const;
const AMENITIES = ['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic', 'store'];
const PARKING_CAPACITY = ['5', '10', '15', '20', '25', '30', '50+', 'roadside', 'limited', 'unknown'];
const ROAD_SURFACE = ['paved', 'gravel_maintained', 'gravel_unmaintained', 'dirt', 'seasonal', '4wd_required'];
// access_points_managing_agency_check. AGFC is not in it; ownership keeps the operator.
const AGENCIES = ['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private'];
const OPEN_LICENSES = /^(Public domain|CC0 1\.0|CC BY(-SA)? [1-4]\.0)$/;

export interface EnrichmentImage {
  kind: 'mdc_og' | 'agency_page' | 'open_license';
  url: string; title: string; altText: string; caption: string; credit: string;
  sourceUrl: string; license: string | null; licenseUrl: string | null;
}

export interface EnrichmentSite {
  id: string;
  slug: string;
  /** The stored name the research was done against; a changed row is refused. */
  current_name: string;
  name: string;
  kind: (typeof KINDS)[number];
  roles: (typeof KINDS)[number][];
  description: string | null;
  facilities: string | null;
  amenities: string[];
  parking_info: string | null;
  parking_capacity: string | null;
  road_access: string | null;
  road_surface: string[];
  /** null = not established. Stored as false with fee_notes saying so. */
  fee_required: boolean | null;
  fee_notes: string | null;
  local_tips: string | null;
  official_site_url: string | null;
  ownership: string | null;
  managing_agency: string | null;
  /** Reviewed launch pin, when the agency point is not at the water. */
  pin: { lat: number; lon: number } | null;
  /**
   * Stored mile on the river's existing mile system. Some rivers' approved rows use
   * guidebook miles offset from the geometry, so a geometry mile would misstate every
   * trip to a neighbour. null = the geometry mile is already consistent there.
   */
  river_mile: { value: number; basis: string } | null;
  images: EnrichmentImage[];
  field_sources: Record<string, string[]>;
  /** Human decisions. Absent until a reviewer records them; never inferred. */
  decision?: { approve: boolean; is_float_endpoint: boolean; reviewed_by: string; note?: string };
}

function httpsUrl(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}: missing URL`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label}: unsafe URL`);
  return value;
}

function subset(values: unknown, allowed: string[], label: string) {
  if (!Array.isArray(values) || values.some((v) => !allowed.includes(v))) throw new Error(`${label}: outside vocabulary`);
}

export function validateEnrichment(sites: EnrichmentSite[]): EnrichmentSite[] {
  const ids = new Set<string>();
  for (const s of sites) {
    const label = s.slug ?? s.id;
    if (!/^[0-9a-f-]{36}$/.test(s.id) || ids.has(s.id)) throw new Error(`${label}: invalid or duplicate id`);
    ids.add(s.id);
    if (!s.name?.trim() || !s.current_name?.trim()) throw new Error(`${label}: missing name`);
    if (!KINDS.includes(s.kind)) throw new Error(`${label}: invalid kind`);
    subset(s.roles, [...KINDS], `${label} roles`);
    if (!s.roles.length) throw new Error(`${label}: roles must not be empty`);
    subset(s.amenities, AMENITIES, `${label} amenities`);
    subset(s.road_surface, ROAD_SURFACE, `${label} road_surface`);
    if (s.parking_capacity != null && !PARKING_CAPACITY.includes(s.parking_capacity)) throw new Error(`${label}: parking_capacity`);
    if (s.managing_agency != null && !AGENCIES.includes(s.managing_agency)) throw new Error(`${label}: managing_agency`);
    if (s.official_site_url != null) httpsUrl(s.official_site_url, `${label} official_site_url`);
    if (s.official_site_url?.includes('/arcgis/rest/')) throw new Error(`${label}: GIS API link is not an official site`);
    if (s.fee_required == null && !s.fee_notes) throw new Error(`${label}: unknown fee status needs a fee note`);
    if (s.pin && (!Number.isFinite(s.pin.lat) || !Number.isFinite(s.pin.lon) ||
      Math.abs(s.pin.lat - 37) > 3 || Math.abs(s.pin.lon + 92) > 4)) throw new Error(`${label}: pin outside the Ozarks`);
    if (s.river_mile && (!Number.isFinite(s.river_mile.value) || s.river_mile.value < 0 || !s.river_mile.basis?.trim())) {
      throw new Error(`${label}: river_mile needs a value and its basis`);
    }
    for (const field of ['description', 'parking_info', 'road_access'] as const) {
      if (s[field] != null && !s.field_sources?.[field]?.length) throw new Error(`${label}: ${field} has no source`);
    }
    for (const image of s.images) {
      httpsUrl(image.url, `${label} image`);
      httpsUrl(image.sourceUrl, `${label} image source`);
      if (!image.credit?.trim() || !image.altText?.trim()) throw new Error(`${label}: image needs credit and alt text`);
      if (image.kind === 'mdc_og' && new URL(image.url).hostname !== 'mdc.mo.gov') throw new Error(`${label}: mdc_og must be an mdc.mo.gov image`);
      if (image.kind === 'open_license') {
        if (!image.license || !OPEN_LICENSES.test(image.license)) throw new Error(`${label}: not an open license: ${image.license}`);
        httpsUrl(image.licenseUrl, `${label} license`);
      }
    }
    if (s.decision) {
      if (typeof s.decision.approve !== 'boolean' || typeof s.decision.is_float_endpoint !== 'boolean' ||
        !s.decision.reviewed_by?.trim()) throw new Error(`${label}: incomplete decision`);
      if (s.decision.is_float_endpoint && !s.roles.some(isLaunchRole)) throw new Error(`${label}: endpoint without a launch role`);
      if (s.decision.is_float_endpoint && !s.decision.approve) throw new Error(`${label}: endpoint must be approved`);
    }
  }
  return sites;
}

/** Agency page photo first (it shows the place), then openly licensed photos. */
export function imageUrlsOf(site: EnrichmentSite): string[] {
  const order = { mdc_og: 0, agency_page: 1, open_license: 2 } as const;
  return [...new Set([...site.images].sort((a, b) => order[a.kind] - order[b.kind]).map((i) => i.url))];
}

/** Openly licensed photos also enter the reviewed catalog, which feeds /photo-credits. */
export function reviewedPhotoEntries(sites: EnrichmentSite[]) {
  return sites.flatMap((s) => s.images.filter((i) => i.kind === 'open_license').map((i) => ({
    table: 'access_points' as const, id: s.id, name: s.name,
    image: { url: i.url, title: i.title, altText: i.altText, caption: i.caption, credit: i.credit,
      sourceUrl: i.sourceUrl, license: i.license!, licenseUrl: i.licenseUrl! },
  })));
}

export function enrichmentRows(sites: EnrichmentSite[]) {
  return validateEnrichment(sites).map((s) => ({
    id: s.id, slug: s.slug, current_name: s.current_name, name: s.name, type: s.kind, types: s.roles,
    description: s.description, facilities: s.facilities, amenities: s.amenities,
    parking_info: s.parking_info, parking_capacity: s.parking_capacity, road_access: s.road_access,
    road_surface: s.road_surface, fee_required: s.fee_required ?? false, fee_notes: s.fee_notes,
    local_tips: s.local_tips, official_site_url: s.official_site_url, ownership: s.ownership,
    managing_agency: s.managing_agency, image_urls: imageUrlsOf(s),
    pin_lat: s.pin?.lat ?? null, pin_lon: s.pin?.lon ?? null, river_mile: s.river_mile?.value ?? null,
    approve: s.decision?.approve ?? null, is_float_endpoint: s.decision?.is_float_endpoint ?? null,
  }));
}

export function enrichmentSql(sites: EnrichmentSite[]): string {
  const json = JSON.stringify(enrichmentRows(sites));
  if (json.includes('$rows$')) throw new Error('Delimiter collision');
  return `-- Generated by scripts/ingestion/build-agency-enrichment-sql.ts. Do not edit by hand.
-- Updates only the listed candidate rows. Refuses a row whose identity changed or that
-- was approved outside this record. Approval is written only from recorded decisions.
BEGIN;
SET LOCAL search_path = public, extensions, pg_temp;
DO $apply$
DECLARE
  v jsonb; v_ap public.access_points%ROWTYPE; v_river public.rivers%ROWTYPE;
  v_loc geometry; v_mile numeric; v_distance numeric;
BEGIN
  FOR v IN SELECT * FROM jsonb_array_elements($rows$${json}$rows$::jsonb) LOOP
    SELECT * INTO STRICT v_ap FROM public.access_points WHERE id = (v->>'id')::uuid FOR UPDATE;
    IF v_ap.slug <> v->>'slug' OR v_ap.name NOT IN (v->>'current_name', v->>'name') THEN
      RAISE EXCEPTION 'Identity changed; research again: %', v->>'slug';
    END IF;
    IF v_ap.approved AND (v->>'approve') IS NULL THEN
      RAISE EXCEPTION 'Approved outside this record: %', v->>'slug';
    END IF;
    SELECT * INTO STRICT v_river FROM public.rivers WHERE id = v_ap.river_id;
    v_loc := v_ap.location_orig;
    IF v->>'pin_lat' IS NOT NULL THEN
      v_loc := ST_SetSRID(ST_MakePoint((v->>'pin_lon')::float8, (v->>'pin_lat')::float8), 4326);
    END IF;
    SELECT river_mile, distance_from_original_meters INTO STRICT v_mile, v_distance
      FROM public.snap_to_river(v_loc, v_river.id);
    IF v_mile IS NULL OR v_distance > 250 THEN
      RAISE EXCEPTION 'Invalid or distant river snap: %', v->>'slug';
    END IF;
    v_mile := COALESCE((v->>'river_mile')::numeric, v_mile);
    UPDATE public.access_points SET
      name = v->>'name', type = v->>'type',
      types = ARRAY(SELECT jsonb_array_elements_text(v->'types')),
      description = v->>'description', facilities = v->>'facilities',
      amenities = ARRAY(SELECT jsonb_array_elements_text(v->'amenities')),
      parking_info = v->>'parking_info', parking_capacity = v->>'parking_capacity',
      road_access = v->>'road_access',
      road_surface = ARRAY(SELECT jsonb_array_elements_text(v->'road_surface')),
      fee_required = (v->>'fee_required')::boolean, fee_notes = v->>'fee_notes',
      local_tips = v->>'local_tips', official_site_url = v->>'official_site_url',
      ownership = v->>'ownership', managing_agency = v->>'managing_agency',
      image_urls = ARRAY(SELECT jsonb_array_elements_text(v->'image_urls')),
      location_orig = v_loc, river_mile_downstream = v_mile,
      river_mile_upstream = GREATEST(v_river.length_miles - v_mile, 0),
      approved = COALESCE((v->>'approve')::boolean, v_ap.approved),
      approved_at = CASE WHEN (v->>'approve')::boolean AND NOT COALESCE(v_ap.approved, false) THEN now()
                         WHEN (v->>'approve')::boolean IS FALSE THEN NULL ELSE v_ap.approved_at END,
      is_float_endpoint = COALESCE((v->>'is_float_endpoint')::boolean, v_ap.is_float_endpoint),
      updated_at = now()
    WHERE id = v_ap.id;
  END LOOP;
END
$apply$;
COMMIT;
`;
}
