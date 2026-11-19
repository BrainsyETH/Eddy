// eddy-ios/src/lib/stackReturn.ts
// Whether the screen directly underneath this one is the place a link points
// at, so the link can go BACK to it instead of pushing a second copy.
//
// The dam screen links to its lake and the lake screen links back to its dam.
// `router.navigate` does not make that pair safe: in a stack it reuses a
// screen only when the FOCUSED route has the same name (expo-router's stack
// router), so from a lake to a dam it pushes, and each round trip added two
// screens to the history. A link that would return to the screen below pops
// instead; any other target is a real new destination and is pushed.
//
// Pure, so the web suite can test it (the app has no runner of its own).

interface StackState {
  index: number;
  routes: readonly { name: string; params?: object }[];
}

/** True when the route under the focused one has this name and this param value. */
export function previousRouteIs(state: StackState | undefined, name: string, param: string, value: string): boolean {
  if (!state || state.index < 1) return false;
  const previous = state.routes[state.index - 1];
  if (!previous || previous.name !== name) return false;
  const params = previous.params as Record<string, unknown> | undefined;
  return params?.[param] === value;
}
