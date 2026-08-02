# Eddy iOS Copy Improvement Plan

## Objective

Make Eddy's interface copy sound clear, professional, and human while ensuring every product, privacy, freshness, and safety claim matches what the app can actually support.

This work covers user-visible text in `eddy-ios/app`, `eddy-ios/src/components`, `eddy-ios/src/lib`, and `eddy-ios/src/map`. Developer comments and logs are out of scope unless they produce visible text.

## Editorial principles

1. Prefer precise statements over absolute claims.
2. Describe reported data as reported data, not as the river itself.
3. Do not imply instant delivery, complete coverage, guaranteed freshness, or guaranteed safety.
4. Keep safety guidance direct and calm. Avoid marketing language in warnings.
5. Use short sentences instead of em dashes.
6. Use U.S. English throughout the app, including “color” rather than “colour.”
7. Reserve en dashes for numeric ranges. Do not use them as sentence punctuation.
8. Use “latest reported” or a visible timestamp instead of “live,” “now,” or “right now” when data may be delayed.
9. Avoid “everything,” “always,” “never,” “any,” “every,” “the moment,” and similar absolutes unless the behavior is enforced and tested.
10. Explain the user consequence first. Avoid internal terms such as module, registration, build, feed, and entitlement in production-facing copy.

## Phase 1: Correct product and entitlement promises

### 1.1 Rebuild the Premium benefit list

**Files:**

- `eddy-ios/src/components/PaywallSheet.tsx`
- `eddy-ios/src/components/OfflineMapRow.tsx`
- `eddy-ios/src/map/useOfflinePacks.ts`

The current paywall sells alerts as a Premium benefit and later says alerts are free. It also promises offline access points and hazards, while the current download path stores Mapbox tiles only.

Replace the benefit list with features the app currently delivers:

| Current copy | Recommended direction |
| --- | --- |
| Know before you drive | Remove from the Premium list because alerts are free. |
| Every river you follow | Remove unless Premium actually changes the follow limit. |
| Maps that work with no signal | Offline river maps |
| Keep the map, access points and hazards on the water | Download river maps for use with limited or no service. |
| More than the number | Plan with more context |
| Eddy's full read on your rivers and a map that still works when the signal doesn't | Get Eddy's detailed river outlook and download river maps for use with limited service. |

Add a second benefit focused on the paid written outlook:

- **Title:** Detailed river outlooks
- **Body:** Read Eddy's full written outlook for supported rivers.

Do not restore the access-point or hazard promise until those records are persisted, restored after launch, and verified without a network connection.

### 1.2 Replace permanent pricing promises with current-state language

**File:** `eddy-ios/src/components/PaywallSheet.tsx`

Replace:

> River conditions, gauge readings, hazard information and alerts are always free.

With:

> River conditions, gauge readings, hazards, and alerts are available without Premium.

This states the current entitlement boundary without making a permanent business promise.

### 1.3 Remove unsupported update-frequency claims

**File:** `eddy-ios/src/components/EddyTake.tsx`

Replace:

> The full written report on this river, updated daily.

With:

> A detailed written outlook for this river.

Only restore a frequency claim if there is a monitored publishing schedule and a defined stale state in the interface.

## Phase 2: Correct alert descriptions

### 2.1 Rename condition-alert choices

**File:** `eddy-ios/src/lib/alertKinds.ts`

The implementation sends alerts for floatable, high, and dangerous conditions. It does not send alerts when a river becomes low or too low. The labels “Everything” and “Safety” imply broader coverage than the implementation provides.

Use these labels:

| Value | New label | New hint |
| --- | --- | --- |
| `all` | Floatable and high water | Floatable updates plus high-water warnings |
| `floatable` | Floatable | When the river reaches a floatable condition |
| `safety` | High water | High and dangerous conditions |

Keep the underlying values unchanged unless the alert behavior itself is being redesigned.

### 2.2 Describe notification timing honestly

**Files:**

- `eddy-ios/src/components/PushPrimer.tsx`
- `eddy-ios/src/lib/notificationCopy.ts`
- `eddy-ios/src/components/AlertSignInSheet.tsx`
- `eddy-ios/src/components/PaywallSheet.tsx`

Replace “the moment” and other immediate-delivery language with:

> Eddy sends a notification after it detects a reported condition change.

Replace “Only when the condition actually changes” with:

> Sent for detected condition changes, not as a daily digest.

Replace “Only the rivers you follow, on their own schedule” with:

> Notifications are limited to rivers you follow.

### 2.3 Make saved-alert status distinct from delivery status

**Files:**

- `eddy-ios/app/river/[slug].tsx`
- `eddy-ios/app/(tabs)/profile.tsx`

“Alerts are on” can be inaccurate when a rule is saved but notifications are denied, the device is unregistered, or the user is signed out.

Use separate language:

- Saved rule: “River alert saved. Tap to remove it.”
- iOS permission granted and device registered: “Notifications are ready on this device.”
- Permission granted but not registered: “Notifications are allowed. Eddy will retry setup the next time the app opens.”
- Permission denied: “Notifications are off in iOS Settings.”

### 2.4 Remove completeness claims from the Activity feed

**File:** `eddy-ios/app/(tabs)/alerts.tsx`

Replace:

> Condition changes on every river Eddy tracks, from the last 7 days.

With:

> Recent recorded condition changes across Eddy-tracked rivers.

Replace:

> No river has changed condition in the last 7 days. That's usually good news.

With:

> No condition changes were recorded in the last 7 days.

The empty state should not imply that unchanged water is safe.

### 2.5 Correct quiet-hours expectations

**File:** `eddy-ios/app/alerts/quiet-hours.tsx`

Replace the current paragraph with:

> Notifications detected during quiet hours are skipped and are not delivered later. Recorded river changes may still appear in Activity.

Use “your signed-in devices” instead of “every device” when explaining where quiet hours apply.

## Phase 3: Improve privacy, freshness, and safety language

### 3.1 Use Apple's actual privacy choice

**File:** `eddy-ios/src/components/AlertSignInSheet.tsx`

Replace:

> Apple never shares your email unless you choose to.

With:

> Sign in with Apple lets you share your email or use a private relay address.

### 3.2 Standardize the gauge-data caveat

**Files:**

- `eddy-ios/app/(tabs)/profile.tsx`
- `eddy-ios/app/river/[slug].tsx`
- `eddy-ios/app/gauge/[siteId].tsx`
- `eddy-ios/src/components/PushPrimer.tsx`
- `eddy-ios/src/components/PaywallSheet.tsx`

Replace variations of “readings can trail the river by up to about an hour” with one reusable message:

> Gauge readings may be delayed and may not reflect conditions between gauges. Check current conditions before entering the water.

If a measured latency range is important, expose the actual reading time and detection time instead of promising a general maximum.

### 3.3 Replace “live” and “right now” labels

| Location | Current | Replacement |
| --- | --- | --- |
| Map layers | Live USGS readings on the water | Recent USGS gauge readings |
| Map failure notice | Live conditions unavailable | Gauge readings are unavailable |
| Access detail section | River right now | Latest gauge reading |
| Alert configuration card | Right now | Latest reported reading |
| Saved float detail | Re-read against the river right now | Updated with the latest available reading |

### 3.4 Make dam status timestamp-safe

**Files:**

- `eddy-ios/src/components/dam/DamStateCard.tsx`
- `eddy-ios/src/components/dam/RiverDamPanel.tsx`
- `eddy-ios/src/components/dam/GenerationSchedule.tsx`

Replace:

- “Generating now” with “Reported generating”
- “Not generating” with “No generation reported”
- “Releasing” and “releasing now” with “Reported release”
- “reading is lagging” with an actual age when available, or “Delayed reading” otherwise

Replace “check the horn” with:

> Heed warning horns and posted safety notices. Do not wade or anchor below a dam when generation may begin.

### 3.5 Clarify access information

**File:** `eddy-ios/app/river/[slug]/access/[accessSlug].tsx`

Replace:

> Access details are community-maintained and can change with the season. Conditions on the ground win.

With:

> Access, fees, and closures can change. Confirm current information before your trip.

Only retain “community-maintained” if users can actually submit or maintain these records.

## Phase 4: Humanize and simplify the remaining interface copy

### 4.1 Remove em dashes from user-visible prose

Run a focused inventory across `eddy-ios/app` and `eddy-ios/src`, then review each result manually. Do not blindly replace punctuation inside comments, numeric ranges, or accessibility placeholders.

Common transformations:

- Two complete ideas: replace the em dash with a period.
- Explanation: use a colon.
- Short aside: rewrite the sentence or use parentheses sparingly.
- Missing value shown as “—”: use “Unavailable” visually or add an explicit accessibility label.

Examples:

| Current | Replacement |
| --- | --- |
| Live conditions unavailable — rivers are shown uncoloured. | Gauge readings are unavailable. Rivers are shown without condition colors. |
| Everything still works — your stars are kept on this device. | Your favorites remain on this device. Account sync is temporarily unavailable. |
| Alerts are on — tap to turn off | River alert saved. Tap to remove it. |
| Forecast is river stage in feet — this river is rated in cfs. | The forecast uses river stage in feet. This river's condition rating uses cfs. |
| Offline storage is full — remove a river to save another. | Offline storage is full. Remove a river before downloading another. |

### 4.2 Replace internal or mechanical phrasing

| Current | Replacement |
| --- | --- |
| Reading the gauge and driving the shuttle… | Checking conditions and calculating the shuttle route… |
| It shows up here, re-read against the river every time you open it. | Saved floats appear here and refresh with the latest available river reading when opened. |
| The rest of the USGS network | Additional USGS gauges |
| reading only | Readings only. Not Eddy-rated. |
| Everything else still works. | Name the specific features that remain available. |
| River conditions change fast. An outdated app could show you the wrong water. | This version no longer supports current condition data. Update Eddy before using it to plan a trip. |

### 4.3 Standardize terminology

Use these terms consistently:

- “Favorites,” not a mixture of favorites, stars, and followed items in explanatory prose
- “Save” and “Remove,” not “Keep,” “Forget,” and “Unstar” in visible text
- “Gauge reading,” not “the river right now”
- “Condition rating,” not verdict, call, opinion, or grade unless deliberately branded
- “cfs” and “ft” for units, with lowercase display styling
- “Site ID,” not “site id”
- “iOS Settings” when the action opens app settings
- “Apple ID settings” only when referring to subscription management

## Phase 5: Verification

### Automated checks

1. Add a copy-lint script or test that flags user-visible em dashes in `.ts` and `.tsx` files.
2. Flag high-risk words for manual review: `always`, `never`, `every`, `everything`, `any`, `instant`, `moment`, `live`, `right now`, `accurate`, `safe`, and `guarantee`.
3. Exclude developer comments, logs, imports, and legitimate numeric ranges from enforcement.
4. Update existing string assertions and snapshots.
5. Run `make check-mobile` from the repository root.
6. Run `make bundle-mobile` from the repository root.

### Manual review

Review these flows on a physical iPhone in light and dark mode:

1. Premium paywall before and after sign-in
2. River alert setup, including all three alert kinds
3. Notification permission denied, allowed, and registration-pending states
4. Quiet hours
5. Empty and populated Activity feed
6. Stale gauge and stale dam readings
7. Offline map download, airplane-mode relaunch, and removal
8. Saved float refresh and failure states
9. Access-point details
10. Forced-upgrade screen

Check for truncation at the largest Dynamic Type setting and confirm that VoiceOver labels do not preserve removed claims.

## Acceptance criteria

- The Premium screen lists only currently paid, currently implemented features.
- Alerts are not presented as both free and paid.
- Offline copy does not promise access points or hazards until they work after an offline relaunch.
- Alert labels match the condition codes that can trigger them.
- No visible copy promises instant delivery, complete coverage, or guaranteed freshness.
- Stale readings are never described as happening “now.”
- Safety copy distinguishes a gauge measurement from conditions across the river.
- Privacy copy matches Sign in with Apple behavior.
- User-visible prose contains no em dashes.
- U.S. English spelling and terminology are consistent.
- Mobile checks and the production bundle complete successfully.

## Suggested implementation order

1. Paywall and Premium entitlements
2. Alert-kind labels and alert delivery language
3. Gauge and dam freshness language
4. Privacy and safety disclaimers
5. Activity and quiet-hours claims
6. App-wide em-dash and tone pass
7. Accessibility and Dynamic Type review
8. Automated copy guardrails and final validation
