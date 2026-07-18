-- supabase/migrations/00170_inbound_emails_replied_at.sql
--
-- Track when an admin last replied to an inbound message (via the in-app reply
-- that sends through Resend). Powers the "Replied" badge in the admin inbox.
-- Idempotent so it is safe to run whether or not 00169 was applied separately.

ALTER TABLE inbound_emails
  ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ;

COMMENT ON COLUMN inbound_emails.last_replied_at IS 'When an admin last sent a reply to this message via Resend';
