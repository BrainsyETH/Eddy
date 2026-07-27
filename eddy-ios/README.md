# Eddy for iOS

Expo app consuming the Next.js backend in `../missouri-float-planner` as a
headless API.

## Running it

```bash
cd eddy-ios
npm install --legacy-peer-deps
npx expo run:ios          # build + install the dev client (first run only)
npx expo start            # serve the JS — needed every session
```

`expo-dev-client` is a dependency, so `expo start` runs in **dev-client mode**,
not Expo Go mode. Expo Go still loads — `@rnmapbox/maps` and
`react-native-purchases` sit behind lazy `require`s (`src/map/runtime.ts`,
`src/lib/purchases.ts`) precisely so it can — but with Mapbox, Apple auth,
notifications and purchases all in the app, a development build is the normal
path now and Expo Go is the fallback for the screens that do not need native
modules.

Two things that are not optional:

- **`--legacy-peer-deps` is required.** `@expo/metro-runtime` is a mandatory
  `expo-router` peer whose own `react-dom` peer conflicts with the pinned React.
  The conflict is web-only and does not affect the iOS bundle, but a plain
  `npm install` fails outright.
- **Run commands from inside `eddy-ios/`.** There is deliberately no
  `package.json` at the repo root (see below), so `npx expo` run from the root
  will fetch the latest Expo from the registry instead of using this project's
  pinned SDK 57.

`npx expo start --ios` needs Xcode plus an installed iOS simulator runtime. If
you see `No iOS devices available`, either the runtime is missing
(`xcodebuild -downloadPlatform iOS`) or Xcode is not the selected developer
directory (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).
Note `Simulator.app` lives *inside* `Xcode.app`, so deleting Xcode removes it.

### Three ways to run this, and when each applies

| Command | Needs | What it actually does |
|---|---|---|
| `npx expo start` | a dev client, or Expo Go | serves the JS bundle. Does **not** build anything |
| `npx expo run:ios` | Xcode + CocoaPods + a signing certificate | compiles and installs the native app, then starts Metro |
| `eas build` | an Expo account | builds for testers and the App Store |

**The first two are one flow, not alternatives.** `run:ios` produces the app on
the device or simulator; `expo start` feeds it JavaScript. You need `run:ios`
once per native change (a new native dependency, an `app.json` change) and
`expo start` every time you sit down to work.

`run:ios` prebuilds — it generates the native project and resolves every entry in
`app.json`'s `plugins` before Xcode ever starts. Which leads to the one rule that
is easy to break:

**`plugins` may only list packages that actually ship a config plugin** — one
exporting `app.plugin.js`. That is not the same thing as a dependency, and most
dependencies are not one. Every entry in the current list is valid; you can check
any of them with `ls node_modules/<pkg>/app.plugin.js`.

### `PluginError: Unable to resolve a valid config plugin for …`

Almost always **stale `node_modules`**, not a bad `app.json`.

Prebuild resolves plugins out of `node_modules`, so a checkout whose packages
predate the config will report a perfectly valid plugin as invalid. The SDK 57
upgrade is the case that bites: `expo-status-bar` gained an `app.plugin.js` at
57.0.1 and is correctly listed in `plugins`, but at 3.0.9 (SDK 54) it had none.
Pull the new `app.json` without reinstalling and prebuild looks for a plugin in
the old package and does not find one:

```
PluginError: Unable to resolve a valid config plugin for expo-status-bar.
Error: Stripping types is currently unsupported for files under node_modules,
for ".../expo-status-bar/src/StatusBar.ts"
```

The fix:

```bash
rm -rf node_modules && npm ci --legacy-peer-deps
```

Two things make this hard to diagnose, which is why it is written down:

- **`rm -rf ios` does not help**, and it is the natural first instinct. That
  clears the generated native project while leaving the packages prebuild
  actually reads.
- **The second line is a red herring.** It sends people hunting through Node
  versions and TypeScript settings. It appears because the old package's `main`
  points at `src/StatusBar.ts` — Metro compiles that, Node never should — so a
  failed plugin lookup surfaces as a type-stripping error from deep inside Node
  rather than "this package is not a plugin". Changing Node does not fix it.

Only if a reinstall does not clear it is the entry itself wrong — then confirm
with `ls node_modules/<pkg>/app.plugin.js` before removing anything.

### `CommandError: No code signing certificates are available to use.`

**A simulator does not avoid this**, which is the surprising part. `app.json`
sets `ios.usesAppleSignIn: true`, producing the
`com.apple.developer.applesignin` entitlement, and Expo requires code signing
for any build carrying it — see `ENTITLEMENTS_THAT_REQUIRE_CODE_SIGNING` in
`@expo/cli/build/src/run/ios/codeSigning/simulatorCodeSigning.js`, which lists
that alongside `associated-domains`. So the accompanying line about "physical
iOS devices" is misleading: it prints even when the selected target is a
simulator, and switching targets will not help.

Check what you have. This is the exact command Expo runs
(`.../run/ios/codeSigning/Security.js`):

```bash
security find-identity -p codesigning -v
xcode-select -p     # must be inside Xcode.app, not CommandLineTools
```

`0 valid identities found` means there is no certificate. **Signing into Xcode
does not create one** — the account and the certificate are separate, which is
the second trap. Add the account under **Xcode → Settings → Accounts**, then
either:

- **Manage Certificates… → "+" → Apple Development**, or
- open the generated workspace, select the target → **Signing & Capabilities** →
  tick *Automatically manage signing* and set **Team**. This is the more reliable
  route on a free Apple ID, since personal teams provision on demand.

A free Apple ID is sufficient. No paid Developer Program membership is needed
until TestFlight.

#### Certificates exist but there are still 0 identities

An identity is a certificate **plus its private key**, unexpired, chaining to a
trusted root. If `security find-certificate -a -c "Apple Development"` shows
entries while `find-identity` shows none, one of those three is missing:

```bash
rm -f /tmp/devcert-*.pem
security find-certificate -a -c "Apple Development" -p | \
  awk '/-----BEGIN CERTIFICATE-----/{n++} n{print > ("/tmp/devcert-" n ".pem")}'
for f in /tmp/devcert-*.pem; do openssl x509 -in "$f" -noout -subject -enddate; done

security find-certificate -a -c "Apple Worldwide Developer Relations" | grep -c "alis"
```

`notAfter` in the past means expired. A WWDR count of `0` means the chain is
broken — install `AppleWWDRCAG3.cer` from
<https://www.apple.com/certificateauthority/>. Unexpired with WWDR present means
the private keys are gone and the certificates are unusable.

Expired and keyless are both fixed the same way, and stale certificates are why
Xcode's "+" can appear to do nothing: delete every **Apple Development** entry
in *Keychain Access → login → My Certificates*, then create a fresh one.

(Use the `awk` above rather than `csplit -z` — that flag is GNU-only and BSD
`csplit` on macOS rejects it.)

### The dev client opens on "Searching for development servers…"

**This is not a failure.** The native build succeeded and the app is installed —
that screen is `expo-dev-client` looking for a bundler that is not running.

```bash
npx expo start
```

from `eddy-ios/`, and the server appears in the list. If discovery does not find
it — a VPN or a locked-down network is usually the cause — tap **Enter URL
manually** and give it `http://localhost:8081` on a simulator, or
`http://<your-mac-lan-ip>:8081` on a device.

Worth internalising, because it is the step that looks like something went
wrong: `run:ios` builds the app, `expo start` serves the JavaScript. Finishing
the first without the second always lands here.

### `[runtime not ready]: ReferenceError: Property '…' doesn't exist`

Usually a **stale Metro cache**, and the reason it is confusing is that
reinstalling does not fix it: Metro caches transforms in `$TMPDIR`, which
`rm -rf node_modules` never touches. Any large dependency swap in place — an SDK
upgrade being the obvious one — can leave it serving transforms keyed to the old
module graph.

The error reads as a missing global but is not one. In Hermes,
`Property 'X' doesn't exist` is thrown for an undeclared **identifier**;
a genuinely missing global (`global.X`) evaluates to `undefined` silently. So the
bundle references a binding nothing declares, which means the emitted output and
the module graph disagree — a cache artifact, not a code bug. `MessageQueue` is a
common one to see, since React Native's bridge modules load early.

```bash
npx expo start --clear
```

If that is not enough, clear everything Metro keeps:

```bash
watchman watch-del-all 2>/dev/null
rm -rf "$TMPDIR"/metro-* "$TMPDIR"/haste-map-* node_modules/.cache .expo
npx expo start --clear
```

If it survives both, the installed binary and the JS bundle are genuinely from
different versions, and only a rebuild fixes that:

```bash
rm -rf ios && npx expo run:ios
```

Which of the three it is shows up in the error text: a **different** identifier
after clearing points at the cache (it is still being rebuilt); the **same** one
points at the native/JS mismatch.

### Node version

`.nvmrc` pins **Node 20**, matching what all five CI workflows use
(`.github/workflows/app-ci.yml`), and `package.json` declares
`engines: node >=20 <23`. Run `nvm use` in this directory.

This is drift prevention, not a fix for anything in particular — Node 22 LTS
works fine. The upper bound exists because Node 23+ strips TypeScript types by
default, which turns some Expo failures into internal Node errors that read as
unrelated to their real cause. The stale-`node_modules` case above is the
clearest example: the real problem is an out-of-date package, but what surfaces
is `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Pinning Node does not fix
that; it just keeps the error message honest more often.

## Why this is a monorepo without an npm workspace

Vercel builds the web app with **Root Directory = `missouri-float-planner/`**.
Adding a root `package.json` with workspaces changes how installs resolve there
— a real risk to a live deploy, for no benefit to the backend.

So instead of a workspace, the shared code is pulled in as **`file:`
dependencies**. npm symlinks each one into `node_modules`, so they resolve like
any other package and Vercel never sees them:

| Package | Points at | Holds |
|---|---|---|
| `@eddy/types` | `../packages/eddy-types` | API contracts shared with the backend |
| `@eddy/geo` | `../packages/eddy-geo` | Web Mercator tile maths for offline packs |
| `@eddy/offline` | `../packages/eddy-offline` | offline download planning and budget policy |
| `@eddy/sync` | `../packages/eddy-sync` | favourites reconciliation |
| `@eddy/hazards` | `../packages/eddy-hazards` | hazard classification |
| `@eddy/conditions` | `../missouri-float-planner/shared` | the canonical condition system |

`@eddy/conditions` is the odd one: it lives inside the **web app** rather than
`packages/`, because 38 files there import it through that app's own `@shared/*`
alias. Adding a `package.json` beside it lets this app consume the same file
without moving it or touching those imports.

`eddy-geo` and `eddy-offline` are shared rather than app-local for a specific
reason: they are pure, they hold the download-size *policy*, and they need tests.
The app has no test runner yet, so the alternative was re-implementing them
inside a web test — the duplicate-then-drift pattern this repo has already been
bitten by. They are covered by `src/lib/geo-tiles.test.ts` and
`src/lib/offline-plan.test.ts` in the web app, which imports them by relative
path. Their own imports are relative for the same reason: both Metro and the
web's plain `tsx` runner have to resolve them.

### These used to be path aliases. Do not put them back.

Until SDK 57 the same modules resolved through `metro.config.js` `watchFolders`
plus `tsconfig` `compilerOptions.paths`. That stopped working, and the way it
stopped is worth knowing before anyone reaches for an alias again:

- **Expo's tsconfig-paths emulation only matches wildcard patterns now.** `@/*`
  kept resolving; the exact mappings (`@eddy/types` and friends) were not even
  attempted — from a `tsconfig.json` that had not changed.
- **Metro's file map does not index files outside the project root during
  `expo export`**, whatever `watchFolders` says. Point a resolver at one and the
  bundle dies with `Failed to get the SHA-1 for .../packages/eddy-types/index.ts`.

The second is the dangerous one: `expo start` indexes those files fine, so the
**dev server works and every production bundle fails** — including every EAS
build. `watchFolders` is still set, but only so edits to the shared code
hot-reload; nothing resolves through it.

### What this costs on EAS, and why it works anyway

Reaching outside the project directory is the thing that usually breaks a
non-workspace monorepo on EAS, so it is worth stating what actually happens.

`eas build` does **not** archive the Expo project directory. It clones from
`git rev-parse --show-toplevel` (`eas-cli/build/vcs/clients/git.js`,
`makeShallowCopyAsync`), so the repository root is the archive root and
`packages/` + `missouri-float-planner/shared/` arrive on the worker — which is
exactly what the `file:` dependencies need, since `npm ci` resolves them from
disk. Verified end to end against a copy of the real archive: `npm ci` then
`npx expo export --platform ios` both succeed.

The cost is that the archive is the whole repo: 87 MB, mostly Remotion audio and
blog imagery the app never touches. `/.easignore` trims it to 3 MB.

**`.easignore` replaces `.gitignore` entirely** — when the file exists, eas-cli
stops reading `.gitignore` (`eas-cli/build/vcs/local.js`), so every ignored path
is uploaded unless re-stated, `.env` included. That is why it is written as an
allowlist rather than a denylist, and why it has a test:

```bash
python3 eddy-ios/scripts/check-easignore.py
```

which asserts every Metro-resolved path is still in the archive and that no
secret or media file has crept in. Run it after touching `.easignore`, the
`file:` dependencies in `package.json`, or `metro.config.js` watchFolders.

**Do not add `nodeModulesPaths` or `disableHierarchicalLookup` to
`metro.config.js`.** Those appear in every workspace-monorepo guide and are
wrong here: this project has a single `node_modules` and npm nests some
transitive dependencies (`expo-asset` under `node_modules/expo/`). Disabling
hierarchical lookup makes Metro refuse to look inside them and the bundle fails
with `Unable to resolve module expo-asset`.

## Theming

Light and dark, following the system setting (`useColorScheme`). `DESIGN.md` is a
light, desktop-first web system; its neutral scale also names the dark-mode
surfaces, so both palettes come from the document rather than one being an
inversion of the other.

**The rule that makes it work:** `StyleSheet.create` runs ONCE at module import,
so a colour written into a StyleSheet is frozen at whichever scheme the app
launched with. The convention is therefore a split:

- `StyleSheet.create` — layout, spacing, radii, type. **Never colour.**
- inline `style` props — colour, from `useTheme()`.

`src/lib/app-theme.test.ts` in the web app enforces this, along with both
palettes defining every semantic role (a missing key renders as a transparent
label on one scheme only, which is easy to miss).

### Translating, not transcribing

`DESIGN.md`'s signature is a hard-edged offset shadow (`3px 3px 0 #A49C8E`,
never blurred) with a hover lift. That is a web idiom — it reads as an
affectation on iOS and pairs with a hover state touch does not have. So the
brand's *structure* carries over (cards stay distinct, bordered objects) while
depth is retranslated in `elevation()`: soft downward shadow on light, border
weight on dark, where a shadow against near-black is invisible anyway.

Fredoka, Geist and Geist Mono carry over unchanged. Mono for gauge readings is
functional, not decorative: proportional digits change width as a number ticks,
so a reading going from `1.51 ft` to `1.62 ft` shifts the whole row.

**Import fonts from the weight subpath** (`@expo-google-fonts/geist/400Regular`),
never the package root. Each package's index re-exports every weight it ships and
Metro bundles what is reachable — the root import put ~8 MB of TTFs in the export
for the eight faces actually used.

### Eddy the Otter

`CONDITION_SYSTEM` assigns every condition an `otter` mood, so which otter to
show is already a decision the canonical system has made — `src/components/Otter.tsx`
just draws it. The source art in `remotion/public/eddy` is video resolution
(~700 KB each); `assets/otter/` holds 300px copies, which took the set from
4.58 MB to 193 KB.

## Condition colours and labels

Import them from `@eddy/conditions` via `src/theme/conditions.ts`. Never
hardcode condition hex — that file says so explicitly, and an earlier version of
this app ignored it and immediately drifted (`#DC2626` here vs the canonical
`#ef4444`), so the app showed different colours than the website for the same
river.

Two severity orderings exist and **must not be conflated**:

- `CONDITION_SYSTEM[code].severity` — most-alarming-first, for alerts
- `WEEKEND_SEVERITY` — floatable-first, for "where can I go" lists

River Reports uses the second. Public "floatable now" counts use `FLOATABLE_NOW`
(strictly `flowing`/`good`), which is narrower than `WEEKEND_FLOATABLE`.

## Maps (Mapbox)

`@rnmapbox/maps` is a **native module**, so from here on the Map tab needs a
development build — Expo Go cannot load it. The other three tabs still work in
Expo Go: the map is reached through a lazy `require` in `src/map/runtime.ts` and
the tab shows an explanatory panel instead of crashing the bundle.

One environment variable is needed:

```bash
echo 'EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_public_token' > .env   # gitignored
```

`EXPO_PUBLIC_` is deliberate. A Mapbox `pk.` token is public by design and ships
inside every app binary regardless of where you put it — protect it with URL and
scope restrictions in the Mapbox dashboard, not by hiding it. For EAS builds set
it as an environment variable per environment (`eas env:create`); `eas.json`
declares `environment` on each profile so builds pick up the right set.

**You do not need a secret `sk.` download token.** Most guides still tell you to
create one and pass `RNMapboxMapsDownloadToken` to the config plugin. That prop is
deprecated — the plugin's own types say "Download token is no longer required by
Mapbox. Do not set this."

Do not pin `RNMapboxMapsVersion` unless you have a reason. `@rnmapbox/maps` 10.3.5
pins Mapbox iOS `~> 11.23.1` in its own `package.json`, and overriding it with a
lower version silently builds against an SDK the library is not tested on.

### Why downloads follow the river instead of its bounding box

A river's bounding box is a rectangle; a river is a line. Measured against the
real Current River geometry (632 points):

| Zoom | Plain bounding box | Corridor (10 boxes) |
|---|---|---|
| z8–12 | 286 tiles (~10 MB) | 187 (~6 MB) |
| z8–14 | 3,919 (~134 MB) | 1,237 (~42 MB) |
| z8–15 | 15,511 (~530 MB) | 4,079 (~139 MB) |

So the shipped setting is **z8–14 along the corridor, ~42 MB per river**.

Two hard limits shape that. Mapbox's default ceiling is **6,000 offline tiles per
device**, and `setTileCountLimit`'s own documentation says the Mapbox Terms of
Service prohibit raising it without permission. At z14 that is roughly four
rivers stored at once, which the UI has to handle by asking someone to remove a
river. At z15 a *single* river would consume two thirds of the entire device
allowance — which is the second, decisive reason `MAX_ZOOM` is 14.

## Builds (EAS)

`eas.json` defines three profiles. `eas init` has been run — `app.json` carries
an `extra.eas.projectId` — so building only needs an Expo login:

```bash
npm install -g eas-cli
eas login
```

| Profile | Use |
|---|---|
| `development` | dev client for native modules; Expo Go cannot run those |
| `preview` | internal distribution for testers |
| `production` | App Store; `autoIncrement` bumps the build number |

Two notes:

- A development build is now **required for the Map tab**, since `@rnmapbox/maps`
  is a native module (`eas build --profile development --platform ios`). Expo Go
  still runs everything else.
- **The `development` profile needs no Apple Developer account.** It sets
  `ios.simulator: true`, and a simulator build is signed ad-hoc rather than with
  a provisioning profile — so the native modules, the icon, the splash and the
  Map tab can all be exercised before enrolment completes. Everything that
  installs on a physical device (`preview`, `production`, TestFlight) does need
  the account.
- `submit.production` is empty until the App Store Connect app record exists and
  can supply an `ascAppId`.
- **The bundle identifier is `eddy.guide.app`**, which is the domain in forward
  order rather than the reverse-DNS `guide.eddy.app` the convention implies.
  That is deliberate — it is what is registered with Apple, and a bundle ID is
  immutable once a build ships. Nothing resolves it as a hostname and Apple
  never checks it against a domain, so the difference is cosmetic. Universal
  links are unaffected: those are keyed on `TEAMID.eddy.guide.app` in the
  `apple-app-site-association` file, not on the identifier's shape.

## Icons and splash

Generated from the Eddy favicon artwork, not hand-exported:

```bash
python3 eddy-ios/scripts/build-icons.py    # needs Pillow
```

Light appearance is white, matching the website's favicon so the mark reads the
same in the App Store listing as it does in a browser tab. iOS 18's dark and
tinted variants are generated alongside it and wired through `ios.icon` — dark
is Deep River Teal rather than black, because the otter's outline is near-black
itself and dissolves into a black field.

The rule that bites: **the App Store icon must have no alpha channel.** Apple
rejects it at upload rather than at review, so `icon.png` is flattened while the
splash and tinted assets keep their alpha (the OS composites those itself).

## Current state

| Tab | Status |
|---|---|
| Map | **live** in a dev build — Mapbox, condition-coloured river, offline packs |
| River Reports | **live** against `/api/rivers` |
| Alerts | **live** against `/api/alerts` |
| Favorites | **live**, local-first via AsyncStorage; server sync pending |
| Profile | **live** — Sign in with Apple, subscription state, Restore Purchases, account deletion |

Remote config and the forced-upgrade gate are wired (`/api/app-config`), and both
fail open: an unreachable config means no upgrade requirement and all features
enabled.

## Accounts, purchases and deletion

The identity model is anonymous-first and upgrades in place. `signInWithIdToken`
against an existing anonymous session links Apple to that SAME user id, so stars
collected before converting are already the new account's — nothing is migrated,
because nothing moved.

Three things about it are load-bearing rather than stylistic:

- **The session lives in the Keychain**, not AsyncStorage. RevenueCat is keyed on
  the Supabase user id, so losing the session loses the entitlement — the app
  would take a fresh anonymous identity and a paying subscriber's subscription
  would vanish. Keychain survives reinstall and is encrypted at rest. It also
  needs chunking, because a Supabase session exceeds expo-secure-store's
  2048-byte limit; that logic is in `src/lib/chunked-store.ts` and covered by
  `src/lib/chunked-store.test.ts` in the web app.
- **RevenueCat is never configured with an anonymous id.** An entitlement bought
  under one is stranded the moment the id is replaced. `configurePurchases()`
  refuses outright rather than trusting callers to check.
- **Apple returns the user's real name exactly once**, on the first
  authorisation for that Apple ID, and never again — not on reinstall. It is
  persisted immediately in `signInWithApple` for that reason.

### The purchase flow

The paywall is contextual — it appears when `/api/me/alert-subscriptions`
returns 402, i.e. at the moment someone asked to be told about a river. Three
things about how it runs:

- **Sign-in is not a step you can skip past.** The purchase controls do not
  render until there is a permanent user, because RevenueCat keys on the
  Supabase user id and a purchase made under an anonymous one is stranded by
  the next reinstall.
- **Prices are never constructed.** `priceString` comes from StoreKit already
  localised. Storefronts differ in currency, symbol placement and separator,
  and Apple charges what it says rather than what we format.
- **A completed purchase does not mean the server knows.** The entitlement
  arrives through RevenueCat's webhook, so `waitForEntitlement` polls
  `/api/me/profile` before anything claims success. On timeout the app says the
  purchase went through and may take a moment — never that it failed, because
  the money moved and Apple has the receipt.

After the entitlement lands, `onPurchased` finishes what the user originally
tapped: the alert subscription they wanted is created. That retry deliberately
does NOT re-open the paywall if it fails — bouncing someone back into the wall
they just paid to escape is the worst possible moment to ask again.

**Account deletion cannot be left to the FK cascade.** `float_plans.user_id` is
`ON DELETE SET NULL`, and float_plans treats a NULL `user_id` as the anonymous,
world-readable tier — so cascading would PUBLISH a deleted user's saved floats
instead of removing them. `src/lib/account-deletion.ts` in the web app deletes
them explicitly, before the auth user, and a test fails if that is ever removed.

Three controls here exist because App Review requires them: Sign in with Apple,
Restore Purchases (3.1.1), and in-app account deletion (5.1.1(v)). The auto-renew
disclosure sits with the subscription controls rather than behind a link, for the
same reason.

## Push

The backend was built first — outbox, `deliver-push` cron every 5 minutes,
`/api/me/device-tokens` — so the client's whole job is to acquire a token, hand
it over, and route a tap. Three things shape how it does that.

**The iOS permission prompt is a one-shot resource.** It shows once per install;
a denial is permanent, and the app can then only send someone to Settings, which
almost nobody does. So nothing calls `requestPermissionsAsync()` on its own.
`PushPrimer` explains what will arrive first, and declining THERE leaves the real
permission untouched so the app can ask again at a better moment.

**It is spent at the best moment available**, which is not first launch. The
primer appears once an alert subscription actually exists — the user has asked
to be told about a specific river and there is a concrete notification waiting
to be delivered. That is the strongest case this app will ever have.

**`getExpoPushTokenAsync` needs `projectId`.** Without it the call throws about
being unable to determine the project, and only in a real build — it is never
reached on a simulator, where `Device.isDevice` is false. It comes from the same
`extra.eas.projectId` that `eas init` wrote.

Registration requires a signed-in account, because push identity is purchase
identity: the route and the RLS policy in migration `00183` both enforce it.
Signing out and deleting an account each unregister first, while the token can
still authenticate.

Profile reports OS state rather than mirroring it in a switch — iOS owns the
permission, and a second source of truth can only disagree with Settings. The
sentence explaining why alerts will or will not arrive is a precedence order
(`src/lib/notificationCopy.ts`), tested in the web app: several reasons can be
true at once, and naming the wrong one sends someone to fix something that was
never the problem.
