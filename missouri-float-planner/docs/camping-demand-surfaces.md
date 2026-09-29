# Camping availability + demand across the app — plan and styling

Status: proposal (September 29, 2026). Builds on `docs/crowd-signal.md`
(scoring, coverage, owner decisions) and `docs/camping-heatmap.md`
(availability grid). Nothing here changes the scoring rules.

## 1. The model: one dataset, two zoom levels

| | Availability | Demand |
| --- | --- | --- |
| Question | "Can I get a site?" | "How busy is it?" |
| Unit | one campground, one night | one river (or the region), one night |
| Source | `CampingOverview.tracked[].nights` | the same nights, summed by `shared/camping-demand.ts` |
| Colour language | heatmap: green openings, red booked-out outline | Quiet → Packed tan scale (§4) |

Two rules make them one feature instead of two:

1. **Every demand reading opens the availability behind it.** A river or
   regional band always links to the campgrounds that produced it.
2. **Every availability view gets a demand summary on top.** A list of
   campgrounds for a river is always headed by that river's band.

And one rule keeps them from blurring: **the two colour languages never share
a row.** Demand labels rivers and the region; availability labels campgrounds.

## 2. Which night each surface means

| Surface | Night | Why |
| --- | --- | --- |
| Today | Tonight (America/Chicago) | Owner decision in `crowd-signal.md` |
| `/camping`, river page, map river sheet, Favorites | Selected night; default the coming weekend's Saturday | Planning surfaces; Saturday is the peak |
| Float plan | The plan's trip date once plans have one; until then tonight **and** Saturday | Plans carry no date today (§5.5) |

A night selected on `/camping` or a river page stays selected when moving
between those two screens (shared state, cleared on app restart).

## 3. Surfaces

### 3.1 Today (exists — restyle only)
`TodayCamping` + `CampingDemandGauge`: keep the regional tonight reading.
Changes: move to the §4 tokens, use the compact meter, and demote the band
from `pageTitle` to `sectionTitle` (it is one card among many). Wording per
the §4.6 glossary ("not reporting", "tracked"). Tap → `/camping`.

### 3.2 `/camping` — where they merge (priority 1)
Each river section gets a **demand summary row** above its campground rows,
drawn on the same date ruler and horizontal scroll as the heatmap:

```
             Tu  W  Th  F   Sa  Su
CURRENT RIVER                         Sat: Quiet · 28% booked
 Demand      ▭   ▭   ▭  ▭   ▬   ▭    ← DemandStrip cells (tan scale)
 Akers        ●   ●   ●  ●   ◐   ●    ← existing CampingTableRow (green/red)
 Pulltite     ●   ●   ●  ◐   ■   ●
```

- Tapping a demand cell selects that night: the column highlights for every
  row, the section header text updates, and the campground detail sheet opens
  on that night if tapped next.
- Withheld nights draw a neutral dash, never a Quiet fill.
- The "Other tracked campgrounds" group (no river link) gets no summary row.
- State-park campgrounds keep their heatmap rows but are excluded from the
  summary (Recreation.gov only); the section footer says so when a river has
  state-park rows.

### 3.3 River page — `app/river/[slug].tsx` (priority 2)
The Campgrounds section header gains a `DemandSummary` block:
band pill, "64% of tracked sites booked · Sat night", and a 7-night
`DemandStrip`. Existing campground rows keep their availability lines.
Tap → `/camping?river=<slug>` (param exists).

### 3.4 Map
- **River sheet** (`map-sheet/RiverSheet.tsx`): one `DemandPill` beside the
  river name for the selected night. Tap → river page camping section.
- **Campground pin** (`CampgroundAvailability`, `NightStrip`): unchanged —
  availability only.

### 3.5 Float plan — `PlanSupport.tsx` (priority 3)
New "Camping near this float" block above the put-in / take-out campground
rows: the river's `DemandPill` for tonight and Saturday, plus each listed
campground's existing open-sites line. When plans gain a trip date, both
switch to that night.

### 3.6 Favorites (priority 4)
Saved river rows show a `DemandPill` for the coming Saturday. No strip.

### 3.7 Website (optional, later)
River pages (`src/components/river/NearbyServices.tsx`) can show the same
summary using the §4.4 CSS. `AvailabilityChip` stays neutral slate, as its
header requires.

## 4. Styling system

### 4.1 Rules

1. **No verdict hues.** The Quiet → Packed scale uses Sandbar Tan only.
   Red/orange/yellow/lime/emerald are river-condition verdicts
   (`CONDITION_SYSTEM`), and coral is Eddy's identity colour — ADR 0007
   already records why a red-orange object next to condition badges reads as
   danger. The scale shipped in `CampingDemandGauge` / the first demand card
   (`accent-400/600/700`) breaks this rule and is replaced.
2. **Text carries the meaning.** A band is always written out ("Busy"); fills
   are redundant emphasis. Percentages are always stated in text.
3. **Unknown is not Quiet.** Withheld nights and "Not enough data" draw a
   neutral dashed/outlined shape with no fill and no marker.
4. **Darker = busier in light mode; lighter = busier in dark mode.** Same
   approach as the rain and generation ramps in `palette.ts`: a deep tone
   that reads as emphatic on white disappears on near-black, so dark mode
   climbs toward the light end of the same family.
5. **One source of truth.** Hex values live once in
   `shared/camping-demand.ts` as `DEMAND_SCALE` (the way `CONDITION_SYSTEM`
   holds condition colours) and are mirrored by the iOS palette and
   `globals.css`, with a parity test.

### 4.2 The scale

Sandbar Tan shades from `tailwind.config.ts` / `globals.css`
(`--color-secondary-*`). Ink = text drawn on the fill.

| Band | Light fill | Light ink | Dark fill | Dark ink |
| --- | --- | --- | --- | --- |
| Quiet | `secondary-200` `#E8DFD0` | `neutral-950` (13.4:1) | `secondary-800` `#5C4E38` | `#FFFFFF` (8.1:1) |
| Moderate | `secondary-400` `#C9B391` | `neutral-950` (8.7:1) | `secondary-600` `#99835F` | `neutral-950` (4.9:1) |
| Busy | `secondary-600` `#99835F` | `neutral-950` (4.9:1) | `secondary-400` `#C9B391` | `neutral-950` (8.7:1) |
| Crowded | `secondary-800` `#5C4E38` | `#FFFFFF` (8.1:1) | `secondary-300` `#D9C9B0` | `neutral-950` (10.9:1) |
| Packed | `secondary-900` `#3D3425` | `#FFFFFF` (12.2:1) | `secondary-100` `#F4EFE7` | `neutral-950` (15.5:1) |
| Unknown | none; 1px `border-strong` outline | `text-muted` | none; 1px `border-strong` | `text-muted` |

All ink pairs pass WCAG AA for text (≥ 4.5:1). Quiet and Moderate fills are
below 3:1 against a white card (1.3:1 and 2.0:1), so every segment, pill and
cell also draws a 1px `border-strong` outline; the written band name carries
the meaning (rule 2). "All observed sites booked" (partial coverage) uses the
Crowded outline with no fill, so it never looks like Packed.

Selected night: 2px outline in `text` colour, offset 1px.

### 4.3 iOS tokens — `eddy-ios/src/theme/palette.ts`

- Add the missing Sandbar Tan shades (`300`, `400`, `600`, `700`, `800`,
  `900`) to `secondary`, matching `tailwind.config.ts` exactly.
- Add semantic roles to `Palette`, defined per scheme from §4.2:
  `demandQuiet`, `demandModerate`, `demandBusy`, `demandCrowded`,
  `demandPacked`, and `onDemandQuiet` … `onDemandPacked`.
- Components read `colors.demand*` via `useTheme()`; no raw scale values in
  components (same rule as every other role).

Component specs (new files under `src/components/demand/`):

| Component | Spec |
| --- | --- |
| `DemandPill` | `textStyles.caption` + `fonts.semibold`; padding 10×3; radius 999; fill + ink per band; 1px `border` outline |
| `DemandMeter` (compact) | 5 segments, height 6, gap 2, radius 3; marker 12px circle, 2px `card` ring, centred on the band (ordinal, not a % axis) |
| `DemandMeter` (hero, Today only) | height 10, marker 18px; band text uses `textStyles.sectionTitle` |
| `DemandStrip` | 7 cells, `flex: 1`, gap 4; bar height 8, radius 4; day initial below at 11pt (`S M T W T F S`); weekend initials semibold; each cell a button, 32pt tall with `hitSlop` to 44 |
| `DemandSummaryRow` (`/camping`) | same column widths and scroll group as `CampingTableRow`; label column "Demand" in `textStyles.caption` semibold; cells are `DemandStrip` bars |
| `DemandSummary` (river page / plan) | `DemandPill` + detail (`caption`, `textMuted`) + basis (`caption`, `textSubtle`) + optional `DemandStrip`; card radius `radii.card` (16) |

Spacing uses existing values: card padding 16, row vertical padding 10,
inter-line gap 2–4. Cards use `radii.card`; the Today card keeps
`radii.feature` (20) like its neighbours.

### 4.4 Web tokens — `missouri-float-planner/src/app/globals.css`

Add to the existing `:root` and `[data-theme="dark"]` blocks (the file already
uses `data-theme` for dark mode). Values reference the palette variables, never
raw hex:

```css
:root {
  /* Camping demand — Quiet → Packed. Sandbar Tan only: no condition-verdict
     hue and no coral (ADR 0007). Mirrors DEMAND_SCALE in
     shared/camping-demand.ts; a parity test keeps them equal. */
  --demand-quiet-fill: var(--color-secondary-200);
  --demand-quiet-ink: var(--color-neutral-950);
  --demand-moderate-fill: var(--color-secondary-400);
  --demand-moderate-ink: var(--color-neutral-950);
  --demand-busy-fill: var(--color-secondary-600);
  --demand-busy-ink: var(--color-neutral-950);
  --demand-crowded-fill: var(--color-secondary-800);
  --demand-crowded-ink: #FFFFFF;
  --demand-packed-fill: var(--color-secondary-900);
  --demand-packed-ink: #FFFFFF;
  --demand-outline: var(--color-border-strong);
  --demand-selected: var(--color-text-primary);
}

[data-theme="dark"] {
  --demand-quiet-fill: var(--color-secondary-800);
  --demand-quiet-ink: #FFFFFF;
  --demand-moderate-fill: var(--color-secondary-600);
  --demand-moderate-ink: var(--color-neutral-950);
  --demand-busy-fill: var(--color-secondary-400);
  --demand-busy-ink: var(--color-neutral-950);
  --demand-crowded-fill: var(--color-secondary-300);
  --demand-crowded-ink: var(--color-neutral-950);
  --demand-packed-fill: var(--color-secondary-100);
  --demand-packed-ink: var(--color-neutral-950);
}

/* Band is set with data-band="quiet|moderate|busy|crowded|packed|unknown". */
.demand-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 9999px;
  border: var(--border-thin) solid var(--demand-outline);
  font-size: 0.75rem;              /* 12px floor, same as AvailabilityChip */
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: var(--demand-fill, transparent);
  color: var(--demand-ink, var(--color-text-muted));
}
.demand-meter { display: flex; gap: 2px; height: 6px; }
.demand-meter > span {
  flex: 1;
  border-radius: 3px;
  border: var(--border-thin) solid var(--demand-outline);
  background: var(--demand-fill, transparent);
}
.demand-strip { display: flex; gap: 4px; }
.demand-cell {
  flex: 1;
  min-height: 32px;
  display: grid;
  justify-items: center;
  gap: 2px;
  background: none;
  border: 0;
  cursor: pointer;
}
.demand-cell > span:first-child {
  justify-self: stretch;
  height: 8px;
  border-radius: 4px;
  border: var(--border-thin) solid var(--demand-outline);
  background: var(--demand-fill, transparent);
}
.demand-cell[aria-pressed="true"] > span:first-child {
  outline: 2px solid var(--demand-selected);
  outline-offset: 1px;
}
.demand-cell:focus-visible { outline: 2px solid var(--color-primary-500); }

[data-band="quiet"]    { --demand-fill: var(--demand-quiet-fill);    --demand-ink: var(--demand-quiet-ink); }
[data-band="moderate"] { --demand-fill: var(--demand-moderate-fill); --demand-ink: var(--demand-moderate-ink); }
[data-band="busy"]     { --demand-fill: var(--demand-busy-fill);     --demand-ink: var(--demand-busy-ink); }
[data-band="crowded"]  { --demand-fill: var(--demand-crowded-fill);  --demand-ink: var(--demand-crowded-ink); }
[data-band="packed"]   { --demand-fill: var(--demand-packed-fill);   --demand-ink: var(--demand-packed-ink); }
[data-band="unknown"]  { --demand-fill: transparent; }

@media (prefers-reduced-motion: no-preference) {
  .demand-cell > span:first-child { transition: outline-color var(--duration-fast) var(--ease-default); }
}
```

No new Tailwind colour family: the token check
(`scripts/check-tailwind-tokens.ts`) only resolves numeric shades, and these
are CSS-variable classes. Components apply `data-band` rather than
`bg-[…]` arbitrary values.

### 4.5 Typography

| Element | iOS | Web |
| --- | --- | --- |
| Section / card title | `textStyles.cardTitle` | existing card heading class |
| Band (hero, Today) | `textStyles.sectionTitle` (was `pageTitle`) | `text-xl font-semibold` |
| Band (pill) | `caption` + `fonts.semibold` | `.demand-pill` |
| Detail ("28% of tracked sites booked") | `caption`, `textMuted` | `text-sm text-[var(--color-text-secondary)]` |
| Basis / freshness | `caption`, `textSubtle` | `text-xs text-[var(--color-text-muted)]` |
| Percentages | tabular figures (`fontVariant: ['tabular-nums']`) | `font-variant-numeric: tabular-nums` |

### 4.6 Copy glossary (use exactly)

| Say | Not | Why |
| --- | --- | --- |
| Camping demand | Crowds, busyness | It measures bookings, not people |
| tracked campsites / tracked sites | checked campsites | "checked" reads as checked-in |
| booked so far | booked (future nights) | Future nights still fill |
| not reporting | unavailable | "unavailable" reads as sold out or closed |
| Not enough data | Quiet (when withheld) | Rule 3 |
| Checked today / Checked yesterday / Older reading — may be out of date | Updated … | Chicago calendar day of the reading |
| Sat night | Saturday | The date means that night |

Info tip: `CAMPING_DEMAND_INFO` unchanged, on every surface that shows a band.

### 4.7 Accessibility

- Every band surface is one VoiceOver element with the spoken sentence from
  `demandAccessibilityLabel` (river, night, band, detail); meters are hidden
  from VoiceOver.
- Strip cells are individual buttons with `accessibilityState.selected` /
  `aria-pressed` and their own labels.
- Touch targets ≥ 44pt (cells via `hitSlop`).
- Check both schemes, largest Dynamic Type size and reduced motion on device.

### 4.8 Drift guards

- `DEMAND_SCALE` in `shared/camping-demand.ts` (hex per band, light and dark,
  fill and ink) is the reference.
- A new test asserts iOS `lightPalette`/`darkPalette` `demand*` roles and the
  `globals.css` `--demand-*` values (resolved through the palette variables)
  equal `DEMAND_SCALE`, and that every ink pair is ≥ 4.5:1.
- Found while writing this: `accent-700` is `#CC3E2B` on web
  (`tailwind.config.ts`, `globals.css`, `shared/social-brand.ts`) but
  `#C7432E` in `eddy-ios/src/theme/palette.ts`. Out of scope here; worth its
  own small fix.

## 5. Build plan

Each step is one PR; each gets `make check-web` and, where iOS changes,
`make check-mobile` + `make bundle-mobile`. No new flags: everything sits
behind the existing `campingHeatmap` + `crowdSignal`.

1. **Tokens + primitives.** `DEMAND_SCALE` in shared; iOS palette shades and
   `demand*` roles; `globals.css` block; `src/components/demand/`
   (`DemandPill`, `DemandMeter`, `DemandStrip`, `DemandSummary`); parity and
   contrast tests. Restyle `CampingDemandGauge` onto the tokens and apply the
   §4.6 wording. *Visible change: Today's colours and copy.*
2. **`/camping` summary rows** (§3.2). Shared selected-night state; a river-
   level helper in `shared/camping-demand.ts` for "demand per river per
   horizon night" (already expressible with `campingDemandByRiver`).
3. **River page summary** (§3.3).
4. **Float plan block** (§3.5) using tonight + Saturday.
5. **Map river sheet + Favorites pills** (§3.4, §3.6).
6. **Optional:** optional trip date on plans (unlocks §3.5 by date and
   forecast alignment); website river-page summary (§3.7).

Validation before each release: device pass in light/dark, largest text and
VoiceOver; confirm no demand colour appears on a row that also carries a
condition badge or heatmap cells.

## 6. Decisions needed

1. Approve the Sandbar Tan scale replacing the coral scale (rule 1).
2. Planning surfaces default to the coming Saturday; Today stays tonight — OK?
3. Shared selected night between `/camping` and river pages — OK, or keep
   per-screen?
4. Float plans: add an optional trip date (step 6), or keep tonight + Saturday?
