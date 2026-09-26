'use client';
import type { OverviewData } from '@/lib/admin/dashboard/overview-model';
import { needsAttention, type Metric } from '@/lib/admin/dashboard/model';
import { useInspectMetric } from './MetricDetails';

export function relativeRun(at: string | null, now = Date.now()) {
  if (!at) return 'Not recorded';
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
    return <p>Job history unavailable. No execution status is assumed.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-neutral-200">
        <thead>
          <tr>
            <th className="p-3">Job</th>
            <th className="p-3">Last run</th>
            <th className="p-3">Status</th>
            <th className="p-3">Next scheduled (CT)</th>
          </tr>
        </thead>
        <tbody>
          {timeline.jobs.map((job) => {
            const metric = metrics.find((m) => m.key === `job_${job.id}`);
            const label =
              metric && needsAttention(metric)
                ? 'Needs review'
                : ({
                    ok: 'Completed',
                    error: 'Failed',
                    partial: 'Partial',
                    started: 'Running',
                    skipped: 'Skipped',
                  }[job.lastStatus ?? ''] ?? 'Unknown');
            return (
              <tr key={job.id} className="border-t border-neutral-700">
                <td className="p-3">
                  <button
                    className="text-primary-400 hover:underline text-left"
                    onClick={() => inspect({ key: `job_${job.id}` })}
                  >
                    {job.label} →
                  </button>
                </td>
                <td className="p-3 whitespace-nowrap">
                  {relativeRun(job.lastAt)}
                </td>
                <td className="p-3">{label}</td>
                <td className="p-3 whitespace-nowrap">
                  {job.nextAt
                    ? new Date(job.nextAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/Chicago',
                      })
                    : 'Unknown'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
