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

export function observedStamp(timestamp: string | null | undefined, timeZone?: string | null): string | null {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  try {
    return chartStamp(timestamp, timeZone || deviceZone());
  } catch {
    // An unknown zone name from the server: the phone's own, still labelled.
    return chartStamp(timestamp, deviceZone());
  }
}
