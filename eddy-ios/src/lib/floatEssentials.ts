import { hazardTypeLabel } from '@eddy/hazards';
import { indexRoute, mapFeatures, viewSession, STALE_POSITION_MS, type FloatSession, type FloatMapFeatures } from './floatSession';
import { validCoordinate } from './floatRawFix';
import { HAZARD_KINDS, type HazardReport } from './hazardReportQueue';
import type { LngLat } from '@eddy/geo';

/**
 * The time Float tools reads the session at. The display clock ticks every
 * five seconds while fixes land every second or so, so a fix is usually
 * newer than the last tick; read at the tick, essentialsPosition took it for
 * a future fix, returned null, and greyed Share location out until the next
 * tick. A fix the session accepted is itself proof of the time (applyFix
 * refuses future fixes at ingest), as River Mode's own clock already assumes.
 */
export function essentialsClock(session: FloatSession, now: number): number {
  return Math.max(now, session.lastFix?.at ?? 0, session.gpsPosition?.at ?? 0, session.last?.at ?? 0);
}

/**
 * How old the shared location is, in steps a person reads once: "just now"
 * for half a minute, then whole minutes. Second-by-second ages restyled the
 * section on every five-second tick for no decision anyone makes from them.
 */
export function locationAgeLabel(at: number, now: number): string {
  const seconds = Math.max(0, (now - at) / 1000);
  if (seconds < 30) return 'Updated just now';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `Updated ${minutes} min ago` : `Updated ${Math.floor(minutes / 60)} hr ${minutes % 60} min ago`;
}

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
export interface AheadItem {
  id: string;
  /** What the row is, for its thumbnail: a mapped access, a known hazard, or this phone's report. */
  kind: 'access' | 'hazard' | 'report';
  /** The access point's or hazard's own id, to look up its photo or type. */
  sourceId: string;
  /** A known hazard's type, so a dam wears the dam mark. */
  hazardType?: string;
  name: string;
  detail: string;
  mile: number;
  distance: number | null;
  point: LngLat;
  reportedAt?: string;
}

/**
 * The Eddy mark a row shows when it has no photo: a dam for a low-water dam,
 * the hazard mark for any other hazard or report. Accesses show their own
 * photo or place mark (PlanAccessPhoto), so this is null for them.
 */
export function aheadSymbol(item: Pick<AheadItem, 'kind' | 'hazardType'>): 'dam' | 'hazard' | null {
  if (item.kind === 'access') return null;
  return item.hazardType === 'low_water_dam' ? 'dam' : 'hazard';
}
/** A report's state in a list line: waiting on signal, with the reviewers, or given up on. */
export function reportStatusLabel(status: HazardReport['status']): string {
  switch (status) {
    case 'waiting': return 'Pending upload';
    case 'failed': return 'Not sent';
    case 'refused': return 'Not accepted';
    case 'sent': return 'Under review';
  }
}
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
    ...(features?.stops ?? []).filter(a => a.id !== session.takeOut.id).map((a): AheadItem => ({ id: `access:${a.id}`, kind: 'access', sourceId: a.id,
      name: a.name, detail: 'Mapped access', mile: a.riverMile, point: a.lngLat, distance: null })),
    ...(features?.hazards ?? []).map((h): AheadItem => ({ id: `hazard:${h.id}`, kind: 'hazard', sourceId: h.id, hazardType: h.type, name: h.name,
      detail: `${hazardTypeLabel(h.type)}${h.portageRequired ? ` · Portage${h.portageSide && h.portageSide !== 'either' ? ` river ${h.portageSide}` : ''}` : ''}`,
      mile: h.riverMile, point: h.lngLat, distance: null })),
    ...currentFloatReports(session, reports).filter(h => h.riverMile != null && Number.isFinite(h.riverMile) && validCoordinate([h.longitude, h.latitude]))
      .map((h): AheadItem => ({ id: `report:${h.id}`, kind: 'report', sourceId: h.id, name: HAZARD_KINDS.find(k => k.id === h.kind)?.label ?? 'Hazard',
        detail: `Your report · ${reportStatusLabel(h.status)}${h.note ? ` · ${h.note}` : ''}`,
        mile: h.riverMile!, point: [h.longitude, h.latitude] as LngLat, distance: null, reportedAt: h.capturedAt })),
  ];
  return { basis, items: rows.filter(a => a.mile <= session.takeOut.riverMile && a.mile >= (basis?.mile ?? session.startMile ?? session.putIn?.riverMile ?? 0))
    .sort((a, b) => a.mile - b.mile || a.id.localeCompare(b.id))
    .map(a => ({ ...a, distance: basis ? Math.max(0, a.mile - basis.mile) : null })) };
}
