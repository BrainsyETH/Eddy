'use client';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useInspectMetric } from '@/components/admin/overview/MetricDetails';
import JobStatusTable from '@/components/admin/overview/JobStatusTable';
import OverviewDashboard from '@/components/admin/overview/OverviewDashboard';
import DashboardLinks from '@/components/admin/DashboardLinks';
import { adminFetch } from '@/hooks/useAdminAuth';
import {
  type DashboardSummary,
  type Metric,
} from '@/lib/admin/dashboard/model';

function Value({ metric }: { metric: Metric }) {
  if (metric.state !== 'ok')
    return (
      <span className="text-neutral-400">
        {metric.state === 'not_connected' ? 'Not connected' : 'Unknown'}
      </span>
    );
  if (Array.isArray(metric.value))
    return metric.value.length ? (
      <ol className="space-y-2 text-sm">
        {metric.value.map((row, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="break-words">{row.name}</span>
            <span className="tabular-nums">
              {Number(row.count).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <span className="text-neutral-400">No records in this period</span>
    );
  if (metric.value && typeof metric.value === 'object')
    return (
      <dl className="space-y-2 text-sm">
        {Object.entries(metric.value).map(([key, v]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt>{key.replaceAll('_', ' ')}</dt>
            <dd>
              {typeof v === 'boolean'
                ? v
                  ? 'On'
                  : 'Off'
                : String(v ?? 'Unknown')}
            </dd>
          </div>
        ))}
      </dl>
    );
  if (
    typeof metric.value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(metric.value)
  )
    return (
      <span className="text-base">
        {new Date(metric.value).toLocaleString()}
      </span>
    );
  return (
    <span>
      {typeof metric.value === 'number'
        ? metric.value.toLocaleString()
        : String(metric.value ?? 'Unknown')}
    </span>
  );
}
function Card({ metric }: { metric: Metric }) {
  const inspect = useInspectMetric();
  return (
    <article className="rounded-xl border border-neutral-700 bg-neutral-800 p-4">
      <h3 className="mb-3 text-sm font-medium text-neutral-300">
        {metric.label}
      </h3>
      <div className="text-2xl font-semibold text-white">
        <Value metric={metric} />
      </div>
      <button
        className="mt-3 text-sm text-primary-400 hover:underline"
        onClick={() => inspect({ key: metric.key })}
      >
        What this means & details →
      </button>
    </article>
  );
}
function Overview() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await adminFetch('/api/admin/summary', { signal });
      if (!response.ok) throw new Error('Summary failed');
      const data = await response.json();
      if (!signal?.aborted) {
        setSummary(data);
        setError(false);
      }
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const tick = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    const timer = setInterval(tick, 180000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);
  const metrics = summary?.metrics ?? [];
  return (
    <OverviewDashboard
      summary={summary}
      loading={loading}
      error={error}
      onRefresh={() => void refresh()}
    >
      <div className="rounded-xl bg-neutral-900 p-4 space-y-6">
        <DashboardLinks />
        {[...new Set(metrics.map((m) => m.section))].map((section) => (
          <details key={section}>
            <summary className="mb-4 cursor-pointer text-lg font-semibold text-white">
              {section}
            </summary>
            {section === 'Scheduled jobs' ? (
              <JobStatusTable
                timeline={summary?.overview?.timeline}
                metrics={metrics}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metrics
                  .filter((m) => m.section === section)
                  .map((m) => (
                    <Card key={m.key} metric={m} />
                  ))}
              </div>
            )}
          </details>
        ))}
      </div>
    </OverviewDashboard>
  );
}
export default function AdminDashboard() {
  return (
    <AdminLayout
      title="Dashboard"
      description="Health, usage, and work awaiting review"
    >
      <Overview />
    </AdminLayout>
  );
}
