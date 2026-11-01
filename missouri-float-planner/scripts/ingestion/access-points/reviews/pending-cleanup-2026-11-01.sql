-- Pending access-point cleanup, 2026-11-01. Applied to production
-- (ilefwfpvphadsbptiaur) with the owner's authorization ("Delete the
-- duplicates", "the ramps look good to add", "copy data across" for Turner's
-- Mill). One transaction; every row is matched by id and slug, each step must
-- touch exactly the rows expected, and anything else aborts the whole block.
--
-- 1. Turner's Mill and Spring (North) takes the better text and facts of the
--    unapproved duplicate turner-mill-north (USFS link, surface, amenities,
--    description rewritten without the em dash) before that row is deleted.
--
-- 2. Eight unapproved duplicates are deleted. Each is the same place as an
--    approved record (pins 23 to 424 m apart, the same river mile), or, for
--    hwy-8-bridge, the same name and mile with a pin 1.5 km off. First every
--    reference moves to the surviving record:
--      - 11 shared float plans from January 2026. float_plans blocks deletes,
--        and no plan ends up starting and ending at the same access;
--      - 1 river photo (boze-mill-spring-on-left);
--      - the MDC evidence row linked to mdc-myrtle.
--    Retired slugs redirect via src/lib/access-points/merged-slugs.ts. The seed
--    no longer creates turner-mill-north.
--      van-buren-city-access, van-buren -> van-buren-riverfront-park (Current)
--      boze-mill-spring-on-left -> boze-mill-float-camp-spring (Eleven Point)
--      hwy-160-bridge -> riverton;  mdc-myrtle -> myrtle-access
--      turner-mill-north -> turner-s-mill-and-spring-north
--      hwy-19-bridge -> greer-spring (Greer Crossing, at the Hwy 19 bridge)
--      hwy-8-bridge -> highway-8-bridge (Courtois)
--    Kept as not clear duplicates: bass-river-low-water-bridge (a public
--    county low-water bridge beside a private resort) and
--    huzzah-ca-highway-e-access (no approved record covers it).
--
-- 3. Fourteen agency ramps approved as float endpoints. They were imported on
--    2026-10-29 with an empty description; each has a linked agency feature
--    at its exact pin. The owner spot-checked a sample on imagery. Miles:
--      - Current, Mulberry and James: the stored miles already fit the
--        river's scale.
--      - Black: curated = line + 9.81 at Sportsman's Park, the last approved
--        record. The five ramps sat at about line x 1.04, which made
--        Sportsman's Park to Dan River 1.6 mi instead of 7.9. They are set to
--        line + 9.81; upstream is cleared, as on the river's other rows.
--      - Lower Meramec: curated = line - 26.57 at Robertsville. The three
--        ramps stored raw line miles. They are set to line - 26.57; upstream
--        equals downstream, as on the river's other rows.
--    Held back: charity-access (Niangua). The Niangua's curated scale starts
--    near Big John (mile 1.3 at line 26.3), so Charity, 19 line-miles upstream,
--    cannot be placed without renumbering the river.

DO $$
DECLARE
  n int;
  r record;
BEGIN
  -- 1. Turner's Mill (North): copy the duplicate's facts across.
  UPDATE access_points SET
         ownership = 'USFS',
         road_surface = '{gravel_maintained}',
         amenities = '{parking,restrooms}',
         official_site_url = 'https://www.fs.usda.gov/r09/marktwain/recreation/turner-mill-north-river-access',
         description = 'On the left bank at the historic site of Turner''s Mill, where the Blue Ribbon Trout Area ends and the White Ribbon Trout Area begins. It''s 4.9 miles below Greer, a short float through Mary Decker Shoal, a chute-type rapid with large boulders. Day use only; camping is on the south side.',
         facilities = 'Day-use picnic area with vault toilet and boat launch. No camping, water or trash service.'
   WHERE id = 'f6e3a5cf-cd1b-4417-9123-40416f7df8aa' AND slug = 'turner-s-mill-and-spring-north' AND approved
     AND updated_at = '2026-11-01 15:02:00.533796+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'turner copy: matched %', n; END IF;

  -- 2. Duplicates: move references, then delete.
  FOR r IN SELECT * FROM (VALUES
    ('da66f4c6-2799-479f-bd1f-b648b59881cf'::uuid, 'van-buren-city-access', '330ae0ce-dd7d-4c37-8784-d887bd4503e4'::uuid, 'van-buren-riverfront-park'),
    ('660218df-726a-4340-a392-7b2613eba202'::uuid, 'van-buren', '330ae0ce-dd7d-4c37-8784-d887bd4503e4'::uuid, 'van-buren-riverfront-park'),
    ('41ec15cd-212a-407e-b74d-25d3066115a1'::uuid, 'boze-mill-spring-on-left', '96e35d58-3f33-4fc4-a04d-a4fa15df9bb2'::uuid, 'boze-mill-float-camp-spring'),
    ('94ac2517-4746-45ab-91e9-e47b9e0f642a'::uuid, 'hwy-160-bridge', 'aa807908-2eef-4f46-968b-8de8b8efb99d'::uuid, 'riverton'),
    ('4cbe2d50-4559-4087-bf4b-d465cc56e3d0'::uuid, 'mdc-myrtle', '650e54ca-9dcb-46cc-9c01-5b74fe4cf712'::uuid, 'myrtle-access'),
    ('7149e302-2119-4532-96a0-fd20995dc133'::uuid, 'turner-mill-north', 'f6e3a5cf-cd1b-4417-9123-40416f7df8aa'::uuid, 'turner-s-mill-and-spring-north'),
    ('11b8d00e-c9fa-404f-b87f-69b7b2a5dfa1'::uuid, 'hwy-19-bridge', 'e3dc7b91-6d06-4102-bd80-99ae16fd4ef1'::uuid, 'greer-spring'),
    ('7ba78ffc-8561-4481-b225-d0769e1a7e7f'::uuid, 'hwy-8-bridge', '1f8c6fc5-2b17-4333-a8d6-acb6505bf1b4'::uuid, 'highway-8-bridge')
  ) AS t(dup_id, dup_slug, canon_id, canon_slug)
  LOOP
    PERFORM 1 FROM access_points WHERE id = r.dup_id AND slug = r.dup_slug AND NOT approved;
    IF NOT FOUND THEN RAISE EXCEPTION '% is not the unapproved duplicate expected', r.dup_slug; END IF;
    PERFORM 1 FROM access_points c JOIN access_points d ON d.id = r.dup_id
     WHERE c.id = r.canon_id AND c.slug = r.canon_slug AND c.approved AND c.river_id = d.river_id;
    IF NOT FOUND THEN RAISE EXCEPTION '% is not an approved record on the same river', r.canon_slug; END IF;

    UPDATE float_plans SET start_access_id = r.canon_id WHERE start_access_id = r.dup_id;
    UPDATE float_plans SET end_access_id = r.canon_id WHERE end_access_id = r.dup_id;
    UPDATE river_photos SET access_point_id = r.canon_id WHERE access_point_id = r.dup_id;
    UPDATE community_reports SET access_point_id = r.canon_id WHERE access_point_id = r.dup_id;
    UPDATE embed_widgets SET access_point_id = r.canon_id WHERE access_point_id = r.dup_id;
    UPDATE agency_gis_features SET access_point_id = r.canon_id WHERE access_point_id = r.dup_id;

    DELETE FROM access_points WHERE id = r.dup_id AND slug = r.dup_slug AND NOT approved;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'delete %: matched %', r.dup_slug, n; END IF;
  END LOOP;

  SELECT count(*) INTO n FROM float_plans WHERE start_access_id = end_access_id;
  IF n <> 0 THEN RAISE EXCEPTION 'a float plan now starts and ends at the same access (%)', n; END IF;

  -- 3. Agency ramps: approve with agency facts and corrected miles.
  FOR r IN SELECT * FROM (VALUES
    ('52d55dfc-3fce-466a-be48-449f7d5bb781'::uuid, 'dan-river-access', 'MDC', 'MDC access with an accessible boat ramp on the Black River below Poplar Bluff.', 'Accessible boat ramp.', 95.24::numeric, NULL::numeric, true),
    ('deb25c7a-2d6f-4bae-9a1c-edb78cc4a334'::uuid, 'coon-island-conservation-area', 'MDC', 'MDC conservation area with an accessible boat ramp on the lower Black River in Missouri.', 'Accessible boat ramp.', 115.20, NULL, true),
    ('83e08170-174c-481b-b0d1-b03118210f24'::uuid, 'kody-riggan-datto-boat-ramp', 'AGFC', 'Arkansas Game and Fish boat ramp at Datto, in the Dave Donaldson Black River WMA.', 'Concrete boat ramp.', 163.86, NULL, true),
    ('649cd6da-636b-4532-a1b3-35e5ae1f3435'::uuid, 'brookings-boat-ramp', 'AGFC', 'Arkansas Game and Fish boat ramp at Brookings, in the Dave Donaldson Black River WMA.', 'Concrete boat ramp.', 170.31, NULL, true),
    ('0f0f3d42-e2a0-41a9-bd1e-ebd3caa94cca'::uuid, 'schaeffer-s-eddy-boat-ramp', 'AGFC', 'Arkansas Game and Fish boat ramp at Schaeffer''s Eddy on the lower Black River.', 'Concrete boat ramp.', 181.11, NULL, true),
    ('63ce561b-f869-4522-aa0d-85c340739b58'::uuid, 'rocky-creek-conservation-area', 'MDC', 'MDC conservation area with a boat ramp on the Current, just below Powder Mill.', 'Boat ramp.', NULL, NULL, true),
    ('691cc397-8db4-472a-ab66-e22c87855140'::uuid, 't-l-wright-memorial-access-doniphan', 'MDC', 'MDC access with a boat ramp in Doniphan.', 'Boat ramp.', NULL, NULL, true),
    ('099e3eb4-f039-485e-986f-896875e423d7'::uuid, 'johnston-s-eddy-boat-ramp', 'AGFC', 'Arkansas Game and Fish boat ramp at Johnston''s Eddy, near Reyno.', 'Concrete boat ramp.', NULL, NULL, true),
    ('0f84297d-669d-456e-ac07-d8467e02ff07'::uuid, 'joe-crighton-access', 'MDC', 'MDC access with a boat ramp on the James.', 'Boat ramp.', NULL, NULL, true),
    ('60927955-5368-40d1-881c-29f5885e9134'::uuid, 'pacific-palisades-conservation-area', 'MDC', 'MDC conservation area with an accessible boat ramp on the lower Meramec near Pacific.', 'Accessible boat ramp.', 148.38, 148.38, true),
    ('f3890eb9-28f2-40b0-8b32-95495812cbbd'::uuid, 'allenton-access', 'MDC', 'MDC access with a boat ramp on the lower Meramec near Allenton.', 'Boat ramp.', 155.55, 155.55, true),
    ('d818a9b5-6d26-4b1a-af39-beca74d127fe'::uuid, 'meramec-landing-valley-park', 'Municipal', 'City of Valley Park access with an accessible boat ramp on the lower Meramec.', 'Accessible boat ramp.', 175.30, 175.30, true),
    ('eb9b0cc2-37d2-4c70-b18c-87d4de0f0858'::uuid, 'indian-creek-access', 'USFS', 'Forest Service walk-in canoe and kayak access on the Mulberry, between High Bank and Byrd''s.', 'Walk-in canoe and kayak access. No ramp.', NULL, NULL, false),
    ('4d360d5f-e75a-4f36-8e05-2e28a045b10b'::uuid, 'big-eddy-canoe-access', 'USFS', 'Forest Service canoe and kayak access on the Mulberry, between Turner Bend and Campbell Cemetery.', 'Canoe and kayak access. No ramp.', NULL, NULL, false)
  ) AS t(id, slug, agency, descr, facil, mile, up_mile, ramp)
  LOOP
    UPDATE access_points SET
           managing_agency = r.agency,
           description = r.descr,
           facilities = r.facil,
           amenities = CASE WHEN r.ramp THEN '{boat_ramp}'::text[] ELSE amenities END,
           river_mile_downstream = COALESCE(r.mile, river_mile_downstream),
           river_mile_upstream = CASE WHEN r.mile IS NULL THEN river_mile_upstream ELSE r.up_mile END,
           is_float_endpoint = true,
           approved = true, approved_at = now()
     WHERE id = r.id AND slug = r.slug AND NOT approved AND coalesce(description, '') = '';
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'approve %: matched %', r.slug, n; END IF;
  END LOOP;
END $$;

-- Rollback notes: the deleted rows are in migration 00056, the seed, or the
-- 2026-01/02 guide imports, and can be re-imported. The float plans that
-- moved (id: old start or end -> new):
--   f11c3bf1, bb1d6e11, 19947244, 44486e71, 6c714665: start van-buren-city-access -> van-buren-riverfront-park
--   2d68317a: end hwy-19-bridge -> greer-spring
--   a2e0480e, 3dfbb7f1: start hwy-19-bridge -> greer-spring
--   087977d9: end hwy-160-bridge -> riverton
--   31ead67e: start hwy-160-bridge -> riverton
--   e6aed665: end boze-mill-spring-on-left -> boze-mill-float-camp-spring
-- To unpublish the ramps:
-- UPDATE access_points SET approved = false, approved_at = NULL, is_float_endpoint = false
--   WHERE slug IN (... the fourteen slugs above ...).

-- 4. Same day, after the owner checked them: three Meramec records are not
--    available accesses and were deleted (no plans, photos, reports or agency
--    rows referenced them). Steelville City Park's block is gone from the seed;
--    Scotia Bridge's stays but seeds unapproved, because ACCESS_SLUG_RENAMES
--    pins its slug (listed in ACCESS_SLUG_ABSENT_EXCEPTIONS).
DO $$
DECLARE n int;
BEGIN
  DELETE FROM access_points ap USING rivers r
   WHERE r.id = ap.river_id AND r.slug = 'meramec' AND NOT ap.approved
     AND (ap.id, ap.slug) IN (('b86e1f3c-1579-4311-86f2-404d428069d5'::uuid, 'fishing-spring-road'),
                              ('e75bf9c7-2d04-4e28-9a78-f2c53c8b6a7d'::uuid, 'scotia-bridge-access'),
                              ('b1902308-90d7-4631-8f24-1ab3e8161fc3'::uuid, 'steelville-city-park'))
     AND ap.updated_at = '2026-07-11 15:18:56.700028+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 3 THEN RAISE EXCEPTION 'expected 3 deletes, matched %', n; END IF;
END $$;
