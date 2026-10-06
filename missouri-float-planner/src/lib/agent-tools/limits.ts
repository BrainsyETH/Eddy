import { admitMcpWork, type WorkBucket, type Admission } from './admission';
import { createHmac } from 'node:crypto';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { expensiveTool } from './http';

type Environment = Record<string, string | undefined>;

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000
    ? parsed
    : fallback;
}

export function mcpLimits(env: Environment = process.env) {
  return {
    requestsPerIp: positiveLimit(env.MCP_REQUESTS_PER_IP_PER_MINUTE, 600),
    heavyPerIp: positiveLimit(env.MCP_HEAVY_PER_IP_PER_MINUTE, 60),
    heavyGlobal: Math.max(
      2,
      positiveLimit(env.MCP_HEAVY_GLOBAL_PER_MINUTE, 120),
    ),
    searchGlobal: positiveLimit(env.MCP_SEARCH_GLOBAL_PER_MINUTE, 60),
    detailGlobal: positiveLimit(env.MCP_DETAIL_GLOBAL_PER_MINUTE, 60),
  };
}

/** Daily, keyed network-bucket identifier. Never a user or integration ID.
 * Use a dedicated key; Redis credential rotation must not change log IDs.
 * Without a secret, omit correlation instead of emitting an enumerable hash.
 */
export function mcpNetworkBucket(
  ip: string,
  env: Environment = process.env,
  now = Date.now(),
) {
  const secret = env.MCP_LOG_HASH_KEY;
  if (!secret || ip === 'unknown') return undefined;
  const day = new Date(now).toISOString().slice(0, 10);
  return `${day}:${createHmac('sha256', secret).update(`${day}:${ip}`).digest('hex').slice(0, 24)}`;
}

export function createMcpLimiter(
  ip: string,
  options: {
    env?: Environment;
    limit?: (...args: Parameters<typeof rateLimit>) => Promise<Response | null>;
    admit?: (buckets: WorkBucket[]) => Promise<Admission>;
    log?: (event: Record<string, unknown>) => void;
  } = {},
) {
  const env = { ...process.env, ...options.env };
  const limits = mcpLimits(env);
  const admit =
    options.admit ?? ((buckets: WorkBucket[]) => admitMcpWork(buckets, env));
  const limit = options.limit ?? rateLimit;
  const log =
    options.log ?? ((event) => logger.warn('[MCP] request rejected', event));
  const networkBucket = mcpNetworkBucket(ip, env);

  async function check(
    bucket: string,
    key: string,
    allowance: number,
    tool: string | null,
  ) {
    const response = await limit(key, allowance, 60_000, {
      failClosed: true,
      requireGlobalLimiter: true,
    });
    if (response) {
      try {
        log({
          bucket,
          ...(networkBucket ? { networkBucket } : {}),
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
    general: () =>
      check('ip_requests', `mcp:${ip}`, limits.requestsPerIp, null),
    async tool(body: unknown) {
      const tool = expensiveTool(body);
      if (!tool) return null;
      const search = tool === 'find_floats';
      const className = search ? 'search' : 'detail';
      const admission = await admit([
        {
          name: 'ip_heavy',
          key: `rl:{mcp-heavy}:ip:${ip}`,
          allowance: limits.heavyPerIp,
        },
        {
          name: `global_${className}`,
          key: `rl:{mcp-heavy}:${className}`,
          allowance: Math.min(
            search ? limits.searchGlobal : limits.detailGlobal,
            Math.floor(limits.heavyGlobal / 2),
          ),
        },
        {
          name: 'global_heavy',
          key: 'rl:{mcp-heavy}:global',
          allowance: limits.heavyGlobal,
        },
      ]);
      if (!admission) return null;
      try {
        log({
          bucket: admission.bucket,
          ...(networkBucket ? { networkBucket } : {}),
          tool,
          status: admission.response.status,
          retryAfter: admission.response.headers.get('retry-after'),
        });
      } catch {
        /* Logging does not affect admission. */
      }
      return admission.response;
    },
  };
}
