// src/constants/index.ts
// App-wide constants for Eddy

import type { ConditionCode } from '@/types/api';

// =========================================
// Layout Constants
// =========================================

/** Height of the global site header in pixels */
export const SITE_HEADER_HEIGHT = 56; // h-14 = 3.5rem = 56px

/** Height of the collapsed mobile bottom sheet */
export const MOBILE_SHEET_COLLAPSED_HEIGHT = 120;

/** Map heights for different breakpoints */
export const MAP_HEIGHTS = {
  mobile: 350,
  desktop: 450,
} as const;

// =========================================
// Map Constants
// =========================================

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

// =========================================
// Condition System
// Single source of truth for all condition-related styling
// =========================================

// Condition code hex colors (for SVG, canvas, etc.)
export const CONDITION_COLORS: Record<ConditionCode, string> = {
  too_low: '#9ca3af',   // gray
  very_low: '#eab308',  // yellow
  low: '#84cc16',       // lime-500 (okay green)
  optimal: '#059669',   // emerald-600 (richer green)
  high: '#f97316',      // orange
  dangerous: '#ef4444', // red
  unknown: '#9ca3af',   // gray
} as const;

// Condition code Tailwind background classes (for badges, indicators)
export const CONDITION_BG_CLASSES: Record<ConditionCode, string> = {
  too_low: 'bg-neutral-400',
  very_low: 'bg-yellow-500',
  low: 'bg-lime-500',
  optimal: 'bg-emerald-500',
  high: 'bg-orange-500',
  dangerous: 'bg-red-600',
  unknown: 'bg-neutral-400',
} as const;

// Condition code Tailwind text classes (for text on colored backgrounds)
export const CONDITION_TEXT_CLASSES: Record<ConditionCode, string> = {
  too_low: 'text-white',
  very_low: 'text-neutral-900',
  low: 'text-white',
  optimal: 'text-white',
  high: 'text-white',
  dangerous: 'text-white',
  unknown: 'text-white',
} as const;

// Condition code Tailwind border classes
export const CONDITION_BORDER_CLASSES: Record<ConditionCode, string> = {
  too_low: 'border-neutral-300',
  very_low: 'border-yellow-400',
  low: 'border-lime-400',
  optimal: 'border-emerald-400',
  high: 'border-orange-400',
  dangerous: 'border-red-400',
  unknown: 'border-neutral-300',
} as const;

// Short labels for compact displays (badges, mobile)
export const CONDITION_SHORT_LABELS: Record<ConditionCode, string> = {
  too_low: 'Too Low',
  very_low: 'Low',
  low: 'Okay',
  optimal: 'Optimal',
  high: 'High',
  dangerous: 'Flood',
  unknown: 'Unknown',
} as const;

// Full descriptive labels
export const CONDITION_LABELS: Record<ConditionCode, string> = {
  too_low: 'Too Low - Not Recommended',
  very_low: 'Low - Scraping Likely',
  low: 'Okay - Floatable',
  optimal: 'Optimal Conditions',
  high: 'High Water - Experienced Only',
  dangerous: 'Flood - Do Not Float',
  unknown: 'Unknown',
} as const;

// Emoji/symbols for conditions
export const CONDITION_ICONS: Record<ConditionCode, string> = {
  too_low: '🚫',
  very_low: '⚠️',
  low: '✓',
  optimal: '🎯',
  high: '🌊',
  dangerous: '🛑',
  unknown: '❓',
} as const;

// Complete condition config for complex components
export interface ConditionConfig {
  label: string;
  shortLabel: string;
  icon: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  hexColor: string;
}

export const CONDITION_CONFIG: Record<ConditionCode, ConditionConfig> = {
  too_low: {
    label: CONDITION_LABELS.too_low,
    shortLabel: CONDITION_SHORT_LABELS.too_low,
    icon: CONDITION_ICONS.too_low,
    bgClass: CONDITION_BG_CLASSES.too_low,
    textClass: CONDITION_TEXT_CLASSES.too_low,
    borderClass: CONDITION_BORDER_CLASSES.too_low,
    hexColor: CONDITION_COLORS.too_low,
  },
  very_low: {
    label: CONDITION_LABELS.very_low,
    shortLabel: CONDITION_SHORT_LABELS.very_low,
    icon: CONDITION_ICONS.very_low,
    bgClass: CONDITION_BG_CLASSES.very_low,
    textClass: CONDITION_TEXT_CLASSES.very_low,
    borderClass: CONDITION_BORDER_CLASSES.very_low,
    hexColor: CONDITION_COLORS.very_low,
  },
  low: {
    label: CONDITION_LABELS.low,
    shortLabel: CONDITION_SHORT_LABELS.low,
    icon: CONDITION_ICONS.low,
    bgClass: CONDITION_BG_CLASSES.low,
    textClass: CONDITION_TEXT_CLASSES.low,
    borderClass: CONDITION_BORDER_CLASSES.low,
    hexColor: CONDITION_COLORS.low,
  },
  optimal: {
    label: CONDITION_LABELS.optimal,
    shortLabel: CONDITION_SHORT_LABELS.optimal,
    icon: CONDITION_ICONS.optimal,
    bgClass: CONDITION_BG_CLASSES.optimal,
    textClass: CONDITION_TEXT_CLASSES.optimal,
    borderClass: CONDITION_BORDER_CLASSES.optimal,
    hexColor: CONDITION_COLORS.optimal,
  },
  high: {
    label: CONDITION_LABELS.high,
    shortLabel: CONDITION_SHORT_LABELS.high,
    icon: CONDITION_ICONS.high,
    bgClass: CONDITION_BG_CLASSES.high,
    textClass: CONDITION_TEXT_CLASSES.high,
    borderClass: CONDITION_BORDER_CLASSES.high,
    hexColor: CONDITION_COLORS.high,
  },
  dangerous: {
    label: CONDITION_LABELS.dangerous,
    shortLabel: CONDITION_SHORT_LABELS.dangerous,
    icon: CONDITION_ICONS.dangerous,
    bgClass: CONDITION_BG_CLASSES.dangerous,
    textClass: CONDITION_TEXT_CLASSES.dangerous,
    borderClass: CONDITION_BORDER_CLASSES.dangerous,
    hexColor: CONDITION_COLORS.dangerous,
  },
  unknown: {
    label: CONDITION_LABELS.unknown,
    shortLabel: CONDITION_SHORT_LABELS.unknown,
    icon: CONDITION_ICONS.unknown,
    bgClass: CONDITION_BG_CLASSES.unknown,
    textClass: CONDITION_TEXT_CLASSES.unknown,
    borderClass: CONDITION_BORDER_CLASSES.unknown,
    hexColor: CONDITION_COLORS.unknown,
  },
} as const;

// Helper function to get condition config with fallback
export function getConditionConfig(code: ConditionCode | null | undefined): ConditionConfig {
  return CONDITION_CONFIG[code || 'unknown'] || CONDITION_CONFIG.unknown;
}

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
