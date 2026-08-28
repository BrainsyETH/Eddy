// eddy-ios/src/lib/foreground.ts
// One AppState listener, shared by everything that revalidates on foreground.
//
// ── The gap this closes ─────────────────────────────────────────────────────
// The tab screens stay mounted for the life of the process, and most of the
// data hooks fetch once and latch: statewide readings retry only on failure,
// gauges and dams latch on success, Today's rivers load on mount and manual
// pull. Nothing anywhere re-asked on foreground — so an app resumed from an
// overnight suspension painted yesterday's condition colours as current, with
// none of the aging treatment the disk path gets. The dam screen states the
// principle this violates: "live data that only arrives once is cached data
// with no cache policy."
//
// Each subscriber decides its own staleness — this module only says "the app
// is in front of someone again". One module-scope AppState subscription
// rather than one per hook, so the listener count does not scale with mounted
// consumers and the wiring is greppable in one place.

import { AppState } from 'react-native';

const listeners = new Set<() => void>();
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  // Never removed: module lifetime is process lifetime, and the set below is
  // what grows and shrinks.
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    // Copied before iterating — a listener that unsubscribes in response
    // would otherwise mutate the set mid-loop.
    for (const listener of [...listeners]) listener();
  });
}

/**
 * Run `listener` each time the app returns to the foreground.
 * Returns the unsubscribe, for an effect cleanup.
 */
export function onForeground(listener: () => void): () => void {
  ensureSubscribed();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
