-- Migration: 20261011120000_report_client_ids.sql
-- PENDING BY DESIGN: apply before the API change that writes the column is
-- deployed, then record production's version here and in
-- supabase/production-migrations.txt (renaming if needed).
--
-- One report, once, however many times it is sent.
--
-- Float Mode (#1448 Phase 5) lets a paddler report a hazard with no signal.
-- The report waits on the phone and is sent when a connection returns, and a
-- send whose response is lost (the classic river case: the request reached
-- the server, the reply never reached the phone) is sent again. Without a key
-- the server cannot tell that retry from a second report, and moderators get
-- duplicates of the same strainer.
--
-- The phone makes a random UUID for each report when it is written and sends
-- it with every attempt. The unique index makes the second insert fail; the
-- route then answers with the first report's id, as a success. NULL for every
-- existing row and for clients that send none (the website), which the
-- partial index ignores.

ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS client_report_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS community_reports_client_report_id_key
  ON public.community_reports (client_report_id)
  WHERE client_report_id IS NOT NULL;

COMMENT ON COLUMN public.community_reports.client_report_id IS
  'Idempotency key chosen by the submitting device; a retried send of the same report returns the original row. NULL for clients that send none.';
