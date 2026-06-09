-- Serialize cron runs across Vercel instances with a heartbeat row.
-- Each cron job upserts its row at start and deletes it at end. A concurrent
-- run sees a recent heartbeat and bails immediately.

CREATE TABLE IF NOT EXISTS cron_runs (
  job text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

-- Acquire a lock named `job_name`. Returns true if acquired, false if another
-- run's heartbeat is younger than `stale_after_seconds`.
CREATE OR REPLACE FUNCTION try_cron_lock(job_name text, stale_after_seconds int DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  acquired boolean;
BEGIN
  INSERT INTO cron_runs (job, started_at, heartbeat_at)
  VALUES (job_name, now(), now())
  ON CONFLICT (job) DO UPDATE
    SET started_at = EXCLUDED.started_at,
        heartbeat_at = EXCLUDED.heartbeat_at
    WHERE cron_runs.heartbeat_at < now() - make_interval(secs => stale_after_seconds);

  SELECT heartbeat_at = started_at INTO acquired
  FROM cron_runs
  WHERE job = job_name;

  RETURN COALESCE(acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION release_cron_lock(job_name text)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM cron_runs WHERE job = job_name;
$$;

-- Structured metadata on social_posts. Used by condition-change alerts to
-- key 4h cooldown dedup on (river, new_condition), so a flip-flop within
-- the window (dangerous→good→dangerous) isn't silenced by the first alert.
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_social_posts_condition_change
  ON social_posts ((metadata->>'new_condition'))
  WHERE post_type = 'condition_change';
