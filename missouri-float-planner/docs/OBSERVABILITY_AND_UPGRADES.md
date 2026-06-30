# Observability & Upgrades — follow-up plan

This document captures the three "bigger efforts" from the codebase audit that
need a running app and/or live Supabase access to complete safely. The
foundation (a centralized logger) is already merged; the remaining steps are
written out so they can be executed and verified by someone with the deploy
environment.

---

## 1. Error monitoring (Sentry) — finish wiring on top of `src/lib/logger.ts`

The logger (`src/lib/logger.ts`) is the single chokepoint: it already exposes
`logger.error()` / `logger.captureException()` and a `setErrorReporter()` hook.
Sentry just needs to register itself as that reporter. This was **not** auto-wired
because `withSentryConfig` changes the build pipeline and a full `next build`
can't be verified headlessly here (the build prerenders `/rivers` and
`/sitemap.xml`, which require real Supabase credentials).

Steps:

1. Install: `npm i @sentry/nextjs`
2. `npx @sentry/wizard@latest -i nextjs` (or create the files manually):
   - `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
     each calling `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 })`.
   - `src/instrumentation.ts` with `register()` importing the server/edge configs,
     plus `onRequestError` export for route-handler capture.
3. Register the reporter so existing `logger.error()` calls ship to Sentry — in
   `instrumentation.ts` `register()`:
   ```ts
   import * as Sentry from '@sentry/nextjs';
   import { setErrorReporter } from '@/lib/logger';
   setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }));
   ```
4. Wrap the config: `export default withSentryConfig(nextConfig, { silent: true })`
   in `next.config.mjs`. Keep the existing `headers()`/CSP — add the Sentry
   ingest/tunnel origin to `connect-src` if you enable the tunnel route.
5. Add a `app/global-error.tsx` that calls `Sentry.captureException` (the existing
   `app/error.tsx` only covers route segments, not the root layout).
6. Env: set `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN` for source-map upload
   in CI). Without a DSN the SDK is inert, so this is safe to merge dark.
7. **Verify**: `npm run build` against real Supabase env must succeed, and a
   thrown test error in a route handler should appear in Sentry.

Adoption of the logger across the existing ~500 `console.*` calls can then be
done incrementally; add `no-console` (allow `warn`/`error` off) to ESLint to
stop new ones creeping in.

---

## 2. Next.js security upgrade — current `14.2.35` is EOL for the audit CVEs

`npm audit` flags 14.x (HIGH) for Image Optimizer DoS, request-smuggling,
cache-poisoning, and more. There is **no patched 14.x** — the fix requires a
major upgrade.

- **Recommended target: `next@15.5.16`** (smaller jump than 16.x; covers every
  advisory range, most of which are `< 15.5.16`). `next@16.2.9` is npm's
  suggested fix if you'd rather go all the way.
- This app already uses async `params`/`searchParams` (Promise-based), so the
  biggest 15 breaking change is partially handled.
- Process: `npm i next@15.5.16 eslint-config-next@15.5.16`, run
  `npx @next/codemod@latest upgrade`, then check:
  - `images.remotePatterns` still valid (it is the surface of the DoS CVE).
  - Caching default changes (15 made `fetch`/route handlers uncached by default);
    audit `export const revalidate`/`dynamic` on the data routes.
  - React 19 peer bump — verify `@tiptap/*`, `maplibre-gl`, `react-markdown`,
    `html2canvas` compatibility.
- **Verify**: `tsc --noEmit`, `next lint`, a full `next build` with real env, then
  smoke-test the map, planner, and image optimization on a preview deploy.

---

## 3. Type the Supabase clients (`<Database>`) — needs a fresh schema dump first

`src/lib/supabase/server.ts` and `admin.ts` are intentionally untyped. Passing
`<Database>` today produces ~700 errors because `src/types/database.ts` is stale
relative to the 153 applied migrations (queries resolve to `never`).

Steps:

1. Regenerate types from the live schema:
   `npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/types/database.ts`
   (or `--db-url` against a local `supabase start` instance).
2. Re-add the generic: `createServerClient<Database>(...)` /
   `createClient<Database>(...)` in `server.ts`, and
   `createClient<Database>(...)` in `admin.ts`.
3. Fix the residual call-site mismatches (should be far fewer once the types
   match the real schema) and delete the now-unnecessary `as any` casts —
   start with `src/lib/social/*`, which carry `supabase: any` parameters.
4. Add a CI/`package.json` step (`npm run db:gen-types`) so the generated types
   stay in sync after future migrations.
5. Tighten ESLint with `@typescript-eslint/no-explicit-any` (warn → error) to
   prevent the `as any` debt from regrowing.
