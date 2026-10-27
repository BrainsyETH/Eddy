/** Query placeholders belong to the previous river and must never become
 * interactive points or route endpoints for the newly selected river. */
export function currentPlannerAccessPoints<T>(
  selectedRiverSlug: string | null,
  loadedRiverSlug: string | undefined,
  points: T[] | undefined,
  isPlaceholder: boolean,
): T[] | undefined {
  return selectedRiverSlug && loadedRiverSlug === selectedRiverSlug && !isPlaceholder
    ? points : undefined;
}

interface EndpointSelection {
  putIn: string | null;
  takeOut: string | null;
}

/** Preserve deep-link selections while loading; a completed empty response
 * is authoritative and clears both endpoints, just like a nonempty response. */
export function reconcilePlannerEndpoints(
  points: ReadonlyArray<{ id: string }> | undefined,
  selection: EndpointSelection,
): EndpointSelection {
  if (!points) return selection;
  return {
    putIn: points.some(point => point.id === selection.putIn) ? selection.putIn : null,
    takeOut: points.some(point => point.id === selection.takeOut) ? selection.takeOut : null,
  };
}
