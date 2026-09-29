# Crowd signal (Quiet → Packed) — outline

Status: proposal, not built. Owner decision (September 29, 2026): under 30%
booked reads as Quiet.

## What it is

A per-river, per-night reading of how booked the river's reservable campsites
are, shown on Today as a Quiet → Packed scale with a short night strip. It is a
**demand signal**, not a headcount: most people on a summer Saturday are day
floaters in outfitter boats who never touch a reservation system. Copy must say
"campsites booked", never "people on the river".

## Why it is cheap

The camping heatmap (`docs/camping-heatmap.md`) already ships everything the
calculation needs in `CampingOverview` (`src/lib/camping/overview-types.ts`),
which Today already fetches from `/api/camping/availability`:

- `tracked[].riverSlugs` — which rivers each campground serves (a campground can
  serve more than one, e.g. Two Rivers).
- `tracked[].nights[]` — `sitesOpen`, `sitesReservable`, `status`, `checkedAt`
  per night, up to 90 nights out.
- `maxObservationAgeSeconds` (72 h) — the freshness rule already in force.
- Loop/aggregate overlap is already resolved server-side, so sites are not
  double-counted.

v1 therefore needs **no new endpoint and no migration** — only a pure function
and UI. The history table (Phase 0) is separate and should ship first because
it only becomes useful with time.

## The calculation

For river R and night D, over every tracked campground serving R:

1. Keep a night only if `status` is `open` or `full`, and `checkedAt` is within
   `maxObservationAgeSeconds`. `closed`, `not_yet_released`, stale and missing
   nights are excluded — they carry no inventory and must not read as full or
   as empty.
2. `booked = Σ(sitesReservable − sitesOpen) / Σ(sitesReservable)` across the
   kept nights (site-weighted, so a 100-site campground outweighs a 10-site
   one).
3. Confidence gate — return `insufficient` instead of a band when either:
   - kept reservable sites < 20, or
   - kept reservable sites < 50% of the river's tracked reservable capacity
     for that night (e.g. most campgrounds closed for the season).

| Booked | Band |
| --- | --- |
| < 30% | Quiet |
| 30–60% | Moderate |
| 60–85% | Busy |
| ≥ 85% | Crowded |
| every kept campground `full` | Packed |

Only the Quiet cut-off is decided; the other three are a starting proposal to
check against real weekends (see Validation).

Output shape (proposal):

```ts
type CrowdBand = 'quiet' | 'moderate' | 'busy' | 'crowded' | 'packed';
interface CrowdNight {
  date: string;
  band: CrowdBand | 'insufficient';
  bookedPct: number | null;      // 0–100, null when insufficient
  sitesReservable: number;       // kept inventory, for the detail line
  campgroundsCounted: number;
  campgroundsFull: number;
  leadDays: number;              // 0 = tonight
  final: boolean;                // leadDays <= 1: close to the real outcome
}
```

### Rules for honesty

- **Future nights are "booked so far".** A Saturday 45% booked ten days out may
  sell out. When `final` is false, label "45% booked so far", never "Quiet".
  Consider showing the band only for `leadDays <= 7` and a percentage beyond.
- **Insufficient beats Quiet.** Late-season closures must render "Not enough
  campground data", not a calm river.
- **Weak rivers.** Where the only campground is a non-float draw (Bennett
  Spring's trout park on the Niangua), mark the river `lowSignal` in a small
  curated list and either hide the card or add a caveat.
- **Reservable sites only** — the same footer the heatmap already uses.

## Phases

### Phase 0 — Start keeping history (ship first)

`pruneOldNights` (`src/lib/camping/sync.ts`) deletes nights older than 7 days,
so there is no baseline today. Add an append-only table and write to it in the
sync cron **before** pruning:

- `campsite_occupancy_history(facility_id, date, lead_days, sites_open,
  sites_reservable, status, captured_at)`, PK `(facility_id, date, lead_days)`.
- Capture at `lead_days` 0, 7 and 14 (final outcome plus fill pace).
- Size: ~36 facilities × 365 nights × 3 ≈ 40k rows/year. Never pruned.
- Migration follows the ledger rule in `CLAUDE.md` (file named for the version
  production records; entry in `supabase/production-migrations.txt`).

### Phase 1 — Shared scoring

- `missouri-float-planner/shared/crowd-signal.ts`: pure
  `crowdByRiver(overview, now) → Map<riverSlug, CrowdNight[]>`. Lives in
  `shared/` so web and iOS (`@eddy/conditions`) cannot drift.
- `shared/crowd-signal.test.ts`, registered in the explicit `test` script:
  band edges (29.9 / 30 / 60 / 85), all-full → packed, closed and unreleased
  exclusion, stale `checkedAt`, confidence gate, multi-river campgrounds,
  Chicago midnight rollover, lead-day / `final` labelling.

### Phase 2 — Today card (iOS)

- Placement: a compact band pill on each favorite river row, plus one
  "Crowds this weekend" card listing favorites (fallback: rivers near the
  user, then Across the Ozarks — same scoping as the heatmap).
- Card row: river name, band pill, 7-night strip with weekend nights
  emphasised; tap opens the existing `/camping` screen filtered to that river.
- Palette: its own sequential scale. Do **not** reuse the heatmap's
  green-open / red-booked colours, or "Quiet" and "lots of open sites" will
  look like two different facts.
- Accessibility: band name in text, not colour only; VoiceOver reads
  "Current River, Saturday: Busy, 72% of reservable campsites booked so far".
- Rollout flag: `features.crowdSignal` from `CROWD_SIGNAL_ENABLED`, following
  the fail-closed `campingHeatmap` pattern.
- Validate with `make check-mobile` + `make bundle-mobile`; real-device QA for
  light/dark, large text and VoiceOver.

### Phase 3 — Web (optional)

Same shared function on river pages next to the camping section.

### Phase 4 — Later, once history exists

- **Relative bands:** "busier than a typical September Saturday", thresholds
  by river and season from Phase 0 data.
- **Fill-pace forecast:** use lead-7/lead-14 history to project a future
  night's final occupancy instead of "booked so far".
- **Reach level:** "Upper Current: Crowded · Lower Current: Quiet". Needs a
  reach key per campground (access point mile → `river_sections`); backcountry
  districts map to reaches by hand.
- **Holiday awareness** and an opt-in alert ("Saturday on the Jacks Fork is
  90% booked").

## Validation before release

- Read-only run of the scoring against production `CampingOverview` for the
  next two weekends on Current, Jacks Fork, Buffalo and Meramec/Huzzah;
  sanity-check the middle band cut-offs against what those weekends actually
  look like.
- Confirm late-season behaviour on a night where most NPS campgrounds are
  `closed` → `insufficient`, not Quiet.
- `make check-web` for the shared function; `make check-mobile` +
  `make bundle-mobile` for the card.

## Open questions

1. **Backcountry districts** (Upper/Lower Current, Jacks Fork gravel-bar
   permits): count them? They are the most float-relevant inventory but are
   permits, not sites. Proposal: count them, and name them in the detail line.
2. **Middle band cut-offs** (60 / 85): keep, or tune after the validation run?
3. **Card placement:** pill on favorite rows only, a standalone card, or both?
4. **Beyond 7 days:** band, percentage only, or hidden?
