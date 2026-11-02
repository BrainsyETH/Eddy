// src/lib/services/offerings.ts
// Display ordering and the grouped summary for nearby-service offerings
// (rentals and amenities). Rendered by components/river/OfferingSummary in the
// guide directory (DirectoryCards), the river report (RiverServices) and the
// planner directory (NearbyServices), so all three read the same way.

import type { ServiceOffering } from '@/types/api';

// Priority order for compact display: lead with what a floater decides on
// (boats, shuttle, where to sleep) before back-of-house amenities.
const OFFERING_ORDER: ServiceOffering[] = [
  'canoe_rental',
  'kayak_rental',
  'raft_rental',
  'tube_rental',
  'jon_boat_rental',
  'shuttle',
  'cabins',
  'lodge_rooms',
  'camping_primitive',
  'camping_rv',
  'general_store',
  'food_service',
  'showers',
  'swimming_pool',
  'fishing_supplies',
  'horseback_riding',
  'wifi',
  'potable_water',
  'boat_ramp',
  'flush_toilets',
  'vault_toilets',
  'fire_rings',
  'picnic_tables',
  'dump_station',
  'laundry',
  'playground',
];

const RANK = new Map<string, number>(OFFERING_ORDER.map((o, i) => [o, i]));

/** Sort raw offering keys by display priority. */
export function orderedOfferings(offerings: string[] | null | undefined): string[] {
  return [...(offerings ?? [])].sort(
    (a, b) => (RANK.get(a) ?? 999) - (RANK.get(b) ?? 999),
  );
}

// ---------------------------------------------------------------------------
// Consolidated summary — the guide directory's replacement for one pill per
// offering. A big outfitter or a state park carries eight offerings, and eight
// pills wrapped to three rows of the same visual weight as the NPS badge. The
// summary groups them into at most three short lines a reader scans by
// question: what can I float, where can I sleep, what else is there.

/** Offering nouns as they read mid-sentence. Typed as a full Record so a new
 *  ServiceOffering cannot be added without a summary noun. */
const SUMMARY_NOUNS: Record<ServiceOffering, string> = {
  canoe_rental: 'canoes',
  kayak_rental: 'kayaks',
  raft_rental: 'rafts',
  tube_rental: 'tubes',
  jon_boat_rental: 'jon boats',
  shuttle: 'shuttle',
  camping_primitive: 'tent sites',
  camping_rv: 'RV sites',
  cabins: 'cabins',
  lodge_rooms: 'lodge rooms',
  general_store: 'store',
  food_service: 'food',
  showers: 'showers',
  fishing_supplies: 'fishing supplies',
  horseback_riding: 'horseback riding',
  swimming_pool: 'pool',
  wifi: 'Wi-Fi',
  potable_water: 'water',
  fire_rings: 'fire rings',
  picnic_tables: 'picnic tables',
  boat_ramp: 'boat ramp',
  dump_station: 'dump station',
  flush_toilets: 'flush toilets',
  vault_toilets: 'vault toilets',
  laundry: 'laundry',
  playground: 'playground',
};

const FLOAT_OFFERINGS = new Set<string>([
  'canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'jon_boat_rental', 'shuttle',
]);
const STAY_OFFERINGS = new Set<string>(['cabins', 'lodge_rooms', 'camping_primitive', 'camping_rv']);

export type OfferingGroup = 'Float' | 'Stay' | 'Also';

export interface OfferingLine {
  group: OfferingGroup;
  text: string;
}

/** "canoes, kayaks" → "Canoes, kayaks". */
function sentence(nouns: string[]): string {
  const text = nouns.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Group a service's offerings into at most three lines — Float (boats and
 * shuttle), Stay (cabins, rooms, sites), Also (everything else) — in display
 * priority. The Also line names `maxExtras` amenities and counts the rest.
 * Unknown keys are dropped; duplicates collapse. Empty groups are omitted.
 */
export function offeringSummary(
  offerings: string[] | null | undefined,
  { maxExtras = 3 }: { maxExtras?: number } = {},
): OfferingLine[] {
  const known = Array.from(new Set(orderedOfferings(offerings))).filter(
    (o): o is ServiceOffering => o in SUMMARY_NOUNS,
  );
  const float = known.filter((o) => FLOAT_OFFERINGS.has(o));
  const stay = known.filter((o) => STAY_OFFERINGS.has(o));
  const also = known.filter((o) => !FLOAT_OFFERINGS.has(o) && !STAY_OFFERINGS.has(o));

  const lines: OfferingLine[] = [];
  if (float.length) lines.push({ group: 'Float', text: sentence(float.map((o) => SUMMARY_NOUNS[o])) });
  if (stay.length) lines.push({ group: 'Stay', text: sentence(stay.map((o) => SUMMARY_NOUNS[o])) });
  if (also.length) {
    const named = also.slice(0, Math.max(0, maxExtras)).map((o) => SUMMARY_NOUNS[o]);
    const rest = also.length - named.length;
    const text = named.length ? sentence(named) : '';
    lines.push({ group: 'Also', text: rest > 0 ? `${text}${text ? ' ' : ''}+${rest} more` : text });
  }
  return lines;
}
