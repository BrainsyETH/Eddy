# Eddy iOS Copy Improvement Plan

## Review baseline

This plan was reviewed against `origin/main` at commit `0302df0a` on August 2, 2026.

The local feature checkout used for the first audit was substantially behind `main`. Current `main` has since:

- centralized Premium messaging in `eddy-ios/src/lib/premiumCopy.ts`;
- removed paid offline map downloads;
- added automatic offline caching for river lines, put-ins, hazards, and the last reported reading;
- redesigned the Alerts tab around high-water conditions and official agency notices;
- added storage, onboarding, feedback, and photo-submission surfaces.

This document supersedes the earlier audit. It does not recommend restoring removed offline-map behavior or rewriting the paywall around alerts, since current `main` already treats alerts as free and no longer sells offline map downloads.

## Objective

Make Eddy's interface copy clear, professional, and human while ensuring every product, privacy, freshness, moderation, and safety statement matches current behavior.

The implementation pass should cover user-visible text in:

- `eddy-ios/app`
- `eddy-ios/src/components`
- `eddy-ios/src/lib`
- `eddy-ios/src/map`
- shared packages that export copy consumed by the iOS app

Developer comments and logs are out of scope unless they produce visible text.

## Editorial principles

1. Describe a measurement as a measurement, not as the river itself.
2. Prefer “latest reported” and a visible timestamp over “live,” “now,” or “right now.”
3. Do not imply instant delivery, complete coverage, guaranteed freshness, guaranteed moderation response, or guaranteed safety.
4. Avoid absolutes such as “always,” “never,” “every,” “everything,” “any,” and “the moment” unless the behavior is enforced and tested.
5. Keep safety guidance direct and calm. Avoid promotional language in warnings.
6. Use short sentences instead of em dashes.
7. Reserve en dashes for ranges such as `20–75 minutes`.
8. Use U.S. English throughout the product, including “color” rather than “colour.”
9. State what remains available instead of saying “everything else still works.”
10. Use internal terms such as feed, module, build, registration, and entitlement only on development-only screens.

## Priority 1: Correct claims that affect decisions

### 1.1 Rename condition-alert choices

**File:** `eddy-ios/src/lib/alertKinds.ts`

The alert engine sends floatable, high, and dangerous events. It does not notify when a river becomes low or too low. The labels “Everything” and “Safety” imply broader coverage than the implementation provides.

| Value | Current | Recommended label | Recommended hint |
| --- | --- | --- | --- |
| `all` | Everything | Floatable and high water | Floatable updates plus high-water warnings |
| `floatable` | Floatable | Floatable | When the river reaches a floatable condition |
| `safety` | Safety | High water | High and dangerous conditions |

Keep the stored values unchanged unless alert behavior is also being redesigned.

### 1.2 Replace current-state claims with reported-state language

**Files:**

- `eddy-ios/src/components/dam/DamStateCard.tsx`
- `eddy-ios/src/components/dam/DayBars.tsx`
- `eddy-ios/src/components/dam/RiverDamPanel.tsx`
- `eddy-ios/app/(tabs)/alerts.tsx`
- `eddy-ios/app/river/[slug]/access/[accessSlug].tsx`
- `eddy-ios/app/alerts/configure.tsx`
- `eddy-ios/src/map/layers.ts`

Current readings may be delayed or replayed from the offline cache. Copy should not present them as a direct observation of the water at this moment.

| Current | Recommended direction |
| --- | --- |
| Generating now | Reported generating |
| Not generating | No generation reported |
| Water off now | No generation reported for this hour |
| Releasing / releasing now | Reported release |
| River right now | Latest gauge reading |
| Right now | Latest reported reading |
| Live USGS readings on the water | Recent USGS gauge readings |
| Live conditions unavailable | Gauge readings are unavailable |

Always display the reading or retrieval age when available. A stale dam reading should never retain a “now” label.

### 1.3 Standardize latency and safety caveats

**Files:**

- `eddy-ios/app/(tabs)/alerts.tsx`
- `eddy-ios/app/(tabs)/profile.tsx`
- `eddy-ios/app/river/[slug].tsx`
- `eddy-ios/app/gauge/[siteId].tsx`
- `eddy-ios/src/components/PushPrimer.tsx`
- `eddy-ios/src/lib/safetyCopy.ts`

Current screens use several conflicting descriptions:

- “up to about an hour”;
- “roughly 20–75 minutes”;
- “can trail the river”;
- “conditions are estimated.”

Choose one evidence-backed latency statement. If the `20–75 minute` range is operationally measured and monitored, use it consistently. Otherwise avoid a maximum and use:

> Gauge readings and alerts may be delayed. Conditions can differ between gauges. Check current conditions before entering the water.

Do not use “trail the river,” which is vivid but imprecise.

### 1.4 Remove reassurance from high-water empty states

**File:** `eddy-ios/app/(tabs)/alerts.tsx`

Replace:

> No river, gauge or dam release Eddy grades is above its high-water mark right now. That's usually good news.

With:

> No high-water conditions appear in the latest available readings.

The absence of a high-water row does not establish that the water is safe, current, or complete.

### 1.5 Correct the Sign in with Apple privacy statement

**File:** `eddy-ios/src/components/AlertSignInSheet.tsx`

Replace:

> Apple never shares your email unless you choose to.

With:

> Sign in with Apple lets you share your email or use a private relay address.

This follows Apple's actual choice without making an absolute privacy promise on Apple's behalf.

### 1.6 Remove broad field-research claims

**File:** `eddy-ios/app/(tabs)/reports.tsx`

Current copy says:

> Every river here is researched by hand. Put-ins walked, hazards logged, gauges rated.

Keep this only if every supported river and put-in has actually received that field process and the claim is documented. A safer replacement is:

> Eddy combines reviewed access information, documented hazards, and river-specific gauge ratings. Coverage continues to grow.

Do not imply that every put-in has been physically visited unless that coverage is tracked.

## Priority 2: Make Premium copy precise

### 2.1 Preserve the corrected entitlement boundary

**Files:**

- `eddy-ios/src/lib/premiumCopy.ts`
- `eddy-ios/src/components/PaywallSheet.tsx`
- `eddy-ios/src/components/EddyTake.tsx`

Current `main` correctly sells only Eddy's written interpretation. Alerts, readings, trends, hazards, forecasts, float plans, and automatic offline river data remain outside the gate. Preserve this architecture.

Do not reintroduce alerts or offline maps as Premium benefits.

### 2.2 Remove em dashes and deterministic forecast language

The current Premium benefits contain several em dashes and phrases such as “what the weather is about to do to it” and “one call on whether it holds.” These sound confident beyond what a forecast supports.

Recommended direction:

| Current | Recommended |
| --- | --- |
| Eddy's take on every river | Eddy's detailed river outlook |
| What the water is doing, what the weather is about to do to it, and Eddy's bottom line | A written interpretation of the latest reading, river trend, and weather forecast |
| What the forecast means for the water | River and weather context together |
| One call on whether it holds | Practical context for planning your trip |

### 2.3 Verify “rewritten every morning” before retaining it

**Files:**

- `eddy-ios/src/lib/premiumCopy.ts`
- `eddy-ios/src/components/EddyTake.tsx`

“Rewritten every morning” appears repeatedly and is a subscription promise. Keep it only if:

1. a scheduled generation job covers every supported river;
2. failures are monitored;
3. the app can identify and withhold a missed or stale report;
4. the time zone behind “morning” is defined.

If those conditions are not met, use:

> A detailed written outlook based on the latest available river and weather data.

### 2.4 Replace the permanent “always free” pledge

**File:** `eddy-ios/src/lib/premiumCopy.ts`

Replace:

> River conditions, gauge readings, the trend, hazard information, alerts and float plans are always free.

With:

> River conditions, gauge readings, trends, hazards, alerts, and float plans are available without Premium.

This communicates the current entitlement boundary without making a permanent pricing commitment.

## Priority 3: Correct coverage and offline wording

### 3.1 Update the offline section for current architecture

**Files:**

- `eddy-ios/app/storage.tsx`
- `eddy-ios/app/(tabs)/profile.tsx`
- `eddy-ios/src/lib/offline-cache.ts`
- `eddy-ios/src/lib/riverCache.ts`

Current `main` automatically caches river lines, put-ins, hazards, and the last reading. Map backgrounds still require a connection. This is materially different from the removed paid map-download feature.

Retain the new automatic-cache model, but avoid “everything else” and “every river” claims when a cache write, initial download, or individual payload can fail.

Replace:

> Map backgrounds need a connection to draw. Everything else on a river works without one.

With:

> Map backgrounds require a connection. Previously loaded river lines, put-ins, hazards, and recent readings remain available offline.

Replace:

> Eddy keeps every river's put-ins, hazards, line and last reading here.

With:

> Eddy stores recently loaded river lines, put-ins, hazards, and readings on this phone for offline use.

Confirm that “previously loaded” matches the bundle-prefetch behavior before finalizing the exact wording.

### 3.2 Avoid complete-network claims

**Files:**

- `eddy-ios/src/map/layers.ts`
- `eddy-ios/app/alerts/new.tsx`
- `eddy-ios/src/components/GaugeFilterBar.tsx`

Replace:

- “The rest of the USGS network” with “Additional USGS gauges”
- “reading only” with “Readings only. Not Eddy-rated.”
- “Search for any river or USGS gauge” with “Search rivers and supported USGS gauges, including gauges outside Missouri.”
- “Zoom in to see them all” with “Zoom in to load a smaller area.”

These surfaces use viewport limits, supported providers, and bounded results. Their copy should describe what is shown rather than imply complete national coverage.

### 3.3 Make unavailable-state copy specific

**Files:**

- `eddy-ios/app/(tabs)/profile.tsx`
- `eddy-ios/app/(tabs)/index.tsx`
- `eddy-ios/src/components/GaugeChart.tsx`
- `eddy-ios/src/components/PhotoSubmitSheetLazy.tsx`

Replace “Everything still works” and “Everything else is up to date” with the actual unaffected features.

Example:

> Your favorites remain on this device. Account sync and subscriptions are temporarily unavailable.

For a chart failure:

> The current reading is still available, but this chart requires a newer version of Eddy.

## Priority 4: Clarify alert and moderation expectations

### 4.1 Describe notification delivery without immediacy

**Files:**

- `eddy-ios/src/components/PushPrimer.tsx`
- `eddy-ios/src/lib/notificationCopy.ts`
- `eddy-ios/src/components/AlertSignInSheet.tsx`

Replace “the moment” and “only when the condition actually changes” with:

> Eddy sends a notification after it detects a reported condition change.

> Sent for detected condition changes, not as a daily digest.

Replace “Only the rivers you follow, on their own schedule” with:

> Notifications are limited to rivers you follow.

### 4.2 Distinguish a saved rule from device delivery readiness

**Files:**

- `eddy-ios/app/river/[slug].tsx`
- `eddy-ios/app/(tabs)/profile.tsx`
- `eddy-ios/src/lib/notificationCopy.ts`

“Alerts are on” can be inaccurate when a rule is saved but iOS notifications are denied or device registration has failed.

Use:

- “River alert saved. Tap to remove it.” for the saved rule;
- “Notifications are ready on this device.” only after permission and registration succeed;
- “Notifications are allowed. Eddy will retry setup the next time the app opens.” while registration is pending;
- “Notifications are off in iOS Settings.” when denied.

### 4.3 Correct quiet-hours expectations

**Files:**

- `eddy-ios/app/alerts/quiet-hours.tsx`
- `eddy-ios/src/components/QuietHoursRow.tsx`

Replace:

> You will still see every change in the Alerts feed.

With:

> Recorded river changes may still appear in Alerts.

Use “your signed-in devices” instead of “every device.”

### 4.4 Avoid unverified service-response promises

**Files:**

- `eddy-ios/src/components/FeedbackSheet.tsx`
- `eddy-ios/src/components/PhotoSubmitSheet.tsx`

Current copy promises that a person reads every report, checks every photo, and may reply. Confirm the operational workflow before keeping those commitments.

Safer wording:

- “Reports are reviewed.”
- “Photos are reviewed before publication.”
- Remove “We'll reply if we need more” unless a reply channel and response process are reliable.

## Priority 5: App-wide punctuation and tone pass

### 5.1 Remove user-visible em dashes

Current `main` contains more than 50 user-visible em-dash constructions across Premium, alerts, profile, storage, map, gauge, dam, access, and photo-submission copy.

Review each occurrence manually. Do not blindly change:

- developer comments;
- legitimate en-dash ranges;
- data-derived prose from an external agency;
- placeholder glyphs without first checking accessibility behavior.

Common transformations:

- Two complete ideas: use a period.
- An explanation: use a colon.
- A short interruption: rewrite the sentence.
- A missing value shown as `—`: use “Unavailable” visually or provide a clear accessibility label.

Examples:

| Current | Recommended |
| --- | --- |
| Live conditions unavailable — rivers are shown uncoloured. | Gauge readings are unavailable. Rivers are shown without condition colors. |
| Everything still works — your favorites are kept on this device. | Your favorites remain on this device. Account sync is temporarily unavailable. |
| Alerts are on — tap to turn off | River alert saved. Tap to remove it. |
| Forecast is river stage in feet — this river is rated in cfs. | The forecast uses river stage in feet. This river's condition rating uses cfs. |
| Conditions unavailable — pull to refresh | Conditions are unavailable. Pull to refresh. |

### 5.2 Replace mechanical phrasing

| Current | Recommended |
| --- | --- |
| Reading the gauge and driving the shuttle… | Checking conditions and calculating the shuttle route… |
| Re-read against the river right now | Updated with the latest available gauge reading |
| It shows up here, re-read against the river every time you open it. | Saved floats appear here and refresh with the latest available reading when opened. |
| Conditions on the ground win. | Confirm access, fees, and closures before your trip. |
| An outdated app could show you the wrong water. | This version no longer supports current condition data. Update Eddy before planning a trip. |

### 5.3 Standardize terminology

Use these terms consistently:

- “Favorites” in explanatory text; reserve “star” for the icon or direct action
- “Save” and “Remove,” not “Keep,” “Forget,” and “Unstar” in visible text
- “Gauge reading,” not “the river right now”
- “Condition rating,” not verdict, call, opinion, or grade unless the brand voice deliberately requires it
- `cfs` and `ft` for units
- “Site ID,” not “site id”
- “iOS Settings” for app notification permission
- “Apple ID settings” only for subscription management

## Verification

### Automated checks

1. Add a copy-lint test that flags em dashes in user-visible string and JSX nodes.
2. Flag high-risk words for manual review: `always`, `never`, `every`, `everything`, `any`, `instant`, `moment`, `live`, `right now`, `accurate`, `safe`, and `guarantee`.
3. Exclude developer comments, logs, imports, external agency text, and legitimate numeric ranges.
4. Update existing copy assertions in the web test suite, which also covers iOS pure logic.
5. Run `make check-mobile`.
6. Run `make check-web` when shared copy or cross-app tests change.
7. Run `make bundle-mobile`.

### Manual review

Review these flows on a physical iPhone in light and dark mode:

1. Premium paywall and locked Eddy's Take
2. River and gauge alert creation, including all condition kinds
3. Notification permission denied, allowed, and registration-pending states
4. Quiet hours
5. High-water and official-agency Alerts tabs
6. Fresh, stale, expired, cached, and unavailable readings
7. Dam generation and release states with old data
8. Airplane-mode launch after a successful cache refresh
9. Storage details and clearing saved river data
10. Saved float refresh and failure states
11. Access-point details
12. Feedback and photo submission
13. Forced-update and native-feature fallback screens

Check truncation at the largest Dynamic Type setting. Confirm that VoiceOver labels do not preserve removed claims.

## Acceptance criteria

- Alert-kind labels match the condition codes that can trigger them.
- No reading or dam status is described as happening “now” unless freshness is enforced at render time.
- Premium copy names only the written interpretation that is actually gated.
- Premium copy does not guarantee a daily rewrite without monitored delivery and stale-content handling.
- Offline copy reflects automatic cached river data and does not imply offline map backgrounds.
- Copy does not claim complete USGS, river, hazard, or field-research coverage without evidence.
- Privacy copy matches Sign in with Apple behavior.
- Moderation copy does not promise a human response that operations cannot guarantee.
- Safety copy distinguishes a gauge measurement from conditions across the river.
- User-visible prose contains no em dashes.
- U.S. English spelling and terminology are consistent.
- Mobile, shared, and production-bundle checks pass.

## Suggested implementation order

1. Alert-kind labels and high-water empty states
2. Gauge and dam freshness language
3. Sign in with Apple privacy wording
4. Premium forecast and update-frequency claims
5. Coverage, offline-cache, and field-research claims
6. Notification, quiet-hours, and moderation expectations
7. App-wide em-dash and tone pass
8. Accessibility and Dynamic Type review
9. Automated copy guardrails and final validation
