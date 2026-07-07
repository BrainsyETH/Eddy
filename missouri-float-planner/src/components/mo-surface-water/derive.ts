// Pure derivations shared by the scroll-story sections (Hero/Story) and the
// live map app. Keeping them here — instead of inline in each component —
// means the hero headline, the verdict tiles, the scrollytelling chart, and
// the map itself all agree on what "floatable right now" means.

import {
  classifyStageFromThresholds,
  type MORiver,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import type { MoForecastEntry } from '@/app/api/usgs/mo-forecast/route';

/** Conditions that count as "go float it" in headline numbers. */
export const FLOATABLE: ReadonlySet<StageVerdict> = new Set<StageVerdict>(['good', 'flowing']);

/**
 * Verdict per river from TODAY's live readings, including the 72h
 * forecast flood-stage override (a river that is Prime now but forecast
 * over flood stage tomorrow reads as Flood). Same rules as the map's
 * live branch.
 */
export function computeTodayVerdicts(
  rivers: MORiver[],
  gauges: MoStatewideGauge[],
  forecastBySite: Record<string, MoForecastEntry>,
): Record<string, StageVerdict> {
  const out: Record<string, StageVerdict> = {};
  // Keyed by SITE, not river slug: the statewide payload carries one entry
  // per physical gauge tagged with the first river that uses it, so a
  // shared primary (07017200 → Courtois + Huzzah) must be looked up by
  // site number or the second river silently loses its reading.
  const liveBySite = new Map<string, MoStatewideGauge>();
  for (const g of gauges) {
    if (!liveBySite.has(g.site_no)) liveBySite.set(g.site_no, g);
  }
  for (const r of rivers) {
    const primary = (r.gauges ?? []).find((g) => g.is_primary);
    if (!primary) { out[r.slug] = 'unknown'; continue; }
    const live = liveBySite.get(primary.site_id);
    const value = primary.threshold_unit === 'ft'
      ? live?.gaugeHeightFt ?? null
      : live?.dischargeCfs ?? null;
    if (primary.threshold_unit === 'ft' && primary.flood_stage_ft != null) {
      const fc = forecastBySite[primary.site_id];
      const peak = Math.max(
        value ?? Number.NEGATIVE_INFINITY,
        fc?.peakFt ?? Number.NEGATIVE_INFINITY,
      );
      if (peak >= primary.flood_stage_ft) { out[r.slug] = 'dangerous'; continue; }
    }
    out[r.slug] = classifyStageFromThresholds(value, primary.threshold_unit, primary);
  }
  return out;
}

export interface DailyConditionSeries {
  /** Per-day share (0–100) of rivers whose primary gauge reads floatable. */
  trend: Array<{ x: number; y: number }>;
  /** Per-day distribution of river conditions. */
  dailyBands: Array<{ x: number; counts: Record<StageVerdict, number> }>;
  /** Calendar date (YYYY-MM-DD) per day index, from the first entry. */
  dates: string[];
  dayCount: number;
}

/**
 * Per-day condition distribution across all curated rivers' primary
 * gauges for the trailing 30 days. Used by the TimeScrubber on the map
 * and the scroll-driven month chart in the story — one computation, one
 * vocabulary.
 */
export function computeDailyConditionSeries(
  history: MoHistoryBundleEntry[],
  rivers: MORiver[],
): DailyConditionSeries {
  const primaryEntries = history.filter((e) => e.is_primary);
  const L = history[0]?.daily.length ?? 0;
  if (!L) return { trend: [], dailyBands: [], dates: [], dayCount: 0 };

  const series = rivers
    .map((r) => {
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) return null;
      const ent = primaryEntries.find((e) => e.site_no === primary.site_id);
      if (!ent) return null;
      return { primary, ent };
    })
    .filter((s): s is NonNullable<typeof s> => s != null);

  const trend: Array<{ x: number; y: number }> = [];
  const dailyBands: Array<{ x: number; counts: Record<StageVerdict, number> }> = [];
  for (let i = 0; i < L; i++) {
    const counts: Record<StageVerdict, number> = {
      too_low: 0, low: 0, good: 0, flowing: 0, high: 0, dangerous: 0, unknown: 0,
    };
    let floatable = 0;
    let known = 0;
    for (const { primary, ent } of series) {
      const day = ent.daily[i];
      const value = primary.threshold_unit === 'ft'
        ? day?.gaugeHeightFt ?? null
        : day?.dischargeCfs ?? null;
      const c = classifyStageFromThresholds(value, primary.threshold_unit, primary);
      counts[c]++;
      if (c !== 'unknown') {
        known++;
        if (FLOATABLE.has(c)) floatable++;
      }
    }
    dailyBands.push({ x: i, counts });
    trend.push({ x: i, y: known ? (floatable / known) * 100 : 0 });
  }
  const dates = (history[0]?.daily ?? []).map((d) => d.date);
  return { trend, dailyBands, dates, dayCount: L };
}
