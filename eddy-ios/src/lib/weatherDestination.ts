/** The forecast must open at the point queried for this outlook, never the phone. */
export function weatherDestination(coords?: { lat: number; lng: number } | null, nwsLid?: string | null) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)
    || Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180 || (coords.lat === 0 && coords.lng === 0)) return null;
  return { pathname: '/weather' as const, params: {
    lat: String(coords.lat), lng: String(coords.lng),
    ...(nwsRiverForecastUrl(nwsLid) ? { nwsLid: nwsLid!.trim().toLowerCase() } : {}),
  } };
}

/** Only a known NWS station can supply a river-forecast destination. */
export function nwsRiverForecastUrl(lid?: string | string[] | null): string | null {
  if (typeof lid !== 'string' || !/^[a-z0-9]{5}$/i.test(lid.trim())) return null;
  return `https://water.noaa.gov/gauges/${lid.trim().toLowerCase()}`;
}
