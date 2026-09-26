export const LATENCY_BOUNDS = [
  100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000,
] as const;
export type Provider =
  | 'usgs'
  | 'nws'
  | 'openweather'
  | 'mapbox'
  | 'anthropic'
  | 'mcp';
export type Outcome =
  | '2xx'
  | '3xx'
  | '4xx'
  | '5xx'
  | '429'
  | 'network'
  | 'timeout'
  | 'cancelled';
export type Kind = 'fetch_cache_possible' | 'fetch_no_store' | 'sdk' | 'tool';
export interface Observation {
  provider: Provider;
  operation: string;
  model?: string;
  kind: Kind;
  outcome: Outcome;
  durationMs: number;
  at: number;
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}
export interface UsageRow {
  day: string;
  environment: string;
  provider: string;
  operation: string;
  model: string;
  kind: string;
  sample_rate: number;
  observed_calls: number;
  estimated_calls: number;
  estimated_errors: number;
  observed_429s: number;
  histogram: number[];
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  collected_at: string;
}
export function bucket(ms: number): number {
  const i = LATENCY_BOUNDS.findIndex((n) => ms <= n);
  return i < 0 ? LATENCY_BOUNDS.length : i;
}
export function percentile(histogram: number[], q: number): string | null {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = Math.ceil(total * q);
  let n = 0;
  for (let i = 0; i < histogram.length; i++) {
    n += histogram[i];
    if (n >= target)
      return i < LATENCY_BOUNDS.length
        ? `≤${LATENCY_BOUNDS[i]} ms`
        : '>60000 ms';
  }
  return null;
}
export function dayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
export function dimensions(e: Observation, rate: number): string {
  const operation = /^[a-z0-9_-]{1,60}$/.test(e.operation)
    ? e.operation
    : 'other';
  const model =
    e.model && /^[a-zA-Z0-9_.-]{1,80}$/.test(e.model) ? e.model : 'none';
  return [e.provider, operation, model, e.kind, rate].join('|');
}
export function fields(e: Observation, rate: number): Array<[string, number]> {
  const key = dimensions(e, rate);
  const result: Array<[string, number]> = [
    [`${key}|count|${e.outcome}|${bucket(e.durationMs)}`, 1],
  ];
  if (e.tokens)
    for (const [name, n] of Object.entries(e.tokens))
      if (Number.isSafeInteger(n) && n >= 0 && n < 1e9)
        result.push([`${key}|token|${name}`, n]);
  return result;
}
export function decodeHash(
  hash: Record<string, string | number>,
  day: string,
  environment: string,
  collectedAt = new Date().toISOString(),
): UsageRow[] {
  const groups = new Map<string, UsageRow>();
  for (const [field, raw] of Object.entries(hash)) {
    if (field.startsWith('_')) continue;
    const [provider, operation, model, kind, rateText, type, outcome, bin] =
      field.split('|');
    const rate = Number(rateText),
      value = Number(raw);
    if (
      !['usgs', 'nws', 'openweather', 'mapbox', 'anthropic', 'mcp'].includes(
        provider,
      ) ||
      !Number.isFinite(value) ||
      value < 0 ||
      !(rate > 0 && rate <= 1) ||
      !['fetch_cache_possible', 'fetch_no_store', 'sdk', 'tool'].includes(kind)
    )
      continue;
    const key = [provider, operation, model, kind, rateText].join('|');
    let row = groups.get(key);
    if (!row) {
      row = {
        day,
        environment,
        provider,
        operation,
        model,
        kind,
        sample_rate: rate,
        observed_calls: 0,
        estimated_calls: 0,
        estimated_errors: 0,
        observed_429s: 0,
        histogram: Array(LATENCY_BOUNDS.length + 1).fill(0),
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        collected_at: collectedAt,
      };
      groups.set(key, row);
    }
    if (type === 'count') {
      const index = Number(bin);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > LATENCY_BOUNDS.length
      )
        continue;
      row.observed_calls += value;
      row.estimated_calls += value / rate;
      row.histogram[index] += value / rate;
      if (['4xx', '5xx', '429', 'network', 'timeout'].includes(outcome))
        row.estimated_errors += value / rate;
      if (outcome === '429') row.observed_429s += value;
    } else if (type === 'token') {
      const column = {
        input: 'input_tokens',
        output: 'output_tokens',
        cacheRead: 'cache_read_tokens',
        cacheWrite: 'cache_write_tokens',
      }[outcome] as
        | 'input_tokens'
        | 'output_tokens'
        | 'cache_read_tokens'
        | 'cache_write_tokens'
        | undefined;
      if (column) row[column] += value / rate;
    }
  }
  return [...groups.values()];
}
export function mergeHistograms(rows: Pick<UsageRow, 'histogram'>[]): number[] {
  return Array.from({ length: LATENCY_BOUNDS.length + 1 }, (_, i) =>
    rows.reduce((n, r) => n + (r.histogram[i] ?? 0), 0),
  );
}
export function historyDays(now: number, lookback = 7): string[] {
  return Array.from({ length: lookback }, (_, i) => dayOf(now - i * 86400000));
}
