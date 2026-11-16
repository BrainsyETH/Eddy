/**
 * The Savannah District's scheduled-energy series, summarized per run so the
 * Southeast step starts with weeks of evidence about when the schedule posts,
 * how far ahead it reaches, and whether it is revised.
 *
 * Measured once on 2026-11-09 (`LAKES_PHASE0_AUDIT_2026-11-09.md` §4):
 * `Hartwell.Energy-SCHED.Total.1Hour.1Hour.Raw-SHEF_SAS` carried hourly MWh
 * for hours ahead of the read through 05:00Z, midnight Eastern. One read says
 * nothing about cadence or revisions; this records the shape of each read.
 *
 * It does not interpret the values. What an MWh in this series represents, and
 * whether the schedule reaches into the next day in the evening, are the
 * questions the record exists to answer.
 */

export const SAVANNAH_SCHEDULE_SERIES = [
  { project: 'hartwell', office: 'SAS', scheduled: 'Hartwell.Energy-SCHED.Total.1Hour.1Hour.Raw-SHEF_SAS', observed: 'Hartwell.Energy.Total.1Hour.1Hour.Raw-SHEF_SAS' },
  { project: 'thurmond', office: 'SAS', scheduled: 'Thurmond.Energy-SCHED.Total.1Hour.1Hour.Raw-SHEF_SAS', observed: 'Thurmond.Energy.Total.1Hour.1Hour.Raw-SHEF_SAS' },
] as const;

/** A CWMS value row: [epoch ms, value, quality]. */
export type CwmsValue = [number, number | null, number];

export interface ScheduleHorizon {
  points: number;
  first_at: string | null;
  last_at: string | null;
  /** Points stamped after `now`. */
  hours_ahead: number;
  /** Points stamped after `now` with a nonzero value: scheduled generation, not a zero placeholder. */
  nonzero_hours_ahead: number;
  /** The last future stamp with a nonzero value. */
  last_nonzero_ahead_at: string | null;
  /** Eastern calendar days the series reaches, from the read, as YYYY-MM-DD. */
  eastern_days: string[];
}

const EASTERN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * The Eastern calendar day an hourly total belongs to. CWMS totals are
 * period-ending (measured in DAM_EXPANSION_SURVEY_2026-08.md), so the stamp at
 * midnight is the last hour of the day before; `periodEnding` steps back one
 * millisecond to land there.
 */
export function easternDay(ms: number, periodEnding = true): string {
  return EASTERN_DAY.format(new Date(periodEnding ? ms - 1 : ms));
}

export function summarizeHorizon(values: CwmsValue[], now: string): ScheduleHorizon {
  const nowMs = Date.parse(now);
  const present = values.filter((v) => v[1] !== null).sort((a, b) => a[0] - b[0]);
  const ahead = present.filter((v) => v[0] > nowMs);
  const nonzeroAhead = ahead.filter((v) => (v[1] ?? 0) !== 0);
  return {
    points: present.length,
    first_at: present.length ? new Date(present[0][0]).toISOString() : null,
    last_at: present.length ? new Date(present[present.length - 1][0]).toISOString() : null,
    hours_ahead: ahead.length,
    nonzero_hours_ahead: nonzeroAhead.length,
    last_nonzero_ahead_at: nonzeroAhead.length ? new Date(nonzeroAhead[nonzeroAhead.length - 1][0]).toISOString() : null,
    eastern_days: [...new Set(present.map((v) => easternDay(v[0])))].sort(),
  };
}

export interface ScheduleRunRecord {
  read_at: string;
  project: string;
  scheduled: ScheduleHorizon;
  observed: ScheduleHorizon;
  /** Hour-aligned scheduled values ahead of the read, as [ISO hour, MWh], so revisions can be seen run to run. */
  scheduled_ahead: Array<[string, number]>;
}

export function scheduleRunRecord(project: string, scheduledValues: CwmsValue[], observedValues: CwmsValue[], now: string): ScheduleRunRecord {
  const nowMs = Date.parse(now);
  return {
    read_at: now,
    project,
    scheduled: summarizeHorizon(scheduledValues, now),
    observed: summarizeHorizon(observedValues, now),
    scheduled_ahead: scheduledValues
      .filter((v) => v[1] !== null && v[0] > nowMs)
      .sort((a, b) => a[0] - b[0])
      .map((v) => [new Date(v[0]).toISOString(), v[1] as number]),
  };
}
