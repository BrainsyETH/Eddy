// src/lib/navigation/apple-app-site-association.ts
// The Apple App Site Association document, as data.
//
// Serving this from eddy.guide is what makes a shared float link open the app
// instead of Safari. Without it, `app/float/[shortCode].tsx` — a screen that
// exists purely to handle shared links — is unreachable from a tapped link.
//
// ── Why this is data and not a static file in public/ ──────────────────────
//
// Three requirements Apple has that a static asset makes awkward:
//
//   1. The path has NO file extension, so a static host serves it as
//      application/octet-stream and iOS ignores it. It must be application/json.
//   2. Apple's CDN must not be redirected. next.config.mjs already redirects
//      some /rivers paths, and a future redirect landing on this path would
//      silently break universal links with nothing failing anywhere.
//   3. The claimed paths have to stay in step with the app's routes, and a JSON
//      blob in public/ is unreachable from a test.
//
// So it is a module, served by a route handler through a REWRITE (invisible to
// Apple) rather than a redirect, and asserted by
// apple-app-site-association.test.ts.

/**
 * Apple Developer Team ID. Public by construction — it is served in this file
 * to anyone who asks — so it is a constant rather than a secret.
 */
export const APPLE_TEAM_ID = 'D4U38CY2HK';

/** Must match `ios.bundleIdentifier` in eddy-ios/app.json. */
export const IOS_BUNDLE_ID = 'eddy.guide.app';

export const APP_ID = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`;

/**
 * The paths eddy.guide hands to the app.
 *
 * ── Deliberately narrow ───────────────────────────────────────────────────
 *
 * Only `/plan/*`, the shared-float links. Claiming a path means that URL stops
 * opening the website for anyone with the app installed, which for `/rivers/*`
 * would divert every search result and every blog link into the app — a product
 * decision about the web funnel, not a navigation detail, and not one to make
 * silently while wiring up links.
 *
 * `/plan` itself is NOT claimed: the pattern requires a segment after it, so the
 * planner page still opens in the browser. That is correct — the planner is a
 * web tool, and only its SAVED RESULTS have an app screen.
 *
 * Widening this later is a one-line change here plus a mapping in
 * eddy-ios/app/+native-intent.tsx. The test below fails if the two disagree.
 */
export const CLAIMED_PATHS = ['/plan/*'] as const;

export interface AppleAppSiteAssociation {
  applinks: {
    details: { appIDs: string[]; components: { '/': string; comment: string }[] }[];
  };
}

export function appleAppSiteAssociation(): AppleAppSiteAssociation {
  return {
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          // The modern `components` form rather than the legacy `paths` array.
          // iOS 13+ reads this one, and it is what supports exclusions if the
          // claimed set ever needs them.
          components: CLAIMED_PATHS.map((path) => ({
            '/': path,
            comment: 'Shared float plans open in the Eddy app',
          })),
        },
      ],
    },
  };
}
