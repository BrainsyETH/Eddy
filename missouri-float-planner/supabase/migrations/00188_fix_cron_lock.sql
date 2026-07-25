-- 00188_fix_cron_lock.sql
-- try_cron_lock never actually blocked a concurrent run.
--
-- THE BUG (00090): acquisition was decided by
--
--     SELECT heartbeat_at = started_at INTO acquired FROM cron_runs WHERE job = job_name;
--
-- The design clearly intended a long-running job to keep bumping heartbeat_at, so that
-- heartbeat_at <> started_at would mark "someone is still running". But NOTHING in the
-- codebase ever updates heartbeat_at on its own — both columns are set to the same now()
-- on insert AND on stale takeover. So for a live, non-stale lock the ON CONFLICT ... WHERE
-- fails, no row changes, and the row still satisfies heartbeat_at = started_at → the
-- function returns TRUE and the second run proceeds anyway.
--
-- Verified against production before this fix: three consecutive calls for the same job
-- with a 600s stale window returned true, true, true.
--
-- Consequence: `post_social` (the only caller until now, src/app/api/cron/post-social
-- /route.ts) has had NO mutual exclusion. This fix makes that job genuinely serialize.
--
-- THE FIX: decide acquisition from whether THIS statement actually wrote the row. With
-- ON CONFLICT ... DO UPDATE ... WHERE <stale>, a live lock updates zero rows, so RETURNING
-- yields nothing and EXISTS is false. No heartbeat bookkeeping required.

CREATE OR REPLACE FUNCTION try_cron_lock(job_name text, stale_after_seconds int DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  acquired boolean;
BEGIN
  WITH ins AS (
    INSERT INTO cron_runs (job, started_at, heartbeat_at)
    VALUES (job_name, now(), now())
    ON CONFLICT (job) DO UPDATE
      SET started_at = now(),
          heartbeat_at = now()
      WHERE cron_runs.heartbeat_at < now() - make_interval(secs => stale_after_seconds)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM ins) INTO acquired;

  RETURN COALESCE(acquired, false);
END;
$$;

COMMENT ON FUNCTION try_cron_lock(text, int) IS
  'Acquire a named cron lock. Returns true only if this call inserted the row or took over a lock whose heartbeat is older than stale_after_seconds. Release with release_cron_lock(). Because nothing refreshes heartbeat_at mid-run, choose stale_after_seconds >= the job''s maxDuration so a run killed before its finally block frees the lock promptly.';
