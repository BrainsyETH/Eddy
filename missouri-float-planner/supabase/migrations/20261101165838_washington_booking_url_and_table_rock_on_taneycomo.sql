-- Pending. Two directory corrections from the 2026-11-01 trust-console review.
-- Each is guarded on the state it was reviewed against, so a row that has
-- moved since is refused rather than overwritten.
--
-- ── 1. Washington State Park has no booking link ────────────────────────
--
-- trust finding camping_missing_reservation_url, campground
-- 56ee4173-0cc8-46b3-9fa5-92db4e52fc8e. The camping sync measures this park
-- (campsite_facilities source mo_state_parks, source_facility_id 96, with live
-- campsite_availability rows), but its directory row
-- washington-state-park-campground has reservation_url NULL, so the Camping
-- tab shows availability with nowhere to book it.
--
-- The URL is the UseDirect place page for the same place id the sync reads.
-- It follows the form St. Francois State Park already carries
-- (https://icampmo1.usedirect.com/MSPWeb/#!park/83 for place 83), and its host
-- is on bookingUrlFor()'s mo_state_parks allowlist (src/lib/camping/booking.ts),
-- so the overview will accept it.
--
-- ── 2. Table Rock State Park campgrounds serve the Taneycomo ────────────
--
-- trust finding service_no_river_link, service
-- b0ca7a25-6d7a-49ec-b13e-2adbe4fa27fc. The row has a pin and no river, so it
-- appears in no river's directory. Its pin (36.58067, -93.30390, Hwy 165 by
-- Table Rock Dam) is 1.0 mi from Eddy's Taneycomo line, which begins at that
-- dam; the hatchery bank access and the dam-area launches are the park's
-- nearest water on any Eddy river. The park's own shoreline is Table Rock
-- Lake, which Eddy does not model, so this is the only river link it can
-- honestly carry. The other two unlinked parks in the same review (Roaring
-- River, Devil's Den) are 12-19 mi from any Eddy river and are deliberately
-- NOT linked here; whether they stay in the directory is an open decision.
--
-- Expected on apply: both findings resolve on the next camping_inventory and
-- service_geo_consistency runs.

DO $$
DECLARE
  washington public.nearby_services%ROWTYPE;
  table_rock public.nearby_services%ROWTYPE;
  taneycomo_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.nearby_services) THEN
    RAISE NOTICE 'Empty nearby_services: no directory data to correct';
    RETURN;
  END IF;

  SELECT * INTO STRICT washington FROM public.nearby_services
    WHERE slug = 'washington-state-park-campground' FOR UPDATE;
  SELECT * INTO STRICT table_rock FROM public.nearby_services
    WHERE slug = 'table-rock-state-park-campgrounds' FOR UPDATE;
  SELECT id INTO STRICT taneycomo_id FROM public.rivers
    WHERE slug = 'taneycomo' AND active = true;

  IF washington.reservation_url IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.campsite_facilities cf
       WHERE cf.nearby_service_id = washington.id
         AND cf.source = 'mo_state_parks' AND cf.source_facility_id = '96'
     )
     OR table_rock.latitude IS DISTINCT FROM 36.580670::numeric
     OR table_rock.longitude IS DISTINCT FROM -93.303900::numeric
     OR EXISTS (SELECT 1 FROM public.service_rivers sr WHERE sr.service_id = table_rock.id) THEN
    RAISE EXCEPTION 'Reviewed directory state changed; recheck before applying';
  END IF;

  UPDATE public.nearby_services
     SET reservation_url = 'https://icampmo1.usedirect.com/MSPWeb/#!park/96',
         updated_at = now()
   WHERE id = washington.id;

  INSERT INTO public.service_rivers
    (service_id, river_id, is_primary, section_description, verified_source, checked_at)
  VALUES
    (table_rock.id, taneycomo_id, true, 'Table Rock Dam / upper Taneycomo',
     'https://mostateparks.com/park/table-rock-state-park', DATE '2026-11-01');
END
$$;
