import { boundsForLine, type LngLat } from '@eddy/geo';
import { STALE_POSITION_MS, type FloatSession } from './floatSession';
import type { ActivityAvailability } from './floatActivity';

/** Display uses the recorder's GPS stream, never a second location subscription. */
export function floatDisplayPosition(session: FloatSession, now: number) {
  const fix = session.gpsPosition ?? session.position;
  if (!fix) return null;
  const awaiting = session.gpsPosition ? session.gpsPosition.restored === true : session.awaitingFix === true;
  return { ...fix, dimmed: awaiting || now - fix.at > STALE_POSITION_MS };
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
