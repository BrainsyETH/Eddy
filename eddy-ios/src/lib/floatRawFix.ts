import type { LngLat, PositionFix } from '@eddy/geo';

export interface RawFloatFix { lngLat: LngLat; at: number; accuracyMeters: number | null; restored?: true }
export function validCoordinate(point: unknown): point is LngLat {
  return Array.isArray(point) && point.length === 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}
export function restoreRawFix(value: unknown, startedAt: number): RawFloatFix | null {
  if (!value || typeof value !== 'object') return null;
  const fix = value as Partial<RawFloatFix>;
  if (!validCoordinate(fix.lngLat) || !Number.isFinite(fix.at) || fix.at! < startedAt) return null;
  return { lngLat: fix.lngLat, at: fix.at!, accuracyMeters:
    typeof fix.accuracyMeters === 'number' && Number.isFinite(fix.accuracyMeters) && fix.accuracyMeters >= 0
      ? fix.accuracyMeters : null, restored: true };
}
export function latestRawFix(previous: RawFloatFix | null, fix: PositionFix, startedAt: number, now: number): RawFloatFix | null {
  if (!validCoordinate(fix.lngLat) || !Number.isFinite(fix.timestamp) || fix.timestamp < startedAt ||
    fix.timestamp > now || (previous && fix.timestamp <= previous.at)) return previous;
  return { lngLat: fix.lngLat, at: fix.timestamp, accuracyMeters:
    fix.accuracyMeters != null && Number.isFinite(fix.accuracyMeters) && fix.accuracyMeters >= 0 ? fix.accuracyMeters : null };
}
