/** Additive, fail-closed feature gate for old servers and malformed configuration. */
export function campingHeatmapEnabled(features: unknown): boolean {
  return (
    typeof features === 'object' &&
    features !== null &&
    'campingHeatmap' in features &&
    features.campingHeatmap === true
  );
}
/** Camping demand (Quiet → Packed) on Today. Same fail-closed rule. */
export function crowdSignalEnabled(features: unknown): boolean {
  return (
    typeof features === 'object' &&
    features !== null &&
    'crowdSignal' in features &&
    features.crowdSignal === true
  );
}
