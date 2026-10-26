/** An ongoing recorder is always reachable, even if new starts are disabled. */
export function floatEntryAction(active: boolean, enabled: boolean, routeReady = true): 'return' | 'start' | null {
  if (active) return 'return';
  return enabled && routeReady ? 'start' : null;
}
