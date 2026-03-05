-- Backfill threshold descriptions for gauges that are missing them.
-- Only updates rows WHERE threshold_descriptions IS NULL so admin edits are preserved.

-- Jacks Fork - Alley Spring (primary) — was in hardcoded fallback but not in migration 00033
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Significant dragging",
  "low": "Some dragging expected",
  "okay": "Average level, minimal dragging",
  "optimal": "Good conditions",
  "high": "River closes here",
  "flood": "Flood level, dangerous"
}'::jsonb WHERE usgs_site_id = '07065495' AND threshold_descriptions IS NULL;

-- Jacks Fork - Eminence (lower) — was in hardcoded fallback but not in migration 00033
UPDATE gauge_stations SET threshold_descriptions = '{
  "tooLow": "Very low, may drag loaded",
  "low": "Average ~1.5 ft, may drag",
  "okay": "Floatable",
  "optimal": "Good conditions",
  "high": "Suggest another day",
  "flood": "River closes"
}'::jsonb WHERE usgs_site_id = '07066000' AND threshold_descriptions IS NULL;
