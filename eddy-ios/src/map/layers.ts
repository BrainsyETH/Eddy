// eddy-ios/src/map/layers.ts
// What the map can draw, and what each thing is called and coloured.
//
// One definition per layer, in one place, because the same list drives three
// things that would otherwise drift: the layer sheet, the pin colours, and the
// callout that appears when a pin is tapped. A row in the sheet is only a legend
// if its colour is literally the colour of the pins it toggles.
//
// COLOURS ARE ROLES, NOT HUES. Every value here resolves through the palette or
// through CONDITION_SYSTEM. Hazards borrow the canonical `dangerous` red on
// purpose: a paddler who has learnt that red means "do not float" should read a
// low-water dam the same way without being taught twice.

import { primary, type Palette } from '@/theme/palette';
import { conditionColor } from '@/theme/conditions';
import { flowBandColor } from '@/theme/flow';
import type { Ionicons } from '@expo/vector-icons';

export type LayerKey = 'access' | 'campgrounds' | 'gauges' | 'allGauges' | 'hazards' | 'outfitters';

export interface LayerDef {
  key: LayerKey;
  label: string;
  /** One line under the label, saying what the layer actually shows. */
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: (colors: Palette) => string;
  /**
   * Layers this row switches, when the row is a THING rather than a layer.
   *
   * Gauges are one thing on the map — a station with a number on it — drawn in
   * two tiers, and the sheet used to offer them as two unrelated switches
   * sitting next to each other. Nothing said the second was the complement of
   * the first, so "Gauges" read as a subset of "Other USGS gauges" and turning
   * both on looked like a way of drawing some of them twice. One row now owns
   * the question, and the tiers are a strip underneath it.
   *
   * The KEYS ARE STILL SEPARATE everywhere else — the two tiers are drawn by
   * different code with different rules (see contextGaugeLayer in RiverMap),
   * and merging them into one layer key would merge those too.
   */
  tiers?: LayerKey[];
  /** How this layer is named inside a tier strip, where the row is the context. */
  tierLabel?: string;
  /** True when the layer only ever appears as a tier and never as a row. */
  nested?: boolean;
}

/**
 * Access points and Eddy-rated gauges are on by default.
 *
 * The two questions someone opens the map with are "where can I get on this
 * river" and "is there any water in it", and those are exactly these two layers.
 * Everything else is a follow-up question and stays off until asked — a river
 * under five layers of pins answers nothing. The choice sticks for the session.
 *
 * `allGauges` is deliberately NOT here. The curated network is the product and
 * it stays the thing the map opens on; the national tier is a reference someone
 * asks for. Adding it to the defaults would also mean every cold start fires a
 * viewport request before anyone has asked a question.
 */
export const DEFAULT_LAYERS: LayerKey[] = ['access', 'gauges'];

/**
 * Below this zoom the national layer draws nothing.
 *
 * A continental viewport holds ~14,000 gauges; there is no payload and no
 * clustering budget that makes drawing them all useful, and the strategy doc is
 * explicit that reference gauges are FOUND, not browsed. The curated network
 * still answers the zoomed-out question the map exists for — "where can I float
 * today" — so nothing is lost by making this layer earn its request.
 */
export const MIN_ALL_GAUGES_ZOOM = 7;

export const MAP_LAYERS: LayerDef[] = [
  {
    key: 'access',
    label: 'Access points',
    description: 'Put-ins, take-outs and ramps',
    icon: 'location',
    color: (c) => c.accent,
  },
  {
    key: 'gauges',
    // ONE ROW FOR ONE QUESTION — "show me gauges" — with the partition offered
    // as a strip underneath rather than as a second switch beside it. The two
    // tiers are still named for what separates them (see tierLabel below and on
    // the row after this one), because that distinction is the whole point:
    // both hold USGS gauges, and only one of them carries a verdict.
    label: 'Gauges',
    description: 'Live USGS readings on the water',
    tiers: ['gauges', 'allGauges'],
    tierLabel: 'Eddy-rated',
    icon: 'speedometer-outline',
    // Deep River Teal from the brand palette rather than coral: a gauge is a
    // measurement, not a destination, and it should read as instrumentation
    // against the accent-coloured places. Sourced from the palette scale so it
    // moves with the brand instead of being a hex nobody can trace.
    color: (c) => (c.scheme === 'dark' ? primary[300] : primary[600]),
  },
  {
    key: 'allGauges',
    // "Other", not "All". This layer has always DROPPED the curated gauges —
    // the screen filters them out so a rated station is not drawn twice, once
    // as a verdict and once as a comparison a pixel apart — but the old label
    // claimed the opposite, and nothing on screen said the two rows partitioned
    // the same network between them.
    label: 'Other USGS gauges',
    tierLabel: 'Other USGS',
    // A TIER, not a row. It reaches the sheet through the Gauges row above,
    // which is the only place it has ever made sense: this layer is defined as
    // the complement of that one, and a switch that says so out loud is worth
    // more than a switch of its own.
    nested: true,
    // Says what it is AND what it is not. Someone who switches this on gets
    // thousands of dots that look like the gauge pins above them, and the one
    // thing they must understand is that Eddy has not rated any of them.
    description: 'The rest of the USGS network — reading only',
    icon: 'globe-outline',
    // The middle of the flow ramp, so the sheet row is literally the colour of
    // an average pin it draws — the same "a row is only a legend if it matches"
    // rule the rest of this file follows.
    color: () => flowBandColor('normal'),
  },
  {
    key: 'hazards',
    label: 'Hazards',
    description: 'Low-water dams, strainers, portages',
    icon: 'warning-outline',
    color: () => conditionColor('dangerous'),
  },
  {
    key: 'campgrounds',
    label: 'Campgrounds',
    description: 'Places to sleep on the river',
    icon: 'bonfire-outline',
    color: (c) => c.success,
  },
  {
    key: 'outfitters',
    label: 'Outfitters',
    description: 'Rentals, shuttles and lodging',
    icon: 'boat-outline',
    color: (c) => c.warm,
  },
];

/**
 * The rows the layers sheet draws, which is MAP_LAYERS minus the tiers.
 *
 * Kept as a derived list rather than a second array: a tier still needs its
 * label, its colour and its icon everywhere else — the pin callout looks a
 * layer up by key, and the tier strip draws its own chips from these — so
 * removing it from MAP_LAYERS would break more than it tidied.
 */
export const SHEET_LAYERS: LayerDef[] = MAP_LAYERS.filter((layer) => !layer.nested);

/** Every layer key one sheet row switches: its tiers, or just itself. */
export function layerKeysFor(layer: LayerDef): LayerKey[] {
  return layer.tiers ?? [layer.key];
}

/** Service types that belong under the Outfitters row rather than Campgrounds. */
export const OUTFITTER_SERVICE_TYPES = ['outfitter', 'canoe_rental', 'shuttle', 'lodging'];
