'use client';
import { useState } from 'react';
import type { ServiceInfo } from '@/lib/admin/dashboard/overview-model';
import type { Metric } from '@/lib/admin/dashboard/model';
import styles from './overview.module.css';

function values(metric?: Metric): Record<string, unknown> {
  return metric?.state === 'ok' &&
    metric.value &&
    typeof metric.value === 'object' &&
    !Array.isArray(metric.value)
    ? metric.value
    : {};
}
const number = (n: unknown, suffix = '') =>
  typeof n === 'number' ? n.toLocaleString() + suffix : 'Not measured';
export default function ServiceOverview({
  services,
  metrics,
}: {
  services: ServiceInfo[];
  metrics: Metric[];
}) {
  const [selected, setSelected] = useState('usgs');
  const service = services.find((s) => s.id === selected) ?? services[0];
  const metric = metrics.find((m) => m.key === `upstream_${service?.provider}`);
  const usage = values(metric);
  function activity(s: ServiceInfo) {
    if (s.provider) {
      const today = values(
        metrics.find((m) => m.key === `upstream_${s.provider}`),
      ).today;
      return typeof today === 'number'
        ? `${today.toLocaleString()} recorded / estimated today`
        : 'Usage not measured';
    }
    if (s.id === 'sentry') {
      const issues = metrics.filter((m) => m.key.startsWith('sentry_'));
      return issues.length && issues.every((m) => m.state === 'ok')
        ? `${issues.reduce((n, m) => n + Number(m.value), 0)} active issues (bounded)`
        : 'Issue summary not connected or unavailable';
    }
    if (s.id === 'supabase')
      return metrics.some((m) => m.key === 'subscribers' && m.state === 'ok')
        ? 'Dashboard query succeeded'
        : 'Dashboard query unavailable';
    if (s.id === 'expo') {
      const disabled = metrics.find((m) => m.key === 'effective_push');
      return disabled?.state === 'ok'
        ? disabled.value === 1
          ? 'Push sending disabled'
          : 'Push switch on; delivery tracked separately'
        : 'Push switch unknown';
    }
    return 'Health not independently checked';
  }
  return (
    <section className={styles.panel} aria-labelledby="services-title">
      <div className={styles.panelHead}>
        <div>
          <h2 id="services-title">Your connected services</h2>
          <p>What powers Eddy, what we can see, and where coverage stops.</p>
        </div>
        <span className={styles.pill}>{services.length} integrations</span>
      </div>
      <div className={styles.services}>
        {services.map((s) => (
          <button
            key={s.id}
            className={styles.service}
            aria-pressed={selected === s.id}
            onClick={() => setSelected(s.id)}
          >
            <span className={styles.serviceName}>
              {s.name}
              <span aria-hidden="true">↗</span>
            </span>
            <span>{s.purpose}</span>
            <strong>{s.configuration}</strong>
            <small>{activity(s)}</small>
          </button>
        ))}
      </div>
      {service && (
        <div className={styles.detail} aria-live="polite">
          <div className={styles.panelHead}>
            <h3>
              {service.name} · {service.purpose}
            </h3>
            <a href={service.href}>Inspect →</a>
          </div>
          <p>{service.detail}</p>
          {service.provider && (
            <>
              <div className={styles.usageStats}>
                <div>
                  <span>Calls today (UTC)</span>
                  <strong>{number(usage.today)}</strong>
                </div>
                <div>
                  <span>Recorded / estimated · 7 days</span>
                  <strong>{number(usage.recorded_7_days)}</strong>
                </div>
                <div>
                  <span>Errors today</span>
                  <strong>{number(usage.error_percent_today, '%')}</strong>
                </div>
                <div>
                  <span>p95 latency · 7 days</span>
                  <strong>{number(usage.p95_7_days, ' ms')}</strong>
                </div>
              </div>
              <p className={styles.note}>
                {metric?.detail ??
                  'API counters are not available. The integration can still be working. Telemetry is opt-in and does not backfill earlier calls.'}
              </p>
            </>
          )}
          <p className={styles.note}>
            {activity(service)}. Configuration alone does not establish service
            health.
          </p>
        </div>
      )}
    </section>
  );
}
