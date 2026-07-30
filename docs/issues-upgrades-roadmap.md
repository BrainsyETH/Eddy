# Eddy — Issues & Upgrades Roadmap

> **Status: active** (2026-07). A phased plan for a batch of reported issues and
> upgrades across the iOS app and eddy.guide. Nothing here is implemented yet —
> tick items off as they land, and retire the document when Phase 4 closes.
>
> Findings marked "confirmed" were verified against the code and, where noted,
> against the live Supabase project by read-only query on 2026-07-30.

## Context

A backlog collected from real use of the iOS app and eddy.guide. It mixes three
different kinds of work: **legal / App-Store exposure** (no safety disclaimer,
no onboarding agreement, a paywall that shows a raw SDK error), **genuine
defects** (feedback submission has never once worked, notification state goes
stale, photo uploads fail, the location indicator never turns off, radar is
invisible), and **polish** (copy, icons, ordering, defaults).

Four findings from investigation shape the plan:

1. **Feedback has never worked, for anyone, on any client.** `public.feedback`
   has **0 rows ever** — two independent defects, both confirmed against the
   live database (§1.3). Every user report the product has asked for has been
   silently discarded.
2. **Migrations are drifting from production.** `00208_feedback_gauge_recalibration.sql`
   and `00037_feedback_rls.sql` exist in the repo but are **not applied** on the
   live project. Migrations are applied by hand here (see the note at
   `src/app/api/search/route.ts:432-437`) and nothing detects the gap.
3. **The radar root cause is not the URL.** IEM's `nexrad-n0q-900913` service
   has a native max zoom of **9**; above it every tile is a byte-identical blank
   PNG (verified: z10, z11 and z13 tiles hundreds of miles apart all hash to
   `cd37744a985b`). The `RasterSource` sets `minZoomLevel` but no
   `maxZoomLevel`, so at the app's actual zooms (8.5–16) it requests blanks.
   One prop fixes it.
4. **The photo failure is a body-size wall, not a timeout.**
   `uploadCommunityPhoto` never goes through `withDeadline`, so the 15 s client
   timeout is not in play. `/api/upload` advertises a 10 MB limit but Vercel's
   serverless request-body limit is **4.5 MB** — the function never runs, and
   `client.ts:1604` maps the resulting throw to `'No connection'`.

Intended outcome: ship the legal and store blockers, then close the real bugs,
then polish and the two small features — each phase independently shippable.

## Scope decisions (confirmed)

- **Web alerts:** collapse in place. No new route.
- **Sequencing:** blockers → bugs → polish → small features.
- **Removed from the list:** the gauge-classification review (Doniphan / Jacks
  Fork / Black at Poplar Bluff / Clearwater Dam), the photo →
  location-permission → nearest-gauge feature, the Float of the Day live-scroll
  reel, and the broad API/caching/rate-limit audit.
- **Kept from the feature list:** the gauges-tab total-available count.
- Two DEBUGGING items overlap the declined audits and stay as **targeted bug
  fixes**: slow river/gauge load times, and the photo submission failure.

**Testing rule that governs the whole plan:** `make check-web` runs the web
suite, and 14 of its test files import from `eddy-ios/src/lib/*`. Components and
hooks are untestable in this harness. So **any new logic worth testing must live
in `eddy-ios/src/lib/` as a pure module.**

---

## Phase 1 — Legal & store blockers

### 1.1 One standard safety disclaimer, in red

- New `eddy-ios/src/lib/safetyCopy.ts` — exports `SAFETY_DISCLAIMER`:
  *"Conditions are estimated. Always check with local authorities before getting
  on the water."* A pure module so `check-web` can assert the exact wording
  (App-Review sensitive).
- New `eddy-ios/src/components/SafetyDisclaimer.tsx` — renders it in the theme's
  danger colour, with a `compact` variant for sheets.

**Replace** the six bespoke warnings: `app/river/[slug].tsx:1203-1206`,
`app/gauge/[siteId].tsx:657-659`, `app/(tabs)/profile.tsx:400-403`,
`app/(tabs)/alerts.tsx:551-553`, `src/components/PaywallSheet.tsx:248-251`,
`src/components/PushPrimer.tsx:83-85`.

**Add** where there is no disclaimer today and a go/no-go call is being made:
Search (`app/(tabs)/reports.tsx`), Map (`app/(tabs)/index.tsx`), Favorites, and
`src/components/PlanResult.tsx`.

**Two things not to lose:**
- `profile.tsx:400-403` is the **only** place stating the USGS ~1-hour lag. That
  is a distinct factual claim — keep it as a second line beneath the disclaimer.
- Dam safety copy at `src/components/dam/RiverDamPanel.tsx:103-107` and
  `GenerationSchedule.tsx:119-133` ("never wade or anchor below a dam…") is a
  different claim. Keep verbatim.

**Test:** `missouri-float-planner/src/lib/safety-copy.test.ts` importing the new
pure module; assert exact wording, and that "always judge the water in front of
you" no longer appears outside the dam files (mirroring the cross-repo style of
`deep-links-parity.test.ts`).

### 1.2 Onboarding disclaimer + required agreement

There is **no onboarding of any kind** today — no welcome screen, no first-run
flag. This is net-new.

- New `eddy-ios/src/lib/onboarding.ts` — `ONBOARDING_VERSION`,
  `hasAcceptedTerms()` / `acceptTerms()` over AsyncStorage under a **versioned**
  key, so a material copy change can re-gate. Follow `src/lib/chunked-store.ts`.
- New `eddy-ios/src/components/OnboardingGate.tsx` — full-screen blocking,
  structurally modelled on `src/components/UpgradeGate.tsx`, visually on
  `src/components/PushPrimer.tsx`.
- Content: what Eddy is → `SAFETY_DISCLAIMER` (prominent) → Terms + Privacy
  (reuse the URLs at `PaywallSheet.tsx:95-96`) → an explicit "I understand". No
  skip.

**Placement is load-bearing.** Mount it **inside `ThemedShell`'s outer `View`,
wrapping `<Stack>`** — *not* alongside `<UpgradeGate>` at `_layout.tsx:247`.
`completeLaunch()` fires on that `View`'s `onLayout` (`:288-290`), so gating
above it re-creates the blank-splash failure documented at `:200-217`.

**Do not** put a push prompt in the gate — `push.ts:1-12` documents the one-shot
rule and `PushPrimer` owns it.

**Test:** `missouri-float-planner/src/lib/onboarding.test.ts`, using the
AsyncStorage mock pattern from `chunked-store.test.ts`.

### 1.3 Fix the feedback pipeline — two defects and a migration apply

**Defect A — the CHECK constraint is missing a value.** Production's
`feedback_feedback_type_check` allows `inaccurate_data, missing_access_point,
suggestion, bug_report, other, partner` — **not** `gauge_recalibration`.
`00208` was never applied. iOS `FeedbackSheet` lists `gauge_recalibration`
first, and the river and gauge screens open with
`defaultType="gauge_recalibration"`, so those submits violate the constraint and
hit the 500 branch in `src/app/api/feedback/route.ts` — producing the literal
string the user saw, **"Failed to submit feedback."**

**Defect B — RLS blocks the `RETURNING`.** `route.ts:94-107` does
`.insert({...}).select('id').single()` through the **anon** client, but the only
SELECT policy is `feedback_select_policy TO authenticated USING (is_admin())`.
Anon cannot read the row back. This breaks *every* feedback type from every
client — which is why the table has 0 rows rather than merely missing gauge
reports.

**Fix:**
- `route.ts:90` — swap `await createClient()` for `createAdminClient()`, already
  imported at line 7 and already used by the GET handler (`:136-137`). One word.
  Keep every validation above it: the admin client bypasses RLS, so the
  `validTypes` allowlist at `:74-82` becomes the sole guard and must not relax.
- Author `00213_feedback_rls_realign.sql` re-landing the 00037 policies
  idempotently. `00208` is already idempotent (`DROP CONSTRAINT IF EXISTS`).
- **⚠️ User applies both by hand against production.** Nothing here works until
  `00208` lands. Do not write to production from this work.

**Test:** hoist `validTypes` to a shared constant and assert it matches the
migration's CHECK set verbatim — this exact drift is what broke it.

### 1.4 Migration drift guard *(new — not on the original list)*

Two hand-applied migrations were found missing in production during this
investigation, one of which broke a user-facing feature invisibly. Add a check
comparing `supabase/migrations/*.sql` against
`supabase_migrations.schema_migrations` and reporting the gap. Cheap, and the
only thing that would have caught 1.3 before a user did.

### 1.5 RevenueCat: stop showing the raw SDK error

The reported message is a **dashboard / App Store Connect configuration**
problem, not a code bug. `src/lib/purchases.ts` hardcodes no product IDs;
packages come from `getOfferings()` (`:216`).

- **⚠️ User action:** register the products per
  `missouri-float-planner/docs/REVENUECAT_SETUP.md`. No code change fixes this.
- **Code action (ships independently):** make `getOfferings()` return a
  discriminated result (`{status:'ok', packages}` | `{status:'unavailable'}`)
  so the SDK's configuration string can never reach a customer.
  `PaywallSheet.tsx` renders "Premium isn't available right now" plus a working
  **Restore purchases** path, and never an empty/disabled purchase button.
- `react-native-purchases` needs no `app.json` plugin entry — autolinking
  handles it. Nothing to rebuild.
- **Test:** extend `missouri-float-planner/src/lib/purchase-copy.test.ts` with
  the empty-offerings case.

---

## Phase 2 — Real bugs

### 2.1 Notification permission state is stale in both directions

**(a) Enable in iOS Settings, return, Profile still says off.** `usePush.tsx`
re-checks only in the effect at `:161-163` (mount, `signedIn` change). There is
no `AppState` listener anywhere except `src/lib/supabase.ts:54-57`. Add one in
`PushProvider` calling `refresh()` on `'active'`, following that file's
subscribe/remove shape, with a `useRef` guard against the cold-start double-fire.

**(b) "Stop alerts", relaunch, alerts are back on — mechanism confirmed.**
`refresh()` (`usePush.tsx:142`) calls `syncRegistration()` (`push.ts:130`) on
every mount whenever OS permission is `granted` and the user is signed in, and
that unconditionally POSTs the token to `/api/me/device-tokens`. `disable()`
(`usePush.tsx:191`) only unregisters and sets local state — it **persists
nothing**. So the app re-creates the row it deleted last session. (`registered`
is genuinely server-derived; the round-trip is the problem, not the derivation.)

Fix: new `eddy-ios/src/lib/pushOptOut.ts` (`isDeviceOptedOut()` /
`setDeviceOptedOut()` over AsyncStorage). `disable()` sets it, `enable()` clears
it, and `refresh()` checks it **before** calling `syncRegistration` and
short-circuits to `setRegistered(false)`.

**(c) `permission === 'unsupported'` is a dead end** — `profile.tsx:348-382`
renders no button at all. `push.ts:52` returns it on a simulator *and* on any
`getPermissionsAsync()` throw (`:61-63`), which can happen on a real device. Add
an explicit branch with copy and an Open Settings affordance.

**Test:** extend `missouri-float-planner/src/lib/notification-copy.test.ts` for
the `unsupported` and opted-out matrix; add `pushOptOut.test.ts`.

### 2.2 Feedback modal is unreachable / unswipeable

`FeedbackSheet.tsx:150` uses `<Modal transparent animationType="slide">` with
`KeyboardAvoidingView`, `styles.lift` (`:300`) and `maxHeight:'92%'` — the
combination that misplaces the sheet under the keyboard and leaves no swipe
target.

Switch to `presentationStyle="pageSheet"` as `PushPrimer.tsx` already does; that
restores the native grabber and swipe-to-dismiss. Then drop `transparent`, the
backdrop `Pressable` (`:151`), `styles.lift`, `maxHeight`, and the manual
`paddingBottom: insets.bottom + 16` (`:165`) — the native sheet handles all of
it.

**Gotchas:** `pageSheet` requires `transparent={false}`; leaving both is a silent
no-op on iOS. Keep `KeyboardAvoidingView`, but the `ScrollView` at `:194` needs
`keyboardShouldPersistTaps="handled"` or a Submit tap with the keyboard up gets
eaten. Confirm `onRequestClose` still resets state.

**Apply the identical change to `PhotoSubmitSheet.tsx:301`** — same `Modal`
shape, same trap.

### 2.3 Photo submission fails with "No connection"

Not a timeout — `uploadCommunityPhoto` (`client.ts:1583-1611`) bypasses
`withDeadline` entirely. Three real causes:

1. **Body-size wall.** `/api/upload/route.ts:18` allows 10 MB; Vercel's
   serverless request-body limit is 4.5 MB. The function never runs, RN's
   `fetch` throws, and `client.ts:1604` maps every non-abort throw to
   `'No connection'`. Drop `UPLOAD_SAFE_BYTES` (`PhotoSubmitSheet.tsx:105`) from
   4 MB to **3.5 MB** to leave room for multipart overhead, and lower the
   route's `MAX_SIZE` to match so the stated limit is the real one.
2. **Unknown size skips compression.** `asset.fileSize ?? 0` (`:137`) treats
   `undefined` as zero. Treat `undefined` as over-limit instead.
3. **Hardcoded MIME.** `:274-278` always sends `river-photo.jpg` /
   `image/jpeg`; a passed-through PNG or HEIC then fails the route's magic-byte
   check. Return the real format from `prepareUpload` and use it.

Also give the upload its own 60 s deadline via the existing `withDeadline`
override and `BACKGROUND_TIMEOUT_MS` (`:126`), and stop collapsing every failure
into one message: branch cancelled / timed out / offline, and add a `413` branch
→ "That photo is too large."

**Test:** extract the size-and-format decision into `eddy-ios/src/lib/uploadPrep.ts`
(pure) and test under `check-web`.

### 2.4 Location indicator stays on after leaving the app

`RiverMap.tsx:1318` renders `<Mapbox.UserLocation visible />` whenever
`showUserLocation` is true, driven by `index.tsx:951`
(`location.status === 'ready'`) — and `status` stays `'ready'` for the whole
session, including while the Map tab sits behind another tab.
`Mapbox.UserLocation` holds a continuous location subscription the entire time.
There is no `watchPositionAsync` anywhere and background location is already
off, so this is the sole cause.

Fix: `showUserLocation={location.status === 'ready' && isFocused}` via
`useIsFocused`. Unmounting drops the native subscription and the OS indicator
clears. Safe to unmount: the orphaned-layer warnings at `RiverMap.tsx:782,923`
apply to `ShapeSource`, and `UserLocation` owns no child layers — the comment at
`:1392-1394` makes exactly this distinction. Check the map doesn't visibly
re-center when the dot returns on refocus.

### 2.5 Weather radar doesn't show — one prop

Root cause confirmed empirically (see Context §3). Add
`maxZoomLevel={MAX_RADAR_ZOOM}` to the `RasterSource` at
`RiverMap.tsx:1396-1402`, with `export const MAX_RADAR_ZOOM = 9` in
`src/map/layers.ts` beside `MIN_RADAR_ZOOM`, carrying a comment recording the
measurement. Mapbox then upscales the z9 tile at higher zooms — correct for a
national composite where a rain band spans hundreds of miles.

This is the **best first commit** in the batch: one line, confirmed cause,
zero dependencies.

### 2.6 River and gauge screens are too slow *(targeted, not an audit)*

Server cache headers are already correct (`/api/rivers/[slug]` 300/3600,
`/api/gauges/[siteId]` 120/600, `/api/conditions/[riverId]` 300/600). The
problem is **client request shape**.

**River screen** (`app/river/[slug].tsx:254-330`), two concrete costs:
1. The `Promise.all` at `:284` gates the condition — the reason the screen
   exists — on the slowest of four requests, including a **statewide** gauge
   fetch (`client.ts:598`). Replace it with four independent `.then(setX)`
   chains sharing the one controller. Condition paints as soon as
   `/api/conditions/[riverId]` returns. Biggest single win, low risk — each
   branch already has its own error handling.
2. `fetchRivers()` is awaited **serially** first (`:255`) purely to resolve
   `slug → id`. Read `readIndex()` from disk first; on a hit, start the four
   requests immediately and let the network call land alongside. Removes a full
   round-trip from every warm launch.

Preserve the ordering contract documented at `:240-252`, and keep the outer
`catch` as the only path that can set "River not found".

**Gauge screen** (`app/gauge/[siteId].tsx:156`): one request, nothing serial to
unpick. The win is **disk-first paint** — `riverCache.ts` has no gauge
equivalent. Add a small cached read so the name, river and last-known reading
paint immediately.

**⚠️ Caveat:** `riverCache`/`offline-cache` have **no TTL** — entries evict only
on `CACHE_VERSION` bump. A gauge cache must carry its own `fetchedAt` and refuse
to paint a *condition* older than the 6-hour rule the river screen already
applies; reuse `effectiveReadingAgeHours`, already imported in
`app/river/[slug].tsx`. Extend `src/lib/offline-cache.test.ts` for the new shape.

---

## Phase 3 — Polish

### 3.1 Web: collapse the river-page alerts

`src/app/rivers/[state]/[slug]/page.tsx:415-434` renders `#alerts` above
`#status` ("Live report"), pushing the report down.

Use a native `<details>/<summary>` — **not**
`src/components/ui/CollapsibleSection.tsx`, which is `'use client'`.
`RiverAlertsPanel.tsx:10-15` explicitly argues the alerts must stay in the
initial server HTML ("a closure is exactly the thing that should not wait on
hydration", and a crawler should see it). Precedent for `<details>` exists at
`src/app/embed/eddy-quote/[slug]/page.tsx`.

- `<details open={riverAlerts.some(a => a.severity === 'warning')}>` — a flood
  warning should never need a click; `watch` and `notice` collapse.
- Summary carries count and severity (`2 alerts · 1 warning`), styled from the
  existing `STYLES` map (`RiverAlertsPanel.tsx:29-45`) so colour survives
  collapse.
- Keep `id="alerts"` and `scroll-mt-24`; `HubSectionNav`'s `hasAlerts` (`:410`)
  and `SECTIONS` are unchanged, so the scroll-spy keeps working.
- **Gotcha:** a Tailwind-styled `<summary>` needs
  `[&::-webkit-details-marker]:hidden` or Safari draws its own triangle.
- Update the deliberate ordering comment at `:416-419` rather than deleting it —
  the reasoning still holds, the presentation changed.

### 3.2 Remove the dam card from the iOS river screen

`app/river/[slug].tsx:793-806` renders `RiverDamPanel` near the top;
`damForRiver()` matches `dam.tailwater.riverSlug`, so today only the Black River.

**Demote, don't delete.** Replace the panel with a one-line row low on the
screen ("Clearwater Dam controls this reach →" → `/dam/{id}`). The panel carries
generation-release safety copy at `RiverDamPanel.tsx:103-107` that must not
silently vanish, and one line on one river is a cheap way to keep the path.
Keep `fetchDams` in the load path (`:290`) — one cheap CDN-cached request, and
`setDam` still feeds the link. `app/dam/[damId].tsx` stays untouched.

### 3.3 Premium page: alignment, benefits, gratitude line

`PaywallSheet.tsx:82-93` (`BENEFITS`) has only two entries and the legal block
(`:248-266`) is misaligned. Expand to 4–5 concrete entries — **confirm against
what `eddy_premium` actually gates; don't promise what isn't gated** — fix the
icon/text baselines, and swap the bespoke disclaimer at `:248-251` for
`<SafetyDisclaimer />` from 1.1. Leave the auto-renew disclosure and
Terms/Privacy links exactly as they are; both are required and correctly placed.

Gratitude line, for approval:

> Thank you. Eddy is built by one person, and a subscription is what keeps the
> gauges, the maps and the alerts running.

### 3.4 Splash screen uses the polished icon

**⚠️ Blocked on an asset.** `assets/splash-icon.png` is 1024×1024 **RGBA**
(transparent). `assets/icon-polished-light.png` is 1024×1024 **RGB — opaque
white**, so pointing `expo-splash-screen` at it renders a white square on the
dark splash (`backgroundColor: "#1A1814"`, `app.json:47`).

- **Preferred:** export `assets/splash-icon-polished.png` at 1024×1024 RGBA with
  a transparent background, and point both light and `dark` splash entries at
  it. Check `eddy-ios/scripts/build-eddy-icons.py` first — it already does
  background-cutting and may be reusable.
- **Cheap fallback:** use `icon-polished-light.png` and set both
  `backgroundColor`s to `#FFFFFF`, losing the dark-mode splash.

**⚠️ Needs a native rebuild.** Splash config is baked at prebuild — this will not
ship OTA. And `ios.runtimeVersion.policy: "fingerprint"` (`app.json:34-36`)
means the config change starts a new OTA lineage, so batch it with any other
native change.

While here: `assets/icon.png` and `assets/icon-dark.png` are unreferenced and
can go — check `scripts/check-easignore.py` first, since `make bundle-mobile`
gates on it.

### 3.5 Kind icons on Search-tab cards

`RiverRow.tsx`, `GaugeRow.tsx`, `ReferenceGaugeRow.tsx` and `DamRow.tsx` have no
leading kind mark. The Map tab's `SearchResultsList.tsx:25-46` already solves
this — `EddySymbol` at `MARK_SIZE`, Ionicons fallback via `KIND_ICON`. Hoist it
to `src/components/KindMark.tsx` so both tabs share one definition rather than
growing a second icon vocabulary.

**Gotchas:** there is **no dam symbol** in `assets/eddy/` — `DamRow` uses the
Ionicons fallback, which is what `KIND_ICON` exists for. And per the warning at
`EddySymbol.tsx:17-23` the symbols are fixed-colour, so a gauge row's mark will
not carry its condition colour — keep condition colour on the reading text.

### 3.6 Radar toggle label

`app/(tabs)/index.tsx:1216-1232` currently shows *"Radar: NOAA NEXRAD via Iowa
State Mesonet · needs a connection"*. Retitle the toggle to **"Rain"** and set
the note to *"Where it is raining now · needs a connection"*, with
`RADAR_ATTRIBUTION` demoted to smaller muted text on its own line. **Do not
remove the attribution** — `layers.ts:334-340` states IEM requires credit and
that a reader is owed knowing Eddy didn't measure it. Update that constant's doc
comment to say where it now renders.

### 3.7 Alert defaults: "Everything" → "Safety"

Change `'all'` → `'safety'` at `app/river/[slug].tsx:466` (the one-tap bell),
`app/alerts/configure.tsx:143`, and `app/alerts/[id].tsx:58`. Reorder
`CONDITION_KINDS` in `src/lib/alertKinds.ts` so `safety` is first — that file's
comment (`:57-60`) says the ordering exists so the default sits at the top,
which becomes false otherwise. Update the rationale comment at
`app/river/[slug].tsx:446`, which currently justifies `'all'`.

**Do not touch `CODES_BY_KIND`** (`alertKinds.ts:41-45`) — it mirrors the
server's `subscriptionKindsFor()` in `src/lib/alerts/fanout.ts`, and the header
at `:8-26` warns that divergence silently breaks delivery.

**Existing subscriptions are unaffected** (server-stored); this changes only what
new ones default to. Verify `app/alerts/[id].tsx:58` uses `'safety'` purely as a
pre-fetch placeholder — otherwise opening an existing `'all'` rule could
silently downgrade it on save. Extend
`missouri-float-planner/src/lib/alert-copy.test.ts`.

---

## Phase 4 — Small features

### 4.1 Gauges tab shows what's actually available

Live counts (read-only, 2026-07-30): **14,293** gauge stations, **14,264**
active, **47** curated, **46** active-and-curated (what `/api/gauges` serves),
25 rivers. `gaugeChips` (`app/(tabs)/reports.tsx` ~`:745`) counts off the current
*page* of server results — that is why the tab reads a small number.

New `missouri-float-planner/src/app/api/gauges/count/route.ts`:
`select('*', { count: 'exact', head: true })` on `gauge_stations`,
`cdnCacheHeaders(3600, 86400)`, failing open with `{ count: null }` — never a
500. **Not `app-config`:** its header (`route.ts:26-29`) forbids added
per-request DB load, and its 60 s cache is tuned for kill-switch latency, the
wrong TTL for a number that moves once a quarter.

iOS: `fetchGaugeCount()` in `src/api/client.ts` following the `get<T>` pattern,
rendered beside `gaugeChips` as **"14,000+ gauges"** — round down and say "+".
An exact figure invites "why does it say 14,293 when my search returned 20?";
rounding sidesteps the page-vs-corpus confusion. Add the route to
`src/lib/api-cache-headers.test.ts`, which already asserts header policy.

### 4.2 Rivers-scope trust copy + "request a river"

Short line under the Rivers scope of the Search tab:

> Every river here is researched by hand — put-ins walked, hazards logged,
> gauges rated. New ones go out regularly. Missing yours? **Request a river.**

**No request-a-river route or form exists anywhere in the repo.** Wire the link
to the existing `FeedbackSheet` with `defaultType="suggestion"` and a river-request
context (plus the current query, if any). `'suggestion'` is already in the
production CHECK constraint, and the admin queue already reads it — no new
route, form, or migration.

**⚠️ Hard dependency on 1.3.** Until the feedback route uses the admin client
this button fails silently like every other feedback path. Ship after Phase 1.

Web equivalent, if wanted: the existing "About This Data" callout at
`src/app/rivers/page.tsx:~78-86` is the natural home.

---

## Verification

| Item | How |
|---|---|
| All | `make check` (web typecheck/lint/tests + mobile typecheck/lint + `make bundle-mobile`). `make check-web` also covers iOS pure logic and `packages/` by design. |
| 1.1 / 1.2 | Fresh simulator install: gate blocks, accept persists across relaunch, splash still lifts normally, disclaimer on every listed surface, and grep confirms the six old strings are gone. |
| 1.3 | Apply `00208` then `00213`; `POST /api/feedback` with `gauge_recalibration` → 200 with an id; `SELECT count(*) FROM feedback` goes 0 → 1. Then submit from the iOS river screen. It has never had a row — anything is proof. |
| 1.4 | Run the drift check; expect zero gaps once 1.3 is applied. |
| 1.5 | Open the paywall with offerings unconfigured — graceful state, working Restore, no SDK string. |
| 2.1 | Deny → enable in iOS Settings → return: Profile updates with no relaunch. Then stop alerts → force-quit → relaunch: still off. |
| 2.2 | Open Feedback from river, gauge and profile with the keyboard up; sheet is reachable and swipes away; Submit works on first tap. |
| 2.3 | Upload a large HEIC and a large PNG on a slow connection: both succeed; oversize fails with a size message, not "No connection". |
| 2.4 | Get a fix on Map, switch tabs — the iOS location arrow clears within a second. |
| 2.5 | Radar at zoom ≥ 10 over active precipitation now renders (it previously could not, at any zoom the app uses). |
| 2.6 | Time-to-first-condition-paint on a cold river open and gauge open, throttled, before vs after. |
| 3.1 | River page with active alerts: Live report above the fold, alerts collapsed, a `warning` still open, alert text present in `view-source`, `#alerts` anchor still scrolls. |
| 3.4 | `make bundle-mobile`, then an EAS build — polished splash in light and dark. |
| 4.1 | Gauges scope reads the real corpus size; the count endpoint serves from cache on repeat loads. |

**Needs the user, not code:** applying the 1.3 migrations; registering RevenueCat
/ App Store Connect products (1.5); a transparent-background splash asset and an
EAS rebuild (3.4); approving the disclaimer (1.1) and paywall (3.3) wording.

**Suggested first commits:** 2.5 (one line, confirmed cause, no dependencies),
then 1.3's route fix in parallel with the user applying the migrations.
