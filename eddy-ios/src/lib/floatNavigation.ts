/** Constant root identity prevents a second recording presentation on Resume. */
export const recordingPresentationId = () => 'recording';
export const recordingScreenId = (name: string) => name;

/** Discard readiness/planner pages while preserving their originating tab page. */
export function completedFloatRoutes<T extends { key?: string; name: string }>(routes: readonly T[], startKey: string): T[] {
  let cut = routes.findIndex(route => route.key === startKey);
  if (cut < 0) {
    cut = routes.length;
    while (cut > 0 && routes[cut - 1].name === 'float-start') cut--;
  }
  return routes.slice(0, cut);
}
