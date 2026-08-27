# iOS app audits — correctness, privacy, performance — 2026-08-27

Three audits run alongside `IOS_UX_FLOW_REVIEW_2026-08-27.md`, on dimensions
the UX review deliberately excluded: correctness under concurrency, security
and privacy, and performance/offline resilience. Every finding was verified at
the cited lines before being written down, and **every finding below is fixed
on this branch** unless its entry says otherwise. The "sound" lists are as
important as the findings: they record what was checked and held up, so the
next auditor does not re-hunt it.

---

## 1. Correctness / races

1. **`followStars` could be silently wiped by a concurrent sync** — the
   first-run picker's batch follow took only the `setEntries` path, so a
   mount-sync already on the wire (fired by the same first sign-in) passed the
   generation check and committed a merge built from the pre-follow set, over
   memory and disk, unpushed. *Fixed*: `followStars` now takes `toggleStar`'s
   three guards — ref write, generation bump, then sync
   (`src/hooks/useStarredRivers.tsx`).
2. **`usePublicLands` A/B viewport race** — neither the containment
   early-return nor the cache-hit path aborted an in-flight fetch, so a slow
   request for viewport A could land under viewport B's camera and claim
   containment. *Fixed*: both paths abort first, `useGaugeHistory`'s rule
   (`src/hooks/usePublicLands.ts`).
3. **Bundle-seed race in `useNetworkPlaces`** — a disk read catching the cache
   mid-seed could later overwrite the full payload with a partial one, and a
   subscriber mounting after the one-shot seed never heard it. *Fixed*: the
   seed payload is held module-side and replayed synchronously on subscribe,
   and an applied seed supersedes the disk read
   (`src/api/client.ts`, `src/hooks/useNetworkPlaces.ts`).
4. **Viewport gauge cache deleted its own fresh payload** — re-fetching a cell
   whose previous entry had expired put the entry's own key in the discard
   set, so the disk tier served nulls for every revisited cell. *Fixed*: the
   just-written key is filtered out of the discard
   (`src/lib/viewportGaugeCache.ts`).
5. **`useFloatPlan.reset()` latched the spinner** — the bumped generation made
   the in-flight calculate skip its own cleanup, and reset never cleared the
   flag itself. *Fixed*: reset clears `calculating`
   (`src/hooks/useFloatPlan.ts`).
6. **Alert-rule reverts restored the whole snapshot** — two overlapping
   mutations could undo each other's committed outcome (pause A fails after
   pause B succeeded → B renders enabled again). *Fixed*: `mutate` reverts
   only the rules the mutation touched, with `remove()` passing its cascade
   (`src/hooks/useAlertRules.tsx`).

**Checked and sound**: `useViewportGauges` (abort-first, merge semantics,
disk stale-first), `useGaugeHistory`, `useEddyUpdates`' cache contract,
`useStatewideNetwork`'s disk-first and split focus retries, chunked-store /
riverCache / offline-cache write ordering and versioning, quiet-hours (no
client DST math exists to get wrong), the session/push cold-start races, the
paywall/profile redemption listeners, the river screen's `damFor`
derive-at-render pattern and outlook cache, configure's unit-switch
re-anchor, `useEddySearch`'s stale-response guards, and the map's layer
restore / camera-command one-shot machinery.

---

## 2. Security / privacy

1. **Supabase user ids reached Sentry unredacted** — `redact.ts`'s hex rule
   wants 32+ contiguous chars, which a dashed UUID never is, so the
   sign-in-changed-id breadcrumb carried two account ids on every ordinary
   reinstall-then-sign-in, against the privacy label's "not linked to
   identity". *Fixed*: the breadcrumb carries eight-character prefixes —
   enough to answer "did it change" and give the backend a search key —
   and `app-privacy-labels.md` records the new state
   (`src/hooks/useSession.tsx`).
2. **EXIF GPS could transit to the server** — the small-file upload fast path
   posted the picker's original bytes, camera GPS tag included, under
   permission copy promising location "is never sent to our servers" (the
   server strips before storage; the wire still carried it). *Fixed*: every
   photo is re-drawn before upload — a no-resize strip for small files, the
   shrinking ladder for the rest — pinned by a test
   (`src/components/PhotoSubmitSheet.tsx`, `src/lib/uploadPrep.ts`,
   web `upload-prep.test.ts`).
3. **Push token in a DELETE query string** — persisted in CDN/proxy access
   logs no app-side redaction reaches. *Fixed*: the token rides the request
   body; the server accepts the body first and keeps the query form for
   installed clients (`src/api/client.ts`,
   web `api/me/device-tokens/route.ts`).
4. **Keychain session not device-only** — the refresh token rode along in
   backups for no product reason. *Fixed*:
   `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; existing items migrate on the next
   write (`src/lib/secure-session-store.ts`).

**Checked and sound**: token storage (Keychain, never AsyncStorage, never
logged, headers only), the Sentry scrub pipeline including the purchase
diagnostics added this branch, one-shot tap-gated location with Mapbox
telemetry off, deep links (anchored `/plan/*` mapping, encoded params, no
WebView), the photo pipeline server-side, `.easignore` (check passes; nothing
new admitted), and secrets (public-class `EXPO_PUBLIC_` values only).

---

## 3. Performance / offline

1. **Today and Favorites never read the offline cache they maintain** — an
   offline cold start showed an error over an empty list while every river's
   name and last condition sat on disk. *Fixed*: both tabs fall back to the
   stored index through a new `agedIndex()` that recomputes ages on the
   reader's clock and withholds any verdict past the trusted window ("Last
   known: …", code `unknown`, trend dropped); Today says why in its error
   slot. A live list is never replaced by cache
   (`src/lib/riverCache.ts`, `app/(tabs)/reports.tsx`,
   `app/(tabs)/favorites.tsx`).
2. **`services ?? []` defeated RiverMap's entire memo chain** — a fresh array
   identity per render while services were null cascaded through every pin
   and shape memo. *Fixed*: module-scope `NO_SERVICES`, plus the two other
   unstable props on the same element (`onZoomToCluster`, `planEndpoints`)
   hoisted (`app/(tabs)/index.tsx`).
3. **No foreground revalidation anywhere** — tabs live as long as the process
   and the data hooks fetch once and latch, so a phone resumed overnight
   painted yesterday's condition colours as current. *Fixed*: a shared
   `onForeground` helper (`src/lib/foreground.ts`), wired into the statewide
   readings, the curated gauges, the dams store, and Today's river list, each
   gated on its route's own s-maxage and stale-while-revalidate — nothing
   blanks while the fresh answer is in flight. The services directory is
   deliberately not wired: it is a monthly-ish snapshot, not a reading.
4. **`/api/dams` fetched independently by four surfaces** — including once
   per focus of every river screen, against a route measured at 5–50s cold.
   *Fixed*: `useDams` is now a module store on `useEddyUpdates`' contract
   (shared promise, no caller signal, evict-on-reject, TTL = the route's own
   900s), with `getSharedDams()` for the imperative callers; all four
   surfaces converted (`src/hooks/useDams.ts`).
5. **Per-gauge cache keys accumulated without bound** — one AsyncStorage key
   per gauge screen ever visited, against a ~14,000-station tier. *Fixed*: a
   40-entry LRU index with serialized writes, the viewport cache's shape
   (`src/lib/gaugeCache.ts`, `src/lib/offline-cache.ts`).
6. **Inline closures defeated every row memo on the Today list** — fresh
   `onPress`/`onToggleStar` per render meant every mounted row re-rendered on
   chip toggles, count landings, and `refreshing` flips. *Fixed* for the one
   list long enough to feel it: `TodayDataRow`, a memoised wrapper whose
   props are data and whose closures live inside
   (`app/(tabs)/reports.tsx`). **Deliberately not applied** to Favorites and
   Alerts: both lists hold a handful of hand-chosen rows, and the churn of
   restructuring them outweighs re-rendering four cards.

**Checked and sound**: RiverMap's own memo architecture (finding 2 was the
one prop undoing it), startup (guarded bootstrap, per-weight fonts,
conditional bundle seed), the offline core (bundle seed, disk-first river and
gauge screens, statewide geometry read-back, saved floats), the viewport
gauge LRU, battery (no location watchers, focus-gated puck, aborted viewport
fetches), list `keyExtractor`s, debounced search, and the image pipeline's
size handling.

---

## Related fixes from the same session

- The profile's `settleConfirmPending` now reconciles (`refreshEntitlement`)
  before its last automatic poll — the transfer case it exists for is the one
  polling alone can wait out (`app/(tabs)/profile.tsx`).
- The UX review's own fixes are recorded in
  `IOS_UX_FLOW_REVIEW_2026-08-27.md` under "Fixed on this branch".

Still open after this branch: the UX review's map polish items (2.7–2.9,
2.11, 3.1–3.5), the push→rule path (2.14), and the river↔dam stack/ticker
growth (2.15) — that last one now cheaper than found, since the dam data the
buried screens re-render for comes from the shared store.
