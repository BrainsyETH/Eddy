/** MCP work admission is all-or-nothing across the IP, class and global limits.
 * General HTTP attempt limiting remains separate. No rejected work consumes
 * any of these allowances. Redis executes the check/increment atomically.
 */
export interface WorkBucket {
  name: string;
  key: string;
  allowance: number;
}
export type Admission = { bucket: string; response: Response } | null;
type Environment = Record<string, string | undefined>;

export const ADMISSION_SCRIPT = `
local window = tonumber(ARGV[1])
for i, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') >= tonumber(ARGV[i + 1]) then
    local ttl = redis.call('PTTL', key)
    if ttl < 1 then ttl = window end
    return {i, ttl}
  end
end
for _, key in ipairs(KEYS) do
  redis.call('INCR', key)
  if redis.call('PTTL', key) < 0 then redis.call('PEXPIRE', key, window) end
end
return {0, 0}
`;

const memory = new Map<string, { count: number; resetAt: number }>();
function rejected(bucket: string, status: number, seconds: number): Admission {
  return {
    bucket,
    response: Response.json(
      {
        error:
          status === 429
            ? 'Work capacity reached. Please retry later.'
            : 'Work limiter unavailable. Please retry later.',
      },
      {
        status,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil(seconds))),
          'Cache-Control': 'private, no-store',
        },
      },
    ),
  };
}

export async function admitMcpWork(
  buckets: WorkBucket[],
  env: Environment = process.env,
): Promise<Admission> {
  const windowMs = 60_000;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          'EVAL',
          ADMISSION_SCRIPT,
          buckets.length,
          ...buckets.map((b) => b.key),
          windowMs,
          ...buckets.map((b) => b.allowance),
        ]),
        cache: 'no-store',
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) throw new Error('Limiter request failed');
      const payload = (await response.json()) as {
        result?: unknown;
        error?: string;
      };
      const value = payload.result;
      if (
        payload.error ||
        !Array.isArray(value) ||
        value.length !== 2 ||
        !Number.isInteger(value[0]) ||
        value[0] < 0 ||
        value[0] > buckets.length ||
        !Number.isFinite(value[1]) ||
        value[1] < 0
      )
        throw new Error('Invalid limiter result');
      return value[0] === 0
        ? null
        : rejected(buckets[value[0] - 1].name, 429, value[1] / 1000);
    } catch {
      // Never log credentials, URLs or raw network keys on failures.
      return rejected('limiter_unavailable', 503, 30);
    }
  }
  if (env.NODE_ENV === 'production' || url || token)
    return rejected('limiter_unavailable', 503, 30);

  // Synchronous section: the development fallback has the same atomic
  // admission semantics in this process, not across serverless instances.
  const now = Date.now();
  for (const [key, value] of memory)
    if (value.resetAt <= now) memory.delete(key);
  for (const bucket of buckets) {
    const value = memory.get(bucket.key);
    if (value && value.count >= bucket.allowance)
      return rejected(bucket.name, 429, (value.resetAt - now) / 1000);
  }
  for (const bucket of buckets) {
    const value = memory.get(bucket.key) ?? {
      count: 0,
      resetAt: now + windowMs,
    };
    value.count++;
    memory.set(bucket.key, value);
  }
  return null;
}
