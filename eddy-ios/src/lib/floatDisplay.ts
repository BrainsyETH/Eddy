import { boundsForLine, MAX_ACCURACY_M, type LngLat } from '@eddy/geo';
import { formatDuration, STALE_POSITION_MS, type FloatSession } from './floatSession';
import type { ActivityAvailability } from './floatActivity';

/** Display uses the recorder's GPS stream, never a second location subscription. */
export function floatDisplayPosition(session: FloatSession, now: number): {
  lngLat: LngLat; at: number; accuracyMeters: number | null; course: number | null; dimmed: boolean;
} | null {
  const fix = session.gpsPosition ?? session.position;
  if (!fix) return null;
  const awaiting = session.gpsPosition ? session.gpsPosition.restored === true : session.awaitingFix === true;
  const raw = session.gpsPosition;
  return {
    lngLat: fix.lngLat,
    at: fix.at,
    accuracyMeters: raw?.accuracyMeters ?? null,
    course: raw?.course ?? null,
    dimmed: awaiting || now - fix.at > STALE_POSITION_MS,
  };
}

/**
 * GPS is delivering, but too coarsely to place the paddler on the river: the
 * latest raw fix is fresh, newer than the last fix the tracker accepted, and
 * outside the tracker's accuracy limit. Under a bluff or tree canopy this is
 * the common case, and it is not "waiting for GPS".
 */
export function gpsQualityNote(session: FloatSession, now: number): { accuracyMeters: number } | null {
  const raw = session.lastFix;
  if (!raw || raw.restored || raw.accuracyMeters == null) return null;
  if (now - raw.at > STALE_POSITION_MS) return null;
  if (raw.accuracyMeters <= MAX_ACCURACY_M) return null;
  if (session.track.lastFixAt != null && raw.at <= session.track.lastFixAt) return null;
  return { accuracyMeters: Math.ceil(raw.accuracyMeters) };
}

/**
 * Time on the water and distance from the recorded start, for the panel:
 * "1 hr 20 min on the water · 3.4 mi from start". Time stops at arrival,
 * like the recap; distance is along the river from the first confirmed
 * position, null until there is one.
 */
export function progressLine(session: FloatSession, now: number): string | null {
  const latest = session.samples[session.samples.length - 1];
  const until = session.arrivedAt ?? session.riverEndAt ?? now;
  const minutes = Math.max(0, Math.round((until - session.startedAt) / 60_000));
  const time = minutes < 1 ? 'Just started' : `${formatDuration(minutes)} on the water`;
  const miles = latest && session.startMile != null ? Math.max(0, latest.riverMile - session.startMile) : null;
  return miles == null ? time : `${time} · ${miles.toFixed(1)} mi from start`;
}

export function fixAgeLabel(at: number | null, now: number): string {
  if (at == null) return 'Finding GPS…';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)} min ago`;
}

export function activityLabel(state: ActivityAvailability): string | null {
  switch (state) {
    case 'active': return 'Live Activity on your Lock Screen';
    case 'disabled': return 'Live Activity is off';
    case 'error': return 'Live Activity couldn’t update';
    case 'expired': return 'Live Activity expired · show it again';
    case 'idle':
    case 'dismissed': return 'Show progress with a Live Activity';
    default: return null;
  }
}

/** Include actual access coordinates; the mapped river can miss an off-river landing. */
export function floatRouteBounds(line: LngLat[], start: LngLat | null, takeOut: LngLat | null) {
  return boundsForLine([...line, ...(start ? [start] : []), ...(takeOut ? [takeOut] : [])]);
}

export function recapBackupStatus(owner: string | null, row: { dirty: boolean; backupError?: string }, syncing: boolean, error: string | null) {
  if (owner === 'guest' || owner == null) return { label: 'Saved on this phone', retry: false };
  if (row.backupError) return { label: 'Couldn’t back up · Saved on this phone', retry: true };
  if (!row.dirty) return { label: 'Backed up to your account', retry: false };
  if (syncing) return { label: 'Syncing to your account…', retry: false };
  if (error) return { label: 'Couldn’t sync · Saved on this phone', retry: true };
  return { label: 'Saved on this phone · Waiting to sync', retry: false };
}

/** Keep a useful scale when the user reaches the take-out or no end is set. */
export function floatOverviewBounds(position: LngLat, takeOut: LngLat | null) {
  const bounds = boundsForLine([position, ...(takeOut ? [takeOut] : [])])!;
  const centerLng = (bounds[0] + bounds[2]) / 2;
  const centerLat = (bounds[1] + bounds[3]) / 2;
  const lngSpan = Math.max(bounds[2] - bounds[0], 0.006);
  const latSpan = Math.max(bounds[3] - bounds[1], 0.006);
  return [centerLng - lngSpan / 2, centerLat - latSpan / 2, centerLng + lngSpan / 2, centerLat + latSpan / 2] as const;
}
