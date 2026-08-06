# Map sheet: services, empty Overview, and what scales

Follow-up to `MAPS_SHEET_UX_BRAND_AUDIT_2026-08-05.md`. That audit closed the
brand and layout questions on the tabbed pin sheet. The five items below are what
it left open, plus one thing none of them named that turns out to be the reason
two of them exist.

Every count here was read from the live database on 2026-08-06, not estimated.
Where a reported figure differed from what the tables actually hold, the measured
figure is used and the difference is stated.

## Contents

- [The finding underneath items 1 and 3](#the-finding-underneath-items-1-and-3)
- [What the data actually says](#what-the-data-actually-says)
- [Workstreams](#workstreams)
  - [W0 — One service vocabulary](#w0--one-service-vocabulary-blocks-w1-and-w3)
  - [W1 — Split the Place tab's service list](#w1--split-the-place-tabs-service-list)
  - [W2 — Overview always has something to say](#w2--overview-always-has-something-to-say)
  - [W3 — Say what the map cannot draw](#w3--say-what-the-map-cannot-draw)
  - [W4 — siteKind feeds the filters](#w4--sitekind-feeds-the-filters)
  - [W5 — The glance contract for untabbed pins](#w5--the-glance-contract-for-untabbed-pins)
- [Sequencing](#sequencing)
- [Guardrails that keep this from recurring](#guardrails-that-keep-this-from-recurring)

## The finding underneath items 1 and 3

**Eddy has two service vocabularies, and the iOS map filters one with the
other.**

| Where | Values |
| --- | --- |
| `nearby_services.type` (Postgres enum `service_type`) — the river services directory | `outfitter`, `campground`, `cabin_lodge` |
| `NearbyService.type` in `@eddy/types` — the hand-curated JSONB on an access point | `outfitter`, `campground`, `canoe_rental`, `shuttle`, `lodging` |

`eddy-ios/src/map/layers.ts:385` declares the outfitters layer's membership as:

```ts
export const OUTFITTER_SERVICE_TYPES = ['outfitter', 'canoe_rental', 'shuttle', 'lodging'];
```

Those are the *embedded* values. They are tested against *directory* rows in
`RiverMap.tsx:893` and again in `app/(tabs)/index.tsx:1379`. Three consequences,
all live today:

1. **41 cabin/lodge rows are drawn on no layer at all.** `cabin_lodge` is not in
   the list, so the Outfitters layer skips every one of them — while its own
   description in the layers sheet reads "Rentals, shuttles and lodging". Two of
   those 41 are geocoded and would be pins today.
2. **`canoe_rental` and `shuttle` can never match a directory row.** They are
   dead entries in a filter that has always looked like it covered four things.
3. **`cabin_lodge` has no label.** `SERVICE_TYPE_LABELS` (duplicated in
   `RiverMap.tsx:105` and `PlanNearby.tsx:36`) has no key for it, so
   `serviceTypeLabel` falls through to `type.replace(/_/g, ' ')` and a subtitle
   would read "cabin lodge" in lowercase. The web app already has this right —
   `NearbyServices.tsx:25` says "Cabin & Lodge" and `DirectoryCards.tsx:76` says
   "Cabins & lodges".

Item 1 ("isn't only outfitters") and item 3 ("82% of services aren't on the map")
are both this. Fixing the heading without fixing the vocabulary fixes the
sentence and leaves the layer wrong.

## What the data actually says

### The directory table — feeds the Campgrounds and Outfitters map layers

156 rows, via `GET /api/rivers/[slug]/services`.

| type | rows | with coordinates | rejected by `mappableService` | not `active` |
| --- | ---: | ---: | ---: | ---: |
| `outfitter` | 71 | 12 | 0 | 9 unverified, 1 permanently closed |
| `campground` | 44 | 14 | 0 | 0 |
| `cabin_lodge` | 41 | 2 | 0 | 2 unverified |
| **total** | **156** | **28 (18%)** | **0** | **12** |

Two corrections to item 3 that change what the fix is:

- **`mappableService` is not what drops them.** `geocode_precision = 'centroid'`
  matches zero rows in the entire table. The precision guard rejects nothing
  today; all 128 losses are a missing latitude. The guard is a correct defense
  against a future geocoding run, not the present cause. `mappable.ts` is doing
  its job and needs no change.
- **The loss is a data-coverage problem**, which means the durable fix is
  geocoding coverage and the interim fix is honest copy.

One latent hazard worth naming before anyone geocodes: **nothing anywhere
filters on `status`.** The route at
`src/app/api/rivers/[slug]/services/route.ts` selects `status` and ships it;
neither `RiverMap` nor `layerCounts` reads it. The 10 unverified and 1
permanently-closed rows are invisible today only because they happen to have no
coordinates. A geocoding backfill turns every one of them into a pin.

### The embedded JSONB — feeds the Place tab and Overview's "Camping nearby"

This is what item 1 is actually about, and it is a different population from the
156 above. `access_points.nearby_services` holds 57 entries across 54 of 406
access points:

| embedded type | entries | access points |
| --- | ---: | ---: |
| `outfitter` | 27 | 25 |
| `lodging` | 17 | 16 |
| `campground` | 11 | 11 |
| `canoe_rental` | 2 | 2 |

So the mislabel is real and the duplication is real, at this size: **28 of 57
entries (49%) sit under "Outfitters and shuttles" without being one**, and the
**11 campground entries appear twice on the same sheet** — once in Overview's
"Camping nearby" (`AccessTabs.tsx:688`, filtered to `type === 'campground'`) and
again on Place (`AccessTabs.tsx:572`, filtered to nothing). Eleven access points
show a place to sleep in two tabs of one sheet.

### Access point descriptions

| | count | of 406 |
| --- | ---: | ---: |
| No description | 81 | 20% |
| No description, **and** at least one Place fact | 80 | 20% |
| No description and nothing else at all | **1** | 0.2% |

"Place fact" means any of `road_access`, `parking_info`, `facilities`,
`amenities`, `local_tips`.

This reframes item 2. Overview is not empty because Eddy knows nothing about
these places — it is empty because everything Eddy knows is filed one tab to the
right. **80 of the 81 can be answered from data already in the response.** Only
one access point in the database is genuinely bare.

Two things I could not measure and am not going to assert: all 406 access points
sit on a river that has at least one gauge, but `gaugeStatus` is segment-aware
and returns null when no gauge governs that mile or the reading is stale, so the
true "Overview has no Water block" count is only observable at runtime. And every
access point has a `river_id`, so the river link always renders — the floor is one
link, never zero.

### Campsite naming (item 4)

`siteKind` returns `site.siteType` when it exists and only splits the name when it
does not. All 29 `recreation_gov` facilities populate `site_type` on every site,
so **they never reach the splitting branch**. Only `mo_state_parks` does — six
facilities, 631 sites, every one of them untyped. Their derived heads:

| facility | sites | derived kinds |
| --- | ---: | --- |
| Meramec State Park | 197 | Basic, Electric, Electric/Water, Family Electric, Sewer/Electric/Water |
| Montauk State Park | 141 | Basic, Electric, Family Basic, Family Electric |
| St. Francois State Park | 109 | Basic, Electric, Family Basic |
| Echo Bluff State Park | 72 | Electric/Water, Sewer/Electric/Water, Walk-in |
| Onondaga Cave State Park | 64 | Basic, Electric/Water, Family Electric/Water |
| Washington State Park | 48 | Basic, Electric, Family Electric, Platform Tent Sites |

**Every one is clean.** No odd headings, no numeric fragments, no empty strings.
Item 4 is verified across the whole feed rather than the two parks it was spot-
checked on, and it needs no fix.

What it does surface is the defect next door — see W4.

## Workstreams

### W0 — One service vocabulary (blocks W1 and W3)

The two vocabularies both stay; what is missing is a stated relationship between
them. Add a pure classifier that maps either vocabulary onto the three groups a
reader actually distinguishes.

```
outfitter | canoe_rental | shuttle   -> 'outfitter'   rentals and shuttles
campground                           -> 'camping'     somewhere to pitch
lodging   | cabin_lodge              -> 'stay'        a roof, booked by the night
```

**Where it lives.** `packages/eddy-types/index.ts`, beside `isCampground`. It is
pure, it has no build step, and both `NearbyService` and `RiverService` are
already declared there — so the one file that owns both shapes owns the mapping
between them. The web app cannot import the package at runtime (Vercel builds
only `missouri-float-planner/`), so it mirrors the table and a web test pins the
two together. That is not a new pattern: it is exactly what
`PUBLIC_LAND_ACCESS_STYLE` already does, for the same reason, documented at
`layers.ts:501`.

**Changes.**

- `packages/eddy-types/index.ts` — add `ServiceGroup` and `serviceGroup(type)`.
  Unknown values fall to `'outfitter'` rather than throwing: a directory that
  grows a fourth enum value must degrade to a visible pin under a slightly wrong
  heading, never to an invisible one.
- `eddy-ios/src/map/layers.ts` — delete `OUTFITTER_SERVICE_TYPES`. Callers ask
  `serviceGroup(s.type) === 'outfitter'`.
- `eddy-ios/src/map/RiverMap.tsx` and `eddy-ios/src/components/PlanNearby.tsx` —
  collapse the two copies of `SERVICE_TYPE_LABELS` into one export that includes
  `cabin_lodge: 'Cabin or lodge'`, and drop the `replace(/_/g, ' ')` fallback in
  favour of a group label. A lowercase database token has no business on a map.

**Acceptance.** Every value of the `service_type` enum and every value of
`NearbyServiceType` resolves to a group, asserted by a test that enumerates both
unions — so adding an enum value fails the build rather than silently vanishing
from a layer. This is the whole scaling story for items 1 and 3.

### W1 — Split the Place tab's service list

Cheapest real fix in the set, and after W0 it is a few lines.

`AccessTabs.tsx:572` becomes three groups instead of one heading:

- **"Outfitters and shuttles"** — `serviceGroup === 'outfitter'` only. 29 of the
  57 entries.
- **"Cabins and lodging"** — `serviceGroup === 'stay'`, its own section. 17
  entries that are currently mislabelled. Same `LinkRow` treatment; no new
  primitives.
- **Camping** — dropped from Place entirely. Overview owns it, and the reason
  Overview owns it is stated in the comment at `AccessTabs.tsx:136`: the question
  is asked at the put-in you are looking at. Nothing is lost; a duplicate is.

Absent-never-empty already holds because each `Section` is conditional on its own
group being non-empty, which is the existing pattern — no section needs a new
empty state.

One knock-on: `hasDetails()` at `tabs.ts:114` qualifies the Place tab partly on
`point.nearbyServices?.length`. After W1, an access point whose only embedded
service is a campground no longer has Place content from that field. Change the
predicate to count only non-`camping` services, or Place qualifies on rows it no
longer draws — which is the "present and empty" the tab set exists to prevent.
There are 11 access points in this state; at least one of them is likely to have
no other Place fact.

**Acceptance.** A unit test over the three groups, added to
`missouri-float-planner/src/lib/map-sheet-tabs.test.ts`. Manual: any access point
with a `lodging` entry now shows it under a heading that names it, and no access
point shows the same campground on two tabs.

### W2 — Overview always has something to say

The measured shape of the problem — 80 of 81 have Place facts, 1 has nothing —
argues against a generic empty state and for **promotion**.

**The rule.** When Overview has no description, it borrows the single strongest
Place fact rather than showing a gap. Priority, first hit wins:

1. `roadAccess` — how you get in is the most useful sentence about a put-in you
   have never been to.
2. `parkingInfo`.
3. `facilities`.
4. `localTips` (already HTML-stripped by `stripHtml`).

Rendered through the existing `Prose`, in the description's slot, with no new
heading. It is the same kind of sentence in the same place; a heading would be
Eddy explaining its own data model. Place still shows the fact in its own
structured section — that is duplication across a swipe rather than within a
glance, and it is the same trade Overview's "Water" block already makes and
defends at `AccessTabs.tsx:121`.

**The floor**, for the one access point with nothing and for anything Eddy
imports next: when there is no description and no Place fact to borrow, Overview
draws an `Absent` line saying so, and it must say it in the settled voice
`waitingCopy` already uses — `Eddy has no description for this place yet.` A tab
that resolves to a bare link and no sentence is the "looks broken" being
reported; a tab that says what it does not have is finished.

**Do not** add a placeholder card, a "Coming soon", or an invitation to
contribute. None of those is a fact about the river.

**Acceptance.** A pure `overviewLead(point)` helper in the iOS tree, tested from
the web suite alongside the other `map-sheet-*` tests, covering: has description;
no description with each of the four fallbacks; nothing at all. The tab component
stays a renderer.

### W3 — Say what the map cannot draw

Item 3's instinct is right and the mechanism is not `mappableService`. Three
pieces, in this order.

**W3a — Filter status before anything else.** Drop rows whose `status` is
`permanently_closed` or `temporarily_closed` from the pin layers and from
`layerCounts`. `unverified` stays drawn — it means nobody has confirmed the
listing recently, not that the business is gone, and hiding it would remove nine
of the 71 outfitters for a housekeeping flag. This is ~4 lines and it is
**load-bearing for W3c**: a geocoding backfill without it puts a permanently
closed outfitter on the map as a destination.

**W3b — Tell the sheet what it is not showing.** The layers sheet already
supports this: `renderLayerDetail` and the `LayerNote` component
(`MapLayersSheet.tsx:389`) exist for exactly a layer whose refinement is a
sentence, and the radar row already uses them. So this is a call site, not a
component.

Under Outfitters, when the layer is on and the count is short of the total:
`12 of 71 mapped — the rest have no confirmed location.` Under Campgrounds,
likewise. The clause after the dash matters: without it the reader concludes
Eddy's map is broken rather than that Eddy declined to guess, which is the exact
argument `mappable.ts` opens with. Every one of them is still reachable — the
river page's services directory lists all 156.

This needs the unfiltered total, which the map screen does not currently keep;
`layerCounts` computes only the drawn figure. Add a sibling
`layerTotals` memo rather than changing `layerCounts` — its `undefined`-means-
not-loaded contract is documented and depended on, and overloading it to also
mean "of N" would break the one rule that file is built around.

**W3c — Close the coverage gap.** 128 rows need coordinates. This is an
ingestion task, not an app task: `scripts/ingestion/` per `docs/data-pipeline.md`,
writing `latitude`, `longitude`, `geocode_precision` and `geocode_source`, with
`centroid` recorded honestly wherever the geocoder only resolved a town. That
last part is what makes the existing precision guard start earning its keep — it
currently rejects zero rows because no row has ever been marked. Dry-run and diff
before any write; this is production data and the standing rule is inspect first.

Also fold in, while touching this area: **`layerCounts` must call
`mappableService`**, not just check for non-null coordinates
(`app/(tabs)/index.tsx:1323`). `RiverMap`'s campground branch already does. The
two agree today only because no row is a centroid — the first one W3c creates
makes the sheet's number disagree with the map's pins, and the comment directly
above that line promises it will not.

**Should cabin/lodge get its own layer row?** Recommendation: **a tier under
Outfitters, not a row.** The tier machinery exists (`LayerDef.tiers`, used by
Gauges), the semantics fit — "which of these", not "also draw this" — and 41 rows
with 2 geocoded does not carry a top-level row. It needs a `tierLabel` ("Cabins
and lodges") and, since the catalog has no lodging mark, the documented
`icon` fallback (`bed-outline`) until one is drawn. Worth its own decision; it is
the one item here that changes what the map looks like rather than what it says.

### W4 — siteKind feeds the filters

Item 4 is clean, but verifying it surfaced this: `typeTags()`
(`siteList.ts:57`) reads `site.siteType`, which is **null for all 631
`mo_state_parks` sites**. So `filterCounts` returns all zeros, and
`AccessCampingTab:438` renders `SITE_FILTERS.filter((f) => counts[f] > 0)` — an
empty array. **The filter row disappears on the six largest campgrounds Eddy
has**, including Meramec's 197 sites and Montauk's 141. Those are precisely the
lists that most need filtering.

`siteKind` already knows these are "Basic", "Electric", "Walk-in". Feed it in:
`typeTags` takes `siteKind(site)` rather than `site.siteType`, so a name-derived
kind produces tags the same way a declared type does. "Electric" and
"Electric/Water" both hit the `ELECTRIC` matcher; "Walk-in" hits `WALK`; the
`NONELECTRIC` precedence rule is untouched and still needed.

One gap remains and should be stated rather than papered over: "Basic" means no
hookup, and no substring in `TYPE_TAGS` matches it. Add `{ match: 'BASIC', tag:
'No hookup' }` — it is the same fact `NONELECTRIC` already maps to, in another
feed's words, which is the whole premise of that table.

**Acceptance.** Extend `map-sheet-site-list.test.ts` with the real state-park
names from the table above. This is the file's existing job and it runs in the
web suite.

### W5 — The glance contract for untabbed pins

Item 5 is correctly scoped as deliberate future work, and `PinSheet.tsx:10` says
so. Recommendation: **do not build dam or hazard tabs in this pass** — the header
comment's reasoning still holds, a schedule-only dam has strictly less to say
than one with a tailwater, and doing four pin types at once is how the last one
of these got large.

Do take the cheap half, which is where the reported symptom lives. The glance
contract is "one decision fact, in a box that does not move"
(`PinSheet.tsx:473`), implemented by `decisionSlot` and `GlanceSlot`. `PinCallout`
renders its decision fact wherever the row order happens to put it — for a dam,
below the reading row and the availability card and the body prose.

The narrow fix: **hoist the decision fact to directly under `PlaceHead` in
`PinCallout`**, matching the tabbed header's order. For a dam that is the release
or generation state; for a hazard it is the portage instruction, which
`RiverMap.tsx` already sorts to the front of `body` and which then gets rendered
in the muted prose slot alongside two paragraphs of description. A portage
instruction is the only part of a hazard that is an instruction, and it should
not be styled as a caption.

That is a reorder plus one text style, not a new architecture, and it makes the
eventual tab work smaller rather than pre-empting it.

**Outfitters specifically** get the most from W0 with no work here at all: after
the vocabulary fix, a tapped cabin/lodge pin says "Cabin or lodge" instead of
"cabin lodge", and there are pins to tap.

## Sequencing

```
W0  vocabulary + labels        ─┬─> W1  Place tab split
                                └─> W3b sheet says "12 of 71"
W3a status filter              ───> W3c geocoding backfill   (hard order)
W2  Overview promotion          (independent)
W4  siteKind -> filters         (independent)
W5  callout glance reorder      (independent)
```

Two orderings are not preferences:

- **W0 before W1 and W3b.** Fixing the heading or the count against the wrong
  vocabulary encodes the mismatch in two more places.
- **W3a before W3c.** Geocoding first puts a permanently closed outfitter on the
  map as a destination somebody drives to.

Suggested shipping order, smallest honest increments first: **W0 → W1 → W4 → W2 →
W3a → W3b → W5 → W3c.** W3c is last because it is the only one that writes to
production data and the only one whose value depends on every guard above it
already being in place.

## Guardrails that keep this from recurring

The point of W0 is not the three groups; it is that the next enum value cannot
silently fall off a layer. Concretely:

1. **Exhaustive union test.** `serviceGroup` is asserted over every member of
   both unions. A fourth `service_type` fails the build until somebody decides
   which group it joins. This is the single check that would have caught
   `cabin_lodge` on the day it was added.
2. **No membership lists in layer definitions.** A layer says which *group* it
   draws. Type-to-group is one table; group-to-layer is another. The bug was one
   list trying to be both.
3. **A count beside a switch is a count of pins.** Already the documented rule in
   `layerCounts`. W3b's addition is that when the pin count is short of the
   truth, the sheet says so — silently drawing 12 of 71 is technically honest and
   reads as broken.
4. **Precision is recorded at ingest, not inferred at render.** `mappableService`
   currently rejects nothing because nothing is marked. W3c only counts as done
   if `centroid` is written wherever it is true.
5. **Absent-never-empty gets a floor.** Overview's rule was "show nothing when
   there is nothing", which is right for a section and wrong for a landing tab.
   W2 makes the tab-level rule: a tab that resolves to no content says so, in
   `waitingCopy`'s settled voice.
6. **Derived display facts have one derivation.** `siteKind` is the app's answer
   to "what kind of site is this". W4 makes the filters ask it too, instead of
   asking the raw column a third of the feed does not populate.

## Validation

Per the audit's own closing note, and unchanged:

- `make check-web` — covers the pure logic in `packages/`, `siteList.ts`,
  `mappable.ts` and the new `serviceGroup`, since neither the iOS app nor
  `packages/` has a runner of its own.
- `make check-mobile` — typecheck and lint for the component changes.
- `make bundle-mobile` — the step that catches Metro and EAS breakage dev hides.
- `make check-db` only if W3c hand-applies anything.

Manual passes worth doing on device, in this order of likely breakage: an access
point with a `lodging` embedded service (W1), one of the 81 with no description
(W2), Meramec's Camping tab (W4), and the Outfitters layer switch (W3b).
