-- Migration: 20260803140000_campsite_availability_loops.sql
-- Description: Per-campground availability inside district permits, plus the
-- two state-park campgrounds that had no row to render on.
--
-- Follow-up to 20260803120000, which disabled three Ozark National Scenic
-- Riverways backcountry district permits on the grounds that seventeen named
-- campgrounds shared their ids and attributing a district's whole inventory to
-- Powder Mill would print a confident, wrong number.
--
-- That was the right call about the numbers and the wrong call about the data.
-- Every campsite in a district payload carries a `loop` naming its own
-- campground, spelled exactly as Eddy spells it:
--
--   10344948 -> Cedar Grove 6, Dee Murray 5, Sinking Creek 8, Jerktail 4,
--               Broadfoot 4
--   10344920 -> Big Tree 7, Grubb Hollow 5, Cedar Spring 2, Clubhouse 6,
--               Gooseneck 8
--   10344874 -> Powder Mill 8, Log Yard 14, Bay Creek 11, Blue Spring 7,
--               Shawnee Creek 6, Rymers 3, Bachers 1, Baptizing Hole 2
--
-- So a district row can be split into one row per loop, each reporting its own
-- sites. The three requests are unchanged — one district fetch serves every
-- loop inside it — and coverage roughly doubles.

-- ─────────────────────────────────────────────────────────────
-- 1. A facility may now be one loop inside a shared payload
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.campsite_facilities
  ADD COLUMN IF NOT EXISTS source_loop TEXT;

COMMENT ON COLUMN public.campsite_facilities.source_loop IS
  'When set, this facility is one loop inside a shared upstream payload: the adapter filters that payload to campsites whose loop matches. Used for Ozark backcountry district permits, where one recreation.gov id covers up to eight separately named campgrounds.';

-- Several rows now legitimately share a source_facility_id, distinguished only
-- by their loop. NULLS NOT DISTINCT keeps the old guarantee intact for the
-- whole-facility rows, where source_loop is NULL and must stay unique.
DROP INDEX IF EXISTS idx_campsite_facilities_source_id;

CREATE UNIQUE INDEX idx_campsite_facilities_source_id
  ON public.campsite_facilities (source, source_facility_id, source_loop)
  NULLS NOT DISTINCT;

-- ─────────────────────────────────────────────────────────────
-- 2. One row per loop, replacing the three disabled district rows
-- ─────────────────────────────────────────────────────────────
--
-- Every loop below was read from a live payload. Baptizing Hole is included
-- even though Eddy has no campground row for it yet: the link is left NULL and
-- the row disables itself at the bottom of this migration, so it costs nothing
-- and is ready the moment somebody adds it.

INSERT INTO public.campsite_facilities
  (source, source_facility_id, source_loop, display_name, kind, enabled)
VALUES
  -- Jacks Fork / Middle Current
  ('recreation_gov', '10344874', 'Powder Mill Campground',    'Powder Mill Campground',    'campground', TRUE),
  ('recreation_gov', '10344874', 'Log Yard Campground',       'Log Yard Campground',       'campground', TRUE),
  ('recreation_gov', '10344874', 'Bay Creek Campground',      'Bay Creek Campground',      'campground', TRUE),
  ('recreation_gov', '10344874', 'Blue Spring Campground',    'Blue Spring Campground',    'campground', TRUE),
  ('recreation_gov', '10344874', 'Shawnee Creek Campground',  'Shawnee Creek Campground',  'campground', TRUE),
  ('recreation_gov', '10344874', 'Rymers Campground',         'Rymers Campground',         'campground', TRUE),
  ('recreation_gov', '10344874', 'Bachers Campground',        'Bachers Campground',        'campground', TRUE),
  ('recreation_gov', '10344874', 'Baptizing Hole Campground', 'Baptizing Hole Campground', 'campground', TRUE),

  -- Lower Current District
  ('recreation_gov', '10344920', 'Big Tree Campground',       'Big Tree Campground',       'campground', TRUE),
  ('recreation_gov', '10344920', 'Grubb Hollow Campground',   'Grubb Hollow Campground',   'campground', TRUE),
  ('recreation_gov', '10344920', 'Cedar Spring Campground',   'Cedar Spring Campground',   'campground', TRUE),
  ('recreation_gov', '10344920', 'Clubhouse Campground',      'Clubhouse Campground',      'campground', TRUE),
  ('recreation_gov', '10344920', 'Gooseneck Campground',      'Gooseneck Campground',      'campground', TRUE),

  -- Upper Current District
  ('recreation_gov', '10344948', 'Cedar Grove Campground',    'Cedar Grove Campground',    'campground', TRUE),
  ('recreation_gov', '10344948', 'Dee Murray Campground',     'Dee Murray Campground',     'campground', TRUE),
  ('recreation_gov', '10344948', 'Sinking Creek Campground',  'Sinking Creek Campground',  'campground', TRUE),
  ('recreation_gov', '10344948', 'Jerktail Campground',       'Jerktail Campground',       'campground', TRUE),
  ('recreation_gov', '10344948', 'Broadfoot Campground',      'Broadfoot Campground',      'campground', TRUE)
ON CONFLICT (source, source_facility_id, source_loop) DO NOTHING;

-- The whole-district rows are superseded by their loops.
DELETE FROM public.campsite_facilities
  WHERE source = 'recreation_gov'
    AND source_loop IS NULL
    AND source_facility_id IN ('10344874', '10344920', '10344948');

-- Loop names are the provider's own spelling of the campground, and match
-- nps_campgrounds.name exactly for every loop Eddy already knows about.
UPDATE public.campsite_facilities f SET nps_campground_id = c.id
FROM public.nps_campgrounds c
WHERE f.source_loop IS NOT NULL
  AND f.nps_campground_id IS NULL
  AND c.name = f.source_loop;

-- ─────────────────────────────────────────────────────────────
-- 3. Campgrounds for the two parks Eddy lists only as lodging
-- ─────────────────────────────────────────────────────────────
--
-- Echo Bluff and Montauk are typed cabin_lodge because both have a lodge, and
-- that is where the previous migration stopped. But UseDirect returns only
-- their CAMPING inventory — Echo Bluff's sole facility is "Timbuktu
-- Campground" (72 units), Montauk's are Loops 1-4 — so the availability is
-- real campsite availability with nowhere to render. These rows are the
-- somewhere, and sit alongside the lodge listings rather than replacing them.
--
-- Seeded with only what is verifiably true: name, place, contact and agency,
-- all copied from the park's existing row. Site counts, fees and descriptions
-- are deliberately left NULL rather than guessed.

INSERT INTO public.nearby_services
  (name, slug, type, city, state, phone, website, reservation_url,
   latitude, longitude, managing_agency, booking_platform,
   services_offered, status, display_order)
SELECT
  v.name, v.slug, 'campground'::service_type, s.city, s.state, s.phone, s.website,
  'https://icampmo.com', s.latitude, s.longitude, s.managing_agency, s.booking_platform,
  ARRAY['camping_primitive', 'camping_rv']::service_offering[],
  'active'::service_status, s.display_order + 1
FROM (VALUES
  ('Echo Bluff State Park',  'Timbuktu Campground',            'timbuktu-campground'),
  ('Montauk State Park',     'Montauk State Park Campground',  'montauk-state-park-campground')
) AS v(parent, name, slug)
JOIN public.nearby_services s ON s.name = v.parent
WHERE NOT EXISTS (SELECT 1 FROM public.nearby_services x WHERE x.slug = v.slug);

-- Mirror the parent's river links, so each campground appears on exactly the
-- rivers its park already appears on — Echo Bluff on the Current and the Jacks
-- Fork, Montauk on the Current.
INSERT INTO public.service_rivers (service_id, river_id, is_primary)
SELECT child.id, sr.river_id, sr.is_primary
FROM public.nearby_services child
JOIN (VALUES
  ('timbuktu-campground',            'Echo Bluff State Park'),
  ('montauk-state-park-campground',  'Montauk State Park')
) AS v(slug, parent) ON v.slug = child.slug
JOIN public.nearby_services p ON p.name = v.parent
JOIN public.service_rivers sr ON sr.service_id = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_rivers x
  WHERE x.service_id = child.id AND x.river_id = sr.river_id
);

-- Point the two UseDirect places at their new campground rows and switch them on.
UPDATE public.campsite_facilities f
  SET nearby_service_id = s.id, enabled = TRUE
FROM public.nearby_services s
WHERE f.source = 'mo_state_parks'
  AND s.slug = CASE f.source_facility_id
    WHEN '111' THEN 'timbuktu-campground'
    WHEN '4'   THEN 'montauk-state-park-campground'
  END;

-- Unchanged rule from the first migration: a facility nothing points at is a
-- nightly request spent on nobody.
UPDATE public.campsite_facilities
  SET enabled = FALSE
  WHERE enabled
    AND nps_campground_id IS NULL
    AND nearby_service_id IS NULL;
