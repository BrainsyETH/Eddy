// src/constants/index.ts
// App-wide constants for Eddy

import {
  CONDITION_SYSTEM,
  conditionOtterMood,
  type ConditionCode,
} from '@shared/condition-system';

// Map defaults
export const DEFAULT_MAP_CENTER = {
  lng: -91.5,
  lat: 37.5,
} as const;

export const DEFAULT_MAP_ZOOM = 7;

// Missouri bounding box — single source of truth for all coordinate validation.
// Includes buffer for border access points.
export const MISSOURI_BOUNDS = {
  minLng: -96.5,
  minLat: 35.9,
  maxLng: -88.9,
  maxLat: 40.7,
} as const;

// Access point types with labels
export const ACCESS_POINT_TYPES = {
  boat_ramp: 'Boat Ramp',
  gravel_bar: 'Gravel Bar',
  campground: 'Campground',
  bridge: 'Bridge Access',
  access: 'River Access',
  park: 'Park',
} as const;

// Canonical display order for access point types
export const ACCESS_POINT_TYPE_ORDER: (keyof typeof ACCESS_POINT_TYPES)[] = [
  'access',
  'campground',
  'boat_ramp',
  'gravel_bar',
  'bridge',
  'park',
];

// Hazard types with labels
export const HAZARD_TYPES = {
  low_water_dam: 'Low-Water Dam',
  portage: 'Portage Required',
  strainer: 'Strainer',
  rapid: 'Rapid',
  private_property: 'Private Property',
  waterfall: 'Waterfall',
  shoal: 'Shoal',
  bridge_piling: 'Bridge Piling',
  other: 'Other Hazard',
} as const;

// Hazard severity colors
export const HAZARD_SEVERITY_COLORS = {
  info: '#3b82f6',     // blue
  caution: '#eab308',  // yellow
  warning: '#f97316',  // orange
  danger: '#ef4444',   // red
} as const;

// Condition colors + labels are derived from the canonical condition system in
// shared/condition-system.ts — the single source of truth shared with the
// Remotion video project. Do NOT hardcode condition hex/labels here; edit the
// shared module so the app and video stay in lockstep.
export const CONDITION_COLORS = Object.fromEntries(
  Object.entries(CONDITION_SYSTEM).map(([code, def]) => [code, def.solid])
) as Record<ConditionCode, string>;

export const CONDITION_LABELS = Object.fromEntries(
  Object.entries(CONDITION_SYSTEM).map(([code, def]) => [code, def.longLabel])
) as Record<ConditionCode, string>;

// Short condition labels for compact displays (badges, embeds, etc.)
export const CONDITION_SHORT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CONDITION_SYSTEM).map(([code, def]) => [code, def.label])
);

// POI types with labels
export const POI_TYPES = {
  spring: 'Spring',
  cave: 'Cave',
  historical_site: 'Historical Site',
  scenic_viewpoint: 'Scenic Viewpoint',
  waterfall: 'Waterfall',
  geological: 'Geological Feature',
  float_camp: 'Float Camp',
  other: 'Other',
} as const;

// Amenity icons/labels
export const AMENITIES = {
  parking: 'Parking',
  restrooms: 'Restrooms',
  camping: 'Camping',
  boat_ramp: 'Boat Ramp',
  picnic: 'Picnic Area',
} as const;

// Ownership types
export const OWNERSHIP_TYPES = {
  MDC: 'Missouri Dept. of Conservation',
  NPS: 'National Park Service',
  private: 'Private',
  county: 'County',
  city: 'City',
  state_park: 'State Park',
} as const;

// Eddy otter images — single source of truth for all Eddy avatars
export const EDDY_IMAGES = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
  flood: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png',
  canoe: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png',
  favicon: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png',
} as const;

// Map condition code → Eddy otter image. The condition→mood mapping is canonical
// (shared/condition-system.ts); here we resolve the mood to the app's Blob asset.
export function getEddyImageForCondition(code: string): string {
  return EDDY_IMAGES[conditionOtterMood(code)];
}

/** Plain-language explainer for the CFS unit, shown in the (i) info tips. */
export const CFS_EXPLAINER = {
  title: 'What is CFS?',
  body: 'CFS is cubic feet per second — the volume of water flowing past the gauge each second. It’s the standard measure of a river’s flow: higher CFS means more water and a stronger current.',
} as const;

// NOTE: Condition badge/surface styling is NOT defined here. The former
// BG_BY_CONDITION / TEXT_BY_CONDITION / LABEL_BY_CONDITION maps drifted out of
// sync with the canonical taxonomy (they painted "high" red, colliding with
// "dangerous", and paired white text with light fills). They are removed. Use:
//   - <ConditionBadge code={code} /> for condition pills, and
//   - conditionChip(code) from '@shared/condition-system' for tinted surfaces.
// Both derive from CONDITION_SYSTEM, so high stays orange and contrast stays AA.

// Default threshold descriptions for the condition thresholds table
export const DEFAULT_THRESHOLD_DESCRIPTIONS: Record<string, string> = {
  tooLow: 'Expect frequent dragging on gravel bars. Recommended for wading only.',
  low: 'Floatable but expect occasional scraping. Lighter boats recommended.',
  good: 'Floatable conditions. Some shallow spots possible.',
  flowing: 'Ideal conditions. All boats clear, gentle current, crystal clear water.',
  high: 'Moving quick. Experienced paddlers only; expect submerged obstacles and root-balls.',
  flood: 'Dangerous. High water, heavy debris, and flood warnings usually in effect.',
};

// API cache times (in milliseconds)
export const CACHE_TIMES = {
  rivers: 5 * 60 * 1000,        // 5 minutes
  accessPoints: 5 * 60 * 1000,  // 5 minutes
  conditions: 5 * 60 * 1000,    // 5 minutes
  vesselTypes: 60 * 60 * 1000,  // 1 hour
} as const;
