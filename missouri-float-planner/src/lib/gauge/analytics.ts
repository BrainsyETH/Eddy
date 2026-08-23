// src/lib/gauge/analytics.ts
// The five gauge-experience events, and the discipline around them.
//
// PRIVACY IS THE CONTRACT, not a styling note: these bags carry the
// provider, the rated/reference/unknown tier, the selected range or context,
// and a missing-data category — and NEVER a reading, a station identifier,
// or a coordinate. That matches the site's existing convention exactly
// (snake_case action, small flat bag, a river named by slug and a user never
// named at all), and the typed params here are what keep a future call site
// from "just adding" the site number to debug something.
//
// WEB ONLY. The phone has no analytics client (Sentry is crash reporting,
// not analytics) and this project deliberately adds none — iOS
// instrumentation and any privacy-label work are separate.

import { trackEvent } from '@/lib/analytics';
import type { StationTier } from '@shared/station-tier';

type GaugeRange = '24h' | '7d' | '30d' | '90d' | '1y' | 'custom';
type GaugeContext = 'ft' | 'cfs';
type MissingDataCategory = 'history' | 'reading' | 'forecast';

interface GaugeEventBase {
  provider: string;
  tier: StationTier;
}

export function trackGaugeRangeChanged(base: GaugeEventBase, range: GaugeRange): void {
  trackEvent('gauge_range_changed', { ...base, range });
}

export function trackGaugeContextChanged(base: GaugeEventBase, context: GaugeContext): void {
  trackEvent('gauge_context_changed', { ...base, context });
}

export function trackGaugeExpandedOpened(base: GaugeEventBase): void {
  trackEvent('gauge_expanded_opened', base as unknown as Record<string, unknown>);
}

export function trackGaugeSourceOpened(base: GaugeEventBase): void {
  trackEvent('gauge_source_opened', base as unknown as Record<string, unknown>);
}

export function trackGaugeDataUnavailable(
  base: GaugeEventBase,
  category: MissingDataCategory,
): void {
  trackEvent('gauge_data_unavailable', { ...base, category });
}

export function rangeLabelForDays(days: number): GaugeRange {
  if (days <= 1) return '24h';
  if (days <= 7) return '7d';
  if (days <= 30) return '30d';
  if (days <= 90) return '90d';
  return '1y';
}
