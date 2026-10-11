---
name: eddy-review
description: Review an Eddy branch or pull request before merge — run the validation its changed paths require and check the repo-specific ways an Eddy change goes wrong (test registration, field binaries and the API, migrations ledger, .easignore, native fingerprint, docs that own a decision). Use when asked to review a branch, a PR, a diff, or "is this ready to merge".
---

# Reviewing an Eddy branch or PR

The repository guide is `CLAUDE.md` at the root; this skill assumes it and
does not repeat it. Where a rule below has an authoritative home, it links
there. If the two disagree, the linked document wins and this skill is wrong:
say so in the review.

Review only. Do not push fixes, post on GitHub, or touch production unless
the person asked for that in this conversation.

## 1. Establish the diff

```bash
git fetch origin main
git diff --stat origin/main...HEAD      # or the PR's base...head
git log --oneline origin/main..HEAD
```

A shallow clone can make `origin/main...HEAD` fail or lie; deepen it
(`git fetch --deepen=200 origin main`) rather than reviewing a partial range.
Read the PR description and linked issue if there is one: a review checks
the change against what it claims to do.

## 2. Run the validation the paths require

Run `./bootstrap.sh` first if dependencies or Node 20 are missing. Then map
every changed path to the **Validate with** column of the task-routing table
in `CLAUDE.md` and run the union. In practice:

| Changed | Run |
| --- | --- |
| `missouri-float-planner/**` | `make check-web` |
| `eddy-ios/**` | `make check-mobile` + `make bundle-mobile` + `make check-web` |
| `missouri-float-planner/shared/**`, `packages/**` | `make check-web` + `make bundle-mobile` |
| `.easignore`, `eddy-ios/metro.config.js`, `file:` deps | `python3 eddy-ios/scripts/check-easignore.py` (in `bundle-mobile`) |
| `missouri-float-planner/supabase/migrations/**` | `make check-web` (ledger test); `make check-db` only with credentials, never against production by default |

Report exactly what ran and its result, and what did not run and why. "Not
run" is a finding to state, never a pass to imply.

## 3. Eddy-specific checks

Go through each that the diff touches. Each names how to check it.

- **Tests that never run.** New `*.test.ts` files must be listed in the web
  `test` script (`missouri-float-planner/package.json`, no glob).
  `missouri-float-planner/src/lib/trust/registered-tests.test.ts` fails on a missing one under
  `src/`, `shared/`, `scripts/` — confirm it ran.
- **iOS logic has no runner of its own.** Pure iOS logic is tested from
  `missouri-float-planner/src/lib/`. New iOS logic with no test there is
  untested, however green `check-mobile` is.
- **CI must see what tests read.** A test that reads a file outside App CI's
  path filters (`.github/workflows/app-ci.yml`) can be broken by a PR that
  never triggers CI. If the diff adds such a read, the filter must gain the
  path.
- **Binaries in the field call this API.** Any change to an API route or
  response shape the iOS app reads must be additive: an older store binary
  keeps calling the old shape. A removed or renamed field, or a new route the
  new binary depends on, means "deploy web before distributing the build" —
  say so explicitly.
- **Shippable web code stays inside `missouri-float-planner/`.** Vercel builds
  only that directory, and the web app has no dependency on `packages/`. A
  non-test file (not `*.test.ts` / `*.spec.ts`) importing from `eddy-ios/`,
  `packages/` or anywhere else outside it breaks the Vercel build; tests may.
- **`shared/` changes ship in both apps.** Check the iOS side of a change to
  the condition system, not only the web side.
- **Native fingerprint.** A new native dependency, config plugin, `app.json`
  permission or background mode, or anything under `eddy-ios/modules/`
  changes `runtimeVersion` (fingerprint policy): it needs a new binary and
  must not be shipped as an EAS Update. The PR should say so, and the
  runbook should carry a gate for it.
- **Migrations.** A migration file is named for the version production
  recorded and listed in `missouri-float-planner/supabase/production-migrations.txt` (or its
  `[pending]` section until applied). The ledger test enforces the file;
  the review checks the claim in the PR matches. Agents never apply them.
- **`.easignore` is an allowlist and a security boundary.** Any edit: read
  its header, run the check. A new top-level path the app bundle needs must
  be allowed explicitly.
- **Production writes.** DB scripts build clients via `missouri-float-planner/scripts/lib/db.ts`
  only. Nothing in the diff should write to production from CI or tests.
- **Safety data is never paywalled.** Conditions, gauge readings, hazards and
  the float plan are free online or off; only Eddy's written read is gated
  (`eddy-ios/README.md`, *Current state*; `PaywallSheet`).
- **Model IDs are runtime config** (ADR 0009); `no-hardcoded-models.test.ts`
  enforces it.
- **Generated files** (`missouri-float-planner/src/types/database.ts`, Expo/Next output) change only
  through their generator.

## 4. Documentation that owns a decision

When the change alters a lasting rule or product decision, the document that
owns it must change in the same PR: the ADR (`docs/decisions/`), the
`eddy-ios/README.md` section, the runbook, or `CLAUDE.md`. Look for the
contradiction a future reader will hit — a README that still says a feature
does not exist, a runbook naming an old version.

Status claims in docs and the PR description keep three states apart:
**implemented** (in code on `main`), **device-verified** (a runbook or ADR
gate ticked with evidence), **released** (in a store build, and on if behind
a server flag). An unticked gate means the evidence is not recorded; write
"unconfirmed", not "not released".

## 5. Correctness of the diff itself

Read the changed code against its real callers. A finding needs a file and
line, the input or state that triggers it, and the wrong result — a path you
traced, not a pattern you noticed. Weigh each fix against the code it adds;
a far-fetched path is worth a sentence, not a refactor.

## 6. Report

1. **Verdict** — mergeable / mergeable after named fixes / not mergeable, in
   one line.
2. **Blocking findings**, most severe first, each with `file:line`, the
   failure, and the smallest fix.
3. **Non-blocking** — nits and pre-existing issues, labelled as such.
4. **Validation** — commands run with results; commands not run with the
   reason.
5. **Follow-ups outside this PR** — release gates, deploy order, docs to
   reconcile.

Keep it proportionate: a short diff gets a short review.
