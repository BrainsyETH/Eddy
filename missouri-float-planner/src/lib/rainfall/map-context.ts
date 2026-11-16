import type { SupabaseClient } from '@supabase/supabase-js';
import { booleanPointInPolygon, point, simplify, feature } from '@turf/turf';
import type { Feature, MultiPolygon, LineString, MultiLineString } from 'geojson';
import { normalizeRainMapContext } from '@shared/rainfall-map';
import type { RainMapContext } from '@shared/rainfall';

/** Context comes from Eddy's existing river/access inventory, never inferred
 * from a basin outline. Only approved places inside this watershed are included. */
export async function rainMapContext(db: SupabaseClient, slug: string, boundary: Feature<MultiPolygon>): Promise<RainMapContext> {
  const { data: river, error } = await db.from('rivers').select('id,name').eq('slug', slug).single();
  if (error || !river) throw new Error('Rain map river unavailable');
  const [shape, places] = await Promise.all([
    db.rpc('get_river_geometry_json', { p_slug: slug }),
    db.from('access_points').select('id,name,location_orig,location_snap').eq('river_id', river.id).eq('approved', true).order('river_mile_downstream').order('id').limit(101),
  ]);
  if (shape.error || !shape.data || places.error || !places.data || places.data.length > 100) throw new Error('Rain map context unavailable');
  const raw = (typeof shape.data === 'string' ? JSON.parse(shape.data) : shape.data) as LineString | MultiLineString;
  if (!['LineString', 'MultiLineString'].includes(raw.type)) throw new Error('Invalid river line');
  const geometry = simplify(feature(raw), { tolerance: 0.0002, highQuality: true }).geometry;
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const context = { river: { name: river.name, lines }, places: places.data.flatMap(place => {
    const original = place.location_orig as { coordinates?: number[] } | null;
    const snapped = place.location_snap as { coordinates?: number[] } | null;
    const coordinates = original?.coordinates ?? snapped?.coordinates;
    return coordinates?.length === 2 && coordinates.every(Number.isFinite) && booleanPointInPolygon(point(coordinates), boundary)
      ? [{ name: place.name, coordinates: coordinates as [number, number] }] : [];
  }) };
  const valid = normalizeRainMapContext(context);
  if (!valid) throw new Error('Invalid rain map context');
  return valid;
}
