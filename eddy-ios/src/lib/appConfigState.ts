import { isUpgradeRequired, type AppConfigResponse } from '@eddy/types';

export interface AppConfigState {
  config: AppConfigResponse | null;
  loading: boolean;
  upgradeRequired: boolean;
}
export const initialAppConfigState: AppConfigState = {
  config: null,
  loading: true,
  upgradeRequired: false,
};

/** Refresh flags and notices, but decide forced upgrades only at launch. */
export function receiveAppConfig(
  previous: AppConfigState,
  config: AppConfigResponse | null,
  currentVersion: string | null,
): AppConfigState {
  return {
    config,
    loading: false,
    upgradeRequired: previous.loading
      ? isUpgradeRequired(currentVersion, config?.minSupportedVersion)
      : previous.upgradeRequired,
  };
}
