-- Reviewed against land-manager sources on 2026-10-11. Preserve pins, miles,
-- approval, primary type, and existing roles. Only Rockford claims a ramp.
-- Brooksher is a river-only camp and cannot support a vehicle shuttle.
DO $$
DECLARE
  correction record;
  access_row public.access_points%ROWTYPE;
  finding_row record;
BEGIN
  FOR correction IN SELECT * FROM (VALUES
    ('big-river', 'rockford-beach-park', 'Rockford Beach Park',
      ARRAY['park'], ARRAY['park','boat_ramp','access'],
      'https://www.jeffcomo.gov/610/Rockford-Park'),
    ('mulberry', 'wolf-pen-recreation-area', 'Wolf Pen Recreation Area',
      ARRAY['campground'], ARRAY['campground','access'],
      'https://www.fws.gov/rivers/river/mulberry'),
    ('mulberry', 'redding-recreation-area', 'Redding Recreation Area',
      ARRAY['campground'], ARRAY['campground','access'],
      'https://www.fws.gov/rivers/river/mulberry'),
    ('north-fork-white', 'north-fork-recreation-area-hammond', 'North Fork Recreation Area (Hammond)',
      ARRAY['campground'], ARRAY['campground','access'],
      'https://www.fs.usda.gov/r09/marktwain/recreation/raccoon-hollow-trailhead'),
    ('war-eagle-creek', 'withrow-springs-state-park-boating-access-hwy-23-bridge', 'Withrow Springs State Park Boating Access (Hwy 23 Bridge)',
      ARRAY['park'], ARRAY['park','access'],
      'https://www.arkansas.com/state-parks/explore/parks/withrow-springs-state-park'),
    ('crooked-creek', 'brooksher-float-campsite', 'Brooksher Float Campsite',
      ARRAY['campground'], ARRAY['campground'],
      'https://www.agfc.com/things-to-do/water-trails/crooked-creek/')
  ) AS c(river_slug, access_slug, access_name, old_roles, new_roles, source_url)
  LOOP
    SELECT ap.* INTO STRICT access_row FROM public.access_points ap
      JOIN public.rivers r ON r.id = ap.river_id
      WHERE r.slug = correction.river_slug AND ap.slug = correction.access_slug
      FOR UPDATE OF ap;
    IF access_row.name IS DISTINCT FROM correction.access_name
       OR access_row.types IS DISTINCT FROM correction.old_roles
       OR access_row.is_float_endpoint IS DISTINCT FROM true
       OR access_row.approved IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Reviewed access state changed: %', correction.access_slug;
    END IF;
    IF correction.access_slug = 'brooksher-float-campsite' AND
       (access_row.road_access IS NOT NULL OR access_row.parking_info IS NOT NULL) THEN
      RAISE EXCEPTION 'Brooksher reachability notes changed; review before replacing';
    END IF;

    UPDATE public.access_points SET types = correction.new_roles,
      is_float_endpoint = correction.access_slug <> 'brooksher-float-campsite',
      road_access = CASE WHEN correction.access_slug = 'brooksher-float-campsite'
        THEN 'NO ROAD ACCESS. Float-in campsite on Crooked Creek.' ELSE road_access END,
      parking_info = CASE WHEN correction.access_slug = 'brooksher-float-campsite'
        THEN 'No vehicle access. River only.' ELSE parking_info END,
      official_site_url = CASE WHEN correction.access_slug = 'brooksher-float-campsite'
        THEN correction.source_url ELSE official_site_url END,
      updated_at = now()
      WHERE id = access_row.id;

    INSERT INTO public.admin_activity_log(action, entity_type, entity_id, entity_name, details)
      VALUES ('access_point_update', 'access_point', access_row.id, access_row.name,
        jsonb_build_object('reason', 'Source-verified trust review: launch roles and vehicle reachability',
          'source', correction.source_url, 'before', jsonb_build_object(
            'types', access_row.types, 'is_float_endpoint', access_row.is_float_endpoint,
            'road_access', access_row.road_access, 'parking_info', access_row.parking_info),
          'after', jsonb_build_object('types', correction.new_roles,
            'is_float_endpoint', correction.access_slug <> 'brooksher-float-campsite')));

    FOR finding_row IN SELECT id, title FROM public.trust_findings
      WHERE check_id = 'float_endpoint_eligibility'
        AND entity_type = 'access_point' AND entity_key = access_row.id::text
        AND rule_key = 'non_launch_offered_as_endpoint' AND status = 'open'
    LOOP
      UPDATE public.trust_findings SET status = 'resolved', resolved_at = now(),
        resolution = 'fixed', snoozed_until = NULL WHERE id = finding_row.id;
      INSERT INTO public.admin_activity_log(action, entity_type, entity_id, entity_name, details)
        VALUES ('trust_finding_resolve', 'trust_finding', finding_row.id, finding_row.title,
          jsonb_build_object('checkId', 'float_endpoint_eligibility', 'from', 'open', 'to', 'resolved',
            'resolution', 'fixed', 'reason', 'Source-verified access correction applied in reviewed_trust_access_corrections',
            'source', correction.source_url));
    END LOOP;
  END LOOP;
END $$;
