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
    case 'low':
      return 'Low - Floatable';
    case 'very_low':
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
    case 'low':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'very_low':
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
  return code === 'optimal' || code === 'high' || code === 'low' || code === 'very_low';
}
