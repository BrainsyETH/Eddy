import { FLOAT_BOATS, FLOAT_SEARCH_DEFAULT_BOAT, floatBoatLabel, type FloatBoat } from '@eddy/conditions/float-search';

/** Runtime values can come from links, saved drafts, or older app storage. */
export function isFloatVessel(value: unknown): value is FloatBoat {
  return typeof value === 'string' && FLOAT_BOATS.includes(value as FloatBoat);
}

/** Every new float has a vessel; an explicit valid choice always wins. */
export function floatVessel(value: unknown): FloatBoat {
  return isFloatVessel(value) ? value : FLOAT_SEARCH_DEFAULT_BOAT;
}

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
