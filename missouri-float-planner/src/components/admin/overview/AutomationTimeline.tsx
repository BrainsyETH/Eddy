'use client';
import { useState } from 'react';
import type {
  OverviewData,
  TimelineRun,
} from '@/lib/admin/dashboard/overview-model';
import { needsAttention, type Metric } from '@/lib/admin/dashboard/model';
import { relativeRun } from './JobStatusTable';
import { Panel, Status } from './bits';
import styles from './overview.module.css';

export const timeLabel = (at: string | null) =>
  at
    ? new Date(at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
      }) + ' CT'
    : 'Never';
const shortTime = (at: number) =>
  new Date(at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
export const statusLabel = (status: string | null) =>
  ({
    ok: 'Worked',
    partial: 'Partly worked',
    error: 'Failed',
    skipped: 'Nothing to do',
    started: 'Running',
  })[status ?? ''] ?? 'No run yet';
const severity = (status: string) =>
  ({ error: 5, partial: 4, started: 3, ok: 2, skipped: 1 })[status] ?? 0;

/** Ten-minute visual buckets retain the worst outcome; counts reveal grouped runs. */
export function runBuckets(runs: TimelineRun[], from: number) {
  const buckets = new Map<number, TimelineRun[]>();
  for (const run of runs) {
    const index = Math.min(
      35,
      Math.max(0, Math.floor((Date.parse(run.started_at) - from) / 600000)),
    );
    buckets.set(index, [...(buckets.get(index) ?? []), run]);
  }
  return [...buckets].map(([index, entries]) => ({
    index,
    count: entries.length,
    status: entries.reduce((a, b) =>
      severity(a.status) >= severity(b.status) ? a : b,
    ).status,
  }));
}
export default function AutomationTimeline({
  timeline,
  metrics,
}: {
  timeline: OverviewData['timeline'];
  metrics: Metric[];
}) {
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const jobs = timeline.jobs;
  const flagged = (id: string) =>
    metrics.some((m) => m.key === `job_${id}` && needsAttention(m));
  const flaggedCount = jobs.filter((j) => flagged(j.id)).length;
  const primaryJobs = [
    'update-gauges:high-frequency',
    'sync-gauge-latest',
    'deliver-push',
    'generate-eddy-updates',
    'post-social',
    'sync-dam-snapshots',
    'trust-tick',
  ];
  const rank = (id: string) => {
    if (flagged(id)) return -1;
    const index = primaryJobs.indexOf(id);
    return index < 0 ? primaryJobs.length : index;
  };
  const ordered = [...jobs].sort((a, b) => rank(a.id) - rank(b.id));
  const shown = all ? ordered : ordered.slice(0, Math.max(7, flaggedCount));
  const detail = jobs.find((j) => j.id === selected);
  const from = Date.parse(timeline.from);
  return (
    <Panel
      id="automation"
      question="Are the automatic tasks running?"
      hint="What ran in the last 6 hours (Central time). Select a task for its runs."
      action={
        timeline.state === 'ok' && (
          <Status tone={flaggedCount ? 'warn' : 'good'}>
            {flaggedCount
              ? `${flaggedCount} of ${jobs.length} need a look`
              : 'No problems seen'}
          </Status>
        )
      }
    >
      {timeline.state !== 'ok' ? (
        <p className={styles.empty}>Task history did not load.</p>
      ) : (
        <>
          <div className={styles.legend}>
            <span data-status="ok">● Worked</span>
            <span data-status="error">◆ Failed</span>
            <span data-status="started">● Running</span>
            <span data-status="skipped">● Nothing to do</span>
          </div>
          <div className={styles.timelineScroll}>
            <div className={styles.timeline}>
              <div className={styles.timelineAxis}>
                <span>Task</span>
                <div>
                  {[0, 2, 4, 6].map((h) => (
                    <span key={h}>{shortTime(from + h * 3600000)}</span>
                  ))}
                </div>
                <span>Last run</span>
              </div>
              {shown.map((job) => (
                <button
                  className={styles.timelineRow}
                  key={job.id}
                  aria-pressed={selected === job.id}
                  onClick={() =>
                    setSelected(selected === job.id ? null : job.id)
                  }
                >
                  <span className={styles.jobName}>
                    {job.label}
                    {flagged(job.id) && (
                      <small className={styles.warning}>Needs a look</small>
                    )}
                  </span>
                  <span className={styles.runTrack}>
                    {runBuckets(job.runs, from).map((bucket) => (
                      <span
                        key={bucket.index}
                        className={styles.runMark}
                        style={{ left: `${(bucket.index / 36) * 100}%` }}
                        data-status={bucket.status}
                        title={`${shortTime(from + bucket.index * 600000)} · ${statusLabel(bucket.status)}${bucket.count > 1 ? ` (${bucket.count} runs)` : ''}`}
                      />
                    ))}
                    {!job.runs.length && (
                      <span className={styles.noRuns}>No runs in this window</span>
                    )}
                  </span>
                  <span className={styles.lastRun}>
                    {statusLabel(job.lastStatus)}
                    <small title={timeLabel(job.lastAt)}>
                      {relativeRun(job.lastAt)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {jobs.length > shown.length || all ? (
            <button className={styles.textButton} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${jobs.length} tasks`}
            </button>
          ) : null}
          {detail && (
            <div className={styles.detail} aria-live="polite">
              <h3>{detail.label}</h3>
              <p>
                Next run: <b>{timeLabel(detail.nextAt)}</b>
              </p>
              <div className={styles.runList}>
                {detail.runs.length ? (
                  detail.runs.map((run, i) => (
                    <div key={i}>
                      <span>{timeLabel(run.started_at)}</span>
                      <strong data-status={run.status}>
                        {statusLabel(run.status)}
                      </strong>
                      <span>
                        {run.duration_ms === null
                          ? '—'
                          : `${(run.duration_ms / 1000).toFixed(1)}s`}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>No runs in the last 6 hours. Last run: {timeLabel(detail.lastAt)}.</p>
                )}
              </div>
              <details>
                <summary>Schedule (for developers)</summary>
                <code>
                  {detail.id} · {detail.schedules.join(' / ')} (UTC)
                </code>
              </details>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
