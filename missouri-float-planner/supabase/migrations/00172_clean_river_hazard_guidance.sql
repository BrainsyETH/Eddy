-- 00172_clean_river_hazard_guidance.sql
-- Clean the hazard/condition guidance that feeds Eddy's AI condition updates
-- (river_characteristics.low_water_meaning / rising_water_hazards / primary_hazards).
-- These strings are injected verbatim into the model prompt in
-- src/lib/eddy/generate-update.ts (buildConditionSemantics / buildPrompt), so
-- placeholder junk and internal data-team notes were reaching a user-facing AI.
--
-- Two problems fixed here:
--  (A) 7 newest rivers carried "<section>: n/a | <section>: n/a" placeholders and
--      empty primary_hazards. Null the placeholder guidance so the AI falls back
--      to the curated per-river-type defaults (RIVER_TYPE_GUIDANCE), and populate
--      primary_hazards with tags supported by each river's own profile.
--  (B) 5 earlier rivers carried real guidance mixed with internal engineering
--      TODOs ("UNKNOWN (numeric) — capture …", "NWS xxxM7 … auto-fill at ingest",
--      "SINGLE-SOURCE, treat as cross-check only", "see openQuestions; do NOT use
--      them"). Rewrite to keep ONLY the genuine, paddler-facing guidance that was
--      already in the text. No new facts invented.
--
-- Idempotent: keyed by slug, safe to re-run.

-- ------------------------------------------------------------------
-- (A) Newest 7 rivers: drop "n/a" placeholders -> curated type fallback,
--     and set primary_hazards from facts already in each river's profile.
-- ------------------------------------------------------------------
UPDATE river_characteristics c
SET low_water_meaning = NULL,
    rising_water_hazards = NULL
FROM rivers r
WHERE r.id = c.river_id
  AND r.slug IN ('big-piney','big-river','bryant-creek','caddo-river',
                 'crooked-creek','mulberry','war-eagle-creek');

UPDATE river_characteristics c SET primary_hazards = t.tags
FROM (VALUES
  ('big-piney',       ARRAY['low_water_dam','strainer','flash_flood','gravel_bar']),
  ('big-river',       ARRAY['low_water_dam','strainer','gravel_bar']),
  ('bryant-creek',    ARRAY['strainer','gravel_bar','flash_flood']),
  ('caddo-river',     ARRAY['rapid','strainer','flash_flood']),
  ('crooked-creek',   ARRAY['strainer','gravel_bar','flash_flood']),
  ('mulberry',        ARRAY['rapid','flash_flood','strainer']),
  ('war-eagle-creek', ARRAY['strainer','gravel_bar','flash_flood'])
) AS t(slug, tags)
JOIN rivers r ON r.slug = t.slug
WHERE c.river_id = r.id;

-- ------------------------------------------------------------------
-- (B) Earlier 5 rivers: strip internal engineering notes, keep genuine guidance.
-- ------------------------------------------------------------------

-- Black
UPDATE river_characteristics c SET
  low_water_meaning = 'upper-lesterville: Low water means boats drag on most riffles, but the reach stays floatable; lighter craft handle it better than rafts.',
  rising_water_hazards = 'upper-lesterville: Rain-responsive despite the spring base flow; rises bring stronger current and strainers.'
FROM rivers r WHERE r.id = c.river_id AND r.slug = 'black';

-- Bourbeuse (low_water_meaning was already clean; only rising had ingest notes)
UPDATE river_characteristics c SET
  rising_water_hazards = 'upper-mintspring-nosermill: Runoff-fed and flashy from tributaries; over ~120 cfs it is high and muddy, over ~200 cfs probably too high. Low-water bridges (Glaser Ford, Hog Trough Rd) and logjams are the practical hazards. | lower-nosermill-meramec: 500-1000 cfs is very high and probably muddy, with strong currents and willow jungles that may be dangerous; over 1000 cfs is too high.'
FROM rivers r WHERE r.id = c.river_id AND r.slug = 'bourbeuse';

-- Buffalo (rising_water_hazards was already clean; only low had capture-TODOs)
UPDATE river_characteristics c SET
  low_water_meaning = 'hailstone: The remote upper reaches drop too low to float in dry spells. | upper-ponca-pruitt: When it is too low to launch at Ponca, outfitters shift the put-in about 2 miles downriver to Steel Creek. | middle-pruitt-gilbert: Low water means dragging over shallow riffles. | lower-gilbert-buffalocity: Low water mainly affects speed here, not runnability.'
FROM rivers r WHERE r.id = c.river_id AND r.slug = 'buffalo';

-- Gasconade (keep the losing-reach warning; drop UNKNOWN/capture/NWS-ingest/openQuestions notes)
UPDATE river_characteristics c SET
  low_water_meaning = 'upper-hazelgreen: The upper Gasconade has a documented losing reach (Ozark Springs to Hwy 17, at the Narrows bend above Schlict Spring) where in low water flow drops from ~75 cfs above the Narrows to under 30 cfs below as the river sinks underground, weed-choked and often a walk-the-canoe. Water returns about a mile downstream at Rockslide Bluff via Falling, Creasy and Bartless Mill Springs, so an upstream gauge reading can badly overstate floatability through the losing reach. | mid-jerome: Low water mainly means scraping over riffles; the reach stays floatable. | lower-richfountain: On the larger lower river low water mainly affects speed.',
  rising_water_hazards = 'upper-hazelgreen: Spring-influenced but runoff-responsive; rises bring current, strainers and hazardous low-water bridges. | mid-jerome: Runoff-responsive; low-water bridges and strainers become hazards as water rises. | lower-richfountain: Rises arrive from the large upstream drainage.'
FROM rivers r WHERE r.id = c.river_id AND r.slug = 'gasconade';

-- St. Francis (strip AW/NWS capture TODOs; keep the flash-rise danger framing)
UPDATE river_characteristics c SET
  low_water_meaning = 'upper-whitewater: Below the runnable minimum the shut-ins are unrunnable rock (drag or portage). | lower-float: Low water mainly affects speed on this reach.',
  rising_water_hazards = 'upper-whitewater: Rain-driven flash rises turn Class II-IV into dangerous high water fast, with pushy hydraulics in the shut-ins; the high end can be lethal. | lower-float: Rises arrive from upstream rain; calmer than the shut-ins but still rain-responsive.'
FROM rivers r WHERE r.id = c.river_id AND r.slug = 'st-francis';
