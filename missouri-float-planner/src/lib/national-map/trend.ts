// src/lib/national-map/trend.ts
// The national flooding trend: how many NWS forecast points were in each
// flood category, hour by hour, over the recorded history (last 24 h).
//
// Counted from recorded frames with the map's own rules — NWS's observed
// category, not current if observed more than NWS_STALE_MS before that capture —
// so the strip and the map can never disagree. A capture whose NOAA read
// failed is a gap, never a zero.
//
// The recorder stores each frame's count as `fc` — and per state and USGS
// water-resources region as `fcr` (frame.ts, via floodRowCategory) — so the
// frame route's `?trend=1[&region=]` reads a few numbers per frame; the NWS
// rows are ~1.1 MB of each frame, too much to read 24 times.
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

/** Region count keys: a state's postal code, or 'huc' + a 2-digit USGS water-resources region. */
export type RegionCounts = Record<string, [number, number, number, number]>;

export function regionCountKey(kind: 'state' | 'basin', id: string): string {
  return kind === 'state' ? id : `huc${id}`;
}

/**
 * One NWS row's counted category at capture, or null: [lid, lng, lat,
 * observedCode, observedEpochSeconds, …]. Not current if observed more than
 * NWS_STALE_MS before the capture; as classifyFlood, a category with no
 * observation time is taken as given.
 */
export function floodRowCategory(capturedAt: number, r: unknown): 'major' | 'moderate' | 'minor' | 'action' | null {
  if (!Array.isArray(r)) return null;
  const code = r[3];
  const at = typeof r[4] === 'number' ? r[4] * 1000 : null;
  if (at !== null && capturedAt - at > NWS_STALE_MS) return null;
  if (code === FLOOD_CODE.major) return 'major';
  if (code === FLOOD_CODE.moderate) return 'moderate';
  if (code === FLOOD_CODE.minor) return 'minor';
  if (code === FLOOD_CODE.action) return 'action';
  return null;
}

/** Count one frame's NWS rows. */
export function floodTrendPoint(capturedAt: number, noaaOk: boolean, rows: unknown): TrendPoint {
  const p: TrendPoint = { t: capturedAt, ok: noaaOk && Array.isArray(rows), major: 0, moderate: 0, minor: 0, action: 0 };
  if (!p.ok) return p;
  for (const r of rows as unknown[]) {
    const cat = floodRowCategory(capturedAt, r);
    if (cat) p[cat]++;
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

const isCount = (fc: unknown): fc is [number, number, number, number] =>
  Array.isArray(fc) && fc.length === 4 && fc.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0);

/**
 * A recorded frame's stored count as a trend point; null when the frame
 * predates the count (`fc`, or `fcr` for a region). A region missing from a
 * frame's `fcr` had nothing to count: zero, not unknown.
 */
export function trendPointFromFrame(capturedAt: number, noaaOk: boolean, fc: unknown, fcr?: unknown, region?: string | null): TrendPoint | null {
  if (!Number.isFinite(capturedAt)) return null;
  if (!noaaOk) return { t: capturedAt, ok: false, major: 0, moderate: 0, minor: 0, action: 0 };
  let counts: unknown = fc;
  if (region) {
    if (!fcr || typeof fcr !== 'object' || Array.isArray(fcr)) return null;
    counts = (fcr as Record<string, unknown>)[region] ?? [0, 0, 0, 0];
  }
  if (!isCount(counts)) return null;
  const [major, moderate, minor, action] = counts;
  return { t: capturedAt, ok: true, major, moderate, minor, action };
}

export function trendFlooding(p: TrendPoint): number {
  return p.major + p.moderate + p.minor;
}
