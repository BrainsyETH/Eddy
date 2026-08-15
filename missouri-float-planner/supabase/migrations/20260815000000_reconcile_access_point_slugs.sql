-- Converge every access-point slug on the one production serves.
--
-- ── WHY THIS IS A NEW FILE AND NOT AN EDIT ────────────────────────────────
--
-- The drift this fixes was found while reviewing 20260811203000, and the first
-- attempt at fixing it — branch claude/access-slug-reconciliation, which that
-- migration's header still points at — edited that migration and the ones that
-- created the rows. Both are applied history: 20260811203000 has already had
-- more than one body in circulation, and rewriting 00055–00076 would change
-- what a database built last month was built FROM. A new forward migration is
-- the only safe convergence point, so nothing before this file is touched by
-- it. THIS FILE IS THAT BRANCH'S REPLACEMENT; the pointer in 20260811203000 is
-- left as written because it, too, is applied history.
--
-- ── THE PRODUCTION SLUG WINS, AND NOT BY DEFAULT ──────────────────────────
--
-- A slug is a public identifier. /rivers/<state>/<river>/access/<slug> is
-- linked and indexed, and blog_posts.guide_data addresses put-in and take-out
-- by slug — every from_slug and to_slug in the live guide data resolves against
-- production's spelling. Renaming live rows to match a file would break indexed
-- URLs and live guide data to tidy a copy nothing serves from. So the database
-- is canonical and every other artifact moves to it.
--
-- Nineteen rows across six rivers drifted. They were found when a correction
-- migration keyed four UPDATEs on slug and two matched nothing: an UPDATE whose
-- WHERE matches nothing SUCCEEDS, so the only thing that caught it was that
-- migration's own assertion block.
--
-- The list lives in src/lib/access-slugs.ts as well, where the seed checker and
-- the unit tests read it. This file repeats it rather than importing it — SQL
-- cannot import TypeScript — and `npm run db:check-access-slugs` is what keeps
-- the two honest.
--
-- ── WHAT THIS DOES IN EACH ENVIRONMENT ────────────────────────────────────
--
-- Production: nothing. Verified read-only on 2026-08-15 — all nineteen legacy
-- slugs are absent and all nineteen canonical ones present. The rename below
-- matches no row and the assertions pass. That is the intended outcome, not a
-- reason to skip the file: it is what makes every OTHER database agree.
--
-- A fresh `supabase db reset`: also nothing, for a reason worth writing down
-- because a comment on 20260811203000 gets it wrong. No migration inserts
-- RIVERS — they come only from supabase/seed/rivers.sql, which runs after the
-- migrations. Every access-point migration (00046, 00055, 00056, 00068, 00074,
-- 00076) inserts with `SELECT r.id … FROM rivers r WHERE r.slug = '…'`, which
-- selects zero rows against an empty rivers table. So a reset reaches this file
-- with NO access points at all, and the seed — now written in canonical slugs —
-- is the only thing that creates them.
--
-- A database built before this change: this is the case the file exists for. A
-- developer database or preview branch reset while the seed still used the
-- legacy spellings holds those rows, and this renames them in place, preserving
-- the row and its id rather than deleting and reinserting it.

-- Session-scoped rather than ON COMMIT DROP, and dropped explicitly at the end.
-- The Supabase CLI wraps a migration in one transaction, but `psql -f` does not
-- — every statement commits on its own — and ON COMMIT DROP took the table away
-- before the next statement could see it. A session temp table behaves the same
-- either way.
DROP TABLE IF EXISTS access_slug_renames;
CREATE TEMP TABLE access_slug_renames (
  river     TEXT NOT NULL,
  legacy    TEXT NOT NULL,
  canonical TEXT NOT NULL
);

INSERT INTO access_slug_renames (river, legacy, canonical) VALUES
  ('meramec',      'scotia-bridge',         'scotia-bridge-access'),
  ('meramec',      'onondaga-cave-sp',      'onondaga-cave-state-park'),
  ('eleven-point', 'mcdowell',              'mcdowell-access'),
  ('eleven-point', 'whitten',               'whitten-access'),
  ('eleven-point', 'narrows',               'the-narrows-highway-142'),
  ('eleven-point', 'myrtle',                'myrtle-access'),
  ('jacks-fork',   'eminence',              'eminence-city-access'),
  ('niangua',      'riverfront-campground', 'riverfront-campground-canoe'),
  ('niangua',      'maggard-corkery',       'maggard-canoe-corkery-campground'),
  ('niangua',      'big-bear-resort',       'big-bear-river-resort'),
  ('niangua',      'barclay-access',        'barclay-conservation-area-access'),
  ('niangua',      'mountain-creek-resort', 'mountain-creek-family-resort'),
  ('niangua',      'mother-natures-retreat','mother-nature-s-riverfront-retreat'),
  ('niangua',      'ha-ha-tonka',           'ha-ha-tonka-state-park'),
  ('huzzah',       'hazel-creek',           'hazel-creek-recreation-area'),
  ('huzzah',       'red-bluff',             'red-bluff-recreation-area'),
  ('huzzah',       'butts-bridge',          'butts-low-water-bridge'),
  ('huzzah',       'highway-8-lower',       'highway-8-bridge-lower'),
  ('huzzah',       'huzzah-conservation',   'huzzah-conservation-area');

DO $$
DECLARE
  collisions TEXT;
  before_count BIGINT;
  after_count BIGINT;
  renamed BIGINT;
  survivors TEXT;
BEGIN
  SELECT count(*) INTO before_count FROM public.access_points;

  -- ── 1. BOTH ROWS PRESENT IS A PERSON'S PROBLEM, NOT A MIGRATION'S ───────
  --
  -- If a database holds the legacy row AND the canonical row, they are two
  -- records for one place and this file cannot know which one carries the
  -- corrections, the links or the guide-data references. Renaming would violate
  -- UNIQUE(river_id, slug); deleting or merging one would destroy a row nobody
  -- asked it to destroy. So it refuses, loudly, with the pairs named — the one
  -- outcome that leaves the database exactly as it found it.
  SELECT string_agg(format('%s: %s + %s', m.river, m.legacy, m.canonical), ', '
                    ORDER BY m.river, m.legacy)
    INTO collisions
    FROM access_slug_renames m
    JOIN public.rivers r ON r.slug = m.river
   WHERE EXISTS (SELECT 1 FROM public.access_points ap
                  WHERE ap.river_id = r.id AND ap.slug = m.legacy)
     AND EXISTS (SELECT 1 FROM public.access_points ap
                  WHERE ap.river_id = r.id AND ap.slug = m.canonical);

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION
      'access slug reconciliation: both the legacy and the canonical row exist for %. '
      'These are duplicate records for one place and merging them is a judgement '
      'about the river, not a rename. Resolve them by hand, then re-run.', collisions;
  END IF;

  -- ── 2. RENAME WHERE ONLY THE LEGACY ROW EXISTS ──────────────────────────
  --
  -- An UPDATE, never a delete-and-reinsert: the id is referenced by
  -- access_point_service_links, campsite_facilities and float plans, and the
  -- row carries corrections applied by earlier migrations. Step 1 has already
  -- ruled out the only case where this could collide.
  --
  -- Matched on river AND slug, because UNIQUE(river_id, slug) is per river and
  -- `two-rivers` is a real access on both the Current and the Jacks Fork.
  WITH renamed_rows AS (
    UPDATE public.access_points ap
       SET slug = m.canonical,
           updated_at = NOW()
      FROM access_slug_renames m
      JOIN public.rivers r ON r.slug = m.river
     WHERE ap.river_id = r.id
       AND ap.slug = m.legacy
    RETURNING 1
  )
  SELECT count(*) INTO renamed FROM renamed_rows;

  -- ── 3. PROVE IT, RATHER THAN ASSUME IT ──────────────────────────────────
  --
  -- Both assertions hold in every environment, including the ones where step 2
  -- did nothing, so neither needs a guard on the river having any rows — which
  -- is the guard that silently disables an assertion when a table is empty.
  SELECT string_agg(format('%s/%s', m.river, m.legacy), ', ' ORDER BY m.river, m.legacy)
    INTO survivors
    FROM access_slug_renames m
    JOIN public.rivers r ON r.slug = m.river
    JOIN public.access_points ap ON ap.river_id = r.id AND ap.slug = m.legacy;

  IF survivors IS NOT NULL THEN
    RAISE EXCEPTION 'access slug reconciliation: legacy slugs survived the rename: %', survivors;
  END IF;

  SELECT count(*) INTO after_count FROM public.access_points;
  IF after_count <> before_count THEN
    RAISE EXCEPTION
      'access slug reconciliation: access_points went from % rows to %. '
      'A rename must not create or destroy a place.', before_count, after_count;
  END IF;

  RAISE NOTICE 'access slug reconciliation: % row(s) renamed, % row(s) total, no legacy slugs remain',
    renamed, after_count;
END $$;

DROP TABLE access_slug_renames;
