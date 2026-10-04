import type { AccessPointDetail, MapAccessPoint } from '@eddy/types';
import { useAppConfig } from '@/hooks/useAppConfig';
import { planCampingDestination, type PlanDetailDestination } from '@/lib/planDestinations';
import { CampgroundAvailability } from './map-sheet/CampgroundAvailability';
import { accessAvailability, accessAvailabilityName } from './map-sheet/availabilitySource';
import { localToday } from './map-sheet/availability';

/** The map sheet's exact panel, immediately below the endpoint it describes. */
export function PlanEndpointCamping({ point, detail, loading, riverSlug, onOpenDetail }: {
  point: MapAccessPoint;
  detail: AccessPointDetail | null;
  loading: boolean;
  riverSlug: string;
  onOpenDetail: (destination: PlanDetailDestination) => void;
}) {
  const { features } = useAppConfig();
  const availability = accessAvailability(detail);
  const today = localToday();
  if (!availability && !point.hasLiveAvailability) return null;
  const destination = planCampingDestination(riverSlug, point, availability, today, !!features.campingHeatmap);
  return (
    <CampgroundAvailability
      availability={availability}
      name={accessAvailabilityName(detail, point.name)}
      today={today}
      pending={!availability}
      pendingLabel={!loading ? 'Campsite availability unavailable' : undefined}
      onPress={destination ? () => onOpenDetail(destination) : undefined}
    />
  );
}
