# Campground peek and Camping tab — UX plan, 2026-08-21

Raised from two screenshots of Cedargrove on the Current — the collapsed peek
and the Camping tab — with the question *"how would you improve the campground
peek and camping section on the mapsheet?"*

Nothing here is implemented. This is the plan, written down so the decisions
behind it can be argued with before any of it is built.

---

## What is already right, and is not being changed

Stated first because two of these are load-bearing and everything below has to
survive them.

- **The four zero-states stay apart.** `full`, `closed`, `not_yet_released` and
  `unknown` all produce a bar with no fill, and they are opposite instructions
  to a reader. `availability.ts` opens with this and it remains the feature's
  best idea.
- **Shape carries the meaning before hue does.** Red and green are the worst
  pair for the commonest colour blindness, and the strip reads correctly with
  colour stripped out entirely.
- **The peek does not resettle.** `GlanceSlot` reserving height by mounting the
  real component in a pending mode — rather than by a constant somebody measured
  once and got wrong at accessibility text sizes — is the correct answer to a
  genuinely hard problem.
- **The hero names its night.** Moving off the weekend min-fold fixed a real
  bug: Cedargrove read "Fully booked" over a strip of mostly green bars.

---

## Decisions taken

Four questions were put and answered before this was written.

| Question | Decision |
| --- | --- |
| Multi-night stay length | **No.** Camping stays a one-night-at-a-time question. See "Considered and not taken". |
| Primary action on a campground tap | **Change it.** The filled pill leads with sleeping, not with float planning. |
| Recreation-site photos | **Expose them.** Investigated below; cheaper than expected. |
| Tie camping to the active float plan | **Yes.** Named as the differentiator. |

---

## Defects

Both are visible in the screenshots. Neither is a matter of taste.

### 1. The tent mark is not drawing

The 32pt well at the card's top-left renders as an empty white rounded square,
while the same `campground` art draws correctly on the map pin directly above
it. The asset is registered (`EddySymbol.tsx:56`) and the file exists, so this is
a render problem at `MARK = 22` — scale, tint, or a load failure — rather than a
missing file.

It has to be reproduced on a simulator before it can be fixed; it is not
diagnosable from source alone. It leads the build order because it is the
identity element of the card that carries the whole feature.

### 2. The night context scrolls out from under its own controls

`AccessTabs.tsx:791` argues at length that the page must state its own context:
everything below that line concerns **one night**, and until `NightStatus`
existed nothing on the page named which. That statement is then the first thing
to scroll away. In the second screenshot "Tonight" is already half-clipped,
leaving the chips, filters and site list below it unlabelled.

`NightStatus` and the chip row should be pinned together as a sticky header
inside the tab. The tab's context should be as unscrollable as the peek is.

---

## Changes proposed

### The tent tap leads with sleeping

Somebody who taps a tent is asking where they sleep. The filled pill currently
goes to *Use as put-in*, and the only control that takes a booking is an
outlined button one swipe and a scroll away.

Scoped to a **campground-layer tap**, which `peekSlot.ts` already treats as the
intent signal — the same precedence `placeSymbol` and `initialTabKey` use. A
put-in tap is unchanged. ADR 0007 holds: there is still exactly one fill on
screen, pointed now at what the reader came for.

The pill says **See nights**, not *Book*. Tapping it opens the Camping tab; it
does not leave the app. `campgroundFacts.ts` already insists a booking control
must name its destination because it hands the reader to Safari, and spending
the word *Book* on a tab switch undercuts that. `Book on Recreation.gov` stays
reserved for the control that actually leaves.

Two smaller changes ride along:

- **A chevron.** The card is a `Pressable` with no visual affordance at all. The
  one gesture that reaches bookable chips is currently invisible.
- **Ratio over bare count.** `3` set in 30pt Fredoka spends the card's entire
  rank on a number that means very different things at 3-of-6 and 3-of-197. The
  denominator moves up into the numeral: `3/6`.

Both must hold the one-height invariant. The count keeps `allowFontScaling={false}`
for the reason already documented on it.

### Photos — NPS is free, RIDB is nearly free

Two separate findings, and the second corrects a claim made earlier in this
work.

**NPS campgrounds: already on the wire, rendered nowhere.** The full array is
built server-side at `detail.ts:570`, declared in `api.ts:330`, and mirrored into
`@eddy/types` as `NpsCampgroundSummary.images` — `url`, `title`, `altText`,
`caption`, `credit`. That type's own comment notes the client does no runtime
stripping and that "this type was the only thing hiding them." `.images` appears
**zero times** anywhere in `eddy-ios/`. A photo strip costs one component and no
request.

**Recreation.gov: the client already exists.** An earlier draft of this plan said
RIDB media "needs an ingestion pass", citing `camping/types.ts:66` describing
`lib/usfs/ridb.ts` as "still uncalled". That comment is scoped to the camping
availability feature, not the repository — `lib/usfs/sync.ts` imports and uses
the RIDB client, and **`fetchFacilityMedia()` already exists** at `ridb.ts:156`,
with a comment noting the single-facility endpoint omits `MEDIA` unless
`full=true`, so it hits the dedicated `/media` sub-endpoint.

What is actually missing is storage and a sync path, not the integration. The
licence review still stands: RIDB media is third-party imagery with per-asset
credit and rights, and confirming redisplay is permitted — with credit stored
beside the URL — is a prerequisite, the same discipline
`backfill-imagery-cli.ts` already applies to og:image sources.

Rules for the strip itself:

- One photo means **one image**, not a one-item carousel.
- No photos means **nothing** — no placeholder, no grey box, no "photo
  unavailable". Most campgrounds carry no NPS record at all, so a placeholder
  would be the majority experience. This is the sheet's own absent-never-empty
  rule.
- Fixed height either way, so the tab does not reflow when images decode.
- The peek card is out of scope. `PlaceHead` already carries `pin.imageUrl` as
  its thumbnail, and a second image nine points away is the duplication the
  mirror rule exists to prevent.

### The plan tie-in

`Mile 9.0` means nothing on its own. If a put-in is set, the card should read
`3.2 mi below Baptist Camp · ~1h 45m`.

**This needs no new state.** `planner.putIn` is already in scope at PinSheet's
call site — the map tab reads `planner.putIn.riverMile` at `index.tsx:2674` to
decide `canSetTakeOut`. The subtraction needs a prop, not a request.

Float time is nearly as cheap. An active plan publishes `floatTime.speedMph`, so
the time to a point inside that stretch is the plan's own speed over the
sub-distance — the same model, not a second one that could disagree with it.

Two constraints, both non-negotiable:

- Route it through `roundToQuarterHour`. The rounding is the point: *"an estimate
  built from a vessel speed and a flow exponent has no business rendering 3 hours
  7 minutes."*
- When `floatTime` is `null`, print the distance alone. That null is the server
  refusing to estimate in dangerous water, and a campground line must not be the
  one surface that quietly re-derives around it.

**"Make this my night 1"** is the larger prize and is deliberately not scoped
here. `PlanAlongRoute` already establishes the vocabulary — it lists what lies
between put-in and take-out and leads each row with how far *into this float* a
point is, rather than river-mile-from-headwaters, because that is the number
answering "can we make it". A camp stop is that list with a night attached. It
touches plan state, `PlanSheet` and probably persistence, and deserves its own
design pass rather than being appended to a map-sheet cleanup.

### The Camping tab keeps the shape language

`NightStrip` and `availability.ts` spend hundreds of words insisting the four
zero-states are different instructions. The chips one section down flatten them
back into a badge: a fully-booked night renders `Sat 22 [0]` and a not-offered
night renders `Sat 22` with the badge suppressed. Those look nearly identical,
and they are exactly the pair the strip draws as a red-ringed empty track versus
a neutral baseline rule.

The chips should carry the same marks — a red-ringed `0` for booked out, a
neutral rule for not offered, a filled count for open. One vocabulary, two sizes.

The second change is the scroller. Fourteen chips in a horizontal rail hides at
least one weekend at all times, and weekends are the entire reason people scan.
A **two-row, seven-across grid** shows the full fortnight with both weekends on
screen together, and every cell still clears 44pt.

This needs checking against `FilterChips`' other callers before it is committed
to — the component is shared.

### Book becomes a sticky footer

Moving *Book* above the inventory fixed a real bug; on Onondaga it sat sixty-four
rows down and the report was simply that there was no link. But the current order
hands the reader a call to action before they know whether they want it, and
drops three same-weight rows — Book, Park website, Campground page — between the
night chips and the sites they select.

A sticky footer is both: first-reachable **and** after the inventory. It also
frees the two reference links to sit with the rest of the reference material.

### Two data questions

**Cedargrove is describing itself two ways at once.** The card renders the
campground branch — "3 open of 6 sites" — while the prose below says backcountry
campsites are reserved via recreation.gov. If those six sites are dispersed
gravel bars miles apart, "of 6 sites" is materially misleading: it reads as a
campground with six pitches when it is a permit over a stretch of river.
`availability.ts` already has the right branch — `kind === 'backcountry_district'`
drops the denominator and puts the district name in the caption. Whether
Cedargrove's row is classified correctly should be checked before UI is built on
top of it.

**The majority case gets the least design.** `peekSlot.ts:87` records that
**124 of 166** campground pins have no availability Eddy can read. For those the
Camping tab is amenity chips and links, which means the least-designed state is
the one most readers meet. That state is where first-come guidance earns its
place: what time sites typically go on a summer Friday, whether gravel-bar
camping is permitted on that stretch, and a phone number that reaches somebody
who knows. On Ozark National Scenic Riverways dispersed gravel-bar camping is
legal and free, and a float-trip app that never mentions it is leaving the most
useful answer unsaid.

---

## Considered and not taken

### Multi-night stay length

A 1 / 2 / 3-night stepper was proposed: each bar re-derived as "start a stay
here", so the strip could answer *which weekend can I actually get*. The data
supports it losslessly — `CampsiteSite.nights` is a per-site character string, so
"free Friday **and** Saturday" is a per-site AND rather than a count fold.

**Not taken.** `availability.ts:220` documents a real bug caused by folding
across nights, and anything reintroducing a fold invites it back. "Lossless if
implemented exactly right" is a weaker guarantee than "the number over the strip
is the number in the column under it", which is what one night buys.

The consequence, accepted: a reader wanting Friday *and* Saturday still ANDs two
columns by eye. The `next open` hint in the caption is the nearest substitute and
speaks only about single nights.

---

## What the federal APIs allow, and why the deep link is the ceiling

Recorded because it justifies an architecture that could otherwise look like a
compromise waiting to be undone.

Eddy reads three federal APIs and none of them takes a booking:

- **RIDB** (`ridb.recreation.gov/api/v1`, keyed). Every export in
  `usfs/ridb.ts` is a GET — no `method:` is ever set. It is an *information*
  database: facilities, sites, attributes, media. It has no reservation, cart,
  hold or transaction endpoint, and as `recgov.ts` puts it, "no date dimension at
  all". Its own answer to "how do I book this" is `getReservationURL()` at
  `ridb.ts:258`, which builds a `recreation.gov/camping/campgrounds/{id}` link.
- **Recreation.gov availability**
  (`www.recreation.gov/api/camps/availability/campground/{id}/month`).
  Undocumented, keyless, month-locked — what the site's own booking widget calls
  to render a calendar. Read-only, and behind a `Disallow: /api` that
  `limiter.ts` already honours at the stated 10s crawl-delay.
- **NPS Data API** (`developer.nps.gov/api/v1`). Campground records, fees,
  amenities, photos. Read-only.

Booking happens in an authenticated browser session against the vendor's
transactional system, which is not exposed at any tier. Programmatic reservation
acquisition is also precisely what recreation.gov's anti-bot work targets, since
permit scalping is a live problem there; attempting it would put the read access
Eddy depends on at risk.

So the deep link is not a gap in the integration. It is the ceiling the federal
stack defines, and `campgroundFacts.ts` already builds correctly against it —
which is what makes its naming discipline load-bearing rather than decorative.

---

## Build order

Sequenced by ratio of certainty to cost. Everything in the first group is
component-local and reversible.

| Change | Where | Cost |
| --- | --- | --- |
| Fix the tent mark | `CampgroundAvailability.tsx` | Reproduce on a simulator first |
| Pin night context and chips | `AccessTabs.tsx` | Sticky header inside the tab |
| Chevron and ratio on the card | `CampgroundAvailability.tsx` | Must hold the one-height invariant |
| Chips inherit the strip's marks | `FilterChips.tsx`, `AccessTabs.tsx` | New badge variants; check other callers |
| NPS photo strip | `AccessTabs.tsx` | Data already arrives — one component |
| Sticky Book footer | `AccessTabs.tsx` | Interacts with `SheetPager` scrolling |
| Primary pill becomes See nights | `PinSheet.tsx` | Campground-layer taps only |
| Distance and float time line | `PinSheet.tsx` ← `planner.putIn` | Prop; quarter-hour rounding |
| Cedargrove classification | `campsite_facilities` | Data audit, not UI |
| RIDB site media | `ridb.ts` client exists; needs storage + sync | Licence review is a prerequisite |
| "Make this my night 1" | Plan state, `PlanSheet` | Own design pass |

---

## Verification

Every item above is covered by `make check-web`: the web suite type-checks and
runs the pure modules — `availability.ts`, `siteList.ts`, `campgroundFacts.ts`
and `peekSlot.ts` — on the app's behalf, since the Expo app has no runner of its
own.

Anything touching the peek's height also needs `make bundle-mobile` before it is
called done, and the tent mark and the sticky footer both need a simulator: a
render bug and a scroll interaction are not observable from a type check.
