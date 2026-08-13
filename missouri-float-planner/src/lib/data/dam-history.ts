// src/lib/data/dam-history.ts
// The pure half of dam generation history: bucketing CWMS samples into hours,
// and folding stored hours into the Central-time days the pattern strip draws.
//
// Split from the cron and from the Supabase reads on purpose. Every rule worth
// getting wrong here — which Central day an observation belongs to, what an
// hour with no samples renders as, whether a partial hour counts — is
// arithmetic over plain values and is tested as such, with no database and no
// network. See dam-history.test.ts.
//
// ── The rule the whole file exists to hold ─────────────────────────────────
// A MISSING HOUR IS NOT A ZERO. The pattern strip's bars encode magnitude, so
// an hour with no observation drawn as an empty bar says "the units were off".
// It stays `null` from the database read all the way to the wire, and the
// renderers give it a third visual treatment. No absence becomes "not
// generating".

import { centralClock } from '@shared/dam-schedule-copy';
import type { DamPatternDay } from '@shared/dam-types';
import type { TimeseriesPoint } from '@/lib/usace/cda';

/** The two series the pattern strip draws, and the only values the table takes. */
export type DamHistoryMetric = 'generationFlow' | 'release';

/** How long history is kept. Seven days for the strip, four weeks of headroom. */
export const HISTORY_RETENTION_DAYS = 35;

/** How many Central days the pattern strip shows behind today. */
export const PATTERN_PAST_DAYS = 7;

/**
 * How far back each cron pass re-reads.
 *
 * Deliberately far more than the hour between runs. The overlap is what makes
 * the job self-healing: a pass that fails, times out, or is skipped during a
 * deploy is repaired by the next one instead of leaving a permanent hole in a
 * strip nobody will notice is holed.
 */
export const SYNC_LOOKBACK_HOURS = 48;

/** One hour of observations, reduced. */
export interface HourBucket {
  /** Hour-truncated UTC, ISO. Matches the table's `observed_hour` exactly. */
  observedHour: string;
  valueCfs: number;
  sampleCount: number;
}

/**
 * Reduce a CWMS series to hourly means.
 *
 * ── Why the mean and not the last sample ───────────────────────────────────
 * Because the bar is an hour wide and a spot value is not what it represents.
 * A dam that ramps from 0 to 20,000 cfs at :30 has an honest hourly mean around
 * 10,000; drawing the :55 sample would show a full hour of full generation that
 * did not happen. The same reasoning SWPA's own hour-ending convention rests
 * on, applied to the observation side.
 *
 * Non-finite and negative samples are dropped rather than averaged in — a
 * negative discharge is a series that does not mean what we think, and the
 * table's own CHECK would reject it anyway.
 */
export function bucketHourly(points: TimeseriesPoint[]): HourBucket[] {
  const sums = new Map<number, { total: number; count: number }>();

  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.value)) continue;
    if (point.value < 0) continue;
    const hour = Math.floor(point.timestamp / 3_600_000) * 3_600_000;
    const bucket = sums.get(hour);
    if (bucket) {
      bucket.total += point.value;
      bucket.count += 1;
    } else {
      sums.set(hour, { total: point.value, count: 1 });
    }
  }

  return Array.from(sums.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, { total, count }]) => ({
      observedHour: new Date(hour).toISOString(),
      valueCfs: total / count,
      sampleCount: count,
    }));
}

/** A stored row, as the pattern read hands it back. */
export interface StoredHour {
  metric: DamHistoryMetric;
  /** Hour-truncated UTC, ISO — whatever the driver returns for timestamptz. */
  observedHour: string;
  valueCfs: number;
}

/** The calendar day before `dayKey`, both `YYYY-MM-DD`. */
function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  // UTC arithmetic on a bare calendar date. Subtracting 24h from a Central
  // instant would land on the same day twice each November and skip one each
  // March; a calendar day has no DST because it has no clock attached.
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * The Central calendar days a pattern covers: `past` days behind today, then
 * today, oldest first.
 */
export function patternDayKeys(past = PATTERN_PAST_DAYS, now = Date.now()): string[] {
  const keys: string[] = [centralClock(now).dayKey];
  for (let i = 0; i < past; i += 1) keys.unshift(previousDayKey(keys[0]));
  return keys;
}

/**
 * Fold stored hours into the wire's per-day arrays.
 *
 * ── Index 0 is hour-ending 1 ───────────────────────────────────────────────
 * An observation that landed in Central hour 0 (midnight to 1 AM) is the hour
 * SWPA posts as hour ending 1, and goes at index 0. That is the whole mapping,
 * and it is the same off-by-one that "puts an angler in the water an hour
 * early" everywhere else in this feature, so it is done once, here.
 *
 * Days with no rows at all are still emitted, as 24 nulls. A strip that
 * silently dropped a dead day would close the gap and show a continuous week
 * that never happened.
 */
export function buildPatternDays(
  rows: StoredHour[],
  options?: { past?: number; now?: number }
): DamPatternDay[] {
  const past = options?.past ?? PATTERN_PAST_DAYS;
  const now = options?.now ?? Date.now();

  const days = new Map<string, DamPatternDay>();
  for (const key of patternDayKeys(past, now)) {
    days.set(key, {
      scheduleDate: key,
      turbineCfs: new Array(24).fill(null),
      totalReleaseCfs: new Array(24).fill(null),
    });
  }

  for (const row of rows) {
    const ms = Date.parse(row.observedHour);
    if (!Number.isFinite(ms)) continue;
    if (!Number.isFinite(row.valueCfs)) continue;

    const { dayKey, hoursElapsed } = centralClock(ms);
    const day = days.get(dayKey);
    if (!day) continue; // Outside the window — a retention straggler.

    const index = Math.floor(hoursElapsed);
    if (index < 0 || index > 23) continue;

    if (row.metric === 'generationFlow') day.turbineCfs[index] = row.valueCfs;
    else day.totalReleaseCfs[index] = row.valueCfs;
  }

  return Array.from(days.values());
}

/**
 * Whether a pattern is worth sending at all.
 *
 * A strip of nothing but gaps is worse than no strip: it reads as a week of
 * silence at the dam rather than as a feature with no data yet. One observed
 * hour anywhere is the bar for showing it.
 */
export function patternHasObservations(days: DamPatternDay[]): boolean {
  return days.some(
    (d) =>
      d.turbineCfs.some((v) => v !== null) || d.totalReleaseCfs.some((v) => v !== null)
  );
}
