'use client';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useInspectMetric } from '@/components/admin/overview/MetricDetails';
import JobStatusTable from '@/components/admin/overview/JobStatusTable';
import OverviewDashboard from '@/components/admin/overview/OverviewDashboard';
import DashboardLinks from '@/components/admin/DashboardLinks';
import styles from '@/components/admin/overview/overview.module.css';
import { adminFetch } from '@/hooks/useAdminAuth';
import {
  needsAttention,
  type DashboardSummary,
  type Metric,
} from '@/lib/admin/dashboard/model';
import { SECTION_NAMES, plain, valueText } from '@/lib/admin/dashboard/plain';

/** Compact value for a tile; lists and settings show their size, details open on click. */
function Value({ metric }: { metric: Metric }) {
  if (metric.state !== 'ok')
    return (
      <span className={styles.tileMissing}>
        {metric.state === 'not_connected' ? 'Not connected' : '—'}
      </span>
    );
  const words = valueText(metric);
  if (words) return <span>{words}</span>;
  if (Array.isArray(metric.value))
    return metric.value.length ? (
      <ol className={styles.tileList}>
        {metric.value.slice(0, 3).map((row, i) => (
          <li key={i}>
            <span>{row.name}</span>
            <span>{Number(row.count).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    ) : (
      <span className={styles.tileMissing}>None yet</span>
    );
  if (metric.value && typeof metric.value === 'object')
    return <span className={styles.tileSmall}>View settings</span>;
  if (typeof metric.value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(metric.value))
    return (
      <span className={styles.tileSmall}>
        {new Date(metric.value).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/Chicago',
        })}{' '}
        CT
      </span>
    );
  return (
    <span>
      {typeof metric.value === 'number'
        ? metric.value.toLocaleString()
        : String(metric.value ?? '—')}
    </span>
  );
}
function Tile({ metric, jobLabel }: { metric: Metric; jobLabel?: string }) {
  const inspect = useInspectMetric();
  return (
    <button
      className={styles.tile}
      data-alert={needsAttention(metric) || undefined}
      onClick={() => inspect({ key: metric.key })}
    >
      <span className={styles.tileTitle}>{plain(metric, jobLabel).title}</span>
      <strong>
        <Value metric={metric} />
      </strong>
    </button>
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
  const jobLabel = (key: string) =>
    summary?.overview?.timeline.jobs.find((j) => `job_${j.id}` === key)?.label;
  return (
    <OverviewDashboard
      summary={summary}
      loading={loading}
      error={error}
      onRefresh={() => void refresh()}
    >
      <div className={styles.everything}>
        <DashboardLinks />
        {[...new Set(metrics.map((m) => m.section))].map((section) => (
          <details key={section} className={styles.group}>
            <summary>{SECTION_NAMES[section] ?? section}</summary>
            {section === 'Scheduled jobs' ? (
              <JobStatusTable
                timeline={summary?.overview?.timeline}
                metrics={metrics}
              />
            ) : (
              <div className={styles.tiles}>
                {metrics
                  .filter((m) => m.section === section)
                  .map((m) => (
                    <Tile key={m.key} metric={m} jobLabel={jobLabel(m.key)} />
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
      description="How Eddy is doing and what needs you"
    >
      <Overview />
    </AdminLayout>
  );
}
