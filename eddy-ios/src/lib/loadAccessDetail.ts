import type { AccessPointDetailResponse } from '@eddy/types';

/** Publish usable sheet content before nearby routes finish calculating. */
export async function loadAccessDetail(deps: {
  fetch: (includeEstimates: boolean) => Promise<AccessPointDetailResponse>;
  publish: (detail: AccessPointDetailResponse) => void;
  failed: (error: unknown) => void;
  estimatesFailed: (error: unknown) => void;
  signal: AbortSignal;
}): Promise<void> {
  if (deps.signal.aborted) return;
  let core: AccessPointDetailResponse;
  try {
    core = await deps.fetch(false);
  } catch (error) {
    if (!deps.signal.aborted) deps.failed(error);
    return;
  }
  if (deps.signal.aborted) return;
  deps.publish(core);

  // Parks without a launch have no route estimates to enrich.
  if (core.accessPoint.isFloatEndpoint === false ||
      !core.nearbyAccessPoints.some((point) => point.isFloatEndpoint !== false)) return;
  try {
    const full = await deps.fetch(true);
    if (!deps.signal.aborted) {
      // Enrich only routes; retain the core facts already shown to the reader.
      deps.publish({ ...core, nearbyAccessPoints: full.nearbyAccessPoints });
    }
  } catch (error) {
    // Optional estimates must never turn a usable sheet into a failed one.
    if (!deps.signal.aborted) deps.estimatesFailed(error);
  }
}
