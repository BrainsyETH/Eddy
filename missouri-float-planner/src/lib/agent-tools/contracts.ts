import { z } from 'zod';
import { STALE_READING_HOURS } from '@shared/reading-staleness';

import manifest from '../../../server.json';
export const AGENT_VERSION = manifest.version;
export const BASE_URL = 'https://eddy.guide';
export const SAFETY_NOTE = 'Conditions describe measurements and recorded information, not a guarantee of safety or open access. Check official closures and recheck before launch.';
export const statusSchema = z.enum(['ok', 'partial', 'none_recorded', 'unavailable', 'lookup_failed', 'invalid_request', 'rate_limited']);
export type Status = z.infer<typeof statusSchema>;
export const resultShape = {
  status: statusSchema,
  data: z.record(z.unknown()),
  warnings: z.array(z.string()),
  safetyNote: z.string(),
};
export const resultSchema = z.object(resultShape);
export type AgentResult = z.infer<typeof resultSchema>;

export class AgentError extends Error {
  constructor(message: string, readonly status: Status = 'invalid_request') { super(message); }
}

export function result(data: Record<string, unknown>, status: Status = 'ok', warnings: string[] = []): AgentResult {
  return { status, data, warnings, safetyNote: SAFETY_NOTE };
}

export function freshness(observedAt: string | null | undefined, now = Date.now(), staleHours = STALE_READING_HOURS) {
  const time = observedAt ? Date.parse(observedAt) : NaN;
  const valid = Number.isFinite(time) && time <= now + 5 * 60_000;
  const ageMinutes = valid ? Math.max(0, (now - time) / 60_000) : null;
  return { observedAt: valid ? observedAt! : null, ageMinutes: ageMinutes == null ? null : Math.round(ageMinutes), stale: ageMinutes == null ? null : ageMinutes > staleHours * 60 };
}

export function localDate(now: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function tripDate(date: string | undefined, timeZone: string, now = Date.now()) {
  const today = localDate(now, timeZone);
  if (!date) return { date: today, future: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new AgentError('Use a valid local calendar date in YYYY-MM-DD format.');
  }
  if (date < today) throw new AgentError('Past trips are not supported; request today or a future date.');
  return { date, future: date > today };
}

export function combineStatus(statuses: Status[]): Status {
  const failures = statuses.filter(s => ['lookup_failed', 'unavailable', 'partial'].includes(s));
  return failures.length ? (failures.length === statuses.length && statuses.every(s => s === 'lookup_failed') ? 'lookup_failed' : 'partial') : 'ok';
}

export function memoizeAsync<K, V>(load: (key: K) => Promise<V>) {
  const cache = new Map<K, Promise<V>>();
  return (key: K) => {
    let value = cache.get(key);
    if (!value) { value = load(key); cache.set(key, value); }
    return value;
  };
}
