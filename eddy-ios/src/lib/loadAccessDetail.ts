import type { AccessPointDetailResponse } from '@eddy/types';

export type EstimateStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Publish usable sheet content before nearby routes finish calculating. */
export async function loadAccessDetail(deps: {
  fetchCore: () => Promise<AccessPointDetailResponse>;
  fetchEstimates: () => Promise<Pick<AccessPointDetailResponse, 'nearbyAccessPoints'>>;
  estimateStatus?: (status: EstimateStatus) => void;
  publish: (detail: AccessPointDetailResponse) => void;
  failed: (error: unknown) => void;
  estimatesFailed: (error: unknown) => void;
  signal: AbortSignal;
}): Promise<void> {
  if (deps.signal.aborted) return;
  let core: AccessPointDetailResponse;
  try {
    core = await deps.fetchCore();
  } catch (error) {
    if (!deps.signal.aborted) deps.failed(error);
    return;
  }
  if (deps.signal.aborted) return;
  const eligible = core.accessPoint.isFloatEndpoint !== false &&
    core.nearbyAccessPoints.some((point) => point.isFloatEndpoint !== false);
  deps.estimateStatus?.(eligible ? 'loading' : 'idle');
  deps.publish(core);

  // Parks without a launch have no route estimates to enrich.
  if (!eligible) return;
  try {
    const full = await deps.fetchEstimates();
    if (!deps.signal.aborted) {
      // Enrich only routes; retain the core facts already shown to the reader.
      const estimates = new Map(full.nearbyAccessPoints.map((point) => [point.id, point.estimatedFloatTime]));
      deps.publish({ ...core, nearbyAccessPoints: core.nearbyAccessPoints.map((point) => ({
        ...point, estimatedFloatTime: estimates.get(point.id) ?? null,
      })) });
      deps.estimateStatus?.('ready');
    }
  } catch (error) {
    // Optional estimates must never turn a usable sheet into a failed one.
    if (!deps.signal.aborted) {
      deps.estimateStatus?.('failed');
      deps.estimatesFailed(error);
    }
  }
}
