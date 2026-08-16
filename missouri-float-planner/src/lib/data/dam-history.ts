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

/**
 * How long history is kept.
 *
 * ── Why this is years and not weeks ────────────────────────────────────────
 * It was 35 days, sized to "the strip plus headroom", and that reasoning was
 * wrong in a way that only shows up later. This table is the ONLY durable
 * record of what these powerhouses actually did: CWMS serves a rolling recent
 * window and can repair a gap of about a week, so once the prune deletes an
 * observation it is gone for good and cannot be re-fetched from anywhere.
 *
 * The things worth building on top of it — seasonal patterns, per-project flow
 * bands, scheduled-versus-actual accuracy — all need more than one season, and
 * a 35-day window would have meant discovering that in a year and then waiting
 * another year to have the data.
 *
 * It costs nothing to keep. Twenty dams × two metrics × 24 hours × 365 days is
 * about 350,000 rows a year, a few tens of megabytes with the index.
 *
 * The UI is unaffected: the pattern read asks for PATTERN_PAST_DAYS and gets
 * that, however much is stored behind it.
 */
export const HISTORY_RETENTION_DAYS = 730;

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
 * ── `periodMs` is what stops the strip drawing an hour late ────────────────
 * A CWMS point carries a DURATION, and a non-zero one means the stamp is the
 * period's END: the point stamped 13:00 is the average over [12:00, 13:00).
 * `observedHour` is the hour a bar BEGINS (see DamPatternDay), so a
 * period-ending sample has to be shifted back by its own duration before it is
 * floored, or every bar lands one hour late — the units read as starting at 13
 * when they started at 12, which is the direction that puts someone in the
 * water. Pass `periodEndingMs(tsId)`; instantaneous series pass 0 and floor
 * where they stand.
 *
 * The shift is by the duration rather than a flat hour so a 15-minute mean
 * works too: stamps 10:15, 10:30, 10:45 and 11:00 all cover time inside
 * 10:00–11:00 and all land in the 10:00 bucket.
 *
 * Non-finite and negative samples are dropped rather than averaged in — a
 * negative discharge is a series that does not mean what we think, and the
 * table's own CHECK would reject it anyway.
 */
export function bucketHourly(points: TimeseriesPoint[], periodMs = 0): HourBucket[] {
  const sums = new Map<number, { total: number; count: number }>();
  const shift = Number.isFinite(periodMs) && periodMs > 0 ? periodMs : 0;

  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.value)) continue;
    if (point.value < 0) continue;
    const hour = Math.floor((point.timestamp - shift) / 3_600_000) * 3_600_000;
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

/**
 * The instant a Central calendar day begins, as epoch ms.
 *
 * Found by probing rather than by assuming an offset: midnight Central is 05:00
 * or 06:00 UTC depending on the season, and on a transition day the arithmetic
 * that would "obviously" work is exactly the arithmetic that produced the
 * phantom gap. Start from the UTC midnight of the same date, then walk to the
 * first hour whose Central day key matches — at most a few steps, and correct
 * on every day of the year including the two odd ones.
 */
function centralDayStart(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Central is UTC-5 or UTC-6, so the day begins between 04:00 and 07:00 UTC.
  for (let h = 3; h <= 8; h += 1) {
    const candidate = utcMidnight + h * 3_600_000;
    if (centralClock(candidate).dayKey !== dayKey) continue;
    if (centralClock(candidate - 3_600_000).dayKey !== dayKey) return candidate;
  }
  // Unreachable for America/Chicago; fall back to the naive value rather than
  // throwing inside a render path.
  return utcMidnight + 6 * 3_600_000;
}

/**
 * How many hours long a Central calendar day is: 23, 24 or 25.
 *
 * The whole reason DamPatternDay carries a length at all. Derived from the two
 * day boundaries rather than from a DST table, so it needs no maintenance and
 * cannot disagree with Intl.
 */
export function centralDayHours(dayKey: string): number {
  const start = centralDayStart(dayKey);
  const nextStart = centralDayStart(nextDayKeyLocal(dayKey));
  return Math.round((nextStart - start) / 3_600_000);
}

/** The calendar day after `dayKey`, both `YYYY-MM-DD`. */
function nextDayKeyLocal(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + 86_400_000).toISOString().slice(0, 10);
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
 * ── Indexed by UTC offset, not by Central hour-of-day ──────────────────────
 * Index `i` is the hour beginning `i` hours after `startUtc`. This is the fix
 * for the DST bug documented on DamPatternDay: Central hour-of-day repeats a
 * value each November and skips one each March, so using it as an array index
 * discarded a real observation on one day of the year and invented a missing
 * one on another. A UTC offset from a known anchor does neither.
 *
 * Days with no rows at all are still emitted, full of nulls. A strip that
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
  /** dayKey → the epoch ms that day begins, so the fold below needs no re-probe. */
  const starts = new Map<string, number>();

  for (const key of patternDayKeys(past, now)) {
    const length = centralDayHours(key);
    const start = centralDayStart(key);
    starts.set(key, start);
    days.set(key, {
      scheduleDate: key,
      startUtc: new Date(start).toISOString(),
      turbineCfs: new Array(length).fill(null),
      totalReleaseCfs: new Array(length).fill(null),
    });
  }

  for (const row of rows) {
    const ms = Date.parse(row.observedHour);
    if (!Number.isFinite(ms)) continue;
    if (!Number.isFinite(row.valueCfs)) continue;

    const { dayKey } = centralClock(ms);
    const day = days.get(dayKey);
    const start = starts.get(dayKey);
    if (!day || start === undefined) continue; // Outside the window.

    const index = Math.round((ms - start) / 3_600_000);
    if (index < 0 || index >= day.turbineCfs.length) continue;

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
