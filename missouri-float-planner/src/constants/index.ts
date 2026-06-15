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

// Condition-themed background classes for Eddy Says cards and detail views
export const BG_BY_CONDITION: Record<string, string> = {
  flowing: 'bg-gradient-to-r from-emerald-100 to-teal-50 border-emerald-300',
  good: 'bg-gradient-to-r from-lime-100 to-emerald-50 border-lime-300',
  low: 'bg-gradient-to-r from-amber-100 to-yellow-50 border-amber-300',
  too_low: 'bg-gradient-to-r from-stone-200 to-stone-100 border-stone-400',
  high: 'bg-gradient-to-r from-orange-100 to-red-50 border-orange-300',
  dangerous: 'bg-gradient-to-r from-red-200 to-red-100 border-red-400',
  unknown: 'bg-gradient-to-r from-neutral-100 to-slate-50 border-neutral-300',
};

export const TEXT_BY_CONDITION: Record<string, string> = {
  flowing: 'text-emerald-900', good: 'text-emerald-900',
  low: 'text-amber-900', too_low: 'text-stone-800',
  high: 'text-red-900', dangerous: 'text-red-900',
  unknown: 'text-neutral-700',
};

export const LABEL_BY_CONDITION: Record<string, { text: string; className: string }> = {
  flowing: { text: 'Flowing', className: 'bg-emerald-100 text-emerald-700' },
  good: { text: 'Good', className: 'bg-emerald-100 text-emerald-700' },
  low: { text: 'Low', className: 'bg-amber-100 text-amber-700' },
  too_low: { text: 'Too Low', className: 'bg-stone-200 text-stone-700' },
  high: { text: 'High', className: 'bg-red-100 text-red-700' },
  dangerous: { text: 'Flood', className: 'bg-red-200 text-red-800' },
  unknown: { text: 'Unknown', className: 'bg-neutral-100 text-neutral-600' },
};

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
