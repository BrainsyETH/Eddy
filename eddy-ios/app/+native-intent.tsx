// eddy-ios/app/+native-intent.tsx
// Where a tapped eddy.guide link lands in the app.
//
// expo-router calls redirectSystemPath for every URL the OS hands the app —
// universal links, custom-scheme links, and the cold-start URL. Returning a
// different path routes it somewhere else; returning the path unchanged lets
// normal resolution happen.
//
// ── Why this file has to exist at all ─────────────────────────────────────
//
// The web URL and the app route do not match. A shared float is
// https://eddy.guide/plan/<shortCode> on the web, but the screen that opens it
// is app/float/[shortCode].tsx. Without the mapping below, a claimed /plan/
// link opens the app to a 404 — which is strictly worse than not claiming it,
// because Safari at least rendered the plan.
//
// This is exactly the kind of mismatch that makes universal links look broken
// with nothing in the logs: the domain association succeeds, the app opens, and
// then it has no route.
//
// ── Keep in step with the web ─────────────────────────────────────────────
//
// The claimed paths live in
// missouri-float-planner/src/lib/navigation/apple-app-site-association.ts, and
// its test asserts every claimed path has a mapping here. Claiming a path
// without adding one here is the 404 above; adding one here without claiming it
// is dead code.

/** `/plan/<shortCode>` on the web is `/float/<shortCode>` in the app. */
const PLAN_LINK = /^\/plan\/([^/?#]+)/;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // The path arrives as a full URL for a universal link and as a path for a
    // custom-scheme one, so normalise before matching rather than assuming.
    const pathname = path.startsWith('http') ? new URL(path).pathname : path;

    const plan = pathname.match(PLAN_LINK);
    if (plan) return `/float/${plan[1]}`;

    return path;
  } catch {
    // Never throw from here. This runs on the cold-start path, and a throw
    // would take the launch with it — for a malformed URL, which is the one
    // input this function cannot control.
    return path;
  }
}
