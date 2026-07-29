# Observability & Upgrades — follow-up plan

> **Status: active** (2026-07). Sections 1 and 2 are **done**; section 3 still
> needs live Supabase access.

This document captured the three "bigger efforts" from the codebase audit that
needed a running app and/or live Supabase access to complete safely.

---

## 1. Error monitoring (Sentry) — DONE, server + browser + edge

**Status: complete.** Server, edge and browser are all wired, and the iOS app
reports too. What follows is the map, then the reasoning that is worth keeping.

| Runtime | Init | DSN | Redaction |
|---|---|---|---|
| Node | `src/instrumentation.ts` | `SENTRY_DSN` | `sentry-reporter.ts`, via the logger seam |
| Edge | `src/instrumentation.ts` | `SENTRY_DSN` | as above |
| Browser | `src/instrumentation-client.ts` | `NEXT_PUBLIC_SENTRY_DSN` | `beforeSend`/`beforeBreadcrumb` in that file |
| iOS | `eddy-ios/src/lib/bootstrap.ts` → `monitoring.ts` | `EXPO_PUBLIC_SENTRY_DSN` | `eddy-ios/src/lib/redact.ts` |

All four share one redaction table by construction:
`src/lib/monitoring/redact.ts` is the web copy, `eddy-ios/src/lib/redact.ts` is
the app's, and `src/lib/redact.test.ts` asserts they agree.

### The gap this had, and why it stayed open so long

`register()` opened with `if (process.env.NEXT_RUNTIME !== 'nodejs') return`, so
every browser error went nowhere while the dashboard looked healthy. Nothing
failed; there was simply never anything to see. **A monitoring gap does not
announce itself — it looks exactly like an absence of errors.** That is the
argument for the coverage table above being a table rather than prose.

Three details that were not obvious and cost time:

- **The client file is `src/instrumentation-client.ts`, not
  `sentry.client.config.ts`.** Next 15 replaced the old filename and this app is
  on Next 16, where it is a silent no-op — the same failure mode again.
- **The CSP blocked ingest.** `next.config.mjs`'s `connect-src` allowlist had no
  Sentry origin, so a correctly-initialised browser SDK would still have sent
  nothing, and the symptom would have been identical to not configuring it.
- **`NEXT_PUBLIC_SENTRY_DSN` is a second variable.** The server's `SENTRY_DSN`
  never reaches the browser. `SENTRY_AUTH_TOKEN`, used for source maps, is a
  write credential and must never take the prefix.

### Source maps

`withSentryConfig` in `next.config.mjs` uploads them when `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG` and `SENTRY_PROJECT` are all set, and deletes them from the
deployed output afterwards. Upload and its logging are both keyed off the token's
presence, so a deployment without Sentry builds silently rather than warning
about a credential it was never meant to have.

`tunnelRoute` is deliberately left off — see the comment in `next.config.mjs`.

### Verify

`npm run build` against real Supabase env, then throw a test error in a route
handler **and** in a client component; both should appear. `make check-web`
covers the rest.

### Still open

Adoption of the logger across the existing ~500 `console.*` calls can be done
incrementally; add `no-console` (allow `warn`/`error` off) to ESLint to stop new
ones creeping in.

### Design notes worth keeping

**Sentry takes precedence over `ERROR_WEBHOOK_URL`** rather than running
alongside it: two sinks means every incident is triaged twice and neither is
authoritative, and the webhook has no grouping. The webhook stays Node-only —
it dedupes in module state, and an edge isolate per request turns "one report
per fingerprint per five minutes" into no cap at all.

**With no DSN the SDK is never imported** on the server, and never initialised
in the browser. That is what made every stage of this safe to merge dark.

**Redaction happens before the event leaves the process**, not in Sentry's
server-side scrubbing, which is one hop too late. It protects grouping as much
as privacy: Sentry groups on the message, so an unredacted email mints one issue
per user and buries the fault. `sentry-reporter.test.ts` and `redact.test.ts`
guard it.

---

## 2. Next.js security upgrade — DONE

**Status: complete, and past the recommendation.** `package.json` pins
`next@16.2.12` with `react@19.2.7`. The plan below targeted `15.5.16` as the
smaller jump and named `16.2.9` as npm's own suggested fix; the tree went
further than either, so every advisory range in the original audit (Image
Optimizer DoS, request smuggling, cache poisoning) is behind us.

Nothing here is actionable any more. It is left as a record of what the upgrade
was checking for, because the same list is what a future major bump has to
re-verify:

- `images.remotePatterns` still valid — it is the surface of the DoS CVE.
- Caching defaults: 15 made `fetch` and route handlers uncached by default.
  Audit `export const revalidate` / `dynamic` on the data routes.
- Peer compatibility for `@tiptap/*`, `maplibre-gl`, `react-markdown`,
  `html2canvas`.
- **Verify**: `tsc --noEmit`, lint, a full `next build` with real env, then
  smoke-test the map, planner and image optimization on a preview deploy.

> One consequence worth carrying: being on Next 16 is why the browser Sentry
> client is `src/instrumentation-client.ts`. A guide written against Next 14 —
> including section 1 of this document, before it was corrected — would tell you
> to add `sentry.client.config.ts`, which this version ignores silently.

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
