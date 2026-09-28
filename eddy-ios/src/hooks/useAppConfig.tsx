import { campingHeatmapEnabled } from '@/lib/campingFeature';
// eddy-ios/src/hooks/useAppConfig.tsx
// Loads remote config at startup, on resume, and every five minutes and exposes it app-wide.
//
// The forced-upgrade check lives here rather than in a screen so there is
// exactly one place that can block the app, and so feature flags are read the
// same way everywhere.
//
// FAILS OPEN throughout: an unreachable config yields `config: null`, which
// means no upgrade requirement and safe feature defaults. Camping fails closed. The whole point of
// this endpoint is to recover from a bad release, so it must never itself be
// able to cause an outage.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Constants from 'expo-constants';
import {
  isUpgradeRequired,
  type AppConfigResponse,
  type AppFeatureFlags,
} from '@eddy/types';
import { onForeground } from '@/lib/foreground';
import { fetchAppConfig } from '@/api/client';

const DEFAULT_FEATURES: AppFeatureFlags = {
  campingHeatmap: false,
  push: true,
  planner: true,
  chat: false,
};

interface AppConfigValue {
  config: AppConfigResponse | null;
  loading: boolean;
  /** True only when the server explicitly says this build is too old. */
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
  const [config, setConfig] = useState<AppConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let controller: AbortController | null = null;
    let active = true;
    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const next = await fetchAppConfig(current.signal);
      if (active && !current.signal.aborted) {
        setConfig(next);
        setLoading(false);
      }
    }
    void load();
    const off = onForeground(() => void load());
    const timer = setInterval(() => void load(), 300000);
    return () => {
      active = false;
      controller?.abort();
      off();
      clearInterval(timer);
    };
  }, []);

  const value = useMemo<AppConfigValue>(() => {
    const currentVersion = Constants.expoConfig?.version ?? null;
    return {
      config,
      loading,
      upgradeRequired: isUpgradeRequired(
        currentVersion,
        config?.minSupportedVersion,
      ),
      features: {
        ...DEFAULT_FEATURES,
        ...config?.features,
        campingHeatmap: campingHeatmapEnabled(config?.features),
      },
      notice: config?.notice ?? null,
    };
  }, [config, loading]);

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigValue {
  return useContext(AppConfigContext);
}
