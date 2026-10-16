---
name: eddy-ios-release-prep
description: Prepare an Eddy iOS release for TestFlight or App Store submission — establish the version and baseline, measure the delta and whether the native fingerprint moved, run the checks, collect every open gate, and write the readiness report and runbook update. Read-only toward production and Apple/EAS by default. Use when asked to prep, assess, or check readiness for an iOS release, a TestFlight build, or a version bump.
---

# Preparing an Eddy iOS release

The procedure lives in `docs/ios-release-runbook.md` (start at *Current
release*, then *The order matters*). This skill is how to assess a release
against it and leave a record; it does not replace it. If they disagree, the
runbook wins and this skill should be corrected.

## Boundaries

Without explicit authorization in this conversation, do **not**: run
`make build-ios`, `make testflight`, `eas build`, `eas submit` or
`eas update`; change App Store Connect, EAS, RevenueCat, Vercel or Supabase
settings; apply migrations; flip server flags (`floatMode`, `app_config`).
Production reads, when authorized, are read-only; record each one with its
date in the report. The output of this skill is documents and a list of what
a person must do.

## 1. Establish the release

- Version in progress: `expo.version` in `eddy-ios/app.json`.
- What the runbook says is live and in progress, and when that was confirmed.
  The live store version is a fact about App Store Connect: if nobody has
  confirmed it, the report says "unconfirmed" and asks.
- Baseline: the **Git SHA the shipped build was made from**, not the commit
  that bumped the version — more work can land between the bump and the
  build. The repo has no release tags; the SHA is on the EAS build record
  (`gitCommitHash`, e.g. `eas build:list --platform ios --status finished`,
  matched to the build number App Store Connect shows as live). That is a
  read-only call but needs EAS access; run it only where the person has
  authorized it. If the SHA is not available, use the version-bump commit
  (`git log -S'"version": "1.2.0"' -- eddy-ios/app.json`) as a stand-in and
  label the baseline **unconfirmed** in the report, with what it might miss.
- If the clone is shallow (`git rev-parse --is-shallow-repository`), deepen
  it first; a delta measured from a truncated history is wrong.
- The previous readiness report, `docs/release-readiness-<x.y>.md`: its open
  gates carry forward until someone records them closed.

## 2. Measure the delta

From baseline to the release commit: commits and merged PRs; files changed
in `eddy-ios/`, `missouri-float-planner/shared/`, `packages/`; API routes
added or changed under `missouri-float-planner/src/app/api/`; migrations
added.

**Did the native fingerprint move?** Two separate steps, reported
separately:

1. *Candidates, from the diff.* Native-relevant changes since the baseline in
   `eddy-ios/app.json`, `eddy-ios/package.json`, `eddy-ios/package-lock.json`,
   `eddy-ios/metro.config.js`, `.easignore`, `eddy-ios/modules/` (local native
   modules) and `eddy-ios/plugins/` (local config plugins, e.g.
   `withFloatActivity.js`). This says what *could* move the fingerprint; it
   is not proof that it did or did not.
2. *The fingerprint itself.* From `eddy-ios/`, run
   `npx expo-updates fingerprint:generate --platform ios` at the release
   commit and at the baseline (a `git worktree` with its own `npm ci`), and
   compare the `hash`. Use this command, not bare `@expo/fingerprint`, which
   hashes differently from the runtime version. The EAS build record's
   `runtimeVersion` is an equivalent source for the shipped side. If neither
   comparison was made, say the fingerprint is **unconfirmed** and treat the
   candidates as the reason to cut a build.

- Moved: a new binary is required; an EAS Update cannot deliver it.
- Unchanged (computed, not inferred): an EAS Update to `production` would
  reach binaries already in the store under the old version string. Say so;
  cut a build.

**Server compatibility, in both directions.**

- *New binary, old server:* every route or response field the new binary
  needs that production lacks makes "deploy web before the build is
  distributed" a gate.
- *Old binaries, new server:* every field or route removed, renamed, or
  changed in meaning since the baseline breaks binaries already installed,
  whatever the deploy order. Each needs the compatibility kept (old shape
  still served) or an explicit migration strategy (`min_supported_version`
  forced upgrade, versioned route), recorded as a gate.

## 3. Run the checks

`./bootstrap.sh`, then `make check` on Node 20 (includes `bundle-mobile` and
the `.easignore` check). `make check-db` and `make check-eas-env` need
credentials; run them only where the person's environment has them, and
otherwise list them under *What was not verified*.

## 4. Collect the gates

Gather every unticked item from the runbook's sections for this version and
the ones carried from earlier versions, the "Prove on a device" lists in
ADRs touched by the delta (e.g. ADR 0011 for River Mode), and the previous
report's open gates. Sort each into:

1. **Before the build is distributed** (deploy order, universal links,
   `min_supported_version`, migration ledger, new binary vs update).
2. **Before App Store submission** (device passes, Trust Ledger criticals,
   reviewer notes, privacy labels, flags a reviewer must see working).
3. **Not blockers, but expected reports** (known upstream lag, open product
   questions).

Never tick a gate without evidence, and never infer one closed because a
later version shipped. An unticked gate means "unconfirmed", not "not done".
For each feature in the delta, state it as **implemented / device-verified /
released** separately.

## 5. Write the record

- **`docs/release-readiness-<x.y>.md`**, modeled on
  `docs/release-readiness-1.2.md`: verdict in two sentences; the delta in
  numbers; the fingerprint finding; what ships, grouped by area; the gates in
  the three groups above; and **What was not verified**, which is mandatory
  and specific (every check skipped, every dashboard not opened, every
  production read made and that it was read-only).
- **`docs/ios-release-runbook.md`**: update *Current release* (the
  `app.json` line is enforced by `ios-release-runbook.test.ts`; the store
  line needs a date and a source), point it at the new report, and add a
  section for this version's gates if the delta created new ones.
- Run `make check-web` after editing the runbook.

## 6. Hand off

End with: the verdict; the person-only actions in order (dashboards,
deploys, device passes, the build itself); and what this pass could not
verify. Do not summarize the report back in full — link it.
