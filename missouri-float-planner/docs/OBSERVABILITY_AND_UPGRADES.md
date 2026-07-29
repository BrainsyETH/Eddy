# Observability & Upgrades — follow-up plan

> **Status: active** (2026-07). Open follow-up plan; the logging foundation is merged, remaining steps need a running app / live Supabase.

This document captures the three "bigger efforts" from the codebase audit that
need a running app and/or live Supabase access to complete safely. The
foundation (a centralized logger) is already merged; the remaining steps are
written out so they can be executed and verified by someone with the deploy
environment.

---

## 1. Error monitoring (Sentry) — server side DONE, client side outstanding

**Status: the server half is wired.** `src/instrumentation.ts` initialises
`@sentry/nextjs` when `SENTRY_DSN` is set and registers
`createSentryReporter()` through the `setErrorReporter()` hook, so every
existing `logger.error()` / `logger.captureException()` call ships, along with
`onRequestError` route-handler captures. With no DSN the SDK is never imported
and behaviour is unchanged, which is what made it safe to merge dark.

Sentry takes precedence over `ERROR_WEBHOOK_URL` rather than running alongside
it: two sinks means every incident is triaged twice and neither is
authoritative, and the webhook has no grouping.

Everything leaving the process is redacted first — `sentry-reporter.ts` runs the
message, stack and context through the same `REDACTIONS` table
`webhook-reporter.ts` owns. That protects grouping as well as privacy: Sentry
groups on the message, so an unredacted email mints one issue per user and
buries the fault. `sentry-reporter.test.ts` guards it.

### What is still missing

**Browser errors are not captured.** `register()` returns early unless
`NEXT_RUNTIME === 'nodejs'`, so a React render throw in a visitor's browser goes
nowhere. Closing that gap is the part that touches the build, which is why it
was left:

1. `sentry.client.config.ts` (and `sentry.edge.config.ts`) calling
   `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0 })`.
   Note the DSN has to be `NEXT_PUBLIC_` to reach the browser — a **second**
   variable, not the server's `SENTRY_DSN`.
2. `app/global-error.tsx` calling `Sentry.captureException`. The existing
   `app/error.tsx` only covers route segments, not the root layout.
3. `export default withSentryConfig(nextConfig, { silent: true })` in
   `next.config.mjs`. Keep the existing `headers()`/CSP, and add the Sentry
   ingest origin to `connect-src`.
4. Client-side redaction. `sentry-reporter.ts` is not on the browser path, so
   `beforeSend` in the client config needs its own `redactText` pass — the iOS
   app does exactly this in `eddy-ios/src/lib/monitoring.ts`.

**Source maps are not uploaded**, so server stack traces point at bundled
output. Needs `SENTRY_AUTH_TOKEN` (a write credential — never `NEXT_PUBLIC_`)
plus `withSentryConfig`, so it lands with the step above.

**Verify** once those are in: `npm run build` against real Supabase env must
succeed, and a thrown test error in both a route handler and a client component
should appear in Sentry.

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
