-- social_posts: an `unknown` publish outcome, and the provider id to settle it.
--
-- A post left in `publishing` means a platform call was in flight when the run
-- stopped. The reaper used to turn those into `failed`, and failed auto-posts
-- are retried — so a Reel that published just as the function limit hit was
-- posted a second time. `unknown` is never auto-retried; it is settled by
-- asking the platform (Instagram containers, via provider_attempt_id) or by an
-- admin who checked the account.
--
-- provider_attempt_id is the platform's id for the attempt, saved as soon as it
-- exists (an Instagram container id, before the publish step), so an attempt
-- that dies later can still be looked up.
--
-- Code deployed before this migration is safe: a rejected `unknown` write
-- leaves the row in `publishing` (also never auto-retried), and a missing
-- provider_attempt_id column is logged once and skipped.

alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check
  (status in ('pending','rendering','review','publishing','published','inbox','failed','skipped','unknown'));

alter table public.social_posts add column if not exists provider_attempt_id text;
comment on column public.social_posts.provider_attempt_id is
  'Platform id for the latest publish attempt (Instagram container id), saved before the publish step so an `unknown` outcome can be checked.';
