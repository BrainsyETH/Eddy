// Internal builds expose Find a Float for QA, just like Float Mode.
// Production and unidentified builds still require the server discovery flag.
export function floatSearchEnabled(features: unknown, environment: string): boolean {
  if (environment === 'development' || environment === 'preview') return true;
  return (
    typeof features === 'object' &&
    features !== null &&
    'floatSearch' in features &&
    (features as { floatSearch?: unknown }).floatSearch === true
  );
}
