-- File: supabase/migrations/00127_enable_rls_on_unprotected_tables.sql
-- Closes a critical security gap flagged by Supabase advisors: five tables
-- shipped without Row Level Security, leaving them fully readable AND writable
-- to anyone holding the public anon key. Most worryingly, email_subscribers
-- exposed subscriber emails (PII).
--
-- Policies follow the patterns already established in 00004:
--   - Reference data (rivers, access_points, hazards, etc.) → public SELECT.
--   - PII / internal logs → no policies; only the server-side admin client
--     (service-role) touches them, which bypasses RLS.
--
-- Per-table reasoning:
--
--   river_mile_markers — Mile-marker reference geometry. Non-sensitive, fits
--     the existing "anyone can read" pattern for reference tables.
--
--   float_segments — Known float times between access points. The public
--     /api/plan endpoint reads this via the RPCs get_float_segment and
--     get_segment_float_time, neither of which is SECURITY DEFINER. Without
--     a public SELECT policy, plan generation breaks.
--
--   river_photos — Curated marketing photo library. Already meant to be
--     public; matches the read pattern.
--
--   email_subscribers — Subscriber emails (PII). Only /api/subscribe writes
--     it, and it uses the service-role admin client. No policies needed.
--
--   cron_runs — Internal cron lock + run log. Only cron API routes touch it,
--     all via the service-role admin client. No policies needed.

ALTER TABLE public.river_mile_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "River mile markers are viewable by everyone"
  ON public.river_mile_markers FOR SELECT
  USING (true);

ALTER TABLE public.float_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Float segments are viewable by everyone"
  ON public.float_segments FOR SELECT
  USING (true);

ALTER TABLE public.river_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "River photos are viewable by everyone"
  ON public.river_photos FOR SELECT
  USING (true);

-- PII: no policies. Service-role admin client bypasses RLS for writes
-- from /api/subscribe.
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Internal logs / cron locks: no policies. All writes go through cron API
-- routes using the service-role admin client, which bypasses RLS.
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
