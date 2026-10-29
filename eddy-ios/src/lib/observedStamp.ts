// eddy-ios/src/lib/observedStamp.ts
// When a reading was observed, with its time zone named.
//
// The gauge chart draws in the STATION's time (README "Expanded gauge
// charts"), and the "Observed" row beside it printed the phone's local time
// with no zone: a paddler from California saw the chart's latest point and the
// observation two hours apart for the same reading. Naming the zone makes
// either clock an honest statement; using the station's, when known, makes
// the two agree. An unparseable timestamp is no time at all, never
// "Invalid Date".

import { chartStamp } from '@eddy/conditions/chart-calendar';

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The zone a gauge chart draws in: the station's when the history response
 * names it, otherwise the phone's, as builds before the station calendar did.
 * A response without `timeZone` (an older deploy, or a station whose zone the
 * server could not look up) is not a statement that the station keeps UTC;
 * labelling a Missouri gauge's 9 PM reading "2 AM" was the regression. Only a
 * zone actually named UTC draws, and says, UTC.
 */
export function historyTimeZone(zone?: string | null): string {
  return zone || deviceZone();
}

export function observedStamp(timestamp: string | null | undefined, timeZone?: string | null): string | null {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  try {
    return chartStamp(timestamp, timeZone || deviceZone());
  } catch {
    // An unknown zone name from the server: the phone's own, still labelled.
    return chartStamp(timestamp, deviceZone());
  }
}
