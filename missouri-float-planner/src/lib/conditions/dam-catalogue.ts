import type { DamSnapshot } from '@shared/dam-types';
import { USACE_DAMS, hasPowerhouse } from '@/lib/flow-providers/usace-registry';

/** A missing observation affects its own card, never the entire catalogue. */
export function conditionsDamCatalogue(summaries: DamSnapshot[]) {
  const readings = new Map(summaries.map(dam => [dam.id, dam]));
  const dams: DamSnapshot[] = Object.values(USACE_DAMS).map(dam => readings.get(dam.id) ?? {
    id: dam.id, name: dam.name, lakeName: dam.lakeName, state: dam.state, lat: dam.lat, lon: dam.lon,
    hasTurbines: hasPowerhouse(dam), generating: null, metrics: {}, schedule: [], sources: [],
  });
  // Retry immediately only when the whole stored catalogue is unavailable.
  // Partial results keep the regular five-minute refresh policy.
  const damsUnavailable = !dams.some(dam => readings.has(dam.id));
  return { dams, damsUnavailable };
}
