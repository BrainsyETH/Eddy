-- 00129_jacks_fork_river_guide_data.sql
-- Seeds the Jacks Fork River guide post with structured guide_data so the
-- Field Notebook layout (src/components/blog/RiverGuideLayout.tsx) renders it,
-- mirroring the Current River template (00102). Idempotent: re-runs replace
-- the row.
--
-- Sources: blog_posts.guide_data (Current template), EDDY_KNOWLEDGE.md,
-- DB access_points + points_of_interest mile markers, river_gauges (USGS
-- 07065495 Alley Spring is the primary), NPS/ozar, MDC big-springs, the
-- River Guide style & fact-checking runbook (docs/river-guide-style.md).

DELETE FROM blog_posts WHERE slug = 'jacks-fork-river-float-trips-missouri';

INSERT INTO blog_posts (
  slug, title, description, category,
  featured_image_url, og_image_url, meta_keywords,
  read_time_minutes, status, published_at, river_slug, guide_data
) VALUES (
  'jacks-fork-river-float-trips-missouri',
  'Jacks Fork River Float Trip Guide: Springs, Floats & Outfitters',
  'Float the Jacks Fork with live conditions, mile-by-mile sections, springs and Jam Up Cave, the full outfitter directory, the Alley Spring gauge, and a built-in trip planner — your complete guide to Missouri''s wildest ONSR float.',
  'River Guides',
  'https://www.nps.gov/common/uploads/cropped_image/4E240289-EB97-9CDB-81F98A50145B568B.jpg',
  'https://www.nps.gov/common/uploads/cropped_image/4E240289-EB97-9CDB-81F98A50145B568B.jpg',
  ARRAY['Jacks Fork River float trip','Jacks Fork canoe','Jacks Fork kayak','Alley Spring','Jam Up Cave','Eminence Missouri float','Ozark National Scenic Riverways','Jacks Fork water level','Jacks Fork access points','Buck Hollow','Two Rivers','Missouri float trip'],
  11,
  'published',
  '2026-06-17T12:00:00Z',
  'jacks-fork',
  $J$
{
  "hero": {
    "eyebrow": "Jacks Fork River · Ozark National Scenic Riverways",
    "title_top": "Jacks Fork River",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best float sections by mile marker, the springs and the famous Jam Up Cave arch, the full outfitter and campground directory, and a built-in trip planner — your complete guide to floating Missouri's Jacks Fork.",
    "photo_url": "https://www.nps.gov/common/uploads/cropped_image/4E240289-EB97-9CDB-81F98A50145B568B.jpg",
    "mile_stats": [
      { "label": "Length",     "value": "44 mi" },
      { "label": "Difficulty", "value": "Class I–II" },
      { "label": "Region",     "value": "Ozarks" },
      { "label": "Season",     "value": "Apr–Jun" },
      { "label": "Manager",    "value": "NPS (ONSR)" },
      { "label": "Headwaters", "value": "The Prongs" }
    ]
  },
  "intro_html": "<p><strong>The Jacks Fork is the Current's wilder, clearer little sister.</strong> Rain-dependent and flashy above Alley Spring, spring-stabilized below it, and protected end to end as part of the Ozark National Scenic Riverways — the first national park area created to protect a river system, established by Congress on August 27, 1964 (Public Law 88-492). When it's running right — roughly 2.5–3.0 ft on the Alley Spring gauge — it is arguably the most beautiful float in Missouri.</p>",
  "why_different": [
    { "strong": "Rain-dependent and flashy.", "body": "Above Alley Spring the Jacks Fork has no large spring inputs. It rises and falls faster than any other Ozark float stream and can go from floatable to unfloatable in a day. Check the gauge the morning you launch, not the week before." },
    { "strong": "Clear, narrow, and intimate.", "body": "Smaller than the Current and tight against bluffs and boulders. Lighter craft — kayaks and canoes — beat rafts on the upper river." },
    { "strong": "Two rivers in one.", "body": "The upper canyon from the Prongs to Bay Creek is wild, technical spring-runoff water with Jam Up Cave's 80-foot arch. Below Alley Spring's ~81 million gallons a day, the river stabilizes and floats reliably into summer." },
    { "strong": "Protected end to end.", "body": "Part of ONSR and NPS-managed, with free gravel-bar camping and the same Leave No Trace rules as the Current." }
  ],
  "sections": [
    { "id": 1, "name": "The upper canyon", "from": "Buck Hollow", "to": "Rymers",
      "miles": "9", "time": "4–5 hr", "diff": "II", "crowd": "Quiet",
      "best": "Experienced paddlers, spring runoff, scenery",
      "photo": null, "segment": "upper",
      "from_slug": "buck-hollow", "to_slug": "rymers-access",
      "best_for_tags": ["experienced-paddlers","spring-runoff","scenery"],
      "body": "The wild heart of the river. From Buck Hollow (mile 6.8) the canyon narrows past Blue Spring (mile 9.6 — the Jacks Fork's Blue Spring, near Buck Hollow, not the Current's near Powder Mill), the 80-foot arch of Jam Up Cave (mile 12.6), and the rare intermittent Ebb and Flow Spring (mile 15.9) down to Rymers (mile 16.2). Needs spring runoff or a recent rain; usually bony by mid-summer." },
    { "id": 2, "name": "Rymers to Alley", "from": "Rymers", "to": "Alley Spring",
      "miles": "15", "time": "Long day or overnight", "diff": "I–II", "crowd": "Quiet",
      "best": "Overnighters, solitude",
      "photo": null, "segment": "upper",
      "from_slug": "rymers-access", "to_slug": "alley-spring",
      "best_for_tags": ["overnighters","solitude","gravel-bars"],
      "body": "The transition stretch. Still rain-dependent until Alley Spring brings in its flow, with gravel-bar camping at Bay Creek (mile 25.2) roughly the halfway point. Quiet, bluff-lined, and a good overnight when the upper canyon has water." },
    { "id": 3, "name": "The Alley Spring run", "from": "Alley Spring", "to": "Eminence",
      "miles": "6", "time": "2–3 hr", "diff": "I", "crowd": "Busy summers",
      "best": "First-timers, families",
      "photo": null, "segment": "lower",
      "from_slug": "alley-spring", "to_slug": "eminence-city-access",
      "best_for_tags": ["first-timers","families","red-mill"],
      "body": "The postcard float. Put in below Alley Spring — Missouri's 7th-largest spring and the photogenic red 1894 mill — where ~81 million gallons a day stabilize the river. Easy Class I water down to the Eminence city access (mile 37.3). The most popular family stretch and reliably floatable through summer." },
    { "id": 4, "name": "Eminence to the confluence", "from": "Eminence", "to": "Two Rivers",
      "miles": "7", "time": "3–4 hr", "diff": "I", "crowd": "Moderate",
      "best": "Families, the classic finish",
      "photo": null, "segment": "lower",
      "from_slug": "eminence-city-access", "to_slug": "two-rivers",
      "best_for_tags": ["families","smallmouth","confluence"],
      "body": "From Eminence (mile 37.3) the river drifts past Shawnee Creek (mile 41.9) to Two Rivers (mile 44.3), where the Jacks Fork joins the Current. A relaxed half-day and an easy add-on for a multi-river weekend." }
  ],
  "springs": [
    { "name": "Blue Spring (Jacks Fork)", "mile": "9.6", "note": "Cold spring rising from a cave on river-left near Buck Hollow, half-hidden by boulders. Not the Current's Blue Spring near Powder Mill — the two are routinely confused." },
    { "name": "Jam Up Cave", "mile": "12.6", "note": "An 80-foot-high cave arch visible from the river — one of the most spectacular cave mouths in Missouri. Like all ONSR caves it's closed to entry on foot to slow White-Nose Syndrome among bats.", "rank": "ONSR landmark" },
    { "name": "Ebb and Flow Spring", "mile": "15.9", "note": "A rare intermittent spring on river-left that pulses in flow on a schedule unrelated to rainfall or barometric pressure." },
    { "name": "Alley Spring & Mill", "mile": "31", "note": "Walk-up NPS interpretive site at the lower put-in — the spring's blue pool and the iconic red 1894 roller mill.", "rank": "MO #7", "flow": "~81 MGD" }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "Prime upper-canyon window.", "note": "Snowmelt and spring rain float the wild upper river. Cold water." },
    { "m": "May–Jun", "t": "Sweet spot.", "note": "Upper still runs most years; the lower river is gorgeous and warming." },
    { "m": "Jul–Aug", "t": "Lower river, usually.", "note": "The upper canyon goes bony; Alley Spring keeps the lower floating. Reserve 2–4 wks ahead." },
    { "m": "Sep–Oct", "t": "Quiet and colorful.", "note": "Lower river floats; the upper needs a rain bump." },
    { "m": "Nov–Feb", "t": "Floatable below Alley after rain.", "note": "Cold-weather solitude. Pack like you're winter camping." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, ID, and a fleece. The narrow upper river flips beginners in riffles.",
    "Drinking water (a gallon per person per day in summer) — even clear ONSR springs aren't safe to drink.",
    "Reef-safe sunscreen and a hat. Bluff shadows are short.",
    "Hard-soled water shoes. Gravel bars and bedrock are sharp.",
    "A gauge check the morning you launch — the Jacks Fork rises and drops faster than anything else in the Ozarks.",
    "Trash bag — pack out what you bring in."
  ],
  "pro_tips": [
    { "strong": "Check the gauge that morning.", "body": "Watch the Alley Spring gauge (USGS 07065495). The river can climb or drop a foot overnight; yesterday's reading isn't today's river." },
    { "strong": "Upper canyon = spring runoff.", "body": "Buck Hollow to Bay Creek needs water. By July it's usually too low — float the lower river below Alley Spring instead." },
    { "strong": "Camp on gravel bars.", "body": "Free and non-reservable on most NPS sections: 200 ft from springs and tributaries, no cutting live wood, pack out ash." },
    { "strong": "Respect flash floods.", "body": "A narrow canyon means fast rises. If rain is forecast or the gauge is climbing, postpone — this is the flashiest float in the Ozarks." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The Jacks Fork is the flashiest float in the Ozarks. A storm upstream can turn the upper canyon dangerous in hours — if the gauge is rising or rain is in the forecast, wait for another day. PFD on, even when it's calm." }
  },
  "tldr": {
    "typical_distance": "6–15 mi day floats; 25+ mi multi-day",
    "best_for_beginners": "Alley Spring → Eminence (6 mi, 2–3 hr)",
    "primary_gauge": "Alley Spring · USGS 07065495",
    "recommended_outfitter": "Harvey's Alley Spring Canoe Rental"
  },
  "segments": [
    { "id": "upper", "label": "Upper Jacks Fork — The Prongs to Bay Creek",
      "character": "Wild, narrow, and rain-dependent. The upper canyon needs spring runoff or a recent rain to float; in exchange you get Jam Up Cave's 80-foot arch, Blue Spring, and the most dramatic small-river scenery in the Ozarks. Often bony or unfloatable by mid-summer.",
      "best_for": ["experienced-paddlers","spring-runoff","scenery","solitude"],
      "section_ids": [1, 2] },
    { "id": "lower", "label": "Lower Jacks Fork — Alley Spring to Two Rivers",
      "character": "Below Alley Spring's ~81 million gallons a day the river stabilizes and floats reliably through summer. The red Alley Mill, easy Class I water, and the Eminence-to-Two-Rivers finish make this the family-friendly half.",
      "best_for": ["first-timers","families","summer","red-mill"],
      "section_ids": [3, 4] }
  ],
  "regulations": [
    { "topic": "Glass containers", "rule": "Prohibited on the river within ONSR. Glass on the water is a citation, no exceptions.", "url": "https://www.nps.gov/ozar/planyourvisit/things2know.htm" },
    { "topic": "Caves & White-Nose Syndrome", "rule": "All ONSR caves, including Jam Up Cave, are closed to entry on foot to slow White-Nose Syndrome among bats. Admire the arch from the river.", "url": "https://www.nps.gov/ozar/learn/nature/caves.htm" },
    { "topic": "Gravel-bar camping", "rule": "Free, non-reservable, leave-no-trace on most NPS-managed gravel bars. Some bars are closed seasonally for nesting — signage at access points lists current closures.", "url": "https://www.nps.gov/ozar/planyourvisit/camping.htm" },
    { "topic": "Alcohol", "rule": "Permitted on the river but never in glass. The Jacks Fork is a National Park unit — rangers are active; keep it accordingly.", "url": "https://www.nps.gov/ozar/planyourvisit/things2know.htm" }
  ],
  "drive_times": [
    { "city": "St. Louis", "hours": "~3.5 hr to Eminence" },
    { "city": "Kansas City", "hours": "~4.5 hr to Eminence" },
    { "city": "Springfield", "hours": "~2 hr to Eminence" },
    { "city": "Memphis", "hours": "~4 hr to Eminence" }
  ],
  "nearby_attractions": [
    { "name": "Alley Spring & Mill", "kind": "Historic site", "note": "The blue spring pool and the red 1894 roller mill — the most photographed spot in the Ozarks, right at the lower put-in.", "url": "https://www.nps.gov/ozar/planyourvisit/alleyspring.htm" },
    { "name": "Rocky Falls", "kind": "Waterfall", "note": "A pink-granite shut-in and swimming hole off the Stegall Mountain road — a short detour between the Jacks Fork and the Current.", "url": "https://www.nps.gov/places/rocky-falls.htm" },
    { "name": "Echo Bluff State Park", "kind": "State Park", "note": "Modern lodge, cabins, and a trailhead at Sinking Creek — the best overnight base between the Jacks Fork and the upper Current.", "url": "https://mostateparks.com/park/echo-bluff-state-park" },
    { "name": "Round Spring Cave", "kind": "Cave", "note": "Ranger-led lantern tours from the Round Spring campground on the nearby Current River, in season.", "url": "https://www.nps.gov/ozar/planyourvisit/round-spring-cave-tours.htm" }
  ],
  "related_rivers": [
    { "slug": "current", "label": "Current — the bigger ONSR sister, spring-fed and year-round" },
    { "slug": "eleven-point", "label": "Eleven Point — wilder still; the actual Wild & Scenic River" },
    { "slug": "meramec", "label": "Meramec — closer to STL, easier logistics" }
  ],
  "pre_launch_notes": [
    { "strong": "The upper canyon is rain-dependent.", "body": "Buck Hollow to Bay Creek only floats with spring runoff or a recent rain; by mid-summer it's usually too low. Below Alley Spring floats reliably." },
    { "strong": "Cell service is spotty inside ONSR.", "body": "Download your float plan, the Eddy map, and directions before you lose bars." },
    { "strong": "Shuttle: outfitter or two cars.", "body": "Rent from an Eminence or Alley Spring outfitter (they shuttle for you), or stage two vehicles between your put-in and take-out." }
  ],
  "faq": [
    { "q": "How long does it take to float Alley Spring to Eminence?", "a": "About 2–3 hours for the 6-mile run at normal flow, longer with a swim stop. It's the most popular family float on the river." },
    { "q": "Can you camp on the Jacks Fork for free?", "a": "Yes. Gravel-bar camping is free and non-reservable on most NPS-managed sections with Leave No Trace ethics: 200 feet from springs and tributaries, no cutting live wood, pack out everything including ash. The developed NPS campgrounds (Buck Hollow, Bay Creek, Alley Spring, Two Rivers) charge a small fee." },
    { "q": "What's the best section for a first-time float?", "a": "Alley Spring to Eminence (6 miles) or Eminence to Two Rivers (7 miles). Both are Class I and spring-stabilized below Alley Spring, so they float reliably through summer." },
    { "q": "When is the upper Jacks Fork too low to float?", "a": "By mid-summer most years the canyon above Alley Spring is bony. Watch the Alley Spring gauge (USGS 07065495) — below about 2.0 ft you'll be dragging. Float below Alley Spring instead, or wait for rain." },
    { "q": "When is the Jacks Fork too high?", "a": "Above roughly 3.5 ft at Alley Spring most outfitters hold off, and conditions get dangerous around 4.0 ft. It rises fast — the trend over the last day matters more than the single number. Use the live gauge widget on this page." },
    { "q": "How cold is the water?", "a": "Below Alley Spring it's spring-fed and cold year-round — mid-50s to low-60s °F. The upper canyon warms up more in summer because it's mostly rain-fed." },
    { "q": "Can I drink the spring water?", "a": "No. Even crystal-clear ONSR springs are not certified potable — carry your own water." },
    { "q": "Do I need a permit?", "a": "No permits for personal float trips on the NPS section. Outfitters and commercial trips have their own permitting." }
  ]
}
$J$::jsonb
);
