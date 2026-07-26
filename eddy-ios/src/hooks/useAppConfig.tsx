// eddy-ios/src/hooks/useAppConfig.tsx
// Loads remote config once at startup and exposes it app-wide.
//
// The forced-upgrade check lives here rather than in a screen so there is
// exactly one place that can block the app, and so feature flags are read the
// same way everywhere.
//
// FAILS OPEN throughout: an unreachable config yields `config: null`, which
// means no upgrade requirement and all features enabled. The whole point of
// this endpoint is to recover from a bad release, so it must never itself be
// able to cause an outage.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { isUpgradeRequired, type AppConfigResponse, type AppFeatureFlags } from '@eddy/types';
import { fetchAppConfig } from '@/api/client';

const DEFAULT_FEATURES: AppFeatureFlags = {
  push: true,
  offlineDownloads: true,
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
    const controller = new AbortController();
    fetchAppConfig(controller.signal)
      .then(setConfig)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const value = useMemo<AppConfigValue>(() => {
    const currentVersion = Constants.expoConfig?.version ?? null;
    return {
      config,
      loading,
      upgradeRequired: isUpgradeRequired(currentVersion, config?.minSupportedVersion),
      features: config?.features ?? DEFAULT_FEATURES,
      notice: config?.notice ?? null,
    };
  }, [config, loading]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigValue {
  return useContext(AppConfigContext);
}
