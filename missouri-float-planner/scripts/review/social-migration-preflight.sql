-- READ ONLY: run before applying 20260916140000. Expected: no duplicate rows;
-- existing digest index present and valid. Historical auto_publish=true means
-- legacy behavior/unknown provenance, not proof that a scheduled job created it.
SELECT post_type, platform, (created_at AT TIME ZONE 'UTC')::date AS post_day, count(*)
FROM public.social_posts WHERE post_type = 'daily_digest'
GROUP BY 1, 2, 3 HAVING count(*) > 1;
SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'idx_social_posts_digest_dedup';
SELECT status, count(*) FROM public.social_posts GROUP BY status ORDER BY status;
