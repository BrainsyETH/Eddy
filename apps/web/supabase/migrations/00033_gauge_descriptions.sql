-- Migration: Add description fields for gauge thresholds and river summaries
-- Allows admin to customize threshold descriptions and river floating information

-- Add threshold descriptions to gauge_stations
-- This stores custom descriptions for each water level condition
ALTER TABLE gauge_stations
ADD COLUMN IF NOT EXISTS threshold_descriptions JSONB DEFAULT NULL;

-- Add a notes field for general gauge notes
ALTER TABLE gauge_stations
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Add floating summary fields to rivers table
-- These provide river-specific floating guidance
ALTER TABLE rivers
ADD COLUMN IF NOT EXISTS float_summary TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS float_tip TEXT DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN gauge_stations.threshold_descriptions IS 'JSON object with descriptions for each threshold level: {tooLow, low, okay, optimal, high, flood}';
COMMENT ON COLUMN gauge_stations.notes IS 'Admin notes about this gauge (datum issues, local knowledge, etc.)';
COMMENT ON COLUMN rivers.float_summary IS 'General summary of floating conditions and recommendations for this river';
COMMENT ON COLUMN rivers.float_tip IS 'Quick tip or safety note for floaters on this river';

-- Seed existing gauge descriptions from hardcoded values
-- Doniphan - uses CFS thresholds due to datum issues
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Genuinely scrapy, ~1,000 cfs",
  "low": "Floatable but slow, some dragging",
  "okay": "Decent conditions, typical summer levels",
  "optimal": "Good flow, 2,000-4,000 cfs, clear water likely",
  "high": "Fast and muddy, experienced only",
  "flood": "Dangerous conditions, do not float"
}'::jsonb WHERE usgs_site_id = '07068000';

-- Akers - primary Current River gauge
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Significant dragging, walking your boat",
  "low": "May scrape in riffles, especially loaded",
  "okay": "Floatable with some dragging",
  "optimal": "Good floating, minimal dragging",
  "high": "River closes at NPS flood level",
  "flood": "Dangerous, river closed"
}'::jsonb WHERE usgs_site_id = '07064533';

-- Van Buren
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Very shallow, not recommended",
  "low": "Marginal floating",
  "okay": "Floatable, just below average",
  "optimal": "Tubes best below 4.0, good floating",
  "high": "Motor vessels only beyond this",
  "flood": "Flood level, do not float"
}'::jsonb WHERE usgs_site_id = '07067000';

-- Montauk
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Constant dragging, walking boat",
  "low": "Floatable but scrapy",
  "okay": "Decent, some dragging above Welch Spring",
  "optimal": "Sweet spot, avg 1.8 ft, best clarity",
  "high": "Fast and likely muddy",
  "flood": "Dangerous, rises extremely fast"
}'::jsonb WHERE usgs_site_id = '07064440';

-- Eleven Point - Bardley
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Scraping likely, below avg 1.7 ft",
  "low": "Floatable but some dragging",
  "okay": "Decent conditions",
  "optimal": "Good floating, ideal range",
  "high": "Suggest another day, murky/muddy",
  "flood": "Forest Service closes, do not float"
}'::jsonb WHERE usgs_site_id = '07071500';

-- Jacks Fork - Alley Spring
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Significant dragging",
  "low": "Some dragging expected",
  "okay": "Average level, minimal dragging",
  "optimal": "Good conditions",
  "high": "River closes here",
  "flood": "Flood level, dangerous"
}'::jsonb WHERE usgs_site_id = '07065200';

-- Seed river summaries from hardcoded values
UPDATE rivers SET
  float_summary = 'The Akers gauge is the primary reference. 2.0–3.0 ft is optimal. The Current is spring-fed and forgiving, but above 3.5 ft conditions deteriorate. At 4.0 ft the river closes. Below 1.5 ft you''ll drag in riffles. Van Buren (lower river) runs higher—optimal 3.0–4.0 ft, closes at 5.0 ft.',
  float_tip = 'Spring rains can cause rapid rises. If the gauge is climbing, consider another day. The upper Current (Montauk to Akers) needs slightly more water than lower sections.'
WHERE slug = 'current-river';

UPDATE rivers SET
  float_summary = 'The Bardley gauge (16 mi downstream from Greer) is the key reference. 3.0–3.5 ft is optimal. Average is ~3.0 ft. Above 4 ft we recommend another day—water gets murky and conditions deteriorate. At 5 ft, outfitters stop and Forest Service closes the river.',
  float_tip = 'Mid-June through mid-September offers the best floating with clear water. Spring rains (March–May) cause rapid rises and muddy conditions. When in doubt, wait it out.'
WHERE slug = 'eleven-point-river';

UPDATE rivers SET
  float_summary = 'The Jacks Fork is shallower and more rain-dependent. At Alley Spring (primary), 2.5–3.0 ft is ideal. Above 3.5 ft we recommend another day—river closes at 4.0 ft. Below 2.0 ft you''ll drag with gear. At Eminence (lower), 2.0–3.0 ft is good; average is ~1.5 ft but may drag loaded.',
  float_tip = 'The Jacks Fork rises and falls FAST after rain. Flash floods are a serious concern. If rain is forecast or the gauge is rising, postpone your trip.'
WHERE slug = 'jacks-fork-river' OR slug = 'jacks-fork';
