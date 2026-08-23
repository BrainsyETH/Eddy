# Competitive analysis — Eddy vs. river & lake paddling apps

**Eddy figures verified on 2026-08-23** against production Supabase
(`ilefwfpvphadsbptiaur`).
**Competitor figures verified on 2026-08-23** against the primary sources linked
inline. Every competitor claim below carries a link to the vendor's own page or
store listing; anything that could not be confirmed there is marked
*unverified*, not rounded into a fact.

> **Do not quote the Eddy numbers in this file as current.** They are a snapshot
> taken on the verified-on date. The live figures are at
> [`/coverage`](https://eddy.guide/coverage) and `GET /api/coverage`, both
> derived from the database at request time by `missouri-float-planner/src/lib/coverage.ts`.
> This doc exists to be re-verified on a date, not to be a source of truth.

---

## Eddy's coverage, in the canonical vocabulary

The vocabulary matters more than the numbers, because the two gauge tiers make
very different promises and a reader who collapses them will either understate
Eddy's reach or overstate its guidance. Definitions live in `src/lib/coverage.ts`
and ship in the `/api/coverage` response beside the counts.

| Canonical count | 2026-08-23 | What it means |
|---|---|---|
| **Curated rivers** | 24 | Researched: float thresholds calibrated against outfitter/agency guidance, verified access points, hazards, float times by vessel, shuttle logistics. **Eddy makes recommendations here.** |
| **Rated gauges** | 44 | Gauges on curated rivers carrying a floatability ladder, so they produce a verdict rather than a number. Several per river where reaches differ. |
| **Reference gauges** | 14,218 | Live USGS stations ingested **nationwide**, with reading, trend, percentile and NWS forecast — and **no float verdict**, because nobody has researched what "good" means there. |
| **Access points** | 274 | Verified against an official source and approved for display. Pending pins excluded. |
| **Hazards** | 22 | Recorded hazards on curated rivers. |
| **Campgrounds** | 79 | 34 NPS (synced from the NPS API) + 45 private. |
| **Services** | 154 | Outfitters, campgrounds, cabins/lodges. Permanently-closed businesses excluded. |

Curated rivers span **Missouri and Arkansas**. Reference gauges are national —
the largest state buckets on the verified-on date were TX (786), FL (669),
CA (615), CO (577).

### The correction this table exists to make

An August 2026 competitive review concluded that *"geographic coverage is tiny —
~8–25 Ozark rivers vs. RiverApp's 40,000+ stations, Rivercast's 12,000+ gauges"*
and ranked it a top-three gap. **That comparison was wrong, and Eddy's own
surfaces caused it.** It compared Eddy's *curated river* count against
competitors' *gauge* counts. On gauge coverage Eddy carries ~14,200 live
stations nationwide — the same order as Rivercast's 12,000+, and Eddy adds a
condition verdict on the subset it has researched, which neither competitor
attempts.

The review reached that conclusion honestly: at the time, Eddy's About page
said 8 rivers in body copy *and* in its FAQ structured data, a landing card said
8, the iOS README said 25, and production had 24. Fixing the surfaces was the
remedy, not arguing with the reviewer — see the "canonical counts" work landed
alongside this doc.

**Coverage breadth is not Eddy's weak flank. On-water navigation is.**

---

## Where Eddy is genuinely differentiated

1. **An integrated recreational float planner.** Put-in → take-out → float time
   by vessel → shuttle → outfitter → live verdict, aimed at casual tubers and
   canoe campers rather than whitewater experts. No competitor in this set
   answers "here's your trip, here's how long, here's who to call, here's
   whether to go today" in one flow.
2. **A recreational verdict, not a raw number.** Seven states (Too Low, Low,
   Good, Flowing, High, Flood, Unknown) graded against researched thresholds.
   [Rivercast](https://www.rivercastapp.com/)'s normal/rising/flooding is
   flood-safety oriented; Eddy's is float-quality oriented.
3. **Rivers + dams/tailwater in one product.** Live USACE reservoir levels and
   Southwestern Power Administration generation schedules with tailwater
   temperatures, alongside float conditions. No paddling app in this set spans
   that river/lake divide.
4. **Plain-language AI daily read.** Generated from live readings and the
   river's researched thresholds. Unique in the category as of the verified-on
   date.
5. **B2B embeddable widgets + a public API.** Eight widgets plus
   `/api/coverage`, `/api/openapi.json` and x402 payment plumbing already in
   tree. Competitors monetise through consumer subscriptions only.
6. **Data hygiene as a product feature.** Stale readings are labelled rather
   than shown as current; unrated gauges are refused a verdict on purpose.

---

## Where Eddy is behind

Ordered by exposure. **G1 is the real gap; the coverage gap the earlier review
ranked first was an artifact of Eddy's own stale copy.**

**G1 — No offline basemap, no on-water navigation (iOS).**
Eddy seeds river data (put-ins, hazards, river line, last reading) free for every
curated river, so a river screen still works with no signal — but the **basemap
renders blank**. Ozark rivers routinely have no cell coverage, so this lands at
the worst moment: launch.
[Paddleways Plus](https://www.paddleways.com/pricing) ships offline maps, GPS
navigation, a river-mile tool and geofenced take-out/rapid alerts;
[Navionics](https://www.garmin.com/en-US/p/904463/) and Aqua Map ship full
offline charts with live GPS position.

*Important context for anyone proposing a fix:* the per-river Mapbox tile
download was **removed deliberately**, and `eddy-ios/src/map/packSweep.ts` still
reclaims the packs it left behind. It was a *paid* feature that downloaded
basemap tiles and nothing else, while the genuinely useful half was already free
for everyone. The competitive gap is real; **reinstating a premium tile pack is
not the fix.** A free, low-zoom seeded basemap is — most naturally as part of the
MapLibre port the iOS README already contemplates, since MapLibre's offline API
needs no Mapbox download token.

**G2 — No GPS tracking, breadcrumbs, or user waypoints.** The app has a
tap-to-activate "you are here" locate button (`useLocation`), so live position
exists; track recording and user-placed waypoints do not. Competitors use the
resulting logbook as a retention loop. Note the constraint before scoping: the
app's stated contract is that coordinates never leave the phone, which
local-only recording can honour but a sync feature cannot.

**G3 — Forecast depth is thinner *at the surface* than the gauge specialists.**
[RiverApp](https://www.riverapp.net/en) Premium sells multi-year history and
forecasts; [Rivercast](https://www.rivercastapp.com/) surfaces NOAA forecasts
directly. Eddy exposes forecast intelligence mainly through the written daily
read and a 72-hour flood-risk flag. **This is a UI gap, not a data gap** —
`src/lib/usgs/ahps-forecast.ts` already ingests NWS AHPS forecast hydrographs per
LID. One constraint to design around: AHPS publishes **stage only**, so a
cfs-rated river must grade forecasts against a foot ladder, and not every river
has one.

**G4 — No lake depth contours or bathymetry.** Eddy shows reservoir *levels* and
releases but cannot serve on-lake navigation. Navionics (SonarChart), Aqua Map,
onX Fish and Fishbrain all do. Relevant only if Eddy pursues the river+lake
persona its dam pages half-serve.

**G5 — No Apple Watch or CarPlay.** Rivercast ships a Watch app on its premium
tier. Minor, but it is the natural surface for a glanceable gauge check.

**G6 — Web-only differentiators absent from iOS.** The animated flow map, the
30-day replay timeline, the full dam/lake page and the widgets are web
experiences. A user who meets Eddy through the app meets the less differentiated
half.

---

## Competitor reference table

Verified 2026-08-23 against the linked primary sources.

| Product | Coverage claim | Pricing | Offline / nav | Source |
|---|---|---|---|---|
| **Paddleways** (NRS) | Nationwide paddling routes, community guidebook | Free 7-day trial, then **$49.99/yr** | Offline maps, GPS nav, 3D, land parcels (Plus) | [pricing](https://www.paddleways.com/pricing), [Play listing](https://play.google.com/store/apps/details?id=com.mobileappnrs&hl=en_US) |
| **RiverApp** | **40,000+** monitoring stations, 20,000+ rivers, 20+ countries, 4,000+ whitewater sections | Free; Premium adds history + forecasts | Partial | [riverapp.net](https://www.riverapp.net/en), [App Store](https://apps.apple.com/us/app/riverapp-river-levels/id667012473) |
| **Rivercast** | **12,000+** US gauges, NWS flood alerts, NOAA forecasts | Free, no account; Premium adds custom alerts + Apple Watch app | No offline maps | [rivercastapp.com](https://www.rivercastapp.com/), [App Store](https://apps.apple.com/us/app/rivercast-levels-forecasts/id545375951) |
| **Navionics Boating** (Garmin) | Worldwide marine + lake charts | **$49.99/yr** US & Canada, 14-day trial | Full offline charts, routing, GPS | [Garmin product page](https://www.garmin.com/en-US/p/904463/) |
| **Go Paddling** | 25,000+ paddling locations (store listing) | Free | No | *store listing; not re-verified 2026-08-23* |
| **American Whitewater** | Nationwide whitewater inventory | Free | No | *not re-verified 2026-08-23* |
| **onX Fish** | Lake depth, offline maps, waypoints | ~$34.99/yr | Offline maps + waypoints | *vendor FAQ; not re-verified 2026-08-23* |
| **Aqua Map** | 14,000+ US lake maps, USACE surveys | Modular, ~$4.99–$69.99/yr | Full offline charts, anchor alarm | *not re-verified 2026-08-23* |

---

## Recommendations

**Now — close the credibility and on-water gaps.**
1. ✅ *Landed with this doc:* canonical counts derived from the database, a
   data-driven About roster, a public `/coverage` explainer, and `/api/coverage`
   so no consumer has to hardcode a number again.
2. Ship a **free** low-zoom seeded basemap for offline use (G1). Escalate to P0
   if App Store reviews or support tickets cite a blank map on the river.
3. Surface **AHPS forecast curves** natively (G3). The ingestion already exists;
   this is the cheapest neutralisation of the one area where the gauge
   specialists genuinely beat Eddy.

**Next — deepen the moat rather than chase breadth.**
4. Local-only GPS breadcrumbs and user waypoints (G2), within the
   coordinates-never-leave-the-phone contract.
5. Bring the dam/lake page and the animated live map into iOS (G6).

**Later — extend the river/lake bridge deliberately.**
6. Evaluate licensed lake bathymetry only if dam-page traffic and widget
   adoption show demand (G4).
7. Grow the outfitter widget/API into a paid B2B tier — x402 plumbing is already
   in tree.
8. Curate more rivers regionally, but sequence it against the
   `MULTI_STATE_SCALING_PLAN.md` and G1: adding curated rivers without an
   offline basemap compounds the weakness.

**What would change the strategy:** if Paddleways adds shuttle planning,
float-time-by-vessel and a recreational condition verdict, Eddy's core
differentiation erodes and it must compete on regional data depth, outfitter
relationships and the dam/tailwater niche. Monitor its release notes.

---

## Re-verifying this document

Eddy's figures:

```bash
curl -s https://eddy.guide/api/coverage | jq '{counts, curatedStates, generatedAt}'
```

Competitor figures: re-open each linked primary source and update the
verified-on date at the top. Rows marked *not re-verified* are the backlog — a
row that cannot be confirmed against a vendor page should be marked unverified
rather than carried forward, since a stale competitor claim is how a teardown
like the one this doc corrects gets written in the first place.
