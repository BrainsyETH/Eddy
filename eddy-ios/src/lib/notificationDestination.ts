/** Preserve the alert's exact subject and management context on notification taps.
 * Unqualified routes stay in the active tab; on cold launch that is the app's root tab.
 */
export function notificationDestination(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const siteId = typeof data.gaugeSiteId === 'string' ? data.gaugeSiteId : null;
  const slug = typeof data.riverSlug === 'string' ? data.riverSlug : null;
  const alertId = typeof data.alertId === 'string' ? data.alertId : null;
  const alertSource = typeof data.alertSource === 'string' ? data.alertSource : null;
  const alertParams = alertId ? { alertId, ...(alertSource ? { alertSource } : {}) } : {};
  if (siteId) return { pathname: '/gauge/[siteId]' as const, params: { siteId, ...alertParams } };
  if (slug) return { pathname: '/river/[slug]' as const, params: { slug, ...alertParams } };
  // Digests and older payloads without a subject simply foreground the app.
  return null;
}
