-- Record when an admin replied to a feedback submitter from the Inbox.
--
-- Additive and nullable: existing rows read as "never replied", and the reply
-- route still sends mail before this is applied (it then reports that the
-- reply time could not be recorded). No grants change: `feedback` stays
-- service-role only, with RLS enabled (00037).
alter table public.feedback
  add column if not exists last_replied_at timestamptz,
  add column if not exists last_replied_by text;

comment on column public.feedback.last_replied_at is
  'When an admin last emailed the submitter from the Inbox. Null = never.';
comment on column public.feedback.last_replied_by is
  'Display name of the admin who sent that reply.';
