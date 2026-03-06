// src/lib/social/content-formatter.ts
// Formats Eddy says updates into social-media-optimized captions

import { CONDITION_LABELS } from '@/constants';
import type { SocialPlatform, SocialCustomContent } from './types';

// River display names for captions
const RIVER_NAMES: Record<string, string> = {
  meramec: 'Meramec River',
  current: 'Current River',
  'eleven-point': 'Eleven Point River',
  'jacks-fork': 'Jacks Fork River',
  niangua: 'Niangua River',
  'big-piney': 'Big Piney River',
  huzzah: 'Huzzah Creek',
  courtois: 'Courtois Creek',
};

// River-specific hashtags
const RIVER_HASHTAGS: Record<string, string[]> = {
  meramec: ['#MeramecRiver', '#MeramecFloat'],
  current: ['#CurrentRiver', '#CurrentRiverMO'],
  'eleven-point': ['#ElevenPointRiver'],
  'jacks-fork': ['#JacksFork', '#JacksForkRiver'],
  niangua: ['#NianguaRiver'],
  'big-piney': ['#BigPineyRiver'],
  huzzah: ['#HuzzahCreek'],
  courtois: ['#CourtoisCreek'],
};

// Condition-specific hashtags
const CONDITION_HASHTAGS: Record<string, string[]> = {
  optimal: ['#PerfectFloat', '#GetOnTheWater'],
  okay: ['#Floatable', '#RiverDay'],
  low: ['#LowWater', '#ShallowFloat'],
  too_low: ['#TooLow', '#WaitForRain'],
  high: ['#HighWater', '#ExperiencedOnly'],
  dangerous: ['#FloodWarning', '#StayOffTheWater'],
};

// Base hashtags for all posts
const BASE_HASHTAGS = [
  '#EddySays',
  '#MissouriFloat',
  '#OzarksRivers',
  '#FloatTrip',
  '#Missouri',
];

interface EddyUpdate {
  river_slug: string;
  condition_code: string;
  gauge_height_ft: number | null;
  quote_text: string;
  summary_text: string | null;
}

export function formatRiverHighlightCaption(
  update: EddyUpdate,
  customContent: SocialCustomContent[],
  platform: SocialPlatform
): { caption: string; hashtags: string[] } {
  const riverName = RIVER_NAMES[update.river_slug] || update.river_slug;
  const conditionLabel = CONDITION_LABELS[update.condition_code as keyof typeof CONDITION_LABELS] || 'Unknown';

  // Build caption
  const lines: string[] = [];

  // Header
  lines.push(`${riverName} Update`);
  lines.push('');

  // Condition info
  lines.push(`Condition: ${conditionLabel}`);
  if (update.gauge_height_ft !== null) {
    lines.push(`Gauge: ${update.gauge_height_ft.toFixed(1)} ft`);
  }
  lines.push('');

  // Eddy says quote (use summary if available, otherwise quote)
  const quoteText = update.summary_text || update.quote_text;
  if (quoteText) {
    lines.push(`Eddy says: "${quoteText}"`);
    lines.push('');
  }

  // Plan your trip CTA
  lines.push('Plan your float at eddyfloat.com');

  // Add active custom content snippets
  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  // Build hashtags
  const hashtags = [
    ...BASE_HASHTAGS,
    ...(RIVER_HASHTAGS[update.river_slug] || []),
    ...(CONDITION_HASHTAGS[update.condition_code] || []),
  ];

  // Instagram: append hashtags to caption; Facebook: keep separate
  let caption = lines.join('\n');
  if (platform === 'instagram') {
    caption += '\n\n' + hashtags.join(' ');
  }

  return { caption, hashtags };
}

export function formatDailyDigestCaption(
  updates: EddyUpdate[],
  globalSummary: string | null,
  customContent: SocialCustomContent[],
  platform: SocialPlatform
): { caption: string; hashtags: string[] } {
  const lines: string[] = [];

  // Header
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  lines.push(`Ozarks River Report - ${today}`);
  lines.push('');

  // Global summary from Eddy
  if (globalSummary) {
    lines.push(`Eddy says: "${globalSummary}"`);
    lines.push('');
  }

  // Per-river conditions
  for (const update of updates) {
    const riverName = RIVER_NAMES[update.river_slug] || update.river_slug;
    const conditionLabel = CONDITION_LABELS[update.condition_code as keyof typeof CONDITION_LABELS] || '?';
    const gauge = update.gauge_height_ft !== null ? ` (${update.gauge_height_ft.toFixed(1)} ft)` : '';
    lines.push(`${riverName}: ${conditionLabel}${gauge}`);
  }

  lines.push('');
  lines.push('Plan your float at eddyfloat.com');

  // Custom content
  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  const hashtags = [...BASE_HASHTAGS, '#OzarksRiverReport', '#RiverConditions'];

  let caption = lines.join('\n');
  if (platform === 'instagram') {
    caption += '\n\n' + hashtags.join(' ');
  }

  return { caption, hashtags };
}

function getActiveSnippets(
  content: SocialCustomContent[],
  platform: SocialPlatform
): string[] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  return content
    .filter((c) => {
      if (!c.active) return false;
      if (!c.platforms.includes(platform)) return false;
      if (c.start_date && today < c.start_date) return false;
      if (c.end_date && today > c.end_date) return false;
      return true;
    })
    .map((c) => c.text);
}

export function getRiverName(slug: string): string {
  return RIVER_NAMES[slug] || slug;
}
