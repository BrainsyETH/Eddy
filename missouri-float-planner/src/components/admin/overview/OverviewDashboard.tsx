'use client';
import { useState } from 'react';
import {
  inboxCount,
  needsAttention,
  uncheckedMetrics,
  type DashboardSummary,
  type Metric,
} from '@/lib/admin/dashboard/model';
import { comparePeriod } from '@/lib/admin/dashboard/overview-model';
import { referringSites } from '@/lib/admin/dashboard/widget-model';
import { plain } from '@/lib/admin/dashboard/plain';
import { EDDY_IMAGES } from '@/constants';
import GrowthChart from './GrowthChart';
import AutomationTimeline from './AutomationTimeline';
import ServiceOverview from './ServiceOverview';
import { Change, Panel, Sparkline, Status, fmt } from './bits';
import styles from './overview.module.css';
import MetricDetails, {
  InspectMetricContext,
  type DetailTarget,
} from './MetricDetails';

export const numericMetric = (metrics: Metric[], key: string) => {
  const m = metrics.find((metric) => metric.key === key);
  return m?.state === 'ok' && typeof m.value === 'number' ? m.value : null;
};
const priority = (m: Metric) =>
  m.key === 'effective_push' || /^(gauge_|river_|trust|job_|dam_)/.test(m.key)
    ? 0
    : m.section === 'Inbox'
      ? 2
      : 1;
const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });

const INBOX = [
  { key: 'reports', label: 'River reports', href: '/admin/reports' },
  { key: 'email', label: 'Unread email', href: '/admin/feedback' },
  { key: 'feedback', label: 'Feedback', href: '/admin/feedback' },
] as const;

const FRESHNESS = [
  { key: 'gauge_stale', label: 'Gauges not updating' },
  { key: 'gauge_missing', label: 'Gauges with no usable reading' },
  { key: 'dam_stale', label: 'Dam info out of date' },
] as const;

const CONTENT = [
  { key: 'images', label: 'Access points without photos', href: '/admin/access-points' },
  { key: 'descriptions', label: 'Access points without descriptions', href: '/admin/access-points' },
  { key: 'driving', label: 'Access points without directions', href: '/admin/access-points' },
  { key: 'hazards', label: 'Hazards to re-check', href: '/admin/hazards' },
  { key: 'blogs', label: 'Blog posts past their date', href: '/admin/blog' },
] as const;

const MORE = [
  { key: 'signins_7', label: 'people signed in this week' },
  { key: 'email_30', label: 'email sign-ups this month' },
  { key: 'chat_sessions', label: 'chats with Eddy this week' },
  { key: 'devices', label: 'iPhones set up for alerts' },
] as const;

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
  const [target, setTarget] = useState<DetailTarget | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [measure, setMeasure] = useState<'plans' | 'accounts'>('plans');
  const [showAllActions, setShowAllActions] = useState(false);
  const metrics = summary?.metrics ?? [];
  const overview = summary?.overview;
  const num = (key: string) => numericMetric(metrics, key);
  const jobLabel = (key: string) =>
    overview?.timeline.jobs.find((j) => `job_${j.id}` === key)?.label;

  const attention = metrics
    .filter(needsAttention)
    .sort((a, b) => priority(a) - priority(b));
  const freshKnown = FRESHNESS.every((f) => num(f.key) !== null);
  const behind = FRESHNESS.reduce((n, f) => n + (num(f.key) ?? 0), 0);
  const accounts = overview && comparePeriod(overview.accounts, days);
  const plans = overview && comparePeriod(overview.plans, days);
  const sites = referringSites(overview?.widgets);
  const inbox = inboxCount(metrics);
  const top = metrics.find((m) => m.key === 'plan_rivers');
  const rivers =
    top?.state === 'ok' && Array.isArray(top.value)
      ? top.value.slice(0, 6)
      : null;
  const stale =
    summary && Date.now() - Date.parse(summary.generatedAt) > 360000;
  const pushOff = num('effective_push') === 1;
  // A missing answer is never healthy: count it, and keep the hero off green.
  const unchecked = uncheckedMetrics(metrics);
  const timelineDown = !!summary && overview?.timeline.state !== 'ok';
  const unknownCount = unchecked.length + (timelineDown ? 1 : 0);

  const mood = !summary
    ? EDDY_IMAGES.favicon
    : pushOff || behind > 0
      ? EDDY_IMAGES.red
      : attention.length
        ? EDDY_IMAGES.yellow
        : unknownCount
          ? EDDY_IMAGES.favicon
          : EDDY_IMAGES.green;
  const headline = !summary
    ? 'Checking on the river…'
    : attention.length
      ? `${plural(attention.length, 'thing needs', 'things need')} you.`
      : unknownCount
        ? 'Some checks didn’t answer.'
        : 'All calm on the water.';
  const subline = !summary
    ? 'Loading the latest numbers.'
    : [
        !freshKnown
          ? 'River data status unknown'
          : behind
            ? [
                (num('gauge_stale') ?? 0) + (num('gauge_missing') ?? 0)
                  ? `${plural((num('gauge_stale') ?? 0) + (num('gauge_missing') ?? 0), 'gauge is', 'gauges are')} behind`
                  : null,
                num('dam_stale')
                  ? `${plural(num('dam_stale')!, 'dam is', 'dams are')} out of date`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'River data is fresh',
        inbox === null
          ? 'Inbox unknown'
          : inbox
            ? `${plural(inbox, 'item', 'items')} in your inbox`
            : 'Inbox is clear',
        pushOff ? 'Phone alerts are off' : null,
        unknownCount
          ? `${plural(unknownCount, 'check', 'checks')} didn’t load`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const siteSeries = sites
    ? Array.from({ length: 30 }, (_, i) =>
        sites.sites.reduce((n, s) => n + (s.daily[i] > 0 ? 1 : 0), 0),
      )
    : [];
  const kpis = [
    {
      key: 'accounts',
      label: 'New accounts',
      value: accounts?.total ?? null,
      unit: `created in the last ${days} days`,
      change: accounts,
      series: accounts?.current.map((p) => p.count) ?? [],
    },
    {
      key: 'plans',
      label: 'Trip plans',
      value: plans?.total ?? null,
      unit: `saved in the last ${days} days`,
      change: plans,
      series: plans?.current.map((p) => p.count) ?? [],
    },
    {
      key: 'subscribers',
      label: 'Premium members',
      value: num('subscribers'),
      unit: 'paying right now',
      note:
        num('renewal_off') === null
          ? null
          : num('renewal_off')
            ? `${plural(num('renewal_off')!, 'member has', 'members have')} renewal off`
            : 'Everyone is set to renew',
    },
    {
      key: 'widgets',
      label: 'Referring sites',
      value: sites?.total ?? null,
      unit: 'outside sites sending widget views, last 30 days',
      note: sites
        ? sites.newThisWeek
          ? `+${plural(sites.newThisWeek, 'new site', 'new sites')} this week`
          : 'No new sites this week'
        : null,
      series: siteSeries,
    },
  ];

  return (
    <InspectMetricContext.Provider
      value={(value) =>
        setTarget(
          value.key === 'embeds' || value.key === 'embed_hosts'
            ? { key: 'widgets' }
            : value,
        )
      }
    >
      <div className={styles.root}>
        <div className={styles.topbar}>
          {/* Brand art is on the Vercel Blob CDN, as elsewhere in admin. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EDDY_IMAGES.favicon} alt="" width={34} height={34} />
          <b>Eddy</b>
          <span className={styles.topbarTitle}>Dashboard</span>
          <span className={styles.topbarTime}>
            {summary ? `Updated ${clock(summary.generatedAt)} CT` : 'Loading…'}
          </span>
          <button onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className={styles.main}>
          {(error || stale) && (
            <p role="status" className={styles.alert}>
              {summary
                ? `These numbers are from ${clock(summary.generatedAt)} CT. The latest refresh didn't load.`
                : "The dashboard didn't load. Try Refresh."}
            </p>
          )}

          <section className={styles.hero} aria-live="polite">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mood} alt="Eddy the Otter" width={96} height={96} />
            <div className={styles.heroText}>
              <h1>{headline}</h1>
              <p>{subline}</p>
            </div>
            <div className={styles.segment} aria-label="Compare period">
              {([7, 30] as const).map((n) => (
                <button
                  key={n}
                  aria-pressed={days === n}
                  onClick={() => setDays(n)}
                >
                  {n === 7 ? 'Last 7 days' : 'Last 30 days'}
                </button>
              ))}
            </div>
          </section>

          <div className={styles.kpis}>
            {kpis.map((k) => (
              <button
                key={k.key}
                className={styles.kpi}
                onClick={() => setTarget({ key: k.key })}
              >
                <span className={styles.kpiLabel}>{k.label}</span>
                <strong>{summary ? fmt(k.value) : '—'}</strong>
                <span className={styles.kpiUnit}>{k.unit}</span>
                {k.change ? (
                  <Change total={k.change.total} prior={k.change.prior} days={days} />
                ) : k.note ? (
                  <span className={styles.kpiNote}>{k.note}</span>
                ) : (
                  <span className={styles.kpiNote}>
                    {summary ? 'History not available' : ' '}
                  </span>
                )}
                {k.series && (
                  <Sparkline
                    values={k.series}
                    label={`${k.label}, daily trend.`}
                  />
                )}
              </button>
            ))}
          </div>

          <div className={styles.moreStats}>
            {MORE.map((s) => (
              <button key={s.key} onClick={() => setTarget({ key: s.key })}>
                <strong>{summary ? fmt(num(s.key)) : '—'}</strong>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.split}>
            {overview ? (
              <GrowthChart
                series={overview[measure]}
                days={days}
                measure={measure}
                onMeasure={setMeasure}
              />
            ) : (
              <Panel title="Growth" hint="Is Eddy growing?">
                <p className={styles.empty}>
                  {summary ? 'Growth history did not load.' : 'Loading…'}
                </p>
              </Panel>
            )}

            <Panel id="focus" title="Needs attention" hint="What needs me today?">
              {attention.length ? (
                <ol className={styles.actions}>
                  {(showAllActions ? attention : attention.slice(0, 5)).map(
                    (m) => {
                      const copy = plain(m, jobLabel(m.key));
                      return (
                        <li key={m.key}>
                          <button onClick={() => setTarget({ key: m.key })}>
                            <span className={styles.actionCount}>
                              {typeof m.value === 'number' && !m.key.startsWith('job_') && m.key !== 'effective_push'
                                ? fmt(m.value)
                                : '!'}
                            </span>
                            <span>
                              <b>{copy.title}</b>
                              <small>{copy.todo ?? copy.means}</small>
                            </span>
                            <span aria-hidden="true">›</span>
                          </button>
                        </li>
                      );
                    },
                  )}
                </ol>
              ) : !summary ? (
                <p className={styles.empty}>Checking…</p>
              ) : unknownCount ? (
                <p className={styles.empty}>Nothing flagged in the checks that answered.</p>
              ) : (
                <p className={styles.allClear}>Nothing flagged. Go float.</p>
              )}
              {attention.length > 5 && (
                <button
                  className={styles.textButton}
                  onClick={() => setShowAllActions(!showAllActions)}
                >
                  {showAllActions ? 'Show fewer' : `Show all ${attention.length}`}
                </button>
              )}
              {unknownCount > 0 && (
                <>
                  <h3 className={styles.subhead}>Couldn’t check</h3>
                  <ul className={styles.unchecked}>
                    {timelineDown && <li>Automatic task history</li>}
                    {unchecked.slice(0, timelineDown ? 4 : 5).map((m) => (
                      <li key={m.key}>
                        <button
                          className={styles.textButton}
                          onClick={() => setTarget({ key: m.key })}
                        >
                          {plain(m, jobLabel(m.key)).title}
                        </button>
                      </li>
                    ))}
                    {unknownCount > 5 && (
                      <li>
                        and {unknownCount - 5} more in Every number below
                      </li>
                    )}
                  </ul>
                </>
              )}
              <h3 className={styles.subhead}>Inbox</h3>
              <div className={styles.inbox}>
                {INBOX.map((i) => (
                  <a key={i.key} href={i.href}>
                    <strong>{summary ? fmt(num(i.key)) : '—'}</strong>
                    <span>{i.label}</span>
                  </a>
                ))}
              </div>
            </Panel>
          </div>

          <div className={styles.trio}>
            <Panel
              title="River data"
              hint="Are gauge and dam readings arriving on time?"
              action={
                summary && (
                  <Status tone={!freshKnown ? 'quiet' : behind ? 'bad' : 'good'}>
                    {!freshKnown ? 'Unknown' : behind ? 'Behind' : 'Fresh'}
                  </Status>
                )
              }
            >
              <ul className={styles.rows}>
                {FRESHNESS.map((f) => (
                  <li key={f.key}>
                    <button onClick={() => setTarget({ key: f.key })}>
                      <span>{f.label}</span>
                      <strong data-zero={num(f.key) === 0 || undefined}>
                        {fmt(num(f.key))}
                      </strong>
                    </button>
                  </li>
                ))}
                <li>
                  <button onClick={() => setTarget({ key: 'trust' })}>
                    <span>Serious data problems</span>
                    <strong data-zero={num('trust') === 0 || undefined}>
                      {fmt(num('trust'))}
                    </strong>
                  </button>
                </li>
              </ul>
              <a className={styles.panelLink} href="/admin/gauges">
                Open gauges ›
              </a>
            </Panel>

            <Panel
              title="Referring sites"
              hint="Which outside sites send widget views? Last 30 days."
            >
              {sites ? (
                <>
                  <div className={styles.bigLine}>
                    <strong>{sites.total.toLocaleString()}</strong>
                    <span>
                      {plural(sites.total, 'site', 'sites')}
                      <small>
                        {sites.newThisWeek
                          ? `${sites.newThisWeek} new this week`
                          : 'none new this week'}
                        {sites.quietThisWeek
                          ? ` · ${sites.quietThisWeek} quiet this week`
                          : ''}
                      </small>
                    </span>
                  </div>
                  {sites.sites.length ? (
                    <ul className={styles.rows}>
                      {sites.sites.slice(0, 5).map((s) => (
                        <li key={s.host}>
                          <button onClick={() => setTarget({ key: 'widgets' })}>
                            <span className={styles.host}>
                              {s.host}
                              {s.isNew && <em data-tone="good">New</em>}
                              {s.quiet && <em data-tone="quiet">Quiet</em>}
                            </span>
                            <strong>{s.loads.toLocaleString()}</strong>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.empty}>
                      No outside site has sent a widget view yet.
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.empty}>
                  {summary ? 'Widget history did not load.' : 'Loading…'}
                </p>
              )}
              <button
                className={styles.panelLink}
                onClick={() => setTarget({ key: 'widgets' })}
              >
                See every site ›
              </button>
            </Panel>

            <Panel
              title="Top rivers"
              hint="Where do people want to float? Trip plans, last 30 days."
            >
              {rivers?.length ? (
                <div className={styles.riverBars}>
                  {rivers.map((r) => (
                    <button
                      key={r.name}
                      onClick={() => setTarget({ key: 'river', name: r.name })}
                    >
                      <span>
                        <b>{r.name}</b>
                        <span>{r.count.toLocaleString()}</span>
                      </span>
                      <span className={styles.barTrack}>
                        <span
                          style={{
                            width: `${(r.count / Math.max(1, rivers[0].count)) * 100}%`,
                          }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>
                  {rivers ? 'No trips planned yet this month.' : 'River data did not load.'}
                </p>
              )}
            </Panel>
          </div>

          {overview && (
            <AutomationTimeline timeline={overview.timeline} metrics={metrics} />
          )}

          <div className={styles.split}>
            {overview && (
              <ServiceOverview services={overview.services} metrics={metrics} />
            )}
            <Panel
              title="Content gaps"
              hint="What should we fill in next?"
            >
              <ul className={styles.rows}>
                {CONTENT.map((c) => (
                  <li key={c.key}>
                    <a href={c.href}>
                      <span>{c.label}</span>
                      <strong data-zero={num(c.key) === 0 || undefined}>
                        {fmt(num(c.key))}
                      </strong>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <details id="diagnostics" className={styles.diagnostics}>
            <summary>
              <span>Every number</span>
              <small>The full list, grouped by area, with admin shortcuts</small>
            </summary>
            {children}
          </details>
        </div>
        {target && summary && (
          <MetricDetails
            key={target.key + (target.name ?? '')}
            target={target}
            summary={summary}
            days={days}
            onClose={() => setTarget(null)}
          />
        )}
      </div>
    </InspectMetricContext.Provider>
  );
}
