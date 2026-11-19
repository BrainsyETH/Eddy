alter table public.social_posts add column scheduled_at timestamptz;

alter table public.social_posts drop constraint social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check
  (status in ('pending','rendering','review','scheduled','publishing','published','inbox','failed','skipped','unknown'));

alter table public.social_posts add constraint social_scheduled_draft_has_time
  check (status <> 'scheduled' or (scheduled_at is not null and auto_publish is false));

create index social_posts_due_drafts on public.social_posts (scheduled_at, id)
  where status = 'scheduled';
