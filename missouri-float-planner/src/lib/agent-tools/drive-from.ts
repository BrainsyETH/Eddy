import { trackedFetch } from '@/lib/telemetry/upstream';

export type DriveFrom = (
  origin: { lat: number; lng: number },
  destinations: Array<{ id: string; lat: number; lng: number }>,
  signal?: AbortSignal,
) => Promise<Map<string, number>>;

/** Road minutes from a rounded search origin to each put-in, in one Mapbox
 * Matrix request. Optional: a missing token, timeout or failure returns no
 * times, and the search never waits on it beyond a few seconds. The origin is
 * already rounded to two decimals; neither it nor the URL is logged. */
export const mapboxDriveFrom: DriveFrom = async (origin, destinations, signal) => {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  const unique = [...new Map(destinations.map(d => [d.id, d])).values()].slice(0, 24);
  if (!token || !unique.length) return new Map();
  const coordinates = [origin, ...unique].map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const url = new URL(`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}`);
  url.searchParams.set('sources', '0');
  url.searchParams.set('annotations', 'duration');
  url.searchParams.set('access_token', token);
  try {
    const response = await trackedFetch('mapbox', 'matrix', url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(4000)]),
    });
    if (!response.ok) return new Map();
    const body = (await response.json()) as { code?: string; durations?: Array<Array<number | null>> };
    const row = body.code === 'Ok' ? body.durations?.[0] : undefined;
    const minutes = new Map<string, number>();
    unique.forEach((destination, index) => {
      const seconds = row?.[index + 1];
      if (typeof seconds === 'number' && Number.isFinite(seconds)) minutes.set(destination.id, Math.max(1, Math.round(seconds / 60)));
    });
    return minutes;
  } catch {
    return new Map();
  }
};
