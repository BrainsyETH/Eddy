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
// ── THE GAP, AND WHY IT CANNOT BE CLOSED WHERE YOU WOULD EXPECT ───────────
//
// .expo/ is gitignored and the declaration is written ONLY BY THE DEV SERVER.
// `expo export` does not write it — that was tried, and is the correction to an
// earlier version of this comment which asserted that ordering the CI job's
// bundle step before its typecheck step would close the gap. It does not,
// because there is nothing to order: no step in a fresh checkout ever produces
// the file.
//
// So the two environments disagree, in opposite directions, and neither is
// fixable from CI:
//
//   CI       has no declaration at all, so `Href` degrades to something
//            permissive and route errors CANNOT FIRE. Three sat green for a
//            week.
//   A laptop has whatever its last `expo start` wrote, so a route added since
//            reads as invalid — a correct push to a new screen failing a check
//            nobody can reproduce.
//
// The practical consequence: after adding a route, run `make dev` once. A
// TS2345 naming a route you just created is a stale declaration, not a bad
// route, and casting it with asHref would be laundering the wrong problem.
//
// WHAT ACTUALLY COVERS THIS EVERYWHERE is a plain test —
// missouri-float-planner/src/lib/ios-routes.test.ts — which reads the route
// files under app/ and asserts every route pushed in the app resolves to one.
// It needs no Expo, no dev server and no generated artifact, so it gives the
// same answer in CI as on a laptop. That is the check to trust; typed routes
// are a local convenience layered on top.
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
