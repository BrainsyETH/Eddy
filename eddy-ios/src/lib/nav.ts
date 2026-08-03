// Going back from a screen that may have nothing behind it.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `router.back()` is a no-op when the history stack is empty, and the back
// chevron then does nothing at all — no error, no movement, nothing to tell the
// user their tap registered. The screen is a dead end reachable only by
// force-quitting.
//
// An empty stack is not hypothetical here. `app/+native-intent.tsx` rewrites a
// universal link (`https://eddy.guide/plan/<code>`) to `/float/<code>`, which
// lives OUTSIDE `app/(tabs)`, and the root Stack in `app/_layout.tsx` declares
// no `initialRouteName` and no anchor — so nothing synthesises a tab screen
// underneath it. A cold launch from a shared float therefore opens on a screen
// whose only control leads nowhere, and it does so for the person least able to
// work around it: the recipient of the link, very often on a first launch
// seconds after installing.
//
// ── WHY EVERY BACK BUTTON AND NOT JUST THAT ONE ───────────────────────────
//
// Which routes are claimed is a one-line change in the web app
// (`CLAIMED_PATHS` in src/lib/navigation/apple-app-site-association.ts), and
// widening it is a product decision about the web funnel, not a navigation one.
// A screen becoming a deep-link target should not silently become a trap, so
// the fallback lives at every call site rather than at the one that needs it
// today. Where a back stack exists — which is every in-app navigation — the
// behaviour is unchanged.
//
// `/` is the `(tabs)` index: the map, and the right place to land someone who
// arrived from outside the app and is now done with the screen they arrived on.

import type { ImperativeRouter } from 'expo-router';

/**
 * The router surface this needs, taken structurally rather than as the whole
 * `ImperativeRouter`, so a screen can pass its `useRouter()` instance and this
 * keeps compiling if that type gains members.
 */
type BackRouter = Pick<ImperativeRouter, 'canGoBack' | 'back' | 'replace'>;

/**
 * Go back, or to the map if there is nowhere to go back to.
 *
 * Pass the instance from `useRouter()` — every call site already holds one.
 */
export function goBack(router: BackRouter): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}
