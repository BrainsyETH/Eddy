import type { LakeOperatingRange, LakeSection } from './lake-types';
import { poolPosition, poolPositionSentence } from './lake-status';

/**
 * USACE SWL's active CWMS level, verified 2026-11-17 against /levels and its
 * /timeseries output. Effective date: 1906-01-01T06:00Z; interval origin:
 * 2001-01-01T06:00Z; interval: 12 months; interpolate-string: T; units: ft.
 * https://cwms-data.usace.army.mil/cwms-data/levels?office=SWL&level-id-mask=Table_Rock_Dam*&unit=EN&datum=NGVD29
 *
 * Preserve the published month/minute offsets and UTC origin (06:00), NOT
 * local daylight-saving midnights. The active curve has 30-minute April 30
 * and December 1 transitions. The older tabular calendar is less precise.
 * Source responses and comparison samples: src/lib/lakes/fixtures/table-rock-pool-reference.json.
 */
const TABLE_ROCK_CURVE = [
  [0, 0, 915], [3, 41760, 915], [3, 41790, 916],
  [4, 43260, 917], [11, 0, 917], [11, 30, 915], [12, 0, 915],
] as const;
const curveForYear = (year: number) => TABLE_ROCK_CURVE.map(([month, minutes, ft]) => ({ t: Date.UTC(year, month, 1, 6) + minutes * 60_000, ft }));

export const TABLE_ROCK_OPERATING_RANGE: LakeOperatingRange = {
  conservationFt: 915,
  conservationSchedule: 'table-rock',
  floodFt: 931,
  source: 'USACE CWMS, Table Rock seasonal top of conservation and top of flood pool (NGVD29)',
  asOf: '2026-11-17',
};

/** The reference for the observation's instant, never the page refresh time. */
export function tableRockSeasonalPoolFt(at: string): number | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const date = new Date(t);
  const year = date.getUTCFullYear() - (t < Date.UTC(date.getUTCFullYear(), 0, 1, 6) ? 1 : 0);
  const points = curveForYear(year);
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1], right = points[i];
    if (t <= right.t) return left.ft + (right.ft - left.ft) * (t - left.t) / (right.t - left.t);
  }
  return null;
}

/** Exact knots prevent a history chart stretching a 30-minute change to an hour. */
export function tableRockPoolReferencePoints(from: number, to: number): Array<{ t: number; ft: number }> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const points = new Map<number, number>();
  for (let year = new Date(from).getUTCFullYear() - 1; year <= new Date(to).getUTCFullYear(); year++) {
    for (const p of curveForYear(year)) if (p.t > from && p.t < to) points.set(p.t, p.ft);
  }
  for (const t of [from, to]) points.set(t, tableRockSeasonalPoolFt(new Date(t).toISOString())!);
  return [...points].sort(([a], [b]) => a - b).map(([t, ft]) => ({ t, ft }));
}

/** Resolve the registry's seasonal rule before classification or serialization. */
export function lakeOperatingRangeAt(range: LakeOperatingRange | null | undefined, at: string): LakeOperatingRange | null {
  if (!range) return null;
  if (range.conservationSchedule !== 'table-rock') return range;
  const conservationFt = tableRockSeasonalPoolFt(at);
  return conservationFt === null ? null : { ...range, conservationFt };
}

/** Shared by web summaries and API assembly; also handles older cached payloads. */
export function lakePoolPositionSentence(lake: Pick<LakeSection, 'slug' | 'pool' | 'operatingRange'>): string | null {
  if (!lake.pool) return null;
  const range = lakeOperatingRangeAt(lake.slug === 'table-rock' ? TABLE_ROCK_OPERATING_RANGE : lake.operatingRange, lake.pool.at);
  return poolPositionSentence(poolPosition(lake.pool.valueFt, range), lake.pool.valueFt, range, range?.conservationSchedule ? 'seasonal pool' : 'conservation pool');
}
