# Eddy — repository guide

Eddy (eddy.guide) is a float trip planner for Ozarks rivers: real-time USGS
water conditions, access points, float time estimates, and trip plans, as a
Next.js website and an Expo iOS app. This file is the canonical repository
guide for coding tools; `AGENTS.md` points here. Keep them from drifting by
editing only this file.

## Repository map

| Path | What it is |
| --- | --- |
| `missouri-float-planner/` | The web app and API (Next.js, App Router). **Vercel's Root Directory** — Vercel installs and builds only this directory. Also hosts the Remotion video projects under `remotion/`. |
| `missouri-float-planner/shared/` | The canonical condition system, consumed by the web app directly and by the iOS app as `@eddy/conditions` via a `file:` dependency. Changes here affect **both** apps. |
| `missouri-float-planner/src/` | Web pages, API routes, components, and `src/lib/` domain logic. The test suite here also covers iOS-app pure logic and `packages/`. |
| `missouri-float-planner/scripts/` | Data ingestion, validation, and generation scripts (run via `npm run db:*` / `tsx`). `scripts/ingestion/README.md` documents the river-data pipeline. |
| `missouri-float-planner/supabase/` | Migrations, seeds, and SQL scripts for the Supabase (PostgreSQL + PostGIS) backend. |
| `missouri-float-planner/docs/` | Product/subsystem docs (strategy, audits, runbooks). |
| `eddy-ios/` | The Expo (SDK 57) iOS app. Consumes the web app as a headless API and shares code via `file:` dependencies. Its `README.md` is the authoritative dev guide. |
| `packages/` | Four pure shared packages: `@eddy/types`, `@eddy/geo`, `@eddy/hazards`, `@eddy/sync`. No build step; consumed via `file:` deps. |
| `scripts/` + `clipengine-local/` | ClipEngine media/social automation (root `scripts/clipengine/`, `scripts/social/`). Operated by GitHub workflows — paths are load-bearing. See `docs/clipengine-ops.md`. |
| `design/`, `marketing/` | Brand assets and marketing material. Not part of any build. |
| `docs/` | Repository-level docs: `architecture.md` (the system map), ops runbooks, `decisions/` (ADRs), `research/` (source PDFs and reports). |

Versions live in manifests, not docs: see `missouri-float-planner/package.json`
and `eddy-ios/package.json`. CI pins Node 20 (`.github/workflows/app-ci.yml`).

## Task routing

| Change | Start in | Read first | Validate with |
| --- | --- | --- | --- |
| Web page / API route / server logic | `missouri-float-planner/src/` | `missouri-float-planner/README.md` | `make check-web` |
| iOS screen / component / native config | `eddy-ios/app/`, `eddy-ios/src/` | `eddy-ios/AGENTS.md`, then the `eddy-ios/README.md` sections it names | `make check-mobile` + `make bundle-mobile` + `make check-web` (iOS logic is tested there; register new test files in its `test` script) |
| River-condition behavior | `missouri-float-planner/shared/` | comments in `.github/workflows/app-ci.yml` | `make check-web` + `make bundle-mobile` |
| Shared types / geo / hazards / sync | `packages/` | the package's source headers | `make check-web` + `make bundle-mobile` |
| Data ingestion or correction | `missouri-float-planner/scripts/` | `docs/data-pipeline.md` (catalog + guard levels), then `scripts/ingestion/README.md` | script dry run, then `make check-web` |
| Database schema / seeds | `missouri-float-planner/supabase/` | existing migrations, then `supabase/production-migrations.txt` | never against production by default; `make check-db` after any hand-applied change. A migration PR is done only when the file is named for the version production recorded and that version is in the ledger |
| ClipEngine / social automation | `scripts/clipengine/`, `clipengine-local/` | `docs/clipengine-ops.md` | tool-specific dry run |
| CI / deployment | `.github/workflows/`, `.easignore` | `.easignore` header, `app-ci.yml` comments | `make check` |
| iOS build, TestFlight, App Store submission | EAS + Apple/RevenueCat dashboards | `docs/ios-release-runbook.md` | the checklists in that runbook |

Web tests intentionally cover iOS-app and `packages/` logic (neither has its
own runner), so a mobile or package change can fail `make check-web` — that is
by design, not flake. See the comment block at the top of `app-ci.yml`. The
web `test` script lists every file explicitly (no glob); a test that is not
listed never runs, and `src/lib/trust/registered-tests.test.ts` fails on it.

## Commands

**Setup:** `./bootstrap.sh [web|mobile|all] [--env-file FILE]` at the root
finds Node 20 (PATH, nvm, or `/opt/node20`) and installs an app only when its
`package.json`, its lockfile, or the Node version changed: `npm ci` into an
empty tree, `npm install` over an existing one (so a cached cloud container
updates in place), failing if the lockfile is out of sync either way. It is the one setup path for every
tool: Claude cloud sessions run it from `.claude/hooks/session-start.sh`
(which passes `$CLAUDE_ENV_FILE`, so later commands keep Node 20); a Codex or
other environment's setup script calls it too, passing a file its later
shells read (for example `./bootstrap.sh all --env-file ~/.bashrc`). Change
setup in `bootstrap.sh`, not in a caller.

Run `make help` at the root. Targets are thin wrappers over each project's own
scripts and mirror CI exactly:

- `make setup-web` / `make setup-mobile` — `npm ci` in each app
- `make check-web` — web typecheck + lint + tests
- `make check-mobile` — iOS typecheck + lint
- `make bundle-mobile` — credential-free production iOS bundle + `.easignore` allowlist check (the step that catches Metro/EAS breakage invisible in dev)
- `make check-db` — migration drift against the **linked** Supabase project. Outside `make check` on purpose: it needs credentials, and CI stays hermetic. Run it after applying anything by hand, not only before a release
- `make check-db` also checks live report-write privileges/policies and exposed
  `SECURITY DEFINER` RPCs against the reviewed public API allowlist in
  `scripts/lib/client-access-contract.ts` under the web app. New public definer
  functions require an explicit allowlist review; report writes remain server-only.
- `make check` — all of the above
- `make dev` — run Metro for an installed iOS development client (Fast Refresh); `make run-ios` builds/installs that client when native code changes
- `make build-ios` / `make testflight` — EAS builds. The native-artifact cleanup and the `.easignore` check are **prerequisites**, not remembered steps
- `make check-eas-env` — compare EAS variable *names* across `preview` and `production`

Or run the underlying `npm` scripts from inside `missouri-float-planner/` or
`eddy-ios/` — the manifests remain the source of truth.

Every target depends on `guard-node`, which **fails** unless the running Node
matches `.nvmrc` (20). npm only *warns* on an engines mismatch and buries it in
install output; installing on the wrong Node resolves a different dependency
graph than CI, which is how a lockfile stops matching and a native build starts
failing for reasons that name anything but Node.

## Skills

Repeatable workflows are skills in `.agents/skills/<name>/SKILL.md` (Codex
reads them there); `.claude/skills/<name>` is a symlink to the same directory
for Claude Code. Edit the `.agents/` copy only. `eddy-ios-feature` implements
a scoped iOS change and self-reviews its behavior; `eddy-ios-ui` adds Eddy's
native UI, accessibility, and interaction checklist. `eddy-review` reviews
a branch or PR; `eddy-ios-release-prep` assesses an iOS release and writes its
readiness record. Skills route to the authoritative docs rather than restate
them; `missouri-float-planner/src/lib/agent-skills.test.ts` checks the links
and that every path a skill names exists.

## Hard constraints

- **No root `package.json`, lockfile, or npm workspace — deliberate.** `npx expo` run from the root would fetch latest Expo instead of the pinned SDK; workspaces would break EAS archiving and Vercel's scoped install. Rationale: `eddy-ios/README.md`, ADRs in `docs/decisions/`.
- **Never install `eddy-ios` with `--legacy-peer-deps`.** It silently removes shipped native packages; the `overrides` block in `eddy-ios/package.json` is the correct fix. Plain `npm ci` works. Details: `app-ci.yml` mobile-job comments.
- **`.easignore` is a security-critical allowlist.** While it exists, EAS ignores `.gitignore` entirely, so anything not denied there gets uploaded — including `.env` files — and it defines the EAS archive from the **git root**. After any edit, run `python3 eddy-ios/scripts/check-easignore.py`. Read its header before touching it.
- **Vercel builds only `missouri-float-planner/`.** Shippable web code must not import from outside it (that is why `shared/` lives inside the web tree). Tests may — they run under `tsconfig.test.json`, not the build.
- **Do not write to production** (Supabase data, deployments, external messages, secrets) without explicit user authorization; prefer dry runs, and inspect current state first. DB scripts build clients via `scripts/lib/db.ts`, which refuses writes unless `EXPECTED_SUPABASE_REF` names the target project — enforced by a test; don't route around it.

## Keeping documentation current

When a change alters a lasting rule or product decision, update the document
that owns it in the same PR: the ADR in `docs/decisions/`, the README section,
the runbook, or this file. Temporary progress belongs in issues and PRs, not
in these documents. A mistake that can be checked mechanically gets a test or
script instead of a sentence (as `ios-release-runbook.test.ts` does for the
runbook's version line).

Describe feature status in three separate states: **implemented** (in code on
`main`), **device-verified** (a runbook or ADR gate ticked with evidence), and
**released** (in a store build, and switched on if behind a server flag). An
unticked gate means the evidence is not recorded; write "unconfirmed", not
"not released".

## Generated / do-not-edit paths

`node_modules/`, `.next/`, `missouri-float-planner/public/tmp/`, Remotion
render output (`remotion/out/`), and Expo export output are generated.
`missouri-float-planner/src/types/database.ts` is generated by
`npm run db:gen-types`. `docs/research/` holds archival source material —
reference it, don't rewrite it.

## Stitch design integration

Google Stitch (via MCP, `.mcp.json`) is available for UI/UX design workflows:
generate or edit high-fidelity screens from prompts, and synthesize
`missouri-float-planner/.stitch/DESIGN.md` from project screens. Authenticate
with `npx @_davideast/stitch-mcp init` or a `STITCH_API_KEY` env var.
