// src/lib/social/trend-picker.ts
// Pick the "most notable" river for the weekly trend reel — largest
// absolute 7-day gauge delta — and return its sparkline data.

export interface TrendSeriesPoint {
  /** Hours offset from now (negative = past). */
  hoursAgo: number;
  gaugeHeightFt: number | null;
}

export interface TrendRiverData {
  riverSlug: string;
  riverName: string;
  currentHeightFt: number | null;
  sevenDayFirstFt: number | null;
  sevenDayLastFt: number | null;
  sevenDayMinFt: number | null;
  sevenDayMaxFt: number | null;
  /** Signed delta = last - first (positive = rising). */
  deltaFt: number;
  /** 'rising' | 'falling' | 'flat' — based on |delta| ≥ 0.15 ft. */
  direction: 'rising' | 'falling' | 'flat';
  /** Sparkline points, sampled evenly. ~30 points. */
  series: TrendSeriesPoint[];
}

const SPARKLINE_POINTS = 30;
const FLAT_THRESHOLD_FT = 0.15;

function titleize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * For each river with a primary gauge, pull the last 7 days of
 * gauge_readings, pick the one with the largest |delta|, and return a
 * downsampled sparkline for it.
 *
 * Returns null if no rivers have enough readings or no signal > FLAT_THRESHOLD.
 */
export async function pickNotableTrend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { restrictTo?: string[] } = {},
): Promise<TrendRiverData | null> {
  const LOG = '[TrendPicker]';

  // 1. Map river slug → primary gauge station id.
  const { data: riverGauges, error: rgError } = await supabase
    .from('river_gauges')
    .select('rivers!inner(slug), gauge_stations!inner(id)')
    .eq('is_primary', true);
  if (rgError) {
    console.error(`${LOG} river_gauges query failed:`, rgError.message);
    return null;
  }

  type GaugeRow = { rivers: { slug: string }; gauge_stations: { id: string } };
  const stationBySlug = new Map<string, string>();
  for (const rg of (riverGauges || []) as GaugeRow[]) {
    const slug = rg.rivers?.slug;
    const stationId = rg.gauge_stations?.id;
    if (!slug || !stationId) continue;
    if (opts.restrictTo && !opts.restrictTo.includes(slug)) continue;
    stationBySlug.set(slug, stationId);
  }
  if (stationBySlug.size === 0) return null;

  // 2. Pull 7 days of readings for all primary stations in one query.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stationIds = Array.from(stationBySlug.values());
  const { data: readings, error: rError } = await supabase
    .from('gauge_readings')
    .select('gauge_station_id, reading_timestamp, gauge_height_ft')
    .in('gauge_station_id', stationIds)
    .gte('reading_timestamp', since)
    .order('reading_timestamp', { ascending: true });
  if (rError) {
    console.error(`${LOG} gauge_readings query failed:`, rError.message);
    return null;
  }

  type Reading = { gauge_station_id: string; reading_timestamp: string; gauge_height_ft: number | null };
  const readingsByStation = new Map<string, Reading[]>();
  for (const r of (readings || []) as Reading[]) {
    const list = readingsByStation.get(r.gauge_station_id) || [];
    list.push(r);
    readingsByStation.set(r.gauge_station_id, list);
  }

  // 3. For each river, compute first/last/delta and rank by |delta|.
  type Candidate = TrendRiverData & { stationId: string };
  const candidates: Candidate[] = [];
  for (const [slug, stationId] of Array.from(stationBySlug.entries())) {
    const series = readingsByStation.get(stationId) || [];
    const valid = series.filter((r) => r.gauge_height_ft !== null) as Array<Reading & { gauge_height_ft: number }>;
    if (valid.length < 4) continue; // Not enough signal.

    const first = valid[0].gauge_height_ft;
    const last = valid[valid.length - 1].gauge_height_ft;
    const heights = valid.map((r) => r.gauge_height_ft);
    const delta = last - first;

    // Downsample to SPARKLINE_POINTS for the chart.
    const step = Math.max(1, Math.floor(valid.length / SPARKLINE_POINTS));
    const sparkline: TrendSeriesPoint[] = [];
    const nowMs = Date.now();
    for (let i = 0; i < valid.length; i += step) {
      const r = valid[i];
      sparkline.push({
        hoursAgo: (nowMs - new Date(r.reading_timestamp).getTime()) / (1000 * 60 * 60) * -1,
        gaugeHeightFt: r.gauge_height_ft,
      });
    }
    // Ensure the final point is included.
    if (sparkline[sparkline.length - 1]?.gaugeHeightFt !== last) {
      const r = valid[valid.length - 1];
      sparkline.push({
        hoursAgo: (nowMs - new Date(r.reading_timestamp).getTime()) / (1000 * 60 * 60) * -1,
        gaugeHeightFt: r.gauge_height_ft,
      });
    }

    let direction: TrendRiverData['direction'];
    if (Math.abs(delta) < FLAT_THRESHOLD_FT) direction = 'flat';
    else if (delta > 0) direction = 'rising';
    else direction = 'falling';

    candidates.push({
      stationId,
      riverSlug: slug,
      riverName: titleize(slug),
      currentHeightFt: last,
      sevenDayFirstFt: first,
      sevenDayLastFt: last,
      sevenDayMinFt: Math.min(...heights),
      sevenDayMaxFt: Math.max(...heights),
      deltaFt: delta,
      direction,
      series: sparkline,
    });
  }

  if (candidates.length === 0) return null;

  // Rank by |delta|, require at least a real signal. Ties broken by max - min.
  candidates.sort((a, b) => {
    const absDelta = Math.abs(b.deltaFt) - Math.abs(a.deltaFt);
    if (absDelta !== 0) return absDelta;
    const rangeA = (a.sevenDayMaxFt ?? 0) - (a.sevenDayMinFt ?? 0);
    const rangeB = (b.sevenDayMaxFt ?? 0) - (b.sevenDayMinFt ?? 0);
    return rangeB - rangeA;
  });

  const pick = candidates[0];
  if (Math.abs(pick.deltaFt) < FLAT_THRESHOLD_FT) {
    // Every river is flat this week — not worth posting.
    return null;
  }
  // Strip internal-only field.
  const { stationId: _stationId, ...result } = pick;
  void _stationId;
  return result;
}
