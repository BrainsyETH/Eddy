-- Migration: 20261009120000_campsite_walk_up_counts.sql
--
-- First-come (walk-up) inventory per facility-night, for the campground card.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- campsite_availability counts reservable sites only (recgov.ts foldNight
-- counts 'Not Reservable' nowhere, on purpose). Red Bluff on a busy night is
-- therefore "20 of 20 booked" while 40 first-come sites exist, and the iOS
-- sheet printed "Fully booked" above a list of those 40. The per-site rows
-- already record 'walk_up'; this view counts them, so nothing is stored twice.
--
-- ── The freshness rule ──────────────────────────────────────────────────────
-- A per-site row counts only when its fetched_at EQUALS the facility-night's
-- aggregate fetched_at. sync.ts writes both from one payload with one
-- timestamp string, but the per-site write fails on its own terms and its
-- upsert never deletes, so a site missing from today's payload keeps
-- yesterday's row (45 such rows on 2026-10-09, all state parks). Equality
-- keeps a stale row from being counted beside a fresh total.
--
-- walk_up_sites is NULL — unknown, never zero — when no per-site row matches
-- the aggregate's observation. Recreation.gov only: UseDirect's IsFree boolean
-- cannot express walk-up at all, so state parks are absent and read as unknown.
--
-- ── Cost ────────────────────────────────────────────────────────────────────
-- Measured against production before writing this: joining every per-site
-- row (~108k) took 0.6–1.1 s cold, which is too slow for a river page. Walk-up
-- rows are ~3% of the table, so the partial index below makes the count an
-- index-only scan of a few thousand entries, and the zero-vs-unknown check is
-- one primary-key probe per facility-night that stops at the first hit.

CREATE INDEX IF NOT EXISTS campsite_site_availability_walk_up_idx
  ON public.campsite_site_availability (site_id, date, fetched_at)
  WHERE status = 'walk_up';

CREATE OR REPLACE VIEW public.campsite_walk_up_counts
WITH (security_invoker = true) AS
SELECT
  a.facility_id,
  a.date,
  a.fetched_at,
  CASE
    WHEN w.walk_up_sites IS NOT NULL THEN w.walk_up_sites
    WHEN EXISTS (
      SELECT 1
      FROM public.campsite_sites s
      JOIN public.campsite_site_availability sa
        ON sa.site_id = s.id AND sa.date = a.date AND sa.fetched_at = a.fetched_at
      WHERE s.facility_id = a.facility_id
    ) THEN 0
  END AS walk_up_sites
FROM public.campsite_availability a
JOIN public.campsite_facilities f
  ON f.id = a.facility_id AND f.source = 'recreation_gov'
LEFT JOIN (
  SELECT s.facility_id, sa.date, sa.fetched_at, count(*)::int AS walk_up_sites
  FROM public.campsite_site_availability sa
  JOIN public.campsite_sites s ON s.id = sa.site_id
  WHERE sa.status = 'walk_up'
  GROUP BY s.facility_id, sa.date, sa.fetched_at
) w
  ON w.facility_id = a.facility_id AND w.date = a.date AND w.fetched_at = a.fetched_at;

COMMENT ON VIEW public.campsite_walk_up_counts IS
  'Walk-up sites per Recreation.gov facility-night, counted only from per-site rows of the same observation as the aggregate. NULL = unknown.';

-- Read-only to the public, like the tables underneath (whose RLS still applies:
-- security_invoker). Supabase's default privileges grant ALL on new public
-- objects to anon and authenticated directly, so revoke those by name first —
-- see 20260822143308 for why naming the roles matters.
REVOKE ALL ON TABLE public.campsite_walk_up_counts FROM public;
REVOKE ALL ON TABLE public.campsite_walk_up_counts FROM anon, authenticated;
GRANT SELECT ON TABLE public.campsite_walk_up_counts TO anon, authenticated;
