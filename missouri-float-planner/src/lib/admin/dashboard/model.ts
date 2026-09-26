import { METRICS } from './catalog';
export type MetricValue = number | string | boolean | null | Record<string, unknown> | Array<{ name: string; count: number }>;
export interface Metric { key: string; section: string; label: string; detail: string; href: string; attention: boolean; state: 'ok' | 'unknown' | 'not_connected'; value: MetricValue; reason?: string }
export interface DashboardSummary { generatedAt: string; metrics: Metric[] }
export function assembleMetrics(raw: Record<string, { state: 'ok' | 'unknown'; value: MetricValue; reason?: string }>): Metric[] {
  return METRICS.map(meta => ({ ...meta, ...(raw[meta.key] ?? { state: 'unknown' as const, value: null, reason: 'Source unavailable' }) }));
}
export function needsAttention(metric: Metric): boolean {
  return metric.attention && metric.state === 'ok' && typeof metric.value === 'number' && metric.value > 0;
}
export function inboxCount(metrics: Metric[]): number | null {
  const inbox = metrics.filter(m => m.section === 'Inbox');
  return inbox.length === 3 && inbox.every(m => m.state === 'ok' && typeof m.value === 'number')
    ? inbox.reduce((n,m) => n + Number(m.value),0) : null;
}
function version(v: string): number[] | null { return /^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null; }
export function versionAdoption(rows: Array<{name:string;count:number}>, minimum: string, latest: string) {
  const min = version(minimum); const current = version(latest);
  let below = 0, newest = 0, unknown = 0, total = 0;
  for (const row of rows) {
    total += row.count; const parts = version(row.name);
    if (!parts) { unknown += row.count; continue; }
    if (min) { const diff = parts.map((v,i)=>v-min[i]).find(v=>v!==0) ?? 0; if (diff<0) below += row.count; }
    if (current && parts.every((v,i)=>v===current[i])) newest += row.count;
  }
  return { below: min ? below : null, newest: current ? newest : null, unknown, total };
}
