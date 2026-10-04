/** One declaration for provider adapters and chart controls. Knowing a station's
 * provider is enough to offer its ranges without waiting on the detail request. */
export interface HistoryCapabilities {
  /** Longest window ending now available at instantaneous resolution. */
  maxInstantDays: number;
  /** Whether longer windows can use daily values. */
  supportsDaily: boolean;
  /** Whether explicit from/to windows are supported. */
  supportsCustomRange: boolean;
}

export const PROVIDER_HISTORY_CAPABILITIES = {
  usgs: { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true },
  nws: { maxInstantDays: 30, supportsDaily: false, supportsCustomRange: false },
  usace: { maxInstantDays: 30, supportsDaily: false, supportsCustomRange: false },
} as const satisfies Record<string, HistoryCapabilities>;

const UNKNOWN_HISTORY_CAPABILITIES: HistoryCapabilities = {
  maxInstantDays: 30, supportsDaily: false, supportsCustomRange: false,
};

/** Server-declared capabilities win. Missing detail is not evidence of a
 * 30-day limit when the picker already identifies a supported provider.
 * Unknown providers remain conservative; never infer USGS from a site id. */
export function resolveHistoryCapabilities(
  provider: string | null | undefined,
  declared?: HistoryCapabilities | null,
): HistoryCapabilities {
  if (declared) return declared;
  switch (provider) {
    case 'usgs': return PROVIDER_HISTORY_CAPABILITIES.usgs;
    case 'nws': return PROVIDER_HISTORY_CAPABILITIES.nws;
    case 'usace': return PROVIDER_HISTORY_CAPABILITIES.usace;
    default: return UNKNOWN_HISTORY_CAPABILITIES;
  }
}
