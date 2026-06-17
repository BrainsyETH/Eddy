-- 00132_niangua_river_guide_data.sql
-- Seeds the Niangua River guide post with structured guide_data, mirroring the
-- Current River template (00102). Idempotent.
--
-- Sources: EDDY_KNOWLEDGE.md, DB access_points mile markers, river_gauges
-- (USGS 06923250 Windyville is primary; 06923950 Tunnel Dam lower), Missouri
-- State Parks (Bennett Spring, Ha Ha Tonka), MDC big-springs (Bennett Spring =
-- Missouri #4), docs/river-guide-style.md.
--
-- Note: the Niangua currently has no linked nearby_services, so the on-page
-- directory will be sparse; the outfitter cluster at Bennett Spring is surfaced
-- in prose (sections, pro_tips, pre_launch_notes) instead. The lower river ends
-- at the privately owned Tunnel Dam (hydroelectric diversion) — flagged as a
-- hazard in pre_launch_notes and regulations.

DELETE FROM blog_posts WHERE slug = 'niangua-river-float-trips-missouri';

INSERT INTO blog_posts (
  slug, title, description, category,
  featured_image_url, og_image_url, meta_keywords,
  read_time_minutes, status, published_at, river_slug, guide_data
) VALUES (
  'niangua-river-float-trips-missouri',
  'Niangua River Float Trip Guide: Bennett Spring, Floats & Outfitters',
  'Float the Niangua near Bennett Spring with live conditions, mile-by-mile sections, the spring-fed base flow that keeps it floatable all summer, the Windyville gauge, the Tunnel Dam take-out, and a built-in trip planner.',
  'River Guides',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773883574106-Screenshot_2026-03-18_at_8.26.06_PM-KvQqnT3PZJtQeXmQ2woqigz7Jnui8B.png',
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773883574106-Screenshot_2026-03-18_at_8.26.06_PM-KvQqnT3PZJtQeXmQ2woqigz7Jnui8B.png',
  ARRAY['Niangua River float trip','Niangua canoe','Niangua kayak','Bennett Spring State Park','Lebanon Missouri float','Niangua water level','Windyville gauge','Tunnel Dam','Ha Ha Tonka','Niangua River access points','central Missouri float trip','smallmouth bass Niangua'],
  10,
  'published',
  '2026-06-17T12:00:00Z',
  'niangua',
  $J$
{
  "hero": {
    "eyebrow": "Niangua River · Bennett Spring country",
    "title_top": "Niangua River",
    "title_accent": "Float Trip Guide.",
    "lede": "Live conditions, the best float sections by mile marker, the spring that keeps it floating all summer, the outfitter cluster at Bennett Spring, the Tunnel Dam take-out, and a built-in trip planner — your complete guide to floating central Missouri's Niangua.",
    "photo_url": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773883574106-Screenshot_2026-03-18_at_8.26.06_PM-KvQqnT3PZJtQeXmQ2woqigz7Jnui8B.png",
    "mile_stats": [
      { "label": "Length",     "value": "76 mi" },
      { "label": "Difficulty", "value": "Class I" },
      { "label": "Region",     "value": "Central MO" },
      { "label": "Season",     "value": "Apr–Oct" },
      { "label": "Access",     "value": "MDC & resorts" },
      { "label": "Big spring", "value": "Bennett (MO #4)" }
    ]
  },
  "intro_html": "<p><strong>The Niangua is central Missouri's reliable float.</strong> Fed by Bennett Spring — one of the state's largest, at roughly 100 million gallons a day — it holds a dependable base flow that keeps it floatable in mid-summer when rain-fed Ozark streams like the Meramec, Huzzah, and Jacks Fork have dropped too low. Gentle Class I water, an outfitter town built around the spring, and an easy drive from Springfield, Lebanon, and Kansas City.</p>",
  "why_different": [
    { "strong": "Floats when other rivers don't.", "body": "Bennett Spring's steady, cold flow gives the Niangua a base level that rain-fed rivers can't match. When the forecast is dry and everything else is bony, the Niangua is usually still good." },
    { "strong": "Built for first-timers.", "body": "Mostly Class I below Bennett Spring, with a tight cluster of outfitters and riverside campgrounds that make rentals and shuttles simple." },
    { "strong": "Trout-park headwaters.", "body": "Bennett Spring State Park is one of Missouri's four trout parks — daily stocking, a historic lodge, and the cold spring that defines the river." },
    { "strong": "Central, not southern.", "body": "It fills the gap between the metro rivers and the deep Ozarks — close to Springfield and Lebanon, near the Lake of the Ozarks and Ha Ha Tonka State Park." }
  ],
  "sections": [
    { "id": 1, "name": "The upper river", "from": "Moon Valley", "to": "Bennett Spring",
      "miles": "8", "time": "3–4 hr", "diff": "I", "crowd": "Quiet",
      "best": "Solitude, anglers, half-day floats",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773885665110-Screenshot_2026-03-18_at_9.00.49_PM-imK3SGj3Y0OBCbgf7LKhUKAKtyAcAY.png",
      "segment": "upper",
      "from_slug": "moon-valley", "to_slug": "bennett-spring-access",
      "best_for_tags": ["solitude","anglers","half-day"],
      "body": "Above Bennett Spring the Niangua is smaller and rain-dependent. From Moon Valley (mile 22.3) past Cat Hollow (mile 26.5) down to the Bennett Spring access (mile 30.2), it's a quiet, pretty half-day — but it can get bony in summer before the spring's flow joins the river." },
    { "id": 2, "name": "The Bennett Spring run", "from": "Bennett Spring", "to": "Prosperine",
      "miles": "10", "time": "4–5 hr", "diff": "I", "crowd": "Busy summers",
      "best": "First-timers, families",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773883683406-Screenshot_2026-03-18_at_8.27.56_PM-eGuIRDqRYl48mnj12PHcL64vYBzd6F.png",
      "segment": "main",
      "from_slug": "bennett-spring-access", "to_slug": "prosperine",
      "best_for_tags": ["first-timers","families","summer"],
      "body": "The heart of the river. Below Bennett Spring's cold inflow the Niangua runs reliable and beginner-friendly. This stretch holds nearly every outfitter and riverside campground — Niangua River Oasis, Big Bear, Maggard Canoe, Mountain Creek — past Barclay Conservation Area (mile 36.5) down to Prosperine (mile 40)." },
    { "id": 3, "name": "Prosperine to Berry Bluff", "from": "Prosperine", "to": "Berry Bluff",
      "miles": "16", "time": "Full day or overnight", "diff": "I", "crowd": "Moderate",
      "best": "Overnighters, smallmouth anglers",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773886269349-Screenshot_2026-03-18_at_9.11.02_PM-phYdeuq0VfX6qRQeIEmPUVIhJJqIiu.png",
      "segment": "lower",
      "from_slug": "prosperine", "to_slug": "berry-bluff-access",
      "best_for_tags": ["overnighters","smallmouth","solitude"],
      "body": "The quieter middle-lower river past Lead Mine (mile 53.9) and Herrick Ford to Berry Bluff (mile 56.1), the river's prettiest limestone wall. Fewer people, good smallmouth fishing, and gravel bars for an overnight." },
    { "id": 4, "name": "Berry Bluff to Tunnel Dam", "from": "Berry Bluff", "to": "Tunnel Dam",
      "miles": "10", "time": "Full day", "diff": "I", "crowd": "Sleepy",
      "best": "Quiet drifts — but know your take-out",
      "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773886562660-Screenshot_2026-03-18_at_9.15.28_PM-0P39ym4BtpxkBqj8HdcH8SJd0nahMh.png",
      "segment": "lower",
      "from_slug": "berry-bluff-access", "to_slug": "tunnel-dam-boat-launch",
      "best_for_tags": ["solitude","long-drifts","anglers"],
      "body": "Sleepy, lake-influenced water down to Tunnel Dam (mile 66) — a privately owned hydroelectric diversion. Take out at the marked Tunnel Dam access; do not paddle toward the dam itself. Below it the river runs on toward Ha Ha Tonka State Park and the Lake of the Ozarks." }
  ],
  "springs": [
    { "name": "Bennett Spring", "mile": "30", "note": "Missouri's 4th-largest spring at about 100 million gallons a day, at Bennett Spring State Park — one of the state's four trout parks, stocked daily in season. Its cold flow is what makes the Niangua reliable below this point.", "rank": "MO #4", "flow": "~100 MGD" },
    { "name": "Berry Bluff", "mile": "56", "note": "The river's standout limestone bluff, a quiet-water landmark on the lower float." },
    { "name": "Ha Ha Tonka Spring & Castle", "mile": "79.5", "note": "An enormous spring feeding the Lake of the Ozarks beneath the stone 'castle' ruins at Ha Ha Tonka State Park — a worthwhile off-river stop at the river's end." }
  ],
  "seasons": [
    { "m": "Mar–Apr", "t": "High and cold.", "note": "Spring flows up; Bennett Spring's trout season opens March 1." },
    { "m": "May–Jun", "t": "Sweet spot.", "note": "Warm air, reliable water, the busy season getting underway." },
    { "m": "Jul–Aug", "t": "Reliable when others are low.", "note": "Bennett Spring keeps it floating. Busy around the spring on weekends — reserve ahead." },
    { "m": "Sep–Oct", "t": "Quiet and pretty.", "note": "Thinner crowds, fall color; still floats thanks to the spring." },
    { "m": "Nov–Feb", "t": "Floatable below Bennett.", "note": "Cold and private. Pack like you're winter camping." }
  ],
  "what_to_bring": [
    "PFDs (legally required — one per person, worn by anyone under 7).",
    "Dry bag for keys, phone, ID, and a layer — the spring water is cold.",
    "Drinking water (a gallon per person per day in summer) — there's no potable water on the river.",
    "Reef-safe sunscreen and a hat.",
    "Hard-soled water shoes for rocky gravel bars.",
    "A plan for your lower-river take-out if you're floating toward Tunnel Dam.",
    "Trash bag — pack out everything you bring in."
  ],
  "pro_tips": [
    { "strong": "Reliable when others are low.", "body": "Bennett Spring's base flow keeps the Niangua floatable when the Meramec, Huzzah, and Jacks Fork have dropped too low. A smart summer fallback." },
    { "strong": "Take out above Tunnel Dam.", "body": "The lower river runs to a privately owned hydroelectric diversion dam near mile 66. Take out at the marked access; never approach the dam." },
    { "strong": "Base at Bennett Spring.", "body": "Most outfitters, rentals, and riverside campgrounds cluster between Bennett Spring and Prosperine — the easiest place to set up a first trip." },
    { "strong": "Mind the trout water up top.", "body": "Bennett Spring State Park is a busy trout park; the cold park water is fly- and tag-only and separate from the float zone." }
  ],
  "callouts": {
    "hero":   { "live_quote": true, "tone": "good" },
    "footer": { "tone": "warn", "quote": "The Niangua is gentle, but the lower river runs down to Tunnel Dam — a hydroelectric diversion. Take out at the marked access above it; do not paddle toward the dam. And the water below Bennett Spring is cold year-round, so keep your PFD on even on a calm day." }
  },
  "tldr": {
    "typical_distance": "6–12 mi day floats; overnight to 25+ mi",
    "best_for_beginners": "Bennett Spring → Prosperine (10 mi)",
    "primary_gauge": "Windyville · USGS 06923250",
    "recommended_outfitter": "Niangua River Oasis"
  },
  "segments": [
    { "id": "upper", "label": "Upper Niangua — above Bennett Spring",
      "character": "Above Bennett Spring the river is smaller and rain-dependent. Pretty, quiet half-day water from Moon Valley toward the spring, but it can get low in summer before Bennett's flow joins.",
      "best_for": ["solitude","anglers","half-day"],
      "section_ids": [1] },
    { "id": "main", "label": "Bennett Spring to Prosperine — the outfitted heart",
      "character": "Below Bennett Spring's ~100 million gallons a day the Niangua runs cold, clear, and reliable. This is the busy, beginner-friendly stretch where nearly every outfitter and riverside campground sits.",
      "best_for": ["first-timers","families","summer"],
      "section_ids": [2] },
    { "id": "lower", "label": "Lower Niangua — Prosperine to Tunnel Dam",
      "character": "Quieter water past limestone bluffs toward the historic Tunnel Dam and the Lake of the Ozarks. Fewer people and good smallmouth fishing — but know your take-out: the lower river ends at a hydroelectric diversion dam.",
      "best_for": ["overnighters","anglers","solitude"],
      "section_ids": [3, 4] }
  ],
  "regulations": [
    { "topic": "Bennett Spring trout park", "rule": "Bennett Spring State Park is a Missouri trout park: a daily trout tag is required to fish the park water, with fly- and lure-only zones and a catch-and-release winter season.", "url": "https://mostateparks.com/park/bennett-spring-state-park" },
    { "topic": "Tunnel Dam — take out above it", "rule": "The lower river ends at a privately owned hydroelectric diversion dam near mile 66. Use the marked take-out above the dam; do not approach it. Flows below can change with power generation.", "url": "https://mostateparks.com/park/ha-ha-tonka-state-park" },
    { "topic": "Camping & access", "rule": "Most riverside camping is at private resorts between Bennett Spring and Prosperine; MDC conservation accesses are day-use. Pack out everything.", "url": "https://mdc.mo.gov/fishing/where-to-fish" },
    { "topic": "Fishing limits", "rule": "Standard MDC black bass and goggle-eye length and daily limits apply on the Niangua. Check current regulations before keeping fish.", "url": "https://mdc.mo.gov/fishing/regulations" }
  ],
  "drive_times": [
    { "city": "Springfield", "hours": "~1 hr to Bennett Spring" },
    { "city": "Kansas City", "hours": "~2.5 hr to Bennett Spring" },
    { "city": "St. Louis", "hours": "~3 hr to Bennett Spring" },
    { "city": "Columbia", "hours": "~1.5 hr to Bennett Spring" }
  ],
  "nearby_attractions": [
    { "name": "Bennett Spring State Park", "kind": "State Park", "note": "One of Missouri's four trout parks — daily stocking, a historic CCC-era lodge, the nature center, and the spring that feeds the river.", "url": "https://mostateparks.com/park/bennett-spring-state-park" },
    { "name": "Ha Ha Tonka State Park", "kind": "State Park", "note": "Stone 'castle' ruins above a huge spring, a natural bridge, and sinkholes at the Niangua arm of the Lake of the Ozarks.", "url": "https://mostateparks.com/park/ha-ha-tonka-state-park" },
    { "name": "Lake of the Ozarks", "kind": "Lake", "note": "The Niangua arm of the lake begins below Tunnel Dam — boating, fishing, and lodging a short drive from the float zone.", "url": "https://mostateparks.com/park/lake-ozarks-state-park" }
  ],
  "related_rivers": [
    { "slug": "current", "label": "Current — the spring-fed crown jewel of the Ozarks" },
    { "slug": "meramec", "label": "Meramec — St. Louis's home float, rain-fed and flashy" }
  ],
  "pre_launch_notes": [
    { "strong": "Reliable below Bennett Spring.", "body": "The spring's cold flow keeps the Niangua floatable when rain-fed Ozark streams are too low — a smart summer fallback. Above the spring it can be bony." },
    { "strong": "Know your take-out near Tunnel Dam.", "body": "The lower river ends at a hydroelectric diversion dam near mile 66. Take out at the marked access above it; never approach the dam." },
    { "strong": "Outfitters cluster at Bennett Spring.", "body": "Rentals, shuttles, and riverside campgrounds concentrate between Bennett Spring and Prosperine — the easiest place to base a first trip." }
  ],
  "faq": [
    { "q": "How long does it take to float Bennett Spring to Prosperine?", "a": "About 4–5 hours for the 10-mile run at normal flow — the classic family day float on the Niangua." },
    { "q": "Is the Niangua good for beginners?", "a": "Yes. Below Bennett Spring it's mostly Class I with a reliable, gentle current and a tight cluster of outfitters — one of the most beginner-friendly floats in the state." },
    { "q": "Why float the Niangua instead of another river?", "a": "Bennett Spring gives it a dependable base flow, so it stays floatable in mid-summer when rain-fed rivers like the Meramec, Huzzah, and Jacks Fork drop too low." },
    { "q": "What is at Bennett Spring?", "a": "One of Missouri's four trout parks — daily trout stocking, a historic lodge, a nature center, and the big spring that feeds the river. A trout tag is required to fish the park water." },
    { "q": "What is Tunnel Dam?", "a": "A privately owned hydroelectric diversion dam on the lower river near mile 66. Take out at the marked access above it — never paddle toward the dam, and be aware flows below can change with power generation." },
    { "q": "How do I check Niangua water levels?", "a": "Use the live gauge widget on this page. Windyville (USGS 06923250) is the primary gauge; the Tunnel Dam gauge (06923950) reads the lower river." },
    { "q": "Can I camp along the Niangua?", "a": "Yes — numerous private riverside campgrounds and outfitters between Bennett Spring and Prosperine offer camping with shuttle service. MDC accesses are day-use." },
    { "q": "How cold is the water?", "a": "Below Bennett Spring it's cold year-round — around 56 °F at the spring — and warms downstream. The upper river above the spring is warmer in summer." }
  ]
}
$J$::jsonb
);
