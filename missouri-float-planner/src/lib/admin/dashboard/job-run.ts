import { withTelemetryBuffer } from '@/lib/telemetry/buffer';
import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { jobOutcome, jobIdentity } from './jobs-model';
/** Two bounded writes per authenticated cron. Records never contain response text or request parameters. */
export function withJobRun(
  job: string,
  handler: (request: NextRequest) => Promise<Response>,
) {
  return async (request: NextRequest): Promise<Response> => {
    const secret = process.env.CRON_SECRET;
    if (
      !secret ||
      !hasValidMachineBearer(request.headers.get('authorization'), secret)
    )
      return handler(request);
    const name = jobIdentity(job, request.nextUrl);
    const id = crypto.randomUUID(),
      started = Date.now();
    async function write(row: Record<string, unknown>, insert = false) {
      try {
        const db = createAdminClient();
        const q = insert
          ? db.from('admin_job_runs').insert(row)
          : db.from('admin_job_runs').update(row).eq('id', id);
        const { error } = await q.abortSignal(AbortSignal.timeout(1000));
        if (error) console.warn('[job-monitor] Run record unavailable');
      } catch {
        console.warn('[job-monitor] Run record unavailable');
      }
    }
    async function incident(status: string) {
      if (status === 'skipped') return;
      try {
        const { error } = await createAdminClient()
          .rpc('record_admin_incident', {
            p_job: name,
            p_ok: status === 'ok',
            p_summary:
              status === 'partial'
                ? 'Some work did not complete.'
                : 'The job failed.',
          })
          .abortSignal(AbortSignal.timeout(1000));
        if (error) console.warn('[job-monitor] Incident history unavailable');
      } catch {
        console.warn('[job-monitor] Incident history unavailable');
      }
    }
    await write({ id, job: name, status: 'started' }, true);
    try {
      const response = await withTelemetryBuffer(() => handler(request));
      let body: unknown = null;
      try {
        body = await response.clone().json();
      } catch {
        /* non-JSON response */
      }
      const outcome = jobOutcome(body, response.status);
      await write({
        ...outcome,
        finished_at: new Date().toISOString(),
        duration_ms: Math.min(2147483647, Date.now() - started),
      });
      await incident(outcome.status);
      return response;
    } catch (error) {
      await write({
        status: 'error',
        finished_at: new Date().toISOString(),
        duration_ms: Math.min(2147483647, Date.now() - started),
      });
      await incident('error');
      throw error;
    }
  };
}
