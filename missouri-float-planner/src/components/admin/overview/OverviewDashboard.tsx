'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  inboxCount,
  needsAttention,
  type DashboardSummary,
  type Metric,
} from '@/lib/admin/dashboard/model';
import { comparePeriod } from '@/lib/admin/dashboard/overview-model';
import GrowthChart, { changeLabel } from './GrowthChart';
import AutomationTimeline from './AutomationTimeline';
import ServiceOverview from './ServiceOverview';
import styles from './overview.module.css';

export const numericMetric = (metrics: Metric[], key: string) => {
  const m = metrics.find((metric) => metric.key === key);
  return m?.state === 'ok' && typeof m.value === 'number' ? m.value : null;
};
const display = (n: number | null) =>
  n === null ? 'Unknown' : n.toLocaleString();
const priority = (m: Metric) =>
  m.key === 'effective_push' || /^(gauge_|river_|trust|job_)/.test(m.key)
    ? 0
    : m.section === 'Inbox'
      ? 2
      : 1;
function explanation(m: Metric) {
  if (m.key.startsWith('job_'))
    return 'This automation needs review. Inspect its recent runs and schedule below.';
  if (m.key === 'billing')
    return 'These subscribers have a billing issue. Check RevenueCat before interpreting this as churn.';
  if (m.key === 'social_failed')
    return 'Posts failed to publish. Review them before scheduling more content.';
  if (m.section === 'Inbox')
    return 'Someone is waiting for you to review this.';
  return (
    m.detail || 'Open the related admin page to review the affected records.'
  );
}
export default function OverviewDashboard({
  summary,
  loading,
  error,
  onRefresh,
  children,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const [measure, setMeasure] = useState<'plans' | 'accounts'>('plans');
  const [showAllActions, setShowAllActions] = useState(false);
  const metrics = summary?.metrics ?? [];
  const overview = summary?.overview;
  const attention = metrics
    .filter(needsAttention)
    .sort((a, b) => priority(a) - priority(b));
  const gaugeKeys = ['gauge_stale', 'gauge_missing', 'dam_stale'];
  const known = gaugeKeys.every((k) => numericMetric(metrics, k) !== null);
  const delayed = gaugeKeys.some((k) => (numericMetric(metrics, k) ?? 0) > 0);
  const accounts = overview && comparePeriod(overview.accounts, days);
  const plans = overview && comparePeriod(overview.plans, days);
  const top = metrics.find((m) => m.key === 'plan_rivers');
  const rivers =
    top?.state === 'ok' && Array.isArray(top.value)
      ? top.value.slice(0, 5)
      : null;
  const stale =
    summary && Date.now() - Date.parse(summary.generatedAt) > 360000;
  const kpis = [
    {
      label: 'New accounts',
      value: accounts?.total ?? null,
      detail: accounts
        ? changeLabel(accounts.total, accounts.prior, accounts.percent)
        : 'Daily account history unavailable',
    },
    {
      label: 'Trip plans saved',
      value: plans?.total ?? null,
      detail: plans
        ? changeLabel(plans.total, plans.prior, plans.percent)
        : 'Daily planning history unavailable',
    },
    {
      label: 'Premium subscribers',
      value: numericMetric(metrics, 'subscribers'),
      detail: `${display(numericMetric(metrics, 'renewal_off'))} with renewal off · current production access`,
    },
  ];
  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <b>Eddy</b>
        <span>Operator overview</span>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>
      <div className={styles.main}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>THE BIG PICTURE</span>
            <h1>Your river business, at a glance.</h1>
            <p>
              Growth, the services behind it, and what needs your attention.
            </p>
          </div>
          <div className={styles.segment} aria-label="Growth period">
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                aria-pressed={days === n}
                onClick={() => setDays(n)}
              >
                {n} days
              </button>
            ))}
          </div>
        </div>
        {(error || stale) && (
          <p role="status" className={styles.alert}>
            {summary
              ? 'Showing an older snapshot. The latest refresh is unavailable.'
              : 'The dashboard could not load. Try Refresh data.'}
          </p>
        )}
        <div className={styles.health}>
          <strong>
            {!summary
              ? 'Checking Eddy…'
              : !known
                ? 'Data freshness is not fully known'
                : delayed
                  ? 'Some river data needs review'
                  : 'Monitored river data is current'}
          </strong>
          <a href="#focus">
            {summary
              ? `${attention.length} items to review`
              : 'Loading sources…'}
          </a>
          <small>
            {summary
              ? `Snapshot ${new Date(summary.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CT · refreshes every 3 min`
              : 'Reading existing monitoring data'}
          </small>
        </div>
        <div className={styles.kpis}>
          {kpis.map((k) => (
            <article key={k.label} className={styles.kpi}>
              <h2>{k.label}</h2>
              <strong>{summary ? display(k.value) : '—'}</strong>
              <p>{k.detail}</p>
              {k.label === 'Premium subscribers' && (
                <small>
                  Current count; historical subscriber snapshots are not
                  collected.
                </small>
              )}
            </article>
          ))}
        </div>
        <div className={styles.growthLayout}>
          {overview ? (
            <GrowthChart
              series={overview[measure]}
              days={days}
              measure={measure}
              onMeasure={setMeasure}
            />
          ) : (
            <section className={styles.panel}>
              <h2>Is Eddy growing?</h2>
              <p className={styles.empty}>
                {summary
                  ? 'Growth history is unavailable in this snapshot.'
                  : 'Loading activity history…'}
              </p>
            </section>
          )}
          <section id="focus" className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Where to focus</h2>
                <p>Fix interruptions first. Then clear the inbox.</p>
              </div>
            </div>
            {attention.length ? (
              <ol className={styles.actions}>
                {(showAllActions ? attention : attention.slice(0, 4)).map(
                  (m) => (
                    <li key={m.key}>
                      <span className={styles.actionCount}>
                        {display(typeof m.value === 'number' ? m.value : null)}
                      </span>
                      <div>
                        <h3>
                          {m.key.startsWith('job_')
                            ? (overview?.timeline.jobs.find(
                                (j) => `job_${j.id}` === m.key,
                              )?.label ?? m.label)
                            : m.label}
                        </h3>
                        <p>{explanation(m)}</p>
                        <a
                          href={
                            m.key.startsWith('job_')
                              ? '#automation'
                              : m.href || '#diagnostics'
                          }
                        >
                          Review →
                        </a>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className={styles.empty}>
                {summary
                  ? 'No actionable issues in the available sources. This is not an all-clear for unmeasured services.'
                  : 'Checking for issues…'}
              </p>
            )}
            {attention.length > 4 && (
              <button
                className={styles.textButton}
                onClick={() => setShowAllActions(!showAllActions)}
              >
                {showAllActions
                  ? 'Show fewer'
                  : `See all ${attention.length} items`}
              </button>
            )}
            <div className={styles.inbox}>
              <span>Combined inbox</span>
              <strong>{display(inboxCount(metrics))}</strong>
              <small>Reports, unread email & feedback</small>
            </div>
          </section>
        </div>
        {overview && (
          <ServiceOverview services={overview.services} metrics={metrics} />
        )}
        {overview && (
          <AutomationTimeline timeline={overview.timeline} metrics={metrics} />
        )}
        <div className={styles.growthLayout}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Where people want to float</h2>
                <p>Top rivers by saved plans · rolling 30 days.</p>
              </div>
            </div>
            {rivers?.length ? (
              <div className={styles.riverBars}>
                {rivers.map((r) => (
                  <div key={r.name}>
                    <div>
                      <strong>{r.name}</strong>
                      <span>{r.count.toLocaleString()} plans</span>
                    </div>
                    <div className={styles.barTrack}>
                      <span
                        style={{
                          width: `${(r.count / Math.max(1, rivers[0].count)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                {rivers
                  ? 'No saved plans in this period yet.'
                  : 'River demand data is unavailable.'}
              </p>
            )}
            <p className={styles.note}>
              Use this demand to guide content and partner outreach. Saved plans
              reflect interest, not confirmed visits.
            </p>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Build on that interest</h2>
                <p>Content coverage and reach · separate from outages.</p>
              </div>
            </div>
            <div className={styles.opportunities}>
              <Link href="/admin/access-points">
                <strong>{display(numericMetric(metrics, 'images'))}</strong>
                <span>
                  access points need photos
                  <small>Make trip planning more useful.</small>
                </span>
                <span>→</span>
              </Link>
              <a href="#diagnostics">
                <strong>{display(numericMetric(metrics, 'embeds'))}</strong>
                <span>
                  widget impressions
                  <small>
                    Last 7 UTC days, including today. Not unique visitors.
                  </small>
                </span>
                <span>→</span>
              </a>
              <a href="#diagnostics">
                <strong>{display(numericMetric(metrics, 'email_30'))}</strong>
                <span>
                  email list additions<small>Rolling 30 days.</small>
                </span>
                <span>→</span>
              </a>
            </div>
          </section>
        </div>
        <details id="diagnostics" className={styles.diagnostics}>
          <summary>
            <span>Diagnostics & all metrics</span>
            <small>
              Source details, AI costs, configuration and admin tools
            </small>
          </summary>
          <p className={styles.note}>
            Unknown means unavailable, not zero. Historical cleared push events
            do not distinguish suppression, expiry, and exhausted retries.
            Review Trust for Reads versus live conditions.
          </p>
          {children}
        </details>
      </div>
    </div>
  );
}
