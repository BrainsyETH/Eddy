// src/constants/index.ts
// App-wide constants for Eddy

// Map defaults
export const DEFAULT_MAP_CENTER = {
  lng: -91.5,
  lat: 37.5,
} as const;

export const DEFAULT_MAP_ZOOM = 7;

// Missouri bounding box (approximate)
export const MISSOURI_BOUNDS = {
  minLng: -95.77,
  minLat: 35.99,
  maxLng: -89.10,
  maxLat: 40.61,
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
  very_low: '#eab308',  // yellow
  low: '#84cc16',       // lime-500 (okay green)
  optimal: '#059669',   // emerald-600 (richer green)
  high: '#f97316',      // orange
  dangerous: '#ef4444', // red
  unknown: '#9ca3af',   // gray
} as const;

// Condition code labels (ordered: Too Low → Low → Okay → Optimal → High → Flood)
export const CONDITION_LABELS = {
  too_low: 'Too Low - Not Recommended',
  very_low: 'Low - Scraping Likely',
  low: 'Okay - Floatable',
  optimal: 'Optimal Conditions',
  high: 'High Water - Experienced Only',
  dangerous: 'Flood - Do Not Float',
  unknown: 'Unknown',
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

// API cache times (in milliseconds)
export const CACHE_TIMES = {
  rivers: 5 * 60 * 1000,        // 5 minutes
  accessPoints: 5 * 60 * 1000,  // 5 minutes
  conditions: 5 * 60 * 1000,    // 5 minutes
  vesselTypes: 60 * 60 * 1000,  // 1 hour
} as const;
