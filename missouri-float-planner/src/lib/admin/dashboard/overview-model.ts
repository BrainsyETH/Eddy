/** Serializable overview data. Never include credentials, user IDs, or event payloads. */
export interface DailyPoint {
  day: string;
  count: number;
}
export interface GrowthSeries {
  state: 'ok' | 'unknown';
  points: DailyPoint[];
  reason?: string;
}
export interface TimelineRun {
  job: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  duration_ms: number | null;
}
export interface TimelineJob {
  id: string;
  label: string;
  schedules: string[];
  nextAt: string | null;
  lastAt: string | null;
  lastStatus: string | null;
  runs: TimelineRun[];
}
export interface ServiceInfo {
  id: string;
  name: string;
  purpose: string;
  configuration: string;
  detail: string;
  href: string;
  provider?: string;
}
export interface OverviewData {
  widgets?: import('./widget-model').WidgetHistory;
  accounts: GrowthSeries;
  plans: GrowthSeries;
  timeline: {
    state: 'ok' | 'unknown';
    from: string;
    to: string;
    jobs: TimelineJob[];
    reason?: string;
  };
  services: ServiceInfo[];
}

/** Complete UTC days give both periods equal coverage; today is deliberately excluded. */
export function dailyCounts(
  rows: Array<{ created_at: string }>,
  end: number,
): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: 60 }, (_, i) => {
    const day = new Date(end - (60 - i) * 86400000).toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}
export function comparePeriod(series: GrowthSeries, days: 7 | 30) {
  if (series.state !== 'ok' || series.points.length !== 60) return null;
  const current = series.points.slice(-days);
  const previous = series.points.slice(-days * 2, -days);
  const total = current.reduce((sum, p) => sum + p.count, 0);
  const prior = previous.reduce((sum, p) => sum + p.count, 0);
  return {
    current,
    previous,
    total,
    prior,
    percent: prior ? ((total - prior) / prior) * 100 : null,
  };
}
export function friendlyJob(id: string): string {
  const [base, ...variants] = id.split(':');
  const variant = variants
    .map(
      (value) =>
        ({
          recreation_gov: 'Recreation.gov',
          mo_state_parks: 'Missouri State Parks',
          slot2: 'second batch',
        })[value] ?? value,
    )
    .join(' · ');
  const labels: Record<string, string> = {
    'update-gauges': 'Refresh river gauges',
    'sync-gauge-latest': 'Refresh gauge observations',
    'sync-dam-history': 'Record dam history',
    'sync-dam-snapshots': 'Refresh dam conditions',
    'snapshot-percentiles': 'Update flow comparisons',
    'evaluate-gauge-alerts': 'Check river alerts',
    'deliver-push': 'Send push alerts',
    'push-receipts': 'Check push receipts',
    'generate-eddy-updates': 'Write Eddy Reads',
    'generate-gauge-updates': 'Write gauge Reads',
    'post-social': 'Publish social posts',
    'social-preflight': 'Prepare social posts',
    'brand-check-pending': 'Review social branding',
    'post-clip': 'Publish clips',
    'post-blog': 'Publish blog posts',
    'fetch-insights': 'Collect social insights',
    'weekly-review': 'Weekly social review',
    'trust-tick': 'Check data quality',
    'rollup-telemetry': 'Save API usage history',
    'sync-nps': 'Sync national parks',
    'sync-usfs': 'Sync national forests',
    'sync-availability': 'Sync campsite availability',
  };
  return (
    (labels[base] ?? base.replaceAll('-', ' ')) +
    (variant
      ? ` · ${variant.replaceAll('high-frequency', 'priority gauges').replaceAll('global-only', 'Ozarks Pulse').replaceAll('source=', '').replaceAll('_', ' ')}`
      : '')
  );
}
