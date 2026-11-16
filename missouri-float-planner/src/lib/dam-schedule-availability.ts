// src/lib/dam-schedule-availability.ts
// What a dam surface says where an hourly generation schedule would go, when
// there is none to draw. One rule for the dam report and the dam cards.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The dam report always told these cases apart. The cards did not: every dam
// with a powerhouse drew the schedule section, so Bagnell and the three
// Cumberland dams, which no agency publishes an hourly schedule for, read
// "Today's generation schedule is unavailable" on every visit, as though a
// feed were down. "Unavailable" is kept for the one case it is true of: a dam
// SWPA does schedule, whose sheet Eddy does not hold right now.
//
// Pure and free of the registry, so client components can import it. The
// report passes registry facts; a card passes what the snapshot carries
// (damCardScheduleFacts).

import type { DamSnapshot } from '@shared/dam-types';
import { SCHEDULE_POSTING_NOTE } from '@shared/dam-schedule-copy';

export interface ScheduleFacts {
  /** The project has a powerhouse. */
  hasTurbines: boolean;
  /** SWPA posts an hourly schedule for it. */
  hourlySchedule: boolean;
  /** The operator's own forward forecast is on the snapshot (Nashville District). */
  forecast: boolean;
  /** Ameren's Bagnell Dam, whose release notice is a siren rather than a schedule. */
  amerenOperated?: boolean;
}

export type ScheduleAvailabilityKind = 'gate-operated' | 'no-hourly-schedule' | 'schedule-missing';

export interface ScheduleAvailability {
  kind: ScheduleAvailabilityKind;
  title: string;
  /** The report's paragraph. */
  detail: string;
  /** One line for a card. */
  brief: string;
}

export function damScheduleAvailability(facts: ScheduleFacts): ScheduleAvailability {
  if (!facts.hasTurbines) {
    return {
      kind: 'gate-operated',
      title: 'Gate-operated releases',
      detail: 'This dam has no powerhouse. Releases are controlled by gate operation, so there is no generation schedule.',
      brief: 'No powerhouse, so there is no generation schedule.',
    };
  }
  if (!facts.hourlySchedule) {
    return {
      kind: 'no-hourly-schedule',
      title: 'No hourly schedule published',
      detail: facts.amerenOperated
        ? 'Ameren operates this dam. Releases can begin at any time, and the dam sounds a warning siren before starting or stopping generators. The recorded operations line provides current information.'
        : facts.forecast
          ? 'The operating forecast below provides the forward view for this dam.'
          : 'Eddy shows observed readings for this dam. No public hourly loading schedule is available.',
      brief: facts.forecast
        ? 'The full report has the Corps operating forecast.'
        : 'Releases can begin at any time.',
    };
  }
  return {
    kind: 'schedule-missing',
    title: 'Schedule currently unavailable',
    detail: `${SCHEDULE_POSTING_NOTE} Eddy shows only dates it can confirm; an unavailable schedule does not mean generation has stopped.`,
    brief: 'Today’s generation schedule is unavailable.',
  };
}

/**
 * The same facts, read off a snapshot.
 *
 * `generationReference` is SWPA's MW/cfs pair, which buildSnapshot emits for
 * exactly the projects SWPA schedules, whether or not a sheet is held right
 * now. That is what lets a card tell "never scheduled" from "sheet missing"
 * without the registry. It holds for the registry fallback too, because
 * conditionsDamCatalogue builds missing dams through buildSnapshot.
 */
export function damCardScheduleFacts(
  dam: Pick<DamSnapshot, 'hasTurbines' | 'generationReference' | 'generationForecast'>,
): ScheduleFacts {
  return {
    hasTurbines: dam.hasTurbines,
    hourlySchedule: Boolean(dam.generationReference),
    forecast: Boolean(dam.generationForecast?.windows.length),
  };
}
