// eddy-ios/src/map/serviceLayers.ts
// Which map layer draws a given service, and what to call it.
//
// ── WHY THIS IS NOT IN layers.ts ──────────────────────────────────────────
//
// Two reasons, and the second is the load-bearing one.
//
// `layers.ts` is the THEMED catalog: every entry resolves a colour through the
// palette, so the module pulls `@/theme/*` at runtime. This file is pure — types
// in, booleans and strings out — and pure is what the web suite can execute.
// That suite is the only runner the Expo app has, and it resolves `@/*` to its
// OWN src/, so any module reachable from a test must be free of app-path imports
// at runtime. `mappable.ts` lives apart for exactly this reason; `tabs.ts`
// documents the same constraint from the other side.
//
// So: layer DEFINITIONS (label, colour, icon) stay in layers.ts. Layer
// MEMBERSHIP — the rule deciding which services a layer draws — lives here,
// where it can be tested.
//
// ── WHAT THIS REPLACED ────────────────────────────────────────────────────
//
// A single exported list of type strings:
//
//   OUTFITTER_SERVICE_TYPES = ['outfitter', 'canoe_rental', 'shuttle', 'lodging']
//
// It was wrong in both directions at once. Three of the four members belong to
// the ACCESS POINT vocabulary and can never appear in the services directory,
// while `cabin_lodge` — 41 of the directory's 156 rows — was absent, so every
// cabin and lodge Eddy has drew on no layer at all, under a row whose own
// description promised lodging.
//
// One list was trying to be two things: type-to-tier and tier-to-layer.
// `serviceTiers` in @eddy/types owns the first, including the capabilities that
// let one business be in two tiers at once. This owns the second.

import { serviceTiers, type ServiceTier } from '@eddy/types';

/** A service, as much of one as any rule here needs to see. */
export interface ServiceLike {
  type: string;
  servicesOffered?: readonly string[] | null;
}

/**
 * The layer keys that draw services — NOT imported from `layers.ts`.
 *
 * Declared locally for the same reason `tabs.ts` declares `LayerTapped`
 * structurally instead of importing `MapPin`: the web suite type-checks this
 * file and resolves `@/*` to its OWN src/, so pulling in `layers.ts` — which
 * imports the palette, the condition colours and `@expo/vector-icons` — fails
 * there even as a type-only import, because the module still has to resolve.
 *
 * A subset of `LayerKey`, and `layers.ts` asserts that at compile time so the
 * two cannot drift apart. The dependency points that way round on purpose: the
 * themed catalog may know about the pure rule, never the reverse.
 */
export type ServiceLayerKey = 'outfitters' | 'lodging' | 'campgrounds';

/**
 * The tier each layer draws.
 *
 * Hazards, gauges and dams come from other tables entirely and are simply not
 * keys here — asking whether a service belongs on one of them is a fair question
 * that this type answers by refusing to be asked.
 */
export const LAYER_SERVICE_TIER: Record<ServiceLayerKey, ServiceTier> = {
  outfitters: 'rentals',
  lodging: 'lodging',
  campgrounds: 'camping',
};

/**
 * Every layer that needs the services directory, for callers that must ask
 * "should I fetch it at all".
 *
 * ── DERIVED, BECAUSE THE HAND-WRITTEN VERSION WAS ALREADY WRONG ───────────
 *
 * The map screen gated its one services request on
 * `layers.includes('campgrounds') || layers.includes('outfitters')`, written
 * before the lodging tier existed and never revisited. A reader who switched on
 * Cabins & lodges and switched off Rentals & shuttles — which the tier chips
 * allow, independently — got a layer that was visibly ON and permanently empty:
 * no pins, no count, and no coverage line to explain any of it, because the
 * fetch that feeds all three never ran.
 *
 * Reading the keys off the table means a fourth service layer cannot
 * reintroduce that. It is the same lesson as `OUTFITTER_SERVICE_TYPES`: a list
 * of keys maintained by hand beside a table that already holds them is a second
 * source of truth waiting to drift.
 */
export const SERVICE_LAYER_KEYS = Object.keys(LAYER_SERVICE_TIER) as ServiceLayerKey[];

/** Whether a service belongs on a given layer. */
export function serviceOnLayer(service: ServiceLike, layer: ServiceLayerKey): boolean {
  return serviceTiers(service).includes(LAYER_SERVICE_TIER[layer]);
}

/**
 * Eddy's words for a service's type, in one table rather than three.
 *
 * There were two copies of this — `RiverMap` and the planner strip — and NEITHER
 * had a key for `cabin_lodge`, so the directory's own third type fell through to
 * `type.replace(/_/g, ' ')` and would have been drawn on the map as the
 * lowercase string "cabin lodge". The website has said "Cabin & Lodge" the whole
 * time (see NearbyServices.tsx), which makes it a drift rather than a gap.
 */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  outfitter: 'Outfitter',
  canoe_rental: 'Canoe rental',
  shuttle: 'Shuttle',
  // Both vocabularies' word for the same thing, so a place is named identically
  // whether it reached the screen from the directory or from an access point.
  lodging: 'Cabin or lodge',
  cabin_lodge: 'Cabin or lodge',
  campground: 'Campground',
};

/** What a tier is called when the type itself is a word Eddy has not learnt. */
const TIER_LABELS: Record<ServiceTier, string> = {
  rentals: 'Rentals & shuttles',
  camping: 'Campground',
  lodging: 'Cabin or lodge',
};

/**
 * The fallback is the TIER's label, never the raw string.
 *
 * A database token is not a thing to show somebody, and a type Eddy has not
 * learnt about is still a boat rental or a bed as far as the reader is
 * concerned. `serviceTiers` never returns an empty array, so the `?? 'rentals'`
 * is belt-and-braces rather than a real branch.
 */
export function serviceTypeLabel(service: ServiceLike): string {
  return SERVICE_TYPE_LABELS[service.type] ?? TIER_LABELS[serviceTiers(service)[0] ?? 'rentals'];
}

/**
 * Eddy's words for what a service OFFERS.
 *
 * The river screen prints the first two offerings under a service's name and
 * printed them raw — "canoe_rental · kayak_rental" — which is the same lowercase
 * database token that used to reach the map as "cabin lodge", in a different
 * column. A curated enum is still an enum, and none of its members is a phrase
 * anybody says out loud.
 *
 * Falls back to de-underscoring rather than to the raw string, because this
 * vocabulary is a 26-value list that will grow and a missing key should read as
 * slightly plain rather than as a leak.
 */
const OFFERING_LABELS: Record<string, string> = {
  canoe_rental: 'Canoe rental',
  kayak_rental: 'Kayak rental',
  raft_rental: 'Raft rental',
  tube_rental: 'Tube rental',
  jon_boat_rental: 'Jon boat rental',
  shuttle: 'Shuttle',
  camping_primitive: 'Primitive camping',
  camping_rv: 'RV camping',
  cabins: 'Cabins',
  lodge_rooms: 'Lodge rooms',
  general_store: 'General store',
  food_service: 'Food',
  showers: 'Showers',
  fishing_supplies: 'Fishing supplies',
  horseback_riding: 'Horseback riding',
  swimming_pool: 'Pool',
  wifi: 'Wi-Fi',
  potable_water: 'Drinking water',
  fire_rings: 'Fire rings',
  picnic_tables: 'Picnic tables',
  boat_ramp: 'Boat ramp',
  dump_station: 'Dump station',
  flush_toilets: 'Flush toilets',
  vault_toilets: 'Vault toilets',
  laundry: 'Laundry',
  playground: 'Playground',
};

export function offeringLabel(offering: string): string {
  return (
    OFFERING_LABELS[offering] ??
    offering.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}
