// Pure logic for the admin Hazards tool: validating a create/update body,
// how long since a hazard was last confirmed, and estimating a river mile from
// the river's own access points.
import { metresBetween } from '@/lib/geo/mile-index';

export const HAZARD_TYPES = [
  'low_water_dam',
  'portage',
  'strainer',
  'rapid',
  'private_property',
  'waterfall',
  'shoal',
  'bridge_piling',
  'other',
] as const;
export const HAZARD_SEVERITIES = ['info', 'caution', 'warning', 'danger'] as const;
export const PORTAGE_SIDES = ['left', 'right', 'either'] as const;

/** Matches the dashboard's "active hazards not updated in 30 days" check. */
export const HAZARD_STALE_DAYS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HazardWrite = {
  name?: string;
  river_id?: string;
  type?: string;
  severity?: string | null;
  description?: string | null;
  portage_required?: boolean;
  portage_side?: string | null;
  active?: boolean;
  seasonal_notes?: string | null;
  river_mile_downstream?: number | null;
  min_safe_level?: number | null;
  max_safe_level?: number | null;
  location?: string;
};

const textOrNull = (v: unknown, max: number): string | null | undefined => {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > max ? undefined : t || null;
};

const numberOrNull = (v: unknown): number | null | undefined => {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Validate a hazard body. `create` requires name, river, type and a location;
 * an update validates only the fields present. Returns database columns.
 */
export function parseHazardBody(
  body: unknown,
  mode: 'create' | 'update',
): { write: HazardWrite } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const write: HazardWrite = {};
  const has = (k: string) => b[k] !== undefined;

  if (has('name') || mode === 'create') {
    if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'Name is required' };
    if (b.name.trim().length > 200) return { error: 'Name is too long' };
    write.name = b.name.trim();
  }
  if (has('riverId') || mode === 'create') {
    // Every public reader looks hazards up by river, so one without a river is never shown.
    if (typeof b.riverId !== 'string' || !UUID.test(b.riverId)) return { error: 'Choose a river' };
    write.river_id = b.riverId;
  }
  if (has('type') || mode === 'create') {
    if (!(HAZARD_TYPES as readonly unknown[]).includes(b.type)) return { error: 'Choose a hazard type' };
    write.type = b.type as string;
  }
  if (has('severity')) {
    if (b.severity !== null && !(HAZARD_SEVERITIES as readonly unknown[]).includes(b.severity))
      return { error: 'Choose a severity' };
    write.severity = b.severity as string | null;
  }
  if (has('description')) {
    const v = textOrNull(b.description, 4000);
    if (v === undefined) return { error: 'Description must be text (max 4,000 characters)' };
    write.description = v;
  }
  if (has('seasonalNotes')) {
    const v = textOrNull(b.seasonalNotes, 2000);
    if (v === undefined) return { error: 'Seasonal notes must be text (max 2,000 characters)' };
    write.seasonal_notes = v;
  }
  if (has('portageRequired')) {
    if (typeof b.portageRequired !== 'boolean') return { error: 'Portage required must be yes or no' };
    write.portage_required = b.portageRequired;
  }
  if (has('portageSide')) {
    const side = b.portageSide === '' ? null : b.portageSide;
    if (side !== null && !(PORTAGE_SIDES as readonly unknown[]).includes(side))
      return { error: 'Portage side must be left, right or either' };
    write.portage_side = side as string | null;
  }
  if (has('active')) {
    if (typeof b.active !== 'boolean') return { error: 'Active must be yes or no' };
    write.active = b.active;
  }
  if (has('riverMileDownstream')) {
    const v = numberOrNull(b.riverMileDownstream);
    if (v === undefined || (v !== null && (v < 0 || v > 2000))) return { error: 'River mile must be a number from 0 to 2,000' };
    write.river_mile_downstream = v;
  }
  for (const [key, column] of [
    ['minSafeLevel', 'min_safe_level'],
    ['maxSafeLevel', 'max_safe_level'],
  ] as const) {
    if (!has(key)) continue;
    const v = numberOrNull(b[key]);
    if (v === undefined) return { error: 'Safe levels must be numbers' };
    write[column] = v;
  }
  if (has('latitude') || has('longitude') || mode === 'create') {
    const lat = numberOrNull(b.latitude);
    const lng = numberOrNull(b.longitude);
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      return { error: 'A valid latitude and longitude are required' };
    write.location = `SRID=4326;POINT(${lng} ${lat})`;
  }
  return { write };
}

/** Whole days since a timestamp; null when it can't be read. */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86400000));
}

export function ageLabel(days: number | null): string {
  if (days === null) return 'Never checked';
  if (days === 0) return 'Checked today';
  if (days === 1) return 'Checked yesterday';
  if (days < 60) return `Checked ${days} days ago`;
  if (days < 730) return `Checked ${Math.round(days / 30)} months ago`;
  return `Checked ${Math.round(days / 365)} years ago`;
}

export interface MileControlPoint {
  name: string;
  mile: number;
  lat: number;
  lng: number;
}

export interface MileEstimate {
  /** On the river's own mile numbering, to one decimal. */
  mile: number;
  /** The two access points it was interpolated between, upstream first. */
  between: [MileControlPoint, MileControlPoint];
  /** How far the location sits from the straight line between them. */
  offLineMetres: number;
}

/** Beyond this the nearest pair of access points says little about the spot. */
const MAX_OFF_LINE_METRES = 8000;

/**
 * Estimate a river mile for a location by interpolating between the river's
 * access points.
 *
 * Stored miles are not always geometric: several rivers carry a published mile
 * index that differs from the map line by miles (src/lib/geo/mile-index.ts).
 * Access points carry whichever numbering their river uses, so interpolating
 * between neighbours keeps a hazard on the same numbering as the put-ins and
 * take-outs a trip plan compares it with. The straight line between two access
 * points only approximates the channel, so this is an estimate for a person to
 * check, never written without review.
 */
export function estimateRiverMile(
  point: { lat: number; lng: number },
  controls: readonly MileControlPoint[],
): MileEstimate | null {
  const sorted = controls
    .filter((c) => [c.mile, c.lat, c.lng].every(Number.isFinite))
    .sort((a, b) => a.mile - b.mile);
  let best: MileEstimate | null = null;
  // Local flat projection around the point: fine over the few miles involved.
  const kx = Math.cos((point.lat * Math.PI) / 180);
  const xy = (p: { lat: number; lng: number }) => [(p.lng - point.lng) * kx, p.lat - point.lat] as const;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.mile === b.mile) continue;
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    if (len2 === 0) continue;
    const t = Math.min(1, Math.max(0, (-ax * (bx - ax) + -ay * (by - ay)) / len2));
    const foot = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    const offLineMetres = metresBetween([point.lng, point.lat], [foot.lng, foot.lat]);
    if (!best || offLineMetres < best.offLineMetres) {
      best = {
        mile: Math.round((a.mile + t * (b.mile - a.mile)) * 10) / 10,
        between: [a, b],
        offLineMetres: Math.round(offLineMetres),
      };
    }
  }
  return best && best.offLineMetres <= MAX_OFF_LINE_METRES ? best : null;
}
