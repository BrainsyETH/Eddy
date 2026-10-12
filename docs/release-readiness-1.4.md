# Eddy 1.4 — release readiness

**Checked:** October 12, 2026 UTC (October 11 in Chicago).
**Candidate:** PR [#1488](https://github.com/BrainsyETH/Eddy/pull/1488),
`codex/float-history-and-backup`, based on main `b62af5a2`.

**Verdict: ready to continue release preparation, not ready for App Store submission.**
The feature PR has passing CI, but production lacks its database/API/policy,
Float Mode is disabled for production builds, and the native/device/privacy
verification below has not been completed.

## Release identity and measured delta

`app.json` is **1.4.0**. The live App Store version, build number and shipped
Git SHA are **unconfirmed**; App Store Connect/EAS were not authenticated here.
Before building, match the live build number to EAS `gitCommitHash` and
`runtimeVersion`, and confirm 1.4.0 is a valid next version.

For sizing only, the comparison below uses the **unconfirmed stand-in**
`7a7ad0995c7a0d2a4d48ebc32d0b522f8a3397e6` (September 25 commit setting 1.3.0)
to `56dfc4f2` (feature PR before this readiness follow-up). It is not the
shipped-build SHA; changes between that commit and the actual build could make
these counts overstate or understate the release. The checkout was unshallowed
before measuring.

| Area | Delta |
| --- | --- |
| History | 404 commits, including 144 merge commits |
| Whole repository | 1,110 files; +80,073 / −29,208 lines |
| iOS | 351 files; +23,460 / −7,288 lines |
| Shared code and packages | 38 files; +4,048 / −75 lines |
| API tree | 53 files touched |
| Migrations | 19 added; 21 files touched |

Native-change candidates include `app.json`, manifests/lockfile, `.easignore`,
the Live Activity extension/plugin, offline-map, map-sheet, orientation and link
modules, `expo-network`, slider and browser dependencies. Current iOS fingerprint
computed using `npx expo-updates fingerprint:generate --platform ios`:
`7b61aec836fa9b7dcdff6facd3b7f2a0d50d1809`.
**Comparison to the shipped fingerprint is unconfirmed**: neither its EAS record
nor a baseline fingerprint was available. Cut a new binary; do not publish this
release as an OTA update. The JS bundle check is not a native compilation check.

## What is in scope

| Area | Implemented | Device verified | Released |
| --- | --- | --- | --- |
| Float Mode, offline downloads, reminders, hazard queue, Live Activity | On main | Unconfirmed | Unconfirmed; production Float Mode flag off |
| Floats/start-flow refresh, camping/weather, in-app browser | On main | Unconfirmed | Unconfirmed |
| Recap/history, saved-route and recap backup, optional contributions | PR #1488; not merged | Unconfirmed | New API and tables absent |
| Moving-speed separation and updated privacy/disclosures | PR #1488; not merged | Unconfirmed | Live policy still October 6 |

Contributions are account linked, default off, and independent of backup. No
public estimate calibration ships. This follow-up removes account-ID prefixes
from sign-in diagnostics, redacts dashed UUIDs, and corrects the claim that
Sentry events lack identifiers: the installed native SDK supplies an installation
ID. Crash/other diagnostics and Device ID must be disclosed accordingly.

## Before distribution

1. **Approve and apply the reviewed archive migration to the intended project.**
   `20261012000204_float_archive.sql` creates private summary/preferences tables,
   owner-read RLS, service-only write/consent functions and account-deletion
   cascades. Local database tests cover consent, isolation and deletion. Production
   project `ilefwfpvphadsbptiaur` has neither table as of this check. Review a CLI
   dry run; preserve the actual recorded version in the filename/ledger and run
   `make check-db`. Do not apply unrelated pending migrations blindly.
2. **Merge/deploy the additive API and policy before giving testers this build.**
   Production `/api/me/float-archive` returns 404. An unauthenticated 401 after
   deployment proves routing only: also test a disposable Apple account's read,
   write, delete, consent and restore paths. Publish the matching `/privacy` page.
3. **Check compatibility in both directions.** PR #1488 preserves existing
   `/api/plan` fields and adds `movingSpeedMph`; older servers leave the new field
   absent and cannot provide backup. Existing clients do not call the new archive
   API. `/api/me` deletion keeps its existing result and adds revocation status.
   Smoke-test the actual store binary against the deployed server as well as the
   new one; the entire 53-file API delta has not been exercised against a shipped
   binary in this pass.
4. **Confirm signing, environment and native archive.** Run `make check-eas-env`
   in the authenticated release environment; verify Mapbox, Supabase, RevenueCat
   and Sentry configuration. Build through the runbook's make targets. Confirm
   host/Live Activity extension versions match and inspect the final archive's
   privacy manifests, SDK signatures and required-reason API declarations.
5. **Confirm links and version gate.** Public config returned
   `minSupportedVersion: "0.0.0"`. The association file returned 200 JSON with
   `D4U38CY2HK.eddy.guide.app`. Still verify a tapped plan link on a fresh install;
   these HTTP reads do not prove Apple's cached association or installed behavior.

## Before App Store submission

1. **Run the focused TestFlight pass on the exact production-profile build.**
   Guest float → end/recap → Apple sign-in → backup → second device/reinstall →
   restore; saved-route recovery; offline trip deletion and stale second device;
   account deletion during an active float/pending sync; sharing off → on → new
   trip → off, including offline withdrawal. Inspect only synthetic test data.
2. **Validate location and measurements on physical iPhones.** Cover Always,
   While Using, Allow Once, denied and Precise off; lock for an hour with no
   service; stop/move/GPS gap/relaunch/end; a long float exceeding the sample cap;
   correct missing-water/unknown-time copy. Record battery use, actual intervals
   and native Live Activity behavior. Follow ADR 0011's offline-map proofs and
   `float-live-activity-plan.md`'s device matrix, including an older iPhone.
3. **Make the feature accessible to the reviewer.** Production config currently
   returns `floatMode: false`. After acceptance, enable it for the release and
   verify from a production-profile cold launch. Preview builds bypass this flag.
   Use the exact steps in `app-privacy-labels.md`; attach a real field recording
   to explain river-only behavior. Backup/contributions require Apple sign-in:
   do not say the entire app can be reviewed without authentication.
4. **Finish the privacy questionnaire and reviewer notes.** Publish precise
   location as collected/linked for functionality and Analytics where contributed;
   include linked installation diagnostics/device identifiers and support content.
   Resolve coarse-location linkage against hosting/weather/Sentry payloads. Inspect
   both a JS error and native crash plus release-health/network events from the
   actual binary. Verify the published policy and settings agree. Own-product
   improvement is not by itself Apple's advertising/data-broker tracking; the
   inspected feature adds no ATT requirement.
5. **Prove account deletion and purchases.** Guest deletion, Apple code storage
   (`stored: true`), Apple revocation (`revoked`, or durable retry that completes),
   manual identity linking, Hide My Email, restore and StoreKit sandbox purchase.
   Confirm current RevenueCat offering and subscription review access. Account
   deletion must remove the private archive and local pending data, not merely
   sign out. Do not disrupt production credentials to test retries.
6. **Close carried gates with evidence.** The Trust Ledger Jacks Fork threshold
   critical remains open (last seen October 12, 01:00 UTC); data judgement is
   still needed. Earlier Courtois, chart scrub/VoiceOver, Phase 5 UI, camping,
   offline saved details, weather, browser handoff, SDK/service/dashboard and
   map-download checks remain in `ios-release-runbook.md` and the 1.2 report.
   A later version number does not confirm them. Finish screenshots, URLs, age
   rating and upload validation for the actual submitted build.

## Expected reports, not automatic submission blockers

- Historical water can be unavailable: earlier read-only sampling found one
  station stopped in July. Missing observations must stay missing.
- Preview and production feature visibility differ by design. Do not infer store
  behavior from an internal preview screenshot.
- Public `latestVersion` remains `0.1.0`; the force-upgrade field is `0.0.0`.
  Reconcile marketing metadata after confirming the live release.
- Contribution review is private. Small or unrepresentative samples do not
  automatically change estimates or support crowd forecasting.

## Validation and what was not verified

At `56dfc4f2`, GitHub App CI and Remotion Check succeeded, and Vercel's preview
deployment was Ready. Prior local verification passed 3,592 registered tests,
web/mobile typechecking and lint, and the production iOS bundle/archive allowlist.
This follow-up passed **3,593 registered tests**, web typechecking/ESLint and
Tailwind checks, `make check-mobile`, and `make bundle-mobile` including the
600-file / 12.34 MB archive allowlist. Existing lint warnings remain.
`make check` stopped at the sandbox's `tsx` Unix-socket restriction (EPERM);
the same registered test list and token check then passed through
`node --import tsx` (tests with `TSX_TSCONFIG_PATH=tsconfig.test.json`).
Bootstrap ran on Node 20.20.2. No dependency or lockfile change was needed.

No native archive, physical device, simulator, TestFlight, App Store Connect,
RevenueCat, EAS build record, EAS environment parity or provider diagnostic/log
retention settings were inspected. There is no authenticated Expo session here.
`make check-db` requires linked CLI credentials unavailable here; a connector
read does not replace it. No production write, build, submission or flag change
was made. Current App Store version/labels and the shipped fingerprint remain
unconfirmed, as does whole-release compatibility with that binary.

Production reads on October 12 were **read-only**: `/api/app-config`, `/privacy`,
`/.well-known/apple-app-site-association`, unauthenticated `/api/me/float-archive`;
database table existence, migration history from October 11 onward and unresolved
critical/named Trust Ledger findings. No account or trip records were retrieved.

Apple sources checked: [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[App Privacy details](https://developer.apple.com/app-store/app-privacy-details/),
[account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion),
[SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/).
The checklist reduces known review risks; only Apple can make the approval decision.
