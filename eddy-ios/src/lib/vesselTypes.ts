import { FLOAT_BOATS, floatBoatLabel } from '@eddy/conditions/float-search';

export interface VesselType {
  id: string;
  slug: string;
  speeds?: { normal?: number | null };
}

/** Read the same configured baseline speeds as the estimate, never a second table. */
export function vesselSpeedInfo(vessels: VesselType[]): string {
  const lines = FLOAT_BOATS.map(boat => {
    const speed = vessels.find(vessel => vessel.slug === boat)?.speeds?.normal;
    const label = typeof speed === 'number' && Number.isFinite(speed) && speed > 0
      ? `${speed.toLocaleString([], { maximumFractionDigits: 1 })} mph` : 'Unavailable';
    return `${floatBoatLabel(boat)} · ${label}`;
  });
  return `Typical speeds in normal water:\n\n${lines.join('\n')}\n\nRiver flow adjusts your estimate. Stops aren’t included.`;
}

/** One shared request per session. A failed request can be retried. */
export function vesselTypeLoader(load: () => Promise<{ vesselTypes: VesselType[] }>) {
  let pending: Promise<VesselType[]> | null = null;
  return () => {
    if (!pending) pending = load().then(result => result.vesselTypes).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
