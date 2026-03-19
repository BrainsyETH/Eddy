// src/constants/index.ts
// App-wide constants for Eddy

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

// Condition code colors (ordered: Too Low → Low → Okay → Optimal → High → Flood)
export const CONDITION_COLORS = {
  too_low: '#9ca3af',   // gray
  low: '#eab308',  // yellow
  okay: '#84cc16',       // lime-500 (okay green)
  optimal: '#059669',   // emerald-600 (richer green)
  high: '#f97316',      // orange
  dangerous: '#ef4444', // red
  unknown: '#9ca3af',   // gray
} as const;

// Condition code labels (ordered: Too Low → Low → Okay → Optimal → High → Flood)
export const CONDITION_LABELS = {
  too_low: 'Too Low - Not Recommended',
  low: 'Low - Scraping Likely',
  okay: 'Okay - Floatable',
  optimal: 'Optimal Conditions',
  high: 'High Water - Experienced Only',
  dangerous: 'Flood - Do Not Float',
  unknown: 'Unknown',
} as const;

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

// Map condition code → Eddy otter image
export function getEddyImageForCondition(code: string): string {
  switch (code) {
    case 'optimal':
    case 'okay':
      return EDDY_IMAGES.green;
    case 'low':
      return EDDY_IMAGES.yellow;
    case 'too_low':
      return EDDY_IMAGES.flag;
    case 'high':
      return EDDY_IMAGES.red;
    case 'dangerous':
      return EDDY_IMAGES.flood;
    case 'unknown':
    default:
      return EDDY_IMAGES.flag;
  }
}

// API cache times (in milliseconds)
export const CACHE_TIMES = {
  rivers: 5 * 60 * 1000,        // 5 minutes
  accessPoints: 5 * 60 * 1000,  // 5 minutes
  conditions: 5 * 60 * 1000,    // 5 minutes
  vesselTypes: 60 * 60 * 1000,  // 1 hour
} as const;
