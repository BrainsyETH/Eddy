# Eddy 1.2 — release-readiness report

**Date:** 2026-09-03 · **Reviewed tree:** `main` @ `b7b8a3d` · **Baseline:**
`f4adad6` (2026-08-15), the commit that set `app.json` to `1.1.0` and shipped
as 1.1 · **Verification branch:** `claude/testflight-1-2-release-qajwr8`

**Verdict: the binary is ready to cut; two production data findings and one
whole class of verification are not closed.** Nothing found in the delta
blocks a *TestFlight* build. The Trust Ledger's Jacks Fork critical, carried
unresolved from 1.1, and the Phase 5 device pass from
`missouri-float-planner/docs/RECENT_BRANCHES_FIX_PLAN_2026-09-01.md` both
have to close before the App Store submission.

This report is written from the repository and from read-only production
queries run 2026-09-03. **No automated check was run for it** — see
*What was not verified* at the end. That is the single largest gap in this
document and it is deliberate that it is stated rather than implied.

---

## The delta, in numbers

| | 1.1 → 1.2 |
|---|---|
| Commits | 323, across 73 merged pull requests |
| Whole repo | 488 files, +55,554 / −4,743 |
| In the iOS binary (`eddy-ios/`) | 93 files, +10,197 / −2,020 |
| Shared condition system (`shared/`) | 23 files, +3,745 / −68 |
| Web API routes touched | 34, of which 4 are new |
| Migrations added | 49 |
| Native dependencies changed | **none** |

Nineteen days. It is a bigger delta than 1.0 → 1.1 was.

## The one thing that makes this build unusual: the fingerprint has not moved

`app.json`, `package.json`, `package-lock.json`, `metro.config.js` and
`.easignore` are **byte-identical to the 1.1 tree** apart from the version
bump in this branch. No native module was added or removed and no config
plugin changed, so `ios.runtimeVersion: { "policy": "fingerprint" }` resolves
to the same value 1.1 resolved to.

Two consequences, in opposite directions:

- **Good:** the native surface is the one that already passed Apple review
  and has been running in the field since mid-August. Prebuild, autolinking,
  the Mapbox pod and the Sentry plugin are all doing exactly what they did
  for a build that shipped. The archive trap in the runbook (§7) is still a
  real hazard, but the *content* of the archive is a known quantity.
- **Watch out:** because the runtime version matches, an EAS Update published
  to the `production` channel would be offered to **1.1 binaries already on
  the store**, which would put 1.2's JavaScript behind 1.1's version string.
  `make testflight` builds and submits; it does not publish an update, so
  this is only a hazard if someone reaches for `eas update` during the
  release. Cut the build; don't patch 1.1.

Everything in 1.2 is JavaScript, shared logic, and the backend.

---

## What ships in 1.2

Grouped by what a person would notice, not by pull request.

### The gauge experience, rebuilt in four releases (#1241)

The largest single piece of the delta. Both platforms now answer the same
three questions in the same order — what is the river doing, is there an
official safety concern, what is expected next — from one implementation.

- `shared/reading-trust.ts` holds the canonical suspect-qualifier table that
  `gauges.ts`, `alerts/gate.ts` and `chart-model.ts` had each been keeping a
  private version of, and the trust rule that follows from it: a suspect or
  more-than-six-hour-old reading keeps its value and its age and earns **no**
  condition, trend, or seasonal interpretation. A stale gauge stops looking
  as confident as a fresh one.
- `shared/safety-summary.ts` is a five-state machine over official NWS
  stages, present tense only for a current category, never inferring safety
  from absent stages. During an official event the safety row moves above
  the reading — Eddy's opinion is subordinate to the NWS's statement.
- `shared/station-tier.ts` makes the rated/reference/unknown decision once.
  An unrated station says it is unrated instead of borrowing a vocabulary it
  never earned; `unknown` renders as a shape, not a sentence.
- History reaches much further back. The USGS client's silent ~45-day
  saturation is gone: past the 10k feature budget it splits per parameter,
  and a new daily-values path serves long windows. Every provider now
  declares its own `HistoryCapabilities` (USGS 90 instantaneous days plus
  daily beyond, NWS ~30, USACE 30) on the wire, so no client-side registry
  can drift.
- The scrub moved from `PanResponder` to `Gesture.Pan()`, so it works
  everywhere the chart renders — including inside the map sheet, where it
  used to be switched off — and the plot is a VoiceOver adjustable element.
- "Now" becomes "Last reading" past a six-hour staleness line, on both
  renderers. A gauge that stopped two days ago no longer labels a two-day-old
  point "Now".

### Dams and tailwaters

- `DAM_CATALOG` ships **inside the app**, so a dam screen paints its identity
  on the first frame instead of blanking for a measured 8.16s cold.
- The Lakes & dams map layer no longer wedges permanently. `fetchDams`
  answered `[]` on failure and the screen's latch was claimed by the
  *attempt*, so one timeout — the ordinary outcome on a cold CDN entry,
  measured at 4.8s and 48.9s against a 15s client deadline — killed the layer
  for the life of the screen, with toggling off and on unable to retry it.
- A generation card that says what the dam is doing, observed above
  scheduled, with the window drawn on the chart, and a tailwater status row
  that words its three silences as silences rather than as flood water.
- Cumberland (LRN) dams joined the eighteen-dam hourly set; the backfill for
  them ran and is recorded.

### Map

- Search covers dams, hazards and services, matched locally out of what the
  screen already holds — the server is never asked for the new kinds — and
  choosing a result opens its callout and switches its layer on. Gauge
  results open their callout instead of flying the camera to an unmarked
  spot.
- Every place layer climbs the same zoom ladder, with a "zoom in" hint when
  the camera rather than the switch is why nothing draws.
- The camera is remembered between visits; a tapped river keeps the map where
  the finger landed; river miles post along the selected river.

### Speed

A latency pass gave the cold paths something to draw. The launch bundle now
seeds a condition-less river **index** on its own cache key, so the river
screen, the first-run picker and the dam screen's tailwater gate stop holding
a full-screen spinner on the slowest read route in the app to learn three
strings that change monthly. Requests are shared rather than paid for twice,
and an outage is never cached.

### Alerts

Eight defects, of which one matters more than the other seven: **quiet hours
never applied to river alerts.** The delivery cron's gauge pass loaded
`notification_preferences` and suppressed; the river pass — which delivers
every "Eddy's call" subscription, the alert the bell on the river screen
creates and by far the commonest kind anybody has — never loaded a
preferences row at all. A user who set "silent 10pm–7am" was still woken at
3am by exactly the alerts that setting most obviously governs, while the app
said in as many words that the window was in force.

A push now also carries a way back to the rule that sent it.

### Purchases

- Offer-code redemption for comps, on Apple's own redemption screen (the
  in-app StoreKit sheet fires no completion callback and fails silently),
  from both the paywall and Profile, with a foreground sync on return.
- Restore reaches an account that never bought on this Apple ID. This is what
  added `/api/me/entitlement/refresh` — see the deploy-order gate below.
- Entitlement moves forward only, and a reconcile now defers to a newer
  event, closing a race that could re-grant a refunded subscription.

### Conditions accuracy (all live in production already)

- **Jacks Fork at Eminence** and **Meramec at Steelville** had a floor line
  sitting at or above the gauge's own July–October median, so an *ordinary*
  day graded below "Good" — 172 cfs median against a `too_low` of 176 said
  "wading only"; 178 against a `low` of 250 said "scraping likely". Both
  pulled, on owner report, 2026-09-01.
- Echo Bluff is on Sinking Creek, not the Jacks Fork, with coordinates from
  OSM instead of an estimate.
- The Niangua's missing 30 miles to the lake were re-imported.
- The Current starts at Montauk: the line was extended, Montauk became its
  first put-in, and every access-point mile on the river was recomputed from
  the geometry.

### Eddy Says

The per-river line now reaches the river screen, favourites and the map
surfaces from the single request the Today tab already made. The free/paid
split is held by a type — `selectEddySays` returns a DTO with no field the
gated quote could occupy — rather than by a source assertion a rename could
walk past.

### Server-side, not in the binary (#1267)

River condition reports can be generated by Haiku, chosen through allowlisted
runtime config (ADR 0009). This changes the prose the app displays without
changing the app. It is reversible from the admin surface without a build.

---

## Gates

### Must be true before the build is distributed

1. **Deploy the web app first.** The 1.2 binary calls
   `/api/me/entitlement/refresh`, which did not exist in 1.1 (added in
   `b39486f`). If the build reaches a tester before the deploy, restore and
   the post-purchase catch-up path 404. Several additive response fields the
   1.2 screens read — `floodStages` on `/api/conditions/[riverId]`,
   `historyCapabilities` on gauge detail, the server-derived visual gauge —
   have the same dependency, and they degrade quietly rather than loudly,
   which is worse.
2. **Universal links.** Runbook §6b is unchanged and still applies: the
   association file must be 200, `application/json`, no 3xx, *before* the
   build installs.
3. **`min_supported_version`.** Checked read-only 2026-09-03: `0.0.0`, with
   `upgrade_message` null. `UpgradeGate` cannot lock anyone out. No action.
   (`latest_version` reads a stale `0.1.0`; it drives no gate, but it is
   wrong and worth correcting while you are in there.)
4. **Migration ledger.** `supabase/production-migrations.txt` has an empty
   `[pending]` section as of 2026-09-02, and `scripts/migration-ledger.test.ts`
   now holds the file to the migrations directory. `make check-db` from a
   linked checkout is still the release gate and is still unrun — it needs
   credentials CI does not have.
5. **The two Actions secrets.** `.github/workflows/migration-drift.yml`
   warns and skips unless `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`
   are both set. Until they are, the drift guard added in this delta is
   inert — it is not failing, which reads identically to passing.

### Must close before the App Store submission

6. **Trust Ledger — critical, Jacks Fork, still open.** Queried live
   2026-09-03: `validate_river_data` / `jacks-fork`, *"thresholds not
   strictly increasing"*, open and **no longer snoozed**, last seen today.
   The offending row is **07065200, Jacks Fork near Mountain View**, where
   `level_low = level_optimal_min = 100.00 cfs` — untouched since
   2026-07-21. The September 1 recalibration fixed *Eminence* (07066000),
   which is a different gauge on the same river; Mountain View was not in
   its scope. The feet ladder on the same row is fine (0.93 → 0.94), so only
   the cfs ladder collides, and only at exactly 100 cfs. This has now been
   the ledger's top finding across two releases. It needs the data judgement
   — nudge `level_optimal_min` above 100 — not a third snooze.
7. **Trust Ledger — high, Courtois, still open.** Same query: *"no gauge
   stations within 1km of river geometry"*, open, not snoozed. Courtois
   deliberately borrows Huzzah's gauge about five miles away. Encode the
   governed proxy or accept it; it has survived two releases as a warning
   nobody acts on.
8. **The Phase 5 device pass.** Nine UI judgement calls landed in code on
   2026-09-02 and **none has been seen on a device**, by the plan's own
   admission. The plan asks for ten minutes on a simulator with a stale
   gauge, a fresh install, and airplane mode. Two are flagged as product
   choices rather than fixes: 5.3 (one offline line under the Favourites
   header rather than a glyph per card) and 5.8 (the now-label drops a line
   near a stage label; a mid-band stage label can still brush it, and a
   per-pixel rule was judged not worth it yet).
9. **The chart-scrub device gate**, carried unclosed from 1.1's runbook. The
   scrub's move to `Gesture.Pan()` is gesture arbitration, which is the class
   of change that wants a real device. In the map sheet's History tab: a
   horizontal drag scrubs without turning the page, a vertical drag still
   moves the sheet (an ~8pt readout flash is expected), a tap reads out while
   held. On the gauge and river screens: a vertical drag on the plot scrolls
   the screen and the scrub still works. With VoiceOver: a swipe up/down
   steps one reading, announcing value, time, and the forecast/provisional
   labels.

### Not blockers, but do not be surprised by them

- **Three Cumberland dams read stale.** Queried 2026-09-03: Wolf Creek 9.7h,
  Center Hill and Dale Hollow 4.7h behind, against 1.7–2.7h for the other
  fifteen. The ledger has this as a medium `dam_freshness` finding. It is an
  upstream LRN feed lag, not a 1.2 regression, and the strip renders those
  hours as honest nulls — which is the designed behaviour and will look like
  a bug to a tester who does not know that.
- **The Jacks Fork critical is visible in the app.** At exactly 100 cfs the
  Mountain View badge sits on an ambiguous boundary. It is a narrow window,
  but a tester who hits it will report it.
- **The river-mile ruler question is open and documented, not decided.**
  `missouri-float-planner/docs/RIVER_MILE_SCALES_REVIEW_2026-09-02.md`: nine
  rivers store access-point miles on a published guide's ruler while the
  geometry measures from the NHD headwaters, with uniform per-river offsets
  of 4 to 30 miles. Four code paths mix a geometry mile with a stored one and
  are wrong by the offset; thirty display sites print a stored mile as an
  absolute with no ruler named. The review gathered evidence and made no
  decision. Nothing here changed in 1.2 and nothing here is newly broken —
  but if a tester says a mile marker is wrong, this is why, and the answer is
  a product decision rather than a fix.

---

## What was not verified

Stated plainly because the rest of this document reads like it was:

- **No automated check was run.** `make check`, `make check-web`,
  `make check-mobile` and `make bundle-mobile` were all skipped. The session
  that wrote this had no `node_modules` in either app and was running Node
  22 against an `.nvmrc` of 20, which `guard-node` fails by design. The last
  evidence in the repo is `b7b8a3d`'s own claim of typecheck clean, lint 0
  errors, `npm audit --omit=dev` at 0 vulnerabilities, and 2522/2522 tests.
  **Run `make check` on Node 20 before cutting.** That is not a formality
  here: `make bundle-mobile` is the step that catches Metro/EAS breakage
  invisible in dev, and it has not run against this tree in this session.
- **Nothing was exercised on a device or a simulator.** Every item in gates
  8 and 9 is outstanding for that reason.
- **`make check-db` and the authenticated `npm run db:check-services` were
  not run.** Both need credentials. The migration-ledger evidence above is a
  file-and-query comparison, not the CLI's view.
- **The dashboards were not opened.** Apple, App Store Connect, EAS and
  RevenueCat state is exactly as unverified as it was before this document
  existed. Runbook §§1–4 and §9 still stand on their own.
- Production reads used for this report — `app_config`, `trust_findings`,
  `river_gauges`, `dam_metric_readings` — were **read-only**. No production
  write was made.
