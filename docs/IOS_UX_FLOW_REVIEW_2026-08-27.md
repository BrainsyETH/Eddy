# iOS UX / flow review — the app after the last eight branches

A user-experience review of the Eddy iOS app as the last eight merged branches
left it (PRs #1250–#1260: the map layers/search rework, the tailwater rivers
and their dam panels, the purchase-restoration fixes, the trust-center and
Echo Bluff data corrections, and the gauge-chart trend work). Reviewed
2026-08-27, against the code — every finding below was verified at the cited
lines, and several suspected gaps were checked and found handled; those are
listed at the end so the next reader does not re-hunt them.

The lens is the user's, not the reviewer's: what breaks, misleads, dead-ends,
or silently goes missing when a person navigates the app. Code style is out of
scope.

---

## Verdict in one line

The recent work is well-defended in the small — shared copy modules keep the
two platforms honest, staleness is handled with unusual care, VoiceOver labels
are composed deliberately — but four of its seams don't close: the dam→river
handoff dead-ends on all three new tailwaters, one failed fetch can silently
kill the gauge layer for a whole session, the river screen's paywall never
shows the buyer what they bought, and the restore flow's recovery copy names a
gesture that exists on no screen where the copy appears.

---

## 1. Flow-breaking findings

### 1.1 HIGH — The dam screen's primary CTA dead-ends at "River not found" on all three new tailwaters

The one filled, accent-colored button on a dam screen — "Open the river below
this dam" — pushes `/river/{slug}` from the dam payload's `tailwater` block
(`eddy-ios/app/dam/[damId].tsx:287-322`). `/api/dams` passes that block through
unconditionally (`missouri-float-planner/src/lib/data/dams.ts:691`), but the
three tailwater rivers landed `active = false` and remain so, and the iOS river
screen resolves identity through the active-only river index
(`missouri-float-planner/src/lib/data/rivers.ts:148`;
`eddy-ios/app/river/[slug].tsx:651-661`). So on Bull Shoals, Norfork, and Table
Rock — all discoverable today via map search and the Today tab's Dams scope —
the primary action lands on the flag otter and "River not found". Clearwater →
Black is the only dam whose button works.

The corollary is that the new `TailwaterStatusRow` currently renders for no
one: the Black gets no row (Clearwater has no powerhouse, by design —
`shared/tailwater-status.ts:145`), and the three rivers that would show it
cannot be opened, starred, planned on, or found in search.

**Fix:** gate the `tailwater` block in `/api/dams` (or the button client-side)
on the slug existing in the active river index, until activation. If staging
the rivers inactive is intentional — and the thresholds review says it is,
pending access points — this is the piece that breaks the staging.

### 1.2 HIGH — One failed curated-gauge fetch silently kills the rated-gauge layer, gauge search, and gauge callouts for the session

`useCuratedGauges` latches `requested.current` **before** the fetch and never
releases it; the catch sets `gauges` to `[]`
(`eddy-ios/src/hooks/useCuratedGauges.ts:22-49`). Its own comment — "Retrying
is one more tap in the layers sheet" — is false: `ensureGauges` returns early
forever. The layer is on by default, so this fires at cold launch. Open the app
once in a dead spot and, for the rest of the session: the default-on Eddy-rated
layer draws nothing; the layers sheet prints an honest-looking "0" (the `[]`
reads as a real answer at `eddy-ios/app/(tabs)/index.tsx:1844`, violating the
sheet's own never-claim-zero-of-anything-unfetched principle); curated gauges
vanish from search; and picking a server gauge result flies the camera to an
unmarked spot with no callout (`index.tsx:315-316`) — the exact
hunt-for-the-dot bug PR #1250 fixed.

**Fix:** release the ref on failure (the pattern
`eddy-ios/src/hooks/useRiverServices.ts:30-34` already uses) and keep `gauges`
null rather than `[]` so the sheet says nothing instead of "0".

### 1.3 HIGH — Buy or restore from the river screen, and the report stays blurred

The river screen mounts its `PaywallSheet` with no `onPurchased`, and its
`useAccount()` never takes `refresh` (`eddy-ios/app/river/[slug].tsx:394,
1776-1780`). `useAccount` loads once per mount (`eddy-ios/src/hooks/
useAccount.tsx:76-81`), so after a server-confirmed purchase or restore the
sheet closes onto an EddyTake still computing `entitled` from the stale
pre-purchase snapshot (`river/[slug].tsx:1122-1126`): blurred prose, lock row,
no message (the sheet is deliberately silent on confirmed restore), and no
refresh affordance. The user must leave and come back to see what they paid
for. The gauge screen (`eddy-ios/app/gauge/[siteId].tsx:932`) and profile
(`app/(tabs)/profile.tsx:786-793`) both wire this correctly; the river screen —
the surface that raises the paywall most — is the one that was missed.

**Fix:** destructure `refresh` at line 394 and pass
`onPurchased={() => void refresh()}` at 1779. One line each.

### 1.4 HIGH — "Pull to refresh in a moment" is an instruction no relevant screen can follow

The new restore copy ("Purchase found",
`eddy-ios/src/lib/purchases.ts:659`), the unconfirmed-purchase alert
(`eddy-ios/src/components/PaywallSheet.tsx:213-216`), and both redemption
alerts (`purchases.ts:898, 906`) all tell the user to pull to refresh. A
`RefreshControl` exists only on the Today, Alerts, and Favorites tabs — none of
which show entitlement state. The screens these alerts actually appear over —
profile (`app/(tabs)/profile.tsx:374`, a plain ScrollView), river, and gauge —
have no pull-to-refresh at all. And nothing re-reads the entitlement on focus
or foreground, so "in a moment" has no mechanism either: the account catches up
only on remount. The user in the exact edge case PR #1256 was written for is
told to perform a gesture that does nothing, then to "contact support" from
screens that offer no support path (the only support entry points are in
profile's Feedback section, `profile.tsx:729-741`).

**Fix:** add a `RefreshControl` to profile wired to `refresh()` (and ideally to
the river/gauge screens), or change the copy to something true; name the
support address or add a mailto button to the two alerts that say "contact
support".

### 1.5 HIGH (latent) — Planning a float on a tailwater produces copy written for flood water

`/api/plan` withholds `floatTime` for `river_type = 'dam_tailwater'`
(`missouri-float-planner/src/lib/calculations/floatTime.ts:170-179`) but puts
no reason on the wire (`src/app/api/plan/route.ts:786-797`). iOS renders the
null branch as "No float time" — painted in the *condition* color, so
potentially green — over "Eddy does not estimate a time in this water. Wait for
it to drop." (`eddy-ios/src/components/PlanResult.tsx:156-165`). On a tailwater
at ordinary generation that is false twice: the water is not high, and waiting
will not help. Chat already has the correct sentence — "the release can change
mid-float" (`src/lib/chat/tool-handlers.ts:303-305`). Latent until the rivers
activate, but the copy ships in the binary and App Store review lag means the
client fix has to land *before* activation, not with it.

**Fix:** put `withholdReason` on the wire (or read `riverType` client-side) and
branch the copy; the regulated branch should name the dam and link to its
schedule.

---

## 2. Medium findings

### River screen and tailwaters

- **2.1 The Black lost its only river→dam handoff.** PR #1258 removed the
  universal "{dam} controls this reach" link (deleted in `3436f02`) in favor of
  `TailwaterStatusRow` — which returns null for a no-powerhouse dam. So on the
  one *active* dam-controlled river in the app there is now no path from the
  river screen to Clearwater's release figure, forecast, alert button, or phone
  line; `RiverDamPanel` is dead code, imported only for `damForRiver`
  (`eddy-ios/app/river/[slug].tsx:99`, no render site in the app). The commit
  said "a gate-controlled row for it is a separate change"; until that lands
  this is a regression for Black River users. Fix: render the old link, in the
  new position, for tailwater-matched no-powerhouse dams.
- **2.2 TailwaterStatusRow pops in with no loading affordance.** `dam` starts
  null and fills when `/api/dams` answers — a route the same file documents as
  "five to fifty seconds cold" (`river/[slug].tsx:463-506`). The row inserts
  between the status card and the reaches panel (`:1316`), pushing everything
  below it down mid-read. When the river payload says `dam_tailwater`, reserve
  the row's height or show a one-line "Checking the dam…" placeholder.
- **2.3 Two independently computed trend pills can disagree on one screen.**
  The status card's `TrendPill` uses the server trend
  (`river/[slug].tsx:1241-1243`) while `GaugeChart` computes its own from the
  drawn series (`eddy-ios/src/components/GaugeChart.tsx:365-372, 785-794`) —
  different windows, so "Rising slowly" over "Holding steady" is reachable for
  the same station on the same screen. Feed both from one source, or pass
  `showTrend={false}` on the river screen.
- **2.4 Dissolved oxygen never renders on iOS.** `/api/gauges/[siteId]`
  returns it and the web shows it, but `grep -ri oxygen eddy-ios/` is empty:
  the iOS gauge screen prints water temperature only
  (`eddy-ios/app/gauge/[siteId].tsx:654-658`). The low-DO story the registry
  calls out below Norfork is invisible on the platform anglers actually carry.
- **2.5 Release alerts hand the user a blank number field.** The dam screen's
  "Alert me about the release" lands on gauge-scope configure, which — the
  gauge being deliberately unrated — asks for a custom level with no hint of
  what cfs means "units running", even though the payload carries
  `generationFloorCfs` (`shared/dam-types.ts:355`). Seed or hint the
  threshold; longer-term, a generation-state alert kind.

### Map

- **2.6 Services fetch failure is unrecoverable in practice.** The hook
  releases its ref on failure but the effect only re-runs when `wanted`
  *changes* — and with three service layers on by default it is true from
  mount (`eddy-ios/src/hooks/useRiverServices.ts:25-43`,
  `app/(tabs)/index.tsx:1088-1090`). One flaky launch → no campground/rental/
  lodging pins, no counts, an empty Camping & outfitters tab, services
  unfindable in search — all session, silently. Re-attempt on tab focus or key
  the effect on a retry nonce.
- **2.7 Map taps half-work while a search query sits in the field.** Sheets
  are suppressed during search (`index.tsx:2755, 2787`) but pin/river presses
  stay wired and queue a camera command that fires only when the user later
  clears the search — a delayed jump plus a sheet popping seconds after the
  tap (`eddy-ios/src/map/RiverMap.tsx:1644`). Treat a map tap as search
  dismissal, or ignore presses while searching.
- **2.8 Closing a searched dam/hazard/service callout destroys a river the
  user chose.** Those search branches set `revealsRiverSheet(false)`
  (`index.tsx:1256, 1263, 1271`) though they never switched the river, so
  `dismissPin` clears the selected river (`index.tsx:2219-2225`) —
  contradicting the invariant stated two lines above it. Set
  `revealsRiverSheet(Boolean(selectedSlug))` for kinds that don't select.
- **2.9 The locate button does visibly nothing when permission was denied.**
  On denied-with-no-remembered-fix the tap yields a brief spinner and nothing
  (`index.tsx:2227-2246`); the app already has the alert-plus-open-Settings
  pattern elsewhere (`app/(tabs)/reports.tsx:1221`). Use it here.
- **2.10 Outfitters are unsearchable when their layers are off, while the
  empty state suggests searching for them.** Services fetch only when a
  service layer is on or a river selected (`index.tsx:1088-1090`), yet the
  placeholder promises "…dam or outfitter" (`index.tsx:2414, 2514`). Request
  services on search-field focus, beside `ensureGauges`.
- **2.11 An open dam callout never receives the live data it promises.**
  `selectedPin` is a snapshot; when `/api/dams` lands nothing re-syncs the
  open callout (`index.tsx:1107-1134`, no driven `setSelectedPin`), so during
  the documented cold window a tapped dam shows no reading and never updates
  until closed and reopened. Re-derive the open pin when its `damId` matches,
  or show "Live status loading…" while `dams === null`.

### Navigation

- **2.12 Spinner-with-no-exit loading states on the three detail screens.**
  Dam, gauge, and river all render a bare `ActivityIndicator` with
  `headerShown: false` and no nav row while loading
  (`eddy-ios/app/dam/[damId].tsx:134-141`, `gauge/[siteId].tsx:312-318`,
  `river/[slug].tsx:943-949`) — on routes documented at five to fifty seconds
  cold. The repo already states the rule on itself: configure renders its nav
  row during load *because* "a spinner with no chevron is that long with no
  way off the screen" (`app/alerts/configure.tsx:460-471`). Swipe-back
  technically works; nothing shows it does. Render the nav row above the
  spinner, as configure and float already do.
- **2.13 Error states say "try again" with no retry control.** Gauge and dam
  print "Check your connection and try again" with nothing tappable but Back
  (`gauge/[siteId].tsx:334-337`, `dam/[damId].tsx:156-159`); the river
  whole-screen error offers only "Go back" despite a ready `retry` callback
  (`river/[slug].tsx:427, 951-960`). `float/[shortCode].tsx:169-171` shows
  the pattern done right.
- **2.14 A push notification gives no path to the rule that fired it.** Push
  taps land on the gauge or river screen (`eddy-ios/src/hooks/usePush.tsx:154-155`),
  where alerts can only be toggled or *created*; pausing or editing the rule
  that just buzzed the phone takes back → Alerts → Mine → find the row.
  Carry the rule id in the payload and offer "Manage this alert" on landing.
- **2.15 River ↔ dam ping-pong grows the stack without bound, ticking as it
  goes.** Both cross-links are plain `router.push`
  (`TailwaterStatusRow.tsx:50`, `dam/[damId].tsx:293-307`), so alternating
  taps stack screens indefinitely — and every buried copy keeps a live
  minute-interval re-render (`dam/[damId].tsx:73-77`,
  `river/[slug].tsx:521-525`, no focus guard). Use `router.navigate` for the
  cross-links and gate the tickers with `useFocusEffect`.
- **2.16 Signing in from the river bell always subscribes — even when the
  user was unsubscribing.** `unsubscribe` runs through the gate
  (`river/[slug].tsx:893-912`); the sign-in sheet's `onSignedIn` hard-codes
  `void subscribe()` (`river/[slug].tsx:1785-1790`). A signed-out user who
  tapped "turn alerts off" is silently re-subscribed after signing in. Record
  which action opened the gate and resume that one, as configure does.

### Purchases

- **2.17 Purchase failure shows the raw SDK string.** `purchasePackage`
  returns `e?.message` verbatim and the paywall displays it
  (`purchases.ts:519`, `PaywallSheet.tsx:200`) — the exact practice the same
  file's restore path forbids in its own comment (`purchases.ts:621-623`).
  Map to a small set of user sentences; report the raw error to monitoring.
- **2.18 An unconfirmed purchase says "you are subscribed" over a card
  showing a buy button.** When `waitForEntitlement` times out (~7s), the
  sheet alerts success and closes; profile's refresh then re-reads the
  still-stale server, so the card renders inactive with "Get Eddy Premium"
  seconds after the alert (`PaywallSheet.tsx:209-220`,
  `profile.tsx:472-485`). No paywall loop — gates are passive — but the
  contradiction lands exactly where trust matters. Show a "Purchase pending —
  checking…" card state and re-poll.

---

## 3. Low findings

- **3.1** Zoomed out past the marker threshold, the layers sheet advertises
  counts for layers drawing nothing; only `allGauges` and `publicLand` explain
  themselves (`eddy-ios/src/map/layers.ts:437-446`,
  `GaugeFilterBar.tsx:179-187`). Extend the `LayerZoomHint` treatment.
- **3.2** The layer-row ⓘ is a ~35 pt target inside a row whose tap toggles
  the layer (`MapLayersSheet.tsx:300-317`) — under the 44 pt floor the repo
  itself calls non-negotiable (`PinCallout.tsx:558-560`), and a near-miss
  flips the switch.
- **3.3** Mile-post ticks can appear as anonymous dots when their labels lose
  collision, and a tap falls through to the river line
  (`RiverMap.tsx:2551-2605`). Tie tick visibility to label visibility.
- **3.4** Camera memory persists throwaway search flights: a zoom-13 glance at
  a far-away gauge becomes the next cold open, outranking location
  (`index.tsx:521-529, 1972-1985`). Persist only gesture-settled cameras, or
  clamp the restored zoom.
- **3.5** After the server search half backs off, the empty state still
  promises access points — "Nothing matched" when the truth is "couldn't
  search" (`useEddySearch.ts:374-431`, `index.tsx:2514`).
- **3.6** The empty-stack back fallback lands on the Map tab
  (`eddy-ios/src/lib/nav.ts:51`), contradicting the tabs layout's deliberate
  Today-first decision (`app/(tabs)/_layout.tsx:22-31`) — a shared-float
  recipient's first back tap lands on the screen the layout comment calls the
  one that "answers it least directly".
- **3.7** A dead float short-code (404) still renders "Try again", which will
  404 forever (`app/float/[shortCode].tsx:55-59, 163-171`).
- **3.8** Three verbs for one concept: "Follow N rivers" (picker), "Following"
  (Today chip), "Favorites"/"Tap the star" (tab and empty state). Pick one
  verb family for the action.
- **3.9** Saved floats' empty state points at the Map tab with words only, on
  a screen whose only exit is Back (`app/floats.tsx:71-74`). Make it a button.
- **3.10** Starred dams vanish from the New Alert screen ("Your starred
  water" maps stars with a `usgsSiteId` only, `app/alerts/new.tsx:104-137`),
  and its search runs with dams off (`new.tsx:91-94`) — so "Bull Shoals"
  matches on the map and returns nothing here. Map dam stars to their
  tailwater gauge.
- **3.11** Billing-issue copy says "update it in Settings" but the card's only
  button opens the subscription list, not Payment & Shipping
  (`purchases.ts:919-921`, `profile.tsx:487-500`) — the one subscription
  state the user can still act on hands them the wrong door.
- **3.12** The Terms/Privacy links on the paywall and profile have no
  `accessibilityRole`, so VoiceOver reads them as plain text
  (`PaywallSheet.tsx:436-442`, `profile.tsx:546-552`).
- **3.13** When the tailwaters activate, their permanent "Unknown" condition
  chip on Today rows, favorites cards, and the plan list will read as a data
  outage, not as "dam-controlled" (`shared/condition-system.ts:161`,
  `PlanSheet.tsx:469-470`). Let `dam_tailwater` rivers substitute
  "Dam-controlled" — the label `RiverReaches.tsx:32-33` already has.
- **3.14** Expo Go / unconfigured builds show the sign-in footer before the
  "Premium isn't available right now" notice, asking the user to sign in
  before telling them Premium cannot work in this build at all
  (`PaywallSheet.tsx:446-479`).

---

## 4. Checked and found handled

Worth recording, so nobody re-litigates them:

- **`unknown` as a condition code** is fully absorbed on iOS — every accessor
  in `eddy-ios/src/theme/conditions.ts` falls back to the `unknown` entry, so
  the 2026-08-26 unrated-gauge migration cannot paint an iOS surface wrong.
- **Dam-screen staleness** is genuinely careful: reader-clock bands
  everywhere, "Eddy last checked X · may have been revised", stale readings
  dim rather than hide, movement drops its number past six hours, and a dam
  publishing nothing gets an explicit card saying so.
- **Copy cannot contradict itself across the row, the dam screen, and the
  schedule** — all derive from `shared/` (`buildTailwaterStatus`,
  `generationNow`), the row deliberately takes no condition color, and the
  composed VoiceOver label speaks every qualifying line in tested order.
- **Condition vocabulary is unified** across river, gauge, map sheet, Today
  and favorites — one shared source, rated/reference split enforced,
  same-station/different-river verdicts prevented.
- **Search → callout on the map** is consistent and well-defended: session
  `enableLayer` overrides toggled-off layers, camera lands above every
  mark/label threshold so the pin always exists, and one tap always yields
  the same sheet a map tap would.
- **Deep links and push cold-start** are not traps: `goBack` falls back to a
  tab on an empty stack, and the push-token/onboarding race is explicitly
  handled.
- **Restore always terminates in an alert** — every step swallows its own
  failures and returns a result; "Nothing to restore" is now correctly
  reserved for ran-and-found-nothing.
- **The alert sign-in gate fires at save, not entry**, and a failed context
  load degrades to a usable custom-level form rather than a dead Save button.

---

## 5. Suggested order

1. **Before tailwater activation** (and early, for App Store lag): 1.1 the
   dam→river gate, 1.5 the plan copy, 2.1 the Black's missing handoff, 3.13
   the "Unknown" chip label.
2. **Session-killers, one-line-ish fixes**: 1.2 the gauge-fetch latch, 1.3 the
   river paywall refresh, 2.6 the services retry, 2.16 the resubscribe-on-
   sign-in.
3. **Copy that misleads**: 1.4 pull-to-refresh instructions, 2.17 raw SDK
   strings, 2.18 the pending-purchase card state, 3.11 the Settings door.
4. The rest as touched: the loading/retry affordances (2.12, 2.13) whenever a
   detail screen is next opened, the map polish (2.7–2.11, 3.1–3.5) with the
   next map branch.
