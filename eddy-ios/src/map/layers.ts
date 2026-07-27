// eddy-ios/src/map/layers.ts
// What the map can draw, and what each thing is called and coloured.
//
// One definition per layer, in one place, because the same list drives three
// things that would otherwise drift: the filter chips, the pin colours, and the
// callout that appears when a pin is tapped. A chip is only a legend if its
// colour is literally the colour of the pins it toggles.
//
// COLOURS ARE ROLES, NOT HUES. Every value here resolves through the palette or
// through CONDITION_SYSTEM. Hazards borrow the canonical `dangerous` red on
// purpose: a paddler who has learnt that red means "do not float" should read a
// low-water dam the same way without being taught twice.

import type { Palette } from '@/theme/palette';
import { conditionColor } from '@/theme/conditions';
import type { Ionicons } from '@expo/vector-icons';

export type LayerKey = 'access' | 'campgrounds' | 'gauges' | 'hazards' | 'outfitters';

export interface LayerDef {
  key: LayerKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: (colors: Palette) => string;
}

/**
 * Access points are on by default and nothing else is.
 *
 * The map's job on open is "where can I get on this river", and every extra
 * layer competes with the answer. Anyone who wants gauges can have them in one
 * tap, and the choice sticks for the session.
 */
export const DEFAULT_LAYERS: LayerKey[] = ['access'];

export const MAP_LAYERS: LayerDef[] = [
  {
    key: 'access',
    label: 'Access points',
    icon: 'location',
    color: (c) => c.accent,
  },
  {
    key: 'campgrounds',
    label: 'Campgrounds',
    icon: 'bonfire-outline',
    color: (c) => c.success,
  },
  {
    key: 'gauges',
    label: 'Gauges',
    icon: 'speedometer-outline',
    // Teal rather than coral: a gauge is a measurement, not a destination, and
    // it should read as instrumentation against the accent-coloured places.
    color: (c) => (c.scheme === 'dark' ? '#72B5C4' : '#256574'),
  },
  {
    key: 'hazards',
    label: 'Hazards',
    icon: 'warning-outline',
    color: () => conditionColor('dangerous'),
  },
  {
    key: 'outfitters',
    label: 'Outfitters',
    icon: 'boat-outline',
    color: (c) => c.warm,
  },
];

/** Service types that belong under the Outfitters chip rather than Campgrounds. */
export const OUTFITTER_SERVICE_TYPES = ['outfitter', 'canoe_rental', 'shuttle', 'lodging'];
