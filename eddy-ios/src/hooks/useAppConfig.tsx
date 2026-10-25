// eddy-ios/src/hooks/useAppConfig.tsx
// Loads remote config at startup and on resume and exposes it app-wide.
//
// The forced-upgrade check lives here rather than in a screen so there is
// exactly one place that can block the app, and so feature flags are read the
// same way everywhere.
//
// An unreachable launch config does not require an upgrade. Later refreshes
// update flags and notices but preserve the launch-time upgrade decision.
// Failed refreshes retain flags from the last success, including the disk cache.
// Camping defaults off only when neither the server nor the cache supplies it.

import { campingHeatmapEnabled, crowdSignalEnabled } from '@/lib/campingFeature';
import { floatModeEnabled } from '@/lib/floatModeFeature';
import { floatSearchEnabled } from '@/lib/floatSearchFeature';
import { resolveEnvironment } from '@/lib/monitoring';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppConfigResponse, AppFeatureFlags } from '@eddy/types';
import { onForeground } from '@/lib/foreground';
import { BASE_URL, fetchAppConfig } from '@/api/client';
import { initialAppConfigState, receiveAppConfig, hydrateAppFeatures, finishAppFeatureWait, appFeatureCacheKey, parseAppFeatureCache } from '@/lib/appConfigState';

const DEFAULT_FEATURES: AppFeatureFlags = {
  campingHeatmap: false,
  crowdSignal: false,
  floatMode: false,
  floatSearch: false,
  push: true,
  planner: true,
  chat: false,
};

interface AppConfigValue {
  config: AppConfigResponse | null;
  loading: boolean;
  featuresReady: boolean;
  /** Launch-time decision; foreground flag refresh cannot interrupt a session. */
  upgradeRequired: boolean;
  features: AppFeatureFlags;
  /** Operator banner, e.g. an upstream data outage. */
  notice: string | null;
}

const AppConfigContext = createContext<AppConfigValue>({
  config: null,
  loading: true,
  featuresReady: false,
  upgradeRequired: false,
  features: DEFAULT_FEATURES,
  notice: null,
});

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialAppConfigState);
  const { config, loading, upgradeRequired, featuresReady, features: effectiveFeatures } = state;

  useEffect(() => {
    let controller: AbortController | null = null;
    let active = true;
    const cacheKey = appFeatureCacheKey(BASE_URL, resolveEnvironment());
    // A stuck disk read must not hold the controls indefinitely. The network runs in parallel.
    const hydrate = (raw: string | null) => {
      if (!active) return;
      clearTimeout(cacheTimeout);
      setState(previous => hydrateAppFeatures(previous, parseAppFeatureCache(raw)));
    };
    const cacheTimeout = setTimeout(() => {
      if (active) setState(finishAppFeatureWait);
    }, 1000);
    void AsyncStorage.getItem(cacheKey).then(hydrate, () => hydrate(null));
    // Serialize writes so an older successful refresh cannot finish after a newer one.
    let cacheWrite = Promise.resolve();
    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const next = await fetchAppConfig(current.signal);
      if (active && !current.signal.aborted) {
        if (next) {
          const flags = JSON.stringify(parseAppFeatureCache(JSON.stringify(next.features)));
          cacheWrite = cacheWrite.then(() => AsyncStorage.setItem(cacheKey, flags)).catch(() => {});
        }
        setState((previous) =>
          receiveAppConfig(previous, next, Constants.expoConfig?.version ?? null),
        );
      }
    }
    void load();
    const off = onForeground(() => void load());
    return () => {
      active = false;
      clearTimeout(cacheTimeout);
      controller?.abort();
      off();
    };
  }, []);

  const value = useMemo<AppConfigValue>(() => {
    const environment = resolveEnvironment();
    return {
      config,
      loading,
      featuresReady,
      upgradeRequired,
      features: {
        ...DEFAULT_FEATURES,
        ...effectiveFeatures,
        campingHeatmap: campingHeatmapEnabled(effectiveFeatures),
        crowdSignal: crowdSignalEnabled(effectiveFeatures),
        floatMode: floatModeEnabled(effectiveFeatures, environment),
        floatSearch: floatSearchEnabled(effectiveFeatures, environment),
      },
      notice: config?.notice ?? null,
    };
  }, [config, loading, upgradeRequired, featuresReady, effectiveFeatures]);

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigValue {
  return useContext(AppConfigContext);
}
