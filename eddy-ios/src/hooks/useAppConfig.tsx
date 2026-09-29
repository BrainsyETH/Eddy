// eddy-ios/src/hooks/useAppConfig.tsx
// Loads remote config at startup and on resume and exposes it app-wide.
//
// The forced-upgrade check lives here rather than in a screen so there is
// exactly one place that can block the app, and so feature flags are read the
// same way everywhere.
//
// An unreachable launch config does not require an upgrade. Later refreshes
// update flags and notices but preserve the launch-time upgrade decision.
// Camping defaults off when config is unavailable.

import { campingHeatmapEnabled, crowdSignalEnabled } from '@/lib/campingFeature';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Constants from 'expo-constants';
import type { AppConfigResponse, AppFeatureFlags } from '@eddy/types';
import { onForeground } from '@/lib/foreground';
import { fetchAppConfig } from '@/api/client';
import { initialAppConfigState, receiveAppConfig } from '@/lib/appConfigState';

const DEFAULT_FEATURES: AppFeatureFlags = {
  campingHeatmap: false,
  crowdSignal: false,
  push: true,
  planner: true,
  chat: false,
};

interface AppConfigValue {
  config: AppConfigResponse | null;
  loading: boolean;
  /** Launch-time decision; foreground flag refresh cannot interrupt a session. */
  upgradeRequired: boolean;
  features: AppFeatureFlags;
  /** Operator banner, e.g. an upstream data outage. */
  notice: string | null;
}

const AppConfigContext = createContext<AppConfigValue>({
  config: null,
  loading: true,
  upgradeRequired: false,
  features: DEFAULT_FEATURES,
  notice: null,
});

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialAppConfigState);
  const { config, loading, upgradeRequired } = state;

  useEffect(() => {
    let controller: AbortController | null = null;
    let active = true;
    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const next = await fetchAppConfig(current.signal);
      if (active && !current.signal.aborted) {
        setState((previous) =>
          receiveAppConfig(previous, next, Constants.expoConfig?.version ?? null),
        );
      }
    }
    void load();
    const off = onForeground(() => void load());
    return () => {
      active = false;
      controller?.abort();
      off();
    };
  }, []);

  const value = useMemo<AppConfigValue>(() => {
    return {
      config,
      loading,
      upgradeRequired,
      features: {
        ...DEFAULT_FEATURES,
        ...config?.features,
        campingHeatmap: campingHeatmapEnabled(config?.features),
        crowdSignal: crowdSignalEnabled(config?.features),
      },
      notice: config?.notice ?? null,
    };
  }, [config, loading, upgradeRequired]);

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigValue {
  return useContext(AppConfigContext);
}
