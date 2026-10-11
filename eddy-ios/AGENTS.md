# eddy-ios — agent entry point

The Expo iOS app. It consumes `missouri-float-planner/` as a headless API and
shares code through `file:` dependencies. Read the root
[`CLAUDE.md`](../CLAUDE.md) first for the repository map and hard
constraints; this file only routes iOS work. `CLAUDE.md` in this directory
imports this file, so edit only this one.

[`README.md`](README.md) is the authoritative dev guide but is long. Read the
sections for the task, not all of it.

## Rules that break builds

- Run commands from inside `eddy-ios/`, on Node 20 (`.nvmrc`). Never
  `--legacy-peer-deps`: it removes shipped native packages.
- Code at module scope runs before the splash lifts. Read README *Launch path*
  before adding any.
- A new native dependency, plugin or `app.json` permission changes the runtime
  fingerprint: it needs a new binary, never an OTA update.
- Never edit `.easignore` without reading its header and running
  `python3 scripts/check-easignore.py` afterwards.

## Validate

From the repository root: `make check-mobile` + `make bundle-mobile` +
`make check-web`. There is no iOS test runner: pure iOS logic is tested from
`missouri-float-planner/src/lib/*.test.ts` (keep it React- and native-free so
it can be), and each new test file must be added to that package's `test`
script.

## Where to read, by task

| Task | Read |
| --- | --- |
| Setup, dev client vs Expo Go, build errors | README *Running it*, *Three ways to run this* |
| Why no workspace, `@eddy/*` packages | README *Why this is a monorepo without an npm workspace*; `docs/decisions/0001`–`0003` |
| Colors, type, brand, CTAs | README *Theming*, *Condition colours and labels*; `docs/decisions/0007` |
| Map, search, layers, the plan sheet | README *Maps (Mapbox)*, *Search, layers, and the float plan*; `docs/decisions/0008` |
| Adding a screen or route | README *Adding a screen, and the generated route types* |
| Float Mode, trip downloads, Live Activity | README *Current state*; `docs/decisions/0011-float-mode-offline-maps-use-tile-regions.md`; `docs/float-live-activity-plan.md` |
| Alerts and push | README *Push*; `docs/decisions/0005`, `0006` |
| Purchases, accounts, entitlement | README *Accounts, purchases and deletion* |
| Splash hangs, launch crashes | README *Launch path*, *Diagnosing a launch that stops at the splash* |
| Builds, TestFlight, App Store | `docs/ios-release-runbook.md` (start at *Current release*) |

## Reading current state

Decisions in `docs/decisions/` are current unless their status says
otherwise. Other files in `docs/` (`ios-ux-phase-*`, audits, reviews) are
plans and point-in-time reports: check them against the code before acting.

Keep three states apart when describing a feature: **implemented** (in code
on `main`), **device-verified** (its runbook or ADR gate is ticked), and
**released** (in a store build, and on if it is behind a server flag). The
code proves only the first.

When a change alters a lasting rule or product decision, update the document
that owns it in the same PR.
