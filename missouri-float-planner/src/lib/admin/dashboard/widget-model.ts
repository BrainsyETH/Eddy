/** Daily counters only: no visitor identifiers, URLs, or message content. */
export interface WidgetRow {
  day: string;
  widget_type: string;
  widget_key: string;
  referrer_host: string;
  count: number;
}
export interface WidgetHistory {
  state: 'ok' | 'unknown';
  through: string;
  rows: WidgetRow[];
  firstPartyHosts: string[];
  reason?: string;
}
export type TrafficSource = 'external' | 'eddy' | 'unknown';
export function trafficSource(
  host: string,
  firstPartyHosts: string[] = [],
): TrafficSource {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'direct') return 'unknown';
  if (
    normalized === 'eddy.guide' ||
    normalized.endsWith('.eddy.guide') ||
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    firstPartyHosts.includes(normalized)
  )
    return 'eddy';
  return 'external';
}
export function widgetBreakdown(
  history: WidgetHistory | undefined,
  days: 7 | 30,
  filter: TrafficSource | 'all' = 'all',
  host?: string,
) {
  if (!history || history.state !== 'ok') return null;
  const end = Date.parse(history.through + 'T00:00:00Z');
  const start = new Date(end - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const period = history.rows.filter(
    (r) => r.day >= start && r.day <= history.through,
  );
  const totals = { all: 0, external: 0, eddy: 0, unknown: 0 };
  for (const row of period) {
    totals.all += row.count;
    totals[trafficSource(row.referrer_host, history.firstPartyHosts)] +=
      row.count;
  }
  const rows = period.filter(
    (r) =>
      (filter === 'all' ||
        trafficSource(r.referrer_host, history.firstPartyHosts) === filter) &&
      (!host || r.referrer_host === host),
  );
  const group = (key: 'referrer_host' | 'widget_type' | 'widget_key') => {
    const sums = new Map<string, number>();
    for (const row of rows)
      sums.set(row[key], (sums.get(row[key]) ?? 0) + row.count);
    return [...sums]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  const daily = Array.from({ length: days }, (_, i) => {
    const day = new Date(end - (days - 1 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      day,
      count: rows
        .filter((r) => r.day === day)
        .reduce((sum, r) => sum + r.count, 0),
    };
  });
  return {
    totals,
    total: rows.reduce((sum, r) => sum + r.count, 0),
    daily,
    hosts: group('referrer_host'),
    types: group('widget_type'),
    keys: group('widget_key'),
    start,
    end: history.through,
  };
}
