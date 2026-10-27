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
  /** Absent before the additive job-outcome migration; null means there is no
   * completed or overdue unfinished work in retained history. Skips are not work. */
  last_result?: {
    started_at: string;
    status: 'ok' | 'partial' | 'error';
    completion_missing?: boolean;
  } | null;
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
    // The RPC returns one row per job, not the run history. Carry the last
    // outcome separately so a skipped tick or in-flight retry never clears a
    // failed or overdue unfinished attempt. Latest ticks own schedule deadlines.
    const terminal = run && ['ok', 'partial', 'error'].includes(run.status);
    const result = run?.last_result ?? (terminal ? {
      status: run.status, started_at: run.started_at, completion_missing: false,
    } : null);
    const resultUnavailable = !!run && run.last_result === undefined && !terminal;
    const bad =
      overdue ||
      stuck ||
      result?.status === 'error' ||
      result?.status === 'partial';
    const detail = run
      ? `Last start: ${run.started_at}. Last successful run: ${run.last_success_at ?? 'not recorded'}. ${run.duration_ms ?? '?'} ms. State: ${run.status}. Counters: ${JSON.stringify(run.counters)}.`
      : `No run recorded since monitoring started at ${snapshot.started_at}.`;
    const resultDetail = result
      ? result.completion_missing
        ? `Last attempt did not report completion (started ${result.started_at}).`
        : `Last completed work: ${result.status} (started ${result.started_at}).`
      : resultUnavailable
        ? 'Last completed work is unavailable until the pending job monitoring migration is applied.'
        : 'No completed work recorded in the retained history.';
    return {
      ...meta,
      detail: `${detail} ${resultDetail} ${active ? `Next run deadline: ${new Date(deadline).toISOString()}.` : 'Schedule deadlines are disabled outside production.'} ${overdue ? 'Overdue.' : ''} ${stuck ? 'Did not report completion.' : ''}`,
      attention: bad,
      state: bad || (run && !resultUnavailable) ? 'ok' : 'unknown',
      value: bad ? 1 : resultUnavailable ? null : (run?.status ?? null),
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
