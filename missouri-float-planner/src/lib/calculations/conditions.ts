// src/lib/calculations/conditions.ts
// Condition label and formatting logic

import type { ConditionCode } from '@/types/api';

/**
 * Gets a human-readable label for a condition code
 */
export function getConditionLabel(code: ConditionCode): string {
  switch (code) {
    case 'dangerous':
      return 'Dangerous - Do Not Float';
    case 'high':
      return 'High Water - Experienced Only';
    case 'optimal':
      return 'Optimal Conditions';
    case 'okay':
      return 'Low - Floatable';
    case 'low':
      return 'Very Low - Scraping Likely';
    case 'too_low':
      return 'Too Low - Not Recommended';
    case 'unknown':
    default:
      return 'Unknown Conditions';
  }
}

/**
 * Gets a color class for condition badges (Tailwind CSS)
 */
export function getConditionColorClass(code: ConditionCode): string {
  switch (code) {
    case 'dangerous':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'optimal':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'okay':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'low':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'too_low':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'unknown':
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

/**
 * Determines if a condition code allows floating
 */
export function isFloatable(code: ConditionCode): boolean {
  return code === 'optimal' || code === 'high' || code === 'okay' || code === 'low';
}

/**
 * Maps threshold-based condition codes to flow ratings for display.
 * Single source of truth — used by both /api/plan and /api/conditions endpoints.
 *
 * Note: 'okay' condition code means "above level_low threshold" = floatable = 'good' rating
 */
export function conditionCodeToFlowRating(code: ConditionCode): FlowRating {
  switch (code) {
    case 'optimal': return 'good';
    case 'okay': return 'good';
    case 'low': return 'low';
    case 'too_low': return 'poor';
    case 'high': return 'high';
    case 'dangerous': return 'flood';
    default: return 'unknown';
  }
}

export type FlowRating = 'flood' | 'high' | 'good' | 'low' | 'poor' | 'unknown';

/** Flow descriptions keyed by rating */
export const FLOW_DESCRIPTIONS: Record<FlowRating, string> = {
  flood: 'Dangerous flooding - do not float',
  high: 'Fast current - experienced paddlers only',
  good: 'Good conditions - minimal dragging expected',
  low: 'Expect some dragging in the shallow areas',
  poor: 'Frequent dragging and portaging may occur',
  unknown: 'Current conditions unavailable',
};

/**
 * Gets description for threshold-based condition code.
 */
export function getThresholdBasedDescription(code: ConditionCode): string {
  switch (code) {
    case 'optimal': return 'Ideal conditions for floating';
    case 'okay': return 'Good conditions - minimal dragging expected';
    case 'low': return 'Expect some dragging in shallow areas';
    case 'too_low': return 'Frequent dragging and portaging likely';
    case 'high': return 'Fast current - experienced paddlers only';
    case 'dangerous': return 'Dangerous conditions - do not float';
    default: return 'Conditions unknown';
  }
}
