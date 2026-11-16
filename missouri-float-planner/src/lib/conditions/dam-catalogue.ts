import type { DamSnapshot } from '@shared/dam-types';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { buildSnapshot } from '@/lib/data/dams';

/** A missing observation affects its own card, never the entire catalogue. */
export function conditionsDamCatalogue(summaries: DamSnapshot[]) {
  const readings = new Map(summaries.map(dam => [dam.id, dam]));
  // A dam with no reading is built the way every other snapshot is, with no
  // metrics and no schedule. It then carries what the registry knows about the
  // project (its SWPA reference, its floor, its tailwater), so a card can still
  // tell "this dam has no hourly schedule" from "its schedule is missing" during
  // an outage. A hand-built stand-in lacked those and would have told a reader
  // that Table Rock publishes no schedule.
  const dams: DamSnapshot[] = Object.values(USACE_DAMS).map(dam => readings.get(dam.id) ?? buildSnapshot(dam, {}, []));
  // Retry immediately only when the whole stored catalogue is unavailable.
  // Partial results keep the regular five-minute refresh policy.
  const damsUnavailable = !dams.some(dam => readings.has(dam.id));
  return { dams, damsUnavailable };
}
