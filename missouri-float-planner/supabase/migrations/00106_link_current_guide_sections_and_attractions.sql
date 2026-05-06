-- 00106_link_current_guide_sections_and_attractions.sql
-- Follow-up to 00105: makes the Field Notebook layout actually link out.
--   1) Adds from_slug / to_slug to each FloatSection so the layout can
--      resolve access-point UUIDs and build a planner deep link
--      (/rivers/current?putIn=...&takeOut=...) for each float card.
--   2) Adds a canonical url to each NearbyAttraction so the rendered
--      list shows a "Visit official site →" link alongside a Google
--      Maps "Get directions →" link.
--
-- Section 6 (Big Spring → Doniphan) is intentionally left without
-- from_slug/to_slug because Doniphan isn't a tracked access point on
-- this river — the layout will skip the planner link for that card.

UPDATE blog_posts
SET guide_data = jsonb_set(
                    jsonb_set(
                       guide_data,
                       '{sections}',
                       (
                         SELECT jsonb_agg(
                           CASE s->>'id'
                             WHEN '1' THEN s || jsonb_build_object('from_slug','montauk-state-park','to_slug','cedargrove')
                             WHEN '2' THEN s || jsonb_build_object('from_slug','cedargrove','to_slug','akers-ferry')
                             WHEN '3' THEN s || jsonb_build_object('from_slug','akers-ferry','to_slug','pulltite-spring')
                             WHEN '4' THEN s || jsonb_build_object('from_slug','round-spring','to_slug','two-rivers')
                             WHEN '5' THEN s || jsonb_build_object('from_slug','powder-mill','to_slug','big-spring')
                             ELSE s
                           END
                         )
                         FROM jsonb_array_elements(guide_data->'sections') s
                       )
                    ),
                    '{nearby_attractions}', $J$
[
  { "name": "Echo Bluff State Park",   "kind": "State Park",   "url": "https://mostateparks.com/park/echo-bluff-state-park",         "note": "Modern lodge, cabins, and trailhead at Sinking Creek — the best overnight base for the upper Current." },
  { "name": "Current River State Park","kind": "State Park",   "url": "https://mostateparks.com/park/current-river-state-park",      "note": "Old Alton Box Company company town turned park, with day-use access between Akers and Round Spring." },
  { "name": "Montauk State Park",      "kind": "State Park",   "url": "https://mostateparks.com/park/montauk-state-park",            "note": "Trout park at the headwaters; daily stocking, fly-and-artificial water above Cedargrove." },
  { "name": "Big Spring CCC District", "kind": "Historic site","url": "https://www.nps.gov/ozar/learn/historyculture/big-spring.htm","note": "Civilian Conservation Corps stonework around Big Spring — the dining lodge and cabins are NRHP-listed." },
  { "name": "Rocky Falls",             "kind": "Waterfall",    "url": "https://www.nps.gov/ozar/planyourvisit/rockyfalls.htm",       "note": "Shut-in cascade off the Stegall Mountain road, a quick stop on the drive in or out." },
  { "name": "Devil's Well",            "kind": "Cave",         "url": "https://www.nps.gov/ozar/learn/historyculture/devils-well.htm","note": "Walk-down cave overlook — a roadside stop near Akers." },
  { "name": "Round Spring Cave",       "kind": "Cave",         "url": "https://www.nps.gov/ozar/planyourvisit/round-spring-cave-tours.htm","note": "Ranger-led tours from Round Spring campground in season." },
  { "name": "Alley Spring Mill",       "kind": "Historic site","url": "https://www.nps.gov/ozar/planyourvisit/alleyspring.htm",      "note": "Red mill on the Jacks Fork — easy detour for a multi-river weekend." }
]
$J$::jsonb
                 ),
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
