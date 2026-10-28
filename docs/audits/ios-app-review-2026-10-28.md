# iOS app review — 2026-10-28

A review of the Expo app across its five tabs (Today, Map, Floats, Favorites,
Alerts), River Mode and the shared account/push/session plumbing, walking the
code through the situations a paddler actually meets: no signal at the put-in,
an expired token the morning after, a phone shared between two accounts, a
tap that lands before a store has loaded, a float left running. Point-in-time
report; the rules that changed are recorded in `eddy-ios/README.md` (Push,
Favorites, Starting a float), which stays authoritative.

Everything below was traced in code. "Fixed" means a change landed in this
branch with the validation named in `CLAUDE.md` passing; "Open" means the
finding is real, or plausible, and left for a separate change, with why.

## Fixed

### Accounts, push and sessions

- **Signing out opted the device out of push for good.** Sign-out and
  account deletion called the Notifications switch's `disable()`, which also
  wrote the persisted opt-out. After signing back in, alerts were saved with
  permission granted and no token was ever registered again. Sign-out and
  deletion now `unregister()`; the opt-out belongs to the switch alone.
  (`usePush.tsx`, `profile.tsx`)
- **A push token could stay bound to the previous account.** The unregister
  on sign-out is best-effort; if it did not land, the next account's
  registration hit the row under RLS, the route answered 500, and the
  previous owner kept being notified on a phone they no longer held.
  `POST /api/me/device-tokens` now releases the token from any other account
  before the upsert. (`device-tokens/route.ts`)
- **An expired token while offline read as "no account".** `getAccessToken`
  returns null when a refresh cannot run; `useAccount` cleared the
  entitlement, which the documented contract turns into an explicit `false`
  and locks the premium read for a paying subscriber at a put-in. With a
  session in hand, a null token is now "could not ask": the previous state is
  kept and Settings says "Subscription unknown" instead of "Free plan" with a
  buy button. (`useAccount.tsx`, `profile.tsx`)
- **Sign out signed every device out.** `signOut()` defaulted to the global
  scope, revoking the account's refresh tokens elsewhere; a subscriber's iPad
  then relaunched as a fresh anonymous user showing a free plan. Sign-out is
  local to the device now. (`useSession.tsx`)
- **Restore purchases before sign-in** threw the SDK's uninitialised error
  and reported "could not reach the App Store"; it now says to sign in.
  The paywall no longer requests offerings when purchases are blocked.
- **Sentry fetch breadcrumbs carried full request URLs** (search text, river
  slugs, gauge ids, viewport boxes); they carry the route name now.
  (`monitoring.ts`)
- **External links:** only `tel:`, `sms:`, `mailto:` and the two directions
  apps' schemes are handed to the system; anything else a server record
  carries is refused. (`externalLinkOpener.ts`)

### Favorites

- **Two people, one phone: A's stars became B's.** The star store is one
  unscoped key and synced with whoever signed in, so a different account
  inherited the previous one's favourites on every device it owned. The
  store now remembers the last signed-in owner; a different account replaces
  the local set with its own, and the guest identity after a sign-out keeps
  the stars local without pushing them. Rule: `starSyncPolicy` in
  `packages/eddy-sync`, tested. (`useStarredRivers.tsx`)
- **One failing push stalled the whole sync forever.** A river the server no
  longer knows (404), or a rate limit on one POST, rejected the `Promise.all`,
  so nothing was persisted, no tombstone was pruned, and the gauge and dam
  passes never ran, on every launch. Pushes now settle individually; only an
  acknowledged unstar prunes its tombstone. A 401/403 on a star write is now
  a failure rather than a silent success.
- **A star tapped before the store loaded was lost.** A deep link or widget
  straight into a river screen, star tapped while AsyncStorage was still being
  read: the tap wrote the whole store as one entry and the load then replaced
  memory with the old list. The load folds pre-load taps in (`mergeLoadedStars`,
  tested).
- **Pull-to-refresh never refreshed saved places.** It now runs the place
  refresher past its automatic backoff. (`favorites.tsx`, `savedPlaceRefresh.ts`)

### River Mode

- **Finish from the arrival notification did nothing on a cold start.** The
  action read the session before the store had loaded and returned silently,
  leaving the float recording with nothing on screen. It awaits the load now;
  a float that cannot be read opens River Mode, which shows the honest state.
  (`usePush.tsx`)
- **Screens opened cold said "No float in progress" or closed themselves.**
  River Mode showed its empty state and Float options went Back while the
  stored float was still being read (a Live Activity tap). The store reports
  `isLoaded()` and those screens, and Ready to float, wait for it.
- **A clock corrected backwards silenced the journal.** The native recorder
  dropped every fix "not newer" than the last; a backward step then skipped
  journaling for as long as the correction. It drops only an exact repeat now;
  ordering stays JS's call. (`FloatRecorder.swift`)
- Discard that was no longer possible said so instead of doing nothing; the
  automatic-end notice no longer claims a saved recap when storage lagged;
  the hazard report falls back to the raw fix, never the snapped river point;
  VoiceOver no longer hears a sunset warning for a float started below its
  take-out; the reminder sheet stops rebuilding the route index on every fix.

### Alerts

- **Comma-decimal locales could not enter a threshold** (`Number('3,40')` is
  NaN, Save stayed disabled with no hint). Both separators parse; an invalid
  entry gets a hint. (`alertCreation.ts`, both alert screens)
- **An anonymous user saw "No alerts yet" with no sign-in.** The list route
  accepts the anonymous token and answers `[]`; the tab now treats anonymous
  as signed out and shows its sign-in state.
- **A focus refresh could undo an in-flight toggle.** A GET that started
  before a PATCH put the switch back on landing. Fetches now yield to any
  mutation that began after them. (`useAlertRules.tsx`)
- **"Alert saved" with no way to deliver it** now says so (permission denied,
  device opted out, or not yet registered), with the Settings hint.
- Server: thresholds must be numbers inside the column's range (`null` no
  longer reads as 0, `1e12` no longer 500s); a gauge-height rule on a
  discharge-only station is refused like its mirror.

### Map

- **A plan started before `/api/rivers` landed was wiped when it did**, and
  offline the planner said a curated river "cannot be planned yet". The
  planner is keyed on the river id the on-disk network already holds.
- **Denying location on the first Locate tap gave no feedback** (stale
  closure); the OS answer now decides both branches.
- **A first-ever launch with no signal spun forever** on the Map tab; it now
  says the river map could not load and retries on the next focus.
- Offline search shows the last failure during its backoff instead of
  "Searching…" for up to eight seconds; a latched viewport loading flag is
  cleared; plan warnings have unique keys.

### Floats

- **A recap deleted on another device left its GPS track on the recording
  phone forever**, with no control left to remove it. The archive reports
  remote tombstones and the track is queued for deletion (tested).
- **Two devices favouriting the same shared link produced twin rows** with
  colliding list keys; saved floats are now one per share code.
- The shared-float screen validates the code from the link, hides Share until
  the float is known, and hides Favorite until history has loaded (it was a
  silent no-op before).
- Find a Route privacy copy in the README corrected to the 0.01° rounding the
  code (and server) actually apply.

### Today

- "Near me" ordering no longer commits when the gauge list failed to load
  (the list stayed condition-sorted under a "Nearest first" note).
- A premium read already on screen is kept when the token cannot be
  refreshed offline; only a real server 401/403 clears it.
- The onboarding picker marker is awaited, so a kill in that window cannot
  skip the picker for good on a new install.
- A non-JSON error page from the search endpoint is reported as the server
  error it is, not "check your connection".

## Open

Real or plausible, deliberately not changed here.

- **Stars: a quick star-then-unstar can be resurrected.** The tombstone rule
  compares the device clock to the server's `created_at`; the server row from
  this device's own push can post-date the unstar, and clock skew widens the
  window. Needs the server to accept a client `starredAt` (or a per-entry
  `pushedAt`) rather than a client-only patch. (`packages/eddy-sync`)
- **Push: a failed unregister on sign-out is not retried.** The server-side
  re-key covers the next account on the same phone; a phone nobody signs in to
  again keeps the previous account's token until that account's next
  registration elsewhere. A persisted pending-unregister would close it.
- **Alerts:** a second river "Eddy's call" alert silently overwrites the
  first (product decision); a rule on a gauge that stopped reporting still
  reads "Watching" (the audit's open item 4); the token re-registers on every
  foreground against a fail-closed limit; the primer can show before the
  permission state is known; quiet-hours validates an off window.
- **Planner deep link whose endpoint no longer exists** opens an empty
  planner with no message. Needs a "fresh data arrived" flag from
  `usePlannerData` to tell "waiting" from "gone".
- **Older server + a recap with a start note** stalls the rows behind it in
  the same sync batch; partitioning note-bearing rows last would free them.
- **Cancelling a trip download mid-creation** may leave a pack behind
  (unverified on device; a small `AbortController` through `startTripDownload`).
- **Saved places:** a corrupt or forward-version blob is a permanent error
  with no recovery path short of reinstall.
- **Today:** observation times print in device time beside charts drawn in
  station time; the whole river list re-renders every minute because `age()`
  returns new objects; the snooze hook is dead code; a 400 from the history
  endpoint is offered a retry that cannot succeed.
- **Feedback, upload and report limits are per IP**, which carrier NAT
  collapses; keying on the verified user where one exists would help on a
  busy weekend.
- **Keep-awake under the Essentials form sheet** may drop while the sheet is
  up (depends on `useIsFocused` under react-native-screens; verify on device).
- **Device verification** of everything above, as the README already says for
  River Mode, remains unconfirmed.
