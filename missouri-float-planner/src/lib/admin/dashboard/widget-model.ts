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
/**
 * Social, search and webmail hosts send a referrer when someone opens a
 * widget link from them. That is a shared link, not a site embedding Eddy, so
 * these never count toward embedding sites.
 */
const LINK_HOST =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|t\.co|twitter\.com|x\.com|threads\.net|reddit\.com|linkedin\.com|lnkd\.in|pinterest\.com|youtube\.com|tiktok\.com|google\.[a-z.]+|googleusercontent\.com|bing\.com|duckduckgo\.com|yahoo\.com|baidu\.com|yandex\.[a-z]+|ecosia\.org|outlook\.live\.com|live\.com|office\.com)$/;
export const isLinkHost = (host: string) =>
  LINK_HOST.test(host.toLowerCase().replace(/\.$/, ''));

export interface EmbedSite {
  host: string;
  /** Loads in the 30-day window. */
  loads: number;
  /** Loads in the last 7 days of the window. */
  loads7: number;
  firstDay: string;
  lastDay: string;
  /** First load in the 30-day window came in the last 7 days. */
  isNew: boolean;
  /** Loaded earlier in the window but not in the last 7 days. */
  quiet: boolean;
  /** One count per day, oldest first, across the 30-day window. */
  daily: number[];
}

/**
 * Which outside websites show an Eddy widget. Counts distinct external hosts
 * over the 30 days the dashboard holds; Eddy's own pages, unknown referrers
 * and shared-link hosts (social, search, webmail) are excluded and reported
 * separately so the headline is "sites", not "traffic".
 */
export function embedSites(history: WidgetHistory | undefined) {
  if (!history || history.state !== 'ok') return null;
  const end = Date.parse(history.through + 'T00:00:00Z');
  const dayAt = (i: number) =>
    new Date(end - (29 - i) * 86400000).toISOString().slice(0, 10);
  const start = dayAt(0);
  const start7 = dayAt(23);
  const sites = new Map<string, EmbedSite>();
  const links = new Map<string, number>();
  let unknownLoads = 0;
  for (const row of history.rows) {
    if (row.day < start || row.day > history.through) continue;
    const source = trafficSource(row.referrer_host, history.firstPartyHosts);
    if (source === 'unknown') {
      unknownLoads += row.count;
      continue;
    }
    if (source !== 'external') continue;
    const host = row.referrer_host.toLowerCase().replace(/\.$/, '');
    if (isLinkHost(host)) {
      links.set(host, (links.get(host) ?? 0) + row.count);
      continue;
    }
    const site = sites.get(host) ?? {
      host,
      loads: 0,
      loads7: 0,
      firstDay: row.day,
      lastDay: row.day,
      isNew: false,
      quiet: false,
      daily: Array.from({ length: 30 }, () => 0),
    };
    site.loads += row.count;
    if (row.day >= start7) site.loads7 += row.count;
    if (row.day < site.firstDay) site.firstDay = row.day;
    if (row.day > site.lastDay) site.lastDay = row.day;
    const index = Math.round(
      (Date.parse(row.day + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) /
        86400000,
    );
    if (index >= 0 && index < 30) site.daily[index] += row.count;
    sites.set(host, site);
  }
  const list = [...sites.values()]
    .map((s) => ({
      ...s,
      isNew: s.firstDay >= start7,
      quiet: s.lastDay < start7,
    }))
    .sort((a, b) => b.loads - a.loads || a.host.localeCompare(b.host));
  return {
    start,
    end: history.through,
    sites: list,
    total: list.length,
    activeThisWeek: list.filter((s) => s.loads7 > 0).length,
    newThisWeek: list.filter((s) => s.isNew).length,
    quietThisWeek: list.filter((s) => s.quiet).length,
    links: [...links]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unknownLoads,
  };
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
