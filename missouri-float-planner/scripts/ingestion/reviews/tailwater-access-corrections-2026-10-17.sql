-- Owner-reviewed access corrections from #1541, 2026-10-17.
-- Target: ilefwfpvphadsbptiaur. DML only; no activation or threshold changes.
-- Preview ends in ROLLBACK. Only an authorized production apply may replace
-- the final ROLLBACK with COMMIT. See TAILWATER_ACCESS_REVIEW_2026-10-17.md.
-- APPLIED 2026-10-17 17:23:22 UTC with explicit owner approval (COMMIT).
-- Separate read-back and migration/slug/client-access checks passed. Rivers
-- remain inactive. Keep ROLLBACK below as the default for future previews.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path TO public, extensions, pg_temp;
DO $review$
DECLARE
  v_changes jsonb := $changes$
[
  {
    "river": "norfork-tailwater",
    "river_id": "7c0071f1-dd3d-4579-97c5-9537b9d39733",
    "id": "80db3a77-db31-4b8a-9010-248534a1f4cc",
    "slug": "dam-quarry-campground",
    "before": {
      "description": null,
      "type": "campground",
      "types": [
        "campground"
      ],
      "is_float_endpoint": false,
      "approved": true
    },
    "after": {
      "description": "Shares the Dam-Quarry recreation area with the separately mapped boat ramp. Use the boat ramp record when planning a float."
    }
  },
  {
    "river": "taneycomo",
    "river_id": "d6aa9ba7-0788-441d-9081-88e1866f1771",
    "id": "b965b0a3-868c-4408-ac68-432772db14de",
    "slug": "empire-park-ramp-forsyth",
    "before": {
      "description": null,
      "facilities": "One-lane concrete ramp just upstream of Powersite Dam — the last take-out on Taneycomo; parking ~40 rigs, covered fishing dock, restrooms, picnic area, playground",
      "ownership": "city",
      "official_site_url": "https://forsythmo.gov/parks-and-recreation-1",
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -93.1331,
          36.6573
        ]
      },
      "type": "boat_ramp",
      "types": [
        "boat_ramp"
      ],
      "is_float_endpoint": true,
      "approved": true
    },
    "after": {
      "description": "The ramp is on the south edge of the Empire Park parking lot, east of the fishing dock. This is the Taneycomo side of Powersite (Ozark Beach) Dam.",
      "facilities": "Concrete boat ramp beside the fishing dock at Empire Park on Lake Taneycomo, upstream of Powersite Dam; paved parking and picnic area",
      "ownership": "City",
      "official_site_url": "https://forsythmo.gov/department/parks-recreation/",
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -93.13281,
          36.65712
        ]
      }
    }
  },
  {
    "river": "taneycomo",
    "river_id": "d6aa9ba7-0788-441d-9081-88e1866f1771",
    "id": "8d46b4d6-a718-4555-99ea-ff2db9f013a8",
    "slug": "shepherd-of-the-hills-hatchery-bank-access",
    "before": {
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -93.30453,
          36.59724
        ]
      },
      "type": "access",
      "types": [
        "access"
      ],
      "is_float_endpoint": false,
      "approved": true
    },
    "after": {
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -93.304095,
          36.595827
        ]
      }
    }
  },
  {
    "river": "white",
    "river_id": "bdb3e12a-5a9a-4163-9e41-e5f41ebc8fa6",
    "id": "122d937b-3e16-4c71-8a31-5dbc66fd7574",
    "slug": "guion-access",
    "before": {
      "name": "Guion Access",
      "description": null,
      "type": "boat_ramp",
      "types": [
        "boat_ramp"
      ],
      "is_float_endpoint": true,
      "approved": true
    },
    "after": {
      "name": "Guion Access (Stone County)",
      "description": "Stone County ramp on the southwest bank. Guion Access (Izard County) is a separate facility across the White River."
    }
  },
  {
    "river": "white",
    "river_id": "bdb3e12a-5a9a-4163-9e41-e5f41ebc8fa6",
    "id": "8172624e-45b8-4546-98ff-301c89b9b320",
    "slug": "roundhouse-shoals-walk-in-access",
    "before": {
      "description": null,
      "facilities": "AGFC walk-in at Roundhouse Shoals below Cotter; gravel parking, wade fishing, no ramp",
      "ownership": "AGFC",
      "official_site_url": "https://www.agfc.com/fishing/where-to-fish/trout-waters/bull-shoals-tailwater/",
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -92.53446,
          36.2647
        ]
      },
      "type": "access",
      "types": [
        "access"
      ],
      "is_float_endpoint": false,
      "approved": true
    },
    "after": {
      "description": "The pin identifies the Roundhouse Shoals access and parking area. Armstrong Hole is a separate walk-in fishing access.",
      "facilities": "Walk-in fishing access with gravel parking at the signed Roundhouse Shoals site; no boat ramp",
      "ownership": null,
      "official_site_url": "https://www.cotterar.gov/parks",
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -92.5284983,
          36.2679403
        ]
      }
    }
  },
  {
    "river": "white",
    "river_id": "bdb3e12a-5a9a-4163-9e41-e5f41ebc8fa6",
    "id": "408d7163-72df-48ce-b81b-c2e6ba644255",
    "slug": "sylamore-ferry-access",
    "before": {
      "description": null,
      "facilities": "Concrete ramp plus dirt launch, fishing pier and parking on both banks at the old Sylamore Ferry crossing",
      "type": "boat_ramp",
      "types": [
        "boat_ramp"
      ],
      "is_float_endpoint": true,
      "approved": true
    },
    "after": {
      "description": "This pin identifies Sylamore Ferry Boat Ramp #2. Facilities on the opposite bank belong to a separate access.",
      "facilities": "Concrete boat ramp on the Highway 5 bank, upstream of the Highway 9 bridge near the mouth of Sylamore Creek"
    }
  },
  {
    "river": "white",
    "river_id": "bdb3e12a-5a9a-4163-9e41-e5f41ebc8fa6",
    "slug": "armstrong-hole-walk-in-access",
    "after": {
      "name": "Armstrong Hole Walk-In Access",
      "is_public": true,
      "ownership": null,
      "managing_agency": null,
      "official_site_url": "https://www.cotterar.gov/parks",
      "facilities": "Walk-in fishing access at Armstrong Hole; no boat access",
      "description": "Armstrong Hole is a separate site from Roundhouse Shoals. This pin identifies the access area on the City of Cotter parks map.",
      "is_float_endpoint": false,
      "type": "access",
      "types": [
        "access"
      ],
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -92.53777,
          36.2633804
        ]
      }
    }
  },
  {
    "river": "white",
    "river_id": "bdb3e12a-5a9a-4163-9e41-e5f41ebc8fa6",
    "slug": "guion-access-izard-county",
    "after": {
      "name": "Guion Access (Izard County)",
      "is_public": true,
      "ownership": "AGFC",
      "managing_agency": null,
      "official_site_url": "https://www.agfc.com/fishing/where-to-fish/trout-waters/bull-shoals-tailwater/",
      "facilities": "Two concrete boat ramps, parking and a fishing jetty on the Izard County bank near the Highway 58 bridge",
      "description": "The pin identifies Guion Boat Ramp-Izard County #1. Ramp #2 is part of this same facility; the Stone County access is a separate site across the river.",
      "is_float_endpoint": true,
      "type": "boat_ramp",
      "types": [
        "boat_ramp"
      ],
      "location_orig": {
        "type": "Point",
        "coordinates": [
          -91.94807434,
          35.92548566
        ]
      }
    }
  }
]
$changes$::jsonb;
  v_change jsonb;
  v_current jsonb;
  v_key text;
  v_id uuid;
  v_river uuid;
  v_action text;
  v_after jsonb;
BEGIN
  PERFORM id FROM rivers
    WHERE slug IN ('white','taneycomo','norfork-tailwater') ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM rivers
      WHERE slug IN ('white','taneycomo','norfork-tailwater')
        AND active=false AND river_type='dam_tailwater') <> 3 THEN
    RAISE EXCEPTION 'Expected three inactive tailwaters; review changed release state';
  END IF;
  PERFORM a.id FROM access_points a JOIN rivers r ON r.id=a.river_id
    WHERE r.slug IN ('white','taneycomo','norfork-tailwater')
    ORDER BY a.id FOR UPDATE OF a;
  -- The existing import RPC fills null miles across its river. Refuse an
  -- unexpected null so this patch cannot repair unrelated rows as a side effect.
  IF EXISTS (SELECT 1 FROM access_points a JOIN rivers r ON r.id=a.river_id
             WHERE r.slug IN ('white','taneycomo','norfork-tailwater')
               AND a.river_mile_downstream IS NULL) THEN
    RAISE EXCEPTION 'Unexpected missing mileage; review before applying this targeted patch';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(v_changes) LOOP
    v_river := (v_change->>'river_id')::uuid;
    v_after := v_change->'after';
    IF NOT EXISTS (SELECT 1 FROM rivers WHERE id=v_river AND slug=v_change->>'river') THEN
      RAISE EXCEPTION 'Unexpected river identity: %', v_change->>'river';
    END IF;
    v_current := NULL;
    v_id := NULL;
    IF v_change ? 'id' THEN
      SELECT a.id, to_jsonb(a) || jsonb_build_object('location_orig', ST_AsGeoJSON(a.location_orig)::jsonb)
        INTO v_id, v_current FROM access_points a
        WHERE a.id=(v_change->>'id')::uuid AND a.river_id=v_river AND a.slug=v_change->>'slug';
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Existing access identity changed: %', v_change->>'slug';
      END IF;
      FOR v_key IN SELECT jsonb_object_keys(v_change->'before') LOOP
        IF v_current->v_key IS DISTINCT FROM v_change->'before'->v_key
           AND v_current->v_key IS DISTINCT FROM COALESCE(v_after->v_key, v_change->'before'->v_key) THEN
          RAISE EXCEPTION 'Concurrent change to % / %; review before overwriting', v_change->>'slug', v_key;
        END IF;
      END LOOP;
      v_action := 'update';
    ELSE
      SELECT a.id, to_jsonb(a) || jsonb_build_object('location_orig', ST_AsGeoJSON(a.location_orig)::jsonb)
        INTO v_id, v_current FROM access_points a WHERE a.slug=v_change->>'slug';
      IF v_id IS NOT NULL THEN
        IF (v_current->>'river_id')::uuid <> v_river THEN
          RAISE EXCEPTION 'New access slug already belongs to another river: %', v_change->>'slug';
        END IF;
        FOR v_key IN SELECT jsonb_object_keys(v_after) LOOP
          IF v_current->v_key IS DISTINCT FROM v_after->v_key THEN
            RAISE EXCEPTION 'New access differs from the reviewed record: % / %', v_change->>'slug', v_key;
          END IF;
        END LOOP;
        IF v_current->>'approved' IS DISTINCT FROM 'true' THEN
          RAISE EXCEPTION 'Existing new access has a different approval state: %', v_change->>'slug';
        END IF;
        CONTINUE; -- already applied, including the owner-reviewed approval
      END IF;
      v_action := 'insert';
    END IF;

    PERFORM apply_access_point_dossier(v_river, jsonb_build_array(jsonb_build_object(
      'action',v_action, 'id',v_id, 'slug',v_change->>'slug', 'payload',v_after)));
    SELECT id INTO STRICT v_id FROM access_points WHERE river_id=v_river AND slug=v_change->>'slug';

    -- Only moved pins get new geometry-derived mileage. Preserve every other
    -- curated mile, including Norfork's previously reviewed continuation.
    IF v_after ? 'location_orig' THEN
      UPDATE access_points a
        SET river_mile_downstream=s.river_mile,
            river_mile_upstream=GREATEST(r.length_miles-s.river_mile,0)
        FROM rivers r,
             LATERAL snap_to_river(ST_SetSRID(ST_GeomFromGeoJSON(v_after->>'location_orig'),4326),r.id) s
        WHERE a.id=v_id AND r.id=v_river;
    END IF;
    IF EXISTS (SELECT 1 FROM access_points WHERE id=v_id
        AND (river_mile_downstream IS NULL OR snap_distance_m IS NULL
             OR (is_float_endpoint AND snap_distance_m > 250))) THEN
      RAISE EXCEPTION 'Post-write pin validation failed: %', v_change->>'slug';
    END IF;
    IF v_action='insert' THEN
      -- Explicit owner review in #1541, not blanket approval of a dossier.
      UPDATE access_points SET approved=true, approved_at=now(), updated_at=now() WHERE id=v_id;
    END IF;
  END LOOP;
END $review$;

SELECT r.slug AS river, a.id, a.slug, a.name,
       ST_Y(a.location_orig) AS lat, ST_X(a.location_orig) AS lon,
       a.river_mile_downstream, a.snap_distance_m, a.is_float_endpoint, a.approved,
       r.active AS river_active
FROM access_points a JOIN rivers r ON r.id=a.river_id
WHERE a.slug IN ('dam-quarry-campground','roundhouse-shoals-walk-in-access',
  'armstrong-hole-walk-in-access','sylamore-ferry-access','guion-access',
  'guion-access-izard-county','shepherd-of-the-hills-hatchery-bank-access',
  'empire-park-ramp-forsyth')
ORDER BY r.slug, a.river_mile_downstream;
ROLLBACK;
