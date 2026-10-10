import type { CampsiteAvailabilitySummary, MapAccessPoint } from '@eddy/types';
import { nightBars } from '../components/map-sheet/availability';

export type PlanDetailDestination =
  | { pathname: '/river/[slug]/access/[accessSlug]'; params: { slug: string; accessSlug: string } }
  | { pathname: '/camping'; params: { facility: string; river: string; night: string } }
  | {
      pathname: '/float-start';
      params: { riverSlug: string; putInId: string; takeOutId: string; shortCode?: string; plannerMph?: string };
    };

export function planAccessDestination(
  riverSlug: string,
  point: Pick<MapAccessPoint, 'slug'>,
): PlanDetailDestination | null {
  if (!riverSlug || !point.slug) return null;
  return { pathname: '/river/[slug]/access/[accessSlug]', params: { slug: riverSlug, accessSlug: point.slug } };
}

/** Older availability payloads have no facility ID; their place page still works. */
export function planCampingDestination(
  riverSlug: string,
  point: Pick<MapAccessPoint, 'slug'>,
  availability: CampsiteAvailabilitySummary | null,
  today: string,
  campingEnabled: boolean,
): PlanDetailDestination | null {
  // Match the panel: tonight, or its first measured future night. Sparse
  // summaries use the labelled weekend window instead of silently opening today.
  const windowStart = availability?.window?.startDate;
  const night = nightBars(availability, today).find((bar) => bar.mark !== 'none')?.date
    ?? (windowStart && windowStart >= today ? windowStart : today);
  return campingEnabled && availability?.facilityId
    ? { pathname: '/camping', params: { facility: availability.facilityId, river: riverSlug, night } }
    : planAccessDestination(riverSlug, point);
}
