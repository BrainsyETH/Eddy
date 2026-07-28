# Eddy

Float trip planning for Ozarks rivers — [eddy.guide](https://eddy.guide).
Live USGS water conditions, access points, float time estimates, hazards,
and shareable trip plans, delivered as a web app and an iOS app.

## What ships from this repository

- **Web app + API** — [`missouri-float-planner/`](missouri-float-planner/):
  Next.js on Vercel, Supabase (PostgreSQL + PostGIS) backend. Vercel's Root
  Directory is this folder; nothing outside it is part of the web build.
- **iOS app** — [`eddy-ios/`](eddy-ios/): Expo app consuming the web API,
  built with EAS. Shares code with the web app via `file:` dependencies on
  [`packages/`](packages/) and `missouri-float-planner/shared/`.

Supporting directories: [`packages/`](packages/) (shared `@eddy/*` modules),
[`scripts/`](scripts/) + [`clipengine-local/`](clipengine-local/) (media and
social automation), [`design/`](design/), [`marketing/`](marketing/), and
[`docs/`](docs/) (ops runbooks, [decision records](docs/decisions/), and
[research material](docs/research/)).

The full map, task-routing table, and repository constraints live in
[`CLAUDE.md`](CLAUDE.md) — read that first when changing anything.

## Quick start

Node 20 (the version CI pins). There is deliberately no root `package.json`;
each app installs independently:

```bash
make setup-web      # npm ci in missouri-float-planner/
make setup-mobile   # npm ci in eddy-ios/  (never --legacy-peer-deps)

cd missouri-float-planner && npm run dev   # web, http://localhost:3000
cd eddy-ios && npx expo start              # iOS, from inside eddy-ios/ only
```

Environment variables: see the [web README](missouri-float-planner/README.md)
for `.env.local` and the [iOS README](eddy-ios/README.md) for app config.

## Validation

```bash
make help           # list all targets
make check-web      # web typecheck + lint + tests
make check-mobile   # iOS typecheck + lint
make bundle-mobile  # production iOS bundle + .easignore allowlist check
make check          # everything CI gates on
```

Each target mirrors [`app-ci.yml`](.github/workflows/app-ci.yml) exactly. Web
tests intentionally cover iOS and `packages/` logic, so run `make check-web`
after mobile or shared-code changes too.

## Deployment constraints worth knowing before you refactor

- Vercel builds only `missouri-float-planner/`; the canonical condition
  system lives at `missouri-float-planner/shared/` so the web build can
  reach it.
- EAS archives from the **git root**, filtered by [`.easignore`](.easignore)
  — an allowlist that fully replaces `.gitignore` during upload. Read its
  header before editing; verify with `python3 eddy-ios/scripts/check-easignore.py`.
- Rationale for these and other structural decisions:
  [`docs/decisions/`](docs/decisions/).
