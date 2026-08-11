# Eddy for iOS — release runbook

## Current release

- **Live App Store version:** 1.0
- **Release in progress:** 1.1 (`eddy-ios/app.json` is `1.1.0`)
- **Status confirmed:** 2026-08-11

The checkboxes below are the evidence checklist for **1.1**. They are deliberately
not inferred from the fact that 1.0 shipped: enrolment, signing and the App Store
record necessarily existed, but credentials, environment values, migrations,
device behavior and store metadata can drift between releases.

### 1.1 delta gates found in the August 11 repository audit

- [ ] Apply `20260811130000_search_gauges_provider_provenance.sql` and verify
      both `search_gauges` overloads. The four-argument form keeps 1.0 working;
      the five-argument form serves paged 1.1 search. The migration adds one
      column and changes no reading semantics, so a rollback is a re-apply of
      00207.
- [ ] Confirm a saved USGS gauge still shows its site number in Reports before
      any account syncs. A star written by 1.0 carries no provider, and for a
      signed-out user nothing will ever fill one in — the caption has to fall
      back to the site number rather than to a bare "Gauge".
- [ ] Apply `20260810202000_trust_usgs_site_scope.sql`, confirm it with
      `npm run db:check-migrations`, then rerun `usgs_site_drift`. The live
      check currently calls this RPC with no readable scope and refuses
      reconciliation as `check_error`.
- [ ] Deploy the web/API changes, then confirm the exact Clearwater Dam search
      result says **USACE release**, carries `provider: "usace"`, and never
      exposes `swl-clearwater-dam` as though it were a public station number.
      Migration-first is still the intended order, but it is no longer a gate:
      an unknown provider now falls back to the site number when the id is one,
      so code-before-migration lands on 1.0's copy instead of blanking every
      site id in search. See `shared/station-caption.ts`.
- [ ] Confirm Clearwater detail qualifier copy says **USACE**, not USGS.
- [x] Run the USGS site-drift regression suite in both UTC and
      `America/Chicago`; the official `end_utc` field must win.
- [ ] Review every critical/high Trust Ledger finding after the August 11
      snoozes expire. Resolve only after the invariant passes; do not extend a
      snooze as a substitute for remediation.
- [ ] Run `npm run db:check-services` against production and account for every
      eligible service without coordinates before calling the Maps service
      model complete.
- [ ] Exercise access-point badges on device: plain access keeps **Access**;
      `access + boat ramp/campground/bridge/gravel bar/park` drops the redundant
      generic badge.
- [x] Run the complete web and iOS automated checks.
- [ ] Smoke-test the 1.0 production app before TestFlight so the staggered
      backend rollout proves backward compatibility.

### Live production backlog inspected August 11

The Trust Ledger is operating (day 6 of 28, 0% false positives among 35 reviewed,
all six safety-baseline findings still closed), but it is not release-green:

- **Critical — `usgs_site_drift`:** the run failed with `check_error` and an
  empty scope (`scopeCount: 0`), so reconciliation correctly refused to close
  its one existing finding. The check depends on the explicitly not-yet-applied
  `trust_usgs_site_scope()` migration above; apply it, confirm a non-empty scope,
  and rerun before treating station-drift state as known.
- **Critical — Jacks Fork threshold order (snoozed):** inspect the CFS ladder in
  `/admin/gauges`. An inverted pair is a live badge error; an equal
  high/dangerous pair is latent but still needs a strictly increasing value.
- **High — Courtois gauge proximity (snoozed):** Courtois intentionally borrows
  Huzzah's gauge about five miles away. Encode or accept that governed proxy
  relationship instead of repeatedly snoozing a geometry warning.
- **Medium — unsnapped access points:** run the idempotent
  `npm run db:snap-access-points` for Mother Nature's Riverfront Retreat
  (Niangua) and Montauk State Park (Current), then rerun validation.
- **Medium — War Eagle Creek length:** investigate the 33.17-mile stored length
  versus the 68.1-mile line before changing either. After the correct half is
  fixed, run `npm run db:correct-miles`; do not blanket-copy geometry lengths.

The public production service API currently reports 153 eligible services, 138
mapped and 15 missing coordinates. Twenty-seven mapped services still lack
coordinate provenance. The full authenticated `db:check-services` run remains a
release gate because the public endpoint does not expose verification timestamps,
Google place IDs, or embedded-service drift.

Everything between a green `make check` and an app on someone's phone. None of
it is verifiable from a checkout, which is exactly why it is written down: the
app degrades *silently* when any of it is missing, so a misconfigured build
installs fine and simply looks like it is missing features.

**This doc is the single source of truth for the release path.** Any PR that
changes it must update this file in the same PR. Dashboard credentials live in
the operator's password manager, never here.

For the RevenueCat dashboard specifically, `missouri-float-planner/docs/REVENUECAT_SETUP.md`
is the detailed guide — this file only names the checks.

---

## The order matters

Each block gates the next. Doing them out of order mostly wastes time, except
where noted.

```
Apple enrolment → App ID + ASC record → EAS credentials (signing, APNs)
      → environment variables → preview build → field test
      → IAP products + store metadata → production build → submit
```

---

## 1 · Apple Developer Program

- [ ] Enrolment complete, Team ID visible in App Store Connect.
- [ ] App ID registered for **`eddy.guide.app`**.

The bundle identifier is the domain in forward order, not reverse-DNS. That is
deliberate and immutable once a build ships — see `eddy-ios/README.md`.

- [ ] Capabilities on the App ID: **Push Notifications**, **Sign in with Apple**,
      **In-App Purchase**.

> **You can skip this whole block to test locally.** The `development` EAS
> profile sets `ios.simulator: true`, and a simulator build is signed ad-hoc, so
> the native modules, the icon, the splash and the Map tab can all be exercised
> before enrolment finishes. Everything that installs on a physical device
> needs the account.

## 2 · App Store Connect record

- [ ] App record created for `eddy.guide.app`.
- [ ] `eas submit --profile production` finds it.

`eas.json`'s `submit.production` is empty. That is fine — Expo's interactive
flow locates or creates the record. Adding `ascAppId` only makes submission
repeatable and non-interactive; it is not a prerequisite.

## 3 · EAS credentials

- [ ] `eas credentials` shows a distribution certificate and provisioning
      profile for `eddy.guide.app`.
- [ ] **APNs key uploaded.** `eas credentials` → iOS → Push Notifications.

EAS can create these during the first build; you do not have to pre-upload
them. But push cannot be exercised before this exists, and it cannot be
exercised in a simulator either — `getExpoPushToken` returns null when
`Device.isDevice` is false, so the first real test of the whole push path is
the first TestFlight build.

## 4 · Environment variables

**This is the block most likely to produce a "why is everything broken" build**,
because every one of these fails gracefully and separately.

Set per environment with `eas env:create`, for **`development`, `preview` and
`production`** — `eas.json` declares `environment` on each profile, so a
variable set for only one silently does nothing in the others.

| Variable | Missing ⇒ |
|---|---|
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Map tab shows the "missing token" panel — the flagship tab, gone |
| `EXPO_PUBLIC_SUPABASE_URL` | no auth ⇒ no alerts, no push, no purchases, favourites local-only |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | as above |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | paywall says "Subscriptions are not available in this build" |
| `EXPO_PUBLIC_SENTRY_DSN` | SDK inert — **you get no crash reports from the field test** |

- [ ] `eas env:list --environment preview` shows all five.
- [ ] Same for `production`.
- [ ] `make check-eas-env` green.

**The failure mode is asymmetry, not absence, and `env:list` cannot show it.**
It prints one environment at a time, so a variable set for `production` and
forgotten for `preview` looks correct from either screen. That is not
hypothetical: `SENTRY_ORG` and `SENTRY_PROJECT` were present on `production`
only while every build ran `--profile preview`, so the source-map step executed
with no org — and the build failed inside Xcode, naming a build phase and never
the variable. `make check-eas-env` diffs the *names* across both.

**Source maps are a different, secret credential.** `SENTRY_ORG`,
`SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` go in as EAS **secrets**, never as
`EXPO_PUBLIC_` — Metro inlines anything `EXPO_PUBLIC_` into the bundle, and the
auth token can write to the Sentry org.

**Set all three for EVERY environment you build**, not just `production`. The
Sentry config plugin adds a source-map upload step to the Xcode build, and
sentry-cli reads these from the environment at that moment. Setting them on
`production` alone means a `preview` build reaches the upload step with nothing
and fails:

```
sentry-cli - error: An organization ID or slug is required
```

`eas.json` sets `SENTRY_ALLOW_FAILURE=true` on all three profiles so that
cannot take a build down. **This is deliberate, not a workaround:** symbolicated
stack traces are worth having and are not worth losing a build over. A crash
reporter that can break the thing it observes has its priorities backwards, and
this failure mode is at its worst exactly when you are least able to absorb it —
mid-incident, shipping a fix, with a token that expired.

The cost of the flag is that a broken upload is a warning rather than an error,
so **check for symbolication once per credential change** rather than trusting
it silently: a crash whose stack is minified means the upload is not working
even though the build went green.

- [ ] Sentry project created. Same org as the web app, whose own wiring is
      specified in `missouri-float-planner/docs/OBSERVABILITY_AND_UPGRADES.md`.

### Vercel — the server side of the same release

These are **not** EAS variables and none of them are `EXPO_PUBLIC_`. They live in
Vercel's project settings and every one of them, like the block above, fails
silently and separately.

| Variable | Missing ⇒ |
|---|---|
| `SENTRY_DSN` | **server and edge** web errors go to `ERROR_WEBHOOK_URL` if set, otherwise nowhere |
| `NEXT_PUBLIC_SENTRY_DSN` | **browser** errors go nowhere. A separate variable, and it must carry the prefix or it never reaches the page |
| `SENTRY_AUTH_TOKEN` | stack traces point at minified output — source maps are not uploaded. A **write** credential: never `NEXT_PUBLIC_` |
| `SENTRY_ORG` / `SENTRY_PROJECT` | as above; source-map upload needs all three or it is skipped |
| `APPLE_TEAM_ID` | Apple token revocation is skipped — see below |
| `APPLE_KEY_ID` | as above |
| `APPLE_PRIVATE_KEY` | as above |
| `APPLE_CLIENT_ID` | as above; the value is the bundle id, `eddy.guide.app` |

- [ ] All four `APPLE_*` set in **production**. Any one missing and
      `appleCredentialsFromEnv()` returns null, so `/api/me/apple-token` answers
      `{ stored: false, reason: 'not_configured' }` and account deletion never
      calls Apple's revocation endpoint. **That is a Guideline 5.1.1(v)
      rejection**, and nothing in the app looks broken: sign-in works, deletion
      works, only Apple is never told.
- [ ] `APPLE_PRIVATE_KEY` is the whole `.p8` including the BEGIN/END lines.
      Vercel cannot hold real newlines, so paste it with literal `\n` — the code
      unescapes them. A key that fails to import produces an opaque Apple `400`
      that names neither the variable nor the cause.
- [ ] The key is an **App Store Connect key with Sign in with Apple enabled**
      (Certificates → Keys), not an APNs key. They look identical on disk.
- [ ] Migration `00211_apple_refresh_tokens.sql` applied.

Verify end to end, in sandbox, before submission — this path cannot be exercised
from a checkout:

- [ ] Sign in with Apple on device, then check `apple_refresh_tokens` has a row
      for that user.
- [ ] Delete the account in-app; the row goes and the Apple ID no longer lists
      Eddy under Settings → Sign in with Apple.
- [ ] Deliberately break `APPLE_TEAM_ID` and delete another account: **the
      deletion must still succeed.** A revocation failure logs and proceeds by
      design — a person's ability to delete their account must not depend on
      Apple's uptime.

## 5 · Supabase

- [ ] Deploy server code required by a restrictive migration before applying it.
- [ ] Smoke-test the newly deployed server path while the old policy still exists.
- [ ] Run `supabase db push --dry-run`, review the exact statements, then apply them.
- [ ] Smoke-test both the public operation and its admin operation after migration.
- [ ] From `missouri-float-planner/`, `npm run db:check-migrations` passes.

For `20260731010000_feedback_api_only.sql`, this order is mandatory. The
predecessor feedback POST uses the session client and depends on the public
INSERT policy; applying the migration before deploying its service-role
replacement would break feedback submissions. Deploy the route first, verify a
submission, apply the migration, then verify submission and admin triage again.

This is a release gate, not a PR gate: a PR that introduces a migration is
supposed to be ahead of production until deployment. The command uses the
repository-pinned Supabase CLI and fails if either side has a newer migration
missing from the other. It is deliberately forward-only: the frozen legacy
baseline is not evidence that historical RLS policies or CHECK constraints are
correct. Use the separate legacy schema-security audit before relying on those
objects. New migrations use timestamp identifiers. On a new checkout, link it
once with `npx supabase link --project-ref <project-ref>`.

Run it as `make check-db`. It is deliberately outside `make check`, because it
needs a linked project and CI has to stay hermetic — which is also why it cannot
be a PR gate, and why it goes unrun unless something names it. That has already
cost something: `20260803170000_recalibrate_ozark_float_ladders` was applied by
hand in the SQL editor and the recording step was missed, so `schema_migrations`
disagreed with the repo for a day while every effect of it sat in production.
Invisible from the app, invisible from the console, and surfaced only by running
this check. **Run it after applying anything by hand, not just before a
release.**

- [ ] **Anonymous sign-ins enabled** (Authentication → Providers).

Without it the client gets `422 anonymous_provider_disabled`, silently stays
local-only, and every account-dependent feature is dark.

- [ ] Apple provider enabled, with `eddy.guide.app` as an authorised client ID.

## 6 · Do not lock your testers out

- [ ] `app_config.min_supported_version` is **null, or ≤ the shipped version**.

`UpgradeGate` is the only screen in the app with no way out. It fails open
correctly — an unreachable config means no requirement — but a value above the
shipped version bricks every install with no recourse but a new build.

```sql
select min_supported_version from app_config;
```

## 6b · Universal links

Shared float links (`eddy.guide/plan/<shortCode>`) open the app instead of
Safari. Everything is in the repo — Team ID `D4U38CY2HK` is in
`src/lib/navigation/apple-app-site-association.ts` — but the association is made
by Apple at install time and cannot be verified from a checkout.

- [ ] The web app is deployed **before** the build is distributed. iOS fetches
      the association file when the app installs; if it 404s, the app is
      installed WITHOUT the association and only a reinstall fixes it.
- [ ] `curl -sI https://eddy.guide/.well-known/apple-app-site-association`
      returns **200**, `content-type: application/json`, and **no 3xx**. Apple's
      CDN does not follow redirects for this file.
- [ ] `curl -s https://eddy.guide/.well-known/apple-app-site-association | jq`
      shows `D4U38CY2HK.eddy.guide.app`.

Then on a real device, with a build that has `associatedDomains`:

- [ ] Send yourself an `eddy.guide/plan/<shortCode>` link in Messages or Notes
      and **tap** it. It must open Eddy on the float screen.

Two things that will otherwise waste an afternoon: universal links do **not**
work in the simulator, and typing the URL into Safari's address bar is specified
*not* to trigger them — it has to be a tapped link from another app. If it opens
in Safari, pull down on the page for the "Open in Eddy" banner; if that is
missing too, the association never happened.

Apple caches the association file, so a wrong version outlives the fix. Get the
`curl` checks green before distributing a build.

## 7 · Build

**Use the make targets.** They exist because three of the failure modes below
are caused by commands you are *supposed* to run, and are not something to
remember:

```bash
make build-ios     # internal distribution, for device testing
make testflight    # production build, auto-submitted
```

Each one first deletes `eddy-ios/ios` and `eddy-ios/android`, then runs the
`.easignore` allowlist check, then builds. The raw commands still work if you
need them, but you own the cleanup:

```bash
cd eddy-ios
eas build --profile preview --platform ios     # internal distribution
eas build --profile production --platform ios  # App Store, autoIncrement
```

- [ ] Running Node matches `.nvmrc` (`nvm use`). Every make target enforces
      this; the raw commands do not.
- [ ] `make check` green at the repo root first — the bundle step there is what
      catches Metro/EAS breakage that is invisible in dev.
- [ ] `make check-eas-env` green. It compares variable *names* across `preview`
      and `production`, which `eas env:list` cannot do — see §4.
- [ ] Build succeeds.

### The archive trap, and why it is not a checklist item

`expo prebuild` and `expo run:ios` **generate** `eddy-ios/ios/`. Precompiled
Swift modules under `ios/build/` record the absolute path of the machine that
built them, so if that directory reaches the worker the build fails with:

```
missing required module 'SwiftShims'
… was compiled with module cache path '/Users/<someone>/Eddy/eddy-ios/ios/build/…'
```

naming a Swift module and a stranger's home directory rather than the cause.
`.easignore` denies `ios/`, and `check-easignore.py` asserts that rule — but the
script needs the `pathspec` package, and without it the check does not run at
all. That is why the deletion is a make prerequisite rather than a line in this
list.

To see exactly what would be uploaded, rather than reasoning about gitignore
semantics:

```bash
cd eddy-ios
npx eas-cli@latest build:inspect --platform ios --stage archive --output-dir /tmp/eas-archive
```

### Building without a cloud build credit

The Free plan's iOS builds are monthly and they run out. When they do, nothing
about the app is wrong and there is nothing to wait for — the work moves to
your Mac. Three targets, in the order you reach for them:

| Target | Produces | Signing | Costs an EAS build |
| --- | --- | --- | --- |
| `make run-ios` | app on the simulator | none (ad-hoc) | no |
| `make archive-ios` | .ipa via Xcode, submittable | Xcode, your login keychain | no |
| `make build-ios` / `make testflight` | .ipa via EAS | EAS-held credentials | **yes** |

**Pull the environment first, once per machine:**

```bash
make env-pull      # writes eddy-ios/.env from the EAS 'production' environment
```

This is the step with no error message. A cloud build has `EXPO_PUBLIC_*`
injected by EAS; a local one does not, because Metro inlines them from the
process. Skip it and the build succeeds, the app launches, and the map is an
empty panel, auth never happens and the paywall says purchases are unavailable
— which reads as several unrelated bugs rather than as one missing file. The
table in §"What each variable costs you" is the same list of symptoms.

`.env` holds live keys. `.gitignore` covers `.env` and every `.env.*`
variant except the tracked `.env.example`, and `.easignore` denies them from
the archive; neither of those is a reason to be casual with it.

**Why `eas build --local` is not in that table.** It exists and it is the
obvious thing to try, but it fails on recent macOS in a way that is not worth
debugging under release pressure:

```
[PREPARE_CREDENTIALS] Importing distribution certificate into the keychain
[PREPARE_CREDENTIALS] Validating whether the distribution certificate has been imported successfully
Error: Distribution certificate with fingerprint ... hasn't been imported successfully
```

It creates a throwaway keychain, imports the `.p12` EAS holds, and validates
it there. The certificate is fine — `security find-identity -v -p codesigning`
will list it — it is the temporary-keychain round trip that is unreliable.
`make archive-ios` avoids the whole path by letting Xcode sign with the
identity already in your login keychain.

It also needs fastlane on PATH (`brew install fastlane`, not `gem install`:
macOS system Ruby is 2.6 and Apple-deprecated), and it fails
`spawn fastlane ENOENT` without it.

**`expo doctor` runs first and can stop a local build** over patch-level
dependency drift that a cloud build tolerates. `npx expo install --check` is
the fix, on Node 20, followed by `make check` — it rewrites
`package-lock.json`, which is exactly the file `guard-node` exists to protect.

### Local builds and code signing

A simulator build is signed ad-hoc and needs no certificate. A **local device**
build does — and any signing configured in Xcode lives in `ios/`, which the next
`prebuild --clean` deletes. That is why the certificate error keeps coming back.

| Need | Use | Signing |
|---|---|---|
| JS iteration, most screens | `make dev` → simulator | none |
| Push, StoreKit sandbox, universal links | `make build-ios` → install internally | EAS holds credentials |

Known issue: on Xcode 26.6 with Expo CLI 57.0.10, `expo run:ios` has resolved a
signing certificate even for a **simulator** destination, failing with
`No code signing certificates are available to use`. Bypass with xcodebuild,
which cannot require signing for a simulator:

```bash
cd eddy-ios/ios
xcodebuild -workspace *.xcworkspace -scheme Eddy -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  CODE_SIGNING_ALLOWED=NO build
```

**Expect the first one to fail.** No native archive has ever been produced from
this repo, so prebuild, autolinking, the Mapbox pod and the Sentry config plugin
all run for the first time. That is a normal cost, not a symptom.

### If the app launches to a splash screen that never lifts

The hardest symptom this app has, because it names nothing. Work out WHICH
splash you are looking at first — that alone halves the search.

**`app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` at module
scope.** So if JS never ran, that call never happened, and the Expo splash would
have hidden on its own. A splash that stays forever therefore means one of two
very different things:

| What you see | What it means |
|---|---|
| Expo splash, stuck | JS ran. Something in the tree never reached `ThemedShell`, which owns `hideAsync`. The 8s backstop in `_layout.tsx` should have lifted it — if it did not, JS did **not** run |
| iOS launch storyboard | The React Native bridge never started. No JS of ours has executed and no JS-side fix can help |

They look nearly identical, which is the trap.

**If the bridge never started**, the suspect is whatever runs before it, and on
this app that is `expo-updates` — it decides which bundle Hermes gets. Two
settings in `app.json` are explicit for that reason rather than left to
defaults: `fallbackToCacheTimeout: 0` (launch from the embedded bundle at once,
fetch any update in the background for next time) and `checkAutomatically:
"ON_LOAD"`. Neither may be raised without understanding that the launch waits.

The decisive test, one build:

```json
"updates": { "enabled": false, ... }
```

Launches ⇒ it is `expo-updates`. Still hangs ⇒ the embedded bundle or Hermes,
and `updates` is eliminated.

**Bisecting with Expo Go is free and worth doing first.** `npx expo start` runs
every screen except the Map tab. If the app is fine there, the JS is sound and
the problem is native — which is most of the answer for the cost of two minutes.

**Reading the device is definitive.** Connect the phone, open **Console.app**,
select it in the sidebar, and — the step everyone misses — **Action → Include
Info Messages *and* Include Debug Messages**, or `expo-updates` logs at info
level are hidden and the window looks empty. Filter on `Eddy`, then launch.

## 8 · Field test (TestFlight, internal)

- [ ] Build uploaded and installable.
- [ ] Sentry receiving events — trigger a deliberate throw and confirm one
      arrives **with no token in it**.
- [ ] Map tab draws.
- [ ] Push: create an alert, accept the primer, confirm a token registers and a
      test notification lands.
- [ ] Airplane mode on a river screen — expect the name, the line and the
      put-ins, not "River not found".

IAP products are **not** needed for an internal build. They block purchase
testing and the first submission, not installation.

## 9 · App Store submission

- [ ] Subscription products created in ASC, attached to the RevenueCat offering
      marked **current**, and **submitted with the build**. If they are not,
      `fetchOfferings()` returns empty and the reviewer sees "No subscription
      options are available right now" — a clean 2.1 rejection.
- [ ] StoreKit sandbox purchase run end to end: purchase → RevenueCat webhook →
      `entitlements` row → `/api/me/profile` → `waitForEntitlement`.
- [ ] Support URL, Marketing URL, privacy policy URL.
- [ ] App Privacy nutrition labels, age rating. **The answers are written down**
      — see `docs/app-privacy-labels.md`, which records each category, whether it
      is linked to identity, and the code that makes the answer true. Transcribe
      it rather than re-deriving it; a label that disagrees with observed traffic
      is grounds for rejection either way it disagrees.
- [ ] Screenshots (6.9" and 6.5").
- [ ] **Reviewer notes** — a paste-ready block lives at the bottom of
      `docs/app-privacy-labels.md`. It covers the things that otherwise read as
      broken: the app is anonymous-first so no demo account is needed to browse,
      but the paywall deliberately renders no purchase controls until Sign in
      with Apple completes; location is only ever requested on an explicit tap;
      account deletion is in Profile; and community photos are moderated before
      publication.

### Privacy manifest

Do not add speculative declarations. Expo and the native dependencies ship
their own `PrivacyInfo.xcprivacy`, though Apple does not always merge manifests
from static pods correctly. Inspect the built archive, and treat an
**ITMS-91053** email as the signal — it is a delay, not a rejection.

---

## Things that are true and easy to get wrong

- **`.easignore` is an allowlist, and it disables `.gitignore` entirely while it
  exists.** Run `python3 eddy-ios/scripts/check-easignore.py` after touching it,
  the `file:` dependencies, or `metro.config.js`. Its own header explains why.
- **Never install `eddy-ios` with `--legacy-peer-deps`.** It silently drops
  shipped native packages. The `overrides` block is the correct fix and plain
  `npm ci` works.
- **`ios.runtimeVersion` is `{ "policy": "fingerprint" }`.** Adding a native
  module or config plugin mints a new runtime version, and old binaries stop
  being offered updates. JS-only changes ship over the air; native changes need
  a build. When the fingerprint moves, ship a build, not an update.
- **A `pk.` Mapbox token and the RevenueCat public key are public by design**
  and ship inside every binary. Restrict them in their dashboards; do not try
  to hide them.
