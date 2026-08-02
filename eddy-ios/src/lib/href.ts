// Narrowing a runtime-built path to the type expo-router's typed routes want.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// app.json sets `experiments.typedRoutes: true`, so expo-router GENERATES a
// union of every real route into .expo/types/router.d.ts, and router.push()
// accepts only members of that union. A template literal written inline —
// router.push(`/river/${slug}`) — matches the `/river/${string}` member and
// typechecks. The same string assigned to a variable first widens to `string`,
// which is wider than the union, and does not.
//
// That is the whole bug. Three call sites built a path into a `const` (so they
// could also test it for null, or because the path arrived as a prop) and
// pushed the variable.
//
// ── THE GAP THIS USED TO HAVE, AND WHAT CLOSED IT ─────────────────────────
//
// .expo/ is gitignored, so the declaration has no committed copy, and for a
// long time the DEV SERVER was the only thing that wrote one. The two
// environments therefore disagreed in opposite directions:
//
//   CI       had no declaration at all, so `Href` degraded to something
//            permissive and route errors COULD NOT FIRE. Three sat green for
//            a week.
//   A laptop had whatever its last `expo start` wrote, so a route added since
//            read as invalid — a correct push to a new screen failing a check
//            nobody could reproduce.
//
// `npm run typecheck` now regenerates the declaration first, in both places,
// so both answer the same question about the app/ directory as it is right
// now. eddy-ios/package.json carries the how and the why. Two dead ends are
// worth not repeating: `expo export` does not write the file (tried, in the
// Makefile and in CI, and reverted), and reordering the CI bundle step ahead
// of the typecheck orders nothing, because no step in a fresh checkout was
// producing the file at all.
//
// A TS2345 naming a route is therefore now a real answer, not a stale
// artifact — the route is misspelled, renamed, or not there. Fix the push or
// add the screen. Do NOT reach for asHref(): it would launder a genuine
// failure into a permanent cast.
//
// SECOND, INDEPENDENT COVERAGE, and the one that owes nothing to Expo:
// missouri-float-planner/src/lib/ios-routes.test.ts reads the route files
// under app/ and asserts every route pushed in the app resolves to one. No
// Expo, no dev server, no generated artifact. It stays because it answers the
// same question a different way — if typed-route generation ever breaks or is
// turned off, the check does not vanish with it.
//
// ── Why not `Href` ────────────────────────────────────────────────────────
//
// expo-router 57 declares `Href` internally but does not export it, so the
// accepted argument is read off the exported `ImperativeRouter` type instead.
// That cannot drift: if push's signature changes, this follows it.
//
// TYPE-ONLY, so this module has no runtime import and no side effects — it is
// safe to pull into any screen without dragging the router singleton with it.

import type { ImperativeRouter } from 'expo-router';

/** Exactly what `router.push()` accepts, whether or not typed routes are on. */
export type PushHref = Parameters<ImperativeRouter['push']>[0];

/**
 * Assert that a runtime-built path is a real route.
 *
 * A CAST, and honestly so: these paths are assembled from ids and slugs that
 * only exist at runtime, so no checker can prove them. Use it only where the
 * shape is built from a literal prefix — `/river/${slug}` — never to launder an
 * arbitrary string. Prefer pushing a template literal inline where you can;
 * that form is genuinely checked and needs nothing from this file.
 */
export function asHref(path: string): PushHref {
  return path as PushHref;
}
