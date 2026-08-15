// src/lib/data/dam-forecast.ts
// Turns a district's hourly generation forecast (CWMS points) into the
// DamForecastWindow list the wire carries. Pure — the fetch lives in dams.ts —
// so every boundary case here is testable with no network.
//
// ── The timestamp convention, measured rather than assumed ─────────────────
// A CWMS `Ave.1Hour` point stamped t is the average over [t-1h, t) — the
// PERIOD-ENDING convention, the same "hour ending" idea SWPA's schedule uses.
// Verified against the one series pair that can discriminate (2026-08-15):
// Wolf Creek's INSTANTANEOUS tailwater stage read +3.1 ft at exactly 17:00Z
// on 2026-08-13, the same instant the turbine series' first nonzero point
// (3,560 cfs) was stamped. Water was already moving during 16:00-17:00Z, so
// the 17:00Z point averages the PRECEDING hour. Getting this backwards would
// shift every window an hour late on starts and an hour early on stops — and
// "off at 9 PM" when the units run to 10 is the dangerous direction.
//
// ── Slicing at now is a correctness rule, not tidiness ─────────────────────
// The celrn-cwms-forecast series retains its past, byte-identical to the
// observed man-rev series (three hours spot-checked equal). Any past hour
// served from here would present a plan as a record — the exact claim the
// pattern strip's design exists to prevent. Only the hour currently running
// survives the slice, and only because a reader deciding whether to wade
// needs the current forecast state to anchor "when does this next change".

import type { DamForecastWindow } from '@shared/dam-types';
import type { TimeseriesPoint } from '@/lib/usace/cda';

const HOUR_MS = 3_600_000;

/**
 * How far forward the wire carries the forecast. LRN publishes ~9 days; the
 * cap exists so a district that starts publishing further cannot silently
 * grow the payload — widening it is a decision, not a data change.
 */
export const FORECAST_HORIZON_HOURS = 10 * 24;

/**
 * Collapse hourly forecast points into contiguous generating/idle windows.
 *
 * `floorCfs` is the dam's generationOnCfs — the same floor `generating` is
 * derived with, so the forecast and the observation cannot disagree about
 * what "running" means at this project.
 *
 * A GAP IN THE SOURCE IS A GAP HERE: a missing hour ends the current window
 * and the next one starts fresh. Bridging a gap would claim the forecast says
 * something for hours it says nothing about.
 */
export function buildForecastWindows(
  points: TimeseriesPoint[],
  floorCfs: number,
  now: number
): DamForecastWindow[] {
  const horizonEnd = now + FORECAST_HORIZON_HOURS * HOUR_MS;

  // Each point stamped t covers [t-1h, t) — see the header. Dedupe on the
  // stamp defensively: an upstream that repeated an hour must not produce a
  // zero-length or doubled window.
  const seen = new Set<number>();
  const intervals = points
    .filter((p) => Number.isFinite(p.value) && p.value >= 0)
    .filter((p) => {
      if (seen.has(p.timestamp)) return false;
      seen.add(p.timestamp);
      return true;
    })
    .map((p) => ({ start: p.timestamp - HOUR_MS, end: p.timestamp, cfs: p.value }))
    .filter((iv) => iv.end > now && iv.start < horizonEnd)
    .sort((a, b) => a.start - b.start);

  const windows: DamForecastWindow[] = [];
  let current: { start: number; end: number; generating: boolean; peak: number } | null = null;

  for (const iv of intervals) {
    const generating = iv.cfs > floorCfs;
    const contiguous = current !== null && iv.start === current.end;
    if (current && contiguous && generating === current.generating) {
      current.end = iv.end;
      current.peak = Math.max(current.peak, iv.cfs);
      continue;
    }
    if (current) windows.push(finish(current));
    current = { start: iv.start, end: iv.end, generating, peak: iv.cfs };
  }
  if (current) windows.push(finish(current));

  return windows;
}

function finish(w: { start: number; end: number; generating: boolean; peak: number }): DamForecastWindow {
  return {
    startUtc: new Date(w.start).toISOString(),
    endUtc: new Date(w.end).toISOString(),
    generating: w.generating,
    // Rounded to 10: enough to strip the source's unit-conversion float noise
    // (15720.000000132788 cfs) without implying precision a forecast lacks.
    // Not 100, deliberately — this is the district's own planned discharge,
    // not SWPA's ±10% megawatt conversion, and rounding it like an estimate
    // would understate what the source actually published.
    peakCfs: w.generating ? Math.round(w.peak / 10) * 10 : null,
  };
}
