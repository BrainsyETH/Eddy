-- 00133_huzzah_creek_guide_data.sql
-- Seeds the Huzzah Creek guide post with structured guide_data, mirroring the
-- Current River template (00102). Idempotent.
--
-- Sources: EDDY_KNOWLEDGE.md, DB access_points mile markers, river_gauges
-- (USGS 07017200 Steelville is primary — and is the shared proxy gauge for the
-- Courtois), Missouri State Parks (Dillard Mill SHS), USFS Mark Twain NF (Red
-- Bluff), MDC (Huzzah CA), docs/river-guide-style.md.
--
-- Note: Huzzah and Courtois share the Steelville gauge. The knowledge base is
-- explicit that they are NOT alternatives to each other — when one is low, both
-- are. That caveat is carried into the guide (callout, pro_tips, regulations).

DELETE FROM blog_posts WHERE slug = 'huzzah-creek-float-trips-missouri';

INSERT INTO blog_posts (
  slug, title, description, category,
  featured_image_url, og_image_url, meta_keywords,
  read_time_minutes, status, published_at, river_slug, guide_data
) VALUES (
  'huzzah-creek-float-trips-missouri',
  'Huzzah Creek Float Trip Guide: Dillard Mill, Floats & Outfitters',
  'Float Huzzah Creek from Steelville with live conditions, mile-by-mile sections, Dillard Mill and Red Bluff, the outfitter directory, the shared Steelville gauge, and a built-in trip planner — the clear Meramec tributary made for day trips.',
  'River Guides',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772676978230-Screenshot_2026-03-04_at_8.16.06_PM-mytFB6RDFFANRfQlMGYwtlgaWGkHWB.png',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772676978230-Screenshot_2026-03-04_at_8.16.06_PM-mytFB6RDFFANRfQlMGYwtlgaWGkHWB.png',
  ARRAY['Huzzah Creek float trip','Huzzah Creek canoe','Huzzah Creek kayak','Dillard Mill','Red Bluff Recreation Area','Steelville Missouri float','Huzzah water level','Steelville gauge','Huzzah Valley Resort','Huzzah Creek access points','Meramec tributary float','day float St Louis'],
  9,
  'published',
  '2026-06-17T12:00:00Z',
  'huzzah',
  $J$
{
  "hero": {
    "eyebrow": "Huzzah Creek · Steelville float country",
    "title_top": "Huzzah Creek",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best day-float sections by mile marker, Dillard Mill and Red Bluff, the outfitter directory, the shared Steelville gauge, and a built-in trip planner — your complete guide to floating Huzzah Creek.",
    "photo_url": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772676978230-Screenshot_2026-03-04_at_8.16.06_PM-mytFB6RDFFANRfQlMGYwtlgaWGkHWB.png",
    "mile_stats": [
      { "label": "Length",     "value": "33 mi" },
      { "label": "Difficulty", "value": "Class I" },
      { "label": "Region",     "value": "Ozarks" },
      { "label": "Season",     "value": "Apr–Jun" },
      { "label": "Type",       "value": "Rain-fed creek" },
      { "label": "Hub",        "value": "Steelville" }
    ]
  },
  "intro_html": "<p><strong>Huzzah Creek is the easy Steelville day float.</strong> A clear, gravel-bottomed tributary of the Meramec, it runs short, shallow, and friendly — the kind of creek you can float in an afternoon and pair with the Courtois for a full weekend. It's rain-fed, so it drops fast in summer and spikes after storms; the upper creek above Red Bluff is usually only floatable in spring. (Pronounced 'HOO-zaw.')</p>",
  "why_different": [
    { "strong": "A true day float.", "body": "Short sections of 5–8 miles mean you can run the whole thing in an afternoon — no logistics-heavy shuttles or overnights required." },
    { "strong": "Clear, shallow, and intimate.", "body": "Smaller and more intimate than the Meramec it feeds, with bright gravel bars made for swimming. Go light — kayaks and canoes beat rafts here." },
    { "strong": "History at the put-in.", "body": "The float starts at Dillard Mill, one of Missouri's best-preserved water-powered gristmills — a red mill run as a State Historic Site." },
    { "strong": "Pairs with the Courtois.", "body": "Same Steelville hub, same watershed. Float one creek Saturday and the other Sunday — just remember they share a gauge." }
  ],
  "sections": [
    { "id": 1, "name": "Dillard Mill to Red Bluff", "from": "Dillard Mill", "to": "Red Bluff",
      "miles": "8", "time": "3–4 hr", "diff": "I", "crowd": "Quiet",
      "best": "Spring paddlers, history, scenery",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772676892504-Screenshot_2026-03-04_at_8.14.21_PM-14mLfdRYWhDjKiuCPETW3ePuwp3dqR.png",
      "segment": "upper",
      "from_slug": "dillard-mill", "to_slug": "red-bluff-recreation-area",
      "best_for_tags": ["spring-runoff","history","scenery"],
      "body": "The headwater run, starting at the historic red Dillard Mill (mile 0.1). Small, clear, and pretty down to the Red Bluff Recreation Area (mile 8.3) — but it usually needs spring runoff or a recent rain to float cleanly. Scrapy by mid-summer." },
    { "id": 2, "name": "Red Bluff to Highway Z", "from": "Red Bluff", "to": "Highway Z",
      "miles": "8", "time": "3–4 hr", "diff": "I", "crowd": "Moderate",
      "best": "Half-day floats, swimming",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772676325873-C8C9A42A-DEBF-46BB-AF7C-67316B7099A0-h3Vdva6MYQMHe4pEdhfFMUkvIK7Wnt.JPG",
      "segment": "lower",
      "from_slug": "red-bluff-recreation-area", "to_slug": "highway-z-bridge",
      "best_for_tags": ["half-day","swimming","families"],
      "body": "Below the towering Red Bluff the creek opens into the popular mid-creek float, with clear water and gravel bars down to the Highway Z bridge (mile 16.3). A reliable half-day when the gauge has water." },
    { "id": 3, "name": "Highway Z to Huzzah Valley", "from": "Highway Z", "to": "Huzzah Valley",
      "miles": "7", "time": "3–4 hr", "diff": "I", "crowd": "Busy summers",
      "best": "Families, day-trippers",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772677130177-Screenshot_2026-03-04_at_8.18.34_PM-yCOJTSowzl6duhWS7X95DaDTyvYiy0.png",
      "segment": "lower",
      "from_slug": "highway-z-bridge", "to_slug": "huzzah-valley-resort",
      "best_for_tags": ["families","day-trippers","summer"],
      "body": "The outfitter stretch around Huzzah Valley Resort (mile 23) — the busiest, most beginner-friendly water on the creek, with rentals and shuttles right on the bank. Reserve ahead on summer weekends." },
    { "id": 4, "name": "Huzzah Valley to the confluence", "from": "Huzzah Valley", "to": "Huzzah CA",
      "miles": "5", "time": "2–3 hr", "diff": "I", "crowd": "Moderate",
      "best": "A quiet finish toward the Meramec",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772677224627-Screenshot_2026-03-04_at_8.19.57_PM-3x0uDZV4fXZfi7IBByG00d9BFacuCO.png",
      "segment": "lower",
      "from_slug": "huzzah-valley-resort", "to_slug": "huzzah-conservation-area",
      "best_for_tags": ["solitude","gravel-bars","camping"],
      "body": "The lower run down to the Huzzah Conservation Area (mile 28.4), an MDC tract near the creek's mouth at the Meramec. Quieter water, primitive gravel-bar camping, and a relaxed end to the day." }
  ],
  "springs": [
    { "name": "Dillard Mill", "mile": "0.1", "note": "One of Missouri's best-preserved water-powered gristmills — a red mill on Huzzah Creek run as a State Historic Site, with tours in season. The headwater put-in." },
    { "name": "Red Bluff", "mile": "8.3", "note": "A tall red dolomite bluff over a USFS recreation area and campground — the creek's signature landmark and a favorite swimming hole." },
    { "name": "Huzzah Conservation Area", "mile": "28.4", "note": "An MDC conservation area along the lower creek near the Meramec, with gravel-bar access and primitive camping." }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "Upper creek's window.", "note": "Spring runoff floats the Dillard Mill stretch. Cool water." },
    { "m": "May–Jun", "t": "Sweet spot.", "note": "Warm air and reliable water on the lower floats." },
    { "m": "Jul–Aug", "t": "Drops fast.", "note": "The lower creek near Huzzah Valley runs after rain; busy weekends. Check the gauge." },
    { "m": "Sep–Oct", "t": "Pretty but often low.", "note": "Color and quiet, but it can be too low in dry years — check before you go." },
    { "m": "Nov–Feb", "t": "Only after rain.", "note": "Floatable in wet spells; cold and private." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, and ID.",
    "Drinking water — there's no potable water on the creek.",
    "Reef-safe sunscreen and a hat.",
    "Hard-soled water shoes — the creek is shallow and rocky, with lots of in-and-out.",
    "A light boat — kayak or canoe over a raft on this small water.",
    "Trash bag — pack out everything; it's a small, heavily used creek."
  ],
  "pro_tips": [
    { "strong": "It's a creek — check the gauge first.", "body": "Huzzah drops fast in a dry spell and spikes after rain. Below about 2.0 ft at the Steelville gauge (USGS 07017200) you'll be dragging, especially up top." },
    { "strong": "Upper creek is spring-only.", "body": "Dillard Mill to Red Bluff usually needs spring runoff or a recent rain. By summer, float the lower creek near Huzzah Valley instead." },
    { "strong": "Pair it with the Courtois.", "body": "Same Steelville hub and watershed — float one Saturday and the other Sunday. But they share a gauge: when the Huzzah is low, the Courtois is too." },
    { "strong": "Go light.", "body": "The Huzzah is shallow; kayaks and canoes track better than rafts and you'll drag less." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "Huzzah Creek shares its gauge with the Courtois (USGS 07017200 at Steelville) — when one is low, both are. It's a small, rain-driven creek that drops fast in summer and spikes hard after storms. Check the gauge and the trend the morning you launch. PFD on." }
  },
  "tldr": {
    "typical_distance": "5–8 mi day floats",
    "best_for_beginners": "Highway Z → Huzzah Valley (~7 mi)",
    "primary_gauge": "Steelville · USGS 07017200",
    "recommended_outfitter": "Huzzah Valley Resort"
  },
  "segments": [
    { "id": "upper", "label": "Upper Huzzah — Dillard Mill to Red Bluff",
      "character": "Small, clear, and floatable mainly in spring or after rain. It starts at the historic red Dillard Mill and runs scrapy in summer — best caught early in the season.",
      "best_for": ["spring-runoff","half-day","scenery"],
      "section_ids": [1] },
    { "id": "lower", "label": "Lower Huzzah — Red Bluff to the Meramec",
      "character": "The popular outfitted creek below Red Bluff: easy Class I day floats past Huzzah Valley Resort down toward the Meramec. Shallow and clear, best in a kayak or canoe.",
      "best_for": ["families","day-trippers","summer"],
      "section_ids": [2, 3, 4] }
  ],
  "regulations": [
    { "topic": "Mixed management", "rule": "Dillard Mill (State Historic Site), Red Bluff (USFS Mark Twain National Forest), and the Huzzah Conservation Area (MDC) each set their own rules. Check the signage at your put-in.", "url": "https://mostateparks.com/park/dillard-mill-state-historic-site" },
    { "topic": "Camping", "rule": "Red Bluff has a USFS campground (fees apply); the Huzzah Conservation Area allows primitive gravel-bar camping. Pack out everything.", "url": "https://www.fs.usda.gov/mtnf" },
    { "topic": "Shared gauge with the Courtois", "rule": "Both creeks read off the Steelville gauge (USGS 07017200). When the Huzzah is low, the Courtois is too — they are not alternatives to each other.", "url": "https://waterdata.usgs.gov/monitoring-location/07017200/" },
    { "topic": "Glass & trash", "rule": "Glass is discouraged on Missouri streams, and the Huzzah is small and heavily used near Steelville on summer weekends. Carry out everything you bring in.", "url": "https://mdc.mo.gov/fishing/regulations" }
  ],
  "drive_times": [
    { "city": "St. Louis", "hours": "~1.5 hr to Steelville" },
    { "city": "Kansas City", "hours": "~3.5 hr to Steelville" },
    { "city": "Springfield", "hours": "~2.5 hr to Steelville" },
    { "city": "Columbia", "hours": "~2 hr to Steelville" }
  ],
  "nearby_attractions": [
    { "name": "Dillard Mill State Historic Site", "kind": "Historic site", "note": "A red water-powered gristmill on Huzzah Creek, beautifully preserved, with guided tours and a millpond — right at the upper put-in.", "url": "https://mostateparks.com/park/dillard-mill-state-historic-site" },
    { "name": "Red Bluff Recreation Area", "kind": "USFS rec area", "note": "Campground and picnic area beneath a tall red bluff, a Mark Twain National Forest favorite and a popular swimming hole.", "url": "https://www.fs.usda.gov/mtnf" },
    { "name": "Onondaga Cave State Park", "kind": "State Park", "note": "A spectacular show cave on the nearby Meramec, an easy add-on to a Steelville float weekend.", "url": "https://mostateparks.com/park/onondaga-cave-state-park" },
    { "name": "Meramec River", "kind": "River", "note": "The river the Huzzah flows into — a natural pairing for a longer float weekend out of Steelville.", "url": "https://eddy.guide/blog/meramec-river-float-trips-missouri" }
  ],
  "related_rivers": [
    { "slug": "courtois", "label": "Courtois Creek — Huzzah's quieter sister, same watershed" },
    { "slug": "meramec", "label": "Meramec — the river the Huzzah flows into" },
    { "slug": "current", "label": "Current — the spring-fed crown jewel, about 3 hr south" }
  ],
  "pre_launch_notes": [
    { "strong": "It's a small, rain-driven creek.", "body": "Huzzah drops fast in summer dry spells and spikes after storms. Check the Steelville gauge the morning you launch; the upper creek is usually spring-only." },
    { "strong": "Huzzah and Courtois share a gauge.", "body": "Both read off USGS 07017200. When the Huzzah is low, the Courtois is too — don't plan to switch creeks to dodge low water." },
    { "strong": "Go light, and base in Steelville.", "body": "Kayaks and canoes beat rafts on the shallow creek. Steelville has the outfitters, gas, and food for both the Huzzah and the Courtois." }
  ],
  "faq": [
    { "q": "How long does a Huzzah Creek float take?", "a": "Most day floats are 5–8 miles and take 3–4 hours. It's a short creek — you can run a full trip in an afternoon." },
    { "q": "Is Huzzah Creek good for beginners?", "a": "Yes, at normal levels — easy Class I water. But it's shallow, so go light in a kayak or canoe and check the gauge first, since the creek drops fast." },
    { "q": "When is the Huzzah too low to float?", "a": "Below about 2.0 ft at the Steelville gauge (USGS 07017200) you'll be dragging, especially on the upper creek. The Dillard Mill-to-Red Bluff stretch is usually only floatable in spring." },
    { "q": "Can I float the Huzzah and Courtois the same weekend?", "a": "Yes — that's the classic Steelville pairing. Just remember they share a gauge: when one creek is low, so is the other." },
    { "q": "What is Dillard Mill?", "a": "A beautifully preserved red gristmill on Huzzah Creek, run as a State Historic Site right at the headwater put-in. Guided tours run in season." },
    { "q": "Can I camp on the Huzzah?", "a": "Yes — Red Bluff has a USFS campground, Huzzah Valley Resort offers riverside camping, and the Huzzah Conservation Area allows primitive gravel-bar camping." },
    { "q": "How do I check Huzzah Creek water levels?", "a": "Use the live gauge widget on this page — the Steelville gauge (USGS 07017200), which also serves as the proxy gauge for the Courtois." }
  ]
}
$J$::jsonb
);
