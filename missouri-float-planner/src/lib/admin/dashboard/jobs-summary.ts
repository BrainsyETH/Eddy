import config from '../../../../vercel.json';
import expectedJobs from './expected-jobs.json';
import { createAdminClient } from '@/lib/supabase/admin';
import { jobIdentity } from './jobs-model';
import { nextScheduledAt } from './job-schedule';
import type { Metric } from './model';

export interface Run {
  job: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  duration_ms: number | null;
  last_success_at: string | null;
  counters: Record<string, number>;
}
export interface JobSnapshot {
  started_at: string | null;
  runs: Run[];
}
type Schedule = { path: string; schedule: string };

/** The independent manifest preserves expectations if a Vercel entry disappears. */
export function scheduledJobs(expected: Schedule[] = expectedJobs) {
  const jobs = new Map<string, Schedule[]>();
  for (const cron of expected) {
    const url = new URL(cron.path, 'https://eddy.guide');
    const name = jobIdentity(url.pathname.split('/').pop()!, url);
    jobs.set(name, [...(jobs.get(name) ?? []), cron]);
  }
  return jobs;
}

export function summarizeRuns(
  snapshot: JobSnapshot | null,
  now = Date.now(),
  options: {
    active?: boolean;
    expected?: Schedule[];
    deployed?: Schedule[];
  } = {},
): Metric[] {
  const active = options.active ?? true;
  const deployed = options.deployed ?? config.crons;
  return [...scheduledJobs(options.expected)].map(([job, schedules]) => {
    const meta = {
      key: `job_${job}`,
      section: 'Scheduled jobs',
      label: job,
      href: '/admin/activity',
    };
    const missing = schedules.some(
      (s) =>
        !deployed.some((d) => d.path === s.path && d.schedule === s.schedule),
    );
    if (active && missing)
      return {
        ...meta,
        detail:
          'Expected schedule is missing or changed in Vercel configuration. Reconcile the monitoring manifest when intentionally changing schedules.',
        attention: true,
        state: 'ok',
        value: 1,
      };
    if (!snapshot)
      return {
        ...meta,
        detail:
          'Job monitoring source unavailable. Execution status cannot be determined.',
        attention: false,
        state: 'unknown',
        value: null,
      };
    const run = snapshot.runs.find((r) => r.job === job);
    const baseline = run?.started_at ?? snapshot.started_at;
    let deadline: number;
    try {
      deadline =
        nextScheduledAt(
          schedules.map((s) => s.schedule),
          Date.parse(baseline ?? ''),
        ) +
        15 * 60000;
    } catch {
      return {
        ...meta,
        detail:
          'Monitoring baseline or schedule unavailable. Execution status cannot be determined.',
        attention: false,
        state: 'unknown',
        value: null,
      };
    }
    const overdue = active && now > deadline;
    const stuck =
      active &&
      run?.status === 'started' &&
      now - Date.parse(run.started_at) > 10 * 60000;
    const bad =
      overdue ||
      stuck ||
      (!!run && (run.status === 'error' || run.status === 'partial'));
    const detail = run
      ? `Last start: ${run.started_at}. Last successful run: ${run.last_success_at ?? 'not recorded'}. ${run.duration_ms ?? '?'} ms. State: ${run.status}. Counters: ${JSON.stringify(run.counters)}.`
      : `No run recorded since monitoring started at ${snapshot.started_at}.`;
    return {
      ...meta,
      detail: `${detail} ${active ? `Next run deadline: ${new Date(deadline).toISOString()}.` : 'Schedule deadlines are disabled outside production.'} ${overdue ? 'Overdue.' : ''} ${stuck ? 'Did not finish.' : ''}`,
      attention: bad,
      state: run || overdue ? 'ok' : 'unknown',
      value: bad ? 1 : (run?.status ?? null),
    };
  });
}

export async function jobMetrics(): Promise<Metric[]> {
  const active = process.env.VERCEL_ENV === 'production';
  try {
    const { data, error } = await createAdminClient()
      .rpc('admin_dashboard_job_status')
      .abortSignal(AbortSignal.timeout(3000));
    if (error || !data || !Array.isArray(data.runs))
      throw new Error('Job source unavailable');
    return summarizeRuns(data, Date.now(), { active });
  } catch {
    console.warn('[admin-dashboard] Job monitoring source unavailable');
    return summarizeRuns(null, Date.now(), { active });
  }
}
