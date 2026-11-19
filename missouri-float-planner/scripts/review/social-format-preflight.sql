-- READ ONLY: run before applying 20261119033834. Lists the scheduled Daily
-- Reports the migration will retire (auto_publish -> false) because the new
-- Central-date uniqueness rule allows one per platform per day. Each group
-- keeps the row with keep = true. No rows means nothing is retired.
WITH ranked AS (
  SELECT id, platform, status, created_at,
         (created_at AT TIME ZONE 'America/Chicago')::date AS central_day,
         row_number() OVER (
           PARTITION BY platform, (created_at AT TIME ZONE 'America/Chicago')::date
           ORDER BY (status = 'published') DESC, created_at DESC
         ) AS n
    FROM public.social_posts
   WHERE post_type = 'daily_digest' AND auto_publish = true
)
SELECT platform, central_day, id, status, created_at, n = 1 AS keep
  FROM ranked
 WHERE (platform, central_day) IN (SELECT platform, central_day FROM ranked WHERE n > 1)
 ORDER BY central_day, platform, n;
-- The index the migration replaces, for comparison afterwards.
SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE c.relname = 'idx_social_posts_digest_dedup';
