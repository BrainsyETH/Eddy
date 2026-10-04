/** The forecast must open at the point queried for this outlook, never the phone. */
export function weatherDestination(coords?: { lat: number; lng: number } | null) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)
    || Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180 || (coords.lat === 0 && coords.lng === 0)) return null;
  return { pathname: '/weather' as const, params: { lat: String(coords.lat), lng: String(coords.lng) } };
}
