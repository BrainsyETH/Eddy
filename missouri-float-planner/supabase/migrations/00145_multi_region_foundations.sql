-- 00145_multi_region_foundations.sql
-- Multi-state scaling blockers (see docs/MULTI_STATE_SCALING_PLAN.md):
--   F2: gauge_stations gains a provider abstraction (provider + site_id_external)
--       so flow data can come from sources other than USGS.
--   F3: rivers gain state / country / timezone / river_type — Missouri is no
--       longer implicit.
--   F5: per-river weather reference point and NWS alert search terms move from
--       hardcoded TypeScript maps into data.
--   F6: NPS park code becomes per-river data instead of the hardcoded 'ozar'.
--   F7: river_characteristics carries the hydrology semantics (hazards,
--       recovery, low-water meaning, speed curve) that were baked into prompts.

-- ─────────────────────────────────────────────────────────────────────────────
-- rivers: region, jurisdiction, timezone, hydrological archetype
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE rivers
    ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'MO',
    ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'US',
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago',
    ADD COLUMN IF NOT EXISTS river_type TEXT NOT NULL DEFAULT 'spring_fed_float',
    ADD COLUMN IF NOT EXISTS park_code TEXT,
    ADD COLUMN IF NOT EXISTS weather_city TEXT,
    ADD COLUMN IF NOT EXISTS weather_lat NUMERIC(9, 5),
    ADD COLUMN IF NOT EXISTS weather_lon NUMERIC(9, 5),
    ADD COLUMN IF NOT EXISTS alert_search_terms TEXT[];

ALTER TABLE rivers
    ADD CONSTRAINT rivers_river_type_check CHECK (
        river_type IN ('spring_fed_float', 'dam_tailwater', 'rain_flashy', 'snowmelt', 'flatwater')
    );

COMMENT ON COLUMN rivers.timezone IS 'IANA zone used for condition reports, Eddy updates, and scheduling (e.g. America/Chicago).';
COMMENT ON COLUMN rivers.river_type IS 'Hydrological archetype driving condition semantics and speed defaults. New types require calibrated prompt guidance before launch.';
COMMENT ON COLUMN rivers.park_code IS 'NPS unit code when an NPS unit manages this river (ozar = Ozark NSR, buff = Buffalo National River). NULL when not NPS-managed.';
COMMENT ON COLUMN rivers.alert_search_terms IS 'Lowercase keywords (river names, counties, towns) used to match NWS alerts to this river.';

-- NPS-managed rivers (Ozark National Scenic Riverways covers Current + Jacks Fork)
UPDATE rivers SET park_code = 'ozar' WHERE slug IN ('current', 'jacks-fork');

-- Weather reference points (formerly RIVER_CITY_MAP in src/lib/weather/openweather.ts)
UPDATE rivers SET weather_city = 'Van Buren',      weather_lat = 36.9956, weather_lon = -91.0146 WHERE slug = 'current';
UPDATE rivers SET weather_city = 'Steelville',     weather_lat = 37.9681, weather_lon = -91.3543 WHERE slug = 'meramec';
UPDATE rivers SET weather_city = 'Alton',          weather_lat = 36.6942, weather_lon = -91.3993 WHERE slug = 'eleven-point';
UPDATE rivers SET weather_city = 'Bennett Spring', weather_lat = 37.7156, weather_lon = -92.8564 WHERE slug = 'niangua';
UPDATE rivers SET weather_city = 'Eminence',       weather_lat = 37.1481, weather_lon = -91.3576 WHERE slug = 'jacks-fork';
UPDATE rivers SET weather_city = 'Licking',        weather_lat = 37.4992, weather_lon = -91.8571 WHERE slug = 'big-piney';
UPDATE rivers SET weather_city = 'Steelville',     weather_lat = 37.9681, weather_lon = -91.3543 WHERE slug IN ('huzzah', 'courtois');

-- NWS alert search terms (formerly RIVER_SEARCH_TERMS in src/lib/nws/alerts.ts)
UPDATE rivers SET alert_search_terms = ARRAY['current river', 'shannon county', 'dent county', 'carter county', 'van buren', 'eminence'] WHERE slug = 'current';
UPDATE rivers SET alert_search_terms = ARRAY['meramec', 'crawford county', 'franklin county', 'sullivan', 'steelville'] WHERE slug = 'meramec';
UPDATE rivers SET alert_search_terms = ARRAY['eleven point', 'oregon county', 'alton'] WHERE slug = 'eleven-point';
UPDATE rivers SET alert_search_terms = ARRAY['jacks fork', 'jack''s fork', 'shannon county', 'eminence'] WHERE slug = 'jacks-fork';
UPDATE rivers SET alert_search_terms = ARRAY['niangua', 'dallas county', 'laclede county', 'bennett spring'] WHERE slug = 'niangua';
UPDATE rivers SET alert_search_terms = ARRAY['big piney', 'texas county', 'pulaski county', 'licking'] WHERE slug = 'big-piney';
UPDATE rivers SET alert_search_terms = ARRAY['huzzah', 'crawford county', 'steelville'] WHERE slug = 'huzzah';
UPDATE rivers SET alert_search_terms = ARRAY['courtois', 'crawford county', 'steelville'] WHERE slug = 'courtois';
UPDATE rivers SET alert_search_terms = ARRAY['gasconade', 'pulaski county', 'maries county', 'osage county'] WHERE slug = 'gasconade';

-- ─────────────────────────────────────────────────────────────────────────────
-- gauge_stations: flow-provider abstraction
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE gauge_stations
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'usgs',
    ADD COLUMN IF NOT EXISTS site_id_external TEXT;

-- Existing rows are all USGS; carry the site id over to the generic column.
UPDATE gauge_stations SET site_id_external = usgs_site_id WHERE site_id_external IS NULL;

-- Non-USGS stations (USACE, state DNR, ...) have no USGS site id.
ALTER TABLE gauge_stations ALTER COLUMN usgs_site_id DROP NOT NULL;

-- One station per (provider, external id). usgs_site_id keeps its UNIQUE
-- constraint for legacy code paths; NULLs are allowed there.
CREATE UNIQUE INDEX IF NOT EXISTS gauge_stations_provider_site_idx
    ON gauge_stations (provider, site_id_external);

COMMENT ON COLUMN gauge_stations.provider IS 'Flow data source id registered in src/lib/flow-providers (usgs today; usace, state agencies later).';
COMMENT ON COLUMN gauge_stations.site_id_external IS 'Provider-native site identifier. For USGS this mirrors usgs_site_id.';

-- ─────────────────────────────────────────────────────────────────────────────
-- river_characteristics: per-river hydrology semantics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS river_characteristics (
    river_id UUID PRIMARY KEY REFERENCES rivers(id) ON DELETE CASCADE,
    is_spring_fed BOOLEAN,
    -- What kinds of hazards dominate this river (drives prompt language)
    primary_hazards TEXT[] DEFAULT ARRAY['strainer'],
    -- What "low" physically means on this river (safety-critical wording)
    low_water_meaning TEXT,
    -- What rising water means here (rain response vs dam release vs snowmelt)
    rising_water_hazards TEXT,
    -- Typical hours from local rain to gauge response (was RAIN_LAG in code)
    rain_lag_hours NUMERIC(5, 1),
    rain_lag_note TEXT,
    drop_rate_note TEXT,
    -- Short local-color note (was RIVER_NOTES in src/data/eddy-quotes.ts)
    river_note TEXT,
    -- Optional per-river float-speed multipliers, e.g. {"low": 0.75, "too_low": 0.5}
    speed_curve JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE river_characteristics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "River characteristics are viewable by everyone"
    ON river_characteristics FOR SELECT
    USING (true);

-- Backfill for the current rivers from the values previously hardcoded in
-- src/lib/eddy/rain-lag.ts and src/data/eddy-quotes.ts. The Ozark-default
-- low/rising wording was previously baked into the Eddy system prompt.
INSERT INTO river_characteristics
    (river_id, is_spring_fed, rain_lag_hours, rain_lag_note, drop_rate_note, river_note, low_water_meaning, rising_water_hazards)
SELECT r.id, v.is_spring_fed, v.rain_lag_hours, v.rain_lag_note, v.drop_rate_note, v.river_note,
       'Scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Floatable, and lighter craft handle it better than rafts.',
       'Stronger current, more debris, undercut banks, and strainers that are harder to avoid.'
FROM (VALUES
    ('current',      TRUE,  8::numeric, 'Large spring inputs buffer light rain. Heavy rain shows in 6-12 hours.',                                          '0.2-0.4 ft/day (slow, large spring base flow)',            'Spring-fed with a consistent base flow. Upper sections (Montauk to Akers) are shallower than the lower stretches.'),
    ('jacks-fork',   FALSE, 4::numeric, 'Small watershed with limited spring input responds fast, 3-6 hours. Flash rises are common.',                    '1-3 ft/day (drops as fast as it rises)',                   'Rain-dependent with a smaller watershed. Rises and falls fast, flash floods are a serious concern.'),
    ('meramec',      FALSE, 6::numeric, 'Large watershed, responds in 4-8 hours depending on intensity. Can spike 5-10 ft after heavy storms.',            '0.5-2 ft/day (floatable above Hwy 8 ~36h after rain stops)', 'Largest of the Ozark rivers. Upper sections above Meramec State Park are the most scenic.'),
    ('eleven-point', TRUE,  8::numeric, 'Greer Spring stabilizes lower sections. Upper sections respond to rain in 6-10 hours.',                           '0.3-0.6 ft/day (Greer Spring stabilizes)',                 'Remote and scenic. Peak season is mid-June through September. Prone to fast rises after rain.'),
    ('niangua',      TRUE,  10::numeric, 'Bennett Spring provides stable base flow. Rain response is moderate, 8-12 hours.',                              '0.3-0.5 ft/day (Bennett Spring stabilizes)',               'Fed by Bennett Spring. Generally consistent flows, a reliable choice.'),
    ('big-piney',    TRUE,  6::numeric, 'Lower volume spring inputs. Responds to rain in 5-8 hours.',                                                     '0.3-0.6 ft/day (lower volume, steady spring base)',        'Remote and scenic with a smaller watershed. Can fluctuate quickly after rain.'),
    ('huzzah',       FALSE, 3::numeric, 'Small watershed creek. Responds quickly, 2-4 hours. Drops fast in dry spells.',                                  '1-2 ft/day (small watershed drains fast)',                 'Short float sections, popular for day trips. Pairs well with Courtois for a weekend.'),
    ('courtois',     FALSE, 3::numeric, 'Small watershed creek, similar to Huzzah. Fast response, 2-4 hours.',                                            '1-2 ft/day (similar to Huzzah)',                           'More secluded than Huzzah. Excellent for a quieter, scenic float.'),
    ('gasconade',    FALSE, 8::numeric, 'Large watershed, moderate spring input. Rain response in 6-10 hours. Can spike significantly after heavy storms.', '0.5-1.5 ft/day (large watershed, moderate recovery)',      NULL)
) AS v(slug, is_spring_fed, rain_lag_hours, rain_lag_note, drop_rate_note, river_note)
JOIN rivers r ON r.slug = v.slug
ON CONFLICT (river_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- social_config: scheduling timezone
-- ─────────────────────────────────────────────────────────────────────────────

-- digest_time_cst / time_cst values are now interpreted in this zone.
-- (Column renames deferred to a follow-up to avoid breaking in-flight code.)
ALTER TABLE social_config
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';
