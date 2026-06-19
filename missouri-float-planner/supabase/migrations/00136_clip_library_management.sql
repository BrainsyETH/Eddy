-- Clip library: management + reliability hardening.
-- 1) updated_at trigger (clip_library was the only social table missing the
--    shared trigger); 2) a terminal 'failed' brand-check status + error message
--    for failure tracking/retry; 3) posting_claimed_at for an atomic post claim
--    that stops two overlapping runs double-posting a clip; 4) a composite
--    (status, created_at) index for the queue scans.
-- Idempotent so it is safe to re-run.

-- 1. updated_at maintenance (reuses the shared trigger fn other tables use).
drop trigger if exists clip_library_updated_at on clip_library;
create trigger clip_library_updated_at
  before update on clip_library
  for each row execute function update_updated_at();

-- 2. Failure tracking: add 'failed' to the status set + a human-readable error.
alter table clip_library drop constraint if exists clip_library_brand_check_status_check;
alter table clip_library add constraint clip_library_brand_check_status_check
  check (brand_check_status in ('pending', 'approved', 'rejected', 'review', 'failed'));
alter table clip_library add column if not exists brand_check_error text;

-- 3. Atomic post claim: a run stamps this before posting; a concurrent run skips
--    a clip claimed within the last 15 minutes (crash-safe reclaim after that).
alter table clip_library add column if not exists posting_claimed_at timestamptz;

-- 4. Queue scans filter on status + order by created_at (post-clip, brand-check,
--    decision engine). One composite index covers them.
create index if not exists idx_clip_library_status_created
  on clip_library (brand_check_status, created_at);
