// src/lib/eddy/material-outlook.ts
// The one thing a Read is told about the days ahead.
//
// WEATHER BELONGS IN THE WEATHER SECTION. The owner's rule, 2026-11-18. Both
// Read prompts used to carry the current weather and a three-day forecast, and
// a model writes about what it is handed: on 2026-11-17 about a fifth of river
// Reads stated a forecast flatly, nearly always a dry one ("no rain in the
// outlook, so expect conditions to hold"), which the prompt forbids.
//
// There is a second reason, and it does not depend on the model behaving. A
// Read is written once, at 5:10 AM, and stored. The app's "Watch for" section
// (src/lib/river-outlook.ts) is rebuilt every time somebody opens the page. A
// forecast in the Read can be a day old and contradict the section beside it.
//
// So the prompts no longer carry weather at all. What is left is this: when
// rain is LIKELY in the next three days, by the same threshold the Watch for
// section uses to say "Rain is likely", the Read is told which days, so it may
// say once that the reading could change. A dry or uncertain outlook produces
// nothing, and a Read handed nothing has nothing to narrate.
//
// Not included: the NWS river forecast (a gauge predicted to reach another
// condition). That grading lives inside the outlook route. Active NWS flood
// alerts still reach both Reads through their own block, and still lead.
//
// Pure, so both prompt builders can share it and it can be tested on a
// fixed forecast.

import { getOutlookDates, listDays, spokenDay, SIGNIFICANT_RAIN_CHANCE } from '@/lib/river-outlook';
import type { ForecastData } from '@/lib/weather/openweather';

/**
 * The days rain is likely, as the Watch for section would name them: "today",
 * "tomorrow", then the weekday. Only the same three local days that section
 * shows, matched by date, so the Read cannot name a day it does not.
 */
export function likelyRainDays(forecast: ForecastData | null, now: Date = new Date()): string[] {
  if (!forecast?.days?.length) return [];
  const dates = getOutlookDates(now);
  const names: string[] = [];
  dates.forEach((date, index) => {
    const day = forecast.days.find((candidate) => candidate.date === date);
    if (day && day.precipitation >= SIGNIFICANT_RAIN_CHANCE) names.push(spokenDay(index, day.dayOfWeek));
  });
  return names;
}

/** The `[OUTLOOK]` block for a Read prompt, or no lines at all. */
export function materialOutlookLines(forecast: ForecastData | null, now: Date = new Date()): string[] {
  const days = likelyRainDays(forecast, now);
  if (!days.length) return [];
  return [
    '[OUTLOOK]',
    `Rain is likely ${listDays(days)}.`,
    'This is all you are told about the days ahead. You may say once, in [FULL] only and conditionally, that rain could change this reading and that it is worth another look. Do not describe the weather itself; the app\'s Weather section does that.',
  ];
}
