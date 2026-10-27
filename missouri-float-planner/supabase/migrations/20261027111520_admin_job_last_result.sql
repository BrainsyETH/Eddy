-- Preserve the latest outcome separately from the latest cron tick.
-- Off-window skips and in-flight retries must not erase a preceding failure.
-- An attempt still marked started after ten minutes did not report completion;
-- treat it as requiring attention without rewriting the historical run row.
-- This is additive: existing callers keep the same latest-run fields.
CREATE OR REPLACE FUNCTION public.admin_dashboard_jobs()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(summary)), '[]'::jsonb)
  FROM (
    SELECT
      latest.job,
      latest.started_at,
      latest.finished_at,
      latest.status,
      latest.duration_ms,
      latest.counters,
      (
        SELECT max(success.finished_at)
        FROM public.admin_job_runs success
        WHERE success.job = latest.job
          AND success.status = 'ok'
          AND success.started_at > now() - interval '30 days'
      ) AS last_success_at,
      (
        SELECT jsonb_build_object(
          'status', CASE WHEN result.status = 'started' THEN 'error' ELSE result.status END,
          'started_at', result.started_at,
          'completion_missing', result.status = 'started'
        )
        FROM public.admin_job_runs result
        WHERE result.job = latest.job
          AND (
            result.status IN ('ok', 'partial', 'error')
            OR (result.status = 'started' AND result.finished_at IS NULL
                AND result.started_at < now() - interval '10 minutes')
          )
          AND result.started_at > now() - interval '30 days'
        ORDER BY result.started_at DESC, result.id DESC
        LIMIT 1
      ) AS last_result
    FROM (
      SELECT DISTINCT ON (job)
        job, started_at, finished_at, status, duration_ms, counters
      FROM public.admin_job_runs
      WHERE started_at > now() - interval '30 days'
      ORDER BY job, started_at DESC, id DESC
      LIMIT 100
    ) latest
  ) summary;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_jobs() TO service_role;
