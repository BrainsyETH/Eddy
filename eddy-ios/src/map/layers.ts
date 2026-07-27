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
import type { EddySymbolName } from '@/components/EddySymbol';
import type { Ionicons } from '@expo/vector-icons';

export type LayerKey = 'access' | 'campgrounds' | 'gauges' | 'allGauges' | 'hazards' | 'outfitters';

export interface LayerDef {
  key: LayerKey;
  label: string;
  /** One line under the label, saying what the layer actually shows. */
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Eddy's own mark for this layer, where the catalog has one.
   *
   * Only two layers carry one, and the reason the other four do not is worth
   * stating so nobody "finishes the set" later:
   *
   *   allGauges — the catalog's only gauge mark is the droplet, and `gauges`
   *     has it. Two identical droplets would undo #1023, whose whole point was
   *     that these two rows partition one network between them.
   *   hazards, campgrounds — the catalog draws these as full-body mascot
   *     scenes. A whole otter beside a campfire is a smudge in a 30pt well.
   *   outfitters — no mark exists.
   *
   * These are fixed-colour art, so a layer with a symbol keeps its `color` for
   * the well's border and nothing recolours the mark itself. That works here,
   * and only here, because the well is a LEGEND rather than a pin: the pins on
   * the map still wear their condition.
   */
  symbol?: EddySymbolName;
  color: (colors: Palette) => string;
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
    // The catalog's pin is drawn in the accent coral this layer already uses,
    // so the mark and the well's border are the same colour by coincidence of
    // both coming from the brand.
    symbol: 'accessPoint',
    color: (c) => c.accent,
  },
  {
    key: 'gauges',
    // NAMED FOR WHAT SEPARATES IT from the row below, not for what it holds.
    // Both rows hold USGS gauges, and calling this one "Gauges" made the other
    // one read as a superset that happened to be bigger — so "Eddy-rated" was
    // the obvious thing to look for in the WRONG row's filter, where it existed
    // as a chip that could only ever match the pins that row excludes. The two
    // labels now state the partition the code has always drawn.
    label: 'Eddy-rated gauges',
    description: 'Live readings, coloured by float condition',
    icon: 'speedometer-outline',
    symbol: 'gauge',
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

/** Service types that belong under the Outfitters row rather than Campgrounds. */
export const OUTFITTER_SERVICE_TYPES = ['outfitter', 'canoe_rental', 'shuttle', 'lodging'];
