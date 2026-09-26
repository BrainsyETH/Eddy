CREATE TABLE public.admin_job_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('started','ok','partial','error','skipped')),
 duration_ms integer,
 counters jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX admin_job_runs_job_started ON public.admin_job_runs(job,started_at DESC);
CREATE INDEX admin_job_runs_started ON public.admin_job_runs(started_at);
ALTER TABLE public.admin_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_job_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_job_runs TO service_role;
CREATE OR REPLACE FUNCTION public.admin_dashboard_jobs()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
 SELECT DISTINCT ON(job) job,started_at,finished_at,status,duration_ms,counters,
 (SELECT max(b.finished_at) FROM public.admin_job_runs b WHERE b.job=a.job AND b.status='ok' AND b.started_at>now()-interval '30 days') last_success_at
 FROM public.admin_job_runs a WHERE started_at>now()-interval '30 days' ORDER BY job,started_at DESC LIMIT 100
 ) t;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_jobs() TO service_role;

-- Global bound: a password spray must not create an unbounded audit-write stream.
-- No credentials, IP addresses, or supplied input enter the audit row.
CREATE OR REPLACE FUNCTION public.record_admin_login(p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(7618423) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.admin_activity_log WHERE entity_type='authentication' AND created_at>now()-interval '1 minute')>=30 THEN RETURN false; END IF;
 INSERT INTO public.admin_activity_log(action,entity_type) VALUES(CASE WHEN p_success THEN 'login_success' ELSE 'login_failed' END,'authentication');
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_admin_login(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_admin_login(boolean) TO service_role;

-- Durable rollout baseline: survives deployments and job-run retention.
-- Apply this pending migration at rollout, not weeks before enabling the app.
CREATE TABLE public.admin_monitoring_state (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_monitoring_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_monitoring_state FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_monitoring_state TO service_role;
INSERT INTO public.admin_monitoring_state(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.admin_dashboard_job_status()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('started_at',
  (SELECT started_at FROM public.admin_monitoring_state WHERE id),
  'runs', public.admin_dashboard_jobs());
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_job_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_job_status() TO service_role;
