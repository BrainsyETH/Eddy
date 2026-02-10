# Eddy.guide — Senior UX Review

**Reviewer:** Senior UX Designer & Coder (code-level audit)
**Date:** 2026-02-10
**Site:** https://eddy.guide
**Codebase:** Next.js 14 / TypeScript / Tailwind / Supabase / MapLibre

---

## 1. High-Level UX Assessment

### Executive Summary

Eddy.guide is a well-built float trip planning tool with a strong technical foundation, real-time USGS data, and a charming mascot (Eddy the Otter). The product clearly has deep domain knowledge baked into it — condition thresholds, local knowledge sections, per-gauge contextual descriptions — this is rare and valuable.

**What works well:**

- **Real-time USGS integration** with auto-refresh (10-min intervals) is table-stakes for a conditions tool and it's done correctly.
- **The condition color system** (Too Low → Low → Okay → Optimal → High → Flood) is intuitive and well-implemented through `computeCondition()` in `src/lib/conditions.ts`. Single source of truth is correct.
- **Local Knowledge content** (hardcoded per-river summaries) is the kind of thing that builds real trust with users. This is a competitive advantage.
- **The float plan card** (`FloatPlanCard.tsx`) is genuinely well-designed — put-in/take-out with auto-swap logic, inline conditions, shuttle route link, and "Along Your Route" POIs.
- **URL state persistence** for float plans (`?putIn=&takeOut=&vessel=`) enables sharing and back-button behavior. Smart.
- **The mobile bottom sheet** for float plans is a correct pattern for this type of app.

**What is most broken:**

- **The homepage fails to answer the #1 question** users arrive with: "Can I float today?" There is no at-a-glance conditions summary for each river. The gauge stats grid shows aggregate counts (e.g., "3 Optimal") without connecting them to river names.
- **Terminology inconsistency** between internal codes and display labels creates cognitive friction. The code has `low` meaning "Okay" and `very_low` meaning "Low" — this leaks into the UI in confusing ways.
- **Critical safety information is hidden behind collapsed sections.** Local Knowledge defaults to `defaultOpen={false}` on river pages. If a river is at dangerous levels, there's no prominent warning — just a colored badge.
- **The River detail page buries conditions below the map.** The most important question ("Is it safe?") requires scrolling past the planner selectors, local knowledge (collapsed), and the full map.

**Where the biggest leverage is:**

1. Surface the answer to "Should I float today?" within the first 3 seconds on every page.
2. Fix the terminology mismatch between condition codes and display labels.
3. Promote safety warnings from passive badges to active, blocking UI patterns.

---

## 2. Priority Issues (Ranked)

### CRITICAL (Must Fix)

#### C1. Homepage doesn't answer "Can I float today?"

**File:** `src/app/page.tsx:152-178`

The "Check River Levels" card on the homepage shows aggregate gauge stats in a 3×2 grid:
```
Too Low: 2  |  Low: 1   |  Okay: 3
Optimal: 2  |  High: 0  |  Flood: 0
```

**Problem:** These numbers are disconnected from river names. A user seeing "2 Optimal" cannot determine which rivers are optimal without clicking through. The homepage's entire content is two cards — a float estimator and this gauge summary — neither of which answers the primary question.

**Impact:** Users in a parking lot, on mobile, checking conditions before a 2-hour drive, bounce because they can't get a fast answer.

**Fix:** Replace the aggregate stats grid with a per-river condition summary. Each row should show: `[River Name] [Condition Badge] [Gauge Height]`. One glance should tell you which rivers are good to go.

Example structure:
```
Current River    [Optimal]  2.4 ft
Eleven Point     [Okay]     3.1 ft
Jacks Fork       [Too Low]  1.2 ft
```

This is the single highest-leverage change possible.

---

#### C2. Condition terminology is confusing and internally inconsistent

**Files:** `src/lib/conditions.ts`, `src/constants/index.ts:74-82`

The condition code system has a confusing mapping:

| Internal Code | Short Label (UI) | Full Label (constants) |
|---|---|---|
| `too_low` | "Too Low" | "Too Low - Not Recommended" |
| `very_low` | "Low" | "Low - Scraping Likely" |
| `low` | "Okay" | "Okay - Floatable" |
| `optimal` | "Optimal" | "Optimal Conditions" |
| `high` | "High" | "High Water - Experienced Only" |
| `dangerous` | "Flood" | "Flood - Do Not Float" |

**Problem:** The code `low` means "Okay" in the UI. The code `very_low` means "Low" in the UI. This is backwards from what any developer or user would expect. It means:
- A variable named `levelLow` in the threshold configuration maps to the "Okay" condition.
- The `getConditionShortLabel('low')` returns "Okay", not "Low".
- In `gauges/page.tsx:379`, `case 'low': counts.okay++` — the code itself documents the confusion.

**Impact:** Any new developer touching this code will introduce bugs. Any user reading the HTML/code through dev tools will be confused. The data model fights against comprehension.

**Fix:** Rename the internal codes to match what they mean:

| Old Code | New Code |
|---|---|
| `too_low` | `too_low` (unchanged) |
| `very_low` | `low` |
| `low` | `okay` |
| `optimal` | `optimal` (unchanged) |
| `high` | `high` (unchanged) |
| `dangerous` | `dangerous` (unchanged) |

This is a breaking change to the `ConditionCode` type, but it's the right call. The current naming will cause bugs the longer it lives.

---

#### C3. Safety warnings are passive, not active

**Files:** `src/components/river/RiverHeader.tsx`, `src/components/river/LocalKnowledge.tsx`

When a river is at dangerous/flood levels, the only indicator is:
1. A colored badge in the header (desktop-only gauge summary at `RiverHeader.tsx:86`)
2. The condition color dot in the nav dropdown (a 2×2 pixel dot)

There is no:
- Banner warning ("This river is currently closed due to flooding")
- Modal or interstitial for dangerous conditions
- Text explanation of what the condition means for safety
- Recommendation to not float

The `LocalKnowledge` component has safety tips like "Flash floods are a serious concern" but defaults to collapsed (`defaultOpen={false}` at `LocalKnowledge.tsx:39`).

**Impact:** A first-time user could see "High" in orange, not understand the severity, and put in on a dangerous river.

**Fix:** Add a prominent, non-dismissible safety banner when `condition.code === 'dangerous' || condition.code === 'high'` at the top of the river detail page. This should be a full-width alert with:
- Clear language: "This river is currently at HIGH water. Not recommended for inexperienced floaters."
- For dangerous: "This river is CLOSED. Do not float. Water levels are at flood stage."
- Link to the gauge data for transparency

---

### HIGH

#### H1. River detail page has wrong information hierarchy

**File:** `src/app/rivers/[slug]/page.tsx:476-622`

Current order on the river detail page:
1. River Header (name, stats, gauge reading)
2. Planner Panel (put-in/take-out selectors)
3. Local Knowledge (collapsed)
4. Map + Access Point Strip
5. Hint text ("Tap an access point...")
6. Float Plan Card (appears after selection)
7. **Gauge Overview / River Conditions** ← buried here
8. Points of Interest

**Problem:** The conditions section — which answers "Is this safe? Should I float?" — is item #7 in the page hierarchy, below the map and planner. Users who just want to check conditions have to scroll past the entire planning interface.

**Fix:** Move `GaugeOverview` (conditions) above the map, immediately after the header. The flow should be:
1. Header (river name + conditions at a glance)
2. Conditions (expanded by default for non-repeat visitors)
3. Planner selectors
4. Map + access points
5. Float plan card

---

#### H2. "ONSR" filter label is unexplained jargon

**File:** `src/app/gauges/page.tsx:589-599`

The gauges page has a filter button labeled "ONSR" with a tooltip on hover:
```tsx
<button title="Ozark National Scenic Riverways - Current, Eleven Point, Jacks Fork">
  ONSR
</button>
```

**Problem:** "ONSR" is a National Park Service acronym that most casual floaters won't recognize. The tooltip only appears on hover (not on mobile). The button is on by default (`onsrOnly: true` at line 183), which means first-time visitors see a filtered view without understanding the filter.

**Impact:** Users looking for a specific river outside ONSR won't see it and will think the site doesn't cover it. They won't know to click a button labeled with jargon they don't understand.

**Fix:** Replace "ONSR" with "Ozark Scenic Rivers" or "Featured Rivers". Add a subtitle: "Current, Eleven Point, Jacks Fork". Make it visually clear this is an active filter limiting results.

---

#### H3. The "Feet" and "CFS" labels in the float plan conditions card assume local knowledge

**File:** `src/components/plan/FloatPlanCard.tsx:948-961`

The conditions display shows:
```
2.4        |  456
FEET       |  CFS
```

**Problem:** Most casual floaters don't know what CFS means. Even "Feet" is ambiguous — feet of what? The USGS context is missing. The `InfoTooltip` in the `RiverHeader` provides this context ("Water volume in cubic feet per second") but the float plan card omits it.

**Fix:** Add a brief label or info tooltip: "Gauge Height" instead of "Feet", and "Water Flow" instead of "CFS". The full technical units can appear as secondary text.

---

#### H4. Mobile: float plan bottom sheet collapsed state is opaque

**File:** `src/components/plan/FloatPlanCard.tsx:1116-1184`

When a user selects both put-in and take-out on mobile, a bottom sheet appears with:
- Collapsed: "Your Float Plan" + distance + chevron (65px height)
- Expanded: full details

**Problem:** The collapsed state doesn't show the condition. A user who selected points, collapsed the sheet, and is now looking at the map has no condition indicator visible. The collapsed bar shows distance but not whether the river is safe.

**Fix:** Add the condition badge to the collapsed state:
```
Your Float Plan    [Optimal]  4.2 mi  ▲
```

---

#### H5. No "last updated" timestamp prominently displayed for conditions

**Files:** `src/components/river/RiverHeader.tsx:111-115`, `src/app/gauges/page.tsx:1039-1051`

The reading age is shown as "Updated 3h ago" in small text in the header and in expanded gauge details, but:
- On the river detail page, it only shows if `readingAgeHours < 24` (what if data is 2 days old?)
- The gauges page timestamp is hidden inside the expanded card detail
- The home page gauge stats have no timestamp at all

**Problem:** Users need to know if data is fresh. Stale data could lead to dangerous decisions.

**Fix:** Always show the data freshness prominently. If data is older than 2 hours, show a warning icon. If older than 12 hours, show a stale-data warning banner.

---

### MEDIUM

#### M1. Homepage has only two action paths, both require multiple clicks

**File:** `src/app/page.tsx:128-188`

The homepage has exactly two interactive elements:
1. Float Estimator (3-step form: select river → put-in → take-out → click)
2. "Check River Levels" card (click through to `/gauges`)

There are no:
- Quick links to individual rivers
- Current conditions preview
- Recent/popular float routes
- "What's floating well right now?" callout

**Fix:** Add a "Conditions Right Now" section below the hero showing each river with its current condition. Each row links directly to the river page. This converts the homepage from a dead-end to a routing hub.

---

#### M2. Map height is short on mobile (350px) and shows no conditions

**File:** `src/app/rivers/[slug]/page.tsx:510`

The map is `h-[350px]` on mobile. Access points are clickable but have no condition-color indicators. The weather bug overlays on the map but conditions don't.

**Fix:** Consider showing the condition as a floating badge on the map (similar to WeatherBug position). The map doesn't need to be taller — but it needs to communicate conditions without requiring scroll.

---

#### M3. The Float Estimator on the homepage has no condition preview

**File:** `src/app/page.tsx:229-362`

When a user selects a river in the float estimator, they see put-in and take-out selectors but no conditions for that river. They complete the 3-step form, click "View Trip Details", navigate to the river page, and only then learn the river is at flood stage.

**Fix:** After selecting a river, show its current condition inline (e.g., a small badge next to the river selector or below it). This prevents wasted navigation.

---

#### M4. The `select` dropdowns on the homepage have poor mobile UX

**File:** `src/app/page.tsx:281-292`

Standard `<select>` elements with `bg-white/25` on a dark background:
```tsx
<select className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none">
```

**Problem:** On iOS, native select dropdowns show the option text in dark mode with white text on a dark background. The `className="bg-neutral-800"` on `<option>` elements doesn't work on iOS — option styling is controlled by the OS. Users may see invisible text.

**Fix:** Test on iOS Safari. If options are unreadable, switch to a custom dropdown component or remove the option background styling.

---

#### M5. Duplicate code between `gauges/page.tsx` and `GaugeOverview.tsx`

**Files:** `src/app/gauges/page.tsx:1113-1387` and `src/components/river/GaugeOverview.tsx:134-362`

The `FlowTrendChart` component (SVG chart with threshold lines) is duplicated nearly line-for-line in both files. The `EDDY_CONDITION_IMAGES` mapping is duplicated in at least three files: `gauges/page.tsx`, `GaugeOverview.tsx`, and `FloatPlanCard.tsx`.

**Impact:** Bug fixes or improvements to the chart must be applied in two places. This will cause drift.

**Fix:** Extract `FlowTrendChart` into a shared component under `src/components/ui/`. Extract `EDDY_CONDITION_IMAGES` and `getEddyImageForCondition` into constants.

---

#### M6. Gauge weather is only loaded on expand, causing a perceived delay

**File:** `src/components/river/GaugeOverview.tsx:385-389`

```tsx
<GaugeWeather lat={...} lon={...} enabled={true} />
```

Weather data only loads when the gauge card is expanded. This means every expand action triggers a visible loading state.

**Fix:** Prefetch weather data for the closest gauge on the river detail page. On the gauges page, consider prefetching for the first 3 visible gauges.

---

### LOW

#### L1. Footer safety disclaimer is easy to miss

**File:** `src/app/page.tsx:192-198`

The safety disclaimer is in the footer in a muted color:
```tsx
<div className="mb-4 p-4 bg-primary-700/50 rounded-lg border border-primary-600/30">
  <p className="text-sm text-primary-100">Safety First: Eddy is a planning guide only...</p>
</div>
```

For a product where decisions could affect physical safety, this should be more prominent — but it's a low-priority fix compared to the active condition warnings.

---

#### L2. "Plan Your Float" dropdown label changes to river name when active

**File:** `src/components/layout/SiteHeader.tsx:89`

```tsx
<span>{activeRiver ? activeRiver.name : 'Plan Your Float'}</span>
```

When viewing a river page, the nav dropdown label changes from "Plan Your Float" to "Current River" (the river name). This is mildly disorienting — the navigation label shouldn't change based on context. Users may not realize "Current River" is the same dropdown as "Plan Your Float".

**Fix:** Keep "Plan Your Float" as the label always, or use a consistent label like "Rivers". Show the active river name inside the dropdown with a checkmark (already done) rather than replacing the trigger label.

---

#### L3. `dangerouslySetInnerHTML` used for local tips

**File:** `src/components/plan/FloatPlanCard.tsx:744-747`

```tsx
<div dangerouslySetInnerHTML={{ __html: point.localTips }} />
```

This renders HTML directly from the database. If admin-entered content includes unsanitized HTML, this is an XSS vector. Since this is admin-controlled content, the risk is low, but it should be sanitized.

**Fix:** Use a sanitization library (DOMPurify) or render markdown instead of raw HTML.

---

## 3. Concrete Improvement Suggestions

### Suggestion 1: "Conditions at a Glance" on Homepage

**Problem:** Homepage doesn't answer "Can I float today?"

**Current state** (`src/app/page.tsx`): Two cards — float estimator and aggregate gauge stats.

**Proposed change:** Add a "River Conditions" section between the two cards (or replace the aggregate stats card entirely). Each river gets a row:

```
┌──────────────────────────────────────────────┐
│  RIVER CONDITIONS                     Live   │
├──────────────────────────────────────────────┤
│  🟢 Current River         Optimal   2.4 ft  │
│  🟡 Eleven Point          Okay      3.1 ft  │
│  ⚪ Jacks Fork            Too Low   1.2 ft  │
│                                              │
│  Updated 45 min ago · Data from USGS         │
└──────────────────────────────────────────────┘
```

Each row links to `/rivers/[slug]`. The condition badge uses the existing color system. This turns the homepage from 3+ clicks to instant insight.

**Implementation path:**
1. Use the existing `useRivers()` hook which already includes `currentCondition` on each river.
2. Map over rivers, render a row per river with `conditionColors[river.currentCondition.code]` for the badge.
3. Add a timestamp from the gauge data.

---

### Suggestion 2: Safety Banner for Dangerous Conditions

**Problem:** No active warning when conditions are dangerous.

**Proposed change:** Add a `ConditionWarningBanner` component rendered at the top of the river detail page (`src/app/rivers/[slug]/page.tsx`) when conditions are `high` or `dangerous`.

```
┌──────────────────────────────────────────────┐
│  ⚠️ HIGH WATER WARNING                       │
│  The Current River is at 4.2 ft (Akers).    │
│  Not recommended for inexperienced floaters. │
│  River closures may be in effect.            │
└──────────────────────────────────────────────┘
```

For `dangerous`:
```
┌──────────────────────────────────────────────┐
│  🚫 RIVER CLOSED — FLOOD CONDITIONS          │
│  Do not float. Water levels are at 5.1 ft.  │
│  Contact local outfitters for updates.       │
└──────────────────────────────────────────────┘
```

**Implementation path:**
1. Create `src/components/river/ConditionWarningBanner.tsx`
2. Accept `condition: RiverCondition` prop
3. Render only when `condition.code === 'high' || condition.code === 'dangerous'`
4. Insert in `rivers/[slug]/page.tsx` between `<RiverHeader>` and the planner panel

---

### Suggestion 3: Reorder River Detail Page Hierarchy

**Problem:** Conditions are buried below the map.

**Proposed change:** Restructure the river detail page (`src/app/rivers/[slug]/page.tsx:485-612`):

Current order:
1. PlannerPanel
2. LocalKnowledge (collapsed)
3. Map + AccessPointStrip
4. Hint text
5. FloatPlanCard
6. **GaugeOverview** ← too far down
7. PointsOfInterest

Proposed order:
1. ConditionWarningBanner (new, only for high/dangerous)
2. GaugeOverview (moved up, default open)
3. PlannerPanel
4. Map + AccessPointStrip
5. FloatPlanCard
6. LocalKnowledge
7. PointsOfInterest

**Rationale:** Users checking conditions get their answer immediately. Users planning a float still have the planner easily accessible. The map moves down slightly but remains in the natural flow.

---

### Suggestion 4: Fix Condition Code Naming

**Problem:** Internal codes don't match display labels.

**Proposed change:** Rename the `ConditionCode` type and all references:

```typescript
// Current (confusing)
type ConditionCode = 'too_low' | 'very_low' | 'low' | 'optimal' | 'high' | 'dangerous' | 'unknown';

// Proposed (clear)
type ConditionCode = 'too_low' | 'low' | 'okay' | 'optimal' | 'high' | 'dangerous' | 'unknown';
```

This requires updating:
- `src/types/api.ts` (type definition)
- `src/lib/conditions.ts` (return values)
- `src/constants/index.ts` (colors and labels)
- All components referencing condition codes
- Database threshold field names if they reference these codes

This is a medium-sized refactor but prevents ongoing confusion.

---

### Suggestion 5: Inline Condition in Homepage Float Estimator

**Problem:** Users complete the 3-step estimator without knowing conditions.

**Proposed change:** After selecting a river in the float estimator, show the condition inline:

```
River: [Current River ▼]          🟢 Optimal
Put-in: [Cedar Grove ▼]
Take-out: [Akers Ferry ▼]

[View Trip Details →]
```

**Implementation path:**
1. In `FloatEstimator` component (`src/app/page.tsx:229`), the `rivers` array already includes `currentCondition`.
2. After `handleRiverChange`, look up the selected river's condition.
3. Render a small badge next to the river selector.

---

## 4. UX Anti-Patterns Detected

### 4.1. Expert-Only UX Assumption: "Stage" and "Flow"

In `RiverHeader.tsx:94-107`, the gauge reading displays "Stage" and "Flow" with info tooltips. These are hydrological terms. Most casual floaters don't know what "stage" means. The tooltip helps but is invisible on first glance.

**Better:** Use "Water Level" and "Water Flow" as primary labels, with "(Stage)" and "(CFS)" as secondary text.

---

### 4.2. Accidental Complexity: 6-Level Condition Scale

The site uses a 6-level condition scale:
```
Too Low → Low → Okay → Optimal → High → Flood
```

Six levels is cognitively expensive. Most users only need 3-4 levels:
- **Good to go** (Okay + Optimal)
- **Marginal** (Low)
- **Don't go** (Too Low, High, Flood)

The site already does this visually (green for good, yellow for caution, red for danger) but then adds 6 text labels that fragment the signal.

**Recommendation:** Keep the 6-level system for the detailed gauge view (power users want precision), but collapse to 3 levels for summary views:
- **Good** (green) = Okay + Optimal
- **Caution** (yellow) = Low + High
- **Stop** (red) = Too Low + Flood

---

### 4.3. Overloaded Page: Gauges Dashboard

`src/app/gauges/page.tsx` is a 1387-line single file containing:
- The page component
- Gauge stats calculation
- River summaries (hardcoded)
- Threshold descriptions (hardcoded)
- A full SVG chart component (`FlowTrendChartWithDays`)
- Filter state management
- Share functionality
- Feedback modal integration

This is both a code smell and a UX symptom. The page tries to be both a dashboard (summary view) and a detailed reference (per-gauge charts, thresholds). First-time users scanning conditions get the same UI as power users analyzing flow trends.

**Recommendation:** Separate the "summary" and "detail" concerns. The default view should be a clean list of rivers with conditions. Expanding a gauge should feel like a deep-dive, not the default state.

---

### 4.4. Hidden Information Behind Collapsed Sections

Multiple components default to collapsed:
- `LocalKnowledge`: `defaultOpen={false}` — safety-critical information
- `GaugeOverview` on river page: `defaultOpen={false}` — conditions data
- `PointsOfInterest`: `defaultOpen={false}` — trip planning info

The pattern of "collapse everything" optimizes for clean visual design at the expense of discoverability. First-time users may never expand these sections.

**Recommendation:** Default to open for conditions and local knowledge on first visit. Use local storage to remember user preference. Never collapse safety-relevant information.

---

### 4.5. Color-Only Communication

Several condition indicators rely solely on color:
- Navigation dropdown: 2px colored dots (`SiteHeader.tsx:110`)
- Gauge stat cards on homepage: colored numbers with no icons
- Map access point markers: color-coded without text labels

This fails for color-blind users (~8% of males) and is also just harder to parse in bright sunlight on a phone screen.

**Recommendation:** Always pair color with text or an icon. The condition badges in the gauge cards do this well — extend the pattern everywhere.

---

## 5. North Star UX Principle

**"Answer first, explore second."**

Every page should answer the user's primary question within 3 seconds of load, before requiring any interaction. Conditions should be visible before planning. Safety warnings should be visible before the map. The answer to "Should I float today?" should never be more than one glance away.

---

## 6. Highest-Leverage Single Change

**Add a per-river condition summary to the homepage.**

Replace the aggregate gauge stats grid (`src/app/page.tsx:152-178`) with a simple list showing each river's name, condition badge, and current gauge reading. Link each row to the river page.

This single change:
- Answers the #1 user question on the #1 page
- Requires zero new data (rivers already have `currentCondition`)
- Takes the homepage from "2+ clicks to know if I should float" to "instant"
- Reduces bounce rate for the most critical user segment (mobile, low-patience, checking conditions)

Estimated effort: ~50 lines of JSX. No new API calls. No new components. Just replace the stats grid with a river list.

---

## Appendix: File Reference Map

| Issue | Primary File(s) |
|---|---|
| C1. Homepage conditions | `src/app/page.tsx:152-178` |
| C2. Condition codes | `src/lib/conditions.ts`, `src/constants/index.ts:74-82`, `src/types/api.ts` |
| C3. Safety warnings | `src/components/river/RiverHeader.tsx`, `src/app/rivers/[slug]/page.tsx` |
| H1. Page hierarchy | `src/app/rivers/[slug]/page.tsx:485-612` |
| H2. ONSR jargon | `src/app/gauges/page.tsx:589-599` |
| H3. Feet/CFS labels | `src/components/plan/FloatPlanCard.tsx:948-961` |
| H4. Mobile bottom sheet | `src/components/plan/FloatPlanCard.tsx:1116-1184` |
| H5. Timestamp visibility | `src/components/river/RiverHeader.tsx:111-115` |
| M1. Homepage action paths | `src/app/page.tsx:128-188` |
| M2. Map height/conditions | `src/app/rivers/[slug]/page.tsx:510` |
| M3. Estimator conditions | `src/app/page.tsx:229-362` |
| M4. iOS select styling | `src/app/page.tsx:281-292` |
| M5. Duplicate chart code | `src/app/gauges/page.tsx`, `src/components/river/GaugeOverview.tsx` |
| M6. Weather prefetch | `src/components/river/GaugeOverview.tsx:385-389` |
| L1. Footer disclaimer | `src/app/page.tsx:192-198` |
| L2. Dropdown label change | `src/components/layout/SiteHeader.tsx:89` |
| L3. XSS in local tips | `src/components/plan/FloatPlanCard.tsx:744-747` |
