import { isUpgradeRequired, type AppConfigResponse, type AppFeatureFlags } from '@eddy/types';

export interface AppConfigState {
  config: AppConfigResponse | null;
  features: Partial<AppFeatureFlags>;
  featuresReady: boolean;
  hasRemoteFeatures: boolean;
  loading: boolean;
  upgradeRequired: boolean;
}
export const initialAppConfigState: AppConfigState = {
  config: null, features: {}, featuresReady: false, hasRemoteFeatures: false,
  loading: true, upgradeRequired: false,
};

/** Disk hydration never resolves the launch upgrade decision or beats a server response. */
export function hydrateAppFeatures(previous: AppConfigState, features: Partial<AppFeatureFlags>): AppConfigState {
  return { ...previous, featuresReady: true,
    features: previous.hasRemoteFeatures ? previous.features : features };
}

/** Only successful responses replace flags. Failed responses clear transient notices. */
export function receiveAppConfig(
  previous: AppConfigState,
  config: AppConfigResponse | null,
  currentVersion: string | null,
): AppConfigState {
  return {
    ...previous,
    config,
    features: config ? config.features : previous.features,
    featuresReady: previous.featuresReady || config !== null,
    hasRemoteFeatures: previous.hasRemoteFeatures || config !== null,
    loading: false,
    upgradeRequired: previous.loading
      ? isUpgradeRequired(currentVersion, config?.minSupportedVersion)
      : previous.upgradeRequired,
  };
}

export function appFeatureCacheKey(apiBaseUrl: string, environment: string): string {
  return `eddy:app-features:v1:${encodeURIComponent(apiBaseUrl.replace(/\/+$/, ''))}:${encodeURIComponent(environment)}`;
}

/** Whitelist booleans only: no notices, version floors, or unrecognised future flags. */
export function parseAppFeatureCache(raw: string | null): Partial<AppFeatureFlags> {
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const flags: Partial<AppFeatureFlags> = {};
    for (const key of ['campingHeatmap', 'crowdSignal', 'floatMode', 'floatSearch', 'push', 'planner', 'chat'] as const) {
      const flag = (value as Record<string, unknown>)[key];
      if (typeof flag === 'boolean') flags[key] = flag;
    }
    return flags;
  } catch { return {}; }
}
