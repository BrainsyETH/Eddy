import { overviewData } from './overview';
import { usageMetrics } from '@/lib/telemetry/summary';
import { jobMetrics } from './jobs-summary';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_ENTITLEMENT_ID } from '@/lib/entitlement';
import {
  assembleMetrics,
  versionAdoption,
  type DashboardSummary,
  type Metric,
} from './model';

async function sentryMetrics(): Promise<Metric[]> {
  const token = process.env.SENTRY_DASHBOARD_TOKEN;
  const org = process.env.SENTRY_DASHBOARD_ORG;
  const projects = (process.env.SENTRY_DASHBOARD_PROJECTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!token || !org || !projects.length)
    return [
      {
        key: 'sentry',
        section: 'Errors',
        label: 'Sentry',
        detail: 'Configure a read-only dashboard token and project slugs.',
        href: 'https://sentry.io',
        attention: false,
        state: 'not_connected',
        value: null,
      },
    ];
  return Promise.all(
    projects.map(async (project) => {
      const meta = {
        key: `sentry_${project}`,
        section: 'Errors',
        label: `${project} · unresolved issues active in 24h`,
        detail: 'Up to 25 issues. Reported events, not total API failures.',
        href: `https://sentry.io/organizations/${encodeURIComponent(org)}/issues/`,
        attention: true,
      };
      try {
        const res = await fetch(
          `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved%20lastSeen%3A-24h&statsPeriod=24h&limit=25&environment=${encodeURIComponent(process.env.SENTRY_DASHBOARD_ENVIRONMENT ?? 'production')}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(3000),
          },
        );
        if (!res.ok) throw new Error('Sentry unavailable');
        const issues: unknown = await res.json();
        if (!Array.isArray(issues)) throw new Error('Invalid Sentry response');
        return { ...meta, state: 'ok' as const, value: issues.length };
      } catch {
        console.warn('[admin-dashboard] Sentry summary unavailable');
        return { ...meta, state: 'unknown' as const, value: null };
      }
    }),
  );
}

export const getDashboardSummary = unstable_cache(
  async (): Promise<DashboardSummary> => {
    const overviewPromise = overviewData();
    let metrics: Metric[];
    try {
      const db = createAdminClient();
      const { data, error } = await db
        .rpc('admin_dashboard_summary', {
          p_now: new Date().toISOString(),
          p_entitlement: DEFAULT_ENTITLEMENT_ID,
        })
        .abortSignal(AbortSignal.timeout(9000));
      metrics = assembleMetrics(error ? {} : (data ?? {}));
    } catch {
      metrics = assembleMetrics({});
    }
    const config = metrics.find((m) => m.key === 'app_config');
    const value =
      config?.state === 'ok' ? (config.value as Record<string, unknown>) : null;
    const pushOff =
      process.env.EXPO_PUSH_ENABLED === 'false' ||
      value?.push_enabled === false;
    metrics.push({
      key: 'effective_push',
      section: 'Configuration',
      label: 'Push sending disabled',
      detail:
        process.env.EXPO_PUSH_ENABLED === 'false'
          ? 'EXPO_PUSH_ENABLED=false'
          : value
            ? 'Includes environment and database switches.'
            : 'Configuration unreadable; sender uses its existing fail-open behavior.',
      href: '',
      attention: true,
      state: pushOff || value ? 'ok' : 'unknown',
      value: pushOff ? 1 : value ? 0 : null,
    });
    const versions = metrics.find((m) => m.key === 'versions');
    if (versions?.state === 'ok' && Array.isArray(versions.value) && value) {
      const adoption = versionAdoption(
        versions.value,
        String(value.min_supported_version),
        String(value.latest_version),
      );
      for (const [key, label, n] of [
        ['below_min', 'Devices below minimum', adoption.below],
        ['latest_version', 'Devices on latest release', adoption.newest],
        ['unknown_version', 'Devices with unknown version', adoption.unknown],
      ] as const) {
        metrics.push({
          key,
          section: 'Push & devices',
          label,
          detail: `Of ${adoption.total} recently seen push-registered iOS devices. Other versions are counted as unknown.`,
          href: '',
          attention: false,
          state: n === null ? 'unknown' : 'ok',
          value: n,
        });
      }
    }
    const [sentry, jobs, usage] = await Promise.all([
      sentryMetrics(),
      jobMetrics(),
      usageMetrics(),
    ]);
    metrics.push(...sentry, ...jobs, ...usage);
    return {
      generatedAt: new Date().toISOString(),
      metrics,
      overview: await overviewPromise,
    };
  },
  [
    'admin-dashboard-v4',
    process.env.VERCEL_ENV ?? 'development',
    process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  ],
  { revalidate: 180 },
);
