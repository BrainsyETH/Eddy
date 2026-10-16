# Tailwater travel times: what local sources say (2026-10-16)

Research notes only. Nothing here is wired into the app, and none of these
numbers is approved for display. This is a ballpark reference to sit next to
the gauge-based study in [TAILWATER_PLAN.md §1](TAILWATER_PLAN.md#1-travel-time-lag--learn-it-do-not-assume-it).

**What these numbers mean.** Local sources almost always describe when the
water **starts to rise** at a spot after generation begins at the dam. The
Bull Shoals gauge study measured something different: the delay that best
lined up hour-to-hour changes at the dam with changes at a gauge, across many
hours. It did not pick out individual arrivals or peaks, so its lags cannot
be compared one-to-one with a first-rise time.

**Not for Eddy's AI context as written.** These numbers stay in this document
until a version for `EDDY_KNOWLEDGE.md` carries each figure's source,
operating conditions and limits with it. The knowledge-file tests check
parsing and coverage, not whether a claim is supported.

Every source that gives a reason says the same thing: **more generators means
faster water.** Every guide or resort source with a full page also says its
numbers are estimates and not a safe-wading guide.

## Bull Shoals Dam → White River

| Place | Miles below dam | Water starts rising after | Source |
| --- | ---: | --- | --- |
| White Hole | 8 | ~1.5 h | OzarkAnglers forum table¹ |
| Wildcat Shoals | 11 | ~3 h | OzarkAnglers forum table¹; Dally's ("might take 3 hours… at typical levels") |
| His Place Resort | 15 | "a little over 4 hours" | His Place Resort |
| Cotter | 18 | 4–5 h at high generation; 4.5 h; 5–6 h "very wide average" | Ember Shoals; forum table¹; Cotter Trout Dock² |
| Rim Shoals | 24 | ~6 h at typical levels; 12 h+ with low generation | Dally's; forum table¹; Cotter Trout Dock²; AGFC says "several hours" |
| Buffalo City | 31–32 | 9 h; ~12 h | forum table¹; Riley's Outfitter |
| Norfork (town, confluence) | 44 | ~14 h | forum table¹ |
| Calico Rock | 60–62 | ~15 h; ~24 h | Jenkins Fishing Service via AGFC report (June 13, 2024); forum table¹ |

**Speed by generators** (His Place Resort and Ember Shoals give the same table):

| Generators running | Rising-water speed |
| --- | --- |
| Up to 1 | 1.75–2.0 mph |
| 1–2 | 2.25–2.5 mph |
| 3–4 | 2.75–3.0 mph |
| 5–6 | 3.25–3.5 mph |
| 7–8 | 3.5–5.0+ mph |

Dally's uses a flat **4 mph** for rising water.

**Falling water rule of thumb** (His Place Resort, Ember Shoals): miles below
the dam ÷ 2 = hours after shut-off until about 85% of the water has fallen
out. Example: Cotter, 18 miles → about 9 hours.

### How this compares with the gauge study

| Gauge | Gauge study (best-aligned lag) | Local estimate (first rise) |
| --- | --- | --- |
| White River near Norfork | 12 h on training data; **failed validation** on later data | ~14 h at Norfork (forum table, unverified) |
| Calico Rock | 17 h on training data; **failed validation** on later data | 15 h or 24 h |

The figures land in the same general range, about half a day to the Norfork
area and most of a day to Calico Rock. That is as far as the comparison goes:

- Both fixed delays from the gauge study **failed** the held-out check. Neither
  is an accepted travel time.
- In the later, lower-release weeks the best-aligned lags were longer. That
  fits the "fewer generators, slower water" pattern the local sources
  describe, but the study does not prove flow dependence. It is one plausible
  explanation among several the study lists.
- The study **neither validates nor disproves** the guides' first-rise
  estimates. It measured a different quantity.
- **Mileage still needs reconciling.** The upstream gauge (USGS 07057370, above
  the North Fork confluence), Norfork Access (Eddy mile 42.5) and the
  confluence itself are three different locations. The White River section of
  `EDDY_KNOWLEDGE.md` currently puts the confluence about 35 river miles below
  the dam, which does not match Eddy's access data.

## Norfork Dam → North Fork River

| Place | Water starts rising after | Source |
| --- | --- | --- |
| Lower accesses (not named) | ~45 min | Dally's ("it takes 45 minutes for the water to come down") |
| Calico Rock (White River, 18 river miles) | ~5 h | Jenkins Fishing Service via AGFC report (June 13, 2024) |

The whole tailwater is only about 4.8 miles. Dally's notes that **you cannot hear
the generation horn at the lower accesses**. The 45 minutes is for an unnamed
location and should not be applied to every lower access. The same article
calls the generation announcements unpredictable, and SWPA says schedules can
change and releases can happen for reasons other than power generation. A
posted schedule does not confirm conditions at an access. A forum rule of thumb (secondary,
not directly verified) is 4 mph rising and 2 mph falling. No source gives a
specific time for Quarry Park, Ackerman or McClellan's.

## Table Rock Dam → Lake Taneycomo

**No local travel-time estimate found.** Sources (Lilleys' Landing reports,
OzarkAnglers, Missouri Trout Hunter, Branson tourism pages, Orvis) describe a
siren a few minutes before release and water rising "feet in a matter of
minutes" near the dam, but none times the rise at Fall Creek, Cooper Creek or
Branson. Taneycomo is a reservoir held by Powersite Dam, not a free-flowing
river, so the river-speed tables above should not be applied to it. Next step:
ask Lilleys' Landing or the MDC Shepherd of the Hills Hatchery directly.

## Source quality

- **Verified directly** (page text read 2026-10-16): Ember Shoals, His Place
  Resort, Dally's "Fishing the flows", Riley's Outfitter, AGFC weekly report
  (June 13, 2024), AGFC Rim Shoals trail page.
- ¹ **OzarkAnglers forum table**: the page blocks direct fetches, so these
  numbers come from search-engine excerpts. It is roughly 10 years old.
  Re-check in a browser before relying on it.
- ² **Cotter Trout Dock**: the page returned no readable text. These numbers
  come from search-engine excerpts. Re-check in a browser.

## If Eddy uses this

- Show a **range by access point**, never a single minute-level time.
- It is fine to tie the range to today's posted release, as long as it is
  labelled as an estimate: for example, "Estimated from today's release:
  water may start rising at Cotter around 1–3 PM. Subject to change."
- Say what the estimate leaves out: water already in the river from earlier
  releases, tributary runoff, Norfork's release below the confluence, and
  schedule changes or off-schedule releases.
- Don't present an access as currently "low" or "high" from timing alone.
- Prefer local reports where they exist. Treat a speed-table range at an
  access with no report as a calculation to test, not an established time.
- Keep the existing rule: no wading or safe-departure window is inferred
  from these numbers. Every primary source says the same.

## Sources

- [Ember Shoals — White River info](https://www.embershoals.com/white-river-info)
- [His Place Resort — White River info](https://www.hisplaceresort.net/white-river-info)
- [Steve Dally's Outfitters — Fishing the flows](https://stevedallyoutfitters.com/dallys-media/articles-page/85/fishing-the-flows)
- [Riley's Outfitter — White & Buffalo River information](https://www.rileysoutfitter.com/all-river-information)
- [AGFC weekly fishing report, June 13, 2024](https://www.agfc.com/news/arkansas-wildlife-weekly-fishing-report-209/)
- [AGFC — Rim Shoals trail](https://intranet.agfc.com/en/explore-outdoors/wildlife-viewing/nature-trails/rim-shoals-trail)
- [OzarkAnglers — White River overview](https://forums.ozarkanglers.com/waters/rivers/white-river/white-river-overview-r257/)
- [Cotter Trout Dock — Bull Shoals generation chart](http://www.cottertroutdock.com/Bull_Shoals_Dam_generation.htm)
- [Wikipedia — Norfork Tailwater](https://en.wikipedia.org/wiki/Norfork_Tailwater)
- [Lilleys' Landing — Lake Taneycomo](https://lilleyslanding.com/lake-taneycomo/)
- [Missouri Trout Hunter — Lake Taneycomo](https://www.missouritrouthunter.com/lake-taneycomo.html)
