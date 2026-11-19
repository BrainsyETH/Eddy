-- Social posts record their format and placement; social_config gains one
-- settings entry per scheduled format.
--
-- NOT YET APPLIED is recorded in supabase/production-migrations.txt, not here.
-- Plan: phase 3 of the social posting cleanup (one settings shape per format,
-- one send path, saved fields instead of values reverse-engineered from
-- render_request and image_url).
--
-- Deployment order: apply this before deploying the code that reads it. Every
-- change is additive and nullable, so the code already in production keeps
-- working against it.
--
-- ── social_posts.placement ──────────────────────────────────────────────────
-- 'reel' or 'story' for a destination with its own layout (Float Pick), and
-- for dam schedule videos, which post to Instagram as Stories. NULL means the
-- post has no placement choice (a shared render or an image post). History,
-- review and retry used to work this out from render_request.inputProps.
--
-- ── social_posts.format ─────────────────────────────────────────────────────
-- The admin format a row belongs to, where post_type alone cannot say:
-- river_highlight holds both Eddy's Read and ClipEngine clips, and dam videos
-- are saved as 'manual'. Values written from now on: the post-types.ts kinds
-- (river_highlight = Eddy's Read, weekly_forecast, section_guide,
-- daily_digest, tip), 'clip' and 'dam_schedule'. NULL for older rows the
-- backfill cannot classify with certainty and for formats that do not need it;
-- readers fall back to post_type for those.
--
-- ── social_config.formats ───────────────────────────────────────────────────
-- One settings object per scheduled format: { days, time, destinations }.
-- Starts empty. Until the admin saves, the app derives each format's settings
-- from the legacy keys (media_schedule, weekly_forecast, section_guide,
-- digest_time_cst); each save writes the derived object here. The legacy keys
-- stay until a later, separately authorized cleanup.

alter table public.social_posts add column if not exists placement text;
alter table public.social_posts drop constraint if exists social_posts_placement_check;
alter table public.social_posts add constraint social_posts_placement_check
  check (placement is null or placement in ('reel', 'story'));
comment on column public.social_posts.placement is
  'reel or story for destinations with their own layout and for dam Stories; NULL when the post has no placement choice.';

alter table public.social_posts add column if not exists format text;
alter table public.social_posts drop constraint if exists social_posts_format_check;
alter table public.social_posts add constraint social_posts_format_check
  check (format is null or format ~ '^[a-z][a-z_]{1,39}$');
comment on column public.social_posts.format is
  'Admin format (post-types.ts kind, clip or dam_schedule). NULL for unclassified older rows; readers fall back to post_type.';

-- The scheduler asks "did this format post today" every 30 minutes.
create index if not exists idx_social_posts_format_created
  on public.social_posts (format, created_at desc)
  where format is not null;

-- Backfill only what the saved rows prove.
update public.social_posts
   set placement = render_request->'inputProps'->>'placement'
 where placement is null
   and render_request->>'compositionId' = 'social-route-portrait'
   and render_request->'inputProps'->>'placement' in ('reel', 'story');

update public.social_posts
   set placement = 'story', format = 'dam_schedule'
 where render_request->>'compositionId' = 'social-dam-schedule'
   and platform = 'instagram'
   and (placement is null or format is null);

update public.social_posts
   set format = 'dam_schedule'
 where format is null
   and render_request->>'compositionId' = 'social-dam-schedule';

update public.social_posts
   set format = post_type
 where format is null
   and post_type in ('weekly_forecast', 'section_guide', 'daily_digest', 'weekly_trend', 'tip');

update public.social_posts
   set format = 'river_highlight'
 where format is null
   and post_type = 'river_highlight'
   and image_url like '%type=weekend-read&%';

alter table public.social_config add column if not exists formats jsonb not null default '{}'::jsonb;
alter table public.social_config drop constraint if exists social_config_formats_object;
alter table public.social_config add constraint social_config_formats_object
  check (jsonb_typeof(formats) = 'object');
comment on column public.social_config.formats is
  'Per-format schedule settings { days, time, destinations }, keyed by post-types.ts kind. Empty until the admin saves; the app derives settings from the legacy keys meanwhile.';
