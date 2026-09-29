# Camping demand (Quiet → Packed)

Owner decisions (September 29, 2026):

- Show one overall Ozarks reading inside the existing **Camping** card on Today.
- Always use tonight's date in America/Chicago. No weekend default or date picker.
- Replace Today's individual campground rows and the separate per-river demand card.
- Keep the regional bar compact and show up to five saved rivers underneath, inside the same card.
- Under 30% booked reads as Quiet.
- Use Recreation.gov campgrounds only, explained in the info tip.

## Today card

`eddy-ios/src/components/TodayCamping.tsx` retains the Camping heading, campground
symbol and “See all camping” link. Its contents start with one compact regional gauge:

- “Across the Ozarks · Tonight”
- A single short line with the named band and booked percentage
- A five-segment Quiet → Packed scale, with a marker centered on the named band
- An older-reading label when applicable; sample coverage stays in the info tip and VoiceOver

Up to five saved rivers follow in saved order, with a river name and tonight's
band/percentage. These rows have no extra scales or night strips. They use the
existing per-river coverage gates and never fill empty favorite slots with other
rivers. Unknown readings say “Not enough data,” never zero bookings.

The gauge is ordinal, not a percentage axis. The exact percentage is written
separately. Missing or insufficient data shows a neutral track without a marker,
“Not enough data,” and the reason. It never reads as Quiet.

Tapping the gauge or footer opens `/camping` with tonight's date. A saved-river
row also applies that river's filter. The date carries into campground details;
unsupported dates fall back to the existing default. Individual campgrounds,
river/nearby filters, the 90-night grid, calendars and booking links remain
available. Favorites and phone location do not change the regional Today reading.
The info button explains the source, site weighting, sample and freshness.
VoiceOver reads the scope, night, result and coverage/age notes as one button.

The existing `features.campingHeatmap` gates the card and full camping screen.
`features.crowdSignal` gates the regional reading. If the latter is off, the card
retains a browse prompt and link. Both flags are enabled in `vercel.json` as of
September 29, 2026; this UI change adds no rollout flag or migration.

## Meaning and coverage

This measures **campsites booked**, not people present or daytime river traffic.
It is a pulse of Eddy's tracked reservable inventory, not a census of every
campground in the Ozarks. Private campgrounds, walk-up sites and day floaters
are outside the sample.

Recreation.gov separates Reserved, Closed, Not Reservable and NYR. Missouri State
Parks' UseDirect feed exposes `IsFree`, which cannot reliably distinguish booked
from closed or held sites. State parks remain excluded until that distinction
is available. The shared `CAMPING_DEMAND_INFO` string explains these limits.

## Calculation

`regionalCampingDemand` in `shared/camping-demand.ts` deduplicates the overview by
`facilityId`, then applies the existing scorer across all tracked Recreation.gov
campgrounds. A campground serving several rivers counts once. A tracked campground
without river links still participates. Never sum per-river results: they overlap.
The server continues to resolve aggregate/loop overlap before sending the overview.

For tonight, count fresh `open`/`full` observations with positive reservable inventory:

`booked = Σ(sitesReservable − sitesOpen) / Σ(sitesReservable)`

This is site-weighted, so a 100-site campground contributes more than a 10-site one.
Closed, not-yet-released and zero-reservable observations are accounted for separately
and excluded from booked inventory. Missing or expired observations are unknown.

Coverage uses each campground's `expectedReservable`: the largest observed
reservable inventory on a stored night checked in the last 30 days, within the
requested horizon. Today continues fetching the cached 21-night overview to keep
that baseline useful, even though the gauge shows only tonight.

The regional pulse tolerates a small missing portion while keeping these gates:

- If a missing campground has no known capacity, a regional sample may still rate
  when at least five campgrounds are counted and at least 80% of potentially
  operating campgrounds have valid observations. Otherwise withhold
  (`unsized_missing`). Per-river scoring retains its strict missing-capacity rule.
- Unknown capacity stays unknown (`coverage: null`). Never insert zero or report
  a site-capacity coverage percentage for this sample. The info tip and VoiceOver
  say “Based on N campgrounds · M unavailable.”
- Withhold below 50% of known eligible expected capacity or 20 observed reservable
  sites. Known missing capacity remains in this gate even if another campground
  has unknown capacity.
- Withhold when most tracked campgrounds are closed, unreleased or have no
  reservable inventory, using the corresponding reason.
- Packed requires every eligible campground observed and every observed site booked.
- Partial coverage says “checked campsites” and identifies the sample size and unavailable count in the info tip and VoiceOver.

| Booked | Band |
| --- | --- |
| < 30% | Quiet |
| 30 – < 60% | Moderate |
| 60 – < 85% | Busy |
| 85 – < 100% | Crowded |
| 100% and complete coverage | Packed |
| 100% with partial coverage | All observed sites booked |

Only the Quiet cutoff is fixed. Validate 60% and 85% against real weekends.

## Freshness and date

`todayCampingDemand` derives tonight from the current Chicago calendar date, not
the cached horizon's start. `useCampingOverview` advances the clock every minute
and refreshes on foreground. Missing tonight never falls back to a later night.

The 72-hour limit expires observations; it does not make them current. “Checked
today / yesterday / earlier” uses the Chicago date of the oldest counted reading.
Older readings are labeled on the card. The existing ≤26-hour rule separately
controls the scorer's `final` field; it does not determine the calendar label.

## Existing history

History capture is separate from this UI. The sync cron writes
`campsite_occupancy_history` at lead days 0, 7 and 14 before old nights are pruned.
`CAMPING_HISTORY_ENABLED` is enabled in `vercel.json`; production migration
`20260929023743` was applied September 29, 2026. This change does not modify
history, provider ingestion or the database.

## Verification and remaining decisions

Regression tests cover regional site weighting, multi-river and duplicate facility
counting, standalone campgrounds, state-park exclusion, missing/partial/stale data,
Chicago midnight and DST, and absence of a weekend fallback. Existing shared tests
cover band edges, each withhold reason, freshness and complete-coverage Packed.

Run `make check-web`, `make check-mobile` and `make bundle-mobile`. Device QA should
check light/dark themes, large text and VoiceOver, including the info button.

A read-only check at September 28, 2026, 11:32 p.m. Chicago time found 29 of 30
eligible campgrounds reporting tonight: 78 of 675 reservable sites booked (12%).
War Eagle had no observations or capacity baseline. The earlier strict gate
blanked the entire regional gauge. The sample rule now shows Quiet with “Based
on 29 campgrounds · 1 unavailable,” while retaining unknown capacity and
incomplete coverage. This is a reading of the observed sample, not an estimate
of occupancy at the missing campground.

Later work can add relative busyness from history and resolve state-park coverage.
Backcountry districts remain outside the campground overview.
