# Eddy iOS Copy Improvement Plan

## Review baseline

This plan was re-verified against `origin/main` at commit `6fdfb19` on August 3,
2026. The previous revision cited `0302df0a`, which is now nine commits behind;
the intervening work includes `80e3bef` "Migrate off decommissioned USGS
WaterServices", which touches the USGS-facing surfaces described in section 3.2.

Every string quoted below as **Current** was located in the source at the
`file:line` given. Quotes are verbatim, including punctuation, so each one can be
found with a literal search. Where JSX wraps a sentence across lines, the line
number is the first line of the sentence.

The local feature checkout used for the first audit was substantially behind
`main`. Current `main` has since:

- centralized Premium messaging in `eddy-ios/src/lib/premiumCopy.ts`;
- removed paid offline map downloads;
- added automatic offline caching for river lines, put-ins, hazards, and the last reported reading;
- redesigned the Alerts tab around high-water conditions and official agency notices;
- added storage, onboarding, feedback, and photo-submission surfaces.

This document supersedes the earlier audit. It does not recommend restoring
removed offline-map behavior or rewriting the paywall around alerts, since
current `main` already treats alerts as free and no longer sells offline map
downloads.

### What this plan is not

Several surfaces already solve the problem an audit would raise, deliberately and
with the reasoning recorded in the source. This plan does not re-propose them,
and an implementer should read the module header before changing any of these:

| Module | Already handled |
| --- | --- |
| `src/lib/alertKinds.ts` | Derives notified conditions from the server's own `event-kind.ts` / `fanout.ts` sets, and explains why `all` lists four conditions and not six. |
| `src/lib/notificationCopy.ts` | Encodes a precedence order over permission, sign-in, opt-out, and registration state, with a distinct sentence per state. |
| `src/lib/premiumCopy.ts` | Names only the one gated capability; `premium-copy.test.ts` fails the build if a free capability reappears. |
| `src/components/dam/*` | Already refuses "releasing now" for day-behind data; see the `DamStateCard.tsx` and `RiverDamPanel.tsx` headers. |

## Objective

Make Eddy's interface copy clear, professional, and human while ensuring every
product, privacy, freshness, moderation, and safety statement matches current
behavior.

The implementation pass should cover user-visible text in:

- `eddy-ios/app`
- `eddy-ios/src/components`
- `eddy-ios/src/lib`
- `eddy-ios/src/map`
- shared packages that export copy consumed by the iOS app

Developer comments and logs are out of scope unless they produce visible text.

## Editorial principles

1. Describe a measurement as a measurement, not as the river itself.
2. Prefer "latest reported" and a visible timestamp over "live," "now," or "right now."
3. Do not imply instant delivery, complete coverage, guaranteed freshness, guaranteed moderation response, or guaranteed safety.
4. Avoid absolutes such as "always," "never," "every," "everything," and "any" unless the behavior is enforced and tested.
5. Keep safety guidance direct and calm. Avoid promotional language in warnings.
6. Reserve en dashes for ranges such as `20–75 minutes`.
7. State what remains available instead of saying "everything else still works."
8. Use internal terms such as feed, module, build, registration, and entitlement only on development-only screens.

Punctuation style, specifically the use of em dashes in user-visible prose, is
**not** settled here. See `docs/eddy-ios-copy-em-dash-proposal.md`, which is
decision-pending and deliberately excluded from this plan's scope and acceptance
criteria so that the accuracy work below can ship independently.

## Priority 1: Correct claims that affect decisions

### 1.1 Reconsider the two condition-alert labels

**File:** `eddy-ios/src/lib/alertKinds.ts:62-66`

Read the module header before changing anything here. The mapping is derived from
the server's `event-kind.ts` and `fanout.ts` sets, and the header explains why
`all` covers four condition codes rather than six: a river dropping to Low or Too
low is a `recovery` or `info` event, recorded for the free feed and never pushed.

The **hints are already accurate** and already scope each option:

| Value | Current label | Current hint |
| --- | --- | --- |
| `safety` | Safety | Only high and dangerous water |
| `floatable` | Floatable | Only when it comes up to floatable |
| `all` | Everything | Floatable news and safety warnings |

So the only open question is the two **labels**. "Everything" is the weaker of
the two: it reads as all six condition codes when it means four.

| Value | Current label | Candidate label |
| --- | --- | --- |
| `all` | Everything | Floatable and high water |
| `safety` | Safety | High water |

Constraints on this change, none of which the labels may break:

- Keep the stored `AlertSubscriptionKind` values (`all`, `floatable`, `safety`)
  unchanged. They are persisted and routed server-side by `subscriptionKindsFor()`.
- Renaming the `safety` **label** to "High water" puts the visible label out of
  step with the stored value and the server-side vocabulary. That is tolerable
  but should be a deliberate choice, not a side effect.
- `app/alerts/configure.tsx:552` refers to the phrase "only high and dangerous
  water" in a comment explaining the option colors. Update it if the hint moves.

Lowest-risk option: change only the `all` label and leave `safety` alone.

### 1.2 Replace current-state claims with reported-state language

Current readings may be delayed or replayed from the offline cache. Copy should
not present them as a direct observation of the water at this moment.

| Current | Location | Recommended direction |
| --- | --- | --- |
| `Generating now` / `Not generating` | `src/components/dam/DamStateCard.tsx:98` | Reported generating / No generation reported |
| `Generating now` / `Water off now` | `src/components/dam/DayBars.tsx:165` | Reported generating / No generation reported for this hour |
| `releasing now` | `src/components/dam/RiverDamPanel.tsx:76` | Reported release |
| `River right now` | `app/river/[slug]/access/[accessSlug].tsx:527` | Latest gauge reading |
| `Right now` | `app/alerts/configure.tsx:460` | Latest reported reading |
| `Live USGS readings on the water` | `src/map/layers.ts:216` | Recent USGS gauge readings |
| `Live conditions unavailable — rivers are shown uncoloured.` | `app/(tabs)/index.tsx:1340` | Gauge readings are unavailable. Rivers are shown without condition colors. |

Always display the reading or retrieval age when available. A stale dam reading
should never retain a "now" label.

**Two exclusions, both of which a blind find-and-replace would get wrong:**

1. **`'Generating now'` is a load-bearing literal, not only a label.**
   `dam/DayBars.tsx:165` *produces* the string from `nowSentence()`, and
   `dam/GenerationSchedule.tsx:64` *compares against it*:

   ```ts
   { color: now === 'Generating now' ? colors.accent : colors.textSubtle }
   ```

   Renaming it in `DayBars.tsx` alone silently drops the accent color in
   `GenerationSchedule.tsx` with no type error. Change both, or route the
   comparison through a discriminator rather than the display string.

2. **`app/(tabs)/reports.tsx:248` is a filter chip**, not a reading:
   `{ key: 'generating', label: 'Generating now' }`. A chip labelled "Reported
   generating" reads wrong in a filter row. Leave it, or shorten it to
   "Generating". Note `reports.tsx:240` already documents why this label is a
   fact about machinery rather than a river condition.

### 1.3 Standardize latency and safety caveats

Three surfaces currently give three different latency figures:

| Current | Location |
| --- | --- |
| `Gauge readings can trail the river by up to about an hour.` | `app/(tabs)/alerts.tsx:735` |
| `Readings come from USGS gauges and can trail the river by up to about an hour.` | `app/(tabs)/profile.tsx:465` |
| `Gauge reporting and processing mean alerts can trail the river by roughly 20–75 minutes.` | `src/components/PushPrimer.tsx:83` |
| `Conditions are estimated. Always check with local authorities before getting on the water.` | `src/lib/safetyCopy.ts:2` |

The `20–75` figure is not arbitrary — the comment above it at
`PushPrimer.tsx:80-81` derives it from USGS reporting lag plus cron cadence, and
records that "instant" is a claim we cannot keep. Confirm that derivation still
holds after the WaterServices migration (`80e3bef`), then use one figure
everywhere. If it no longer holds, drop the maximum and use:

> Gauge readings and alerts may be delayed. Conditions can differ between gauges. Check current conditions before entering the water.

"Trail the river" is vivid but imprecise, and it now appears in three places with
two different numbers attached. Replace the phrase along with the figure.

### 1.4 Remove reassurance from high-water empty states

**File:** `eddy-ios/app/(tabs)/alerts.tsx:725` (heading at `:723`)

Replace:

> No river, gauge or dam release Eddy grades is above its high-water mark right now. That's usually good news.

With:

> No high-water conditions appear in the latest available readings.

The absence of a high-water row does not establish that the water is safe,
current, or complete. The heading above it, "Nothing running high", is accurate
and can stay.

### 1.5 Correct the Sign in with Apple privacy statement

**File:** `eddy-ios/src/components/AlertSignInSheet.tsx:88`

Replace:

> Apple never shares your email unless you choose to.

With:

> Sign in with Apple lets you share your email or use a private relay address.

This states Apple's actual choice without making an absolute privacy promise on
Apple's behalf.

### 1.6 Remove broad field-research claims

**File:** `eddy-ios/app/(tabs)/reports.tsx:1283`

Current copy:

> Every river here is researched by hand — put-ins walked, hazards logged, gauges rated. New ones go out regularly. Missing yours?

Keep this only if every supported river and put-in has actually received that
field process and the claim is documented. A safer replacement, preserving the
river-request prompt that follows it:

> Eddy combines reviewed access information, documented hazards, and river-specific gauge ratings. Coverage continues to grow. Missing yours?

Do not imply that every put-in has been physically visited unless that coverage
is tracked.

## Priority 2: Make Premium copy precise

### 2.1 Preserve the corrected entitlement boundary

**Files:**

- `eddy-ios/src/lib/premiumCopy.ts`
- `eddy-ios/src/components/PaywallSheet.tsx`
- `eddy-ios/src/components/EddyTake.tsx`

Current `main` correctly sells only Eddy's written interpretation. Alerts,
readings, trends, hazards, forecasts, float plans, and automatic offline river
data remain outside the gate. Preserve this architecture.

This is enforced, not merely intended:
`missouri-float-planner/src/lib/premium-copy.test.ts` imports `premiumCopy.ts`
directly and asserts the benefit list never matches `/\balerts?\b/`,
`/\boffline\b/`, `/\bhazard/`, `/\bgauge readings?\b/`, `/72[- ]hour/`, or
`/\bfloat plan/`. Any rewrite below must keep that test green.

Do not reintroduce alerts or offline maps as Premium benefits.

### 2.2 Soften deterministic forecast language

| Current | Location | Recommended |
| --- | --- | --- |
| `Eddy's take on every river` | `premiumCopy.ts:63` | Eddy's detailed river outlook |
| `what the weather is about to do to it, and Eddy's bottom line` | `premiumCopy.ts:64` | a written interpretation of the latest reading, river trend, and weather forecast |
| `What the forecast means for the water` | `premiumCopy.ts:68` | River and weather context together |
| `one call on whether it holds` | `premiumCopy.ts:69` | practical context for planning your trip |

"About to do to it" and "one call on whether it holds" both assert more certainty
than a forecast supports. Note that `PREMIUM_FORECAST_CAVEAT`
(`premiumCopy.ts:127`) already hedges on the same screen, and
`purchase-copy.test.ts` asserts it reaches the paywall — so the fix is to stop
overclaiming in the benefit, not to add another disclaimer.

Whether to also remove the em dashes in these strings is deferred to
`docs/eddy-ios-copy-em-dash-proposal.md`. The wording changes above stand on
their own either way.

### 2.3 "Rewritten every morning" is supported — keep it

This section previously asked for verification before retaining the claim. That
verification is now done, and the claim holds. The strings at
`premiumCopy.ts:64`, `premiumCopy.ts:108-109`, and `EddyTake.tsx:315` can stay.

| Condition | Status |
| --- | --- |
| A scheduled job covers every supported river | **Met.** `/api/cron/generate-eddy-updates`, scheduled `10 11 * * *` in `missouri-float-planner/vercel.json`, selects `rivers` where `active = true`. |
| The time zone behind "morning" is defined | **Met.** The route header documents "once daily at 6:10 AM Central (11:10 UTC)", offset ten minutes after the hourly gauge sync so reports use the freshest readings. |
| The app can identify and withhold a stale report | **Met.** `UPDATE_TTL_HOURS = 25` in the cron route, and `api/rivers/[slug]/outlook/route.ts:144` documents `fullRead: string \| null` as "null when the live river has moved far enough that the prose would" mislead. The staleness guard is described at `route.ts:47-50`. |
| Failures are monitored | **Not established.** The cron logs via `console.error` on missing config and per-river rejection, but no alerting path was found. |

**Remaining action:** confirm there is an alert on repeated
`generate-eddy-updates` failure, or add one. Do not weaken the copy — the daily
cadence, the coverage, the timezone, and the stale-content handling are all real,
and replacing an accurate specific claim with a vaguer one would make the paywall
less honest, not more.

### 2.4 Replace the permanent "always free" pledge

**File:** `eddy-ios/src/lib/premiumCopy.ts:118-119` (`PREMIUM_FREE_NOTE`)

Current, in full:

> River conditions, gauge readings, the trend, hazard information, alerts and float plans are always free — and the last ones you saw stay on your phone when the signal goes.

Recommended:

> River conditions, gauge readings, trends, hazards, alerts, and float plans are available without Premium. The last ones you saw stay on your phone when the signal goes.

"Always free" is a permanent pricing commitment made on a purchase screen.
**Keep the second clause** — it describes the automatic offline cache accurately
and is the only place the paywall mentions it.

## Priority 3: Correct coverage and offline wording

### 3.1 Update the offline section for current architecture

Current `main` automatically caches river lines, put-ins, hazards, and the last
reading. Map backgrounds still require a connection. This is materially different
from the removed paid map-download feature; retain the automatic-cache model and
correct only the absolutes.

**File:** `eddy-ios/app/storage.tsx:142`

Current, in full:

> Map backgrounds need a connection to draw. Everything else on a river — put-ins, hazards, the line and the last reading — works without one.

The enumeration is already there. The only inaccuracy is "Everything else",
which cannot be guaranteed when a cache write or an individual payload can fail:

> Map backgrounds need a connection to draw. Previously loaded put-ins, hazards, the line and the last reading work without one.

**File:** `eddy-ios/app/storage.tsx:96`

> Eddy keeps every river's put-ins, hazards, line and last reading here, refreshed …

**File:** `eddy-ios/app/(tabs)/profile.tsx:481` — a second, shorter variant that
omits "line" and must be updated in step:

> Eddy keeps every river's put-ins, hazards and last reading here so they …

Both should drop "every river's":

> Eddy stores recently loaded river lines, put-ins, hazards, and readings on this phone for offline use.

Confirm "recently loaded" against the launch-bundle prefetch before finalizing:
`src/hooks/useNetworkPlaces.ts:17` and `src/api/client.ts:616` both state the
launch bundle already seeds every river's put-ins and hazards, which may make
"every river's" defensible for those two payloads specifically. If so, keep the
absolute only where the bundle guarantees it, and drop it for readings.

### 3.2 Avoid complete-network claims

| Current | Location | Recommended |
| --- | --- | --- |
| `The rest of the USGS network — reading only` | `src/map/layers.ts:245` | Additional USGS gauges. Readings only, not Eddy-rated. |
| `{n} gauges here — more than fit. Zoom in to see them all.` | `src/components/GaugeFilterBar.tsx:234` | …more than fit. Zoom in to load a smaller area. |

`app/alerts/new.tsx:187` already reads:

> Search for any river or USGS gauge — including gauges outside Missouri.

The previous revision proposed adding the Missouri clause, which is already
present. The only remaining issue is "any", which overstates coverage:

> Search rivers and supported USGS gauges, including gauges outside Missouri.

These surfaces use viewport limits, supported providers, and bounded results.
Re-check all three against `80e3bef` (the WaterServices migration) before
editing, since the set of reachable gauges may have changed.

### 3.3 Make unavailable-state copy specific

| Current | Location | Recommended |
| --- | --- | --- |
| `Everything still works — your favorites are kept on this device.` | `app/(tabs)/profile.tsx:265` | Your favorites are kept on this device. Account sync and subscriptions are temporarily unavailable. |
| `Charts need a newer version of the app. Everything else on this screen is up to date.` | `src/components/GaugeChart.tsx:754` | Charts need a newer version of Eddy. The current reading on this screen is up to date. |
| `Adding a photo needs a newer version of Eddy. Everything else on this screen is up to …` | `src/components/PhotoSubmitSheetLazy.tsx:89` | Adding a photo needs a newer version of Eddy. The rest of this screen is up to date. |

The previous revision quoted these as "Everything else is up to date", which
appears nowhere; the real string is "Everything else on this screen is up to
date." The narrower claim is nearly defensible, which is why the fix is to name
what is unaffected rather than to delete the sentence.

## Priority 4: Clarify alert and moderation expectations

### 4.1 Describe notification delivery without immediacy

**File:** `eddy-ios/src/lib/notificationCopy.ts:44`

> Get a push the moment a river you follow becomes floatable, or turns dangerous.

"The moment" promises immediacy the pipeline cannot deliver — and
`PushPrimer.tsx:80` already says so in a comment on the adjacent screen.

> Get a push when a river you follow becomes floatable, or turns dangerous.

**File:** `eddy-ios/src/components/PushPrimer.tsx:69`

> Only the rivers you follow, on their own schedule.

"On their own schedule" is not a thing the product does; alerts fire on detected
condition changes.

> Notifications are limited to rivers you follow.

The previous revision also asked to replace "only when the condition actually
changes". **No such string exists** in `eddy-ios/app` or `eddy-ios/src`; the
nearest match is a code comment in `app/river/[slug].tsx`. Dropped.

### 4.2 Distinguish a saved rule from device delivery readiness

**Read `src/lib/notificationCopy.ts` first.** The per-state sentences this
section would otherwise propose already exist there, with a documented precedence
order and test coverage:

| State | Existing copy | Line |
| --- | --- | --- |
| Denied | `Notifications are turned off for Eddy in iOS Settings. Alerts still appear in the Alerts tab.` | `:35` |
| Not signed in | `Sign in to get alerts on this device. The Alerts tab works without an account.` | `:38` |
| Registration pending | `Allowed, but this device has not registered yet. It will retry on the next launch.` | `:47` |
| Ready | `This device will get a push when a river you follow changes condition.` | `:49` |

Leave these alone. The genuine gap is elsewhere:

**File:** `eddy-ios/app/river/[slug].tsx:907`

> Alerts are on — tap to turn off

This is the per-river subscribe button, driven by `subscribed` alone. It reports
delivery state while describing only a saved rule, so it reads "Alerts are on"
even when iOS notifications are denied or registration has failed.

> River alert saved. Tap to remove it.

`app/(tabs)/profile.tsx:400` renders `Alerts are on` / `Alerts are off` from
`receiving`, which does account for permission and registration. That one is
accurate; see the comment at `profile.tsx:379` for why the two differ.

### 4.3 Correct quiet-hours expectations

**File:** `eddy-ios/app/alerts/quiet-hours.tsx:282`

> …be worse than none. You will still see every change in the Alerts feed.

The Alerts feed records what the engine evaluated, which is not every change on
the river:

> Recorded river changes may still appear in Alerts.

**Separately** — this is a settings-sync statement, not a delivery-scope one, and
was previously filed under the same heading as if it were the same problem:

**File:** `eddy-ios/app/alerts/quiet-hours.tsx:150`

> Quiet hours are stored with your account so they apply to every device.

"Every device" is accurate for anything signed in and imprecise otherwise:

> Quiet hours are stored with your account, so they apply to your signed-in devices.

### 4.4 Avoid unverified service-response promises

**File:** `eddy-ios/src/components/FeedbackSheet.tsx:169`

> A person reads every one of these. We'll reply if we need more.

**File:** `eddy-ios/src/components/PhotoSubmitSheet.tsx` — the parallel
photo-review promise.

Confirm the operational workflow before keeping either. If a person does read
every report and a reply channel is reliable, these are fine as written and
should stay: they are unusually direct and worth keeping if true. If not:

- "Reports are reviewed."
- "Photos are reviewed before publication."
- Drop "We'll reply if we need more."

This is the one section whose answer lives outside the codebase.

## Priority 5: Tone and terminology

### 5.1 Replace mechanical phrasing

| Current | Location | Recommended |
| --- | --- | --- |
| `Reading the gauge and driving the shuttle…` | `app/float/[shortCode].tsx:159`, `src/components/PlanSheet.tsx:198` | Checking conditions and calculating the shuttle route… |
| `Conditions on the ground win.` | `app/river/[slug]/access/[accessSlug].tsx:711` | Confirm access, fees, and closures before your trip. |
| `River conditions change fast — an outdated app could show you the wrong water.` | `src/components/UpgradeGate.tsx:35` | This version no longer supports current condition data. Update Eddy before planning a trip. |
| `Forecast is river stage in feet — this river is rated in cfs.` | `src/components/EddyTake.tsx:260` | The forecast uses river stage in feet. This river's condition rating uses cfs. |
| `Conditions unavailable — pull to refresh` | `app/(tabs)/favorites.tsx:343`, `:441` | Conditions are unavailable. Pull to refresh. |

Both `favorites.tsx` occurrences are the same sentence and must change together.
`EddyTake.tsx:261` holds a shorter variant of the forecast line for the matching
case; keep the two consistent.

### 5.2 Standardize terminology

- "Favorites" in explanatory text; reserve "star" for the icon or direct action
- "Save" and "Remove," not "Keep," "Forget," and "Unstar" in visible text
- "Gauge reading," not "the river right now"
- "Condition rating," not verdict, call, opinion, or grade unless the brand voice deliberately requires it
- `cfs` and `ft` for units
- "Site ID," not "site id"
- "iOS Settings" for app notification permission
- "Apple ID settings" only for subscription management

### 5.3 One US-English fix

`uncoloured` at `app/(tabs)/index.tsx:1340` is the only user-visible British
spelling in the app. Every other `colour` / `behaviour` / `favourite` occurrence
is in a developer comment, which is out of scope. Section 1.2 already rewrites
that sentence, so this needs no separate pass.

## Verification

### Automated checks

1. **Reuse the existing copy-test pattern.** `missouri-float-planner/src/lib/`
   already holds six copy suites — `premium-copy`, `safety-copy`, `alert-copy`,
   `purchase-copy`, `reading-copy`, and `notification-copy` — plus
   `camping/availability-copy-parity`, which import iOS copy modules directly
   across the `file:` boundary. `premium-copy.test.ts` is the model: regexes that
   must not match, with the history explaining each one. Add assertions there
   rather than inventing a new lint harness.
2. Add a claim-lint over user-visible strings flagging `always`, `never`,
   `every`, `everything`, `any`, `instant`, `moment`, `live`, and `right now` for
   manual review. Exclude comments, logs, imports, agency-derived text, and
   numeric ranges.
3. Where copy lives in a screen rather than a `*Copy.ts` module, prefer moving it
   into a module over widening the lint — that is what made the Premium copy
   testable in the first place.
4. Run `make check-web` whenever a `*Copy.ts` module changes; those suites run
   there, not in `eddy-ios`.
5. Run `make check-mobile`.
6. Run `make bundle-mobile`.

### Manual review

Review these flows on a physical iPhone in light and dark mode:

1. Premium paywall and locked Eddy's Take
2. River and gauge alert creation, including all condition kinds
3. Notification permission denied, allowed, and registration-pending states
4. Quiet hours
5. High-water and official-agency Alerts tabs
6. Fresh, stale, expired, cached, and unavailable readings
7. Dam generation and release states with old data, including the day-schedule
   accent color driven by `GenerationSchedule.tsx:64`
8. Airplane-mode launch after a successful cache refresh
9. Storage details and clearing saved river data
10. Saved float refresh and failure states
11. Access-point details
12. Feedback and photo submission
13. Forced-update and native-feature fallback screens

Check truncation at the largest Dynamic Type setting. Confirm that VoiceOver
labels do not preserve removed claims.

## Acceptance criteria

- The `all` alert label names the conditions it can actually deliver, and the stored kind values are unchanged.
- No reading or dam status is described as happening "now" unless freshness is enforced at render time.
- `'Generating now'` is either unchanged or changed in both `DayBars.tsx` and `GenerationSchedule.tsx`, with the schedule accent color verified on device.
- One latency figure appears across `alerts.tsx`, `profile.tsx`, and `PushPrimer.tsx`.
- Premium copy names only the written interpretation that is actually gated, and `premium-copy.test.ts` passes.
- The daily-rewrite claim is retained, with failure alerting on `generate-eddy-updates` confirmed or added.
- Offline copy reflects automatic cached river data and does not imply offline map backgrounds.
- Copy does not claim complete USGS, river, hazard, or field-research coverage without evidence.
- Privacy copy matches Sign in with Apple behavior.
- Moderation copy does not promise a human response that operations cannot guarantee.
- Safety copy distinguishes a gauge measurement from conditions across the river.
- Every string this plan quotes as **Current** still resolves to exactly one source location, or the plan is updated.
- Mobile, shared, and production-bundle checks pass.

Punctuation is deliberately absent from this list. See
`docs/eddy-ios-copy-em-dash-proposal.md`.

## Suggested implementation order

1. Sign in with Apple privacy wording (1.5) — smallest, highest-confidence fix
2. High-water empty state (1.4) and the `all` alert label (1.1)
3. Copy-test assertions for everything above, using the `premium-copy.test.ts` pattern
4. Gauge and dam freshness language (1.2), including the `GenerationSchedule` literal coupling
5. Latency consolidation (1.3), after re-checking the `20–75` derivation against `80e3bef`
6. Premium forecast wording (2.2) and the "always free" pledge (2.4)
7. Coverage, offline-cache, and field-research claims (3.x)
8. Notification, quiet-hours, and moderation expectations (4.x)
9. Tone and terminology (5.x)
10. Accessibility and Dynamic Type review
11. `generate-eddy-updates` failure alerting (2.3), which is an ops task rather than a copy one

The em-dash pass is not in this order. It is gated on the decision recorded in
`docs/eddy-ios-copy-em-dash-proposal.md`.
