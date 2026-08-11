# 0008 — A map feature has a kind and roles; a layer key is not either of them

Status: active · 2026-08

Adding one layer — Boat ramps — touched nine files and broke four features that
have nothing to do with boat ramps. That is a symptom, and this records the two
causes and the model that replaces them, because the fix is otherwise
indistinguishable from a refactor somebody felt like doing.

## The two causes

**Every layer re-derived its own population.** `RiverMap` built `accessPins` and
`campgroundPins` from independent filters, and `layerCounts` in
[`app/(tabs)/index.tsx`](../../eddy-ios/app/(tabs)/index.tsx) re-derived the same
two sets a second time to produce numbers. N layers meant 2N filters and 2N
chances to disagree. The repo has already paid for this twice — `cabin_lodge`
silently falling off a layer, and four consumers of `mappableService` that
disagreed until W3a unified them, which is why guardrail 4 of
[`MAPS_SHEET_SERVICE_MODEL_PLAN.md`](../MAPS_SHEET_SERVICE_MODEL_PLAN.md)
exists.

**`pin.layer` is a presentation fact that had become a semantic key.** It records
*which icon the finger landed on*. That is the right input for exactly one
question — which mark the sheet header shows — and it was also the key for four
questions about the **place**:

| Site | What it is really asking |
| --- | --- |
| `tabs.initialTabKey` | is this a campground? |
| `peekSlot.decisionSlot` | what fact does this kind of place need? |
| `sheetActions.isDriveable` | is this somewhere you drive to? |
| `PinCallout`'s Airbnb row | can you sleep near here? |

`decisionSlot` is the one that shows the cost concretely: it asked
`layer !== 'campgrounds' && layer !== 'access'`, a list of the marks that existed
when it was written, so a boat ramp — an access point by any reading — would have
fallen through to `none` and silently lost its water reading.

## The model

Three axes, and collapsing them is how a gauge ends up pretending to be a role of
a place:

- **Kind** is what a feature IS — access point, service, gauge, hazard, dam. Two
  features of different kinds at one coordinate are two markers, legitimately: a
  USGS station and a put-in are not one thing.
- **Roles** are what a place OFFERS. Campground and boat ramp are roles of the
  same access point. **Only roles contend for a marker.**
- **Overlays** — radar, public land — are neither, and the codebase already drew
  this line at compile time before this record existed: `PinLayerKey =
  Exclude<LayerKey, 'weatherRadar' | 'publicLand'>`, with a header explaining
  that a fake empty collection to keep a `Record` total is the wrong fix.

Ownership applies **within a kind, over roles**:

```
visibility = intersects(feature.roles, activeRoles)
ownership  = MARK_PRIORITY's first pick out of that intersection
```

[`eddy-ios/src/map/accessLayers.ts`](../../eddy-ios/src/map/accessLayers.ts) is
that rule for the access family, which is the only family whose members contend
for one marker today. It is pure, so the web suite — the Expo app's only runner —
executes it; the themed catalog in `layers.ts` may know about it and never the
reverse.

**`MARK_PRIORITY` is its own constant.** `ACCESS_POINT_TYPE_ORDER` is a *listing*
order for badges, matched to the website. Mark priority is a different question —
which single mark is most decision-useful when only one can be drawn. The two
agree today by coincidence, and `accessLabel` carries a third hand-written order
that drops `access` entirely. Three orders answering three questions is correct;
one order pretending to answer all three is how the first two drift.

## Identity is not proximity

A ~200 m radius decides **presentation only**: whether to draw one marker or two.
That is reversible and asserts nothing about the world.

It may never drive a **record merge**. Contact details, status and booking links
are claims about a business, and a phone number attached to the wrong campground
is worse than no phone number. `SAME_PLACE_DEGREES`' own comment conceded the
limit — "two DIFFERENT campgrounds that close together on one river do not exist
**in this dataset**" is a claim about today's rows, not an invariant, and
`MULTI_STATE_SCALING_PLAN.md` is the document that ends it.

A real merge needs explicit identity links with a stated relationship
(`samePlace` / `locatedAt` / `nearby`). That table is horizon 2c of
`MAPS_SHEET_SERVICE_MODEL_PLAN.md` (`access_point_services`), it is a production
write, and it is therefore out of this arc entirely.

**What the radius may carry is the ROLE, and only the role.** A directory
campground sitting on an access point is absorbed by it: one marker, and the
absorbing place gains `campground` so it still answers the Campgrounds row. That
is a membership fact used to pick a mark and count a row — the same class of
decision as not drawing two dots. The service's phone number, availability,
booking link and description stay on the service record and are never grafted on.

The dedupe was previously run only against access points **already tagged**
`campground`, which made the tag a precondition for noticing a duplicate — so a
place the directory knew camps and the access-point row did not drew twice, two
hundred metres apart. Dropping such a service without carrying the role would be
worse than the duplicate: the place would vanish from the Campgrounds layer, and
"ask the map for campgrounds and not be shown Red Bluff" is the failure the
campgrounds branch was rewritten to fix.

## Counts describe representation, not pins

Guardrail 5 said "a count beside a switch is a count of **pins**". Checking the
render path shows it could not have been true, before boat ramps and independent
of them:

- below `ZOOM.cluster` (8) Mapbox collapses access pins into cluster bubbles;
- between `ZOOM.cluster` and `ZOOM.places` (10.5) every access-family feature
  draws as an identical 4.5 px coloured circle — `pins-access-overview` stops at
  `ZOOM.places` and the role mark only appears above it;
- labels carry no `textAllowOverlap`, so they collide-suppress independently.

For most of the zoom range **no role mark is drawn at all**. So the access
family's counts are membership — how many places match the row — which holds
still while a neighbouring row is toggled, with four buckets whose sum is the
assertion worth writing:

```
totalMatches === ownedMarkers + representedElsewhere + notShown
```

`notShown` is what makes it hold under a toggle that HIDES things. The sheet says
underneath where a row's places went, so a number that no longer moves is not
also a number that cannot be checked.

**This is a visible change to a row nobody asked to change**: the Access points
count used to drop when Campgrounds came on. It now stays and gains a line.

**A row's figure is a projection, and the projection has its own rule.** The
counts describe populations; what the sheet prints is what a row's *live tiers*
account for. Partitioning tiers (gauges, river services) are disjoint and sum.
Refining tiers (access points) nest, are listed outermost first, and the row
reports the outermost live one — reading the row's own key unconditionally puts
fifty beside a row that draws ten, because a chip toggles independently of its
row and "All access off, Boat ramps on" is reachable. Nothing live means no
figure, for both shapes, rather than a fallback that makes the number jump up as
the row is switched off. The rule lives in `map/layerRows.ts` rather than in the
sheet component precisely so it can be tested: the resolver's algebra can be
exactly right while the sheet prints the wrong one of its numbers.

## Consequences

- Layers outside the access family are untouched, deliberately. Gauges, hazards,
  dams, outfitters, lodging, public land and radar never contend for one marker,
  and `allGauges` / `publicLand` keep the three-state `undefined` / `0` / `n`
  count contract that a resolver has no concept of and must not flatten.
- The wire vocabularies are NOT unified. `ACCESS_POINT_TYPES` and `ServiceTier`
  stay as they are and both map *into* `PlaceRole`; guardrail 1 is explicit that
  the loose type belongs at the boundary and the precise one at the table.
- Clustering is not part of this. Mapbox does it inside the `ShapeSource`; our
  code emits features and Mapbox decides what collapses.
- Later stages — a service adapter, the identity links, gauge/hazard/dam kinds —
  build on this seam. Only the first is an app change; the second is the
  production write above, and the third needs the scene API to model loading
  states first.
