---
name: eddy-ios-feature
description: Implement or fix Eddy iOS features with scoped behavior contracts, caller tracing, regression tests, self-review, and an honest device-QA handoff.
---

# Implementing an Eddy iOS feature or bug fix

Use for iOS implementation requests; combine with `eddy-ios-ui` for screen or interaction changes. For review-only requests use `eddy-review`; for release readiness use `eddy-ios-release-prep`. This skill does not supersede either.

## 1. Establish the real behavior

- Read the root `CLAUDE.md`, `eddy-ios/AGENTS.md`, and only the relevant `eddy-ios/README.md` sections routed there. Trace the current screen, state owner, server contract, callers, and navigation entry/exit paths before editing.
- Restate the requested user-visible outcome and the smallest scope. Distinguish a reproducible failure from a suspicion. Check whether the existing component or hook already solves part of it.
- Write a short behavior contract covering normal use, return/back navigation, loading/empty/error, offline/stale data, permissions, and repeated taps where they apply. For Float Mode, include foreground/background transitions and data preservation when relevant.
- Identify compatibility with existing installed iOS binaries if API fields or routes change. A new API dependency may need server-first deployment; a breaking API change needs an explicit compatibility plan.

## 2. Implement the smallest cohesive change

- Reuse current Eddy components, theme tokens, typed routes, condition semantics, and shared logic. Do not add a new dependency or state owner just to fix local layout.
- Do not dynamically toggle a modal header in a way that remounts its screen or loses state. Guard duplicate navigation/submission when a second tap could open another sheet or start a second action.
- Keep location permission flow predictable: use already-granted access without a redundant prompt, and provide a clear fallback when permission or data is missing.
- Do not change native dependencies, config plugins, permissions, background modes, or local Swift modules without explicitly noting the new-binary requirement. Never treat a Metro reload or OTA update as proof of native compatibility.
- Never alter production data, deploy, apply migrations, change feature flags, or publish EAS builds or updates without explicit authorization. Prefer dry runs; keep release decisions in the existing runbook.

## 3. Validate behavior, not just compilation

- Add or update a test for a mechanically reproducible bug. Pure iOS logic lives in the web test suite under `missouri-float-planner/src/lib/`; register any new test file in `missouri-float-planner/package.json` as the root guide requires.
- For changed iOS code, run the path-specific checks in the root `CLAUDE.md`: `make check-mobile`, `make bundle-mobile`, and `make check-web`. For a mixed change run the union of its required checks. If unavailable, say *not run*, never *passed*.
- Run a user-journey check for each changed path: entry, primary action, error/fallback, return navigation, and the old behavior that must keep working. If only source review was possible, label device behavior unverified.
- Classify whether JS Fast Refresh in an installed development client suffices, or a native `make run-ios` rebuild and physical-device verification are needed; read `eddy-ios/README.md` *Running it* first.

## 4. Self-review before handoff

- Review the diff against the behavior contract and actual callers. Look for state loss, duplicate actions, stale cached values, unintended side effects, old-binary API breakage, and changes outside requested scope.
- Separate blocking fixes from optional polish. Ensure loading/error states are honest and safety-related river information remains available without Premium.
- Report: implemented behavior; files changed; checks actually run (with results); unverified simulator/device steps; and whether a new binary, migration, or release action is required.
- Do not claim implemented work is device-verified or released without evidence. Do not commit/push or modify production unless the user requested that action.
