-- 00130_eleven_point_river_guide_data.sql
-- Seeds the Eleven Point River guide post with structured guide_data, mirroring
-- the Current River template (00102). Idempotent.
--
-- Sources: EDDY_KNOWLEDGE.md, DB access_points mile markers, river_gauges
-- (USGS 07071500 Bardley is primary), USFS Mark Twain National Forest, the
-- National Wild & Scenic Rivers system (rivers.gov), MDC big-springs (Greer
-- Spring = Missouri #2), docs/river-guide-style.md.
--
-- Style note: the Eleven Point IS on the National Wild & Scenic Rivers list
-- (the Current is NOT). It is USFS-managed, not NPS. Greer Spring is bounded as
-- "Missouri's 2nd-largest spring," never "largest."

DELETE FROM blog_posts WHERE slug = 'eleven-point-river-float-trips-missouri';

INSERT INTO blog_posts (
  slug, title, description, category,
  featured_image_url, og_image_url, meta_keywords,
  read_time_minutes, status, published_at, river_slug, guide_data
) VALUES (
  'eleven-point-river-float-trips-missouri',
  'Eleven Point River Float Trip Guide: Greer Spring, Floats & Outfitters',
  'Float Missouri''s Wild & Scenic Eleven Point with live conditions, mile-by-mile sections, Greer Spring, USFS float camps, the Bardley gauge, the outfitter directory, and a built-in trip planner.',
  'River Guides',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772685020904-Screenshot_2026-03-04_at_8.27.42_PM-mJ3OpnZe9jVmj3ROMqwZya2bjj3471.png',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772685020904-Screenshot_2026-03-04_at_8.27.42_PM-mJ3OpnZe9jVmj3ROMqwZya2bjj3471.png',
  ARRAY['Eleven Point River float trip','Eleven Point canoe','Eleven Point kayak','Greer Spring','Wild and Scenic River Missouri','Alton Missouri float','USFS float camps','Eleven Point water level','Bardley gauge','Turner Mill','Mark Twain National Forest','Missouri float trip'],
  11,
  'published',
  '2026-06-17T12:00:00Z',
  'eleven-point',
  $J$
{
  "hero": {
    "eyebrow": "Eleven Point River · National Wild & Scenic River",
    "title_top": "Eleven Point River",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best float sections by mile marker, Greer Spring, the USFS float camps, the outfitter directory, and a built-in trip planner — your complete guide to floating Missouri's wildest Wild & Scenic river.",
    "photo_url": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772685020904-Screenshot_2026-03-04_at_8.27.42_PM-mJ3OpnZe9jVmj3ROMqwZya2bjj3471.png",
    "mile_stats": [
      { "label": "W&S length", "value": "44 mi" },
      { "label": "Difficulty", "value": "Class I–II" },
      { "label": "Region",     "value": "Ozarks" },
      { "label": "Season",     "value": "Jun–Sep" },
      { "label": "Manager",    "value": "USFS" },
      { "label": "Big spring", "value": "Greer (MO #2)" }
    ]
  },
  "intro_html": "<p><strong>The Eleven Point is the actual Wild & Scenic River.</strong> One of the original eight streams Congress designated in 1968, it runs remote and uncrowded through the Mark Twain National Forest, managed by the U.S. Forest Service. Greer Spring — Missouri's 2nd-largest spring at roughly 222 million gallons a day — doubles the river at its midpoint, turning a small Ozark headwater into cold, clear, reliable float water. (Its sister the Current, despite the name, is <em>not</em> on the Wild & Scenic list.)</p>",
  "why_different": [
    { "strong": "Genuinely Wild & Scenic.", "body": "A federally designated Wild & Scenic River since 1968, USFS-managed, with first-come float camps instead of crowds. This is the most wilderness-feeling float of Missouri's well-known rivers." },
    { "strong": "Greer Spring changes everything.", "body": "Above Greer the river is a small, rain-dependent headwater. Below it — fed by ~222 million gallons a day — the Eleven Point roughly doubles and runs cold and clear right through summer." },
    { "strong": "Remote, with few bailouts.", "body": "Far fewer outfitters and access points than the Current. Long stretches with no road, no cell service, and no help nearby. Plan your shuttle and your water." },
    { "strong": "Wildlife you'll actually see.", "body": "You may spot bald eagles, great blue herons, and river otters along some of the least-developed water in the state." }
  ],
  "sections": [
    { "id": 1, "name": "The upper river", "from": "Thomasville", "to": "Greer",
      "miles": "16", "time": "Long day", "diff": "I–II", "crowd": "Quiet",
      "best": "Solitude, anglers, high-water paddlers",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772685081700-Screenshot_2026-03-04_at_10.31.15_PM-DubCwQc3t01npZbosQkSyZcCm5xT0B.png",
      "segment": "upper",
      "from_slug": "thomasville", "to_slug": "greer-spring",
      "best_for_tags": ["solitude","anglers","spring-runoff"],
      "body": "The intimate headwaters. From Thomasville (mile 0.1) the river is small and twisty past Cane Bluff (mile 9.3) down to the Greer access (mile 16.6). It needs rain or snowmelt to float cleanly and can be bony in summer — lovely when it has water, a drag when it doesn't." },
    { "id": 2, "name": "The Greer Spring run", "from": "Greer", "to": "Turner Mill",
      "miles": "5", "time": "2–3 hr", "diff": "I", "crowd": "Moderate",
      "best": "Half-day floats, first-timers below Greer",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772685020904-Screenshot_2026-03-04_at_8.27.42_PM-mJ3OpnZe9jVmj3ROMqwZya2bjj3471.png",
      "segment": "lower",
      "from_slug": "greer-spring", "to_slug": "turner-mill-south",
      "best_for_tags": ["half-day","spring-run","scenery"],
      "body": "The river transforms. About a mile below the Greer access the Greer Spring Branch pours in and roughly doubles the flow — cold, clear, and fast. Drift down to Turner Mill (mile 21.5), where a large iron mill wheel still stands on river-right above a small spring." },
    { "id": 3, "name": "The float-camp run", "from": "Turner Mill", "to": "Riverton",
      "miles": "14", "time": "Full day or overnight", "diff": "I", "crowd": "Moderate",
      "best": "Overnighters, the classic Eleven Point trip",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772684852602-Screenshot_2026-03-04_at_10.27.26_PM-8MkQ1GHRA2wbnF1hkulsVJ3WhsPiJx.png",
      "segment": "lower",
      "from_slug": "turner-mill-south", "to_slug": "riverton",
      "best_for_tags": ["overnighters","float-camps","wildlife"],
      "body": "The heart of the Wild & Scenic stretch. Pass Whitten (mile 28), the Whites Creek float camp (mile 28.5), and Boze Mill Spring (mile 33.4) — a blue pool and old mill — down to the Riverton bridge (mile 35.6) at Highway 160. String the first-come USFS float camps together for a quintessential Ozark overnight." },
    { "id": 4, "name": "The quiet finish", "from": "Riverton", "to": "The Narrows",
      "miles": "9", "time": "3–4 hr", "diff": "I", "crowd": "Sleepy",
      "best": "Quiet drifts, the last Wild & Scenic miles",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772686521656-Screenshot_2026-03-04_at_10.55.06_PM-WctWEEH2y7DyYG9Rg2UfcKAzJsnUYk.png",
      "segment": "lower",
      "from_slug": "riverton", "to_slug": "the-narrows-highway-142",
      "best_for_tags": ["solitude","long-drifts","anglers"],
      "body": "Below Riverton the river widens and slows past the Morgan Spring float camp (mile 43.3) to The Narrows at Highway 142 (mile 44.3) — the downstream end of the Wild & Scenic designation. Sleepy, pretty water; the McDowell and Myrtle accesses extend the trip further south." }
  ],
  "springs": [
    { "name": "Greer Spring", "mile": "~17", "note": "Missouri's 2nd-largest spring. It enters through the Greer Spring Branch about a mile below the access and roughly doubles the river — colder, clearer, and faster below the confluence. The spring itself is a 1.1-mile hike down from Highway 19.", "rank": "MO #2", "flow": "~222 MGD avg" },
    { "name": "Turner Mill (Turner Spring)", "mile": "21.5", "note": "An old mill site on river-right where a large iron overshot wheel still stands, fed by a small spring. A popular stop and float camp." },
    { "name": "Boze Mill Spring", "mile": "33.4", "note": "A blue spring pool and the remains of an old mill, a short walk up from the float camp on river-right." }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "High and cold.", "note": "Partly rain-fed, so spring storms bring fast rises and murky water." },
    { "m": "May–Jun", "t": "Greening up.", "note": "The lower river below Greer is clear and reliable; upper river still has water." },
    { "m": "Jun–Sep", "t": "Prime season.", "note": "Greer Spring keeps the lower river floating when other Ozark streams go low. Reserve shuttles ahead." },
    { "m": "Sep–Oct", "t": "Quiet and colorful.", "note": "Thin crowds, fall color, the best wildlife watching of the year." },
    { "m": "Nov–Feb", "t": "Floatable below Greer.", "note": "Cold, private, and remote — pack like you're winter camping and tell someone your plan." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, ID, and a fleece — the spring water is cold even in July.",
    "More drinking water than you think — a gallon per person per day; springs aren't safe to drink and services are far.",
    "A downloaded map. This is remote forest with long no-signal stretches.",
    "Reef-safe sunscreen, a hat, and hard-soled water shoes.",
    "Extra food and a first-aid kit — help can be hours away.",
    "Trash bag — float camps are pack-in, pack-out."
  ],
  "pro_tips": [
    { "strong": "Put in at Greer for reliable water.", "body": "Below Greer Spring the river roughly doubles and floats all summer; above it can be too low. Greer to Turner Mill or Riverton is the classic." },
    { "strong": "Float camps are first-come.", "body": "USFS riverside camps (Whites Creek, Greenbriar, Morgan Spring, and more) aren't reservable. Arrive early on summer weekends and have a backup gravel bar in mind." },
    { "strong": "Line up your own shuttle.", "body": "Far fewer outfitters than the Current. Book a shuttle ahead (Richards Canoe Rental, Hufstedlers) or stage two vehicles." },
    { "strong": "Watch for wildlife.", "body": "You may spot bald eagles, herons, and river otters — keep a respectful distance and a camera handy." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The Eleven Point is remote, and the optimal window at Bardley is tight — roughly 2.0–3.4 ft. Above that the river pushes hard against bluffs and strainers and help is far away. Float it for the solitude, but respect the distance from the nearest town. PFD on." }
  },
  "tldr": {
    "typical_distance": "5–19 mi day floats; multi-day to 44 mi",
    "best_for_beginners": "Greer → Turner Mill (5 mi, 2–3 hr)",
    "primary_gauge": "Bardley · USGS 07071500",
    "recommended_outfitter": "Richards Canoe Rental"
  },
  "segments": [
    { "id": "upper", "label": "Upper Eleven Point — Thomasville to Greer",
      "character": "Small, intimate, and dependent on rain or snowmelt. The river above Greer Spring is a narrow Ozark headwater that can be bony by mid-summer — lovely when it has water, a drag when it doesn't.",
      "best_for": ["solitude","anglers","spring-runoff"],
      "section_ids": [1] },
    { "id": "lower", "label": "Lower Eleven Point — Greer Spring to The Narrows",
      "character": "Below Greer Spring's ~222 million gallons a day the river roughly doubles — cold, clear, and reliable through summer. This is the Wild & Scenic heart: mill ruins, blue springs, first-come float camps, and some of the wildest water in the state.",
      "best_for": ["overnighters","float-camps","wildlife","summer"],
      "section_ids": [2, 3, 4] }
  ],
  "regulations": [
    { "topic": "Wild & Scenic designation", "rule": "One of the original eight National Wild & Scenic Rivers (1968), managed by the USFS Mark Twain National Forest from Thomasville to Highway 142. Keep it wild — pack out everything.", "url": "https://www.rivers.gov/rivers/eleven-point.php" },
    { "topic": "Float camps", "rule": "USFS float camps are first-come, first-served — not reservable. Use established sites, build fires only below the high-water line on gravel bars, and follow current fire restrictions.", "url": "https://www.fs.usda.gov/mtnf" },
    { "topic": "Greer Spring Branch", "rule": "The Greer Spring Branch is a day-use natural area — no camping at the spring. The spring is a 1.1-mile hike down from Highway 19.", "url": "https://www.fs.usda.gov/mtnf" },
    { "topic": "Leave No Trace", "rule": "Carry out all trash, keep 200 ft from the spring branch and tributaries when camping, and don't cut live wood. There's no trash service on the river.", "url": "https://www.fs.usda.gov/mtnf" }
  ],
  "drive_times": [
    { "city": "St. Louis", "hours": "~3.5 hr to Greer" },
    { "city": "Kansas City", "hours": "~5 hr to Greer" },
    { "city": "Springfield", "hours": "~2 hr to Greer" },
    { "city": "Memphis", "hours": "~3.5 hr to Greer" }
  ],
  "nearby_attractions": [
    { "name": "Greer Spring", "kind": "Natural area", "note": "Missouri's 2nd-largest spring, reached by a 1.1-mile hike down from Highway 19 — a worthwhile stop even if you're not floating.", "url": "https://www.fs.usda.gov/mtnf" },
    { "name": "Grand Gulf State Park", "kind": "State Park", "note": "Missouri's 'Little Grand Canyon' — a collapsed cave system of sheer dolomite walls near Thayer, a short drive south.", "url": "https://mostateparks.com/park/grand-gulf-state-park" },
    { "name": "Irish Wilderness", "kind": "Wilderness", "note": "A 16,500-acre USFS wilderness on the river's east side — the largest in Missouri's national forest, with backcountry trails.", "url": "https://www.fs.usda.gov/mtnf" }
  ],
  "related_rivers": [
    { "slug": "current", "label": "Current — bigger, spring-fed, and family-friendly" },
    { "slug": "jacks-fork", "label": "Jacks Fork — wild and clear, the ONSR sister" }
  ],
  "pre_launch_notes": [
    { "strong": "Put in at Greer for reliable water.", "body": "The river above Greer Spring can be too low in summer; below Greer it roughly doubles and floats through the season." },
    { "strong": "This is remote — plan your shuttle.", "body": "Far fewer outfitters than the Current. Line one up ahead (Richards Canoe Rental, Hufstedlers) or run two cars, and carry a downloaded map." },
    { "strong": "Float camps are first-come.", "body": "USFS riverside camps aren't reservable. Arrive early on summer weekends and keep a backup gravel bar in mind." }
  ],
  "faq": [
    { "q": "How long does it take to float Greer to Turner Mill?", "a": "About 2–3 hours for the 5-mile run below Greer Spring — a classic half-day and the easiest introduction to the river." },
    { "q": "Is the Eleven Point good for beginners?", "a": "The lower river below Greer Spring is Class I and reliable, fine for confident beginners. But it's remote with few bailout points, so it's not the place for a first-ever paddle — go with someone experienced." },
    { "q": "Can you camp along the Eleven Point?", "a": "Yes. The USFS maintains first-come float camps along the Wild & Scenic stretch, and gravel-bar camping is allowed. Nothing is reservable — pack out all trash and follow fire restrictions." },
    { "q": "Where is Greer Spring?", "a": "It enters about a mile below the Greer access through the Greer Spring Branch. The spring itself — Missouri's 2nd-largest at roughly 222 million gallons a day — is a 1.1-mile hike down from Highway 19." },
    { "q": "When is the Eleven Point too high to float?", "a": "Above roughly 3.4 ft at the Bardley gauge (USGS 07071500) the optimal window closes and the river pushes hard against bluffs and strainers. The trend matters more than the single number — use the live gauge widget on this page." },
    { "q": "Is the Eleven Point really a Wild & Scenic River?", "a": "Yes — one of the original eight, designated in 1968 and managed by the U.S. Forest Service. Note that its sister the Current River, despite ONSR protection, is not on the Wild & Scenic list." },
    { "q": "Are there outfitters on the Eleven Point?", "a": "Fewer than the Current. Richards Canoe Rental and Hufstedlers serve the Alton and Greer area — book rentals and shuttles ahead, especially on summer weekends." },
    { "q": "How cold is the water?", "a": "Below Greer Spring it stays cold year-round — mid-50s °F — because the spring dominates the flow. The upper river warms more in summer." }
  ]
}
$J$::jsonb
);
