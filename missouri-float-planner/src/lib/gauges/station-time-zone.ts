import tzlookup from 'tz-lookup';

/** Catalog coordinates only; never guess a station zone from the viewer or state.
 * Missing/invalid coordinates explicitly use UTC. tz-lookup resolves geographic
 * boundaries locally, so sharing adds no timezone-service network dependency. */
export function stationTimeZone(lat: unknown, lng: unknown): string {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return 'UTC';
  try { return tzlookup(lat, lng); } catch { return 'UTC'; }
}
export function stationTimeZoneFromGeometry(geometry: unknown): string {
  if (geometry && typeof geometry === 'object' && 'type' in geometry && geometry.type === 'Point' && 'coordinates' in geometry
    && Array.isArray(geometry.coordinates)) return stationTimeZone(geometry.coordinates[1], geometry.coordinates[0]);
  if (typeof geometry !== 'string' || !/^[0-9a-f]+$/i.test(geometry) || geometry.length > 100) return 'UTC';
  try {
    const bytes = Buffer.from(geometry, 'hex');
    const little = bytes[0] === 1;
    if (bytes[0] !== 0 && !little) return 'UTC';
    const kind = little ? bytes.readUInt32LE(1) : bytes.readUInt32BE(1);
    if ((kind & 0x1fffffff) !== 1) return 'UTC';
    const offset = kind & 0x20000000 ? 9 : 5;
    if (offset === 9 && (little ? bytes.readUInt32LE(5) : bytes.readUInt32BE(5)) !== 4326) return 'UTC';
    const read = (at: number) => little ? bytes.readDoubleLE(at) : bytes.readDoubleBE(at);
    return stationTimeZone(read(offset + 8), read(offset));
  } catch { return 'UTC'; }
}
