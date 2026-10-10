// eddy-ios/src/lib/floatModeFeature.ts
// Whether this build shows Float Mode (#1448).
//
// Development and preview (internal) builds always do, so the feature can be
// tested on real phones and on a river before release. Store builds show it
// only once the server's floatMode flag is on, which ships with locked-screen
// tracking: an on-water feature that stops when the phone locks is not one to
// put in front of everybody. Anything unexpected reads as off.

export function floatModeEnabled(features: unknown, environment: string): boolean {
  if (environment === 'development' || environment === 'preview') return true;
  return (
    typeof features === 'object' &&
    features !== null &&
    'floatMode' in features &&
    (features as { floatMode?: unknown }).floatMode === true
  );
}
