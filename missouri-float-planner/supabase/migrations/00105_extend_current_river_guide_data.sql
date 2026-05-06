-- 00105_extend_current_river_guide_data.sql
-- Major content + structure pass on the Current River guide_data:
--   1) Fact corrections from editorial review (Big Spring scope, ONSR
--      framing, Akers Ferry, Blue Spring, trout-section logistics).
--   2) New optional fields populated for the Current as the template
--      proof: tldr, segments (Upper/Middle/Lower), regulations,
--      drive_times, nearby_attractions, related_rivers.
--   3) Per-section segment + best_for_tags for grouping.
--   4) Per-spring rank + flow for the springs reference table.
-- The shape is enforced in src/types/blog.ts; new fields are optional so
-- unmigrated rivers keep working.
--
-- Implemented as a single shallow merge (`||`) instead of nested
-- jsonb_set — every overwritten top-level key (intro_html, springs,
-- sections, callouts, faq) is fully reconstructed in this payload, and
-- everything else (hero, why_different, seasons, what_to_bring, pro_tips)
-- is preserved by the shallow merge.

UPDATE blog_posts
SET guide_data = guide_data || $J$
{
  "intro_html": "<p><strong>The Current is Missouri's crown jewel float river.</strong> Spring-fed, gin-clear, and protected end-to-end as the first national park area created to protect a river system — the Ozark National Scenic Riverways, established by Congress on August 27, 1964 (Public Law 88-492). It floats reliably from snowmelt through Labor Day and well into fall.</p>",
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The river is gentle but the spring water isn't — 56°F year-round. If you swim in March, you'll know it. PFD on, even when it's calm." }
  },
  "springs": [
    { "name": "Cliff Jump",                "mile": "11.8", "note": "Small bluff jump on the Cedargrove–Akers stretch. Check water depth before you leap." },
    { "name": "Medlock Cave & Spring",     "mile": "12.6", "note": "River-right cave entrance just upstream of Welch — easy to miss. Worth a paddle-by; entering the cave on foot is closed (White-Nose Syndrome)." },
    { "name": "Welch Spring & Hospital",   "mile": "13.7", "rank": "First-magnitude", "flow": "78–120 MGD (sources vary)", "note": "Ruined 1913 sanitarium built to use the spring's 'curative' air. Pull off river-right and walk up — this one is on the Cedargrove–Akers float, not Akers–Pulltite." },
    { "name": "Cave Spring",               "mile": "21.9", "rank": "First-magnitude", "flow": "~32 MGD",                  "note": "The famous flooded cave mouth you can paddle into. River-right between Akers and Pulltite. Paddling into the entrance is allowed; entering on foot is not." },
    { "name": "Pulltite Spring",           "mile": "26.3", "rank": "MO #13",          "flow": "~47 MGD",                  "note": "Smaller spring, easy walk-up from the Pulltite Campground at the takeout." },
    { "name": "Round Spring",              "mile": "35.2", "rank": "First-magnitude", "flow": "~26 MGD",                  "note": "Circular blue spring pool — a 50-foot-wide bowl. NPS interpretive site, walk to it from the parking lot." },
    { "name": "Blue Spring (Current)",     "mile": "57.4", "rank": "MO #6 — Missouri's deepest at 310 ft", "flow": "~90 MGD", "note": "Near Powder Mill on the lower river. Not the Jacks Fork's Blue Spring near Buck Hollow — these are routinely conflated." },
    { "name": "Big Spring",                "mile": "90.2", "rank": "MO #1",           "flow": "~286 MGD avg (~470 cfs avg; 1,170 cfs max)", "note": "One of the largest single-outlet springs in the United States. Reliably blue, surrounded by old CCC stonework." }
  ],
  "sections": [
    { "id": 1, "name": "Headwaters", "from": "Montauk", "to": "Cedargrove",
      "segment": "upper",
      "miles": "9", "time": "3–4 hr", "diff": "II", "crowd": "Quiet",
      "best": "Experienced paddlers, fly fishers",
      "best_for_tags": ["fly-anglers", "experienced-paddlers", "trout-section"],
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png",
      "body": "Cold, fast, narrow, and tight against rhododendron-lined banks. This is Missouri's Blue Ribbon trout park — Montauk State Park stocks the river daily in season; fly-and-artificial-only above Cedargrove and a Missouri trout permit is required. The most technical water on the Current. Tan Vat (mile 0.9) and Baptist Camp (mile 2.1) shorten it to a half-day." },
    { "id": 2, "name": "The springs run", "from": "Cedargrove", "to": "Akers Ferry",
      "segment": "upper",
      "miles": "8", "time": "3–4 hr", "diff": "I–II", "crowd": "Moderate",
      "best": "Half-day floats, spring chasers, history buffs",
      "best_for_tags": ["spring-chasers", "half-day", "history"],
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770002957258-Cedargrove_Camping-yzww7OvOt8bAQbx5r5cQi2prywhEP7.png",
      "body": "Cedargrove (mile 9) puts you straight into bluff country. Pass Cliff Jump (mile 11.8), Medlock Cave & Spring (12.6), and the standout: Welch Spring with its abandoned 1913 hospital ruins at mile 13.7 — pull off river-right and walk up. Take out at Akers Ferry, the last operating two-car river ferry in Missouri." },
    { "id": 3, "name": "The classic", "from": "Akers Ferry", "to": "Pulltite",
      "segment": "middle",
      "miles": "10", "time": "4–5 hr", "diff": "I", "crowd": "Busy summers",
      "best": "First-timers, families",
      "best_for_tags": ["first-timers", "families", "tubers"],
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770138762324-Hickory_Landing-Syf9KcQjMk709morGPRranGWa6fbcJ.png",
      "body": "The most popular family float on the river. From Akers Ferry (mile 16.7) you drift down past Cave Spring at mile 21.9 — the flooded cave you can paddle into — and finish at Pulltite (mile 26.3), where the takeout is a designed campground with a boat ramp and another walk-up spring." },
    { "id": 4, "name": "The middle", "from": "Round Spring", "to": "Two Rivers",
      "segment": "middle",
      "miles": "17", "time": "6–7 hr or overnight", "diff": "I–II", "crowd": "Moderate",
      "best": "Overnighters, bluffs and quiet",
      "best_for_tags": ["overnighters", "bluffs", "smallmouth"],
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769964210817-Jerktail-yAc9L945aNRrMoORTETdXu0ONpFM2I.png",
      "body": "Round Spring (a 50-foot-wide blue bowl — walk to it from the parking lot) feeds the river with another 26 million gallons per day. From here it's gravel bars, towering bluffs, and a steady current down past Jerktail Landing (free camping), Broadfoot, and Two Rivers, where the Jacks Fork joins." },
    { "id": 5, "name": "Powder Mill to Big Spring", "from": "Powder Mill", "to": "Big Spring",
      "segment": "lower",
      "miles": "31", "time": "2–3 days", "diff": "I", "crowd": "Quiet midweek",
      "best": "Multi-day, springs and miles",
      "best_for_tags": ["multi-day", "springs", "solitude"],
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769959365528-Roberts_Field_Stilt_House-wJZVnwELX7eEt7a0h9hwGp0QDjGZmr.png",
      "body": "The big-water lower Current. Pass Blue Spring (mile 57.4, 310 ft deep — Missouri's deepest), camp at Log Yard or Waymeyer, push through Van Buren Riverfront Park (mile 85.9), and finish at Big Spring (mile 90.2) — one of the largest single-outlet springs in the United States." },
    { "id": 6, "name": "Lower river", "from": "Big Spring", "to": "Doniphan",
      "segment": "lower",
      "miles": "≈30", "time": "1–2 days", "diff": "I", "crowd": "Sleepy",
      "best": "Long quiet drifts, anglers",
      "best_for_tags": ["motor-boaters", "anglers", "long-drifts"],
      "photo": null,
      "body": "Below Big Spring the river leaves ONSR at ~mile 105 and continues through the Mark Twain National Forest. Hickory Landing, Gooseneck, Bay Nothing, and Float Camp Recreation Area string along the south end before the river meets the Black River near Pocahontas, Arkansas." }
  ],
  "tldr": {
    "typical_distance": "8–17 mi day floats; 30+ mi multi-day",
    "best_for_beginners": "Akers Ferry → Pulltite (10 mi, 4–5 hr)",
    "primary_gauge": "Van Buren · USGS 07067000",
    "recommended_outfitter": "Akers Ferry Canoe Rental"
  },
  "segments": [
    { "id": "upper",
      "label": "Upper Current — Montauk to Akers",
      "character": "Cold, technical, and spring-stop heavy. The trout section above Cedargrove is fly-and-artificial-only; below it the springs run between Cedargrove and Akers passes Welch Spring's ruined hospital. Bony in late summer above Welch.",
      "best_for": ["fly-anglers", "experienced-paddlers", "spring-chasers", "history"],
      "section_ids": [1, 2] },
    { "id": "middle",
      "label": "Middle Current — Akers to Two Rivers",
      "character": "The postcard Current. Akers→Pulltite is the classic family float past Cave Spring; below Pulltite the river opens into the bluff-and-gravel-bar middle that paddlers come back for year after year.",
      "best_for": ["first-timers", "families", "tubers", "overnighters", "smallmouth"],
      "section_ids": [3, 4] },
    { "id": "lower",
      "label": "Lower Current — Two Rivers to Doniphan",
      "character": "Three different rivers below Two Rivers: the multi-day NPS run from Powder Mill through Big Spring, then the Mark Twain National Forest drift to Doniphan, and finally the slow water down to the Black River confluence near Pocahontas. Motorboats become legal as you go south.",
      "best_for": ["multi-day", "motor-boaters", "anglers", "solitude"],
      "section_ids": [5, 6] }
  ],
  "regulations": [
    { "topic": "Glass containers",
      "rule": "Prohibited on the river within ONSR. Glass on the water is a citation, no exceptions." },
    { "topic": "Caves & White-Nose Syndrome",
      "rule": "All ONSR caves are closed to entry on foot to slow White-Nose Syndrome among bats. Paddling into Cave Spring's mouth is allowed; walking in is not." },
    { "topic": "Gravel-bar camping",
      "rule": "Free, non-reservable, leave-no-trace on most NPS-managed gravel bars. Some bars are closed seasonally for nesting — signage at access points lists current closures." },
    { "topic": "Motorboat HP limits",
      "rule": "HP limits change by segment and season and have been updated. Check nps.gov/ozar before launching with a motor — do not rely on memorized numbers from older blog posts." },
    { "topic": "Alcohol",
      "rule": "Permitted on the river but never in glass. Rangers are active. The Current is a National Park unit — keep it accordingly." }
  ],
  "drive_times": [
    { "city": "St. Louis",   "hours": "~3 hr to Akers" },
    { "city": "Kansas City", "hours": "~4.5 hr to Akers" },
    { "city": "Springfield", "hours": "~2 hr to Akers" },
    { "city": "Memphis",     "hours": "~4 hr to Van Buren" }
  ],
  "nearby_attractions": [
    { "name": "Echo Bluff State Park",  "kind": "State Park",   "note": "Modern lodge, cabins, and trailhead at Sinking Creek — the best overnight base for the upper Current." },
    { "name": "Current River State Park","kind": "State Park",  "note": "Old Alton Box Company company town turned park, with day-use access between Akers and Round Spring." },
    { "name": "Montauk State Park",     "kind": "State Park",   "note": "Trout park at the headwaters; daily stocking, fly-and-artificial water above Cedargrove." },
    { "name": "Big Spring CCC District","kind": "Historic site","note": "Civilian Conservation Corps stonework around Big Spring — the dining lodge and cabins are NRHP-listed." },
    { "name": "Rocky Falls",            "kind": "Waterfall",    "note": "Shut-in cascade off the Stegall Mountain road, a quick stop on the drive in or out." },
    { "name": "Devil's Well",           "kind": "Cave",         "note": "Walk-down cave overlook — a roadside stop near Akers." },
    { "name": "Round Spring Cave",      "kind": "Cave",         "note": "Ranger-led tours from Round Spring campground in season." },
    { "name": "Alley Spring Mill",      "kind": "Historic site","note": "Red mill on the Jacks Fork — easy detour for a multi-river weekend." }
  ],
  "related_rivers": [
    { "slug": "jacks-fork",   "label": "Jacks Fork — clearer & smaller, also ONSR" },
    { "slug": "eleven-point", "label": "Eleven Point — wilder; the actual Wild & Scenic River" },
    { "slug": "meramec",      "label": "Meramec — closer to STL, party-river vibe" }
  ],
  "faq": [
    { "q": "How long does it take to float Akers to Pulltite?",
      "a": "Most parties take 4–5 hours including a swim stop. The 10-mile section averages a 2–3 mph current at normal levels." },
    { "q": "Can you camp on the Current River for free?",
      "a": "Yes. Gravel-bar camping is free and non-reservable on most NPS-managed sections with Leave No Trace ethics: 200 feet from springs and tributaries, no cutting live wood, pack out everything including ash. Some bars are closed seasonally for nesting — signage at access points lists current closures. The developed NPS campgrounds (Akers, Pulltite, Round Spring, Two Rivers, Big Spring) charge a small fee." },
    { "q": "What's the best section for a first-time float?",
      "a": "Akers Ferry to Pulltite (10 miles, 4–5 hours). Class I water, plenty of bailout points, well-known outfitters at both ends, and you'll pass Cave Spring on the way down." },
    { "q": "When is the Current River too high to float?",
      "a": "Watch the Van Buren gauge (USGS 07067000). Above roughly 7–8 ft most outfitters cancel rentals; the river runs muddy, fast, and pushes hard against bluffs and strainers. Use the live gauge widget on this page for the current reading and 14-day trend." },
    { "q": "Are motors allowed on the Current?",
      "a": "HP limits change by segment and season and have been updated recently. Check nps.gov/ozar before launching with a motor — older blog posts often quote outdated numbers." },
    { "q": "How cold is the water?",
      "a": "Year-round around 56–60°F. Spring-fed groundwater stays the same temperature whether it's January or July. Refreshing in August, hypothermic in March if you swim." },
    { "q": "Can I drink the spring water?",
      "a": "No. Even crystal-clear ONSR springs are not certified potable — carry your own water." },
    { "q": "Do I need a permit?",
      "a": "No permits for personal float trips on the NPS section. Outfitters and commercial trips have their own permitting. Trout fishing in Montauk requires a Missouri trout permit." }
  ]
}
$J$::jsonb,
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
