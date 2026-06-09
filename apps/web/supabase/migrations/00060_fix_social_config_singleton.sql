-- 00060_fix_social_config_singleton.sql
-- Fix potential duplicate rows in social_config table.
--
-- The singleton unique index (idx_social_config_singleton) may have failed to
-- create during migration 00058 if the table already existed. Without it,
-- multiple rows can accumulate. The admin API uses .limit(1).single() which
-- masks duplicates — GET and PUT can pick different rows, causing saves to
-- appear successful but revert on refresh.

-- Step 1: Delete all but the most recently updated row
DELETE FROM social_config
WHERE id NOT IN (
  SELECT id FROM social_config ORDER BY updated_at DESC LIMIT 1
);

-- Step 2: Set highlights_per_run to 1 (stagger posts: 1 river per cron run)
UPDATE social_config SET highlights_per_run = 1 WHERE highlights_per_run > 1;

-- Step 3: Re-create singleton index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_config_singleton ON social_config ((true));
