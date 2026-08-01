// Narrowing a runtime-built path to the type expo-router's typed routes want.
//
// ── WHY THIS EXISTS, AND WHY CI NEVER CAUGHT THE ERRORS IT FIXES ──────────
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
// .expo/ is gitignored and the declaration is only written when the dev server
// or an export runs. CI installs and typechecks WITHOUT ever generating it, so
// `Href` degrades to something permissive and the errors do not appear — while
// any machine that has run `expo start` sees them. Three of these sat green in
// CI for a week. Ordering the mobile job's bundle step before its typecheck
// step would close that gap; until then, local is stricter than CI.
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
