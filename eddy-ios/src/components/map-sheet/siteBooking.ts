import type { CampsiteNightState } from '@eddy/types';

/** A provider's exact-site URL wins; otherwise use the known park reservation
 * URL without pretending it preselects the site. Walk-up sites cannot be booked.
 */
export function siteBooking(
  state: CampsiteNightState,
  siteUrl: string | null,
  parkUrl?: string | null,
): { url: string; direct: boolean } | null {
  if (state !== 'open') return null;
  if (siteUrl) return { url: siteUrl, direct: true };
  return parkUrl ? { url: parkUrl, direct: false } : null;
}
