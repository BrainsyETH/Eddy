// src/lib/social/holiday-weekends.ts
// Float-season holiday weekends — Memorial Day, July 4th, Labor Day. These are
// the three demand spikes of the Ozark float calendar, so the weekend forecast
// gets holiday branding (and a midweek early-call post) when one is close.
//
// Pure calendar math: a holiday's weekday is zone-independent once you know
// the local calendar date, so we resolve "today" in the scheduler zone and
// compare pure dates via Date.UTC.

import { getLocalParts } from './local-time';

interface HolidayDate {
  name: string;
  month: number; // 1-12
  day: number;
}

/** Last Monday of May. */
function memorialDay(year: number): HolidayDate {
  const dow = new Date(Date.UTC(year, 4, 31)).getUTCDay(); // 0 = Sunday
  const day = 31 - ((dow + 6) % 7); // back up to the previous Monday
  return { name: 'Memorial Day', month: 5, day };
}

/** First Monday of September. */
function laborDay(year: number): HolidayDate {
  const dow = new Date(Date.UTC(year, 8, 1)).getUTCDay();
  const day = 1 + ((8 - dow) % 7); // forward to the next Monday (or the 1st)
  return { name: 'Labor Day', month: 9, day };
}

function holidaysForYear(year: number): HolidayDate[] {
  return [
    memorialDay(year),
    { name: 'July 4th', month: 7, day: 4 },
    laborDay(year),
  ];
}

/**
 * Name of the float-season holiday falling within the next `horizonDays` days
 * (inclusive of today) in the given zone, or null. The 6-day default horizon
 * covers the Tuesday early call ahead of a Monday holiday.
 */
export function upcomingHolidayWeekend(
  timeZone = 'America/Chicago',
  horizonDays = 6,
  now: Date = new Date(),
): string | null {
  const { year, month, day } = getLocalParts(timeZone, now);
  const todayUtc = Date.UTC(year, month - 1, day);
  for (const h of holidaysForYear(year)) {
    const diffDays = (Date.UTC(year, h.month - 1, h.day) - todayUtc) / 86_400_000;
    if (diffDays >= 0 && diffDays <= horizonDays) return h.name;
  }
  return null;
}
