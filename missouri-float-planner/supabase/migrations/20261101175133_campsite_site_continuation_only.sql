-- APPLIED to production (ilefwfpvphadsbptiaur) on 2026-11-01 as version 20261101175133,
-- the version the recording assigned, not the 20261101173216 this file was authored as.
-- Renamed to match. The ledger is supabase/production-migrations.txt.
--
-- Applied before the code that writes 'continuation_only' deploys, as it
-- must be: without it, any per-site row carrying the new status fails this
-- CHECK and the facility's upsert fails with it.
--
-- Adds one per-site status: a night that can be booked only as a later night
-- of a stay that arrives on a bookable night. recreation.gov publishes it as
-- the `Open` cell at the edge of a rolling booking window — observed
-- 2026-11-01 on War Eagle (233279): May 1 2027 `Available`, May 2–14 `Open`,
-- then `NYR`, which is a fourteen-night maximum stay hanging off the last
-- released arrival date.
--
-- It cannot be folded into an existing status without losing a real answer.
-- As `not_yet_released`, Available-then-Open stops being a bookable two-night
-- stay; as `open`, a person could be told to arrive on a night nobody can
-- arrive on. Stay search (src/lib/camping/stay.ts) resolves it from context:
-- open after a valid arrival, not yet released as an arrival.
--
-- Server-internal. /api/campsites projects it to not_yet_released before any
-- response (toWireSiteNights in src/lib/camping/sites.ts), so the app's night
-- codec is unchanged. The per-night aggregate tables are unchanged too: one
-- night's aggregate answers "can I arrive tonight", and folds it as not yet
-- released.

ALTER TABLE public.campsite_site_availability
  DROP CONSTRAINT IF EXISTS campsite_site_availability_status_check;

ALTER TABLE public.campsite_site_availability
  ADD CONSTRAINT campsite_site_availability_status_check
  CHECK (status IN ('open', 'reserved', 'walk_up', 'closed', 'not_yet_released', 'continuation_only'));
