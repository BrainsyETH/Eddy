/** The Finish action on the arrival prompt (floatSessionStore.ts FINISH_ACTION). */
export const FINISH_FLOAT_ACTION = 'finish-float';

/**
 * A notification action that is a command, not a destination: Finish on the
 * arrival prompt ends the float. Anything else is a plain tap.
 */
export function notificationCommand(actionIdentifier: string | null | undefined, input: unknown): 'finish-float' | null {
  if (actionIdentifier !== FINISH_FLOAT_ACTION) return null;
  const data = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  return data && typeof data.floatReminder === 'string' ? 'finish-float' : null;
}

/** Preserve the alert's exact subject and management context on notification taps.
 * Unqualified routes stay in the active tab; on cold launch that is the app's root tab.
 */
export function notificationDestination(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  // An on-water reminder (floatReminders.ts) opens the float it is about.
  if (typeof data.floatReminder === 'string') return { pathname: '/float-mode' as const };
  // A float Eddy ended on its own (floatEnding.ts) opens its recap.
  if (typeof data.floatEnded === 'string') return { pathname: '/float-recap' as const, params: { id: data.floatEnded } };
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
