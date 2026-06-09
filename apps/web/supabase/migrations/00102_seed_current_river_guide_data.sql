-- 00102_seed_current_river_guide_data.sql
-- Seeds the Current River guide post with structured guide_data so the new
-- Field Notebook layout (src/components/blog/RiverGuideLayout.tsx) renders
-- it. Idempotent: re-runs replace the payload but leave other columns alone.
--
-- The legacy HTML in blog_posts.content is intentionally left in place as a
-- rollback fallback. The renderer only branches into the new layout when
-- category = 'River Guides' AND guide_data IS NOT NULL.

UPDATE blog_posts
SET guide_data = $J$
{
  "hero": {
    "eyebrow": "Current River · Ozark National Scenic Riverways",
    "title_top": "Current River",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best float sections by mile marker, springs to stop at, the full outfitter and campground directory, and a built-in trip planner — your complete guide to floating Missouri's Current River.",
    "photo_url": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png",
    "mile_stats": [
      { "label": "Length",     "value": "134 mi" },
      { "label": "Difficulty", "value": "Class I–II" },
      { "label": "Region",     "value": "Ozarks" },
      { "label": "Season",     "value": "Year-round" },
      { "label": "Manager",    "value": "NPS (ONSR)" },
      { "label": "Headwaters", "value": "Montauk SP" }
    ]
  },
  "intro_html": "<p><strong>The Current is Missouri's crown jewel float river.</strong> Spring-fed, gin-clear, and protected end-to-end by the National Park Service, it floats reliably from snowmelt through Labor Day and well into fall.</p>",
  "why_different": [
    { "strong": "Spring-fed reliability.", "body": "Big Spring alone pumps about 290 million gallons a day into the river. Even in August, the Current is floatable when most Ozark streams are bony." },
    { "strong": "Visibility you can see your paddle blade through.", "body": "Cold, calcium-rich groundwater keeps the channel clear most of the year. Bring polarized sunglasses; you'll see fish." },
    { "strong": "Protected wilderness.", "body": "The Ozark National Scenic Riverways was the first NPS unit established to protect a river. No motorboats above Akers Ferry except for short stretches." },
    { "strong": "Camping included.", "body": "Free gravel-bar camping is allowed on most stretches with a Leave No Trace mindset, plus 20+ developed access points and a half-dozen NPS campgrounds." }
  ],
  "sections": [
    { "id": 1, "name": "Headwaters", "from": "Montauk", "to": "Cedargrove",
      "miles": "9", "time": "3–4 hr", "diff": "II", "crowd": "Quiet",
      "best": "Experienced paddlers, fly fishers",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png",
      "body": "Cold, fast, narrow, and tight against rhododendron-lined banks. This is trout country — Montauk State Park stocks the river daily in season — and the most technical water on the Current. Tan Vat (mile 0.9) and Baptist Camp (mile 2.1) shorten it to a half-day." },
    { "id": 2, "name": "The classic", "from": "Akers Ferry", "to": "Pulltite",
      "miles": "10", "time": "4–5 hr", "diff": "I", "crowd": "Busy summers",
      "best": "First-timers, families",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770002957258-Cedargrove_Camping-yzww7OvOt8bAQbx5r5cQi2prywhEP7.png",
      "body": "The most popular family float on the river. Akers Ferry (mile 16.7) sits at the last hand-cranked ferry crossing in Missouri. Pass Cave Spring at mile 18 (a flooded cave you can paddle into) and Welch Spring with its 1913 hospital ruins around mile 20. Pulltite Spring takeout is a designed campground with a boat ramp." },
    { "id": 3, "name": "The middle", "from": "Round Spring", "to": "Two Rivers",
      "miles": "17", "time": "6–7 hr or overnight", "diff": "I–II", "crowd": "Moderate",
      "best": "Overnighters, bluffs and quiet",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769964210817-Jerktail-yAc9L945aNRrMoORTETdXu0ONpFM2I.png",
      "body": "Round Spring (a 50-foot-wide blue bowl — walk to it from the parking lot) feeds the river with another 26 million gallons per day. From here it's gravel bars, towering bluffs, and a steady current down past Jerktail Landing (free camping), Broadfoot, and Two Rivers, where the Jacks Fork joins." },
    { "id": 4, "name": "Powder Mill to Big Spring", "from": "Powder Mill", "to": "Big Spring",
      "miles": "31", "time": "2–3 days", "diff": "I", "crowd": "Quiet midweek",
      "best": "Multi-day, springs and miles",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769959365528-Roberts_Field_Stilt_House-wJZVnwELX7eEt7a0h9hwGp0QDjGZmr.png",
      "body": "The big-water lower Current. The river widens, the bluffs get taller, and the gradient slackens just enough to let you stop swimming and start drifting. Stage at Powder Mill (mile 58.7), camp at Log Yard or Waymeyer, push through Van Buren Riverfront Park, and finish at Big Spring — one of the largest single springs on Earth." },
    { "id": 5, "name": "Lower river", "from": "Big Spring", "to": "Doniphan",
      "miles": "≈30", "time": "1–2 days", "diff": "I", "crowd": "Sleepy",
      "best": "Long quiet drifts, anglers",
      "photo": null,
      "body": "Below Big Spring the river broadens further and motorboats become legal. Hickory Landing, Gooseneck, Bay Nothing, and Float Camp Recreation Area string along the south end before the river crosses into Mark Twain National Forest." }
  ],
  "springs": [
    { "name": "Cave Spring",             "mile": "≈18", "note": "Flooded cave mouth — paddle into the entrance, but don't go deep." },
    { "name": "Welch Spring & Hospital", "mile": "≈20", "note": "Ruined 1913 sanitarium built to use the spring's 'curative' air." },
    { "name": "Pulltite Spring",         "mile": "26.3","note": "Smaller spring, easy walk-up from the campground." },
    { "name": "Round Spring",            "mile": "35",  "note": "Circular blue spring pool, NPS interpretive site." },
    { "name": "Big Spring",              "mile": "90.2","note": "Largest single-outlet spring in Missouri. Reliably blue." }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "Peak water, cold (50°F).",        "note": "Wetsuit-or-don't-fall water." },
    { "m": "May–Jun", "t": "Sweet spot.",                      "note": "Warm air, clear water, dogwoods." },
    { "m": "Jul–Aug", "t": "Party season Akers–Pulltite.",     "note": "Lower river stays peaceful. Reserve 2–4 wks ahead." },
    { "m": "Sep–Oct", "t": "Eddy's favorite.",                 "note": "Color, cool air, warm water still." },
    { "m": "Nov–Feb", "t": "Floatable, almost private.",       "note": "Pack like you're going winter camping." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, ID, and a fleece. Phones tumble out of canoes.",
    "Drinking water (a gallon per person per day in summer) — the river is clear but not safe to drink.",
    "Reef-safe sunscreen and a hat. Bluff shadows are short; sunburn is the #1 trip-ender.",
    "Hard-soled water shoes. Gravel bars are sharper than they look.",
    "Trash bag — pack out what you bring in, and an extra handful of someone else's."
  ],
  "pro_tips": [
    { "strong": "Launch early.",            "body": "Outfitter shuttle bus rolls 8–10 a.m. on summer weekends. Be on the water by 9 and you'll have most of the river to yourself for two hours." },
    { "strong": "Use the ferry.",           "body": "Akers Ferry still runs as a vehicle ferry; if your shuttle requires crossing, time it." },
    { "strong": "Camping etiquette.",       "body": "Gravel bars only, 200 ft from springs and tributaries, no cutting live wood, pack out ash." },
    { "strong": "Don't paddle drunk.",      "body": "Most rescues on this river are alcohol-related. The current is gentle; the cold spring water is not." },
    { "strong": "Phone service is spotty.", "body": "Download your float plan and the Eddy map ahead of time; service generally returns near Van Buren." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The river is gentle but the spring water isn't — 56°F year-round. If you swim in March, you'll know it. PFD on, even when it's calm." }
  },
  "faq": [
    { "q": "How long does it take to float Akers to Pulltite?",
      "a": "Most parties take 4–5 hours including a swim stop. The 10-mile section averages a 2–3 mph current at normal levels." },
    { "q": "Can you camp on the Current River for free?",
      "a": "Yes. Gravel-bar camping is allowed on most NPS-managed sections with Leave No Trace ethics: 200 feet from springs and tributaries, no cutting live wood, pack out everything including ash. The developed NPS campgrounds (Akers, Pulltite, Round Spring, Two Rivers, Big Spring) charge a small fee." },
    { "q": "What's the best section for a first-time float?",
      "a": "Akers Ferry to Pulltite (10 miles, 4–5 hours). Class I water, plenty of bailout points, well-known outfitters at both ends, and you'll pass Cave Spring and Welch Spring on the way down." },
    { "q": "When is the Current River too high to float?",
      "a": "Watch the Van Buren gauge. Above roughly 7–8 ft most outfitters cancel rentals; the river runs muddy, fast, and pushes hard against bluffs and strainers." },
    { "q": "Are motors allowed on the Current?",
      "a": "Above Akers Ferry — no. Below Akers but above Big Spring — small outboards only with restrictions. Below Big Spring — standard motorboats are common." },
    { "q": "How cold is the water?",
      "a": "Year-round around 56–60°F. Spring-fed groundwater stays the same temperature whether it's January or July. Refreshing in August, hypothermic in March if you swim." },
    { "q": "Do I need a permit?",
      "a": "No permits for personal float trips on the NPS section. Outfitters and commercial trips have their own permitting. Trout fishing in Montauk requires a Missouri trout permit." }
  ]
}
$J$::jsonb,
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
