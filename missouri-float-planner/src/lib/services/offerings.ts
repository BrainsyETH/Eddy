// src/lib/services/offerings.ts
// Shared labels + display ordering for nearby-service offerings (rentals and
// amenities). Used by the river-report directory (NearbyServices) and the
// blog/guide directory (DirectoryCards) so the two stay in sync.

import type { ServiceOffering } from '@/types/api';

export const OFFERING_LABELS: Record<ServiceOffering, string> = {
  canoe_rental: 'Canoes',
  kayak_rental: 'Kayaks',
  raft_rental: 'Rafts',
  tube_rental: 'Tubes',
  jon_boat_rental: 'Jon Boats',
  shuttle: 'Shuttle',
  camping_primitive: 'Tent Camping',
  camping_rv: 'RV Sites',
  cabins: 'Cabins',
  lodge_rooms: 'Lodge Rooms',
  general_store: 'General Store',
  food_service: 'Food',
  showers: 'Showers',
  fishing_supplies: 'Fishing',
  horseback_riding: 'Horseback',
  swimming_pool: 'Pool',
  wifi: 'Wi-Fi',
  potable_water: 'Water',
  fire_rings: 'Fire Rings',
  picnic_tables: 'Picnic Tables',
  boat_ramp: 'Boat Ramp',
  dump_station: 'Dump Station',
  flush_toilets: 'Flush Toilets',
  vault_toilets: 'Vault Toilets',
  laundry: 'Laundry',
  playground: 'Playground',
};

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

export function offeringLabel(offering: string): string {
  return (OFFERING_LABELS as Record<string, string>)[offering] ?? offering;
}

/** Sort raw offering keys by display priority. */
export function orderedOfferings(offerings: string[] | null | undefined): string[] {
  return [...(offerings ?? [])].sort(
    (a, b) => (RANK.get(a) ?? 999) - (RANK.get(b) ?? 999),
  );
}
