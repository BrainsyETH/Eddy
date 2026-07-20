export const REPORT_CORRIDOR_MAX_DISTANCE_METERS = 2_000;

export interface NearestRiverRow {
  river_id: string;
  river_name?: string;
  distance_meters?: number;
}

export type NearestRiverLookup = (args: {
  p_lat: number;
  p_lng: number;
  p_max_distance_meters: number;
}) => Promise<{ data: unknown; error: unknown }>;

export type CorridorValidation =
  | { ok: true; distanceMeters: number | null }
  | { ok: false; reason: 'outside-corridor' | 'different-river' | 'unavailable' };

export function isValidEarthCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Confirms a report point is near the selected active river's stored geometry.
 * The lookup is injected so the rule is independently testable and the API
 * route can use the existing PostGIS `find_nearest_river` function.
 */
export async function validateReportCorridor(
  lookup: NearestRiverLookup,
  riverId: string,
  latitude: number,
  longitude: number
): Promise<CorridorValidation> {
  try {
    const { data, error } = await lookup({
      p_lat: latitude,
      p_lng: longitude,
      p_max_distance_meters: REPORT_CORRIDOR_MAX_DISTANCE_METERS,
    });

    if (error) return { ok: false, reason: 'unavailable' };
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, reason: 'outside-corridor' };
    }

    const nearest = data[0] as Partial<NearestRiverRow>;
    if (nearest.river_id !== riverId) {
      return { ok: false, reason: 'different-river' };
    }

    return {
      ok: true,
      distanceMeters:
        typeof nearest.distance_meters === 'number' && Number.isFinite(nearest.distance_meters)
          ? nearest.distance_meters
          : null,
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
