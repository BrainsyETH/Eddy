'use client';
import type { OverviewData } from '@/lib/admin/dashboard/overview-model';
import { needsAttention, type Metric } from '@/lib/admin/dashboard/model';
import { useInspectMetric } from './MetricDetails';
import { Status } from './bits';
import styles from './overview.module.css';

export function relativeRun(at: string | null, now = Date.now()) {
  if (!at) return 'Never';
  const minutes = Math.max(0, Math.floor((now - Date.parse(at)) / 60000));
  if (!Number.isFinite(minutes)) return 'Unknown';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
export default function JobStatusTable({
  timeline,
  metrics,
}: {
  timeline?: OverviewData['timeline'];
  metrics: Metric[];
}) {
  const inspect = useInspectMetric();
  if (!timeline || timeline.state !== 'ok')
    return <p className={styles.empty}>Task history did not load.</p>;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.detailTable}>
        <thead>
          <tr>
            <th>Task</th>
            <th>Last run</th>
            <th>Result</th>
            <th>Next run (CT)</th>
          </tr>
        </thead>
        <tbody>
          {timeline.jobs.map((job) => {
            const metric = metrics.find((m) => m.key === `job_${job.id}`);
            const flagged = metric ? needsAttention(metric) : false;
            const result = flagged
              ? { tone: 'bad' as const, text: 'Needs a look' }
              : ({
                  ok: { tone: 'good' as const, text: 'Worked' },
                  error: { tone: 'bad' as const, text: 'Failed' },
                  partial: { tone: 'warn' as const, text: 'Partly worked' },
                  started: { tone: 'quiet' as const, text: 'Running' },
                  skipped: { tone: 'quiet' as const, text: 'Nothing to do' },
                }[job.lastStatus ?? ''] ?? { tone: 'quiet' as const, text: 'No run yet' });
            return (
              <tr key={job.id}>
                <td>
                  <button
                    className={styles.textButton}
                    onClick={() => inspect({ key: `job_${job.id}` })}
                  >
                    {job.label}
                  </button>
                </td>
                <td>{relativeRun(job.lastAt)}</td>
                <td>
                  <Status tone={result.tone}>{result.text}</Status>
                </td>
                <td>
                  {job.nextAt
                    ? new Date(job.nextAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/Chicago',
                      })
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
