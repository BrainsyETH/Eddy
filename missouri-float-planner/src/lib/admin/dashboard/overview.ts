import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { scheduledJobs, type JobSnapshot } from './jobs-summary';
import { nextScheduledAt } from './job-schedule';
import {
  dailyCounts,
  friendlyJob,
  type GrowthSeries,
  type OverviewData,
  type ServiceInfo,
  type TimelineRun,
} from './overview-model';

/** Indexed, time-bounded reads, cached with the summary. Refuse oversized results
 * rather than silently charting the first page. Only aggregate counts leave the server. */
async function growth(
  table: 'profiles' | 'float_plans',
  end: number,
): Promise<GrowthSeries> {
  try {
    const db = createAdminClient();
    const signal = AbortSignal.timeout(5000);
    const query = () =>
      db
        .from(table)
        .select('id,created_at', { count: 'exact' })
        .gte('created_at', new Date(end - 60 * 86400000).toISOString())
        .lt('created_at', new Date(end).toISOString())
        .order('created_at')
        .order('id');
    const first = await query().range(0, 999).abortSignal(signal);
    if (first.error || first.count === null || first.count > 10000)
      throw new Error('History unavailable or exceeds safe read limit');
    const rest = await Promise.all(
      Array.from(
        { length: Math.max(0, Math.ceil(first.count / 1000) - 1) },
        (_, i) =>
          query()
            .range((i + 1) * 1000, (i + 2) * 1000 - 1)
            .abortSignal(signal),
      ),
    );
    if (rest.some((r) => r.error)) throw new Error('History unavailable');
    const rows = [first, ...rest].flatMap((r) => r.data ?? []);
    if (rows.length !== first.count)
      throw new Error('History changed during read');
    return { state: 'ok', points: dailyCounts(rows, end) };
  } catch {
    return {
      state: 'unknown',
      points: [],
      reason:
        'History unavailable or above the 10,000-record safe read limit. Current totals remain in Diagnostics.',
    };
  }
}

/** Configuration is distinct from activity and health. No external probe is made. */
export function serviceRegistry(
  env: NodeJS.ProcessEnv = process.env,
): ServiceInfo[] {
  const configured = (...keys: string[]) =>
    keys.every((k) => Boolean(env[k])) ? 'Configured' : 'Not configured';
  return [
    {
      id: 'mcp',
      name: 'Eddy MCP',
      purpose: 'River tools for AI agents',
      configuration: 'Public endpoint',
      provider: 'mcp',
      detail:
        'Tool invocations, not HTTP requests. Global rate limits use the existing Redis store when configured.',
      href: '#diagnostics',
    },
    {
      id: 'usgs',
      name: 'USGS',
      purpose: 'River levels & flow',
      configuration: 'Public API',
      provider: 'usgs',
      detail:
        'Gauge freshness is shown separately. Usage can include cached fetches.',
      href: '/admin/gauges',
    },
    {
      id: 'nws',
      name: 'National Weather Service',
      purpose: 'Weather alerts',
      configuration: 'Public API',
      provider: 'nws',
      detail:
        'No API credential required. No activity does not establish an outage.',
      href: '#diagnostics',
    },
    {
      id: 'openweather',
      name: 'OpenWeather',
      purpose: 'Local forecasts',
      configuration: configured('OPENWEATHER_API_KEY'),
      provider: 'openweather',
      detail: 'Cache-inclusive fetches cannot establish billed quota usage.',
      href: '#diagnostics',
    },
    {
      id: 'mapbox',
      name: 'Mapbox',
      purpose: 'Directions & geocoding',
      configuration: configured('MAPBOX_ACCESS_TOKEN'),
      provider: 'mapbox',
      detail:
        'Server calls only. Browser and iOS map loads and tiles are excluded.',
      href: 'https://account.mapbox.com/statistics/',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      purpose: 'Eddy Reads & assistant',
      configuration: configured('ANTHROPIC_API_KEY'),
      provider: 'anthropic',
      detail:
        'Recorded logical calls and token estimates, not an invoice. See AI feature costs in Diagnostics.',
      href: '/admin/ai-models',
    },
    {
      id: 'supabase',
      name: 'Supabase',
      purpose: 'Database & accounts',
      configuration: configured(
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
      ),
      detail:
        'Successful dashboard queries show database access, not whole-platform uptime.',
      href: '#diagnostics',
    },
    {
      id: 'vercel',
      name: 'Vercel',
      purpose: 'Website & scheduled jobs',
      configuration: env.VERCEL ? 'Configured' : 'Local environment',
      detail:
        'The timeline shows recorded executions. Hosting traffic and function billing are not collected.',
      href: '#automation',
    },
    {
      id: 'revenuecat',
      name: 'RevenueCat',
      purpose: 'Premium subscriptions',
      configuration: configured('REVENUECAT_WEBHOOK_SECRET'),
      detail:
        'Subscriptions come from stored webhook events. A quiet webhook is not proof of failure.',
      href: '#diagnostics',
    },
    {
      id: 'expo',
      name: 'Expo',
      purpose: 'iOS push notifications',
      configuration:
        env.EXPO_PUSH_ENABLED === 'false'
          ? 'Sending disabled'
          : 'Sender available',
      detail:
        'App configuration can also disable push. Expo acceptance is not confirmed delivery to a phone.',
      href: '#diagnostics',
    },
    {
      id: 'sentry',
      name: 'Sentry',
      purpose: 'Website & app errors',
      configuration:
        env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN
          ? 'Reporting configured'
          : 'Reporting not configured',
      detail:
        'Issue summaries require a separate read token. Error collection can work while dashboard access is missing.',
      href: 'https://sentry.io',
    },
    {
      id: 'redis',
      name: 'Upstash Redis',
      purpose: 'Rate limits & API counters',
      configuration: configured(
        'UPSTASH_REDIS_REST_URL',
        'UPSTASH_REDIS_REST_TOKEN',
      ),
      detail: `Rate-limit configuration shown. Telemetry ${env.UPSTREAM_TELEMETRY_ENABLED === 'true' ? 'enabled' : 'off'}; sharing the rate-limit store requires explicit opt-in.`,
      href: '#diagnostics',
    },
    {
      id: 'resend',
      name: 'Resend',
      purpose: 'Email delivery',
      configuration: configured('RESEND_API_KEY'),
      detail:
        'Configuration only; email provider delivery statistics are not ingested.',
      href: '/admin/feedback',
    },
  ];
}

export async function overviewData(): Promise<OverviewData> {
  const now = Date.now();
  const end = Date.parse(new Date(now).toISOString().slice(0, 10));
  const from = new Date(now - 6 * 3600000).toISOString();
  const to = new Date(now).toISOString();
  const timelinePromise = (async (): Promise<OverviewData['timeline']> => {
    try {
      const db = createAdminClient();
      const [recent, status] = await Promise.all([
        db
          .from('admin_job_runs')
          .select('job,started_at,finished_at,status,duration_ms', {
            count: 'exact',
          })
          .gte('started_at', from)
          .lte('started_at', to)
          .order('started_at', { ascending: false })
          .limit(1000)
          .abortSignal(AbortSignal.timeout(4000)),
        db
          .rpc('admin_dashboard_job_status')
          .abortSignal(AbortSignal.timeout(4000)),
      ]);
      if (
        recent.error ||
        status.error ||
        !status.data ||
        recent.count === null ||
        recent.count > 1000
      )
        throw new Error('Incomplete timeline');
      const snapshot = status.data as JobSnapshot;
      return {
        state: 'ok',
        from,
        to,
        jobs: [...scheduledJobs()].map(([id, schedules]) => {
          const last = snapshot.runs.find((r) => r.job === id);
          let nextAt: string | null = null;
          try {
            nextAt = new Date(
              nextScheduledAt(
                schedules.map((s) => s.schedule),
                now,
              ),
            ).toISOString();
          } catch {
            /* Unsupported schedule stays unknown. */
          }
          return {
            id,
            label: friendlyJob(id),
            schedules: schedules.map((s) => s.schedule),
            nextAt,
            lastAt: last?.started_at ?? null,
            lastStatus: last?.status ?? null,
            runs: ((recent.data ?? []) as TimelineRun[]).filter(
              (r) => r.job === id,
            ),
          };
        }),
      };
    } catch {
      return {
        state: 'unknown',
        from,
        to,
        jobs: [],
        reason:
          'Run history is unavailable or exceeds the safe display limit. Check job status in Diagnostics.',
      };
    }
  })();
  const [accounts, plans, timeline] = await Promise.all([
    growth('profiles', end),
    growth('float_plans', end),
    timelinePromise,
  ]);
  return { accounts, plans, timeline, services: serviceRegistry() };
}
