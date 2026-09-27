import { createHmac } from 'node:crypto';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { expensiveTool } from './http';

type Environment = Record<string, string | undefined>;

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : fallback;
}

export function mcpLimits(env: Environment = process.env) {
  return {
    requestsPerIp: positiveLimit(env.MCP_REQUESTS_PER_IP_PER_MINUTE, 600),
    heavyPerIp: positiveLimit(env.MCP_HEAVY_PER_IP_PER_MINUTE, 60),
    heavyGlobal: positiveLimit(env.MCP_HEAVY_GLOBAL_PER_MINUTE, 120),
  };
}

/** Daily, keyed network-bucket identifier. Never a user or integration ID.
 * Reuse the server's limiter secret unless a dedicated logging key is set.
 * Without a secret, omit correlation instead of emitting an enumerable hash.
 */
export function mcpNetworkBucket(ip: string, env: Environment = process.env, now = Date.now()) {
  const secret = env.MCP_LOG_HASH_KEY || env.UPSTASH_REDIS_REST_TOKEN;
  if (!secret || ip === 'unknown') return 'unavailable';
  const day = new Date(now).toISOString().slice(0, 10);
  return `${day}:${createHmac('sha256', secret).update(`${day}:${ip}`).digest('hex').slice(0, 24)}`;
}

export function createMcpLimiter(
  ip: string,
  options: {
    env?: Environment;
    limit?: (...args: Parameters<typeof rateLimit>) => Promise<Response | null>;
    log?: (event: Record<string, unknown>) => void;
  } = {},
) {
  const limits = mcpLimits(options.env);
  const limit = options.limit ?? rateLimit;
  const log = options.log ?? ((event) => logger.warn('[MCP] request rejected', event));
  const networkBucket = mcpNetworkBucket(ip, options.env);

  async function check(bucket: string, key: string, allowance: number, tool: string | null) {
    const response = await limit(key, allowance, 60_000, {
      failClosed: true,
      requireGlobalLimiter: true,
    });
    if (response) {
      try {
        log({
          bucket,
          networkBucket,
          tool,
          status: response.status,
          retryAfter: response.headers.get('retry-after'),
        });
      } catch {
        /* Diagnostics must not change admission decisions. */
      }
    }
    return response;
  }

  return {
    networkBucket,
    general: () => check('ip_requests', `mcp:${ip}`, limits.requestsPerIp, null),
    async tool(body: unknown) {
      const tool = expensiveTool(body);
      if (!tool) return null;
      // The whole find_floats request is one admission. Its internal work is
      // separately bounded to six estimates, with at most two in parallel.
      const perIp = await check('ip_heavy', `mcp-heavy:${ip}`, limits.heavyPerIp, tool);
      if (perIp) return perIp;
      return check('global_heavy', 'mcp-heavy:global', limits.heavyGlobal, tool);
    },
  };
}
