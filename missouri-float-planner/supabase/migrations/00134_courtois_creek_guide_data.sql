-- 00134_courtois_creek_guide_data.sql
-- Seeds the Courtois Creek guide post with structured guide_data, mirroring the
-- Current River template (00102). Idempotent. Final river in the active set.
--
-- Sources: EDDY_KNOWLEDGE.md, DB access_points mile markers, river_gauges
-- (Courtois has NO real-time USGS gauge — it reads off the Huzzah Steelville
-- gauge 07017200), USFS Mark Twain NF (Berryman Trail), MDC (Huzzah CA Courtois
-- access), docs/river-guide-style.md.
--
-- Notes: the knowledge base is explicit that the Courtois is NOT an alternative
-- to the Huzzah when the Huzzah is low — same shared gauge, same water. That
-- caveat runs through the guide. Courtois has no Eddy-hosted access-point
-- imagery, so the hero reuses the Huzzah Conservation Area photo — the MDC tract
-- the Courtois actually flows through at its mouth (Scotia confluence). Swap for
-- a Courtois-specific photo via /admin when one is available.

DELETE FROM blog_posts WHERE slug = 'courtois-creek-float-trips-missouri';

INSERT INTO blog_posts (
  slug, title, description, category,
  featured_image_url, og_image_url, meta_keywords,
  read_time_minutes, status, published_at, river_slug, guide_data
) VALUES (
  'courtois-creek-float-trips-missouri',
  'Courtois Creek Float Trip Guide: Floats, Outfitters & Conditions',
  'Float Courtois Creek — Huzzah''s quieter sister near Steelville — with live conditions, mile-by-mile sections, Bass River Resort, the Berryman Trail, the shared Steelville gauge, and a built-in trip planner.',
  'River Guides',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772677224627-Screenshot_2026-03-04_at_8.19.57_PM-3x0uDZV4fXZfi7IBByG00d9BFacuCO.png',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772677224627-Screenshot_2026-03-04_at_8.19.57_PM-3x0uDZV4fXZfi7IBByG00d9BFacuCO.png',
  ARRAY['Courtois Creek float trip','Courtois Creek canoe','Courtois Creek kayak','Bass River Resort','Berryman Trail','Steelville Missouri float','Courtois water level','Steelville gauge','Courtois Huzzah','Courtois Creek access points','Meramec tributary float','quiet float Missouri'],
  9,
  'published',
  '2026-06-17T12:00:00Z',
  'courtois',
  $J$
{
  "hero": {
    "eyebrow": "Courtois Creek · Huzzah's quieter sister",
    "title_top": "Courtois Creek",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best day-float sections by mile marker, Bass River Resort and the Berryman Trail, the shared Steelville gauge, and a built-in trip planner — your complete guide to floating Courtois Creek.",
    "photo_url": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772677224627-Screenshot_2026-03-04_at_8.19.57_PM-3x0uDZV4fXZfi7IBByG00d9BFacuCO.png",
    "mile_stats": [
      { "label": "Length",     "value": "28 mi" },
      { "label": "Difficulty", "value": "Class I" },
      { "label": "Region",     "value": "Ozarks" },
      { "label": "Season",     "value": "Apr–Jun" },
      { "label": "Type",       "value": "Rain-fed creek" },
      { "label": "Hub",        "value": "Steelville" }
    ]
  },
  "intro_html": "<p><strong>The Courtois is the locals' creek.</strong> A clear, secluded tributary that joins the Huzzah near Scotia (and the Meramec just beyond), it offers the same gravel-bar-and-bluff day floats as its better-known sister with noticeably fewer people. It's rain-fed and small — the upper creek is usually only floatable in spring — and it has no gauge of its own, so you read it off the Huzzah. (Locally it's said 'CODE-a-way.')</p>",
  "why_different": [
    { "strong": "Quieter than the Huzzah.", "body": "Same clear water and gravel bars, fewer crowds. When the Huzzah is busy on a summer Saturday, the Courtois is the locals' escape." },
    { "strong": "A secluded day float.", "body": "Short 6–9 mile sections through Mark Twain National Forest country, with the Berryman Trail nearby for hikers and mountain bikers." },
    { "strong": "No gauge of its own.", "body": "The Courtois reads off the Huzzah's Steelville gauge. When the Huzzah is low, the Courtois is too — they're the same water, not alternatives." },
    { "strong": "Pairs with the Huzzah.", "body": "Both creeks share the Steelville hub and meet near Scotia. Float one Saturday and the other Sunday — or run the Courtois straight into the Huzzah." }
  ],
  "sections": [
    { "id": 1, "name": "Brazil to Highway 8", "from": "Brazil Bridge", "to": "Highway 8",
      "miles": "7", "time": "3–4 hr", "diff": "I", "crowd": "Quiet",
      "best": "Spring paddlers, solitude",
      "photo": null, "segment": "upper",
      "from_slug": "brazil-low-water-bridge-cr-657", "to_slug": "highway-8-bridge",
      "best_for_tags": ["spring-runoff","solitude","scenery"],
      "body": "The secluded upper creek, from the Brazil low-water bridge (mile 0.1) to the Highway 8 bridge (mile 6.9). Clear, quiet, and tight against the forest — but it usually needs spring runoff or a recent rain to float, and runs scrapy by mid-summer." },
    { "id": 2, "name": "Highway 8 to Bass River", "from": "Highway 8", "to": "Bass River",
      "miles": "9", "time": "3–4 hr", "diff": "I", "crowd": "Moderate",
      "best": "Half-day floats, swimming, bluffs",
      "photo": null, "segment": "lower",
      "from_slug": "highway-8-bridge", "to_slug": "bass-river-resort",
      "best_for_tags": ["half-day","swimming","bluffs"],
      "body": "The scenic middle creek past the Blunt low-water bridge (mile 11.5), with limestone bluffs and wide gravel bars down to Bass River Resort (mile 15.4). A reliable half-day when the gauge has water." },
    { "id": 3, "name": "Bass River to the confluence", "from": "Bass River", "to": "Scotia",
      "miles": "6", "time": "2–3 hr", "diff": "I", "crowd": "Busy summers",
      "best": "Families, day-trippers",
      "photo": null, "segment": "lower",
      "from_slug": "bass-river-resort", "to_slug": "courtois-huzzah-confluence-scotia-bridge",
      "best_for_tags": ["families","day-trippers","summer"],
      "body": "The popular outfitted stretch around Bass River Resort, past the Huzzah Conservation Area's Courtois access (mile 20.4) down to where the Courtois meets the Huzzah at the Scotia bridge (mile 21.2). Many floaters keep going straight into the Huzzah from here." }
  ],
  "springs": [
    { "name": "Upper Courtois bluffs", "mile": "~6", "note": "Quiet limestone bluffs and clear gravel bars on the secluded upper creek — the scenery that makes the Courtois the locals' pick." },
    { "name": "Bass River gravel bars", "mile": "15.4", "note": "Wide, clear gravel bars around Bass River Resort — prime swimming and wading when the creek is up, and the practical hub for Courtois floats." },
    { "name": "Courtois–Huzzah confluence (Scotia)", "mile": "21.2", "note": "Where the Courtois joins the Huzzah near the Scotia bridge. Float one creek straight into the other for a longer day." }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "Upper creek's window.", "note": "Spring runoff floats the secluded upper stretch. Cool water, no crowds." },
    { "m": "May–Jun", "t": "Sweet spot.", "note": "Warm air and reliable water on the lower floats from Bass River." },
    { "m": "Jul–Aug", "t": "Drops fast.", "note": "The lower creek runs after rain; quieter than the Huzzah even on weekends. Check the gauge." },
    { "m": "Sep–Oct", "t": "Pretty but often low.", "note": "Color and solitude, but it can be too low in dry years — check before you go." },
    { "m": "Nov–Feb", "t": "Only after rain.", "note": "Floatable in wet spells; cold and very private." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, and ID.",
    "Drinking water — there's no potable water on the creek.",
    "Reef-safe sunscreen and a hat.",
    "Hard-soled water shoes — shallow, rocky, lots of in-and-out.",
    "A light boat — kayak or canoe over a raft on this small water.",
    "Trash bag — pack out everything; keep the locals' creek clean."
  ],
  "pro_tips": [
    { "strong": "No gauge of its own — use the Huzzah's.", "body": "The Courtois reads off the Huzzah Steelville gauge (USGS 07017200). When the Huzzah is low, so is the Courtois — they're the same water, not alternatives." },
    { "strong": "Quieter than the Huzzah.", "body": "Same quality, fewer people. The locals' pick when the Huzzah is crowded — but it's the same gauge, so it's not a low-water backup." },
    { "strong": "Upper creek is spring-only.", "body": "Brazil to Highway 8 needs spring runoff. By summer, float the lower creek from Bass River instead." },
    { "strong": "Base at Bass River or Steelville.", "body": "Bass River Resort is the on-creek outfitter; Steelville has gas, food, and lodging for the whole watershed." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The Courtois has no gauge of its own — it reads off the Huzzah's Steelville gauge (USGS 07017200). When the Huzzah is low, the Courtois is too. It's a small, rain-driven creek that drops fast in summer; check the gauge and the trend before you launch. PFD on." }
  },
  "tldr": {
    "typical_distance": "6–9 mi day floats",
    "best_for_beginners": "Bass River → Scotia (~6 mi)",
    "primary_gauge": "Steelville (Huzzah proxy) · USGS 07017200",
    "recommended_outfitter": "Bass River Resort"
  },
  "segments": [
    { "id": "upper", "label": "Upper Courtois — Brazil to Blunt",
      "character": "Secluded, clear, and floatable mainly in spring or after rain. The quiet upper creek runs scrapy in summer — caught early, it's the locals' hideaway.",
      "best_for": ["spring-runoff","solitude","scenery"],
      "section_ids": [1] },
    { "id": "lower", "label": "Lower Courtois — Bass River to the Huzzah",
      "character": "The main outfitted creek below Highway 8: easy Class I day floats past Bass River Resort down to the Huzzah confluence at Scotia. Quieter than the Huzzah, same clear water.",
      "best_for": ["families","day-trippers","swimming"],
      "section_ids": [2, 3] }
  ],
  "regulations": [
    { "topic": "Shared gauge with the Huzzah", "rule": "The Courtois has no real-time USGS gauge. Conditions are read off the Huzzah Steelville gauge (USGS 07017200). When the Huzzah is low, the Courtois is too — they are not alternatives to each other.", "url": "https://waterdata.usgs.gov/monitoring-location/07017200/" },
    { "topic": "Mixed management", "rule": "The corridor runs through Mark Twain National Forest (USFS) and past MDC and private land. Check the signage at each access for camping and use rules.", "url": "https://www.fs.usda.gov/mtnf" },
    { "topic": "Camping", "rule": "Bass River Resort offers riverside camping; the Huzzah Conservation Area (Courtois access) allows primitive gravel-bar camping. Pack out everything.", "url": "https://mdc.mo.gov/fishing/where-to-fish" },
    { "topic": "Glass & trash", "rule": "Glass is discouraged on Missouri streams. Carry out everything you bring in — it's a small, treasured creek.", "url": "https://mdc.mo.gov/fishing/regulations" }
  ],
  "drive_times": [
    { "city": "St. Louis", "hours": "~1.5 hr to Steelville" },
    { "city": "Kansas City", "hours": "~3.5 hr to Steelville" },
    { "city": "Springfield", "hours": "~2.5 hr to Steelville" },
    { "city": "Columbia", "hours": "~2 hr to Steelville" }
  ],
  "nearby_attractions": [
    { "name": "Berryman Trail", "kind": "USFS trail", "note": "A 24-mile loop in the Mark Twain National Forest near the upper creek — popular with mountain bikers, hikers, and equestrians, with primitive trailhead camping.", "url": "https://www.fs.usda.gov/mtnf" },
    { "name": "Dillard Mill State Historic Site", "kind": "Historic site", "note": "A preserved red gristmill on the neighboring Huzzah Creek, an easy add-on to a Courtois weekend.", "url": "https://mostateparks.com/park/dillard-mill-state-historic-site" },
    { "name": "Huzzah Creek", "kind": "Creek", "note": "The Courtois's sister creek and the water it flows into at Scotia — the classic two-creek Steelville weekend.", "url": "https://eddy.guide/blog/huzzah-creek-float-trips-missouri" },
    { "name": "Meramec River", "kind": "River", "note": "The larger river the Huzzah and Courtois feed — a longer float option out of the same Steelville hub.", "url": "https://eddy.guide/blog/meramec-river-float-trips-missouri" }
  ],
  "related_rivers": [
    { "slug": "huzzah", "label": "Huzzah Creek — the Courtois's sister, same Steelville hub" },
    { "slug": "meramec", "label": "Meramec — the river the Courtois flows toward" },
    { "slug": "current", "label": "Current — the spring-fed crown jewel, about 3 hr south" }
  ],
  "pre_launch_notes": [
    { "strong": "No gauge of its own.", "body": "The Courtois reads off the Huzzah's Steelville gauge (USGS 07017200). When the Huzzah is low, the Courtois is too — they're not substitutes for each other." },
    { "strong": "Quieter, but the same water.", "body": "More secluded than the Huzzah with the same rain dependency. The upper creek is usually spring-only; the lower floats from Bass River." },
    { "strong": "Base at Bass River or Steelville.", "body": "Bass River Resort is the on-creek outfitter; Steelville has the services for the whole watershed." }
  ],
  "faq": [
    { "q": "How long does a Courtois Creek float take?", "a": "Most day floats are 6–9 miles and take 3–4 hours. It's a short creek — an easy afternoon trip." },
    { "q": "Is Courtois Creek good for beginners?", "a": "Yes, at normal levels — gentle Class I water. Go light in a kayak or canoe (it's shallow) and check the gauge first." },
    { "q": "How do I check Courtois Creek water levels?", "a": "The Courtois has no gauge of its own — use the Huzzah Steelville gauge (USGS 07017200) on this page. When the Huzzah is low, the Courtois is too." },
    { "q": "Courtois or Huzzah — which should I float?", "a": "They're similar in quality. The Courtois is quieter and more secluded; the Huzzah has more outfitter infrastructure. Locals pick the Courtois when the Huzzah is crowded — but remember they share a gauge." },
    { "q": "When is the Courtois too low to float?", "a": "When the Steelville gauge is below about 2.0 ft you'll be dragging, especially on the upper creek. Brazil to Highway 8 is usually only floatable in spring." },
    { "q": "Can I camp on the Courtois?", "a": "Yes — Bass River Resort offers riverside camping, and the Huzzah Conservation Area (Courtois access) allows primitive gravel-bar camping. The nearby Berryman Trail has primitive trailhead sites too." },
    { "q": "How do you pronounce Courtois?", "a": "Locally it's said 'CODE-a-way.' The name comes from an early French settler family in the region." }
  ]
}
$J$::jsonb
);
