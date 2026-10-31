'use client';
import { useState } from 'react';
import type { ServiceInfo } from '@/lib/admin/dashboard/overview-model';
import { needsAttention, type Metric } from '@/lib/admin/dashboard/model';
import { useInspectMetric } from './MetricDetails';
import { Panel, Status, fmt, type Tone } from './bits';
import styles from './overview.module.css';

function values(metric?: Metric): Record<string, unknown> {
  return metric?.state === 'ok' &&
    metric.value &&
    typeof metric.value === 'object' &&
    !Array.isArray(metric.value)
    ? metric.value
    : {};
}
const n = (v: unknown) => (typeof v === 'number' ? v : null);

const CANT_CHECK = { tone: 'quiet' as const, text: "Couldn't check", unknown: true };

/**
 * One plain status per service. Green needs a check that answered: a missing
 * or unreadable source is "Couldn't check", never healthy.
 */
export function serviceStatus(
  s: ServiceInfo,
  metrics: Metric[],
): { tone: Tone; text: string; unknown?: boolean } {
  const flagged = (key: string) =>
    metrics.some((m) => m.key === key && needsAttention(m));
  if (s.configuration.startsWith('Not configured') || s.configuration === 'Reporting not configured')
    return { tone: 'quiet', text: 'Not set up' };
  if (s.provider) {
    if (flagged(`errors_${s.provider}`))
      return { tone: 'bad', text: 'Failing more than usual' };
    if (flagged(`429_${s.provider}`))
      return { tone: 'warn', text: 'Asked us to slow down' };
    const today = n(values(metrics.find((m) => m.key === `upstream_${s.provider}`)).today);
    return today === null
      ? { tone: 'quiet', text: 'Not tracked' }
      : { tone: 'good', text: `${today.toLocaleString()} calls today` };
  }
  if (s.id === 'sentry') {
    if (metrics.some((m) => m.key === 'sentry' && m.state === 'not_connected'))
      return { tone: 'quiet', text: 'Not linked to dashboard' };
    const issues = metrics.filter((m) => m.key.startsWith('sentry_'));
    if (!issues.length || issues.some((m) => m.state !== 'ok'))
      return CANT_CHECK;
    const count = issues.reduce((sum, m) => sum + Number(m.value), 0);
    return count
      ? { tone: 'warn', text: `${count} active errors` }
      : { tone: 'good', text: 'No new errors' };
  }
  if (s.id === 'supabase')
    return metrics.some((m) => m.key === 'subscribers' && m.state === 'ok')
      ? { tone: 'good', text: 'Answering' }
      : { tone: 'bad', text: 'Not answering' };
  if (s.id === 'expo') {
    const off = metrics.find((m) => m.key === 'effective_push');
    if (off?.state === 'ok' && off.value === 1)
      return { tone: 'bad', text: 'Alerts switched off' };
    if (flagged('push_errors')) return { tone: 'warn', text: 'Some alerts failing' };
    const errors = metrics.find((m) => m.key === 'push_errors');
    return off?.state === 'ok' && errors?.state === 'ok'
      ? { tone: 'good', text: 'Sending alerts' }
      : CANT_CHECK;
  }
  if (s.id === 'vercel') {
    const jobs = metrics.filter((m) => m.key.startsWith('job_'));
    if (jobs.some(needsAttention)) return { tone: 'warn', text: 'A task needs a look' };
    if (!jobs.length || jobs.every((m) => m.state !== 'ok')) return CANT_CHECK;
    const unread = jobs.filter((m) => m.state !== 'ok').length;
    return unread
      ? { tone: 'quiet', text: `${unread} tasks not checked`, unknown: true }
      : { tone: 'good', text: 'Tasks on schedule' };
  }
  return { tone: 'quiet', text: 'Set up' };
}

export default function ServiceOverview({
  services,
  metrics,
}: {
  services: ServiceInfo[];
  metrics: Metric[];
}) {
  const inspect = useInspectMetric();
  const [selected, setSelected] = useState<string | null>(null);
  const statuses = services.map((s) => ({ s, status: serviceStatus(s, metrics) }));
  const problems = statuses.filter((x) => x.status.tone === 'bad' || x.status.tone === 'warn');
  const unknown = statuses.filter((x) => x.status.unknown).length;
  const service = services.find((s) => s.id === selected);
  const usage = values(metrics.find((m) => m.key === `upstream_${service?.provider}`));
  return (
    <Panel
      id="services"
      title="Outside services"
      hint="Are the services Eddy depends on working? Select one for details."
      action={
        <Status
          tone={
            problems.some((p) => p.status.tone === 'bad')
              ? 'bad'
              : problems.length
                ? 'warn'
                : unknown
                  ? 'quiet'
                  : 'good'
          }
        >
          {problems.length
            ? `${problems.length} to check`
            : unknown
              ? `${unknown} couldn't be checked`
              : 'No problems seen'}
        </Status>
      }
    >
      <div className={styles.services}>
        {statuses.map(({ s, status }) => (
          <button
            key={s.id}
            className={styles.service}
            aria-pressed={selected === s.id}
            onClick={() => setSelected(selected === s.id ? null : s.id)}
          >
            <b>{s.name}</b>
            <span>{s.purpose}</span>
            <Status tone={status.tone}>{status.text}</Status>
          </button>
        ))}
      </div>
      {service && (
        <div className={styles.detail} aria-live="polite">
          <h3>
            {service.name}: {service.purpose.toLowerCase()}
          </h3>
          {service.provider && (
            <div className={styles.usageStats}>
              <div>
                <span>Calls today</span>
                <strong>{fmt(n(usage.today))}</strong>
              </div>
              <div>
                <span>Calls, last 7 days</span>
                <strong>{fmt(n(usage.recorded_7_days))}</strong>
              </div>
              <div>
                <span>Failed today</span>
                <strong>
                  {n(usage.error_percent_today) === null ? '—' : `${usage.error_percent_today}%`}
                </strong>
              </div>
              <div>
                <span>95% of calls finish in</span>
                <strong>
                  {n(usage.p95_7_days) === null ? '—' : `${fmt(n(usage.p95_7_days))} ms`}
                </strong>
              </div>
            </div>
          )}
          <div className={styles.detailLinks}>
            <button
              className={styles.textButton}
              onClick={() => inspect({ key: `service:${service.id}` })}
            >
              All numbers for {service.name} ›
            </button>
            {service.href && !service.href.startsWith('#') && (
              <a href={service.href}>Open {service.name} ›</a>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
