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
| `packages/` | Five pure shared packages: `@eddy/types`, `@eddy/geo`, `@eddy/hazards`, `@eddy/offline`, `@eddy/sync`. No build step; consumed via `file:` deps. |
| `scripts/` + `clipengine-local/` | ClipEngine media/social automation (root `scripts/clipengine/`, `scripts/social/`). Operated by GitHub workflows — paths are load-bearing. See `docs/clipengine-ops.md`. |
| `design/`, `marketing/` | Brand assets and marketing material. Not part of any build. |
| `docs/` | Repository-level docs: ops runbooks, `decisions/` (ADRs), `research/` (source PDFs and reports). |

Versions live in manifests, not docs: see `missouri-float-planner/package.json`
and `eddy-ios/package.json`. CI pins Node 20 (`.github/workflows/app-ci.yml`).

## Task routing

| Change | Start in | Read first | Validate with |
| --- | --- | --- | --- |
| Web page / API route / server logic | `missouri-float-planner/src/` | `missouri-float-planner/README.md` | `make check-web` |
| iOS screen / component / native config | `eddy-ios/app/`, `eddy-ios/src/` | `eddy-ios/README.md` | `make check-mobile` + `make bundle-mobile` |
| River-condition behavior | `missouri-float-planner/shared/` | comments in `.github/workflows/app-ci.yml` | `make check-web` + `make bundle-mobile` |
| Shared types / geo / hazards / offline / sync | `packages/` | the package's source headers | `make check-web` + `make bundle-mobile` |
| Data ingestion or correction | `missouri-float-planner/scripts/` | `docs/data-pipeline.md` (catalog + guard levels), then `scripts/ingestion/README.md` | script dry run, then `make check-web` |
| Database schema / seeds | `missouri-float-planner/supabase/` | existing migrations | never against production by default; `make check-db` after any hand-applied change |
| ClipEngine / social automation | `scripts/clipengine/`, `clipengine-local/` | `docs/clipengine-ops.md` | tool-specific dry run |
| CI / deployment | `.github/workflows/`, `.easignore` | `.easignore` header, `app-ci.yml` comments | `make check` |
| iOS build, TestFlight, App Store submission | EAS + Apple/RevenueCat dashboards | `docs/ios-release-runbook.md` | the checklists in that runbook |

Web tests intentionally cover iOS-app and `packages/` logic (neither has its
own runner), so a mobile or package change can fail `make check-web` — that is
by design, not flake. See the comment block at the top of `app-ci.yml`.

## Commands

Run `make help` at the root. Targets are thin wrappers over each project's own
scripts and mirror CI exactly:

- `make setup-web` / `make setup-mobile` — `npm ci` in each app
- `make check-web` — web typecheck + lint + tests
- `make check-mobile` — iOS typecheck + lint
- `make bundle-mobile` — credential-free production iOS bundle + `.easignore` allowlist check (the step that catches Metro/EAS breakage invisible in dev)
- `make check-db` — migration drift against the **linked** Supabase project. Outside `make check` on purpose: it needs credentials, and CI stays hermetic. Run it after applying anything by hand, not only before a release
- `make check` — all of the above
- `make dev` — run the app locally on a simulator
- `make build-ios` / `make testflight` — EAS builds. The native-artifact cleanup and the `.easignore` check are **prerequisites**, not remembered steps
- `make check-eas-env` — compare EAS variable *names* across `preview` and `production`

Or run the underlying `npm` scripts from inside `missouri-float-planner/` or
`eddy-ios/` — the manifests remain the source of truth.

Every target depends on `guard-node`, which **fails** unless the running Node
matches `.nvmrc` (20). npm only *warns* on an engines mismatch and buries it in
install output; installing on the wrong Node resolves a different dependency
graph than CI, which is how a lockfile stops matching and a native build starts
failing for reasons that name anything but Node.

## Hard constraints

- **No root `package.json`, lockfile, or npm workspace — deliberate.** `npx expo` run from the root would fetch latest Expo instead of the pinned SDK; workspaces would break EAS archiving and Vercel's scoped install. Rationale: `eddy-ios/README.md`, ADRs in `docs/decisions/`.
- **Never install `eddy-ios` with `--legacy-peer-deps`.** It silently removes shipped native packages; the `overrides` block in `eddy-ios/package.json` is the correct fix. Plain `npm ci` works. Details: `app-ci.yml` mobile-job comments.
- **`.easignore` is a security-critical allowlist.** While it exists, EAS ignores `.gitignore` entirely, so anything not denied there gets uploaded — including `.env` files — and it defines the EAS archive from the **git root**. After any edit, run `python3 eddy-ios/scripts/check-easignore.py`. Read its header before touching it.
- **Vercel builds only `missouri-float-planner/`.** Shippable web code must not import from outside it (that is why `shared/` lives inside the web tree). Tests may — they run under `tsconfig.test.json`, not the build.
- **Do not write to production** (Supabase data, deployments, external messages, secrets) without explicit user authorization; prefer dry runs, and inspect current state first.

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
