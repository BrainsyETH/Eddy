# Eddy's Knowledge Base

This file is Eddy's local knowledge — the stuff you can't get from a gauge reading.
Add to it anytime. The generator parses this by section and hands each Read only the
parts about the water its gauge speaks for (`src/lib/eddy/knowledge.ts`).

## Format Rules

- **General** section: loaded into every river Read and every chat (keep it concise).
  Its last block, `### Chat only`, goes to chat and to no Read: trip planning that is
  true every day (the season, crowds, services, fees, "check with an outfitter"). A
  Read handed one of those repeats it on every river, every morning.
- **River sections** (`## Name {#slug}`): the text straight under the heading must be
  true along the WHOLE river. It goes to every Read on that river, at every gauge. A
  fact about one place does not belong there, however famous the place.
- **Gauge blocks** (`### Gauge: Van Buren {@07067000}`): what one gauge sits on and
  speaks for. The tag is the site id in `gauge_stations`. Every gauge block starts with
  two lines:
  - `- **Sits**:` where the gauge is, what enters the river ABOVE it and what enters
    BELOW it. A spring just below a gauge is not in that gauge's reading; say so.
  - `- **Speaks for**:` the stretch of water this gauge's reading describes.

  Then any fact that is about that water. A river's Read gets the block of the gauge it
  reports from, in full. It gets the other gauges' `Sits` and `Speaks for` lines only,
  under a header that says they are patterns and not today's conditions.
- **`{unconfirmed}`** on a gauge heading keeps a drafted block out of every prompt.
  Remove it once the geography has been checked by someone who knows the river.
  Where two gauges sit either side of an inflow, check the draft against their readings
  first: the gain between them at low water is the inflow.
- **Reach notes** (`### Upper Current {#upper-current} {@07064533}`): matched to
  `river_sections.section_slug`. Tag each with the gauge or gauges that speak for it. A
  gauge's Read gets the reach notes tagged with it, and a note with no tag reaches chat
  only, so every reach note is tagged (a test holds this). On a river with one gauge,
  that gauge. Where a stretch sits well above its gauge, the note says so.
- **`### Towns`**: food, fuel and supplies for the river. Chat only; no Read gets it.
- **Anchor every river and subsection heading** with `{#slug}`. The slug must match
  `rivers.slug` / `river_sections.section_slug` exactly. Without an anchor the slug is
  guessed from the heading text, and the guess strips a trailing "River"/"Creek" —
  which is wrong for `big-river`, `bryant-creek`, `kings-river`, `war-eagle-creek`,
  `crooked-creek`, `caddo-river`, `spring-river`. A wrong slug fails **silently**:
  Eddy writes the river up from the General primer alone and sounds just as sure.
- Use bullet points for individual knowledge items
- Keep each item to 1-3 sentences — Eddy synthesizes, he doesn't recite
- **Don't send a reader to another river.** The Read prompt forbids suggesting a river
  it has no gauge data for, and chat only names another river for safety.
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

- Water temperatures on spring-fed rivers stay cold year-round (mid-50s to low 60s F).
- Most Ozark rivers are Class I-II. Serious whitewater is rare, but strainers (downed trees across the channel) are the #1 hazard.
- After heavy rain, rivers may become less clear and turn muddy. 
- **Recovery after high water**: Rivers with large spring inputs (Current, Niangua, Eleven Point) recover slowly over days. Rivers with smaller watersheds and less spring input (Huzzah, Courtois, upper Jacks Fork) can go from flooded to optimal quickly once rain stops. Watch the gauge trend — a steep drop means conditions are changing fast.
- **Not every river here is an Ozark river.** The Arkansas rivers (Buffalo, Kings, War Eagle, Crooked, Mulberry) drain the Boston Mountains: steeper, flashier, rain-driven, with a season that usually ends by midsummer. The Caddo is a **Ouachita** Mountain river, a different range with a different personality — the Ozarks spring-input reasoning does not apply to it at all.
- **Low water does not mean the same thing everywhere.** On big or dam-influenced water (lower Gasconade, lower Black, lower Buffalo, Big River's long pools) low water mostly costs you speed. On small rain-fed streams (Crooked, War Eagle, upper Bryant, upper Bourbeuse) low water genuinely ends the trip.
- **Low-head dams and low-water bridges are the deadliest structures in this set** — they appear on Big River, the James, War Eagle, the Spring River in both states, and across the Gasconade, Bryant, and Bourbeuse. Unlike rapids they get **more** dangerous as flow rises, and a rising river is never a reason to run one. Portage.

### Chat only

- Float season runs roughly **April through October**, with peak traffic Memorial Day through Labor Day.
- Weekends in June and July are the busiest. For a quieter float, go mid-week.
- The Ozarks are rural. Most river access points have no services: no restaurants, gas or groceries. Each river's towns are listed with the river.
- Always check with local outfitters before launching — they know about recent blowdowns, low-water bridges, and temporary hazards that gauges can't tell you.
- Missouri conservation areas along rivers typically have free access. National Park Service areas (Current, Jacks Fork, Buffalo) may have fees at developed access points.
- Take into account water level trends. A water level trending up should proceed with more caution than if it were trending down. Always seek guidance from local outfitters and authorities.

---

## Current River {#current}

The Current is the crown jewel of Ozarks floating — spring-fed, scenic, and reliable.
A chain of big springs feeds it from top to bottom, so it holds water better than almost
any river in the state. Where each spring enters decides which gauge sees its water.

- Best all-around river for beginners and experienced paddlers alike.
- NPS manages most access points. Akers Ferry, Pulltite, Round Spring, and Two Rivers have developed campgrounds.
- Current River is part of the Ozark National Scenic Riverways (ONSR) — the first national park area to protect a river system.
- The gauges sit far apart, on very different amounts of water. In a dry spell the upper gauges can read thin while the lower ones read fine, so quote the gauge nearest the put-in.

### Gauge: Van Buren {@07067000}

- **Sits**: At Van Buren, well down the river. Above it: the Jacks Fork, which joins at Two Rivers, and Blue Spring, which enters about 25 miles upstream. Below it: Big Spring, which enters about four miles downstream, so this gauge does NOT include Big Spring's water.
- **Speaks for**: The lower Current around Van Buren, from Blue Spring down to Big Spring.
- Eddy's primary gauge for the river, read in cfs.
- Akers, Montauk, and Powder Mill are the upstream references, and they can disagree with Van Buren by a lot in a dry spell.

### Gauge: Montauk {@07064440}

- **Sits**: At Montauk State Park, a mile and a half below the head of the river. Above it: Montauk Springs. Below it: Welch Spring and every other spring on the Current, so it reads far less water than any gauge downstream.
- **Speaks for**: The headwaters stretch, from Montauk down to Cedar Grove.
- Eddy reads it in gauge height (feet), not cfs.

### Gauge: Akers {@07064533}

- **Sits**: At Akers Ferry. Above it: Montauk Springs and Welch Spring, which enters about two and a half miles upstream. Below it: Cave Spring, Pulltite Spring, Round Spring and the springs beyond, so the river keeps gaining water below this gauge.
- **Speaks for**: Cedar Grove to Pulltite.
- Read in cfs. The staff-gauge numbers outfitters quote at Akers Ferry are a different reading.

### Gauge: Powder Mill {@07066510}

- **Sits**: Just above Powder Mill, about seven miles below Two Rivers. Above it: the Jacks Fork, which joins at Two Rivers. Below it: Blue Spring, which enters a mile and a half downstream, so this gauge does NOT include Blue Spring's water.
- **Speaks for**: Two Rivers down to Blue Spring.
- Eddy reads it in gauge height (feet), not cfs.

### Gauge: Doniphan {@07068000}

- **Sits**: At Doniphan, about 38 miles below Van Buren. Above it: Big Spring, which enters about 34 miles upstream, and everything above Van Buren.
- **Speaks for**: The Current below Big Spring, which is wide and deep, more like a slow river than a float stream.

### Upper Current {#upper-current} {@07064440} {@07064533}

- **Montauk to Cedar Grove** (~7 miles): Narrow, riffley, needs slightly more water than lower sections. Great half-day in a kayak.
- **Baptist Camp to Cedar Grove** (~8 miles): Opens up a bit. A few fun riffles. Good for canoes.
- **Cedar Grove to Akers** (~8 miles): Classic stretch. Bluffs start getting dramatic. The most popular day float on the upper section.
- Montauk State Park at the headwaters has trout fishing (catch and release / tags) and a lodge.
- **Cedar Grove is the year-round line on the Current.** From Cedar Grove down the river floats every month of the year — Welch Spring and the springs below it hold the base flow up even in a drought September. It is the upper river ABOVE Cedar Grove, the Montauk and Baptist Camp stretches, that goes scrapy and walk-it first. If the upper gauge is thin, move the put-in down to Cedar Grove rather than calling the Current off.
- Note the units before quoting a level: Eddy reads **Current above Akers in cfs**, while Montauk and Powder Mill are gauge height in feet, and the staff-gauge numbers outfitters quote at Akers Ferry are a third reading again. Don't mix them.

### Lower Current {#lower-current} {@07064533}

- **Akers to Pulltite** (~10 miles): The signature stretch, and one of the finest float trips in the Midwest. Big bluffs, deep pools, springs. Full-day float.
- **Pulltite to Round Spring** (~9 miles): More remote. Good overnight trip.
- **Round Spring to Two Rivers** (~18 miles): Long section, often done as a 2-day. Two Rivers is the take-out where Jacks Fork joins.
- This stretch handles low water better than the river above Akers, thanks to spring inputs along the way.
- Cave Spring, Pulltite Spring and Round Spring are all right on the river and worth exploring.
- Blue Spring, below Two Rivers near Powder Mill, is worth a stop — one of the deepest springs in Missouri.

### Towns

- Upper river: Montauk, Cedar Grove, Akers Ferry → nearest town is **Salem** (20-30 min west). Baptist Camp is near Licking.
- Middle river: Pulltite, Round Spring → nearest town is **Eminence** (30-40 min south). Akers Ferry is about 40 min north of Eminence.
- Lower river: Two Rivers, Big Spring → nearest town is **Van Buren** (10-15 min).

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
- The gauges cover very different amounts of river: the Meramec at Steelville can be a different river from the Meramec at Eureka on the same afternoon. Quote the gauge that speaks for the put-in.

### Upper Meramec {#upper-meramec} {@07013000}

- Above Meramec State Park. More rapids, narrower channel, scenic bluffs.
- St. James to Meramec State Park is the classic upper float.
- Needs a bit more water to float cleanly than the lower section.
- More experienced paddlers preferred — some Class II sections when water is up.
- **The Steelville outfitters run rafts well into the thin part of the season.** A typical late-summer reading here usually means shallow riffles and a lighter boat rather than a cancelled trip — the numbers on this gauge read worse than the water generally is. That is a correction to the numbers, not a promise about any given day: in a genuinely dry spell this stretch does drop too low, and the live condition is what decides.

### Lower Meramec {#lower-meramec} {@07014500} {@07019000}

- Below Meramec State Park to Sullivan area and beyond.
- Wider, calmer, more forgiving. Good for tubes, rafts, and large groups.
- Multiple outfitters operate in this stretch.
- Can get crowded on summer weekends — especially the Meramec State Park area.

### Gauge: Cook Station {@07010350}

- **Sits**: At Cook Station, in the headwaters. Above it: the rain-fed upper river only. Below it: Maramec Spring, so this gauge does NOT include the spring's water.
- **Speaks for**: The Meramec above Maramec Spring.
- Eddy reads it in gauge height (feet), not cfs.

### Gauge: Steelville {@07013000}

- **Sits**: Near Steelville. Above it: Maramec Spring. Below it: the Huzzah, carrying the Courtois, which joins about 15 miles downstream.
- **Speaks for**: Maramec Spring down to the Huzzah.
- Eddy's primary gauge for the river, read in cfs.

### Gauge: Sullivan {@07014500}

- **Sits**: Near Sullivan. Above it: the Huzzah and Courtois, which join about 17 miles upstream. Below it: the Bourbeuse, which joins about 51 miles downstream.
- **Speaks for**: The Huzzah down to the Bourbeuse.
- Eddy reads it in gauge height (feet), not cfs.

### Gauge: Eureka {@07019000}

- **Sits**: Near Eureka, on the lower river. Above it: the Bourbeuse, which joins about 32 miles upstream, and the Big River, which joins about three miles upstream.
- **Speaks for**: The lower Meramec from the Bourbeuse down. No gauge sits between the Bourbeuse and the Big River, so on that stretch this reading includes Big River water the river has not met yet.
- Eddy reads it in gauge height (feet), not cfs.

### Towns

- **Steelville** and **Sullivan** are the main towns. Meramec State Park is between them.

---

## Eleven Point River {#eleven-point}

Remote, scenic, and less crowded than the Current. Part of the National Wild and Scenic
Rivers system. Excellent for paddlers who want solitude.

- Best mid-June through September for reliable flows.
- Spring rains can bring murky water and fast rises — it's partially rain-fed.
- Greer Spring (the 2nd largest spring in Missouri) feeds into the Eleven Point, adding significant cold, clear water.
- The river below Greer Spring runs noticeably colder and clearer.
- Fewer outfitters and services than the Current — plan ahead for shuttles.
- **Bardley (07071500)** is the reference gauge, and Eddy reads it in **cfs**, not feet. The floatable range is narrow for a river this size, so a modest rise moves it out of its best levels quickly.
- Great for multi-day camping trips. Less developed, more wilderness feel.
- Wildlife is abundant — bald eagles, herons, otters are commonly spotted.

### Gauge: Bardley {@07071500}

- **Sits**: At the Highway 160 bridge at Riverton. Above it: Greer Spring, which enters about 21 miles upstream just above Greer Crossing, and Hurricane Creek, about 17 miles upstream. Below it: Frederick Creek, about seven miles down.
- **Speaks for**: Greer Crossing down, the river Greer Spring carries.
- Thomasville and Cane Bluff are above Greer Spring. The river there is far smaller than this reading shows and depends on rain. No gauge speaks for it.
- Eddy's only gauge on the river.

### Towns

- Greer Spring, Turner Mill, Riverton → nearest town is **Alton** (15-30 min).

---

## Jacks Fork River {#jacks-fork}

The Jacks Fork is the wild card of Ozarks floating — two different rivers either side of
Alley Spring. It joins the Current River at Two Rivers.

- **Alley Spring is the line between two different rivers.** Above it the Jacks Fork is rain-dependent and can be unfloatable for weeks. Below it, Alley Spring's roughly 81 million gallons a day carry the river, and Alley Spring → Eminence → Two Rivers floats all year, even when the upper river is done for the season.
- Rises and falls faster than any other Ozarks float stream after rain. Flash floods are a serious concern.
- Alley Spring (with the iconic red mill) is one of the most photographed spots in the Ozarks.
- When it's running right it's arguably the most beautiful float in Missouri.
- All three gauges read in cfs and sit on very different amounts of water, so quote the one that speaks for the put-in.

### Gauge: Eminence {@07066000}

- **Sits**: At Eminence, about six miles below Alley Spring. Above it: Alley Spring's inflow. Below it: Two Rivers, where the Jacks Fork joins the Current.
- **Speaks for**: Alley Spring to Two Rivers, the stretch the spring carries.
- Eddy's primary gauge for the river.
- Alley Spring to Eminence and Eminence to Two Rivers are the classic floats, and more manageable than the upper river.
- The outfitters' rule of thumb at Eminence is a gauge-height average, and below that average you may drag in spots with a loaded boat — that is a lighter-boat day, not a cancelled trip.

### Gauge: Alley Spring {@07065495}

- **Sits**: At Alley Spring, just ABOVE where the spring's water enters the river. Above it: the rain-fed upper river only. Below it: Alley Spring's inflow, so this gauge does NOT include the spring's water.
- **Speaks for**: The upper Jacks Fork, above Alley Spring.
- A low reading here says nothing about the river below the spring. The Eminence gauge speaks for that.
- The upper Jacks Fork is narrow, twisty, and technical. Not for beginners.
- It can go from floatable to unfloatable in 24 hours during dry spells.

### Gauge: Mountain View {@07065200}

- **Sits**: At Buck Hollow, about seven miles below the Prongs, where the North and South Prongs meet. Above it: both Prongs. Below it: Jam Up Creek, Leatherwood Creek and Bay Creek, small creeks that add water a little at a time on the way to Alley Spring. No large spring joins.
- **Speaks for**: The upper Jacks Fork, from the Prongs through Buck Hollow to Rymers.
- Rain-fed, and the smallest water on the river. The Alley Spring gauge, 24 miles down, sits on about two thirds more.

### Towns

- Alley Spring, Eminence, Two Rivers → **Eminence** is the hub.

---

## Niangua River {#niangua}

Two rivers in one, split at Bennett Spring — one of Missouri's largest springs. From the
spring down the Niangua holds a steady base flow through dry spells; above it the river
depends on rain.

- Bennett Spring State Park is a major trout fishing destination. The river below the spring is cold and clear.
- Moderate difficulty — suitable for most skill levels.
- Less dramatic bluffs than the Current or Eleven Point, but pleasant scenery.
- Several outfitters operate around Bennett Spring with good shuttle service.
- Tunnel Dam, a hydroelectric diversion, sits on the lower river — the Niangua is not a wholly free-flowing float below that point.

### Gauge: Windyville {@06923250}

- **Sits**: At Windyville, about 14 river miles ABOVE Bennett Spring. Above it: the rain-fed upper river only. Below it: Bennett Spring's inflow, so this gauge does NOT include the spring's water.
- **Speaks for**: The Niangua above Bennett Spring.
- A low reading here says nothing about the floats from Bennett Spring down, which the spring carries. The Tunnel Dam gauge is the only one below the spring.

### Gauge: Tunnel Dam {@06923950}

- **Sits**: At Tunnel Dam near Macks Creek, about 37 river miles below Bennett Spring. Above it: Bennett Spring's inflow and everything that joins the river below the spring.
- **Speaks for**: The Niangua from Bennett Spring down. It is the only gauge below the spring, and it sits well below the popular floats, so it can read more water than they carry.

### Towns

- **Lebanon** and **Bennett Spring** area.

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
- The Big Piney is the Gasconade's largest tributary and joins it near Devils Elbow, so a big rise here shows up at the Gasconade's Jerome gauge, about nine miles below the confluence.

### Gauge: Big Piney {@06930000}

- **Sits**: Near the town of Big Piney, about two thirds of the way down the river and 32 miles above the Gasconade. Above it: the Little Piney, Arthur Creek and Big Paddy Creek. Below it: Spring Creek, about 15 miles down.
- **Speaks for**: The river around Slabtown, Horse Camp and Ross, and on down toward the Gasconade.
- Put-ins far upstream carry much less water than this reading shows. The farther up you start, the bigger the gap.
- Eddy's only gauge on the river.

### Towns

- **Licking** (north) and **Houston** (south). Fort Leonard Wood / **Waynesville** is nearby.

---

## Gasconade River {#gasconade}

The Gasconade is the longest river entirely within Missouri (~280 miles) and the longest undammed river in the Ozarks — a winding, low-gradient float stream often called "one of the world's crookedest." Spring-influenced but runoff-responsive, with dolostone and sandstone bluffs, numerous springs and caves, and a strong smallmouth bass fishery. Mostly Class I (Class II is rare), and one of the least-crowded floats in the region — it's common to go miles without seeing another boat.

- The float hub is around **Jerome and Waynesville** on the middle river. Waynesville and Dixon serve the upper river; the town of Gasconade serves the lower river near the Missouri confluence.
- Three reference gauges span the river: **Hazelgreen** (upper, Eddy's primary), **Jerome** (middle, the most-cited float gauge), and **Rich Fountain** (lower). Each represents its own reach, so read the gauge nearest the put-in rather than one headline number for the whole river.
- Major tributaries include the Osage Fork, Roubidoux Creek, and the Big Piney. Many access points are low-water bridges, which become hazards when the river is up.
- **Losing reach on the upper river**: through the Narrows bend between Ozark Springs and Highway 17 (above Schlict Spring), much of the flow sinks underground in low water — roughly 75 cfs above the Narrows can drop below 30 cfs through it, leaving a weed-choked, walk-the-canoe trickle. The water returns about a mile downstream near Rockslide Bluff. An upstream gauge reading can overstate floatability through this stretch, so be cautious about the upper river in low water.
- **Rockslide Bluff**: a section of cliff collapsed into the river in 1971 and is now an interesting little rapid; springs bubble up from the riverbed here and the flow, and the floating, picks up noticeably below it.
- Strainers (downed trees) and low-water bridges are the main hazards. The gradient is gentle, so trouble comes from wood and structures more than from rapids.

### Upper Hazelgreen {#upper-hazelgreen} {@06928000}

- Represented by the Hazelgreen gauge, the upper-river reference. Winding, spring-influenced, good smallmouth water.
- Watch the losing reach above Schlict Spring in low water (see the river notes above) — the Hazelgreen reading can overstate what you will actually find through the Narrows.
- Floatable from around Highway E downstream; the highest put-ins need more water and can be scrapy.

### Mid Jerome {#mid-jerome} {@06933500}

- The popular middle float around Jerome and Waynesville, represented by the Jerome gauge, the most-cited Gasconade float gauge and the best single reference for a typical trip.
- High-quality smallmouth fishery, and where most outfitted trips run.
- Low-water bridges and strainers are the hazards to watch as water rises.

### Lower Richfountain {#lower-richfountain} {@06934000}

- Represented by the Rich Fountain gauge, toward the Missouri River confluence. Larger, slower water.
- On this bigger lower river, low water mainly affects your speed rather than whether you can float.
- Rises here arrive from the whole upstream drainage, so the gauge can climb even when local weather is dry.

### Gauge: Hazelgreen {@06928000}

- **Sits**: Near Hazelgreen, on the upper river. Above it: the Osage Fork, which joins just upstream of the gauge. Below it: Roubidoux Creek, which joins near Waynesville, and then the Big Piney, so the river carries far more water by Jerome than this gauge reads.
- **Speaks for**: The upper Gasconade, from the Osage Fork down to Roubidoux Creek.
- Eddy's primary gauge for the river.

### Gauge: Jerome {@06933500}

- **Sits**: At Jerome, on the middle river. Above it: Roubidoux Creek and the Big Piney, which joins about nine miles upstream, so this gauge DOES include the Big Piney's water.
- **Speaks for**: The middle Gasconade from the Big Piney down past Jerome.

### Gauge: Rich Fountain {@06934000}

- **Sits**: Near Rich Fountain, on the lower river, about 54 miles below Jerome. Above it: everything the Jerome gauge carries. Below it: the Missouri River, about 50 miles on.
- **Speaks for**: The lower Gasconade toward the Missouri River.

### Towns

- **Waynesville** and **Dixon** for the upper. **Gasconade** (town) for the lower.

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

### Gauge: Steelville {@07014000}

- **Sits**: At the Highway 8 bridge east of Steelville, about seven miles above the Meramec. Above it: Dry Creek, which joins right at the gauge, and Shoal Creek, about eight miles up. Below it: Courtois Creek, which joins about five miles down, just before the Meramec.
- **Speaks for**: The lower Huzzah, from Highway 8 down.
- Floats that start above Dry Creek have less water than this reading shows.
- Eddy's only gauge on the creek.

### Towns

- **Steelville** is the hub for both.

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

### Gauge: Steelville {@07014000}

- **Sits**: This gauge is on Huzzah Creek at Highway 8, not on the Courtois. The Courtois has no gauge. It joins the Huzzah about five miles below this gauge, so none of the Courtois's water is in the reading.
- **Speaks for**: The Courtois by comparison only. The two creeks drain neighbouring valleys of about the same size and often rise and fall together, but a storm over one valley can miss the other.
- Say the reading is from the Huzzah whenever you quote it for the Courtois.

### Towns

- **Steelville** is the hub for both.

---

## Black River {#black}

A clear southeast-Missouri Ozark float below the St. Francois Mountains, with two very different personalities split by Clearwater Lake. The Lesterville reach above the lake is a popular summer float — some of the clearest water in the Ozarks, big gravel bars, occasional bluffs, and good smallmouth and goggle-eye fishing. Below Clearwater Dam the river becomes a slower, dam-influenced reach toward Poplar Bluff, where it leaves the Ozarks into flat lowland water.

- The three forks (West largest, Middle, East smallest) converge near Lesterville; the main stem from there to Clearwater Lake is one of Missouri's more popular canoeing streams, with campgrounds and rentals in and below Lesterville.
- **Two reaches, two gauges.** The upper float reads off the **Annapolis** gauge — the only real-time gauge for that reach (the Lesterville gauge is discontinued). The **Poplar Bluff** gauge covers the lower reach, but sits about 26 river miles downstream on a larger drainage and reads roughly a quarter high, so treat it as a high-water safety ceiling, not a precise level.
- **Clearwater Dam** sits below the upper reach: its normal pool floods only a few miles of channel, but the flood pool can back up about ten miles toward the Highway K area, so the effective bottom of the float reach moves with lake level.
- The East Fork (Taum Sauk / Johnson's Shut-Ins / Bell Mountain) is not floatable; West Fork floats from around Centerville, Middle Fork from the Hwy 21-72 bridge.

### Upper Lesterville {#upper-lesterville} {@07061500}

- The clear, gravel-bar summer float from Lesterville down toward Clearwater Lake. Read the Annapolis gauge for this reach.
- Watch where Clearwater's flood pool reaches in high water — the lower end can be slack, backed-up lake rather than moving river.

### Lower Markham Hammer {#lower-markham-hammer} {@swl-clearwater-dam} {@07063000}

- Below Clearwater Dam: a dam-influenced tailwater reach where levels reflect the release schedule and can change independent of local rain.
- The Poplar Bluff gauge is the live reference but reads about a quarter high for this reach — lean on it for the high-water ceiling, not for fine floatability calls.

### Gauge: Annapolis {@07061500}

- **Sits**: Near Annapolis, above Clearwater Lake. Above it: the three forks, which meet near Lesterville. Below it: Clearwater Lake and its dam.
- **Speaks for**: The upper float, from Lesterville down to the lake.
- Eddy's primary gauge for the river, and the only real-time gauge for the upper float.

### Gauge: Clearwater Dam {@swl-clearwater-dam}

- **Sits**: At Clearwater Dam. It reports what the dam is releasing, not a river gauge's reading. Above it: the lake. Below it: the tailwater.
- **Speaks for**: The river just below the dam, where the level follows the release and can change with no local rain.

### Gauge: Poplar Bluff {@07063000}

- **Sits**: At Poplar Bluff, about 49 miles below Clearwater Dam, on a much larger drainage than the upper river. Above it: the dam's release and everything that joins the river below the dam.
- **Speaks for**: The lower river around Poplar Bluff.

### Towns

- **Lesterville** and **Annapolis** for the upper float; **Poplar Bluff** below Clearwater Dam.

---

## Bourbeuse River {#bourbeuse}

The slowest large stream in the Ozarks and one of its crookedest — it winds about 116 river miles in under 40 straight-line miles to reach the Meramec. Runoff-fed and usually murky (its watershed is mostly cleared farmland), so it responds fast to rain and drops to a trickle in dry spells. A quiet local's river: one small outfitter on the whole stream, mostly anglers after catfish, smallmouth up high, spotted bass lower down.

- **Often too low.** The upper half is frequently unfloatable without a lot of dragging in a dry summer — plan around recent rain, not the calendar.
- Two references: the **High Gate** gauge reads the upper river but is unreliable after rain (tributaries add water below it, so cross-check the **Union** gauge for a rise). Union reads the lower river well, except the Noser Mill to Spring Creek stretch, which runs lower than Union shows.
- **Spring Creek** (fed by Kratz Spring) enters about ten miles below Noser Mill and can nearly double the flow — below it the river is almost always floatable even when the upper river is not.
- Public access is scarce on the upper river, so trips there are often multi-day. Low-water bridges, logjams, and strainers are the main hazards; the gentle gradient means trouble comes from wood, not rapids.

### Upper Bourbeuse (Mint Spring to Noser Mill) {#upper-mintspring-nosermill} {@07015720}

- The half that goes unfloatable first. In a dry summer this is dragging, not floating, and public access is scarce enough that a trip here is often multi-day whether you planned it that way or not.
- High Gate is the gauge for this reach, and it is the unreliable one after rain — cross-check Union before trusting a rise.

### Lower Bourbeuse (Noser Mill to the Meramec) {#lower-nosermill-meramec} {@07016500}

- Spring Creek enters about ten miles below Noser Mill and can nearly double the flow. Below that confluence the river is almost always floatable even when the upper half is not.
- Union reads this reach well — except the Noser Mill to Spring Creek stretch above the confluence, which runs lower than Union shows.

### Gauge: High Gate {@07015720}

- **Sits**: Near High Gate, far up the river, about 12 miles above Mint Spring, the first put-in. Above it: Lanes Fork and Clear Creek. Below it: Brush Creek, which joins just below the Highway 19 bridge, and the Dry Fork, a few miles farther down. Between them they more than double the river.
- **Speaks for**: The upper Bourbeuse, Mint Spring to Highway H.
- From the Highway 19 bridge down, Brush Creek and the Dry Fork have joined and the river carries more than this reading shows.
- Rated on its own levels.

### Gauge: Union {@07016500}

- **Sits**: At Union, about 16 miles above the Meramec. Above it: nearly the whole river, with the Dry Fork, the Little Bourbeuse, Red Oak Creek, Boone Creek and Spring Creek. Below it: no sizeable creek before the Meramec.
- **Speaks for**: The middle and lower river, from Mill Rock down.
- It is a long way below the upper put-ins. A rise takes time to reach it, and the upper river can be thin while this gauge reads fine.
- Eddy's primary gauge for the river.

### Towns

- **Union** on the lower river. The upper river runs through farm country with almost no services.

---

## Buffalo River {#buffalo}

The Buffalo National River — America's first National River (1972) — is a free-flowing, rain-driven stream draining the Boston Mountains of northwest Arkansas, managed by the National Park Service. Its personality changes sharply top to bottom: the upper river is flashy and seasonal, floatable mainly spring into early summer, while the lower river holds water nearly year-round and reads more like flatwater.

- **Ponca to Pruitt** is the classic upper float and the most level-sensitive reach on the river — too low and you drag, too high and the bluffs turn hazardous. Season is typically March through June, sometimes into July with rain.
- Read the gauge that matches your reach: **Ponca** is the canonical upper-river floatability gauge, **St. Joe** (Tyler Bend) is the middle-district reference and Eddy's primary for the river, and **Harriet**, at the Highway 14 bridge, is the lowest before the White River confluence.
- When it's too low to launch at Ponca, outfitters shift the put-in about two miles down to Steel Creek — there's no published numeric cutoff, it's a daily operational call.
- Flash floods and strainers are the serious hazards on the flashy upper reaches; the lower river below Gilbert is calmer, where low water mostly affects speed rather than whether you can float.

### Upper (Ponca to Pruitt) {#upper-ponca-pruitt} {@07055660}

- The classic float and the most level-sensitive water on the river — a narrow window between dragging and dangerous, under the tallest bluffs in the park.
- Read Ponca for this reach, not St. Joe. When Ponca won't float, the put-in moves down to Steel Creek — an outfitter call made daily, not a number you can look up.

### Middle (Pruitt to Gilbert / Tyler Bend) {#middle-pruitt-gilbert} {@07056000}

- The middle district, represented by St. Joe (Tyler Bend). Holds floatable water later into the summer than the Ponca reach but is still rain-driven.

### Lower (Gilbert to Buffalo City) {#lower-gilbert-buffalocity} {@07056700}

- Calmer, holds water nearly year-round, and reads more like flatwater than float. Low water here mostly costs speed rather than ending the trip.
- The Harriet gauge, at the Highway 14 bridge, is the lowest before the White River confluence.

### Gauge: Boxley {@07055646}

- **Sits**: Above Boxley, at the top of the valley. Above it: the headwaters only. Below it: Beech Creek, about two miles down at Boxley, and the side creeks of Boxley Valley. The river has doubled by Ponca.
- **Speaks for**: Boxley Valley, from Boxley down to Ponca.

### Gauge: Ponca {@07055660}

- **Sits**: At Ponca. Above it: Boxley Valley and its creeks. Below it: Cove Creek and small side creeks. The river gains slowly from here to Pruitt.
- **Speaks for**: The upper river, Ponca through Steel Creek and Kyles Landing to Erbie.

### Gauge: Pruitt {@07055680}

- **Sits**: At Pruitt. Above it: the upper river from Ponca. Below it: Mill Creek, just below the gauge, and then the Little Buffalo, which joins about four miles down and nearly doubles the river.
- **Speaks for**: Ozark and Pruitt, down to the Little Buffalo.
- From Hasty on, the Little Buffalo has joined and the river carries far more than this gauge reads.

### Gauge: St. Joe {@07056000}

- **Sits**: At the Highway 65 bridge, by Grinders Ferry and just below Tyler Bend. Above it: the Little Buffalo, Big Creek at Carver, Cave Creek, Richland Creek at Woolum, and Calf Creek, all of which join between Pruitt and here. Below it: Bear Creek, about five miles down, just past Gilbert.
- **Speaks for**: The middle river, Hasty to Gilbert.
- It is truest from Woolum down. Between Hasty and Woolum, Big Creek, Cave Creek and Richland Creek have not all joined yet, so the river carries less than this reading shows.
- Eddy's primary gauge for the river.

### Gauge: Harriet {@07056700}

- **Sits**: At the Highway 14 bridge (Dillards Ferry) near Harriet, about 26 miles below the St. Joe gauge. Above it: everything the St. Joe gauge carries and the creeks that join below Gilbert. Below it: Buffalo Point and Rush, then the White River.
- **Speaks for**: The lower Buffalo, from Gilbert down.
- The lowest gauge on the river, before the White River.

### Towns

- **Ponca** and **Jasper** up top, **Harrison** as the regional hub, **Yellville** and Gilbert lower down.

---

## St. Francis River {#st-francis}

Missouri's only whitewater river. The upper St. Francis through Millstream Gardens and Silver Mines — the Tiemann Shut-ins — is a short, rain-dependent Class II–IV pool-drop run that spikes and drops fast and stays cold. Below the shut-ins it mellows and floats more like an ordinary stream toward Sam A. Baker State Park and Wappapello Lake.

- **The whitewater reach is genuinely serious** — Class II–IV pool-drop through the shut-ins, committing at high water, and unrunnable rock when too low. This is the one Missouri float where "experienced paddlers only" is the right framing for the upper run.
- Levels on the upper river are read as **stage in feet from the Roselle (NWS) gauge**, not discharge — the old USGS discharge record ended in 1997. The Patterson gauge covers the lower river toward Wappapello.
- Rain-dependent and flashy: it can be a runnable river one day and dry rock the next. The Missouri Whitewater Championships run the reach each spring, contingent on water level — verify before traveling.

### Upper Whitewater {#upper-whitewater} {@07034000}

- Millstream Gardens to Silver Mines (the Tiemann Shut-ins): a Class II–IV pool-drop run, swift drops separated by calm pools, run mainly during spring high water. Cold water and committing at high flows.
- Below the runnable minimum the shut-ins are unrunnable rock — a drag or portage, not a float.

### Lower Float {#lower-float} {@07037500}

- Silver Mines down toward Sam A. Baker State Park and Wappapello: a normal-stream float, much calmer than the shut-ins.
- On this reach low water mainly affects your speed rather than whether you can float.

### Gauge: Roselle {@07034000}

- **Sits**: Near Roselle, about three miles above Millstream Gardens and the Tiemann Shut-ins. Above it: the upper river, with Wolf Creek and Doe Run Creek. Below it: the Little St. Francis, which joins about seven miles down, just below Silver Mines, and adds more than half again.
- **Speaks for**: The whitewater run through the shut-ins, Millstream Gardens to Silver Mines, and the river above it.
- Its levels are whitewater levels, read in feet. They say nothing about the lower river: below the Little St. Francis, the Patterson gauge is the one on that water.
- Eddy's primary gauge for the river.

### Gauge: Patterson {@07037500}

- **Sits**: At the Highway 34 bridge near Patterson, about four miles below Sam A. Baker State Park. Above it: the Little St. Francis, Marble Creek, Twelvemile Creek and Big Creek, which joins at Sam A. Baker. Below it: Clark Creek, then Wappapello Lake.
- **Speaks for**: The lower St. Francis, from the Little St. Francis down through Jewett, Sam A. Baker and Highway 34 toward Wappapello.
- Unrated. Eddy has no float levels for this gauge, so describe the reading and which way it is moving and give no condition. Only flood stage reads Dangerous here.

### Towns

- **Fredericktown** for the shut-ins; **Piedmont** and Sam A. Baker State Park lower down.

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

### Washington State Park to Mammoth {#washington-state-park-to-mammoth} {@07018100}

- The popular short float — about three miles, beginner-friendly, and dam-free. The park concession rents boats here Memorial Day through Labor Day, so summer weekends are busy.
- Richwoods is the gauge that represents this reach; Byrnesville reads high for it.

### Mammoth to Merrill Horne {#mammoth-to-merrill-horne} {@07018100}

- The quieter wooded reach below the park float, and good smallmouth and rock bass water. Still dam-free.

### Morse Mill to Cedar Hill {#morse-mill-to-cedar-hill} {@07018500}

- Dam country: Morse Mill at the top (portage right) and the Cedar Hill mill dam at the bottom (portage left, where the MDC Cedar Hill Access is also the best take-out in the stretch). Portage both at every level.
- Byrnesville is the nearest gauge to this reach and the right one to read here.

### Gauge: Richwoods {@07018100}

- **Sits**: Near Richwoods, about six miles below Mammoth Access and 54 miles above the Meramec. Above it: Cedar Creek, Flat River, Terre Bleue Creek, Mill Creek and Mineral Fork, which joins about eight miles up, between Washington State Park and Mammoth. Below it: no sizeable creek before Byrnesville.
- **Speaks for**: The middle river, Mammoth to Brown's Ford.
- From Washington State Park up, Mineral Fork has not joined yet and the river carries less than this reading shows.
- Eddy's primary gauge for the river.

### Gauge: Byrnesville {@07018500}

- **Sits**: At Byrnesville, about 14 miles above the Meramec. Above it: everything the Richwoods gauge reads and 40 more miles of river with no sizeable creek. Below it: the last miles to the Meramec.
- **Speaks for**: The lower river: Morse Mill, Cedar Hill and Rockford Beach.
- Rated on its own levels.

### Towns

- **De Soto**, **Potosi**, and **Bonne Terre**. Washington State Park is the float hub.

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

### Vera Cruz to Highway 95 {#vera-cruz-to-hwy-95} {@07058000}

- The upper reach: narrow, twisty, and frequently choked with deadfall and willow strainers. Needs higher water than anything below it and is often not floatable at all in summer without dragging.
- This is the reach the Tecumseh gauge flatters most, since it sits at the far bottom of the creek. Treat a merely adequate reading as too low up here.

### Sycamore / Hodgson Mill to Warren Bridge {#hodgson-mill-to-warren-bridge} {@07058000}

- The traditionally popular reach, passing The Narrows bend. Sycamore is the only open MDC access on the creek, so this is the stretch with a real put-in rather than a road crossing.

### Florence Cook to the North Fork confluence {#cooks-landing-to-north-fork-confluence} {@07058000}

- Norfork Lake backwater when the lake is up: flat water rather than float, and the current quits well before the take-out does. Plan for paddling, and for wind.

### Gauge: Tecumseh {@07058000}

- **Sits**: Near Tecumseh, at the very bottom of the creek, about four miles above the North Fork. Above it: every sizeable creek on the Bryant, with Hunter Creek, Fox Creek, Spring Creek and Brush Creek, and Pine Creek, which joins just above the gauge. Below it: only the backwater of Norfork Lake.
- **Speaks for**: The lower creek, from Warren Bridge down.
- It reads more water than any float upstream has. Fox Creek and Spring Creek join 25 to 28 miles up, between Vera Cruz and Hodgson Mill.
- Eddy's only gauge on the creek.

### Towns

- **Ava** to the north, **Gainesville** to the south. Nothing along the creek itself.

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

### North Fork main reach (SH 14 → Tecumseh) {#north-fork-main} {@07057500}

- The popular float, and the reach the Tecumseh gauge actually represents. Class I–II with two things to plan around: The Falls above River of Life Farm, and Dawt Mill Dam near the take-out.
- Cold water year-round is a feature of this reach, not a seasonal caveat — dress for immersion even in midsummer.

### Gauge: Tecumseh {@07057500}

- **Sits**: Near Tecumseh, at the bottom of the floated river. Above it: Rainbow Spring and the other springs that carry the river, and Spring Creek, which joins near the Highway 14 bridge about 18 miles up. Below it: Bryant Creek, about five miles down, in the lake's backwater.
- **Speaks for**: The spring-fed river, from Rainbow Spring down to Tecumseh.
- Above the springs the river is much smaller than this reading shows.
- Eddy's only gauge on the river.

### Towns

- **West Plains**, **Gainesville**, **Dora**, **Tecumseh**. Cell service through the corridor is patchy.

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

### Lower / Galena reach {#james-galena} {@07052500}

- Hootentown to the Galena Y-Bridge, roughly 22 miles — the classic float, clear and Class I, and the reach the Galena gauge represents.
- The take-out end feels Table Rock backwater when the lake is high: slack water and slower going before you actually arrive.

### Upper / urban reach {#james-upper} {@07052250}

- Hwy 125 down to Hootentown: urban runoff and wastewater-treatment influence, flashy and rain-driven, floatable only at medium-to-high water. Not a summer trip.
- Portage the Kissick low-head dam. Read Boaz or Springfield here — never the Galena number.

### Gauge: Boaz {@07052250}

- **Sits**: Near Boaz, between Delaware Town and Shelvin Rock. Above it: Wilsons Creek, which joins about seven miles up. Below it: Finley Creek, which joins about four miles down, above Hootentown, and adds more than half again.
- **Speaks for**: The James above Finley Creek: Joe Crighton, Delaware Town and Shelvin Rock.
- Rated on its own levels. Its High and Dangerous lines are provisional, set by the owner on 2026-11-19.

### Gauge: Galena {@07052500}

- **Sits**: At the Galena Y-Bridge, at the bottom of the floated river. Above it: Finley Creek, about 25 miles up, and Crane Creek, about nine miles up. Below it: the river runs on to Table Rock Lake.
- **Speaks for**: Hootentown to Galena, the classic lower float.
- Hootentown, at the top of that float, has less water than this reading shows until Crane Creek joins.
- Eddy's primary gauge for the river.

### Towns

- **Galena** and **Crane** at the take-out end; **Springfield** and **Nixa** upstream.

---

## Spring River (Missouri) {#spring-river-mo}

A western-edge Ozark stream running from Lawrence County through Carthage and on toward the Kansas line — prairie-border country rather than bluff-and-spring Ozarks. Smallmouth, spotted bass, and rock bass water, floated almost entirely by locals. Note this is **not** the Arkansas Spring River at Mammoth Spring; same name, different basin, different gauges.

- **There are no outfitters on this river.** No liveries, no shuttles, no rental boats — it is a self-shuttle float from free public accesses (MDC's La Russell access and the Carthage city river parks, including Kellogg Lake and Spring River Park). If a web result names a Carthage outfitter with a "Rainbow Bridge" put-in or a "Ragin' Waters Landing" take-out, that listing is unverified AI-generated travel content and those businesses could not be confirmed to exist. Do not send anyone to them.
- **The float ladder here is statistical, not a vetted float key.** No outfitter or agency publishes floatability levels for this river, so the thresholds come from long-run gauge percentiles at Carthage. Talk about trend and direction, and be more hedged about "good" and "too low" than on a calibrated river.
- The one piece of local guidance that does exist is blunt and worth repeating: don't float on high water, and if the water is brown or carrying debris, stay out.
- **Two low-head dams to portage**: the Hwy 96 dam (portage river-right) and the old mill dam near Galesburg. Scout both.
- **Two gauges, very different drainages.** Carthage (07185765, ~425 sq mi) sits mid-reach and is the representative gauge. Waco (07186000, ~1,164 sq mi) is well downstream near the Kansas line, on nearly three times the drainage — it is not a substitute for Carthage. Put-ins below the North Fork are on Waco's water, and Waco has no float levels, so they get a reading and no condition.
- Public accesses sit roughly 3–7 miles apart down to Kafir Bridge, the last Missouri access above the state line. Below the line you are in Kansas, where floating requires landowner permission.
- Carthage has dammed and milled this river since the 1840s, and the industrial legacy around the old millrace still affects water quality on that stretch. Nearest towns are Carthage and Sarcoxie; Joplin is the nearest city.

### Gauge: Carthage {@07185765}

- **Sits**: At Carthage. Above it: the upper river, with Honey Creek, Stahl Creek and White Oak Creek. Below it: the North Fork of the Spring River, which joins about 19 miles down, just above the Highway 270 bridge, and more than doubles the river.
- **Speaks for**: The river above the North Fork, from Highway 97 through Carthage to the old mill dam at Galesburg.
- It says nothing about the river below the North Fork.
- Eddy's primary gauge for the river.

### Gauge: Waco {@07186000}

- **Sits**: Near Waco, about three miles below the North Fork. Above it: the North Fork, which brings more water than the main river does. Below it: Cow Creek and Center Creek, then the Kansas line.
- **Speaks for**: The river from the North Fork down: the Highway 270 bridge, Maple Lane and Kafir Bridge.
- Unrated. Eddy has no float levels for this gauge, so describe the reading and which way it is moving and give no condition. Only flood stage reads Dangerous here.

### Towns

- **Carthage** and **Sarcoxie**; **Joplin** is the nearest city.

---

## Spring River (Arkansas) {#spring-river}

Arkansas's Spring River rises at Mammoth Spring and runs cold, clear, and remarkably steady past Hardy toward the Black River. Mammoth Spring's enormous, constant 58°F baseflow means this river is effectively never too low to float — the questions here are cold, ledges, and crowds, not water level.

- **It is essentially always floatable, and that is the trap.** Because the spring holds the flow up, people underestimate it: the water is genuinely cold year-round, and a swim in the ledges is a hypothermia risk even on a hot August afternoon.
- **The ledges are the hazard.** Saddler Falls and High Falls are Class I–II drops that regularly flip loaded canoes, and low-head Dams #1 and #3 need portaging, especially in high water. Rafts and hard-shell kayaks handle them better than open canoes.
- The classic float is Dam 3 / Riverside down to Hardy, about 15 miles, with the main put-in roughly three miles below the spring. AGFC stocks trout in the cold upper stretch; smallmouth, walleye, and tiger muskie live below.
- **Do not read NWS flood stage as the danger line.** Flood stage at Hardy is a stage-height category on a river whose floatable range is a few hundred cfs — high water on this river arrives long before the flood category does.
- **Hardy (07069305)** at the Spring Street bridge is the primary gauge; **Imboden (07069500)** sits on the lower river toward the Black River confluence, which is larger, warmer, and has no float levels of its own. Put-ins there are graded by Hardy.
- The Hardy stretch is a party-float destination on summer weekends. Nearest towns: Mammoth Spring, Hardy, and Cherokee Village.

### Mammoth Spring / Dam 3 to Hardy {#spring-reach1} {@07069305}

- The classic run, about 15 miles, holding all the named ledges — Saddler Falls, High Falls, and the low-head dams. Coldest, clearest water on the river and the busiest on a summer weekend.
- Level is rarely the question here; cold, ledges, and boat choice are. Open canoes swamp in the drops that rafts shrug off.

### Hardy toward Imboden and the Black {#spring-reach2} {@07069305} {@07069500}

- Below Hardy the river grows, warms, and slows toward the Black River confluence. The Imboden gauge sits on it, but this reach has no vetted float key and is graded by the Hardy gauge upstream — be more hedged here than on the Hardy run.

### Gauge: Hardy {@07069305}

- **Sits**: At the Spring Street bridge in Hardy, about 18 miles below Mammoth Spring. Above it: Mammoth Spring, which carries the river, and Myatt Creek, which joins about six miles up. Below it: Martins Creek and Janes Creek, on the way to Imboden.
- **Speaks for**: Mammoth Spring to Hardy on its own water, and Hardy to Imboden as the nearest rated gauge.
- Below Hardy the river carries more than this reads: about 15% more at Imboden in low water and about a third more when Hardy is high.
- Eddy's primary gauge for the river.

### Gauge: Imboden {@07069500}

- **Sits**: At Imboden, about 27 miles below Hardy and eight above the Black River. Above it: everything the Hardy gauge reads, plus Martins Creek and Janes Creek. Below it: the last miles to the Black River.
- **Speaks for**: The lower river around Ravenden and Imboden.
- Borrowed. Eddy has no float levels for this gauge, so the Ravenden and Imboden put-ins are graded by the Hardy gauge. This gauge runs above Hardy: about 15% in low water and about a third when Hardy is high.

### Towns

- **Mammoth Spring**, **Hardy**, **Cherokee Village**.

---

## Kings River {#kings-river}

A free-flowing, undammed Ozark stream running about 90 miles north out of the Boston Mountains to the White River arm of Table Rock Lake. Arkansas has designated it an Extraordinary Resource Waterbody. Rain-fed and flashy: it floats best late winter through June and usually drops out by midsummer.

- **The top eleven miles are not a float.** Dripping Springs down to Hwy 74 is turbulent Class III+ whitewater with a waterfall — advanced paddlers only. The Berryville gauge is far downstream of it and only a rough proxy; that reach needs high spring flows.
- **Berryville (07050500)** reads the middle river and is the only reference for the whole stream. Its levels are best calibrated at the minimum-floatable end, so lean on trend and on "enough water / not enough water" rather than implying a finely tuned sweet spot.
- Rockhouse to Trigger Gap is the most popular day float, running through Nature Conservancy land with rock features, gravel bars, and deep swimming holes. Trigger Gap to Hwy 62 is the trophy smallmouth reach (18-inch minimum).
- **Low-water bridges must be portaged.** One near the end of the Trigger Gap–to–US 62 stretch has its center blasted out; outfitters advise the middle line or a portage left. Never run a submerged crossing.
- **The bottom reach outlasts the rest.** Hwy 62 down to MO 86 holds water into August thanks to Table Rock backwater — but expect slack water, wind, and motorboats down there, not a moving float.
- Access is a mix of road crossings and private/fee accesses through the Berryville and Eureka Springs outfitters. Nearest towns: Berryville, Eureka Springs, Marble.

### Gauge: Berryville {@07050500}

- **Sits**: Near Berryville, below the Highway 62 bridge, about 33 miles above the river's mouth. Above it: most of the river, with Osage Creek, the largest tributary, which joins about five miles up at Highway 62, and Keels Creek. Below it: no sizeable creek.
- **Speaks for**: The lower river, from Highway 62 down.
- Above Osage Creek, which is most of the floated river, there is less water than this reading shows, and less again the farther up you start.
- Eddy's only gauge on the river.

### Towns

- **Berryville**, **Eureka Springs**, **Marble**.

---

## War Eagle Creek {#war-eagle-creek}

A scenic Class I northwest-Arkansas float running past Withrow Springs State Park and the historic War Eagle Mill to Beaver Lake, framed by tall limestone bluffs. Rain-dependent and flashy — a spring-runoff creek that usually goes too low by midsummer.

- **War Eagle Mill's low-head dam must be portaged**, and it is a hard portage: steep banks on both sides. It sits just above the Beaver Lake backwater near the end of the float.
- **The float key is in gauge height, not discharge.** Local sources all describe War Eagle in feet on the Hindsville gauge (07049000) — the "Hwy 45 gauge" people refer to is this same station, and Eddy's levels follow the range local paddlers cite. There is little room between a good level and a dangerous one on this creek: the usable range and the dangerous range sit close together.
- The upper reaches, from the Hwy 23 fish hatchery down through Hwy 412, are the liveliest water (Class I–II) and the first to go too skinny. Withrow Springs down to Hindsville is the gentler, more reliable middle.
- Low-water bridges and concrete slabs cross the creek and become strainers when water is up — scout and portage rather than running them.
- **This creek rises fast.** It drains a small, steep watershed, so a storm upstream shows up quickly and leaves quickly. A rising gauge is a reason to stay off, not to hurry.
- Best March through June. Nearest towns: Huntsville, Springdale, and Rogers. The War Eagle Mill area gets very busy during the craft fair.

### Hwy 23 hatchery to Hwy 412 {#hatchery-to-hwy-412} {@07049000}

- The liveliest water on the creek (Class I–II) and the first reach to go too skinny. It needs more water than the middle of the creek does.

### Withrow Springs to Hwy 45 (Hindsville) {#withrow-springs-to-hwy-45} {@07049000}

- The gentler, more reliable middle reach, past Withrow Springs State Park. The Hindsville gauge sits at the bottom of this stretch, so it represents this water better than anything else on the creek.

### Hwy 45 (Hindsville) to War Eagle Mill {#hwy-45-to-war-eagle-mill} {@07049000}

- Ends at the War Eagle Mill low-head dam — a required portage with steep banks on both sides, just above Beaver Lake backwater.
- When Beaver Lake is up, the last of this reach is flat lake water rather than creek.

### Gauge: Hindsville {@07049000}

- **Sits**: At the Highway 45 bridge near Hindsville. Above it: the upper creek and its small side creeks. Nothing large joins. Below it: Clifty Creek, about six miles down, then War Eagle Mill.
- **Speaks for**: The floated creek, Withrow Springs to War Eagle Mill.
- The creek gains water slowly, so the reading holds along the float and runs a little generous at the top.
- Eddy's only gauge on the creek.

### Towns

- **Huntsville**, **Springdale**, **Rogers**.

---

## Crooked Creek {#crooked-creek}

A clear, gravel-bottomed Ozark stream crossing north-central Arkansas to the White River near Cotter. A Blue Ribbon smallmouth fishery and an AGFC Water Trail — easy Class I floating past long gravel bars and riffles, with fishing rather than paddling as the main draw.

- **Entirely rain-fed, with no spring support.** It drops skinny quickly in summer, so spring is the float window and a dry July usually means wading, not floating. On this creek, low water genuinely stops trips rather than just slowing them.
- **Kelly's Slab is the named hazard** — a concrete low-water crossing at the Fred Berry Conservation Education Center near Yellville. Scout and portage; water flowing over the slab makes it dangerous.
- Flashy on the other end too: it can go from a clear gravel creek to a torrent quickly after upstream rain, and it clears slowly compared to a spring-fed stream. There is no official flood gauge here — treat any rapid rise as dangerous on its own terms.
- **Kelly Crossing at Yellville (07055607)** is the reference gauge, near the middle of the floatable water, and it reads in **gauge height (feet)**. The upper reach from Harmon to Pyatt is the liveliest (Class I–II); everything below is easy Class I.
- Smallmouth regulations here are stricter than general statewide rules — anglers should check current AGFC limits for the Blue Ribbon stretch before keeping fish.
- Nearest towns: Yellville, Harrison, and Cotter.

### Harmon to Pyatt {#harmon-to-pyatt} {@07055607}

- The liveliest reach on the creek (Class I–II) and the farthest above the gauge, so it goes too skinny before the reading does.

### Kelly's Slab to Yellville {#kellys-slab-to-yellville} {@07055607}

- Starts at the named hazard: Kelly's Slab, the concrete low-water crossing at the Fred Berry Conservation Education Center. Scout and portage — water moving over the slab is dangerous.
- The gauge sits right here, so this is the reach its reading describes most honestly.

### Gauge: Yellville {@07055607}

- **Sits**: At Kelley's Slab in Yellville. Above it: Clear Creek and Hampton Creek, which join about 16 miles up, below Pyatt. Below it: Mill Creek, about four miles down, on the way to the White River.
- **Speaks for**: Snow down through Kelley's Slab and Yellville.
- Above Clear Creek, around Pyatt and Harmon, the creek has about a third less water than this reading shows.
- Eddy's only gauge on the creek.

### Towns

- **Yellville**, **Harrison**, **Cotter**.

---

## Caddo River {#caddo-river}

A clear Ouachita Mountain stream — **not** an Ozark river — and one of Arkansas's most popular family floats, running east past the boulder gorge at Caddo Gap toward DeGray Lake. The classic Caddo Gap to Glenwood run mixes fun Class I–II rock gardens with long, calm pools.

- **Flash flooding is the number one danger.** The Caddo rises several feet very fast during and after heavy rain. The same region's 2010 Albert Pike flood on the nearby Little Missouri killed about twenty campers on gravel bars — never camp low on a bar, and get off the water when the gauge is rising or storms are working upstream.
- **The float key is gauge height in feet** on the Caddo Gap gauge (07359610), matching the local outfitter key. The bottom of the floatable range is the bony, rock-dodging, family-pace end: four to six hours, fine for beginners, plenty of scraping. The gauge also reports discharge, but the community talks in feet.
- Caddo Gap to Glenwood is the classic run. Norman to Caddo Gap is the upper alternative (also I–II); Glenwood down toward Amity and the DeGray headwaters is easier and slower.
- The long lower run below Glenwood holds an isolated Class III hole and wave train at high water — a genuine step up from the family float upstream.
- **Ouachita, not Ozark.** The general Ozarks hydrology notes about spring inputs do not apply here: this is a mountain river with a flashier, rain-driven personality and a shorter reliable season.
- The corridor is mostly private land between public accesses. Nearest towns: Glenwood, Caddo Gap, Norman, and Mount Ida.

### Caddo Gap to Glenwood {#caddo-gap-to-glenwood} {@07359610}

- The classic run and the one the Caddo Gap gauge is keyed to: Class I–II rock gardens separated by long calm pools, four to six hours when the water is on the low side.
- Flashy enough that a rising gauge ends the trip — this is gravel-bar country and gravel bars are exactly where flash floods kill people.

### Norman to Caddo Gap {#norman-to-caddo-gap} {@07359610}

- The upper alternative, also Class I–II, above the boulder gorge at Caddo Gap. Needs more water than the classic run and drops out sooner.

### Glenwood to Amity / DeGray headwaters {#glenwood-to-amity} {@07359610}

- Easier and slower than the run above, trending toward DeGray Lake. The long version of this reach holds an isolated Class III hole and wave train that only shows up at high water.

### Gauge: Caddo Gap {@07359610}

- **Sits**: Near Caddo Gap, about two miles below the swinging bridge. Above it: Polk Creek, Lick Creek and Collier Creek. Below it: the South Fork of the Caddo, which joins under two miles down and adds about a third.
- **Speaks for**: Caddo Gap to Glenwood.
- Norman, upstream, has less water than this reading shows. Below the South Fork the river has more.
- Eddy's only gauge on the river.

### Towns

- **Glenwood**, **Caddo Gap**, **Norman**, **Mount Ida**.

---

## Mulberry River {#mulberry}

Arkansas's premier whitewater float and a National Wild and Scenic River, running free out of the Boston Mountains through the Ozark National Forest. Reliable Class I–II rapids that stiffen toward II+ and III at high water, under scenic canyon walls. Best fall through spring — it is usually too low by midsummer.

- **Notoriously flashy.** It runs a few hundred cfs on a normal day and peaks in the tens of thousands after a big storm. Rises arrive within hours of upstream rain. Never launch on a rising gauge or with heavy rain in the forecast upstream.
- **Levels are read in feet** on the Mulberry near Mulberry gauge (07252000). Every authoritative source — the Turner Bend key, Byrd's, American Whitewater — publishes in gauge height, and essentially nobody publishes cfs floatability numbers for this river.
- Turner Bend is the hub: outfitter, store, shuttle, and the traditional staff-gauge reference. Redding, Wolf Pen, and Byrd's are the Forest Service and private campgrounds along the corridor.
- **Low-water bridges** near Turner Bend and Redding need the right-hand line at normal flow and become impassable, dangerous strainers when the water comes up — outfitters stop renting well before the river becomes unrunnable.
- Reach difficulty climbs upstream: Wolf Pen to Redding is the stiffest (II+), Redding to Turner Bend the classic I–III run, and Turner Bend downstream mellows to I–II.
- This is the one Arkansas river in Eddy's set where "experienced paddlers" is the right framing at the high end — high water here is whitewater, not a fast float. Nearest towns: Ozark, Cass, and Oark.

### Wolf Pen to Redding {#wolf-pen-to-redding} {@07252000}

- The stiffest reach on the river (II+), highest in the corridor and the first to go too low. It needs more water than the runs below it and rewards experience.

### Redding to Turner Bend {#redding-to-turner-bend} {@07252000}

- The classic run, I–III depending on level, ending at the outfitter-and-store hub. The low-water bridges near Redding and Turner Bend want the right-hand line at normal flow and are dangerous strainers once the water is up.

### Turner Bend to Campbell Cemetery {#turner-bend-to-campbell-cemetery} {@07252000}

- Below the hub the river mellows to I–II — the gentler end of the Mulberry, though still flashy and still not a beginner river on a rising gauge.

### Gauge: Mulberry {@07252000}

- **Sits**: Near the town of Mulberry, at the bottom of the floated river, just above the Mill Creek access. Above it: the Little Mulberry, which joins between Wolf Pen and Byrd's, and Hurricane Creek, about six miles up. Below it: Mill Creek, then the Arkansas River.
- **Speaks for**: The whole floated river, read from the bottom. It is closest for Campbell Cemetery to Mill Creek.
- The classic floats, Wolf Pen to Turner Bend, sit 23 to 39 miles above this gauge with less water than it reads.
- Eddy's only gauge on the river.

### Towns

- **Ozark**, **Cass**, **Oark**. Turner Bend is the store-and-shuttle hub.

---

## White River {#white}

Arkansas's flagship trout tailwater: about ninety miles of cold, clear water from Bull Shoals Dam down past Cotter, Buffalo City and Norfork to the Highway 58 bridge at Guion, where the Arkansas Game and Fish Commission's trout water ends. This is regulated water, not rain-fed — it runs at whatever the Corps releases, and the sky above it tells you nothing about what it is about to do.

- **The dam is the weather here.** Eight generators at Bull Shoals, roughly 3,300 cfs each, can take the river from its minimum flow to a big, pushy float in under an hour with no rain anywhere in the basin. Read the generation schedule before anything else; a clear forecast is not a forecast for this river.
- **It never goes dry.** When Bull Shoals is not generating for power the Corps still releases a minimum flow of about 800 cfs, and it passes that water through a turbine running at low output. "No generation" on the schedule therefore still means water is coming out of the dam; the low end of this river is a floor somebody chose, not a drought.
- **Cold, all year.** The release comes off the bottom of Bull Shoals Lake; Eddy read about 55 °F at the dam in late August 2026. That is a past measurement that shows how cold the release runs in summer, not today's temperature. Dress for the water and not the air: hypothermia is a summer risk here in a way it is not on a spring-fed Ozark float.
- **Two dams feed the lower half.** Norfork's release joins about thirty-five river miles below Bull Shoals Dam, and at full generation it is a substantial fraction of what Bull Shoals puts out. Below that confluence, knowing what one dam is doing is only half the picture.
- **The Buffalo comes in at Buffalo City.** After heavy rain the Buffalo can push colored, warmer water into an otherwise clear tailwater — the one way local weather does show up on this river.
- **Where the numbers come from.** There is no USGS flow gauge in the tailwater itself. The controlling number is the release measured at the dam; the nearest discharge gauge on the river proper is thirty-five miles down, near Norfork. The sites right below the dam measure water temperature and dissolved oxygen only.
- The river warms as it runs — measurably, within the first few miles — which is why the trout water has a downstream limit at Guion rather than continuing.

## Norfork Tailwater {#norfork-tailwater}

Not quite five miles of the North Fork River between Norfork Dam and the White, and one of the most concentrated trout fisheries in the country. Small enough to know well, and entirely governed by two generators.

- **Not the same river Eddy carries in Missouri.** The North Fork River above Norfork Lake is a spring-fed Ozark float in Ozark County, Missouri. This is the water below the dam, in Arkansas, with thirty miles of reservoir between them. Same name, different river, different rules.
- **A siphon holds the floor.** When both units are idle a siphon keeps a steady release going, a little under 200 cfs when Eddy measured it in August 2026, and it is the reason the fishery survives late summer. Total release is turbine flow plus that siphon.
- **One unit changes everything.** With only two generators the step between idle and generating is abrupt — a single unit takes the release from a couple of hundred cfs to well over three thousand, roughly sixteen times, and the river rises and speeds up fast. There is no gentle middle here the way there is on the eight-unit White.
- **Cold and thin on oxygen.** Eddy read about 53 °F below the dam in late August 2026, and dissolved oxygen there was 3.2 mg/L on August 24, 2026, low enough to matter to fish. Water from the bottom of a stratified lake comes out cold and oxygen-poor in late summer and re-aerates as it runs. These are past late-summer measurements, not today's conditions.
- **The turbines are not a given.** Norfork's units have been out of service for extended stretches, with release made through the siphon and flood gates instead. "Not generating" here has meant months, not hours.
- **Trout rules changed in 2026.** From February 1, 2026, the Arkansas Game and Fish Commission allows two rainbow trout under 14 inches a day in the whole tailwater, with every other trout released, until further notice. The blanket catch-and-release rule before that date no longer applies. Rules here have changed recently; point people to the Commission's current regulations and do not state the limit as permanent.

## Lake Taneycomo {#taneycomo}

Twenty-three miles of the White River between Table Rock Dam and Powersite Dam at Forsyth — a lake by name and by law, a cold tailwater in practice. The top of it fishes and wades like a river; the bottom is flatwater backed up behind Powersite.

- **Two different waters under one name.** The upper reach below Table Rock Dam is riverine and cold, and people wade it when Table Rock is not generating; whether it can be waded at a given spot and hour is not something Eddy says. Below Fall Creek it gradually becomes the impoundment Powersite has held since 1913. Advice for one half is wrong for the other.
- **The biggest, fastest move Eddy measures.** The tailwater stage below Table Rock swings roughly eight feet between idle and full generation on four units. Water can come up feet in minutes close to the dam. The dam sounds a horn before generation starts, but the posted schedule is the thing to read first, not the horn.
- **Cold enough to be the point.** Eddy read about 53 °F below the dam in August 2026 (a past measurement, not today's temperature), which is why a trout fishery exists this far south and why the hatchery sits where it does.
- **Oxygen improves downstream.** In August 2026 dissolved oxygen measured 5.1 mg/L immediately below the dam and 9.2 mg/L ten miles down at School of the Ozarks: the release comes out oxygen-poor in late summer and re-aerates as it moves. A past measurement, not today's condition.
- **The lake level is its own reading.** Because Powersite impounds it, Taneycomo has a surface elevation rather than a stage, and gauges at both ends report it in feet. That is not a river stage and does not mean what a river stage means.
- Missouri's special regulations apply from Table Rock Dam down to Fall Creek — check MDC's Lake Taneycomo rules before keeping anything.

---

## Elk River {#elk}

- Pineville and Noel are the main bases. The Elk begins where Big Sugar and Little Sugar meet; Indian Creek joins above the Trestle Park area. Upper trips can become shallow before the lower reach does.
- City of Pineville, Mount Shira and Cowskin are agency-listed accesses. Mount Shira and Cowskin prohibit camping. The highway crossings at I-49 and MO-59 are not verified public launches; Lanagan Access is on Indian Creek.
- Eddy plans between approved access points using its river geometry. Private campgrounds and businesses can be listed without being approved launches; use the actual access inventory for planner endpoints.
- Tent/RV camping is available through the river's operators, including Wayside, Kozy Kamp, Eagles Nest, Trestle Park, River Ranch/Sycamore Landing, Shady Beach, Two Sons and The Spot. Shady Beach requires a float booking for camping from Memorial Day through Labor Day.
- Shadow Lake Dam separates upper and lower trips. Do not describe a through-float as verified without a confirmed portage and land access. The Trestle Park area also has a low-water crossing.
- The live Noel gauge is USGS 07188925 and currently supplies stage only. The former Tiff City gauge is inactive. Never apply Tiff City stage thresholds to Noel or infer a discharge from its stage.
- Bluff Dwellers Cave is a drive-to attraction south of Noel, not a riverside cave stop. Named springs documented on Indian Creek, Big Sugar Creek and Mill Creek are not established Elk mainstem stops.

### Gauge: Noel {@07188925}

- **Sits**: At the Highway 59 bridge in Noel. Above it: Big Sugar and Little Sugar creeks, which meet at Pineville to form the Elk about 11 miles up, and Indian Creek, which joins about five miles up. Below it: Buffalo Creek, about 13 miles down.
- **Speaks for**: The Elk from Indian Creek down through Noel.
- Between Pineville and Indian Creek the river has about a third less water than this reading shows.
- Eddy's only gauge on the river.
