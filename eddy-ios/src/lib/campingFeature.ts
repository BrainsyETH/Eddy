/** Additive, fail-closed feature gate for old servers and malformed configuration. */
export function campingHeatmapEnabled(features: unknown): boolean {
  return (
    typeof features === 'object' &&
    features !== null &&
    'campingHeatmap' in features &&
    features.campingHeatmap === true
  );
}
