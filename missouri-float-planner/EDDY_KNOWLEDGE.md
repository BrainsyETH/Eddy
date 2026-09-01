# Eddy's Knowledge Base

This file is Eddy's local knowledge — the stuff you can't get from a gauge reading.
Add to it anytime. The AI update generator parses this by section and injects only
the relevant parts into each Haiku call, so it stays efficient even as it grows.

## Format Rules

- **General** section: loaded into every prompt call (keep it concise)
- **River sections**: only loaded when generating updates for that specific river
- **Subsections** (e.g., `### Upper Current`): matched to `river_sections.section_slug`
- **Anchor every river and subsection heading** with `{#slug}`. The slug must match
  `rivers.slug` / `river_sections.section_slug` exactly. Without an anchor the slug is
  guessed from the heading text, and the guess strips a trailing "River"/"Creek" —
  which is wrong for `big-river`, `bryant-creek`, `kings-river`, `war-eagle-creek`,
  `crooked-creek`, `caddo-river`, `spring-river`. A wrong slug fails **silently**:
  Eddy writes the river up from the General primer alone and sounds just as sure.
- Use bullet points for individual knowledge items
- Keep each item to 1-3 sentences — Eddy synthesizes, he doesn't recite
- **Don't restate numeric thresholds** (optimal ranges, danger levels) here. The float
  ladder is already in the prompt from `river_gauges`, it gets recalibrated, and a
  stale copy in this file just gives Eddy two numbers to choose between. Say what the
  number *means* instead. Where a number is unavoidable, name its unit and its gauge —
  most Eddy ladders are cfs, some are gauge height in feet, and mixing them is how a
  "3.0 ft optimal" ends up printed next to a reading of 600 cfs.

---

## General

Every Ozarks river responds differently to rainfall depending on its spring inputs and
watershed size. What matters most for floaters is whether the water is **rising**, **falling**,
or **stable**. Rivers with large spring inputs (Current, Eleven Point, Big Piney, Niangua,
North Fork, Spring River in Arkansas) hold steadier base flows and change slowly. Rivers
driven mainly by rainfall (Meramec, Huzzah, Courtois, Bourbeuse, and every Arkansas river
except the Spring) can drop fast in summer and spike hard after storms. Jacks Fork behaves
like a rainfall-driven stream above Alley Spring but is stabilized by springs below it.

- Float season runs roughly **April through October**, with peak traffic Memorial Day through Labor Day.
- Water temperatures on spring-fed rivers stay cold year-round (mid-50s to low 60s F).
- Most Ozark rivers are Class I-II. Serious whitewater is rare, but strainers (downed trees across the channel) are the #1 hazard.
- After heavy rain, rivers may become less clear and turn muddy. 
- Weekends in June and July are the busiest. For a quieter float, go mid-week or choose Eleven Point or Big Piney over Current or Meramec.
- Always check with local outfitters before launching — they know about recent blowdowns, low-water bridges, and temporary hazards that gauges can't tell you.
- Missouri conservation areas along rivers typically have free access. National Park Service areas (Current, Jacks Fork, Buffalo) may have fees at developed access points.
- Take into account water level trends. A water level trending up should proceed with more caution then if it were trending down. Always seek guidance from local outfitters and authorities.
- **Recovery after high water**: Rivers with large spring inputs (Current, Niangua, Eleven Point) recover slowly over days. Rivers with smaller watersheds and less spring input (Huzzah, Courtois, upper Jacks Fork) can go from flooded to optimal quickly once rain stops. Watch the gauge trend — a steep drop means conditions are changing fast.
- **Not every river here is an Ozark river.** The Arkansas rivers (Buffalo, Kings, War Eagle, Crooked, Mulberry) drain the Boston Mountains: steeper, flashier, rain-driven, with a season that usually ends by midsummer. The Caddo is a **Ouachita** Mountain river, a different range with a different personality — the Ozarks spring-input reasoning does not apply to it at all.
- **Low water does not mean the same thing everywhere.** On big or dam-influenced water (lower Gasconade, lower Black, lower Buffalo, Big River's long pools) low water mostly costs you speed. On small rain-fed streams (Crooked, War Eagle, upper Bryant, upper Bourbeuse) low water genuinely ends the trip.
- **Low-head dams and low-water bridges are the deadliest structures in this set** — they appear on Big River, the James, War Eagle, the Spring River in both states, and across the Gasconade, Bryant, and Bourbeuse. Unlike rapids they get **more** dangerous as flow rises, and a rising river is never a reason to run one. Portage.

### Nearest Towns to Access Points

The Ozarks are rural. Most river access points have no services (no restaurants, gas, groceries). Here are the nearest towns for food, fuel, and supplies:

- **Current River (upper)**: Montauk, Cedar Grove, Akers Ferry → nearest town is **Salem** (20-30 min west). Baptist Camp is near Licking.
- **Current River (middle)**: Pulltite, Round Spring → nearest town is **Eminence** (30-40 min south). Akers Ferry is about 40 min north of Eminence.
- **Current River (lower)**: Two Rivers, Big Spring → nearest town is **Van Buren** (10-15 min).
- **Jacks Fork**: Alley Spring, Eminence, Two Rivers → **Eminence** is the hub.
- **Eleven Point**: Greer Spring, Turner Mill, Riverton → nearest town is **Alton** (15-30 min).
- **Meramec River**: → **Steelville** and **Sullivan** are the main towns. Meramec State Park is between them.
- **Huzzah / Courtois Creeks**: → **Steelville** is the hub for both.
- **Big Piney River**: → **Licking** (north) and **Houston** (south). Fort Leonard Wood / **Waynesville** is nearby.
- **Gasconade River**: → **Waynesville** and **Dixon** for the upper. **Gasconade** (town) for the lower.
- **Niangua River**: → **Lebanon** and **Bennett Spring** area.
- **Black River**: → **Lesterville** and **Annapolis** for the upper float; **Poplar Bluff** below Clearwater Dam.
- **Bourbeuse River**: → **Union** on the lower river. The upper river runs through farm country with almost no services.
- **Big River**: → **De Soto**, **Potosi**, and **Bonne Terre**. Washington State Park is the float hub.
- **St. Francis River**: → **Fredericktown** for the shut-ins; **Piedmont** and Sam A. Baker State Park lower down.
- **Bryant Creek**: → **Ava** to the north, **Gainesville** to the south. Nothing along the creek itself.
- **North Fork River**: → **West Plains**, **Gainesville**, **Dora**, **Tecumseh**. Cell service through the corridor is patchy.
- **James River**: → **Galena** and **Crane** at the take-out end; **Springfield** and **Nixa** upstream.
- **Spring River (Missouri)**: → **Carthage** and **Sarcoxie**; **Joplin** is the nearest city.
- **Buffalo National River**: → **Ponca** and **Jasper** up top, **Harrison** as the regional hub, **Yellville** and Gilbert lower down.
- **Kings River**: → **Berryville**, **Eureka Springs**, **Marble**.
- **War Eagle Creek**: → **Huntsville**, **Springdale**, **Rogers**.
- **Crooked Creek**: → **Yellville**, **Harrison**, **Cotter**.
- **Spring River (Arkansas)**: → **Mammoth Spring**, **Hardy**, **Cherokee Village**.
- **Mulberry River**: → **Ozark**, **Cass**, **Oark**. Turner Bend is the store-and-shuttle hub.
- **Caddo River**: → **Glenwood**, **Caddo Gap**, **Norman**, **Mount Ida**.

---

## Current River {#current}

The Current is the crown jewel of Ozarks floating — spring-fed, scenic, and reliable.
Fed primarily by Montauk Spring, Welch Spring, Blue Spring, and Big Spring (one of the
largest springs in the US). It holds water better than almost any river in the state.

- Best all-around river for beginners and experienced paddlers alike.
- Blue Spring (river mile ~48) is worth a stop — one of the deepest springs in Missouri.
- The stretch from Akers to Pulltite is considered one of the finest float trips in the Midwest.
- Big Spring near Van Buren adds massive flow to the lower river.
- Cave Spring, Round Spring, and Pulltite Spring are all accessible from the river.
- NPS manages most access points. Akers Ferry, Pulltite, Round Spring, and Two Rivers have developed campgrounds.
- Current River is part of the Ozark National Scenic Riverways (ONSR) — the first national park area to protect a river system.
- Eddy's primary gauge is **Van Buren (07067000)**, well down the river. Akers, Montauk, and Powder Mill are the upstream references, and they can disagree with Van Buren by a lot in a dry spell.

### Upper Current {#upper-current}

- **Montauk to Cedar Grove** (~7 miles): Narrow, riffley, needs slightly more water than lower sections. Great half-day in a kayak.
- **Baptist Camp to Cedar Grove** (~8 miles): Opens up a bit. A few fun riffles. Good for canoes.
- **Cedar Grove to Akers** (~8 miles): Classic stretch. Bluffs start getting dramatic. The most popular day float on the upper section.
- Montauk State Park at the headwaters has trout fishing (catch and release / tags) and a lodge.
- **Cedar Grove is the year-round line on the Current.** From Cedar Grove down the river floats every month of the year — Welch Spring and the springs below it hold the base flow up even in a drought September. It is the upper river ABOVE Cedar Grove, the Montauk and Baptist Camp stretches, that goes scrapy and walk-it first. If the upper gauge is thin, move the put-in down to Cedar Grove rather than calling the Current off.
- Note the units before quoting a level: Eddy reads **Current above Akers in cfs**, while Montauk and Powder Mill are gauge height in feet, and the staff-gauge numbers outfitters quote at Akers Ferry are a third reading again. Don't mix them.

### Lower Current {#lower-current}

- **Akers to Pulltite** (~10 miles): The signature stretch. Big bluffs, deep pools, springs. Full-day float.
- **Pulltite to Round Spring** (~9 miles): More remote. Good overnight trip.
- **Round Spring to Two Rivers** (~18 miles): Long section, often done as a 2-day. Two Rivers is the take-out where Jacks Fork joins.
- The lower river handles low water better due to spring inputs along the way.
- Big Spring (near Van Buren) is below Two Rivers — the Current below Big Spring is wide and deep, more like a slow river than a float stream.
- Cave Spring and Round Spring are both right on the river and worth exploring.

---

## Meramec River {#meramec}

The largest Ozarks float river by volume. Rain-fed, so it's more variable than spring-fed
rivers. The upper sections above Meramec State Park are the most scenic and popular for
floating; below the park it widens and slows.

- Popular with St. Louis area floaters — it's the closest quality float to the city.
- Upper Meramec (above MSP) has bluffs, riffles, and a wilder feel.
- Lower Meramec is wider, calmer, better for tubes and beginners.
- Onondaga Cave State Park is along the river with cave tours available.
- Meramec State Park has camping, cabins, and cave tours. Major hub for float access.
- The Meramec can flood dramatically — it's one of the flashiest rivers in the Ozarks. When it rains hard, expect the gauge to spike 5-10 ft in hours.
- **Gauges**: Eddy's primary is **Meramec near Steelville (07013000)**, read in cfs. Cook Station, Sullivan, and Eureka are downstream cross-checks read in gauge height (feet), and each covers a very different amount of river — the Meramec at Steelville can be a different river from the Meramec at Eureka on the same afternoon. Check access-point conditions locally.

### Upper Meramec {#upper-meramec}

- Above Meramec State Park. More rapids, narrower channel, scenic bluffs.
- St. James to Meramec State Park is the classic upper float.
- Needs a bit more water to float cleanly than the lower section.
- More experienced paddlers preferred — some Class II sections when water is up.
- **The Steelville stretch runs all summer.** The outfitter cluster around Steelville puts rafts and tubes on this water through the whole season, including at the thin late-August and September levels that look alarming on a chart. A normal low-summer reading here is a lighter-boat, expect-a-few-shallow-riffles day, not a stay-home day. Rain is the thing to watch on the Meramec, not the summer baseline.

### Lower Meramec {#lower-meramec}

- Below Meramec State Park to Sullivan area and beyond.
- Wider, calmer, more forgiving. Good for tubes, rafts, and large groups.
- Multiple outfitters operate in this stretch.
- Can get crowded on summer weekends — especially the Meramec State Park area.

---

## Eleven Point River {#eleven-point}

Remote, scenic, and less crowded than the Current. Part of the National Wild and Scenic
Rivers system. Excellent for paddlers who want solitude.

- Best mid-June through September for reliable flows.
- Spring rains can bring murky water and fast rises — it's partially rain-fed.
- Greer Spring (the 2nd largest spring in Missouri) feeds into the Eleven Point, adding significant cold, clear water.
- The river below Greer Spring runs noticeably colder and clearer.
- Fewer outfitters and services than the Current — plan ahead for shuttles.
- **Bardley (07071500)** is the reference gauge, and Eddy reads it in **cfs**, not feet. The floatable band is narrow for a river this size, so a modest rise moves it out of optimal quickly.
- Great for multi-day camping trips. Less developed, more wilderness feel.
- Wildlife is abundant — bald eagles, herons, otters are commonly spotted.

---

## Jacks Fork River {#jacks-fork}

The Jacks Fork is the wild card of Ozarks floating — rain-dependent, flashy, and
stunning when conditions are right. It joins the Current River at Two Rivers.

- **Rain-dependent**: Unlike the Current, the Jacks Fork has no massive spring inputs in the upper reaches. 
- Rises and falls faster than any other Ozarks float stream. Flash floods are a serious concern.
- Alley Spring (with the iconic red mill) is one of the most photographed spots in the Ozarks.
- When it's running right it's arguably the most beautiful float in Missouri. All three Jacks Fork gauges — Mountain View, **Alley Spring (07065495, Eddy's primary)**, and Eminence — read in cfs and sit on very different amounts of drainage, so quote the one nearest the put-in.
- The upper Jacks Fork above Alley Spring is narrow, twisty, and technical. Not for beginners.
- Below Alley Spring is more manageable. Eminence to Two Rivers is the classic stretch.
- **Alley Spring is the line between two different rivers.** Above it the Jacks Fork is rain-dependent and can be unfloatable for weeks. Below it, Alley Spring's roughly 81 million gallons a day carry the river, and Alley Spring → Eminence → Two Rivers is usually good to go even when the upper river is done for the season. Treat "the Jacks Fork is too low" as a statement about the upper river unless the gauge being quoted is Eminence.
- The outfitters' rule of thumb at Eminence is a gauge-height average, and below that average you may drag in spots with a loaded boat — that is a lighter-boat day, not a cancelled trip.
- Check conditions the day of — the Jacks Fork can go from floatable to unfloatable in 24 hours during dry spells.

---

## Niangua River {#niangua}

Fed by Bennett Spring — one of Missouri's largest springs. Consistent flows make it a
reliable choice when other rivers are running low.

- Bennett Spring State Park is a major trout fishing destination. The upper Niangua below the spring is cold and clear.
- Reliable base flow thanks to Bennett Spring. A good fallback when rain-fed rivers are too low.
- Moderate difficulty — suitable for most skill levels.
- Less dramatic bluffs than the Current or Eleven Point, but pleasant scenery.
- Can be a good alternative when more popular rivers are crowded.
- Several outfitters operate in the area with good shuttle service.
- Tunnel Dam sits on the lower river below Windyville — the Niangua is not a wholly free-flowing float below that point.

---

## Big Piney River {#big-piney}

Remote, scenic, and uncrowded. One of the best-kept secrets in the Ozarks. Flows through
the Mark Twain National Forest.

- Spring-fed but with less volume than the Current. Can get low in late summer.
- One of the most remote rivers in Eddy's set — limited cell service, fewer services.
- Excellent for paddlers seeking solitude and a wilderness experience.
- Some rocky shoals and riffles that can be tricky at lower water levels.
- Fort Leonard Wood is nearby — military training areas are adjacent but don't impact the river.
- Best floated in spring and early summer when water levels are higher.
- Check conditions before you go — there's less margin for error than on the bigger rivers.
- The Big Piney is the Gasconade's largest tributary and joins it near Devils Elbow, so a big rise here shows up on the Gasconade below Jerome.

---

## Gasconade River {#gasconade}

The Gasconade is the longest river entirely within Missouri (~280 miles) and the longest undammed river in the Ozarks — a winding, low-gradient float stream often called "one of the world's crookedest." Spring-influenced but runoff-responsive, with dolostone and sandstone bluffs, numerous springs and caves, and a strong smallmouth bass fishery. Mostly Class I (Class II is rare), and one of the least-crowded floats in the region — it's common to go miles without seeing another boat.

- The float hub is around **Jerome and Waynesville** on the middle river. Waynesville and Dixon serve the upper river; the town of Gasconade serves the lower river near the Missouri confluence.
- Three reference gauges span the river: **Hazelgreen** (upper, Eddy's primary), **Jerome** (middle, the most-cited float gauge), and **Rich Fountain** (lower). Each represents its own reach, so read the gauge nearest the put-in rather than one headline number for the whole river.
- Major tributaries include the Osage Fork, Roubidoux Creek, and the Big Piney. Many access points are low-water bridges, which become hazards when the river is up.
- **Losing reach on the upper river**: through the Narrows bend between Ozark Springs and Highway 17 (above Schlict Spring), much of the flow sinks underground in low water — roughly 75 cfs above the Narrows can drop below 30 cfs through it, leaving a weed-choked, walk-the-canoe trickle. The water returns about a mile downstream near Rockslide Bluff. An upstream gauge reading can overstate floatability through this stretch, so be cautious about the upper river in low water.
- **Rockslide Bluff**: a section of cliff collapsed into the river in 1971 and is now an interesting little rapid; springs bubble up from the riverbed here and the flow, and the floating, picks up noticeably below it.
- Strainers (downed trees) and low-water bridges are the main hazards. The gradient is gentle, so trouble comes from wood and structures more than from rapids.

### Upper Hazelgreen {#upper-hazelgreen}

- Represented by the Hazelgreen gauge, the upper-river reference. Winding, spring-influenced, good smallmouth water.
- Watch the losing reach above Schlict Spring in low water (see the river notes above) — the Hazelgreen reading can overstate what you will actually find through the Narrows.
- Floatable from around Highway E downstream; the highest put-ins need more water and can be scrapy.

### Mid Jerome {#mid-jerome}

- The popular middle float around Jerome and Waynesville, represented by the Jerome gauge, the most-cited Gasconade float gauge and the best single reference for a typical trip.
- High-quality smallmouth fishery, and where most outfitted trips run.
- Low-water bridges and strainers are the hazards to watch as water rises.

### Lower Richfountain {#lower-richfountain}

- Represented by the Rich Fountain gauge, toward the Missouri River confluence. Larger, slower water.
- On this bigger lower river, low water mainly affects your speed rather than whether you can float.
- Rises here arrive from the whole upstream drainage, so the gauge can climb even when local weather is dry.

---

## Huzzah Creek {#huzzah}

Short, accessible, and perfect for day trips. Pairs naturally with Courtois Creek for
a weekend of floating. Upper sections usually only floatable in early spring.

- Popular for day trips from the St. Louis area. Easy access, good outfitter infrastructure.
- Can drop fast in summer dry spells and increase quick with heavy rain.
- Shorter float sections mean you can do a full trip in 3-4 hours.
- Often combined with Courtois — float one Saturday, the other Sunday.
- Steelville is the hub for both Huzzah and Courtois access and outfitters.
- The creek is smaller and shallower than the rivers — lighter craft (kayaks, canoes) are better than rafts.
- Nice bluffs and clear water when conditions are right.
- **Gauge note**: Huzzah Creek near Steelville (**07014000**) also serves as the proxy gauge for Courtois Creek. Both creeks will show similar conditions, so do not recommend Courtois as an alternative when Huzzah is low.

---

## Courtois Creek {#courtois}

More secluded than its neighbor Huzzah. Excellent for a quieter, scenic float without
the weekend crowds. Upper sections usually only floatable in early spring.

- Less crowded than Huzzah despite similar quality — the locals' choice.
- Same dependency on recent rainfall as Huzzah.
- **Shared gauge**: Courtois Creek has no active real-time USGS gauge. Conditions are estimated using Huzzah Creek near Steelville (**07014000**). When Huzzah is low, Courtois is also low. Do not recommend pivoting to Courtois as an alternative when Huzzah is poor.
- Slightly more remote access points than Huzzah.
- Pairs well with Huzzah for a weekend float trip.
- Beautiful bluffs and gravel bars. Great for wading and swimming when the water is up.
- Steelville area outfitters serve both Courtois and Huzzah.
- If Huzzah is too crowded, Courtois is almost always less busy.

---

## Black River {#black}

A clear southeast-Missouri Ozark float below the St. Francois Mountains, with two very different personalities split by Clearwater Lake. The Lesterville reach above the lake is a popular summer float — some of the clearest water in the Ozarks, big gravel bars, occasional bluffs, and good smallmouth and goggle-eye fishing. Below Clearwater Dam the river becomes a slower, dam-influenced reach toward Poplar Bluff, where it leaves the Ozarks into flat lowland water.

- The three forks (West largest, Middle, East smallest) converge near Lesterville; the main stem from there to Clearwater Lake is one of Missouri's more popular canoeing streams, with campgrounds and rentals in and below Lesterville.
- **Two reaches, two gauges.** The upper float reads off the **Annapolis** gauge — the only real-time gauge for that reach (the Lesterville gauge is discontinued). The **Poplar Bluff** gauge covers the lower reach, but sits about 26 river miles downstream on a larger drainage and reads roughly a quarter high, so treat it as a high-water safety ceiling, not a precise level.
- **Clearwater Dam** sits below the upper reach: its normal pool floods only a few miles of channel, but the flood pool can back up about ten miles toward the Highway K area, so the effective bottom of the float reach moves with lake level.
- The East Fork (Taum Sauk / Johnson's Shut-Ins / Bell Mountain) is not floatable; West Fork floats from around Centerville, Middle Fork from the Hwy 21-72 bridge.

### Upper Lesterville {#upper-lesterville}

- The clear, gravel-bar summer float from Lesterville down toward Clearwater Lake. Read the Annapolis gauge for this reach.
- Watch where Clearwater's flood pool reaches in high water — the lower end can be slack, backed-up lake rather than moving river.

### Lower Markham Hammer {#lower-markham-hammer}

- Below Clearwater Dam: a dam-influenced tailwater reach where levels reflect the release schedule and can change independent of local rain.
- The Poplar Bluff gauge is the live reference but reads about a quarter high for this reach — lean on it for the high-water ceiling, not for fine floatability calls.

---

## Bourbeuse River {#bourbeuse}

The slowest large stream in the Ozarks and one of its crookedest — it winds about 116 river miles in under 40 straight-line miles to reach the Meramec. Runoff-fed and usually murky (its watershed is mostly cleared farmland), so it responds fast to rain and drops to a trickle in dry spells. A quiet local's river: one small outfitter on the whole stream, mostly anglers after catfish, smallmouth up high, spotted bass lower down.

- **Often too low.** The upper half is frequently unfloatable without a lot of dragging in a dry summer — plan around recent rain, not the calendar.
- Two references: the **High Gate** gauge reads the upper river but is unreliable after rain (tributaries add water below it, so cross-check the **Union** gauge for a rise). Union reads the lower river well, except the Noser Mill to Spring Creek stretch, which runs lower than Union shows.
- **Spring Creek** (fed by Kratz Spring) enters about ten miles below Noser Mill and can nearly double the flow — below it the river is almost always floatable even when the upper river is not.
- Public access is scarce on the upper river, so trips there are often multi-day. Low-water bridges, logjams, and strainers are the main hazards; the gentle gradient means trouble comes from wood, not rapids.

### Upper Bourbeuse (Mint Spring to Noser Mill) {#upper-mintspring-nosermill}

- The half that goes unfloatable first. In a dry summer this is dragging, not floating, and public access is scarce enough that a trip here is often multi-day whether you planned it that way or not.
- High Gate is the gauge for this reach, and it is the unreliable one after rain — cross-check Union before trusting a rise.

### Lower Bourbeuse (Noser Mill to the Meramec) {#lower-nosermill-meramec}

- Spring Creek enters about ten miles below Noser Mill and can nearly double the flow. Below that confluence the river is almost always floatable even when the upper half is not.
- Union reads this reach well — except the Noser Mill to Spring Creek stretch above the confluence, which runs lower than Union shows.

---

## Buffalo River {#buffalo}

The Buffalo National River — America's first National River (1972) — is a free-flowing, rain-driven stream draining the Boston Mountains of northwest Arkansas, managed by the National Park Service. Its personality changes sharply top to bottom: the upper river is flashy and seasonal, floatable mainly spring into early summer, while the lower river holds water nearly year-round and reads more like flatwater.

- **Ponca to Pruitt** is the classic upper float and the most level-sensitive reach on the river — too low and you drag, too high and the bluffs turn hazardous. Season is typically March through June, sometimes into July with rain.
- Read the gauge that matches your reach: **Ponca** is the canonical upper-river floatability gauge, **St. Joe** (Tyler Bend) is the middle-district reference and Eddy's primary for the river, and **Rush** is the lowest before the White River confluence.
- When it's too low to launch at Ponca, outfitters shift the put-in about two miles down to Steel Creek — there's no published numeric cutoff, it's a daily operational call.
- Flash floods and strainers are the serious hazards on the flashy upper reaches; the lower river below Gilbert is calmer, where low water mostly affects speed rather than whether you can float.

### Upper (Ponca to Pruitt) {#upper-ponca-pruitt}

- The classic float and the most level-sensitive water on the river — a narrow window between dragging and dangerous, under the tallest bluffs in the park.
- Read Ponca for this reach, not St. Joe. When Ponca won't float, the put-in moves down to Steel Creek — an outfitter call made daily, not a number you can look up.

### Middle (Pruitt to Gilbert / Tyler Bend) {#middle-pruitt-gilbert}

- The middle district, represented by St. Joe (Tyler Bend). Holds floatable water later into the summer than the Ponca reach but is still rain-driven.

### Lower (Gilbert to Buffalo City) {#lower-gilbert-buffalocity}

- Calmer, holds water nearly year-round, and reads more like flatwater than float. Low water here mostly costs speed rather than ending the trip.
- Rush is the lowest gauge before the White River confluence.

---

## St. Francis River {#st-francis}

Missouri's only whitewater river. The upper St. Francis through Millstream Gardens and Silver Mines — the Tiemann Shut-ins — is a short, rain-dependent Class II–IV pool-drop run that spikes and drops fast and stays cold. Below the shut-ins it mellows and floats more like an ordinary stream toward Sam A. Baker State Park and Wappapello Lake.

- **The whitewater reach is genuinely serious** — Class II–IV pool-drop through the shut-ins, committing at high water, and unrunnable rock when too low. This is the one Missouri float where "experienced paddlers only" is the right framing for the upper run.
- Levels on the upper river are read as **stage in feet from the Roselle (NWS) gauge**, not discharge — the old USGS discharge record ended in 1997. The Patterson gauge covers the lower river toward Wappapello.
- Rain-dependent and flashy: it can be a runnable river one day and dry rock the next. The Missouri Whitewater Championships run the reach each spring, contingent on water level — verify before traveling.

### Upper Whitewater {#upper-whitewater}

- Millstream Gardens to Silver Mines (the Tiemann Shut-ins): a Class II–IV pool-drop run, swift drops separated by calm pools, run mainly during spring high water. Cold water and committing at high flows.
- Below the runnable minimum the shut-ins are unrunnable rock — a drag or portage, not a float.

### Lower Float {#lower-float}

- Silver Mines down toward Sam A. Baker State Park and Wappapello: a normal-stream float, much calmer than the shut-ins.
- On this reach low water mainly affects your speed rather than whether you can float.

---

## Big River {#big-river}

A slow, long-pool Class I float rising in the St. Francois Mountains and winding north to the Meramec. Gentle water, gravel-bar riffles, and old mill sites — but it is the one river in Eddy's set defined by its dams rather than its rapids. Washington State Park is the float hub, with a park concession renting kayaks, canoes, and rafts Memorial Day through Labor Day.

- **Low-head dams are the story here.** Morse Mill (portage right), the Cedar Hill mill dam (portage left), a private dam near river mile 127 (portage right), and Byrnes Mill (portage right) all sit on the lower river and all require portage. Their recirculating hydraulics do not wash out as flow rises — they get worse. Never treat a rising river as a reason to run one.
- At Morse Mill specifically, the break in the dam on the left by the old mill foundation is dangerous; the concrete sluice just right of it is only a canoe-sliding option when the water is low enough to stand on the dam.
- Read the gauge that matches the reach. **Richwoods (07018100) is Eddy's primary**, and it is the one for Washington State Park and the upper floats. **Byrnesville (07018500)** sits well downstream on a larger drainage, over-reads the park floats, and is the better reference for the Morse Mill / Cedar Hill dam reach.
- The very upper river, up toward the Irondale gauge (07017200), thins out first in a dry summer and is the first stretch to become a drag.
- Low water means dragging riffles between long pools, not an unfloatable river — the pools hold water when the connections between them do not. Trip lengths should shrink before trips get cancelled.
- **Old Lead Belt legacy**: Big River drains historic lead mining country and MDC keeps a fish-consumption advisory on it. Worth mentioning to anglers, and a reason not to stir up or ingest bottom sediment.
- Popular short float: the roughly three-mile run from Washington State Park to Mammoth, beginner-friendly and dam-free. Mammoth to Merrill Horne is the quieter wooded reach below it, good smallmouth and rock bass water.
- Nearest towns for food and fuel: De Soto, Potosi, and Bonne Terre. This is close-to-St. Louis water, so summer weekends at Washington State Park are busy.

### Washington State Park to Mammoth {#washington-state-park-to-mammoth}

- The popular short float — about three miles, beginner-friendly, and dam-free. The park concession rents boats here Memorial Day through Labor Day, so summer weekends are busy.
- Richwoods is the gauge that represents this reach; Byrnesville reads high for it.

### Mammoth to Merrill Horne {#mammoth-to-merrill-horne}

- The quieter wooded reach below the park float, and good smallmouth and rock bass water. Still dam-free.

### Morse Mill to Cedar Hill {#morse-mill-to-cedar-hill}

- Dam country: Morse Mill at the top (portage right) and the Cedar Hill mill dam at the bottom (portage left, where the MDC Cedar Hill Access is also the best take-out in the stretch). Portage both at every level.
- Byrnesville is the nearest gauge to this reach and the right one to read here.

---

## Bryant Creek {#bryant-creek}

A wild, spring-influenced Ozark stream running south through Douglas and Ozark counties to meet the North Fork of the White at Tecumseh. Clear pools, bluffs, and gravel bars, prized for smallmouth and goggle-eye — narrower, flashier, and far less developed than the neighboring North Fork.

- **The gauge sits at the very bottom.** Bryant Creek near Tecumseh (07058000) reads the mouth of the creek, so it over-reads everything upstream. A reading that looks fine can still mean a scrapy day at Vera Cruz or Bell Bridge.
- **Low-water bridges do double duty, and that is the hazard.** Monastery (Hwy OO), Bertha Ford, Bell School (Hwy 95), Hodgson Mill (Hwy 181), and Warren Bridge all serve as access at normal flow and turn into strainers when the water is up. Never run a submerged crossing — scout and portage.
- Bryant is narrow and willow-choked in places and rises and muddies fast after local rain. Look at the water before launching rather than trusting a gauge that sits miles downstream.
- The upper reach from Vera Cruz to Highway 95 is narrow and frequently choked with deadfall and willow strainers. It needs higher water, rewards caution, and is often not floatable at all in summer without dragging.
- Sycamore at Hodgson Mill down to Warren Bridge is the traditionally popular reach, passing The Narrows bend. Sycamore is the only MDC access currently open on the creek — the rest are road crossings.
- **The bottom end is lake, not creek.** When Norfork Lake is up, the last stretch above the confluence is backwater — flat paddling rather than floating, and the current quits before the take-out does.
- Nearest towns: Ava to the north, Gainesville to the south. Services along the creek itself are essentially nonexistent — plan fuel and food before launching.

### Vera Cruz to Highway 95 {#vera-cruz-to-hwy-95}

- The upper reach: narrow, twisty, and frequently choked with deadfall and willow strainers. Needs higher water than anything below it and is often not floatable at all in summer without dragging.
- This is the reach the Tecumseh gauge flatters most, since it sits at the far bottom of the creek. Treat a merely adequate reading as too low up here.

### Sycamore / Hodgson Mill to Warren Bridge {#hodgson-mill-to-warren-bridge}

- The traditionally popular reach, passing The Narrows bend. Sycamore is the only open MDC access on the creek, so this is the stretch with a real put-in rather than a road crossing.

### Florence Cook to the North Fork confluence {#cooks-landing-to-north-fork-confluence}

- Norfork Lake backwater when the lake is up: flat water rather than float, and the current quits well before the take-out does. Plan for paddling, and for wind.

---

## North Fork White River {#north-fork-white}

The North Fork of the White is a cold, clear, spring-fed float and one of Missouri's best wild-trout streams, fed by Rainbow Spring and a string of smaller springs. Reliable flows year-round, Class I–II water with real features, and an outfitter-and-camp corridor rather than a wilderness river.

- **Two named hazards define the main reach.** The Falls, a roughly three-foot ledge in front of River of Life Farm (~river mile 37), flips canoes that drift into it unscouted. Dawt Mill Dam, near the lower end above the Tecumseh take-out, is a known canoe-buster that backs water up about a quarter mile — portage, or slide down the shallow chute at the right end. A good rapid runs out below the dam.
- The **Tecumseh gauge (07057500)** sits at the downstream end of the SH 14–to–Tecumseh reach and over-reads the thinner water upstream. It is the right reference for the popular float, not for the headwaters.
- **Rainbow Spring is the year-round line on the North Fork.** Below the spring the river floats every month of the year — Rainbow is one of the largest springs in Missouri and its output barely moves with the weather, so the reach from there down to Tecumseh holds boatable water through the driest end of summer. Above it the North Fork is a small rain-fed creek and behaves like one. When the gauge reads thin, that is a reason to put in below Rainbow Spring, not a reason to skip the river.
- Spring inputs keep it cold year-round. Even in July, a swim is a cold swim, and long immersion is a real risk on an early-season trip.
- The high end matters here: at high flows the Hwy H / Patrick low-water bridge floods and the canoe accesses are affected. Rises arrive from upstream rain rather than local weather, so the sky overhead is not the tell.
- Hammond Camp, River of Life Farm, Blair Bridge, Patrick Bridge, and Sunburst Ranch are the access and lodging hubs; the lowest couple of miles below The Forks are Norfork Lake backwater.
- Nearest towns: West Plains, Gainesville, Dora, and Tecumseh. Cell service through the river corridor is patchy.

### North Fork main reach (SH 14 → Tecumseh) {#north-fork-main}

- The popular float, and the reach the Tecumseh gauge actually represents. Class I–II with two things to plan around: The Falls above River of Life Farm, and Dawt Mill Dam near the take-out.
- Cold water year-round is a feature of this reach, not a seasonal caveat — dress for immersion even in midsummer.

---

## James River {#james}

A southwest-Missouri smallmouth stream draining the Springfield Plateau to Table Rock Lake. The lower Galena reach is the classic float — clear, spring-influenced Class I water; the upper river above Hootentown drains Springfield and behaves like a different stream.

- Hootentown to the Galena Y-Bridge, about 22 miles, is the recreational reach and the one the outfitters serve. A Smallmouth Bass Special Management Area begins near Hootentown, so expect anglers as well as floaters.
- **Three gauges, three different rivers.** Read **Galena (07052500, Eddy's primary)** for the classic float. **Boaz (07052250)** covers the middle river, and **Springfield (07050700)** is the urban headwater gauge on a fraction of the drainage — Springfield's numbers are much flashier and must never be applied to the Galena reach.
- Eddy's Galena ladder is in **cfs**. The Galena outfitters also publish a **gauge-height** key for the high end — caution around 7 ft, do-not-float at 8 ft — which is a different unit off the same station. Don't blend the two into one number.
- **The upper river is not a summer float.** From about Highway 125 down to Hootentown it carries Springfield's urban runoff and wastewater-treatment influence, runs flashy and rain-driven, floats only at medium-to-high water, and has the Kissick Dam low-head hazard to portage.
- In low water, put in at Hootentown rather than farther upstream — the upper James drops out quickly in summer.
- When Table Rock Lake is high, the bottom of the float near Galena feels the backwater — the current slows before the take-out arrives.
- Nearest towns: Galena and Crane at the take-out end, Springfield and Nixa upstream.

### Lower / Galena reach {#james-galena}

- Hootentown to the Galena Y-Bridge, roughly 22 miles — the classic float, clear and Class I, and the reach the Galena gauge represents.
- The take-out end feels Table Rock backwater when the lake is high: slack water and slower going before you actually arrive.

### Upper / urban reach {#james-upper}

- Hwy 125 down to Hootentown: urban runoff and wastewater-treatment influence, flashy and rain-driven, floatable only at medium-to-high water. Not a summer trip.
- Portage the Kissick low-head dam. Read Boaz or Springfield here — never the Galena number.

---

## Spring River (Missouri) {#spring-river-mo}

A western-edge Ozark stream running from Lawrence County through Carthage and on toward the Kansas line — prairie-border country rather than bluff-and-spring Ozarks. Smallmouth, spotted bass, and rock bass water, floated almost entirely by locals. Note this is **not** the Arkansas Spring River at Mammoth Spring; same name, different basin, different gauges.

- **There are no outfitters on this river.** No liveries, no shuttles, no rental boats — it is a self-shuttle float from free public accesses (MDC's La Russell access and the Carthage city river parks, including Kellogg Lake and Spring River Park). If a web result names a Carthage outfitter with a "Rainbow Bridge" put-in or a "Ragin' Waters Landing" take-out, that listing is unverified AI-generated travel content and those businesses could not be confirmed to exist. Do not send anyone to them.
- **The float ladder here is statistical, not a vetted float key.** No outfitter or agency publishes floatability levels for this river, so the thresholds come from long-run gauge percentiles at Carthage. Talk about trend and direction, and be more hedged about "good" and "too low" than on a calibrated river.
- The one piece of local guidance that does exist is blunt and worth repeating: don't float on high water, and if the water is brown or carrying debris, stay out.
- **Two low-head dams to portage**: the Hwy 96 dam (portage river-right) and the old mill dam near Galesburg. Scout both.
- **Two gauges, very different drainages.** Carthage (07185765, ~425 sq mi) sits mid-reach and is the representative gauge. Waco (07186000, ~1,164 sq mi) is well downstream near the Kansas line, on nearly three times the drainage — it is not a substitute for Carthage.
- Public accesses sit roughly 3–7 miles apart down to Kafir Bridge, the last Missouri access above the state line. Below the line you are in Kansas, where floating requires landowner permission.
- Carthage has dammed and milled this river since the 1840s, and the industrial legacy around the old millrace still affects water quality on that stretch. Nearest towns are Carthage and Sarcoxie; Joplin is the nearest city.

---

## Spring River (Arkansas) {#spring-river}

Arkansas's Spring River rises at Mammoth Spring and runs cold, clear, and remarkably steady past Hardy toward the Black River. Mammoth Spring's enormous, constant 58°F baseflow means this river is effectively never too low to float — the questions here are cold, ledges, and crowds, not water level.

- **It is essentially always floatable, and that is the trap.** Because the spring holds the flow up, people underestimate it: the water is genuinely cold year-round, and a swim in the ledges is a hypothermia risk even on a hot August afternoon.
- **The ledges are the hazard.** Saddler Falls and High Falls are Class I–II drops that regularly flip loaded canoes, and low-head Dams #1 and #3 need portaging, especially in high water. Rafts and hard-shell kayaks handle them better than open canoes.
- The classic float is Dam 3 / Riverside down to Hardy, about 15 miles, with the main put-in roughly three miles below the spring. AGFC stocks trout in the cold upper stretch; smallmouth, walleye, and tiger muskie live below.
- **Do not read NWS flood stage as the danger line.** Flood stage at Hardy is a stage-height category on a river whose floatable range is a few hundred cfs — high water on this river arrives long before the flood category does.
- **Hardy (07069305)** at the Spring Street bridge is the primary gauge; **Imboden (07069500)** reads the lower river toward the Black River confluence, which is larger, warmer, and much less calibrated.
- The Hardy stretch is a party-float destination on summer weekends. Nearest towns: Mammoth Spring, Hardy, and Cherokee Village.

### Mammoth Spring / Dam 3 to Hardy {#spring-reach1}

- The classic run, about 15 miles, holding all the named ledges — Saddler Falls, High Falls, and the low-head dams. Coldest, clearest water on the river and the busiest on a summer weekend.
- Level is rarely the question here; cold, ledges, and boat choice are. Open canoes swamp in the drops that rafts shrug off.

### Hardy toward Imboden and the Black {#spring-reach2}

- Below Hardy the river grows, warms, and slows toward the Black River confluence. The Imboden gauge covers it, but this reach has no vetted float key — be more hedged here than on the Hardy run.

---

## Kings River {#kings-river}

A free-flowing, undammed Ozark stream running about 90 miles north out of the Boston Mountains to the White River arm of Table Rock Lake. Arkansas has designated it an Extraordinary Resource Waterbody. Rain-fed and flashy: it floats best late winter through June and usually drops out by midsummer.

- **The top eleven miles are not a float.** Dripping Springs down to Hwy 74 is turbulent Class III+ whitewater with a waterfall — advanced paddlers only. The Berryville gauge is far downstream of it and only a rough proxy; that reach needs high spring flows.
- **Berryville (07050500)** reads the middle river and is the only reference for the whole stream. Its levels are best calibrated at the minimum-floatable end, so lean on trend and on "enough water / not enough water" rather than implying a finely tuned sweet spot.
- Rockhouse to Trigger Gap is the most popular day float, running through Nature Conservancy land with rock features, gravel bars, and deep swimming holes. Trigger Gap to Hwy 62 is the trophy smallmouth reach (18-inch minimum).
- **Low-water bridges must be portaged.** One near the end of the Trigger Gap–to–US 62 stretch has its center blasted out; outfitters advise the middle line or a portage left. Never run a submerged crossing.
- **The bottom reach outlasts the rest.** Hwy 62 down to MO 86 holds water into August thanks to Table Rock backwater — but expect slack water, wind, and motorboats down there, not a moving float.
- Access is a mix of road crossings and private/fee accesses through the Berryville and Eureka Springs outfitters. Nearest towns: Berryville, Eureka Springs, Marble.

---

## War Eagle Creek {#war-eagle-creek}

A scenic Class I northwest-Arkansas float running past Withrow Springs State Park and the historic War Eagle Mill to Beaver Lake, framed by tall limestone bluffs. Rain-dependent and flashy — a spring-runoff creek that usually goes too low by midsummer.

- **War Eagle Mill's low-head dam must be portaged**, and it is a hard portage: steep banks on both sides. It sits just above the Beaver Lake backwater near the end of the float.
- **The float key is in gauge height, not discharge.** Local sources all describe War Eagle in feet on the Hindsville gauge (07049000) — the "Hwy 45 gauge" people refer to is this same station, and roughly 2.0–3.5 ft is the commonly cited floatable band. Just over 4 ft is flood stage there, so the usable range and the dangerous range sit close together.
- The upper reaches, from the Hwy 23 fish hatchery down through Hwy 412, are the liveliest water (Class I–II) and the first to go too skinny. Withrow Springs down to Hindsville is the gentler, more reliable middle.
- Low-water bridges and concrete slabs cross the creek and become strainers when water is up — scout and portage rather than running them.
- **This creek rises fast.** It drains a small, steep watershed, so a storm upstream shows up quickly and leaves quickly. A rising gauge is a reason to stay off, not to hurry.
- Best March through June. Nearest towns: Huntsville, Springdale, and Rogers. The War Eagle Mill area gets very busy during the craft fair.

### Hwy 23 hatchery to Hwy 412 {#hatchery-to-hwy-412}

- The liveliest water on the creek (Class I–II) and the first reach to go too skinny. It needs the upper half of the floatable band, not the bottom of it.

### Withrow Springs to Hwy 45 (Hindsville) {#withrow-springs-to-hwy-45}

- The gentler, more reliable middle reach, past Withrow Springs State Park. The Hindsville gauge sits at the bottom of this stretch, so it represents this water better than anything else on the creek.

### Hwy 45 (Hindsville) to War Eagle Mill {#hwy-45-to-war-eagle-mill}

- Ends at the War Eagle Mill low-head dam — a required portage with steep banks on both sides, just above Beaver Lake backwater.
- When Beaver Lake is up, the last of this reach is flat lake water rather than creek.

---

## Crooked Creek {#crooked-creek}

A clear, gravel-bottomed Ozark stream crossing north-central Arkansas to the White River near Cotter. A Blue Ribbon smallmouth fishery and an AGFC Water Trail — easy Class I floating past long gravel bars and riffles, with fishing rather than paddling as the main draw.

- **Entirely rain-fed, with no spring support.** It drops skinny quickly in summer, so spring is the float window and a dry July usually means wading, not floating. On this creek, low water genuinely stops trips rather than just slowing them.
- **Kelly's Slab is the named hazard** — a concrete low-water crossing at the Fred Berry Conservation Education Center near Yellville. Scout and portage; water flowing over the slab makes it dangerous.
- Flashy on the other end too: it can go from a clear gravel creek to a torrent quickly after upstream rain, and it clears slowly compared to a spring-fed stream. There is no official flood gauge here — treat any rapid rise as dangerous on its own terms.
- **Kelly Crossing at Yellville (07055607)** is the reference gauge, near the middle of the floatable water, and it reads in **gauge height (feet)**. The upper reach from Harmon to Pyatt is the liveliest (Class I–II); everything below is easy Class I.
- Smallmouth regulations here are stricter than general statewide rules — anglers should check current AGFC limits for the Blue Ribbon stretch before keeping fish.
- Nearest towns: Yellville, Harrison, and Cotter.

### Harmon to Pyatt {#harmon-to-pyatt}

- The liveliest reach on the creek (Class I–II) and the farthest above the gauge, so it goes too skinny before the reading does.

### Kelly's Slab to Yellville {#kellys-slab-to-yellville}

- Starts at the named hazard: Kelly's Slab, the concrete low-water crossing at the Fred Berry Conservation Education Center. Scout and portage — water moving over the slab is dangerous.
- The gauge sits right here, so this is the reach its reading describes most honestly.

---

## Caddo River {#caddo-river}

A clear Ouachita Mountain stream — **not** an Ozark river — and one of Arkansas's most popular family floats, running east past the boulder gorge at Caddo Gap toward DeGray Lake. The classic Caddo Gap to Glenwood run mixes fun Class I–II rock gardens with long, calm pools.

- **Flash flooding is the number one danger.** The Caddo rises several feet very fast during and after heavy rain. The same region's 2010 Albert Pike flood on the nearby Little Missouri killed about twenty campers on gravel bars — never camp low on a bar, and get off the water when the gauge is rising or storms are working upstream.
- **The float key is gauge height in feet** on the Caddo Gap gauge (07359610), matching the local outfitter key. The bottom of the band — roughly the low 5s — is the bony, rock-dodging, family-pace end: four to six hours, fine for beginners, plenty of scraping. The gauge also reports discharge, but the community talks in feet.
- Caddo Gap to Glenwood is the classic run. Norman to Caddo Gap is the upper alternative (also I–II); Glenwood down toward Amity and the DeGray headwaters is easier and slower.
- The long lower run below Glenwood holds an isolated Class III hole and wave train at high water — a genuine step up from the family float upstream.
- **Ouachita, not Ozark.** The general Ozarks hydrology notes about spring inputs do not apply here: this is a mountain river with a flashier, rain-driven personality and a shorter reliable season.
- The corridor is mostly private land between public accesses. Nearest towns: Glenwood, Caddo Gap, Norman, and Mount Ida.

### Caddo Gap to Glenwood {#caddo-gap-to-glenwood}

- The classic run and the one the Caddo Gap gauge is keyed to: Class I–II rock gardens separated by long calm pools, four to six hours at the low end of the band.
- Flashy enough that a rising gauge ends the trip — this is gravel-bar country and gravel bars are exactly where flash floods kill people.

### Norman to Caddo Gap {#norman-to-caddo-gap}

- The upper alternative, also Class I–II, above the boulder gorge at Caddo Gap. Needs more water than the classic run and drops out sooner.

### Glenwood to Amity / DeGray headwaters {#glenwood-to-amity}

- Easier and slower than the run above, trending toward DeGray Lake. The long version of this reach holds an isolated Class III hole and wave train that only shows up at high water.

---

## Mulberry River {#mulberry}

Arkansas's premier whitewater float and a National Wild and Scenic River, running free out of the Boston Mountains through the Ozark National Forest. Reliable Class I–II rapids that stiffen toward II+ and III at high water, under scenic canyon walls. Best fall through spring — it is usually too low by midsummer.

- **Notoriously flashy.** It runs a few hundred cfs on a normal day and peaks in the tens of thousands after a big storm. Rises arrive within hours of upstream rain. Never launch on a rising gauge or with heavy rain in the forecast upstream.
- **Levels are read in feet** on the Mulberry near Mulberry gauge (07252000). Every authoritative source — the Turner Bend key, Byrd's, American Whitewater — publishes in gauge height, and essentially nobody publishes cfs floatability numbers for this river.
- Turner Bend is the hub: outfitter, store, shuttle, and the traditional staff-gauge reference. Redding, Wolf Pen, and Byrd's are the Forest Service and private campgrounds along the corridor.
- **Low-water bridges** near Turner Bend and Redding need the right-hand line at normal flow and become impassable, dangerous strainers when the water comes up — outfitters stop renting well before the river becomes unrunnable.
- Reach difficulty climbs upstream: Wolf Pen to Redding is the stiffest (II+), Redding to Turner Bend the classic I–III run, and Turner Bend downstream mellows to I–II.
- This is the one Arkansas river in Eddy's set where "experienced paddlers" is the right framing at the high end — high water here is whitewater, not a fast float. Nearest towns: Ozark, Cass, and Oark.

### Wolf Pen to Redding {#wolf-pen-to-redding}

- The stiffest reach on the river (II+), highest in the corridor and the first to go too low. Needs the upper part of the band and rewards experience.

### Redding to Turner Bend {#redding-to-turner-bend}

- The classic run, I–III depending on level, ending at the outfitter-and-store hub. The low-water bridges near Redding and Turner Bend want the right-hand line at normal flow and are dangerous strainers once the water is up.

### Turner Bend to Campbell Cemetery {#turner-bend-to-campbell-cemetery}

- Below the hub the river mellows to I–II — the gentler end of the Mulberry, though still flashy and still not a beginner river on a rising gauge.

---

## White River {#white}

Arkansas's flagship trout tailwater: about ninety miles of cold, clear water from Bull Shoals Dam down past Cotter, Buffalo City and Norfork to the Highway 58 bridge at Guion, where the Arkansas Game and Fish Commission's trout water ends. This is regulated water, not rain-fed — it runs at whatever the Corps releases, and the sky above it tells you nothing about what it is about to do.

- **The dam is the weather here.** Eight generators at Bull Shoals, roughly 3,300 cfs each, can take the river from wadeable to a big, pushy float in under an hour with no rain anywhere in the basin. Read the generation schedule before anything else; a clear forecast is not a forecast for this river.
- **It never goes dry.** When every unit is idle the Corps holds a minimum flow — a separate release the dam publishes in its own right, in cfs — so the low end of this river is a floor somebody chose, not a drought.
- **Cold, all year.** The release comes off the bottom of Bull Shoals Lake and the tailwater sat near 55 °F in August. Dress for the water and not the air: hypothermia is a summer risk here in a way it is not on a spring-fed Ozark float.
- **Two dams feed the lower half.** Norfork's release joins about thirty-five river miles below Bull Shoals Dam, and at full generation it is a substantial fraction of what Bull Shoals puts out. Below that confluence, knowing what one dam is doing is only half the picture.
- **The Buffalo comes in at Buffalo City.** After heavy rain the Buffalo can push colored, warmer water into an otherwise clear tailwater — the one way local weather does show up on this river.
- **Where the numbers come from.** There is no USGS flow gauge in the tailwater itself. The controlling number is the release measured at the dam; the nearest discharge gauge on the river proper is thirty-five miles down, near Norfork. The sites right below the dam measure water temperature and dissolved oxygen only.
- The river warms as it runs — measurably, within the first few miles — which is why the trout water has a downstream limit at Guion rather than continuing.

## Norfork Tailwater {#norfork-tailwater}

Not quite five miles of the North Fork River between Norfork Dam and the White, and one of the most concentrated trout fisheries in the country. Catch-and-release from end to end. Small enough to know well, and entirely governed by two generators.

- **Not the same river Eddy carries in Missouri.** The North Fork River above Norfork Lake is a spring-fed Ozark float in Ozark County, Missouri. This is the water below the dam, in Arkansas, with thirty miles of reservoir between them. Same name, different river, different rules.
- **A siphon holds the floor.** When both units are idle a siphon runs a steady release, in cfs, which is what makes this tailwater wadeable at all and is the reason the fishery survives late summer. Total release is turbine flow plus that siphon.
- **One unit changes everything.** With only two generators the step between idle and generating is abrupt — a single unit takes the release from a couple of hundred cfs to well over three thousand, roughly sixteen times, and wading is finished. There is no gentle middle here the way there is on the eight-unit White.
- **Cold and thin on oxygen.** The tailwater ran about 53 °F in August, and the dissolved oxygen immediately below the dam was low enough in late summer to matter to fish — hypolimnetic water from a stratified lake comes out cold and oxygen-poor, and re-aerates as it runs.
- **The turbines are not a given.** Norfork's units have been out of service for extended stretches, with release made through the siphon and flood gates instead. "Not generating" here has meant months, not hours.

## Lake Taneycomo {#taneycomo}

Twenty-three miles of the White River between Table Rock Dam and Powersite Dam at Forsyth — a lake by name and by law, a cold tailwater in practice. The top of it fishes and wades like a river; the bottom is flatwater backed up behind Powersite.

- **Two different waters under one name.** The upper reach below Table Rock Dam is riverine, cold and wadeable when the units are off. Below Fall Creek it gradually becomes the impoundment Powersite has held since 1913. Advice for one half is wrong for the other.
- **The biggest, fastest move Eddy measures.** The tailwater stage below Table Rock swings roughly eight feet between idle and full generation on four units. Water can come up feet in minutes; the dam sounds a horn before it starts, and that horn is the only warning wading anglers get.
- **Cold enough to be the point.** The release ran about 53 °F in August, which is why a trout fishery exists this far south and why the hatchery sits where it does.
- **Oxygen improves downstream.** Dissolved oxygen measured close to double ten miles down what it did immediately below the dam — the release comes out oxygen-poor and re-aerates as it moves.
- **The lake level is its own reading.** Because Powersite impounds it, Taneycomo has a surface elevation rather than a stage, and gauges at both ends report it in feet. That is not a river stage and does not mean what a river stage means.
- Missouri's special regulations apply from Table Rock Dam down to Fall Creek — check MDC's Lake Taneycomo rules before keeping anything.
