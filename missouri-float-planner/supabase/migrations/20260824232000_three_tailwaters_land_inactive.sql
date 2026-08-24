-- 20260824232000_three_tailwaters_land_inactive.sql
--
-- The White below Bull Shoals, the Norfork tailwater, and Lake Taneycomo —
-- ingested as rivers, wired to the dams that drive them, and left INACTIVE.
--
-- ── Why these are rivers and not reaches ────────────────────────────────────
-- reach-types.ts exists for the Black: above Clearwater it is a spring-fed
-- float, below it is a tailwater, one river row with a section that overrides
-- river_type. That shape does not fit here. controlling_dam_id and state are
-- both RIVER-level columns, and the Norfork tailwater is in Arkansas while the
-- North Fork River Eddy already carries is in Missouri with thirty miles of
-- Norfork Lake between them. shared/dam-types.ts already anticipated this:
-- "a tailwater that is its own river needs no reach."
--
-- ── Why they are inactive ───────────────────────────────────────────────────
-- No agency publishes a rating that maps release to wade/float safety on any
-- of the three. AGFC's tailwater pages carry boundaries and regulations and no
-- numbers; the Corps' water-control site is unreachable; MDC publishes
-- Taneycomo regulations and no flow guidance. Guide and outfitter sites do
-- carry numbers, and they disagree with each other and with the water — one
-- has Table Rock running six turbines at "up to 1,000 cfs" when the plant has
-- four units and was measured at 6,760 cfs the same day.
--
-- So every level_* stays NULL. validate_river_data() raises missing_thresholds
-- at severity ERROR for an ACTIVE river whose primary gauge has no ladder, and
-- activate-rivers.ts rolls back on errors — meaning these rivers CANNOT be
-- activated until somebody sources a rating and signs it. That is the intended
-- behaviour, not an obstacle: the alternative is inventing a number that tells
-- a wading angler a river is safe.
--
-- Full provenance for every identifier below:
--   scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-bull-shoals-dam.md
--   scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-norfork-dam.md
--   scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-table-rock-dam.md

-- ── 1. The rating gate stops being a comment ────────────────────────────────
-- 20260813005710 added condition_rating_source/_approved_by/_approved_at and
-- documented them as "required before a dam_tailwater gauge may carry any
-- threshold at all". Nothing enforced that. A column comment is not a
-- constraint, and this is the one rule in the tailwater design that a person
-- in a hurry would step over.
--
-- Enforced on `role` rather than on rivers.river_type because a CHECK cannot
-- read another table, and role is precisely the tailwater marker — its own
-- comment says it is "NULL on ordinary rivers, where the distinction does not
-- apply". A gauge with a tailwater role either carries no ladder at all, or
-- carries the provenance for the one it has. There is no third state.
--
-- ── NOT VALID, and why that is not a cop-out ────────────────────────────────
-- Production already violates this rule, in two rows, on an active river:
--
--   black · Black River at Poplar Bluff (usgs, role=downstream)
--           280 / 400 / 550 / 2060 / 2060 / 4100 cfs, no rating source
--   black · Black River below Clearwater Dam (usace, role=release)
--           150 / 300 / 400 / 2000 / 2000 / 4000 cfs, no rating source
--
-- Neither row was created in violation. 00198 set Clearwater's levels NULL on
-- purpose — "calibrating them is a safety judgement Eddy would be held to, and
-- guessing is worse than staying silent" — and both rows predate the columns
-- that 20260813005710's backfill later stamped a `role` onto. The rule arrived
-- after the data.
--
-- A validating constraint would therefore refuse to apply, and the only ways
-- to make it apply are to blank the Black's thresholds or to stamp them with a
-- provenance nobody has actually sourced. The first changes what an active
-- river tells a floater; the second is a lie in a column that exists to
-- prevent lies. Both are decisions for the person who owns the Black's
-- calibration, not for the migration that happens to add the constraint.
--
-- NOT VALID enforces on every INSERT and UPDATE from here on, and leaves those
-- two rows to be resolved deliberately. Once they are, this makes it binding:
--   ALTER TABLE public.river_gauges
--       VALIDATE CONSTRAINT river_gauges_tailwater_rating_provenance;
ALTER TABLE public.river_gauges
    DROP CONSTRAINT IF EXISTS river_gauges_tailwater_rating_provenance;

ALTER TABLE public.river_gauges
    ADD CONSTRAINT river_gauges_tailwater_rating_provenance CHECK (
        role IS NULL
        OR (
            level_too_low IS NULL AND level_low IS NULL
            AND level_optimal_min IS NULL AND level_optimal_max IS NULL
            AND level_high IS NULL AND level_dangerous IS NULL
        )
        OR (
            condition_rating_source IS NOT NULL
            AND condition_rating_approved_by IS NOT NULL
            AND condition_rating_approved_at IS NOT NULL
        )
    ) NOT VALID;

COMMENT ON CONSTRAINT river_gauges_tailwater_rating_provenance ON public.river_gauges IS
    'A tailwater gauge (role IS NOT NULL) may hold thresholds only with a cited, approved rating. Enforces what 20260813005710 documented.';

-- ── 2. The three rivers ─────────────────────────────────────────────────────
-- Geometry generated by scripts/ingestion/build-tailwater-geometry.ts from
-- USGS NHD HR, sliced between named endpoints. The script refuses to emit a
-- slice outside its expected length or running downstream-to-upstream.


-- ── White River (white) ───────────────────────────────────
-- Bull Shoals Dam → Guion (AR Hwy 58 bridge), 90.46 mi, 218 vertices
--   from: CWMS /locations?office=SWL, location Bull_Shoals_Dam
--   to:   AGFC states the trout fishery runs "from Bull Shoals Dam to the Arkansas Highway 58 Bridge at Guion". Anchored on USGS 07060790 "Rocky Bayou at Guion" (35°55'41"N 91°56'40"W), whose mouth is at Guion.
--
-- active = false. No agency publishes a rating mapping release to
-- wade/float safety on this river, so river_gauges.level_* stay NULL,
-- and validate_river_data() raises missing_thresholds as an ERROR for
-- an ACTIVE river whose primary gauge has no ladder. Inactive is the
-- honest state, not a half-finished one.
INSERT INTO rivers (
    name, slug, geom, length_miles, downstream_point, direction_verified,
    geometry_starts_at_headwaters, description, difficulty_rating, region,
    state, country, timezone, river_type, controlling_dam_id, active,
    weather_city, weather_lat, weather_lon, alert_search_terms
) VALUES (
    'White River', 'white',
    ST_GeomFromText('LINESTRING(-92.574858 36.366063, -92.590544 36.360041, -92.59427 36.357322, -92.595114 36.355864, -92.594826 36.353321, -92.592736 36.350095, -92.583043 36.343382, -92.575826 36.342276, -92.572978 36.343752, -92.560629 36.345979, -92.550683 36.348917, -92.543695 36.348999, -92.53499 36.350939, -92.53105 36.350086, -92.5281 36.345882, -92.530405 36.335045, -92.532434 36.331078, -92.534986 36.329221, -92.537795 36.328962, -92.541499 36.329977, -92.551023 36.336179, -92.555468 36.336331, -92.558986 36.335019, -92.568256 36.326993, -92.570343 36.324323, -92.571411 36.318566, -92.575332 36.310277, -92.575312 36.307924, -92.573882 36.306566, -92.569643 36.305767, -92.552156 36.313411, -92.547276 36.313582, -92.539305 36.310955, -92.52443 36.300619, -92.523323 36.295828, -92.524705 36.288233, -92.528112 36.282918, -92.532037 36.280067, -92.543863 36.26851, -92.544442 36.266511, -92.543955 36.264075, -92.54136 36.262496, -92.536616 36.262775, -92.532365 36.264219, -92.527133 36.267958, -92.521316 36.268936, -92.508348 36.265042, -92.500205 36.258842, -92.495295 36.256479, -92.484712 36.256001, -92.474821 36.256959, -92.47232 36.256326, -92.469433 36.253689, -92.46942 36.250633, -92.475954 36.242224, -92.476618 36.227838, -92.473226 36.225903, -92.471939 36.223679, -92.469714 36.221938, -92.462874 36.22161, -92.460443 36.220761, -92.458904 36.216399, -92.459514 36.215104, -92.465415 36.211101, -92.471033 36.209476, -92.474421 36.206921, -92.479429 36.201534, -92.480273 36.200104, -92.480291 36.197345, -92.479315 36.193636, -92.474904 36.18964, -92.47144 36.183756, -92.467059 36.180248, -92.461269 36.178166, -92.455855 36.174626, -92.454223 36.174348, -92.442152 36.164258, -92.440085 36.164113, -92.432461 36.168644, -92.431791 36.171948, -92.428671 36.174742, -92.42237 36.183616, -92.418425 36.187145, -92.415586 36.188578, -92.412755 36.18799, -92.406327 36.189967, -92.388447 36.190173, -92.380473 36.192953, -92.374271 36.196613, -92.360155 36.210374, -92.350213 36.216267, -92.345577 36.217335, -92.340972 36.21728, -92.327124 36.208363, -92.323993 36.207854, -92.320316 36.208776, -92.318009 36.21099, -92.315588 36.215469, -92.316029 36.224599, -92.315235 36.227196, -92.31186 36.229572, -92.307954 36.230365, -92.304612 36.230088, -92.301525 36.227293, -92.294531 36.215058, -92.291032 36.210874, -92.289813 36.210834, -92.290645 36.210395, -92.288773 36.202088, -92.280471 36.195898, -92.277819 36.193254, -92.276979 36.190827, -92.278519 36.185608, -92.282518 36.182331, -92.288632 36.180778, -92.301712 36.180252, -92.30662 36.177712, -92.307528 36.175775, -92.306166 36.17201, -92.305731 36.166841, -92.303213 36.162559, -92.298869 36.160719, -92.290245 36.159224, -92.276796 36.159527, -92.262924 36.158709, -92.256567 36.159418, -92.244229 36.164068, -92.241144 36.164188, -92.236034 36.162601, -92.232471 36.160045, -92.227488 36.154498, -92.225396 36.147503, -92.225674 36.142252, -92.223426 36.138251, -92.22026 36.135231, -92.21684 36.133701, -92.213292 36.133319, -92.198556 36.134018, -92.195906 36.133169, -92.193805 36.131281, -92.190727 36.126473, -92.190047 36.119498, -92.192413 36.1147, -92.190837 36.107542, -92.189388 36.105584, -92.183188 36.10269, -92.172423 36.101991, -92.170593 36.104869, -92.160474 36.11001, -92.155804 36.11416, -92.151987 36.116245, -92.147453 36.116286, -92.142003 36.114913, -92.139896 36.113302, -92.135333 36.106464, -92.133277 36.098198, -92.124778 36.080304, -92.118189 36.070359, -92.113569 36.065244, -92.108153 36.061055, -92.102403 36.058983, -92.093001 36.058072, -92.086257 36.058848, -92.080145 36.056867, -92.07315 36.051446, -92.071448 36.048095, -92.06433 36.042432, -92.057588 36.03561, -92.056768 36.032697, -92.057122 36.029904, -92.05827 36.027895, -92.061173 36.025541, -92.064467 36.023963, -92.069994 36.022848, -92.075785 36.022209, -92.082199 36.02312, -92.089821 36.021052, -92.093967 36.018639, -92.098692 36.012597, -92.099471 36.009929, -92.09922 36.005439, -92.097304 35.99977, -92.093164 35.996695, -92.085169 35.98564, -92.083641 35.981427, -92.083002 35.97403, -92.084908 35.966882, -92.087179 35.963795, -92.093943 35.958666, -92.107507 35.95315, -92.109819 35.951383, -92.113542 35.940316, -92.111529 35.934909, -92.108416 35.931969, -92.102651 35.928974, -92.093478 35.926275, -92.089259 35.926078, -92.073913 35.928311, -92.06818 35.929754, -92.057455 35.935168, -92.047149 35.943906, -92.03969 35.944868, -92.035793 35.943826, -92.030114 35.939416, -92.028402 35.934324, -92.027628 35.923043, -92.025022 35.919941, -92.018504 35.91638, -92.010419 35.91718, -92.002201 35.920865, -91.993811 35.927803, -91.989377 35.934533, -91.98602 35.937757, -91.978405 35.940492, -91.968989 35.940226, -91.96324 35.938287, -91.954048 35.932527, -91.949113 35.925422)', 4326),
    90.46, ST_SetSRID(ST_MakePoint(-91.949113, 35.925422), 4326), true,
    true, 'The White River below Bull Shoals Dam — Arkansas’s flagship trout tailwater, cold year-round and running at whatever the Corps releases. Ninety miles of shoals and long pools from the dam past Cotter, Buffalo City and Norfork down to the Highway 58 bridge at Guion, where the Game and Fish Commission’s trout water ends. Eight generators can take the river from a wadeable 800 cfs to over 20,000 cfs in an hour, under a clear sky and with no rain anywhere in the basin.',
    'Class I', 'Ozarks',
    'AR', 'US', 'America/Chicago',
    'dam_tailwater', 'swl-bull-shoals-dam', false,
    'Cotter', 36.2812, -92.5266,
    ARRAY['white river', 'bull shoals', 'baxter county', 'marion county', 'izard county', 'stone county']::text[]
)
ON CONFLICT (slug) DO UPDATE SET
    geom = EXCLUDED.geom,
    length_miles = EXCLUDED.length_miles,
    downstream_point = EXCLUDED.downstream_point,
    direction_verified = EXCLUDED.direction_verified,
    geometry_starts_at_headwaters = EXCLUDED.geometry_starts_at_headwaters,
    description = EXCLUDED.description,
    river_type = EXCLUDED.river_type,
    controlling_dam_id = EXCLUDED.controlling_dam_id,
    weather_city = EXCLUDED.weather_city,
    weather_lat = EXCLUDED.weather_lat,
    weather_lon = EXCLUDED.weather_lon,
    alert_search_terms = EXCLUDED.alert_search_terms;

-- ── Norfork Tailwater (norfork-tailwater) ─────────────────────────────
-- Norfork Dam → White River confluence, 4.87 mi, 14 vertices
--   from: CWMS /locations?office=SWL, location Norfork_Dam
--   to:   Downstream end of the existing north-fork-white geometry in production, which reaches the confluence. AGFC manages the trout fishery from Norfork Dam to the White River confluence.
--
-- active = false. No agency publishes a rating mapping release to
-- wade/float safety on this river, so river_gauges.level_* stay NULL,
-- and validate_river_data() raises missing_thresholds as an ERROR for
-- an ACTIVE river whose primary gauge has no ladder. Inactive is the
-- honest state, not a half-finished one.
INSERT INTO rivers (
    name, slug, geom, length_miles, downstream_point, direction_verified,
    geometry_starts_at_headwaters, description, difficulty_rating, region,
    state, country, timezone, river_type, controlling_dam_id, active,
    weather_city, weather_lat, weather_lon, alert_search_terms
) VALUES (
    'Norfork Tailwater', 'norfork-tailwater',
    ST_GeomFromText('LINESTRING(-92.237552 36.248211, -92.243479 36.245998, -92.251021 36.245571, -92.253593 36.244271, -92.253334 36.241078, -92.25497 36.237518, -92.255527 36.230453, -92.257908 36.2234, -92.266112 36.221828, -92.278912 36.223745, -92.281961 36.221239, -92.282579 36.216987, -92.284475 36.214042, -92.289813 36.210834)', 4326),
    4.87, ST_SetSRID(ST_MakePoint(-92.289813, 36.210834), 4326), true,
    true, 'Not quite five miles of the North Fork River between Norfork Dam and the White River — small, cold and catch-and-release from end to end. A siphon holds a steady 185 cfs whenever the two generators are idle, which is what makes it wadeable; when a unit comes on, the river roughly quadruples. Named for the tailwater rather than the river because Eddy already carries the North Fork River above Norfork Lake, in Missouri, and they are not the same water.',
    'Class I', 'Ozarks',
    'AR', 'US', 'America/Chicago',
    'dam_tailwater', 'swl-norfork-dam', false,
    'Norfork', 36.2076, -92.2793,
    ARRAY['norfork tailwater', 'north fork river', 'norfork dam', 'baxter county']::text[]
)
ON CONFLICT (slug) DO UPDATE SET
    geom = EXCLUDED.geom,
    length_miles = EXCLUDED.length_miles,
    downstream_point = EXCLUDED.downstream_point,
    direction_verified = EXCLUDED.direction_verified,
    geometry_starts_at_headwaters = EXCLUDED.geometry_starts_at_headwaters,
    description = EXCLUDED.description,
    river_type = EXCLUDED.river_type,
    controlling_dam_id = EXCLUDED.controlling_dam_id,
    weather_city = EXCLUDED.weather_city,
    weather_lat = EXCLUDED.weather_lat,
    weather_lon = EXCLUDED.weather_lon,
    alert_search_terms = EXCLUDED.alert_search_terms;

-- ── Lake Taneycomo (taneycomo) ────────────────────────────────
-- Table Rock Dam → Powersite Dam (Ozark Beach), 23.11 mi, 71 vertices
--   from: CWMS /locations?office=SWL, location Table_Rock_Dam
--   to:   USGS 07053820 "Lake Taneycomo at Ozark Beach Dam" (36°39'34.6"N 93°07'33.1"W). Powersite impounds Taneycomo and is its downstream limit; it is Liberty Utilities' and not in the USACE registry.
--
-- active = false. No agency publishes a rating mapping release to
-- wade/float safety on this river, so river_gauges.level_* stay NULL,
-- and validate_river_data() raises missing_thresholds as an ERROR for
-- an ACTIVE river whose primary gauge has no ladder. Inactive is the
-- honest state, not a half-finished one.
INSERT INTO rivers (
    name, slug, geom, length_miles, downstream_point, direction_verified,
    geometry_starts_at_headwaters, description, difficulty_rating, region,
    state, country, timezone, river_type, controlling_dam_id, active,
    weather_city, weather_lat, weather_lon, alert_search_terms
) VALUES (
    'Lake Taneycomo', 'taneycomo',
    ST_GeomFromText('LINESTRING(-93.310229 36.595254, -93.305643 36.595132, -93.298492 36.596823, -93.29383 36.596889, -93.291448 36.596678, -93.287383 36.594741, -93.282754 36.594644, -93.28094 36.593891, -93.277991 36.594574, -93.275349 36.596852, -93.273783 36.599695, -93.27356 36.602914, -93.274843 36.60548, -93.274865 36.611647, -93.273668 36.614489, -93.271058 36.616659, -93.268578 36.617394, -93.265759 36.617022, -93.263306 36.616, -93.258462 36.6119, -93.254783 36.610434, -93.25 36.610298, -93.245223 36.613066, -93.244163 36.614534, -93.243628 36.617969, -93.247443 36.626561, -93.248025 36.63013, -93.247463 36.632809, -93.244922 36.635762, -93.240564 36.637231, -93.236269 36.637429, -93.226863 36.633985, -93.223372 36.633695, -93.217434 36.634246, -93.214687 36.636036, -93.212345 36.638421, -93.21183 36.640301, -93.214159 36.651264, -93.213351 36.662624, -93.211714 36.665385, -93.199518 36.674412, -93.19802 36.679607, -93.198373 36.686314, -93.195898 36.690212, -93.192042 36.692707, -93.184889 36.692691, -93.178941 36.690969, -93.172495 36.691655, -93.168201 36.693392, -93.166256 36.694828, -93.166057 36.695991, -93.161087 36.696025, -93.1581 36.697219, -93.136394 36.710227, -93.131626 36.711423, -93.129207 36.710966, -93.127558 36.709264, -93.127254 36.707749, -93.13016 36.698605, -93.129981 36.691925, -93.127487 36.686573, -93.127843 36.678243, -93.129215 36.675456, -93.13126 36.673534, -93.135654 36.671149, -93.138607 36.670685, -93.14625 36.66451, -93.146208 36.660156, -93.139687 36.655025, -93.128577 36.655556, -93.124555 36.65891)', 4326),
    23.11, ST_SetSRID(ST_MakePoint(-93.124555, 36.65891), 4326), true,
    true, 'Twenty-three miles of the White River between Table Rock Dam and Powersite Dam at Forsyth — a lake by name and by law, a cold tailwater in practice. The top few miles below the dam fish and wade like a river at 53 °F in August; the bottom half is flatwater backed up behind Powersite. Four generators drive the whole thing, and the tailwater below the dam swings eight feet between idle and full generation — the largest, fastest move Eddy measures anywhere.',
    'Class I', 'Ozarks',
    'MO', 'US', 'America/Chicago',
    'dam_tailwater', 'swl-table-rock-dam', false,
    'Branson', 36.6437, -93.2185,
    ARRAY['lake taneycomo', 'taneycomo', 'table rock dam', 'taney county']::text[]
)
ON CONFLICT (slug) DO UPDATE SET
    geom = EXCLUDED.geom,
    length_miles = EXCLUDED.length_miles,
    downstream_point = EXCLUDED.downstream_point,
    direction_verified = EXCLUDED.direction_verified,
    geometry_starts_at_headwaters = EXCLUDED.geometry_starts_at_headwaters,
    description = EXCLUDED.description,
    river_type = EXCLUDED.river_type,
    controlling_dam_id = EXCLUDED.controlling_dam_id,
    weather_city = EXCLUDED.weather_city,
    weather_lat = EXCLUDED.weather_lat,
    weather_lon = EXCLUDED.weather_lon,
    alert_search_terms = EXCLUDED.alert_search_terms;


-- ── 3. north-fork-white stops at the lake ───────────────────────────────────
-- Its geometry ran 106.6 miles: from the Missouri headwaters, through thirty
-- miles of Norfork Lake, past the dam, to the White River confluence. The last
-- 4.8 miles of that line ARE the Norfork tailwater, so leaving it would put
-- the same water in two rivers and show a Missouri float running through a
-- reservoir into Arkansas.
--
-- Clipped at the Highway PP bridge — the downstream-most access point Eddy
-- carries on this river, and the head of the lake. Every one of its eight
-- approved access points stays on the line; the bridge is the last of them.
--
-- ST_LineSubstring against the live geometry rather than a pasted LINESTRING:
-- the cut is defined by a feature, so a reader can see WHERE it cuts instead
-- of diffing ten thousand coordinates.
UPDATE public.rivers r
SET geom = ST_LineSubstring(
        ST_LineMerge(r.geom),
        0,
        ST_LineLocatePoint(
            ST_LineMerge(r.geom),
            ST_SetSRID(ST_MakePoint(-92.2624, 36.6155), 4326)  -- Hwy PP bridge
        )
    ),
    length_miles = ROUND((ST_Length(
        ST_LineSubstring(
            ST_LineMerge(r.geom),
            0,
            ST_LineLocatePoint(
                ST_LineMerge(r.geom),
                ST_SetSRID(ST_MakePoint(-92.2624, 36.6155), 4326)
            )
        )::geography) / 1609.344)::numeric, 2)
WHERE r.slug = 'north-fork-white'
  AND GeometryType(ST_LineMerge(r.geom)) = 'LINESTRING'
  -- Idempotent: only clip while the line still runs past the dam.
  AND ST_LineLocatePoint(
        ST_LineMerge(r.geom),
        ST_SetSRID(ST_MakePoint(-92.23786, 36.24863), 4326)   -- Norfork Dam
      ) > 0.9;

UPDATE public.rivers r
SET downstream_point = ST_EndPoint(ST_LineMerge(r.geom))
WHERE r.slug = 'north-fork-white'
  AND GeometryType(ST_LineMerge(r.geom)) = 'LINESTRING';

-- ── 4. The release stations ─────────────────────────────────────────────────
-- Same argument as 00198_usace_tailwater_stations.sql, now for three more
-- projects: the total release below a dam IS a river discharge at a point on
-- the river, gauge_readings.discharge_cfs already models that, and
-- gauge_stations.provider dispatches to a FlowProvider.
--
-- What makes these different from Clearwater is that they are PRIMARY. On the
-- Black, the dam qualifies a river that Annapolis already describes. Here
-- there is nothing else: USGS publishes no discharge and no stage anywhere in
-- any of these three tailwaters — six sites below these dams, all of them
-- water-quality monitors. The release is not a second opinion, it is the only
-- measurement of how much water is in the river.
--
-- Coordinates are the CWMS `-Tailwater` sub-location for each project, not the
-- dam itself. curated = true because the cron polls only curated stations.
INSERT INTO public.gauge_stations (
    usgs_site_id, site_id_external, provider, name, location, active, curated,
    threshold_descriptions
)
SELECT * FROM (VALUES
    (
        NULL::text, 'swl-bull-shoals-dam', 'usace',
        'White River below Bull Shoals Dam',
        ST_SetSRID(ST_MakePoint(-92.578535671997, 36.36482056353), 4326),
        true, true,
        jsonb_build_object(
            'source', 'USACE Little Rock District (CWMS)',
            'note', 'Total release from Bull Shoals Dam. Eight generators, about 3,300 cfs each; when all are idle the Corps holds a minimum flow near 800 cfs. The river below the dam runs at whatever is released, and that can change without notice.'
        )
    ),
    (
        NULL::text, 'swl-norfork-dam', 'usace',
        'North Fork River below Norfork Dam',
        ST_SetSRID(ST_MakePoint(-92.241057193146, 36.24679567738), 4326),
        true, true,
        jsonb_build_object(
            'source', 'USACE Little Rock District (CWMS)',
            'note', 'Total release from Norfork Dam, which is turbine flow plus a siphon that runs a steady 185 cfs whenever the units are idle. Two generators. Releases can change without notice.'
        )
    ),
    (
        NULL::text, 'swl-table-rock-dam', 'usace',
        'Lake Taneycomo below Table Rock Dam',
        ST_SetSRID(ST_MakePoint(-93.3069401, 36.5950454), 4326),
        true, true,
        jsonb_build_object(
            'source', 'USACE Little Rock District (CWMS)',
            'note', 'Total release from Table Rock Dam. Four generators drive the whole of Lake Taneycomo; the tailwater stage below the dam swings about eight feet between idle and full generation. Releases can change without notice.'
        )
    )
) AS v(usgs_site_id, site_id_external, provider, name, location, active, curated, threshold_descriptions)
WHERE NOT EXISTS (
    SELECT 1 FROM public.gauge_stations gs
    WHERE gs.provider = 'usace' AND gs.site_id_external = v.site_id_external
);

-- ── 5. Wire each release to its river as the primary gauge ──────────────────
-- threshold_unit = 'cfs' because the provider reports discharge and never a
-- stage; 00198's invariant requires it for every usace-fed river gauge.
-- Every level_* is left NULL — see the header, and the constraint in §1.
INSERT INTO public.river_gauges (river_id, gauge_station_id, is_primary, threshold_unit, role)
SELECT r.id, gs.id, true, 'cfs', 'release'
FROM (VALUES
    ('white', 'swl-bull-shoals-dam'),
    ('norfork-tailwater', 'swl-norfork-dam'),
    ('taneycomo', 'swl-table-rock-dam')
) AS w(river_slug, station)
JOIN public.rivers r ON r.slug = w.river_slug
JOIN public.gauge_stations gs
  ON gs.provider = 'usace' AND gs.site_id_external = w.station
WHERE NOT EXISTS (
    SELECT 1 FROM public.river_gauges rg
    WHERE rg.river_id = r.id AND rg.gauge_station_id = gs.id
);

-- ── 6. The two USGS gauges that actually measure this water ─────────────────
-- 07057370 (White near Norfork) and 07060500 (Calico Rock) are the only
-- discharge gauges on any of these three rivers. Both sit on the White, both
-- are already in gauge_stations from the national import, and both are
-- uncurated — which since 00196 means the cron has never polled them.
--
-- role = 'downstream': they measure this reach's water, but not at its head.
-- 07057370 is thirty-five river miles below Bull Shoals Dam.
UPDATE public.gauge_stations
SET curated = true
WHERE provider = 'usgs' AND site_id_external IN ('07057370', '07060500');

INSERT INTO public.river_gauges (river_id, gauge_station_id, is_primary, threshold_unit, role)
SELECT r.id, gs.id, false, 'cfs', 'downstream'
FROM public.rivers r
CROSS JOIN public.gauge_stations gs
WHERE r.slug = 'white'
  AND gs.provider = 'usgs'
  AND gs.site_id_external IN ('07057370', '07060500')
  AND NOT EXISTS (
      SELECT 1 FROM public.river_gauges rg
      WHERE rg.river_id = r.id AND rg.gauge_station_id = gs.id
  );

-- Norfork's release joins the White about thirty-five miles below Bull Shoals,
-- and at full generation it is a third of what Bull Shoals puts out. Anyone
-- reading the lower White needs to know both dams are running, which is
-- exactly what role = 'tributary' ("inflow indicator") was defined for.
INSERT INTO public.river_gauges (river_id, gauge_station_id, is_primary, threshold_unit, role)
SELECT r.id, gs.id, false, 'cfs', 'tributary'
FROM public.rivers r
CROSS JOIN public.gauge_stations gs
WHERE r.slug = 'white'
  AND gs.provider = 'usace' AND gs.site_id_external = 'swl-norfork-dam'
  AND NOT EXISTS (
      SELECT 1 FROM public.river_gauges rg
      WHERE rg.river_id = r.id AND rg.gauge_station_id = gs.id
  );

-- ── What is deliberately NOT wired ──────────────────────────────────────────
-- USGS 07053600 and 07053820 publish Lake Taneycomo's ELEVATION (parameter
-- 62615, reading ~701 ft). That is the same hazard 00198 called out for pool
-- elevation: a 701 in gauge_height_ft would trip the flood-stage override in
-- shared/condition-ladder.ts, which runs BEFORE the null guard, and paint the
-- river red. They are not river gauges and are not wired here.
--
-- USGS 07054501/07054502/07054527 (Bull Shoals) and 07060000 (Norfork) publish
-- water temperature and dissolved oxygen and nothing else. Real readings, but
-- neither a discharge nor a stage — they belong to the water-quality path, not
-- to river_gauges.

-- ── 7. Invariants ───────────────────────────────────────────────────────────
DO $$
DECLARE
    n integer;
BEGIN
    -- Every tailwater river must name the dam that drives it, and that dam
    -- must be the station feeding its release gauge. Without this a tailwater
    -- could be wired to a neighbouring project's outflow — the exact failure
    -- 20260813005710's column comment describes.
    SELECT count(*) INTO n
    FROM public.rivers r
    JOIN public.river_gauges rg ON rg.river_id = r.id AND rg.role = 'release'
    JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.river_type = 'dam_tailwater'
      AND r.controlling_dam_id IS DISTINCT FROM gs.site_id_external;
    IF n > 0 THEN
        RAISE EXCEPTION 'a dam_tailwater river''s release gauge must be its controlling dam (% mismatched)', n;
    END IF;

    SELECT count(*) INTO n
    FROM public.rivers r
    WHERE r.river_type = 'dam_tailwater' AND r.controlling_dam_id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'a dam_tailwater river must set controlling_dam_id (% missing)', n;
    END IF;

    -- 00198's rule, re-asserted now that three more usace stations exist.
    IF EXISTS (
        SELECT 1 FROM public.gauge_stations gs
        JOIN public.river_gauges rg ON rg.gauge_station_id = gs.id
        WHERE gs.provider = 'usace' AND gs.curated IS NOT TRUE
    ) THEN
        RAISE EXCEPTION 'usace stations wired to a river must be curated, or update-gauges will skip them';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.river_gauges rg
        JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE gs.provider = 'usace' AND rg.threshold_unit IS DISTINCT FROM 'cfs'
    ) THEN
        RAISE EXCEPTION 'usace river_gauges must use threshold_unit = cfs';
    END IF;

    -- The three rivers must not be active. Stated as an invariant rather than
    -- left to the INSERT so that re-running this migration over a database
    -- where somebody activated them fails loudly instead of silently agreeing.
    SELECT count(*) INTO n
    FROM public.rivers
    WHERE slug IN ('white', 'norfork-tailwater', 'taneycomo') AND active;
    IF n > 0 THEN
        RAISE EXCEPTION
            'tailwater rivers are active with no approved condition rating (% of 3). '
            'Set river_gauges.condition_rating_source/_approved_by/_approved_at first.', n;
    END IF;

    -- north-fork-white must no longer reach the dam.
    IF EXISTS (
        SELECT 1 FROM public.rivers r
        WHERE r.slug = 'north-fork-white'
          AND GeometryType(ST_LineMerge(r.geom)) = 'LINESTRING'
          AND ST_Distance(
                ST_EndPoint(ST_LineMerge(r.geom))::geography,
                ST_SetSRID(ST_MakePoint(-92.23786, 36.24863), 4326)::geography
              ) < 8000
    ) THEN
        RAISE EXCEPTION 'north-fork-white still runs to Norfork Dam; the clip did not apply';
    END IF;
END $$;
