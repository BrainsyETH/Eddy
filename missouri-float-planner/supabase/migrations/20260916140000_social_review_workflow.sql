-- Verified already present in production ilefwfpvphadsbptiaur on 2026-09-24.
-- Repaired migration history as 20260916140000 without re-running this SQL.
-- Manual generated posts wait for review. Scheduled posts keep auto-publishing.
alter table public.social_posts add column if not exists auto_publish boolean not null default true;
comment on column public.social_posts.auto_publish is 'Publication policy: true permits automation. Pre-migration rows default true for compatibility; original manual/scheduled provenance is unknown.';
alter table public.social_posts add column if not exists render_request jsonb;
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check
  (status in ('pending','rendering','review','publishing','published','inbox','failed','skipped'));
-- Intentional manual drafts/reposts must not require deleting posting history.
drop index if exists public.idx_social_posts_digest_dedup;
create unique index idx_social_posts_digest_dedup
 on public.social_posts (post_type, platform, ((created_at at time zone 'UTC')::date))
 where post_type = 'daily_digest' and auto_publish = true;
