import { fields, dayOf, type Observation } from './model';
export function telemetryConfig() {
  const enabled = process.env.UPSTREAM_TELEMETRY_ENABLED === 'true';
  const shared = process.env.UPSTREAM_TELEMETRY_ALLOW_SHARED_REDIS === 'true';
  const url =
    process.env.TELEMETRY_REDIS_REST_URL ||
    (shared ? process.env.UPSTASH_REDIS_REST_URL : undefined);
  const token =
    process.env.TELEMETRY_REDIS_REST_TOKEN ||
    (shared ? process.env.UPSTASH_REDIS_REST_TOKEN : undefined);
  const environment =
    process.env.VERCEL_ENV === 'production'
      ? 'production'
      : process.env.VERCEL_ENV === 'preview'
        ? 'preview'
        : 'development';
  const numeric = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(process.env[key] ?? fallback);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  return {
    enabled: enabled && !!url && !!token,
    url,
    token,
    environment,
    shared,
    sampleRate: numeric('UPSTREAM_TELEMETRY_SAMPLE_RATE', 0.1, 0, 1),
    dailyBudget: Math.floor(
      numeric('UPSTREAM_TELEMETRY_DAILY_COMMAND_BUDGET', 2000, 100, 100000),
    ),
    batchSize: 50,
  };
}
export function hashKey(day: string, environment: string) {
  return `eddy:upstream:v1:${environment}:${day}`;
}
export async function redisCommand(command: unknown[]): Promise<unknown> {
  const config = telemetryConfig();
  if (!config.enabled) throw new Error('Telemetry not connected');
  const response = await fetch(config.url!, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) throw new Error('Telemetry store unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Telemetry command failed');
  return data.result;
}
// Atomic per-day budget and counters. Budget is conservative Redis operations,
// not a billing guarantee: rejected probes/EVAL overhead also consume commands.
// Never share with security rate limits unless explicitly enabled by the operator.
export const RECORD_SCRIPT = `
local used=tonumber(redis.call('HGET',KEYS[1],'_commands') or '0')
local cost=4+(#ARGV-2)/2
if used+cost>tonumber(ARGV[1]) then redis.call('HSET',KEYS[1],'_budget_exhausted',1) return 0 end
redis.call('HINCRBY',KEYS[1],'_commands',cost)
for i=3,#ARGV,2 do redis.call('HINCRBY',KEYS[1],ARGV[i],ARGV[i+1]) end
redis.call('HSET',KEYS[1],'_last_write',ARGV[2])
redis.call('EXPIRE',KEYS[1],691200,'NX')
return 1`;
let pauseUntil = 0;
export async function recordBatch(
  events: Array<{ event: Observation; rate: number }>,
  dropped = 0,
): Promise<void> {
  const config = telemetryConfig();
  if (!config.enabled || Date.now() < pauseUntil) return;
  const days = new Map<string, Map<string, number>>();
  for (const { event, rate } of events) {
    const day = dayOf(event.at);
    const group = days.get(day) ?? new Map<string, number>();
    for (const [key, n] of fields(event, rate))
      group.set(key, (group.get(key) ?? 0) + n);
    days.set(day, group);
  }
  for (const [day, group] of days) {
    if (dropped) {
      group.set('_buffer_dropped', dropped);
      dropped = 0;
    }
    try {
      const ok = await redisCommand([
        'EVAL',
        RECORD_SCRIPT,
        1,
        hashKey(day, config.environment),
        config.dailyBudget,
        Date.now(),
        ...[...group].flat(),
      ]);
      if (ok === 0) {
        pauseUntil = Date.parse(dayOf(Date.now())) + 86400000;
        return;
      }
    } catch {
      pauseUntil = Date.now() + 60000;
      console.warn(
        '[telemetry] Collection unavailable; pausing for one minute',
      );
      return;
    }
  }
}
export async function readHash(
  day: string,
): Promise<Record<string, string | number> | null> {
  const config = telemetryConfig();
  const result = await redisCommand([
    'HGETALL',
    hashKey(day, config.environment),
  ]);
  if (!Array.isArray(result)) throw new Error('Invalid telemetry response');
  if (result.length === 0) return null;
  return Object.fromEntries(
    Array.from({ length: result.length / 2 }, (_, i) => [
      String(result[2 * i]),
      result[2 * i + 1],
    ]),
  );
}
