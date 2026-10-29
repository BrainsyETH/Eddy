import { boundsForLine, MAX_ACCURACY_M, MIN_MOVING_MS, type LngLat } from '@eddy/geo';
import { floatAccount, formatDuration, STALE_POSITION_MS, type FloatSession } from './floatSession';
import type { ActivityAvailability } from './floatActivity';
import type { TrackerState } from './floatTrackerStatus';

/** The active-float entry must not promise healthy tracking from session existence alone. */
export function activeFloatStatus(session: FloatSession, tracker: TrackerState, now: number) {
  const position = floatDisplayPosition(session, now);
  const river = session.route.riverName;
  const blocked = tracker.servicesOff || tracker.denied || tracker.preciseOff || tracker.notInUse;
  const attention = blocked || tracker.status === 'failed' || tracker.status === 'unavailable';
  const weak = gpsQualityNote(session, now);
  const healthy = tracker.status === 'recording' && !attention && !!position && !position.dimmed && !weak;
  const label = attention ? `Tracking needs attention · ${river}`
    : weak ? `Finding you · ${river}`
    : healthy ? `Tracking on the ${river}`
    : position && !session.awaitingFix && !session.gpsPosition?.restored && tracker.status === 'recording' ? `Location delayed · ${river}`
    : `Finding GPS · ${river}`;
  return { label, healthy, at: position?.at ?? null };
}

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

/** The panel's clock: the recap's, and it also rests at the mapped river's end. */
function panelUntil(session: FloatSession, now: number): number {
  return session.arrivedAt == null && session.riverEndAt != null ? session.riverEndAt : floatAccount(session, now).until;
}

/**
 * Time on the water and distance from the recorded start, for the panel:
 * "1 hr 20 min on the water · 3.4 mi from start". Time stops at arrival
 * unless the paddler carries on past the take-out, like the recap
 * (floatAccount); distance is along the river from the first confirmed
 * position, null until there is one.
 */
export function progressLine(session: FloatSession, now: number): string | null {
  const latest = session.samples[session.samples.length - 1];
  const until = panelUntil(session, now);
  const minutes = Math.max(0, Math.round((until - session.startedAt) / 60_000));
  const time = minutes < 1 ? 'Just started' : `${formatDuration(minutes)} on the water`;
  const miles = latest && session.startMile != null ? Math.max(0, latest.riverMile - session.startMile) : null;
  return miles == null ? time : `${time} · ${miles.toFixed(1)} mi from start`;
}

/**
 * Moving time and speeds, the line under progressLine:
 * "1 hr 5 min moving at 3.0 mph · 2.6 mph overall".
 *
 * Moving time and speed are the recap's (river miles over moving time, with
 * breaks of STAY_MIN_MS or more and GPS gaps left out), so a break never
 * lowers them. Overall is the line above divided out (miles from start over
 * time on the water), so the numbers on screen agree with each other: it
 * sinks slowly through a stop rather than reading zero. Moving time shows from
 * its first minute, the speeds after MIN_MOVING_MS of movement, and neither
 * speed after net travel upstream. Overall never reads above moving: river
 * covered across a GPS gap can push it there, and that would read as a bug.
 */
export function paceLine(session: FloatSession, now: number): string | null {
  const until = panelUntil(session, now);
  const totals = session.totals ? floatAccount(session, now).totals : undefined;
  const onWater = Math.max(0, until - session.startedAt);
  const movingMinutes = Math.min(Math.round((totals?.movingMs ?? 0) / 60_000), Math.round(onWater / 60_000));
  if (!totals || movingMinutes < 1) return null;
  const time = `${formatDuration(movingMinutes)} moving`;
  const mph = (miles: number, ms: number) => (miles > 0 && ms > 0 ? miles / (ms / 3_600_000) : null);
  const moving = totals.movingMs >= MIN_MOVING_MS ? mph(totals.movingMiles, totals.movingMs) : null;
  if (moving == null) return time;
  const latest = session.samples[session.samples.length - 1];
  const overall = latest && session.startMile != null ? mph(latest.riverMile - session.startMile, onWater) : null;
  return overall == null
    ? `${time} at ${moving.toFixed(1)} mph`
    : `${time} at ${moving.toFixed(1)} mph · ${Math.min(overall, moving).toFixed(1)} mph overall`;
}

/**
 * What VoiceOver should hear for a stats caption: the separator as a pause
 * and units as words, since "·" and "mph" read differently by setting.
 */
export function spokenStats(text: string): string {
  return text
    .replace(/ · /g, ', ')
    .replace(/\bmph\b/g, 'miles per hour')
    .replace(/\bmi\b/g, 'miles');
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
    case 'active': return 'Progress on your Lock Screen';
    case 'disabled': return 'Lock Screen progress is off';
    case 'error': return 'Couldn’t update the Lock Screen';
    case 'expired': return 'Lock Screen progress ended · show it again';
    case 'idle':
    case 'dismissed': return 'Show progress on your Lock Screen';
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
  if (syncing) return { label: 'Backing up…', retry: false };
  if (error) return { label: 'Couldn’t back up · Saved on this phone', retry: true };
  return { label: 'Saved on this phone · Not backed up yet', retry: false };
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
