import { hazardTypeLabel } from '@eddy/hazards';
import { indexRoute, mapFeatures, viewSession, STALE_POSITION_MS, type FloatSession, type FloatMapFeatures } from './floatSession';
import { validCoordinate } from './floatRawFix';
import { HAZARD_KINDS, type HazardReport } from './hazardReportQueue';
import type { LngLat } from '@eddy/geo';

export function essentialsPosition(session: FloatSession, now: number) {
  const latest = session.lastFix;
  if (!latest || !validCoordinate(latest.lngLat) || !Number.isFinite(latest.at) || latest.at > now) return null;
  const precise = session.gpsPosition;
  // Preserve every raw fix. Sharing alone may prefer a recent, much tighter GPS fix.
  // gpsPosition is also raw GPS, never the snapped session.position.
  const preferPrecise = latest.accuracyMeters != null && latest.accuracyMeters > 500 && precise != null &&
    validCoordinate(precise.lngLat) && Number.isFinite(precise.at) && precise.at >= session.startedAt &&
    precise.at < latest.at && now - precise.at <= STALE_POSITION_MS &&
    precise.accuracyMeters != null && Number.isFinite(precise.accuracyMeters) &&
    precise.accuracyMeters >= 0 && precise.accuracyMeters <= 75 && latest.accuracyMeters >= precise.accuracyMeters * 10;
  const fix = preferPrecise ? { ...precise, accuracyMeters: precise.accuracyMeters! } : latest;
  return { ...fix, stale: preferPrecise || fix.restored === true || now - fix.at > STALE_POSITION_MS };
}
export const coordinateText = (point: LngLat) => `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`;
export const locationLink = (point: LngLat, name: string) =>
  `https://maps.apple.com/?ll=${point[1].toFixed(5)},${point[0].toFixed(5)}&q=${encodeURIComponent(name)}`;
export function locationMessage(session: FloatSession, now: number, timeLabel: (at: number) => string): string | null {
  const fix = essentialsPosition(session, now);
  if (!fix) return null;
  const accuracy = fix.accuracyMeters == null ? 'accuracy unavailable' : `±${Math.ceil(fix.accuracyMeters)} m`;
  return `${session.route.riverName} — ${fix.stale ? 'Last known' : 'Current'} location
${timeLabel(fix.at)}
${coordinateText(fix.lngLat)} (${accuracy})
${locationLink(fix.lngLat, 'My location')}`;
}
export interface AheadItem { id: string; name: string; detail: string; mile: number; distance: number | null; point: LngLat; reportedAt?: string }
/** Both positioned and unpositioned lists must be scoped to this float. */
export function currentFloatReports(session: FloatSession, reports: readonly HazardReport[]) {
  return reports.filter(report => report.riverSlug === session.route.riverSlug && report.status !== 'refused' &&
    Number.isFinite(Date.parse(report.capturedAt)) && Date.parse(report.capturedAt) >= session.startedAt);
}
export function essentialsRouteFeatures(route: FloatSession['route'], startMile: number | null, putIn: FloatSession['putIn'], takeOut: FloatSession['takeOut']): FloatMapFeatures | null {
  const built = indexRoute(route);
  return built.ok ? mapFeatures({ route, startMile, putIn, takeOut }, built.index) : null;
}
export function aheadItems(session: FloatSession, reports: readonly HazardReport[], now: number,
  features = essentialsRouteFeatures(session.route, session.startMile, session.putIn, session.takeOut)) {
  const view = viewSession(session, now);
  const sample = session.samples[session.samples.length - 1];
  const basis = sample ? { mile: sample.riverMile, at: sample.timestamp, stale: !view.confirmed || view.status !== 'live' } : null;
  const rows: AheadItem[] = [
    ...(features?.stops ?? []).filter(a => a.id !== session.takeOut.id).map(a => ({ id: `access:${a.id}`, name: a.name, detail: 'Mapped access', mile: a.riverMile, point: a.lngLat, distance: null })),
    ...(features?.hazards ?? []).map(h => ({ id: `hazard:${h.id}`, name: h.name,
      detail: `${hazardTypeLabel(h.type)}${h.portageRequired ? ` · Portage${h.portageSide && h.portageSide !== 'either' ? ` river ${h.portageSide}` : ''}` : ''}`,
      mile: h.riverMile, point: h.lngLat, distance: null })),
    ...currentFloatReports(session, reports).filter(h => h.riverMile != null && Number.isFinite(h.riverMile) && validCoordinate([h.longitude, h.latitude]))
      .map(h => ({ id: `report:${h.id}`, name: HAZARD_KINDS.find(k => k.id === h.kind)?.label ?? 'Hazard',
        detail: `Your report · ${h.status === 'waiting' ? 'Pending upload' : 'Under review'}${h.note ? ` · ${h.note}` : ''}`,
        mile: h.riverMile!, point: [h.longitude, h.latitude] as LngLat, distance: null, reportedAt: h.capturedAt })),
  ];
  return { basis, items: rows.filter(a => a.mile <= session.takeOut.riverMile && a.mile >= (basis?.mile ?? session.startMile ?? session.putIn?.riverMile ?? 0))
    .sort((a, b) => a.mile - b.mile || a.id.localeCompare(b.id))
    .map(a => ({ ...a, distance: basis ? Math.max(0, a.mile - basis.mile) : null })) };
}
