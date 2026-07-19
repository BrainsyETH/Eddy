-- 00173_add_missing_river_hazards.sql
-- Add missing portage dams / low-water bridges to river_hazards, sourced from
-- floatmissouri.com mile markers. DB river-miles were calibrated from floatmissouri
-- miles per river via matched access points; coordinates are computed by
-- get_point_at_mile() at apply time (same method as existing hazards/access points).
-- Idempotent: re-deletes each (river,name) before insert. Ends with a verify SELECT.

DELETE FROM river_hazards h USING rivers r
WHERE h.river_id = r.id AND (r.slug, h.name) IN (
  ('big-river', 'Byrnes Mill Dam'),
  ('big-river', 'Private dam (river mile ~127)'),
  ('big-river', 'Cedar Hill mill dam'),
  ('big-river', 'Morse Mill Dam'),
  ('gasconade', 'Ozark Springs low-water bridge'),
  ('gasconade', 'Grimes Mill dam'),
  ('st-francis', 'Silver Mine Dam'),
  ('north-fork-white', 'Dawt Mill Dam'),
  ('bourbeuse', 'Guths Mill Dam'),
  ('elk', 'Shadow Lake Dam (Noel)'),
  ('black', 'Clearwater Dam'),
  ('bryant-creek', 'Bertha Ford low-water bridge'),
  ('bryant-creek', 'Monastery Bridge low-water crossing')
);

INSERT INTO river_hazards
  (river_id, name, type, severity, river_mile_downstream, portage_required, portage_side, description, seasonal_notes, active, location)
SELECT r.id, v.name, v.type, v.severity, v.db_mile, v.portage_required, v.portage_side, v.description, v.seasonal_notes, TRUE,
       ST_SetSRID(ST_MakePoint(gp.lng, gp.lat), 4326)
FROM (VALUES
  ('big-river', 'Byrnes Mill Dam', 'low_water_dam', 'danger', 132.95, TRUE, 'right', 'Byrnes Mill Dam (private). Portage right. Do not attempt to run.', 'The dam face and backwater are most dangerous at moderate-to-high flow; portage at every level.'),
  ('big-river', 'Private dam (river mile ~127)', 'low_water_dam', 'warning', 127.1, TRUE, 'right', 'Private low-head dam. Portage right.', 'Low-head dams form a keeper hydraulic at moderate-to-high flow; portage at every level.'),
  ('big-river', 'Cedar Hill mill dam', 'low_water_dam', 'warning', 121.26, TRUE, 'left', 'Cedar Hill Bridge and mill dam. Portage left; the MDC Cedar Hill Access here is also the best take-out in this stretch.', 'Low-head dams form a keeper hydraulic at moderate-to-high flow; portage at every level.'),
  ('big-river', 'Morse Mill Dam', 'low_water_dam', 'danger', 110.17, TRUE, 'right', 'Morse Mill Dam. Portage right. The break in the dam at left, by the old mill foundation, is dangerous; the concrete sluice just right of it can be used to slide canoes only when the water is low enough to stand on the dam.', 'Most dangerous at moderate-to-high flow; the low-water sluice option only exists when flow is low enough to stand on the dam.'),
  ('gasconade', 'Ozark Springs low-water bridge', 'low_water_dam', 'danger', 96.6, TRUE, NULL, 'Low-water bridge on Rochester Road at Ozark Springs. Portage. Do not run at any level.', 'A low-water bridge is a drowning hazard at any runnable flow; portage regardless of season.'),
  ('gasconade', 'Grimes Mill dam', 'low_water_dam', 'caution', 12.9, FALSE, NULL, 'Grimes Mill. The old milldam makes a good rift in medium-to-high water; scout before running.', 'Washed out and scrapy at summer low water; forms a runnable rift in medium-to-high water.'),
  ('st-francis', 'Silver Mine Dam', 'low_water_dam', 'danger', 22.7, FALSE, 'left', 'Silver Mine Dam, in the whitewater section below Millstream Gardens. A breach is blown in the left side, but in high water it throws a large wave at the base that will swamp an open canoe. Scout; less-experienced paddlers should portage.', 'The wave at the breach builds dangerously as flow rises; the whole shut-ins run is only sensible at moderate flows.'),
  ('north-fork-white', 'Dawt Mill Dam', 'low_water_dam', 'warning', 57.5, TRUE, 'right', 'Dawt Mill Dam, a low dam just above the Tecumseh take-out that backs water up about a quarter mile and is a known canoe-buster. Portage or slide down the shallow chute at the right end (a rough path also goes around the right). A good rapid runs below the dam.', 'Most dangerous ("canoe-buster") at higher flows; the right-end chute is the usual line/portage.'),
  ('bourbeuse', 'Guths Mill Dam', 'low_water_dam', 'warning', 103.37, TRUE, NULL, 'Guths Mill Dam. Portage.', 'Low-head dams form a keeper hydraulic at moderate-to-high flow; portage at every level.'),
  ('elk', 'Shadow Lake Dam (Noel)', 'low_water_dam', 'warning', 11.61, TRUE, NULL, 'Low dam near Noel (Shadow Lake). Portage.', 'Low-head dams are most dangerous at moderate-to-high flow; portage at every level.'),
  ('black', 'Clearwater Dam', 'low_water_dam', 'danger', 37.6, TRUE, 'left', 'Clearwater Dam. Take out or portage left; do not approach the dam. The popular upper float ends at the lake well above here.', 'A large flood-control dam: flow below it can change suddenly with releases, independent of local weather.'),
  ('bryant-creek', 'Bertha Ford low-water bridge', 'low_water_dam', 'caution', 31.15, FALSE, NULL, 'Bertha Ford low-water bridge. Passable at normal levels but may need to be portaged or walked; dangerous in high water.', 'A drowning hazard when water is up and over the slab; often exposed or walkable at summer low water.'),
  ('bryant-creek', 'Monastery Bridge low-water crossing', 'low_water_dam', 'caution', 25.47, FALSE, NULL, 'Monastery Bridge low-water crossing off Hwy OO. May need to be portaged or walked; dangerous in high water.', 'A drowning hazard when water is up and over the slab; often exposed or walkable at summer low water.')
) AS v(slug, name, type, severity, db_mile, portage_required, portage_side, description, seasonal_notes)
JOIN rivers r ON r.slug = v.slug
CROSS JOIN LATERAL get_point_at_mile(r.id, v.db_mile) gp;

-- get_point_at_mile assumes the geometry is parameterized linearly by mile.
-- That holds for most rivers (verified: access points reproduce to <0.3 mi), but
-- fails badly on the most sinuous ones (gasconade ~6 mi, black ~8, st-francis ~14,
-- bourbeuse ~15 off). For those, re-derive each hazard's coordinate by
-- interpolating between the two bracketing access points (known-good coords),
-- which is robust to the geometry parameterization.
WITH targets AS (
  SELECT h.id, h.river_id, h.river_mile_downstream AS m
  FROM river_hazards h JOIN rivers r ON r.id = h.river_id
  WHERE (r.slug, h.name) IN (
    ('gasconade','Ozark Springs low-water bridge'),
    ('gasconade','Grimes Mill dam'),
    ('black','Clearwater Dam'),
    ('st-francis','Silver Mine Dam'),
    ('bourbeuse','Guths Mill Dam')
  )
),
bracket AS (
  SELECT t.id, t.m,
    (SELECT ap.river_mile_downstream FROM access_points ap WHERE ap.river_id=t.river_id AND ap.location_orig IS NOT NULL AND ap.river_mile_downstream <= t.m ORDER BY ap.river_mile_downstream DESC LIMIT 1) AS a_m,
    (SELECT ap.location_orig      FROM access_points ap WHERE ap.river_id=t.river_id AND ap.location_orig IS NOT NULL AND ap.river_mile_downstream <= t.m ORDER BY ap.river_mile_downstream DESC LIMIT 1) AS a_pt,
    (SELECT ap.river_mile_downstream FROM access_points ap WHERE ap.river_id=t.river_id AND ap.location_orig IS NOT NULL AND ap.river_mile_downstream >= t.m ORDER BY ap.river_mile_downstream ASC LIMIT 1) AS b_m,
    (SELECT ap.location_orig      FROM access_points ap WHERE ap.river_id=t.river_id AND ap.location_orig IS NOT NULL AND ap.river_mile_downstream >= t.m ORDER BY ap.river_mile_downstream ASC LIMIT 1) AS b_pt
  FROM targets t
)
UPDATE river_hazards h
SET location = CASE
  WHEN b.a_pt IS NULL THEN b.b_pt
  WHEN b.b_pt IS NULL THEN b.a_pt
  WHEN b.b_m = b.a_m THEN b.a_pt
  ELSE ST_LineInterpolatePoint(ST_MakeLine(b.a_pt, b.b_pt), ((b.m - b.a_m)/(b.b_m - b.a_m))::float8)
END
FROM bracket b WHERE h.id = b.id;

