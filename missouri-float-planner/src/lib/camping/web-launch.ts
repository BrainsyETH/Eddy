/** Preview-ready does not imply launch-ready. See docs/camping-web-rollout.md. */
export const campingWebEnabled = () =>
  process.env.CAMPING_WEB_ENABLED === 'true';
