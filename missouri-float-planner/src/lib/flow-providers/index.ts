// src/lib/flow-providers/index.ts
// Registry of flow-data providers, keyed by gauge_stations.provider.
// Adding a source (USACE, a state DNR, ...) means implementing FlowProvider
// and registering it here — no changes to cron jobs or condition logic.

import type { FlowProvider } from './types';
import { UsgsProvider } from './usgs';

export type {
  FlowProvider,
  GaugeReading,
  DailyStatistics,
  HistoricalData,
  HistoricalReading,
} from './types';

const PROVIDERS: Record<string, FlowProvider> = {
  usgs: new UsgsProvider(),
};

export const DEFAULT_PROVIDER_ID = 'usgs';

/** Look up a provider by id; unknown ids log and return null. */
export function getFlowProvider(id: string | null | undefined): FlowProvider | null {
  const provider = PROVIDERS[id || DEFAULT_PROVIDER_ID];
  if (!provider) {
    console.error(`[FlowProviders] Unknown provider id "${id}" — is it registered in src/lib/flow-providers?`);
    return null;
  }
  return provider;
}

/** All registered provider ids. */
export function listFlowProviders(): string[] {
  return Object.keys(PROVIDERS);
}
