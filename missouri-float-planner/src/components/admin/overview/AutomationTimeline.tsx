'use client';
import { useState } from 'react';
import type {
  OverviewData,
  TimelineRun,
} from '@/lib/admin/dashboard/overview-model';
import { needsAttention, type Metric } from '@/lib/admin/dashboard/model';
import { relativeRun } from './JobStatusTable';
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
    : 'Not recorded';
const shortTime = (at: number) =>
  new Date(at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
const statusLabel = (status: string | null) =>
  ({
    ok: 'Completed',
    partial: 'Needs review',
    error: 'Failed',
    skipped: 'Skipped',
    started: 'Running',
  })[status ?? ''] ?? 'No run recorded';
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
  const shown = all ? ordered : ordered.slice(0, 7);
  const detail = jobs.find((j) => j.id === selected);
  const from = Date.parse(timeline.from);
  return (
    <section
      id="automation"
      className={styles.panel}
      aria-labelledby="automation-title"
    >
      <div className={styles.panelHead}>
        <div>
          <h2 id="automation-title">What ran, and when?</h2>
          <p>Last 6 hours · Central time · select a job to inspect its runs.</p>
        </div>
        <span className={styles.pill}>{jobs.length} scheduled tasks</span>
      </div>
      <div className={styles.legend}>
        <span data-status="ok">● Completed</span>
        <span data-status="error">◆ Failed / partial</span>
        <span data-status="started">● Running</span>
        <span data-status="skipped">● Skipped</span>
      </div>
      {timeline.state !== 'ok' ? (
        <p className={styles.empty}>{timeline.reason}</p>
      ) : (
        <>
          <div className={styles.timelineScroll}>
            <div className={styles.timeline}>
              <div className={styles.timelineAxis}>
                <span>Automation</span>
                <div>
                  {[0, 2, 4, 6].map((h) => (
                    <span key={h}>{shortTime(from + h * 3600000)}</span>
                  ))}
                </div>
                <span>Latest run</span>
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
                      <small className={styles.warning}>Needs review</small>
                    )}
                  </span>
                  <span className={styles.runTrack}>
                    {runBuckets(job.runs, from).map((bucket) => (
                      <span
                        key={bucket.index}
                        className={styles.runMark}
                        style={{ left: `${(bucket.index / 36) * 100}%` }}
                        data-status={bucket.status}
                        title={`${bucket.count} run(s) · ${statusLabel(bucket.status)} · ${shortTime(from + bucket.index * 600000)}`}
                      />
                    ))}
                    {!job.runs.length && (
                      <span className={styles.noRuns}>
                        No recorded run in this window
                      </span>
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
          <button className={styles.textButton} onClick={() => setAll(!all)}>
            {all ? 'Show fewer tasks' : `Show all ${jobs.length} tasks`} ↓
          </button>
          {detail && (
            <div className={styles.detail} aria-live="polite">
              <h3>{detail.label}</h3>
              <p>
                Next scheduled: <b>{timeLabel(detail.nextAt)}</b>. A skipped run
                may mean there was no work or another run held the lock.
              </p>
              <p className={styles.note}>
                Schedule shown even in previews; Vercel executes these schedules
                in production. Times are expectations, not guarantees.
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
                          ? 'Duration not recorded'
                          : `${(run.duration_ms / 1000).toFixed(1)}s`}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>
                    No runs in this six-hour window. Last recorded:{' '}
                    {timeLabel(detail.lastAt)}.
                  </p>
                )}
              </div>
              <details>
                <summary>Technical schedule</summary>
                <code>
                  {detail.id} · {detail.schedules.join(' / ')} (UTC)
                </code>
              </details>
            </div>
          )}
          <p className={styles.note}>
            Each mark groups up to 10 minutes and shows the most severe recorded
            outcome. Empty space means no recorded run, not necessarily failure.
            History begins when monitoring was enabled.
          </p>
        </>
      )}
    </section>
  );
}
