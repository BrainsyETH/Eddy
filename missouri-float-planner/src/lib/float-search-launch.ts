/** Discovery switches only: direct search links and the API remain available for QA.
 * Separate switches let web launch before the native device checks are complete.
 */
export function floatSearchLaunch(env: Record<string, string | undefined> = process.env) {
  return {
    web: env.FLOAT_SEARCH_ENABLED === 'true',
    ios: env.FLOAT_SEARCH_IOS_ENABLED === 'true',
  };
}
