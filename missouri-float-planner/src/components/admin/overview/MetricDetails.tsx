'use client';
import { createContext, useContext, useEffect, useRef } from 'react';
import type { DashboardSummary, Metric } from '@/lib/admin/dashboard/model';
import { comparePeriod } from '@/lib/admin/dashboard/overview-model';
import { referringSites } from '@/lib/admin/dashboard/widget-model';
import { plain, valueText } from '@/lib/admin/dashboard/plain';
import { Sparkline, Status, fmt } from './bits';
import styles from './overview.module.css';

export interface DetailTarget {
  key: string;
  name?: string;
}
export const InspectMetricContext = createContext<
  (target: DetailTarget) => void
>(() => {});
export const useInspectMetric = () => useContext(InspectMetricContext);
const friendly = (key: string) => {
  const s = key.replaceAll('_', ' ').replaceAll('-', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const day = (value: string) =>
  new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  }) + ' CT';

/** Same values as the overview. Missing is shown as missing, never zero. */
function MetricValue({ metric }: { metric: Metric }) {
  if (metric.state !== 'ok')
    return (
      <p className={styles.missing}>
        {metric.state === 'not_connected' ? 'Not connected yet.' : "Couldn't load this number."}
      </p>
    );
  const words = valueText(metric);
  if (words) return <strong className={styles.detailNumber}>{words}</strong>;
  if (Array.isArray(metric.value))
    return metric.value.length ? (
      <table className={styles.detailTable}>
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
      <p className={styles.missing}>Nothing yet.</p>
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
                : typeof value === 'number'
                  ? value.toLocaleString()
                  : String(value ?? '—')}
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
          ? when(metric.value)
          : String(metric.value ?? '—')}
    </strong>
  );
}

function MetricBlock({ metric, jobLabel }: { metric: Metric; jobLabel?: string }) {
  const copy = plain(metric, jobLabel);
  return (
    <section className={styles.detailMetric}>
      <h3>{copy.title}</h3>
      <MetricValue metric={metric} />
      {copy.means && <p>{copy.means}</p>}
      {copy.todo && (
        <p className={styles.todo}>
          <b>What to do:</b> {copy.todo}
        </p>
      )}
      {metric.href && <a href={metric.href}>Open in admin ›</a>}
      {(metric.detail || metric.reason) && (
        <details className={styles.fine}>
          <summary>Technical note</summary>
          <p>
            {metric.label}. {metric.detail} {metric.reason ?? ''}
          </p>
        </details>
      )}
    </section>
  );
}

function SitesDetails({ summary }: { summary: DashboardSummary }) {
  const history = summary.overview?.widgets;
  const sites = referringSites(history);
  if (!sites)
    return <p className={styles.missing}>Widget history did not load.</p>;
  return (
    <>
      <div className={styles.statGrid}>
        <div>
          <strong>{sites.total}</strong>
          <span>sites in 30 days</span>
        </div>
        <div>
          <strong>{sites.activeThisWeek}</strong>
          <span>active this week</span>
        </div>
        <div>
          <strong>{sites.newThisWeek}</strong>
          <span>new this week</span>
        </div>
        <div>
          <strong>{sites.quietThisWeek}</strong>
          <span>quiet this week</span>
        </div>
      </div>
      {sites.sites.length ? (
        <div className={styles.tableScroll}>
          <table className={styles.detailTable}>
            <thead>
              <tr>
                <th>Site</th>
                <th>Views, 30 days</th>
                <th>This week</th>
                <th>Trend</th>
                <th>First / last view</th>
              </tr>
            </thead>
            <tbody>
              {sites.sites.map((s) => (
                <tr key={s.host}>
                  <td>
                    <a href={`https://${s.host}`} target="_blank" rel="noopener noreferrer">
                      {s.host}
                    </a>{' '}
                    {s.isNew && <Status tone="good">New</Status>}
                    {s.quiet && <Status tone="quiet">Quiet</Status>}
                  </td>
                  <td>{s.loads.toLocaleString()}</td>
                  <td>{s.loads7.toLocaleString()}</td>
                  <td className={styles.sparkCell}>
                    <Sparkline values={s.daily} label={`${s.host} daily views`} />
                  </td>
                  <td>
                    {day(s.firstDay)} – {day(s.lastDay)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.missing}>No outside site has sent a widget view in 30 days.</p>
      )}
      <div className={styles.breakdownColumns}>
        <section>
          <h3>Most-used widgets</h3>
          <table className={styles.detailTable}>
            <tbody>
              {sites.types.slice(0, 8).map((r) => (
                <tr key={r.name}>
                  <td>{friendly(r.name)}</td>
                  <td>{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Most-shown rivers and dams</h3>
          <table className={styles.detailTable}>
            <tbody>
              {sites.keys.slice(0, 8).map((r) => (
                <tr key={r.name}>
                  <td>{friendly(r.name)}</td>
                  <td>{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>From social, search and email</h3>
          {sites.links.length ? (
            <table className={styles.detailTable}>
              <tbody>
                {sites.links.slice(0, 8).map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.missing}>None.</p>
          )}
        </section>
      </div>
      <details className={styles.fine}>
        <summary>How this is counted</summary>
        <p>
          A view is one widget page loading. A site appears when a widget
          loaded from one of its pages in the last 30 days. That can be a
          widget embedded on the page or a widget link someone clicked there;
          we can’t tell those apart yet, so this is not a count of confirmed
          embeds. Eddy’s own pages don’t count. Social media, search and email
          are listed on their own, and the widget and river rankings above
          leave them out too. New means a site’s first view in those 30 days
          came this week. Quiet means no views this week.
        </p>
        <p>
          {sites.unknownLoads.toLocaleString()} views in 30 days arrived without
          a site name, usually because of browser privacy settings or email
          image proxies. Cached email images are only counted once per 5
          minutes.
        </p>
      </details>
    </>
  );
}

const groups: Record<string, { title: string; intro: string; keys: string[] }> = {
  subscribers: {
    title: 'Premium members',
    intro: 'Who pays for Premium right now. Members with renewal off keep Premium until it ends.',
    keys: ['subscribers', 'renewal_off', 'expiring', 'billing', 'rc_event'],
  },
  inbox: {
    title: 'Your inbox',
    intro: 'Things people sent that are waiting on you.',
    keys: ['reports', 'email', 'feedback'],
  },
  email_30: {
    title: 'Email list',
    intro: 'New sign-ups and where they came from.',
    keys: ['email_30', 'email_7', 'email_sources'],
  },
  images: {
    title: 'Access point gaps',
    intro: 'Put-ins and take-outs missing details.',
    keys: ['images', 'descriptions', 'driving'],
  },
  health: {
    title: 'River data freshness',
    intro: 'Whether gauge and dam readings are arriving on time.',
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
  const jobLabel = (key: string) =>
    summary.overview?.timeline.jobs.find((j) => `job_${j.id}` === key)?.label;
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
  const riverMetric = summary.metrics.find((m) => m.key === 'plan_rivers');
  const river = Array.isArray(riverMetric?.value)
    ? riverMetric.value.find((r) => r.name === target.name)
    : null;
  const title = service
    ? service.name
    : job
      ? job.label
      : target.key === 'widgets'
        ? 'Referring sites'
        : growth
          ? target.key === 'accounts'
            ? 'New accounts'
            : 'Trip plans saved'
          : target.key === 'river'
            ? (target.name ?? 'River')
            : (group?.title ??
              (metrics[0] ? plain(metrics[0], jobLabel(metrics[0].key)).title : friendly(target.key)));
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
        <h2 id="metric-detail-title" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={styles.dialogBody}>
        {target.key === 'widgets' ? (
          <SitesDetails summary={summary} />
        ) : growth ? (
          <>
            <p className={styles.intro}>
              {target.key === 'accounts'
                ? 'Accounts created each day.'
                : 'Float plans saved each day. A saved plan shows interest, not a finished trip.'}
            </p>
            {period ? (
              <>
                <div className={styles.statGrid}>
                  <div>
                    <strong>{period.total.toLocaleString()}</strong>
                    <span>last {days} days</span>
                  </div>
                  <div>
                    <strong>{period.prior.toLocaleString()}</strong>
                    <span>the {days} days before</span>
                  </div>
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Count</th>
                        <th>Same day, period before</th>
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
                </div>
                <p className={styles.fineText}>
                  Days are UTC. Today is left out until it’s over.
                </p>
              </>
            ) : (
              <p className={styles.missing}>Daily history did not load.</p>
            )}
          </>
        ) : target.key === 'river' ? (
          <>
            <strong className={styles.detailNumber}>
              {fmt(river?.count)} trip plans
            </strong>
            <p className={styles.intro}>
              Float plans saved for {target.name} in the last 30 days. A good
              place to focus photos, guides and partner outreach.
            </p>
          </>
        ) : (
          <>
            {group && <p className={styles.intro}>{group.intro}</p>}
            {service && (
              <div className={styles.intro}>
                <p>{service.purpose}.</p>
                {service.href && !service.href.startsWith('#') && (
                  <a href={service.href}>Open {service.name} ›</a>
                )}
              </div>
            )}
            {job && (
              <section className={styles.detailMetric}>
                <p>
                  Next run: <b>{job.nextAt ? when(job.nextAt) : '—'}</b>
                </p>
                {job.runs.length ? (
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>Started</th>
                        <th>Result</th>
                        <th>Took</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.runs.map((r, i) => (
                        <tr key={i}>
                          <td>{when(r.started_at)}</td>
                          <td>
                            {({ ok: 'Worked', partial: 'Partly worked', error: 'Failed', skipped: 'Skipped', started: 'Running' } as Record<string, string>)[r.status] ?? r.status}
                          </td>
                          <td>
                            {r.duration_ms === null
                              ? '—'
                              : (r.duration_ms / 1000).toFixed(1) + 's'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.missing}>No runs in the last 6 hours.</p>
                )}
              </section>
            )}
            {metrics.map((m) => (
              <MetricBlock key={m.key} metric={m} jobLabel={jobLabel(m.key)} />
            ))}
            {!metrics.length && !job && (
              <p className={styles.missing}>No numbers for this yet.</p>
            )}
          </>
        )}
        <p className={styles.fineText}>Numbers from {when(summary.generatedAt)}.</p>
      </div>
    </dialog>
  );
}
