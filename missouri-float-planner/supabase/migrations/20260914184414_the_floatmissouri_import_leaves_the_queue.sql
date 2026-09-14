-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-14 18:44:14 UTC and
-- RECORDED as 20260914184414; authored as 20260914200000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt.
--
-- Apply output: 53 rows deleted; pending queue 93 -> 40 table-wide (92 -> 39 on
-- active rivers); approved unchanged at 350 table-wide / 309 active. All three
-- pre-checks returned zero. float_plans still numbers 88, unchanged.
--
-- Remove the 53 mislocated rows the 2026-01 floatmissouri import left pending.
--
-- ── WHAT THESE ARE ──────────────────────────────────────────────────────
--
-- scripts/import-floatmissouri.ts ran 2026-01-22..26 and inserted 68 access
-- points as approved=false. Its own header warns that re-running it "would
-- duplicate and mislocate them", and it did: 55 of the 68 sit more than 1 500 m
-- from their river line, one of them 162 km away. Names arrived truncated
-- mid-string ('Hwy', 'St', 'Private', 'Brazil low-water bridge on road between
-- Hwy') and carrying unescaped HTML entities ('Bird&#8217;s Nest',
-- 'River &#8216;Round'). Fifteen Meramec rows share the identical mile 108.5 and
-- cluster within 40 m of each other some 82 km off-river, which is a geocoder
-- fallback rather than a set of places.
--
-- None of them is visible to a reader: RLS publishes on `approved`. What they
-- cost is the review queue — 92 pending rows of which two thirds can never be
-- approved, which is what makes the /admin badge meaningless.
--
-- ── WHY NOT ALL 68, AND WHY NOT A DATE WINDOW ───────────────────────────
--
-- A created_at window was the obvious selector and it is wrong twice over.
--
-- It is too WIDE: three well-formed records share the window — meramec
-- 'Scotia Bridge Access' (101 m, county-managed), 'Steelville City Park' (239 m,
-- municipal) and 'Fishing Spring Road' (225 m, MDC) — and two of those three are
-- in supabase/seed/access_points.sql, so they are places this project already
-- considers real. It is also too NARROW: jacks-fork 'Bunker Hill' was created
-- 2026-01-26, outside the 01-22/01-23 band the other 67 fall in.
--
-- So the selector is MISLOCATION, which is the actual defect, and the guards
-- below are provenance rather than identity.
--
-- The 68 split 53 / 15:
--
--   53  mislocated, referenced by no saved float plan            -> deleted here
--    1  mislocated but referenced by a saved plan (courtois
--       'Berryman Campground')                                   -> retained
--    1  mislocated and named by the seed (huzzah
--       'Butts low-water bridge', 1 526 m)                       -> retained
--   13  well-snapped: three duplicate an approved row within
--       63 m, the rest are unreviewed candidates                 -> retained
--
-- The retained 15 are triage, not deletion. docs/river-access-data-audit-
-- 2026-09-14-queries.sql carries the manifest for both sets.
--
-- ── THE TWO ROWS PULLED BACK OUT OF THE DELETE LIST ─────────────────────
--
-- 'Berryman Campground' is referenced by a saved float_plan, and
-- float_plans.start_access_id / end_access_id are NO ACTION (00002:234-235), so
-- deleting it aborts the migration. Twelve plans reference five of the 68. All
-- twelve have user_id IS NULL, but 00184_float_plans_private_read.sql:9-11 says
-- that is "every plan saved by the accountless web today" — anonymity is the
-- product, not a marker of a test fixture, and those plans are share-by-link
-- readable. Deleting somebody's saved trip needs better evidence than a date.
--
-- 'Butts low-water bridge' is named by supabase/seed/access_points.sql under
-- exactly this slug. compareAccessSlugs (src/lib/access-slugs.ts:207-250) never
-- reports a seed row whose slug the database holds, so it is silent today;
-- delete the row and it becomes `absent`, and huzzah/butts-low-water-bridge is
-- not in ACCESS_SLUG_ABSENT_EXCEPTIONS, so `npm run db:check-access-slugs`
-- starts failing. It is also a real named Huzzah access that happens to sit
-- 1 526 m out — 26 m past the cut — which is a coordinate to fix, not a row to
-- remove.
--
-- ── FOREIGN KEYS ────────────────────────────────────────────────────────
--
-- Checked across supabase/ for every REFERENCES access_points(id):
--
--   float_plans                    NO ACTION  -> would abort; asserted below
--   float_segments (put_in/take_out) SET NULL -> 3 huzzah rows, see below
--   river_photos                   SET NULL   -> 0 among the 53
--   campsite_facilities            SET NULL   -> 0, asserted below
--   community_reports              SET NULL   -> 0
--   embed_widgets                  SET NULL   -> 0
--   access_point_services          CASCADE    -> 0
--   drive_time_cache               CASCADE    -> cleaned automatically
--   segment_cache                  CASCADE    -> cleaned automatically
--
-- segment_cache cascading is why this file calls no invalidate_segment_cache:
-- the cascade removes precisely the rows that RPC would (00006:32-33 vs
-- 00007:239-244). An UPDATE would need the call; a DELETE does not.
--
-- The three float_segments rows are Huzzah segments naming the legacy 'Butts'
-- row, which is one of the two being RETAINED, so nothing is orphaned by this
-- migration after all. The assertion below holds the line anyway, because a
-- SET NULL here would leave a segment whose put_in_name still claims a place
-- that no longer resolves, and failing is better than degrading quietly.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
--
-- It approves nothing and corrects no coordinate. The pending queue goes 92 ->
-- 39 counting active rivers only, and 93 -> 40 table-wide (one pending row sits
-- on an inactive river); the NOTICE at the foot prints the table-wide pair. The
-- approved count must not move at all, and that is asserted rather than printed.

DO $purge$
DECLARE
    populated     BOOLEAN;
    pending_before INTEGER;
    pending_after  INTEGER;
    approved_before INTEGER;
    approved_after  INTEGER;
    n_plans       INTEGER;
    n_facilities  INTEGER;
    n_segments    INTEGER;
    n_remaining   INTEGER;
    n_deleted     INTEGER;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
    IF NOT populated THEN
        RAISE NOTICE 'access_points is empty (from-scratch build); nothing to purge.';
        RETURN;
    END IF;

    CREATE TEMP TABLE doomed (id UUID PRIMARY KEY) ON COMMIT DROP;

    INSERT INTO doomed (id)
    SELECT ap.id
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE ap.approved = false                                      -- blast radius
      AND ap.created_at >= TIMESTAMPTZ '2026-01-22 00:00:00+00'    -- provenance
      AND ap.created_at <  TIMESTAMPTZ '2026-01-27 00:00:00+00'
      AND (r.slug, ap.slug) IN (
        ('courtois', 'brazil-low-water-bridge-on-road-between-hwy'),
        ('courtois', 'butts-low-water-bridge'),
        ('courtois', 'hazel-creek-recreation-area-and'),
        ('courtois', 'huzzah-conservation-area-and'),
        ('courtois', 'junction-with-huzzah-creek'),
        ('courtois', 'private-campground-and'),
        ('current',  'current-view'),
        ('current',  'dun-roven-unimproved'),
        ('eleven-point', 'hwy-142-bridge'),
        ('huzzah',   'access-at-low-water-bridge'),
        ('huzzah',   'brazil-low-water-bridge-on-road-between-hwy'),
        ('huzzah',   'dillard'),
        ('huzzah',   'hwy'),
        ('huzzah',   'hwy-8-bridge'),
        ('huzzah',   'junction-with-huzzah-creek'),
        ('huzzah',   'private'),
        ('huzzah',   'private-campground-and'),
        ('huzzah',   'red-bluff-on-right'),
        ('meramec',  'ackerman'),
        ('meramec',  'allenton'),
        ('meramec',  'bird-8217-s-nest-access-crawford-county-on-rig'),
        ('meramec',  'boat-ramp-8211-meramec-state-park-on-left'),
        ('meramec',  'catawissa-conservation-area-and'),
        ('meramec',  'flamm-city'),
        ('meramec',  'hillcrest-park-private'),
        ('meramec',  'huzzah-conservation-area-and'),
        ('meramec',  'hwy'),
        ('meramec',  'hwy-21-bridge'),
        ('meramec',  'hwy-30-47-bridge'),
        ('meramec',  'hwy-66-bridge'),
        ('meramec',  'meramec-state-park-boat-ramp-from-hwy'),
        ('meramec',  'onondaga-state-park'),
        ('meramec',  'pacific-palisades-conservation-area-and'),
        ('meramec',  'pickle-ford-huff-ford'),
        ('meramec',  'private'),
        ('meramec',  'private-concrete-boat-ramp-on-left'),
        ('meramec',  'river-8216-round-conservation-area-and-access'),
        ('meramec',  'st'),
        ('meramec',  'valley-park-city'),
        ('meramec',  'winter-county-park-with-ramps-on-right'),
        ('niangua',  'access-near-mouth-of-bank-branch'),
        ('niangua',  'barclay-conservation-area-and'),
        ('niangua',  'bennett-spring-branch-on-right'),
        ('niangua',  'for-next-two-miles-there-are-several-private'),
        ('niangua',  'ford-slab'),
        ('niangua',  'fort-niangua-private'),
        ('niangua',  'gilbettson-ford'),
        ('niangua',  'ho-humm-private'),
        ('niangua',  'hwy-64-bridge'),
        ('niangua',  'mountain-creek-on-right'),
        ('niangua',  'oldhams-private'),
        ('niangua',  'private'),
        ('niangua',  'smith-ford')
      );

    -- ── Pre-checks. Refuse rather than degrade. ─────────────────────────
    SELECT count(*) INTO n_plans
    FROM public.float_plans p
    WHERE p.start_access_id IN (SELECT id FROM doomed)
       OR p.end_access_id   IN (SELECT id FROM doomed);
    IF n_plans > 0 THEN
        RAISE EXCEPTION 'refusing: % saved float plan(s) reference a row in the delete set', n_plans;
    END IF;

    SELECT count(*) INTO n_facilities
    FROM public.campsite_facilities f WHERE f.access_point_id IN (SELECT id FROM doomed);
    IF n_facilities > 0 THEN
        RAISE EXCEPTION 'refusing: % campsite facility link(s) would be silently nulled', n_facilities;
    END IF;

    SELECT count(*) INTO n_segments
    FROM public.float_segments s
    WHERE s.put_in_id IN (SELECT id FROM doomed) OR s.take_out_id IN (SELECT id FROM doomed);
    IF n_segments > 0 THEN
        RAISE EXCEPTION 'refusing: % float segment(s) would keep a name that no longer resolves', n_segments;
    END IF;

    SELECT count(*) INTO pending_before  FROM public.access_points WHERE approved = false;
    SELECT count(*) INTO approved_before FROM public.access_points WHERE approved = true;

    DELETE FROM public.access_points WHERE id IN (SELECT id FROM doomed);
    GET DIAGNOSTICS n_deleted = ROW_COUNT;

    -- ── Post-checks ─────────────────────────────────────────────────────
    SELECT count(*) INTO n_remaining
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
    WHERE (r.slug, ap.slug) IN (
        ('meramec', 'st'), ('meramec', 'hwy'), ('huzzah', 'private'), ('niangua', 'smith-ford')
    );
    IF n_remaining > 0 THEN
        RAISE EXCEPTION 'expected the named rows to be gone, % remain', n_remaining;
    END IF;

    SELECT count(*) INTO pending_after  FROM public.access_points WHERE approved = false;
    SELECT count(*) INTO approved_after FROM public.access_points WHERE approved = true;

    -- The assertion that proves nothing public was removed.
    IF approved_after <> approved_before THEN
        RAISE EXCEPTION 'approved count moved from % to %; this migration must touch only pending rows',
                        approved_before, approved_after;
    END IF;

    IF pending_before - pending_after <> n_deleted THEN
        RAISE EXCEPTION 'pending fell by % but % rows were deleted',
                        pending_before - pending_after, n_deleted;
    END IF;

    RAISE NOTICE 'deleted % mislocated pending access point(s).', n_deleted;
    RAISE NOTICE 'pending queue % -> %; approved unchanged at %.',
                 pending_before, pending_after, approved_after;
END
$purge$;
