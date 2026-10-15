// History collection and coverage reporting share one result: an upsert of old
// hours is useful for repair, but is not evidence that a stream is healthy.
import type { MetricSource } from '@/lib/data/dams';
import { bucketHourly, type DamHistoryMetric, type HourBucket } from '@/lib/data/dam-history';
import { expectedHistoryMetrics, type UsaceDam } from '@/lib/flow-providers/usace-registry';
import type { fetchTimeseries } from '@/lib/usace/cda';
import { periodEndingMs } from '@/lib/usace/resolve';

const HOUR_MS = 3_600_000;
const HISTORY_METRICS: DamHistoryMetric[] = ['generationFlow', 'release'];
/** Matches the dam freshness check; allows normal district publication lag. */
export const HISTORY_MAX_AGE_HOURS = 6;

type StreamStatus = 'ok' | 'missing' | 'daily_mean' | 'empty' | 'stale' | 'write_failed' | 'error';

export interface HistoryStreamResult {
  damId: string;
  metric: DamHistoryMetric;
  expected: boolean;
  status: StreamStatus;
  written: number;
  latestObservedHour: string | null;
  error?: string;
}

export interface HistorySyncIO {
  resolve: (dam: UsaceDam, metrics: DamHistoryMetric[]) => Promise<Partial<Record<DamHistoryMetric, MetricSource>>>;
  fetch: typeof fetchTimeseries;
  write: (damId: string, metric: DamHistoryMetric, buckets: HourBucket[]) => Promise<number>;
}

/** Isolate failures per stream so one failed write does not discard its sibling. */
export async function syncDamHistory(
  dam: UsaceDam,
  lookbackHours: number,
  now: number,
  io: HistorySyncIO
): Promise<HistoryStreamResult[]> {
  const expected = new Set(expectedHistoryMetrics(dam));
  let sources: Partial<Record<DamHistoryMetric, MetricSource>>;
  try {
    sources = await io.resolve(dam, HISTORY_METRICS);
  } catch (error) {
    return [...expected].map((metric) => ({
      damId: dam.id, metric, expected: true, status: 'error', written: 0,
      latestObservedHour: null, error: error instanceof Error ? error.message : String(error),
    }));
  }

  const results: HistoryStreamResult[] = [];
  for (const metric of HISTORY_METRICS) {
    const source = sources[metric];
    // Keep discovery permissive, while avoiding alarms for known daily-only
    // projects such as Mark Twain or metrics a dam has never published.
    if ((!source || source.dailyMean) && !expected.has(metric)) continue;
    const result: HistoryStreamResult = {
      damId: dam.id, metric, expected: expected.has(metric), status: 'missing',
      written: 0, latestObservedHour: null,
    };
    results.push(result);
    if (!source) continue;
    if (source.dailyMean) {
      result.status = 'daily_mean';
      continue;
    }

    try {
      const series = await io.fetch(dam.office ?? '', source.tsId, source.unit,
        new Date(now - lookbackHours * HOUR_MS), new Date(now), { skipCache: true });
      // Shift period-ending readings before excluding the still-open hour.
      const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
      const buckets = bucketHourly(series?.points ?? [], periodEndingMs(source.tsId))
        .filter((bucket) => Date.parse(bucket.observedHour) < currentHour);
      if (!buckets.length) {
        result.status = 'empty';
        continue;
      }
      result.latestObservedHour = buckets[buckets.length - 1].observedHour;
      result.written = await io.write(dam.id, metric, buckets);
      if (result.written !== buckets.length) result.status = 'write_failed';
      else if (now - Date.parse(result.latestObservedHour) > HISTORY_MAX_AGE_HOURS * HOUR_MS) result.status = 'stale';
      else result.status = 'ok';
    } catch (error) {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : String(error);
    }
  }
  return results;
}

/** This is the cron response consumed by withJobRun and the admin dashboard. */
export function summarizeHistorySync(streams: HistoryStreamResult[]) {
  const expected = streams.filter((stream) => stream.expected);
  const issues = streams.filter((stream) => stream.status !== 'ok');
  const metricsHealthy = expected.filter((stream) => stream.status === 'ok').length;
  const monitoring_status = issues.length === 0 ? 'ok' : metricsHealthy > 0 ? 'partial' : 'error';
  return {
    ok: monitoring_status === 'ok',
    monitoring_status,
    metricsExpected: expected.length,
    metricsHealthy,
    metricsSeen: streams.filter((stream) => stream.latestObservedHour !== null).length,
    written: streams.reduce((total, stream) => total + stream.written, 0),
    issues,
  };
}
