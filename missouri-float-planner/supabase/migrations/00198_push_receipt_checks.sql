-- 00198_push_receipt_checks.sql
-- Makes the receipts pass possible, and stops it re-asking about the same
-- tickets forever.
--
-- ── THE PROBLEM ────────────────────────────────────────────────────────────
--
-- Sending a push is two steps, and Eddy only ever did the first. A TICKET says
-- Expo accepted the message; whether APNs took it arrives later, in a RECEIPT.
-- `DeviceNotRegistered` — someone deleted the app, or restored to a new phone —
-- almost always arrives in the receipt, not the ticket.
--
-- 00190 anticipated this: it added `ticket_id` and the partial index
-- `idx_apd_ticket` explicitly "for the follow-up receipts pass". That pass was
-- never written. The consequence is silent and one-directional: a dead token
-- keeps being sent to, keeps succeeding at the ticket stage, and never trips
-- the failure_count backstop — so the row lives forever and its owner simply
-- stops getting alerts with nothing anywhere to show why.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- One column recording that we asked. Without it the poll has no way to
-- distinguish "not checked yet" from "checked, receipt was fine", so every pass
-- would re-poll every delivery in the retention window and grow without bound.
--
-- The index is rebuilt around it so the poll query stays a small partial scan:
-- unchecked sent tickets only, which is normally minutes of traffic rather than
-- the full 24h of history.

alter table public.alert_push_deliveries
    add column if not exists receipt_checked_at timestamptz;

comment on column public.alert_push_deliveries.receipt_checked_at is
    'When Expo was asked about this ticket. Null = not yet polled. Set even when the receipt came back OK, and set on abandonment once the ticket ages past Expo''s 24h retention, so the poll never revisits a row.';

-- Replaces the 00190 index. That one ordered by sent_at over every sent ticket;
-- this one covers exactly the poll's WHERE clause, so the scan shrinks to the
-- unchecked tail instead of the whole retention window.
drop index if exists public.idx_apd_ticket;

create index if not exists idx_apd_receipt_pending
    on public.alert_push_deliveries (sent_at)
    where ticket_id is not null and status = 'sent' and receipt_checked_at is null;
