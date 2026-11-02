// src/lib/national-map/trend.ts
// The national flooding trend: how many NWS forecast points were in each
// flood category, hour by hour, over the recorded history (last 24 h).
//
// Counted from recorded frames with the map's own rules — NWS's observed
// category, not current if observed more than NWS_STALE_MS before that capture —
// so the strip and the map can never disagree. A capture whose NOAA read
// failed is a gap, never a zero.
//
// The recorder stores each frame's count as `fc` (frame.ts, via
// floodTrendPoint), so the frame route's `?trend=1` reads four numbers per
// frame — the NWS rows are ~1.1 MB of each frame, too much to read 24 times.
// A frame recorded before `fc` existed is left out (not a gap, not a zero).
//
// Pure.

import { FLOOD_CODE } from './flood-status';
import { NWS_STALE_MS } from './marks';

export interface TrendPoint {
  /** Capture time, epoch ms. */
  t: number;
  /** False when NOAA could not be read for that capture (a gap, not zero). */
  ok: boolean;
  major: number;
  moderate: number;
  minor: number;
  action: number;
}

/** Count one frame's NWS rows: [lid, lng, lat, observedCode, observedEpochSeconds, …]. */
export function floodTrendPoint(capturedAt: number, noaaOk: boolean, rows: unknown): TrendPoint {
  const p: TrendPoint = { t: capturedAt, ok: noaaOk && Array.isArray(rows), major: 0, moderate: 0, minor: 0, action: 0 };
  if (!p.ok) return p;
  for (const r of rows as unknown[]) {
    if (!Array.isArray(r)) continue;
    const code = r[3];
    // As classifyFlood: a category with no observation time is taken as given.
    const at = typeof r[4] === 'number' ? r[4] * 1000 : null;
    if (at !== null && capturedAt - at > NWS_STALE_MS) continue;
    if (code === FLOOD_CODE.major) p.major++;
    else if (code === FLOOD_CODE.moderate) p.moderate++;
    else if (code === FLOOD_CODE.minor) p.minor++;
    else if (code === FLOOD_CODE.action) p.action++;
  }
  return p;
}

/**
 * One capture per hour: the newest capture in each hour bucket over the last
 * `hours` (ending at the newest capture), so the strip has one bar per hour
 * and the newest bar is the current frame.
 */
export function hourlyPicks(times: number[], hours = 24): number[] {
  if (!times.length) return [];
  const newest = Math.max(...times);
  const start = newest - hours * 3_600_000;
  const byBucket = new Map<number, number>();
  for (const t of times) {
    if (t <= start) continue;
    const bucket = Math.floor((newest - t) / 3_600_000);
    const prev = byBucket.get(bucket);
    if (prev === undefined || t > prev) byBucket.set(bucket, t);
  }
  return [...byBucket.values()].sort((a, b) => a - b);
}

/** A recorded frame's stored count as a trend point; null when the frame predates `fc`. */
export function trendPointFromFrame(capturedAt: number, noaaOk: boolean, fc: unknown): TrendPoint | null {
  if (!Number.isFinite(capturedAt)) return null;
  if (!noaaOk) return { t: capturedAt, ok: false, major: 0, moderate: 0, minor: 0, action: 0 };
  if (!Array.isArray(fc) || fc.length !== 4 || !fc.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0)) return null;
  const [major, moderate, minor, action] = fc as number[];
  return { t: capturedAt, ok: true, major, moderate, minor, action };
}

export function trendFlooding(p: TrendPoint): number {
  return p.major + p.moderate + p.minor;
}
