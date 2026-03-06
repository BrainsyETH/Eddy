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

  // Eddy says quote — always use the full report (summary is already in the image)
  const quoteText = update.quote_text;
  if (quoteText) {
    lines.push(`Eddy says: "${quoteText}"`);
    lines.push('');
  }

  // Plan your trip CTA
  lines.push('Plan your float at eddy.guide');

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
  lines.push('Plan your float at eddy.guide');

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

export function formatConditionChangeCaption(params: {
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
  platform: SocialPlatform;
}): { caption: string; hashtags: string[] } {
  const riverName = RIVER_NAMES[params.riverSlug] || params.riverSlug;
  const oldLabel = CONDITION_LABELS[params.oldCondition as keyof typeof CONDITION_LABELS] || params.oldCondition;
  const newLabel = CONDITION_LABELS[params.newCondition as keyof typeof CONDITION_LABELS] || params.newCondition;

  const lines: string[] = [];

  // Alert-style header based on new condition
  if (params.newCondition === 'optimal') {
    lines.push(`${riverName} just hit optimal conditions!`);
  } else if (params.newCondition === 'dangerous') {
    lines.push(`Flood warning: ${riverName}`);
  } else if (params.newCondition === 'high') {
    lines.push(`${riverName} is running high — experienced paddlers only`);
  } else if (params.oldCondition === 'dangerous') {
    lines.push(`Flood warning lifted: ${riverName}`);
  } else {
    lines.push(`${riverName} conditions changed`);
  }

  lines.push('');
  lines.push(`${oldLabel} → ${newLabel}`);

  if (params.gaugeHeightFt !== null) {
    lines.push(`Current gauge: ${params.gaugeHeightFt.toFixed(1)} ft`);
  }

  lines.push('');
  lines.push('Plan your float at eddy.guide');

  const hashtags = [
    ...BASE_HASHTAGS,
    ...(RIVER_HASHTAGS[params.riverSlug] || []),
    ...(CONDITION_HASHTAGS[params.newCondition] || []),
    '#ConditionAlert',
  ];

  let caption = lines.join('\n');
  if (params.platform === 'instagram') {
    caption += '\n\n' + hashtags.join(' ');
  }

  return { caption, hashtags };
}

export function getRiverName(slug: string): string {
  return RIVER_NAMES[slug] || slug;
}
