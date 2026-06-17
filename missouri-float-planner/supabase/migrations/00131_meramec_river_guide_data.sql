-- 00131_meramec_river_guide_data.sql
-- Seeds the Meramec River guide post with structured guide_data, mirroring the
-- Current River template (00102). Supersedes the legacy HTML-only Meramec post
-- (00089_meramec_river_guide_post.sql, slug 'meramec-river-float-trip-guide')
-- by giving the river a guide_data post on the canonical slug pattern. Both the
-- new and legacy slugs are deleted first so only one Meramec guide exists.
--
-- Sources: 00089 legacy content (verified facts ported forward),
-- EDDY_KNOWLEDGE.md, DB access_points mile markers, river_gauges (USGS 07018500
-- Sullivan is primary; multi-gauge river), MDC special-waterbody regulations,
-- Missouri State Parks, MDC big-springs (Maramec Spring = Missouri #5),
-- docs/river-guide-style.md.

DELETE FROM blog_posts WHERE slug IN ('meramec-river-float-trips-missouri', 'meramec-river-float-trip-guide');

INSERT INTO blog_posts (
  slug, title, description, category,
  featured_image_url, og_image_url, meta_keywords,
  read_time_minutes, status, published_at, river_slug, guide_data
) VALUES (
  'meramec-river-float-trips-missouri',
  'Meramec River Float Trip Guide: Caves, Floats & Outfitters',
  'Float the Meramec — St. Louis''s closest quality float — with live conditions, mile-by-mile sections, Onondaga and Meramec Caverns, Maramec Spring, the outfitter directory, fishing regs, and a built-in trip planner.',
  'River Guides',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773858582004-Screenshot_2026-03-18_at_1.29.34_PM-hApumthKHhRumeFQN6QpYRYgesNWve.png',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773858582004-Screenshot_2026-03-18_at_1.29.34_PM-hApumthKHhRumeFQN6QpYRYgesNWve.png',
  ARRAY['Meramec River float trip','Meramec River guide','floating Meramec River','Meramec kayak','Meramec canoe','Meramec State Park floating','Steelville Missouri','Onondaga Cave','Meramec Caverns float','Maramec Spring','Meramec River access points','Meramec River water level'],
  12,
  'published',
  '2026-06-17T12:00:00Z',
  'meramec',
  $J$
{
  "hero": {
    "eyebrow": "Meramec River · St. Louis's home float",
    "title_top": "Meramec River",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best float sections by mile marker, the caves and springs worth stopping for, the full outfitter and campground directory, fishing regulations, and a built-in trip planner — your complete guide to floating the Meramec.",
    "photo_url": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773858582004-Screenshot_2026-03-18_at_1.29.34_PM-hApumthKHhRumeFQN6QpYRYgesNWve.png",
    "mile_stats": [
      { "label": "Length",     "value": "~218 mi" },
      { "label": "Difficulty", "value": "Class I" },
      { "label": "Region",     "value": "Ozarks" },
      { "label": "Season",     "value": "Apr–Oct" },
      { "label": "Access",     "value": "MDC & Parks" },
      { "label": "Headwaters", "value": "near Salem" }
    ]
  },
  "intro_html": "<p><strong>The Meramec is St. Louis's home float.</strong> One of the longest free-flowing rivers in Missouri, it runs about 90 minutes down I-44 to the outfitter towns of Steelville and Sullivan — the closest quality float water to the city. It's <em>rain-fed</em>, not spring-fed, which makes it one of the flashiest rivers in the Ozarks: gorgeous and lively when the water's up, and unlike the Current, never guaranteed to be floatable just because it's summer.</p>",
  "why_different": [
    { "strong": "Closest quality float to St. Louis.", "body": "About 90 minutes to Steelville or Sullivan on I-44. No other Ozark float this good is this close to the metro." },
    { "strong": "Caves everywhere.", "body": "Onondaga Cave and Meramec Caverns are show caves right on the river, and Fisher Cave runs lantern tours from Meramec State Park. The bluffs are riddled with them." },
    { "strong": "Rain-fed and flashy.", "body": "The Meramec can spike 5–10 feet in hours after a hard rain and drop fast in a dry spell. There's no spring base flow to fall back on — the gauge is everything." },
    { "strong": "Three rivers in one.", "body": "A narrow, trout-tinged upper river; a bluff-and-cave middle that's the prettiest water; and a wide, gentle lower river built for tubes and big groups." }
  ],
  "sections": [
    { "id": 1, "name": "The Red Ribbon trout run", "from": "Woodson K. Woods", "to": "Scotts Ford",
      "miles": "9", "time": "4–5 hr", "diff": "I–II", "crowd": "Quiet",
      "best": "Anglers, paddlers chasing solitude",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773856028682-Screenshot_2026-03-18_at_12.47.03_PM-EA0egHdBDVJzVDtMLMxOTn1Nf9yHi3.png",
      "segment": "upper",
      "from_slug": "woodson-k-woods-memorial-ca", "to_slug": "scotts-ford",
      "best_for_tags": ["fly-anglers","trout-section","solitude"],
      "body": "The practical top of the float, just below Maramec Spring near St. James. From Woodson K. Woods (mile 26.2) to Scotts Ford (mile 35.1) is a Red Ribbon Trout Area — one of the few Meramec stretches holding rainbow and brown trout. Narrower and more scenic than downstream; it needs more water to float cleanly." },
    { "id": 2, "name": "The bluff-and-cave middle", "from": "Onondaga Cave SP", "to": "Meramec State Park",
      "miles": "20", "time": "Full day or overnight", "diff": "I–II", "crowd": "Moderate",
      "best": "Everyone — the best of the Meramec",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773858468087-Screenshot_2026-03-18_at_1.27.29_PM-uVKsvzoVDelXyLRTr6kBaaWgQNhOvm.png",
      "segment": "middle",
      "from_slug": "onondaga-cave-state-park", "to_slug": "meramec-state-park",
      "best_for_tags": ["overnighters","bluffs","caves","everyone"],
      "body": "The finest water on the river — about 20 miles of towering limestone bluffs, cave mouths, springs, and wide gravel bars. Most Steelville outfitters run this stretch with 5- and 9-mile options. Pass Campbell Bridge (mile 73.6), Blue Springs Creek (mile 78.6), and Green's Cave before finishing at Meramec State Park (mile 88), the river's hub for camping and cabins." },
    { "id": 3, "name": "The Meramec Caverns float", "from": "Meramec State Park", "to": "Sand Ford",
      "miles": "7", "time": "2–4 hr", "diff": "I", "crowd": "Busy summers",
      "best": "Families, tubes, big raft groups",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773859128396-Screenshot_2026-03-18_at_1.38.30_PM-Og8L0hMXrDCwutLfxqzEDbBDYVC3eJ.png",
      "segment": "lower",
      "from_slug": "meramec-state-park", "to_slug": "sand-ford",
      "best_for_tags": ["families","tubers","big-groups"],
      "body": "The busy summer stretch. From Meramec State Park (mile 88) the river widens and gentles past Spanish Claim and the Meramec Caverns area (mile ~94) down to Sand Ford (mile 95.4). Easy Class I water, big gravel bars, and the most crowded weekends on the river — go midweek if you can." },
    { "id": 4, "name": "The quiet lower river", "from": "Sand Ford", "to": "Red Horse",
      "miles": "17", "time": "Full day", "diff": "I", "crowd": "Sleepy",
      "best": "Long quiet drifts, anglers",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773859281624-Screenshot_2026-03-18_at_1.41.11_PM-Dt4KB4Vx0BGRPlUzRcGpoizRrbvqlI.png",
      "segment": "lower",
      "from_slug": "sand-ford", "to_slug": "red-horse-access",
      "best_for_tags": ["long-drifts","anglers","solitude"],
      "body": "Below Sand Ford the river broadens and the crowds thin. Past Chouteau Claim (mile 108.5) to Red Horse (mile 112) it's a wide, slow, metro-edge paddle — far quieter than the park stretch. River 'Round Conservation Area and Robertsville State Park carry the float on toward Pacific and Eureka." }
  ],
  "springs": [
    { "name": "Maramec Spring", "mile": "28", "note": "Missouri's 5th-largest spring, in privately run Maramec Spring Park near St. James — a catch-and-keep trout park (Missouri trout tags required). Spelled 'Maramec' for the spring and park, 'Meramec' for the river.", "rank": "MO #5", "flow": "~96 MGD" },
    { "name": "Onondaga Cave", "mile": "68", "note": "A National Natural Landmark show cave at Onondaga Cave State Park, right at the river access. Guided walking tours run April–October, about an hour underground." },
    { "name": "Green's Cave", "mile": "~85", "note": "A large wild cave in a river bluff above Meramec State Park — a well-known canoe landmark. Admire it from the water; entry is restricted." },
    { "name": "Fisher Cave", "mile": "88", "note": "A wild cave at Meramec State Park with ranger-led lantern tours — one of the more decorated caves in the eastern Ozarks." }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "Spring water, cool.", "note": "Higher flows and fewer people. Bring a layer; the water's cold." },
    { "m": "May–Jun", "t": "Sweet spot.", "note": "Warm air, good water, bluffs greening up." },
    { "m": "Jul–Aug", "t": "Peak crowds near the park.", "note": "The lower river is busy on weekends. Go midweek or float the upper for solitude." },
    { "m": "Sep–Oct", "t": "Color and quiet.", "note": "Pleasant temps and thinner crowds; can run low in dry years — check the gauge." },
    { "m": "Nov–Feb", "t": "Floatable in wet spells.", "note": "Cold and variable. It's rain-fed, so watch the forecast and the trend." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, ID, and a layer. Riffles flip beginners.",
    "Drinking water (a gallon per person per day in summer) — there's no potable water on the river.",
    "Reef-safe sunscreen and a hat — the lower river has long, shadeless stretches.",
    "Hard-soled water shoes, not flip-flops. Gravel bars are rocky.",
    "A cooler tied securely into the boat.",
    "Trash bag — the Meramec sees heavy use; pack out everything."
  ],
  "pro_tips": [
    { "strong": "It's rain-fed — check the gauge that morning.", "body": "One of the flashiest rivers in the Ozarks. It can spike 5–10 ft after a storm and drop fast in a dry spell. There's no spring base flow like the Current's." },
    { "strong": "Match the gauge to your section.", "body": "Steelville (USGS 07013000) and Cook Station read the upper river, Sullivan (07018500) the middle, Eureka (07019000) the lower. Conditions differ a lot over 100+ miles." },
    { "strong": "Upper for scenery, lower for tubes.", "body": "Onondaga to Meramec State Park is the prettiest water; below the park is wider and better for big raft and tube groups." },
    { "strong": "Book Steelville weekends ahead.", "body": "The state park and Meramec Caverns stretches fill up. Reserve outfitter shuttles in advance for summer Saturdays." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The Meramec is rain-fed and flashy — it can rise 5–10 feet in hours after a hard rain and stays muddy and pushy for days afterward. Always check the gauge the morning you launch: a falling river is fine, a rising one isn't. PFD on." }
  },
  "tldr": {
    "typical_distance": "5–20 mi day floats; overnight to 30+ mi",
    "best_for_beginners": "Meramec State Park → Sand Ford (7 mi)",
    "primary_gauge": "Sullivan · USGS 07018500",
    "recommended_outfitter": "Meramec State Park canoe rental"
  },
  "segments": [
    { "id": "upper", "label": "Upper Meramec — Maramec Spring to Onondaga",
      "character": "The headwaters reach near St. James and Steelville: narrower, scenic, and trout-tinged. The Woodson K. Woods-to-Scotts Ford stretch is a Red Ribbon Trout Area. Needs more water than the lower river, and rewards it with solitude and bluffs.",
      "best_for": ["fly-anglers","scenery","solitude"],
      "section_ids": [1] },
    { "id": "middle", "label": "Middle Meramec — Onondaga to Meramec State Park",
      "character": "The finest water on the river: about 20 miles of towering limestone bluffs, cave mouths, springs, and wide gravel bars. Most Steelville-area outfitters run this stretch, with 5- and 9-mile options.",
      "best_for": ["everyone","overnighters","bluffs","caves"],
      "section_ids": [2] },
    { "id": "lower", "label": "Lower Meramec — the park to the metro",
      "character": "Below Meramec State Park the river widens and gentles. The Meramec Caverns stretch draws big summer tube crowds; farther down toward Robertsville and Eureka it's a quieter, wider metro-edge paddle.",
      "best_for": ["families","tubers","big-groups","beginners"],
      "section_ids": [3, 4] }
  ],
  "regulations": [
    { "topic": "Red Ribbon trout area", "rule": "Woodson K. Woods to Scotts Ford is a Red Ribbon Trout Area with special catch-and-release-style limits. Porous-soled (felt) waders are prohibited to prevent spreading invasive species.", "url": "https://mdc.mo.gov/fishing/regulations/special-waterbody-regulations/meramec-river" },
    { "topic": "Black bass & goggle-eye limits", "rule": "Special MDC length and daily limits apply to smallmouth bass and goggle-eye on parts of the Meramec. Check current regulations before you keep any fish.", "url": "https://mdc.mo.gov/fishing/regulations/special-waterbody-regulations/meramec-river" },
    { "topic": "Camping", "rule": "Meramec State Park has developed campgrounds and cabins on the river. Gravel-bar camping is allowed on public land, but some stretches near state parks have restrictions — register at the park office for backcountry sites.", "url": "https://mostateparks.com/park/meramec-state-park" },
    { "topic": "Glass & trash", "rule": "Pack out everything you bring in. Glass is discouraged on Missouri streams — it's a heavily used river close to the city, so leave the gravel bars clean.", "url": "https://mdc.mo.gov/fishing/regulations" }
  ],
  "drive_times": [
    { "city": "St. Louis", "hours": "~1.5 hr to Steelville" },
    { "city": "Kansas City", "hours": "~3.5 hr to Steelville" },
    { "city": "Springfield", "hours": "~2.5 hr to Steelville" },
    { "city": "Columbia", "hours": "~2 hr to Steelville" }
  ],
  "nearby_attractions": [
    { "name": "Onondaga Cave State Park", "kind": "State Park", "note": "One of Missouri's most spectacular show caves, right at a river access. Walking tours run April–October.", "url": "https://mostateparks.com/park/onondaga-cave-state-park" },
    { "name": "Meramec State Park", "kind": "State Park", "note": "The river's hub: campgrounds, rental cabins, Fisher Cave lantern tours, and trails. Camping reservations via Missouri State Parks.", "url": "https://mostateparks.com/park/meramec-state-park" },
    { "name": "Meramec Caverns", "kind": "Show cave", "note": "Commercial cave near Stanton with guided tours and riverfront camping — also runs a float outfitter with free shuttle for renters.", "url": "https://www.americascave.com/" },
    { "name": "Maramec Spring Park", "kind": "Trout park", "note": "Privately run trout park at the river's spring source near St. James — catch-and-keep trout (Missouri trout tags required) and a day-use fee.", "url": "https://maramecspringpark.com/" }
  ],
  "related_rivers": [
    { "slug": "huzzah", "label": "Huzzah Creek — a clear Meramec tributary, great for day floats" },
    { "slug": "courtois", "label": "Courtois Creek — Huzzah's quieter sister, same Steelville hub" },
    { "slug": "current", "label": "Current — the spring-fed crown jewel, about 3 hr south" }
  ],
  "pre_launch_notes": [
    { "strong": "It's rain-fed — check the gauge that morning.", "body": "Unlike the spring-fed Current, the Meramec has no guaranteed base flow. It can be too low after a dry spell or dangerously high after a storm." },
    { "strong": "Pick the gauge nearest your section.", "body": "Steelville or Cook Station for the upper river, Sullivan for the middle, Eureka for the lower. Conditions vary a lot over 100+ miles." },
    { "strong": "Weekends near the park get busy.", "body": "Reserve outfitter shuttles ahead for the Meramec State Park and Meramec Caverns stretches, especially summer Saturdays." }
  ],
  "faq": [
    { "q": "How long does a Meramec River float trip take?", "a": "Most outfitter trips cover 5–9 miles and take 2–5 hours. The full Onondaga-to-Meramec State Park run (about 20 miles) is a 7–9 hour day or a comfortable overnight." },
    { "q": "Is the Meramec River good for beginners?", "a": "Yes — especially the lower river below Meramec State Park, which is Class I with a gentle current and wide channel. The upper and middle have Class I–II riffles but are manageable for most paddlers at normal levels. Tubing is popular on the lower river." },
    { "q": "What is the best time of year to float the Meramec?", "a": "June through August for warm water; May and September for fewer crowds. Because it's rain-fed, it can drop to unfloatable levels during summer dry spells — always check the live gauge before you go." },
    { "q": "Do I need my own boat to float the Meramec?", "a": "No. Outfitters in Steelville and Sullivan rent canoes, kayaks, rafts, and tubes with shuttle service included. See the directory above for who's operating now." },
    { "q": "Can I camp along the Meramec River?", "a": "Yes. Meramec State Park has developed campgrounds and rental cabins on the river, and many outfitters offer riverside camping. Gravel-bar camping is allowed on public land, but check rules near the state parks." },
    { "q": "How do I check Meramec River water levels?", "a": "Use the live gauge widget on this page. The Steelville gauge (USGS 07013000) covers the upper river, Sullivan (07018500) the middle, and Eureka (07019000) the lower — check the one nearest your float." },
    { "q": "What fish can I catch on the Meramec?", "a": "Smallmouth and largemouth bass, goggle-eye (rock bass), longear sunfish, and channel catfish throughout, plus rainbow and brown trout in the Red Ribbon area up top. Special MDC limits apply in several sections." },
    { "q": "How far is the Meramec from St. Louis?", "a": "About 90 minutes to Steelville or Sullivan on I-44 — the closest quality float water to the city." }
  ]
}
$J$::jsonb
);
