'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { DashboardSummary, Metric } from '@/lib/admin/dashboard/model';
import { comparePeriod } from '@/lib/admin/dashboard/overview-model';
import {
  widgetBreakdown,
  type TrafficSource,
} from '@/lib/admin/dashboard/widget-model';
import styles from './overview.module.css';

export interface DetailTarget {
  key: string;
  name?: string;
}
export const InspectMetricContext = createContext<
  (target: DetailTarget) => void
>(() => {});
export const useInspectMetric = () => useContext(InspectMetricContext);
const friendly = (key: string) => key.replaceAll('_', ' ').replaceAll('-', ' ');
const day = (value: string) =>
  new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** Use the same values and windows as the overview. Never invent missing history. */
function MetricValue({ metric }: { metric: Metric }) {
  if (metric.state !== 'ok')
    return (
      <p>
        {metric.state === 'not_connected'
          ? 'Not connected — this source has not been configured for dashboard reporting.'
          : 'Unavailable — this snapshot could not establish a value.'}
      </p>
    );
  if (Array.isArray(metric.value))
    return metric.value.length ? (
      <table className={styles.detailTable}>
        <thead>
          <tr>
            <th>Breakdown</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {metric.value.map((r, i) => (
            <tr key={i}>
              <td>{r.name}</td>
              <td>{r.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p>No records in this period.</p>
    );
  if (metric.value && typeof metric.value === 'object')
    return (
      <dl className={styles.valueList}>
        {Object.entries(metric.value).map(([key, value]) => (
          <div key={key}>
            <dt>{friendly(key)}</dt>
            <dd>
              {typeof value === 'boolean'
                ? value
                  ? 'On'
                  : 'Off'
                : String(value ?? 'Unknown')}
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <strong className={styles.detailNumber}>
      {typeof metric.value === 'number'
        ? metric.value.toLocaleString()
        : typeof metric.value === 'string' &&
            /^\d{4}-\d\d-\d\dT/.test(metric.value)
          ? new Date(metric.value).toLocaleString('en-US', {
              timeZone: 'America/Chicago',
            }) + ' CT'
          : String(metric.value ?? 'Unknown')}
    </strong>
  );
}

function WidgetDetails({ summary }: { summary: DashboardSummary }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [filter, setFilter] = useState<TrafficSource | 'all'>('all');
  const [host, setHost] = useState<string>();
  const data = widgetBreakdown(summary.overview?.widgets, days, filter, host);
  const base = widgetBreakdown(summary.overview?.widgets, days, filter);
  if (!data)
    return (
      <p>
        {summary.overview?.widgets?.reason ??
          'Detailed widget history is unavailable. The aggregate may still be available in Diagnostics.'}
      </p>
    );
  return (
    <>
      <p className={styles.meaning}>
        A widget load means its page opened and sent an impression beacon. One
        person can create several loads. This is not unique visitors, clicks,
        bookings, or confirmed partner-site embeds.
      </p>
      <div className={styles.filters}>
        <label>
          Period
          <select
            aria-label="Period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 7 | 30)}
          >
            <option value={7}>7 days (UTC)</option>
            <option value={30}>30 days (UTC)</option>
          </select>
        </label>
        <label>
          Traffic source
          <select
            aria-label="Traffic source"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as TrafficSource | 'all');
              setHost(undefined);
            }}
          >
            <option value="all">All recorded loads</option>
            <option value="external">External referrers</option>
            <option value="eddy">Eddy / known preview referrers</option>
            <option value="unknown">No known referrer</option>
          </select>
        </label>
        <label>
          Referring site
          <select
            aria-label="Referring site"
            value={host ?? ''}
            onChange={(e) => setHost(e.target.value || undefined)}
          >
            <option value="">All sites in this source</option>
            {host && !base?.hosts.some((h) => h.name === host) && (
              <option value={host}>{host} (no loads in this period)</option>
            )}
            {base?.hosts.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.trafficTotals}>
        {(['external', 'eddy', 'unknown'] as const).map((key) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setHost(undefined);
            }}
          >
            <strong>{data.totals[key].toLocaleString()}</strong>
            <span>
              {key === 'external'
                ? 'External referrers'
                : key === 'eddy'
                  ? 'Eddy / previews'
                  : 'Unknown referrer'}
            </span>
          </button>
        ))}
      </div>
      <h3>{data.total.toLocaleString()} loads in this selection</h3>
      <p>
        {day(data.start)}–{day(data.end)} · UTC · today is partial. The source
        totals above cover the full selected period.
      </p>
      <div className={styles.dailyBars} aria-label="Daily widget loads">
        {data.daily.map((p) => (
          <div key={p.day} title={`${day(p.day)}: ${p.count}`}>
            <span
              style={{
                height: `${p.count === 0 ? 0 : Math.max(1, (p.count / Math.max(1, ...data.daily.map((d) => d.count))) * 100)}%`,
              }}
            />
            <small>{days === 7 ? day(p.day) : p.day.slice(-2)}</small>
          </div>
        ))}
      </div>
      <details>
        <summary>Daily values</summary>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>Date (UTC)</th>
              <th>Loads</th>
            </tr>
          </thead>
          <tbody>
            {data.daily.map((p) => (
              <tr key={p.day}>
                <td>{day(p.day)}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className={styles.breakdownColumns}>
        {[
          ['Referring sites', data.hosts],
          ['Widget types', data.types],
          ['River / widget keys', data.keys],
        ].map(([title, rows]) => (
          <section key={String(title)}>
            <h3>{String(title)}</h3>
            <table className={styles.detailTable}>
              <thead>
                <tr>
                  <th>{String(title)}</th>
                  <th>Loads</th>
                </tr>
              </thead>
              <tbody>
                {(rows as Array<{ name: string; count: number }>).map((r) => (
                  <tr key={r.name}>
                    <td>
                      {title === 'Referring sites' ? (
                        <button
                          className={styles.textButton}
                          onClick={() => setHost(r.name)}
                        >
                          {r.name === 'direct' ? 'No known referrer' : r.name}
                        </button>
                      ) : (
                        friendly(r.name)
                      )}
                    </td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <div className={styles.meaning}>
        <h3>How to use this</h3>
        <p>
          External referrals help identify where people discover the widgets.
          Eddy referrals can include gallery previews and navigation within
          Eddy. A Facebook referrer can be a link opening a widget, not an
          embedded widget on Facebook. Referrer data is browser-supplied and can
          be absent; it does not identify a visitor.
        </p>
        <p>
          For partner outreach, examine the domain and its trend before calling
          it adoption. Partner labels are descriptive: older rollups keep the
          first label for the day and cannot reliably prove who owns a site.
        </p>
      </div>
      <p className={styles.note}>
        Source: existing daily widget counters. Failed beacons, blocking, rate
        limits and non-JavaScript clients can cause undercounting. No
        visitor-level history is stored. Known preview hosts are classified
        separately from external traffic; unrecognized preview domains may still
        appear external.
      </p>
    </>
  );
}

const groups: Record<
  string,
  { title: string; meaning: string; keys: string[] }
> = {
  subscribers: {
    title: 'Premium subscribers',
    meaning:
      'People with current Premium access in production. Renewal off means access remains until expiry; it is not already-lost revenue. This is a current snapshot, not a revenue or historical growth chart.',
    keys: ['subscribers', 'renewal_off', 'expiring', 'billing', 'rc_event'],
  },
  inbox: {
    title: 'Your combined inbox',
    meaning:
      'Outstanding community reports, unread email, and pending feedback. These are work items, not necessarily unique people. Open a category below to act on it.',
    keys: ['reports', 'email', 'feedback'],
  },
  email_30: {
    title: 'Email list growth',
    meaning:
      'New email-list entries in the rolling 30-day window. This is not total subscribers, email opens, or marketing conversions. Compare acquisition sources before choosing where to promote Eddy.',
    keys: ['email_30', 'email_7', 'email_sources'],
  },
  images: {
    title: 'Access points needing photos',
    meaning:
      'Access points with no stored image. This is a content opportunity, not a service outage. The editor opens unfiltered; this dashboard does not yet have a verified missing-photo filter.',
    keys: ['images', 'descriptions', 'driving'],
  },
  health: {
    title: 'River-data freshness',
    meaning:
      'These checks cover curated gauge observations and dam snapshot age. A zero count means none tripped these thresholds, not that every service is healthy.',
    keys: ['gauge_stale', 'gauge_missing', 'dam_stale'],
  },
};

export default function MetricDetails({
  target,
  summary,
  days,
  onClose,
}: {
  target: DetailTarget;
  summary: DashboardSummary;
  days: 7 | 30;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  const growth = target.key === 'accounts' || target.key === 'plans';
  const series = growth
    ? summary.overview?.[target.key as 'accounts' | 'plans']
    : undefined;
  const period = series && comparePeriod(series, days);
  const group = groups[target.key];
  const service = target.key.startsWith('service:')
    ? summary.overview?.services.find((s) => s.id === target.key.slice(8))
    : undefined;
  const job = target.key.startsWith('job_')
    ? summary.overview?.timeline.jobs.find((j) => 'job_' + j.id === target.key)
    : undefined;
  const serviceMetric = (m: Metric) => {
    if (!service) return false;
    if (service.provider)
      return (
        [
          `upstream_${service.provider}`,
          `429_${service.provider}`,
          `errors_${service.provider}`,
          'upstream',
        ].includes(m.key) ||
        (service.id === 'anthropic' && m.key.startsWith('ai_')) ||
        (service.id === 'mcp' && m.key.startsWith('mcp_'))
      );
    const sections: Record<string, string> = {
      expo: 'Push & devices',
      revenuecat: 'Business',
      sentry: 'Errors',
      redis: 'Upstream & MCP',
      supabase: 'Data & jobs',
      vercel: 'Scheduled jobs',
      resend: 'Inbox',
    };
    return (
      m.section === sections[service.id] ||
      (service.id === 'expo' && m.key === 'effective_push')
    );
  };
  const metrics = summary.metrics.filter((m) =>
    service
      ? serviceMetric(m)
      : group
        ? group.keys.includes(m.key)
        : target.key.startsWith('section:')
          ? m.section === target.key.slice(8)
          : m.key === target.key,
  );
  const title = service
    ? service.name + ' — coverage & usage'
    : job
      ? job.label
      : target.key === 'widgets'
        ? 'Widget reach — what the loads mean'
        : growth
          ? target.key === 'accounts'
            ? 'New accounts'
            : 'Trip plans saved'
          : target.key === 'river'
            ? (target.name ?? 'River interest')
            : (group?.title ??
              metrics[0]?.label ??
              target.key.replace('section:', ''));
  const riverMetric = summary.metrics.find((m) => m.key === 'plan_rivers');
  const river = Array.isArray(riverMetric?.value)
    ? riverMetric.value.find((r) => r.name === target.name)
    : null;
  return (
    <dialog
      ref={dialog}
      className={styles.metricDialog}
      aria-labelledby="metric-detail-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className={styles.dialogHeader}>
        <div>
          <span className={styles.eyebrow}>METRIC DETAILS</span>
          <h2 id="metric-detail-title" ref={heading} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <button onClick={onClose} aria-label="Close metric details">
          ✕
        </button>
      </div>
      <div className={styles.dialogBody}>
        {target.key === 'widgets' ? (
          <WidgetDetails summary={summary} />
        ) : growth ? (
          <>
            <p className={styles.meaning}>
              {target.key === 'accounts'
                ? 'Accounts created during the selected period. Existing signed-in users can use Eddy without creating a new account, so this does not measure active users.'
                : 'Float plans saved during the selected period. Saving a plan signals planning interest, not a completed trip, booking, or unique visitor.'}
            </p>
            {period ? (
              <>
                <div className={styles.trafficTotals}>
                  <div>
                    <strong>{period.total}</strong>
                    <span>This period</span>
                  </div>
                  <div>
                    <strong>{period.prior}</strong>
                    <span>Previous period</span>
                  </div>
                </div>
                <p>
                  {days} complete UTC days through{' '}
                  {day(period.current.at(-1)!.day)}. Today is excluded from both
                  comparisons.
                </p>
                <table className={styles.detailTable}>
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Count</th>
                      <th>Previous date</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.current.map((p, i) => (
                      <tr key={p.day}>
                        <td>{day(p.day)}</td>
                        <td>{p.count}</td>
                        <td>{day(period.previous[i].day)}</td>
                        <td>{period.previous[i].count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p>Daily history is unavailable. No trend is inferred.</p>
            )}
            <h3>How to use this</h3>
            <p>
              Compare equal periods and watch the trend over several weeks. A
              change alone does not explain its cause. Subscriber conversion and
              completed-trip rates are not measured here.
            </p>
          </>
        ) : target.key === 'river' ? (
          <>
            <strong className={styles.detailNumber}>
              {river?.count.toLocaleString() ?? 'Unknown'} saved plans
            </strong>
            <p className={styles.meaning}>
              Saved plans associated with {target.name} in the rolling 30-day
              window. This reflects planning interest, not unique visitors or
              completed floats. Bars on the overview are scaled against the
              most-planned river, not a percentage of all users.
            </p>
            <h3>How to use this</h3>
            <p>
              Use demand to prioritize river content and partner outreach. The
              dashboard does not yet connect this count to individual trips or
              photo gaps on this river.
            </p>
          </>
        ) : (
          <>
            {service && (
              <div className={styles.meaning}>
                <h3>
                  {service.purpose} · {service.configuration}
                </h3>
                <p>{service.detail}</p>
                {service.provider && (
                  <p>
                    Calls are recorded operations or sample-weighted estimates.
                    Error percentage is the proportion recorded as errors. p95
                    latency means roughly 95% of measured operations finished
                    within that duration. Missing measurements are not zero
                    traffic. Coverage notes below name the time window and
                    exclusions.
                  </p>
                )}
                {service.href && !service.href.startsWith('#') && (
                  <a href={service.href}>
                    Open {service.name} management view →
                  </a>
                )}
              </div>
            )}
            {job && (
              <section className={styles.meaning}>
                <p>
                  Next scheduled:{' '}
                  {job.nextAt
                    ? new Date(job.nextAt).toLocaleString('en-US', {
                        timeZone: 'America/Chicago',
                      }) + ' CT'
                    : 'Unknown'}
                  . A skipped run can mean no work or an existing lock. A
                  successful later run does not erase earlier failures from this
                  history.
                </p>
                <table className={styles.detailTable}>
                  <thead>
                    <tr>
                      <th>Run (CT)</th>
                      <th>Outcome</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.runs.map((r, i) => (
                      <tr key={i}>
                        <td>
                          {new Date(r.started_at).toLocaleTimeString('en-US', {
                            timeZone: 'America/Chicago',
                          })}
                        </td>
                        <td>{r.status}</td>
                        <td>
                          {r.duration_ms === null
                            ? 'Unknown'
                            : (r.duration_ms / 1000).toFixed(1) + 's'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!job.runs.length && (
                  <p>
                    No recorded runs in the last six hours. This alone does not
                    mean failure.
                  </p>
                )}
              </section>
            )}
            {group && <p className={styles.meaning}>{group.meaning}</p>}
            {metrics.map((m) => (
              <section className={styles.detailMetric} key={m.key}>
                <h3>{m.label}</h3>
                <MetricValue metric={m} />
                <p>
                  {m.detail ||
                    'This is the stored aggregate for the scope named above. A snapshot alone does not establish a trend or explain the cause.'}
                </p>
                {m.href && (
                  <a href={m.href}>
                    Open{' '}
                    {m.section === 'Inbox'
                      ? m.label.toLowerCase()
                      : 'related admin view'}{' '}
                    →
                  </a>
                )}
              </section>
            ))}
            {!metrics.length && (
              <p>
                This source has no detailed metrics in the current snapshot. No
                healthy state or zero value is assumed.
              </p>
            )}
          </>
        )}
        <p className={styles.note}>
          Snapshot:{' '}
          {new Date(summary.generatedAt).toLocaleString('en-US', {
            timeZone: 'America/Chicago',
          })}{' '}
          CT. Closing returns to your place on the overview.
        </p>
      </div>
    </dialog>
  );
}
