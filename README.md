# Eddy

Missouri float trip planner. Monorepo housing the web app, mobile app, and shared code.

## Layout

```
eddy/
├── apps/
│   ├── web/         # Next.js 14 app (formerly missouri-float-planner/)
│   └── mobile/      # Expo + React Native iOS/Android app (scaffold pending)
├── packages/
│   └── shared/      # Cross-platform types, zod schemas, API client, business logic
├── scripts/         # ClipEngine shell scripts used by GitHub Actions
└── .github/         # CI workflows
```

## Workspaces

This is an [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo.
Run `npm install` at the repo root — it installs and hoists dependencies for every
workspace.

Common scripts (run from the repo root):

```bash
npm run dev      # next dev for the web app
npm run build    # next build for the web app
npm run lint     # next lint for the web app

# Targeted:
npm run web -- dev
npm run mobile -- start
```

`turbo` is installed at the root for future task orchestration but is not yet
wired into the default scripts.

## Vercel Deployment

The web app deploys from `apps/web`. The Vercel project's **Root Directory**
setting must be `apps/web` (Dashboard → Project → Settings → General → Root
Directory). The `vercel.json` inside `apps/web/` still defines cron schedules
and function configs.

## Web app details

See [`apps/web/README.md`](apps/web/README.md) for the original project README,
environment variables, and data import scripts.

## Mobile app

See [`apps/mobile/README.md`](apps/mobile/README.md). Expo scaffold pending.
