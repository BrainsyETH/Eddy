# Camping demand (Quiet → Packed) — outline

Status: v1 built, off by default. Owner decisions (September 29, 2026):

- Under 30% booked reads as Quiet.
- v1 covers Recreation.gov campgrounds only, and says so in an info tip.

## What shipped in v1, and how to turn it on

| Piece | Where | Switch |
| --- | --- | --- |
| `expectedReservable` on each tracked campground | `src/lib/camping/overview.ts` | always on (additive) |
| Scoring, bands, copy, info tip | `shared/camping-demand.ts` | — |
| Today "Camping demand" card | `eddy-ios/src/components/TodayCampingDemand.tsx` | `CROWD_SIGNAL_ENABLED=true` → `features.crowdSignal` |
| Occupancy history snapshots | `src/lib/camping/history.ts`, sync cron | `CAMPING_HISTORY_ENABLED` — set `true` in `vercel.json`; table applied to production September 29, 2026 as `20260929023743` |

v1 notes:

- The card's headline night is the weekend's Saturday (the peak), with a
  7-night strip from tonight. Rows: saved rivers first, up to four.
- The favorite-row pill is deferred; the card alone ships first.
- Each strip night is a button: tapping it switches every river on the card
  to that night (band, percentage, basis). Each night has its own VoiceOver
  label. Tapping a river's summary opens `/camping?river=<slug>`.
- Withhold reasons are distinct: `seasonal_closure` (known closed),
  `booking_not_open` (not yet released), `no_reservable_inventory` (checked,
  nothing reservable), `unsized_missing` (a missing campground has no
  capacity baseline, so coverage is unknowable — never treated as zero),
  `missing_observations`, `small_sample`, `no_tracked_campgrounds`.
- "Checked today / yesterday / earlier" comes from the Chicago calendar date
  of the oldest counted reading. The 26-hour allowance only decides whether
  tonight's number can be called final (which also requires "today").
- Backcountry districts are not counted: the camping overview only serves
  `kind = 'campground'` facilities. Open question 1 below stands for later.
- `expectedReservable` is the largest bookable inventory on any stored night
  checked in the last 30 days, within the requested horizon (Today requests
  21 nights).

## What it is

A per-river, per-night reading of how booked the river's tracked
Recreation.gov campsites are, shown on Today as a Quiet → Packed scale. It is
**camping demand**, not a headcount: most people on a summer Saturday are day
floaters who never touch a reservation system. "Camping" stays visible beside
every result, and the selected date means that night, not daytime river
traffic.

## Coverage: Recreation.gov only

Recreation.gov reports `Available`, `Reserved`, `Closed`, `Not Reservable`
(walk-up) and `NYR` separately (`src/lib/camping/recgov.ts`), so "booked" means
reserved. Missouri State Parks (UseDirect) only reports `IsFree`
(`src/lib/camping/usedirect.ts`): a closed or held site is indistinguishable
from a booked one, which would make rivers look busier than they are. State
parks are excluded until that can be resolved.

Effect: Current, Jacks Fork and Buffalo are well covered. The Meramec keeps
only Red Bluff and will usually show "Not enough data"; rivers served only by
state parks show no reading.

### Info tip (owner decision)

An ⓘ next to the "Camping demand" heading. Tapping it shows:

> Based on campsites bookable on Recreation.gov (national park and forest
> campgrounds). Missouri State Park campgrounds aren't included. Reservable
> sites only — walk-up sites and day floaters aren't counted.

Requirements:

- Reachable by VoiceOver as a button labelled "About camping demand".
- Same copy on every surface (iOS Today card, detail view, web if added).
  Keep the string in `shared/` next to the scoring function so the platforms
  cannot drift.
- When a river shows "Not enough data" because its campgrounds are state
  parks, the detail line says so ("No Recreation.gov campgrounds tracked on
  this river").

## Layout

- Favorite-river row: a small pill, "Camping: Quiet".
- Card / detail:

  ```
  Camping demand ⓘ · Current River
  Quiet · 24% of tracked campsites booked
  Fri night · 3 Recreation.gov campgrounds · Checked today
  ```

- Its own sequential palette. Do not reuse the heatmap's green-open /
  red-booked colours.
- Band name always in text, not colour alone. VoiceOver: "Current River,
  Friday night: camping demand Quiet, 24% of tracked campsites booked".

## The calculation

Inputs: every eligible entry in `CampingOverview.tracked` for river R —
aggregated **before** Today picks its four displayed camping rows.

Eligible campground: `source === 'recreation_gov'`, linked to R through
`riverSlugs`. Loop rows take precedence over an overlapping district
aggregate, exactly as the overview already resolves them; capacity and
coverage follow the same rule so sites are never counted twice.

For night D, each eligible campground falls into one bucket:

| Bucket | Meaning | Effect |
| --- | --- | --- |
| Observed | fresh `open`/`full` night with `sitesReservable > 0` | counted |
| Known closed | `closed` or `not_yet_released` | removed from eligible inventory |
| Zero capacity | `full` with `sitesReservable === 0` | dropped before any "all full" check |
| Missing | no fresh observation for D | coverage unknown |

`booked = Σ(reservable − open) / Σ(reservable)` over **Observed** only.

### Coverage gate

Needs `expectedReservable` per campground (see Server change). Coverage =
observed expected capacity ÷ eligible expected capacity (known-closed
campgrounds excluded from both).

Withhold the band, with a reason code, when:

- `no_tracked_campgrounds` — no eligible Recreation.gov campground on R.
- `seasonal_closure` — most eligible inventory is known closed.
- `missing_observations` — coverage < 50%.
- `small_sample` — observed reservable sites < 20.

These are coverage rules, not confidence: they say how much of the tracked
inventory was seen, not how representative it is of the river.

### Bands (half-open)

| Booked | Band |
| --- | --- |
| < 30% | Quiet |
| 30 – < 60% | Moderate |
| 60 – < 85% | Busy |
| 85 – < 100% | Crowded |
| 100% **and** coverage 100% | Packed |
| 100% with partial coverage | "All observed sites booked" + coverage shown |

Only the Quiet cut-off is decided; 60 and 85 are to be checked against real
weekends.

### Freshness

- 72 h (`maxObservationAgeSeconds`) is the expiry limit, not proof of
  currency.
- Tonight: a reading from the latest sync cycle (≤ ~26 h) is "Checked today";
  older-but-unexpired is labelled "Checked yesterday" and marked not final.
- Future nights read "booked so far". Beyond 7 nights, show the percentage
  only (proposal).

### Aggregation rule

A campground serving two rivers counts toward each river's view. River totals
are never summed into a regional total.

## Server change

The overview drops stale nights and carries no capacity baseline, so the
client cannot size a missing campground. Add one field per tracked
campground to `/api/camping/availability`:

- `expectedReservable: number | null` — distinct sites in `campsite_sites`
  seen within the last 30 days whose recent per-site status is not walk-up.

Additive, so existing clients are unaffected. Kept in sync with
`@eddy/types` by the existing type test.

## Phases

### Phase 0 — Keep history (start now, does not block v1)

`pruneOldNights` (`src/lib/camping/sync.ts`) deletes nights older than 7
days. Add an append-only table written by the sync cron before pruning:

- `campsite_occupancy_history(facility_id, date, lead_days, observed_at,
  sites_open, sites_reservable, status, source, expected_reservable)`,
  PK `(facility_id, date, lead_days)`.
- Captured at `lead_days` 0, 7 and 14. `source` is stored so state-park rows
  can be filtered out of any baseline.
- ~40k rows/year. Never pruned.
- Migration follows the ledger rule in `CLAUDE.md`.

### Phase 1 — Server field + shared scoring

- `expectedReservable` on the overview (above).
- `shared/crowd-signal.ts`: pure `campingDemandByRiver(overview, now)` plus the
  info-tip copy constant.
- `shared/crowd-signal.test.ts`, registered in the explicit `test` script:
  half-open band edges (29.99/30, 59.99/60, 84.99/85, 100), Packed requires
  full coverage, partial-coverage "all observed booked", zero-capacity full
  dropped, state-park rows ignored, loop/district overlap, each withhold
  reason, stale vs today vs yesterday, multi-river campgrounds, Chicago
  midnight rollover.

### Phase 2 — Today (iOS)

- Pill on favorite rows + one "Camping demand" card with the info tip.
- Tap through to `/camping` filtered to that river.
- Rollout flag `features.crowdSignal` from `CROWD_SIGNAL_ENABLED`, following
  the fail-closed `campingHeatmap` pattern.
- `make check-mobile` + `make bundle-mobile`; real-device QA for light/dark,
  large text and VoiceOver (including the info tip).

### Phase 3 — Web (optional)

Same shared function and info-tip copy on river pages.

### Phase 4 — Later

- Relative bands from history ("busier than a typical September Saturday").
- Fill-pace projection from lead-7/lead-14 snapshots.
- Reach level ("Upper Current: Crowded · Lower Current: Quiet").
- State parks, if their closed vs booked states can be separated.
- Opt-in alerts.

## Validation before release

- Read-only run against production for the next two weekends on Current,
  Jacks Fork and Buffalo; tune 60/85.
- Confirm a late-season night returns `seasonal_closure`, not Quiet.
- Confirm the Meramec shows the expected withhold reason and detail line.
- `make check-web`; `make check-mobile` + `make bundle-mobile`.

## Open questions

1. Backcountry districts (gravel-bar permits): count them? Proposal: yes,
   named in the detail line.
2. Middle cut-offs (60 / 85): keep, or tune after validation?
3. Beyond 7 nights: percentage only, band, or hidden?
