// src/lib/social/content-formatter.ts
// Formats Eddy updates into social-media-optimized captions
// Designed for engagement: hook-first structure, deep link CTAs, platform-specific formatting

import type { SocialPlatform, SocialCustomContent } from './types';

// ---------------------------------------------------------------------------
// River display names
// ---------------------------------------------------------------------------
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

// Short names for casual hooks
const RIVER_SHORT_NAMES: Record<string, string> = {
  meramec: 'the Meramec',
  current: 'the Current',
  'eleven-point': 'Eleven Point',
  'jacks-fork': 'Jacks Fork',
  niangua: 'the Niangua',
  'big-piney': 'Big Piney',
  huzzah: 'Huzzah',
  courtois: 'Courtois',
};

// Short condition labels for scannable digest lines
const SHORT_CONDITION_LABELS: Record<string, string> = {
  too_low: 'Too Low',
  low: 'Low',
  good: 'Good',
  flowing: 'Flowing',
  high: 'High',
  dangerous: 'Flood',
  unknown: 'Unknown',
};

// Condition emoji — light, purposeful usage
const CONDITION_EMOJI: Record<string, string> = {
  too_low: '\u{1F6AB}',
  low: '\u{1F4A7}',
  good: '\u{1F44D}',
  flowing: '\u{2705}',
  high: '\u{26A0}\uFE0F',
  dangerous: '\u{1F6D1}',
  unknown: '\u{2753}',
};

// ---------------------------------------------------------------------------
// Hashtag configuration
// ---------------------------------------------------------------------------

// Instagram-only core hashtags (Facebook gets none — algorithm penalizes them)
const IG_BASE_HASHTAGS = [
  '#eddysays',
  '#ozarksfloat',
  '#missourifloattrip',
  '#floattrip',
  '#ozarksrivers',
];

// River-specific hashtags (IG only)
const RIVER_HASHTAGS: Record<string, string[]> = {
  meramec: ['#meramecriver', '#meramecfloat'],
  current: ['#currentriver', '#currentriverMO'],
  'eleven-point': ['#elevenpointriver'],
  'jacks-fork': ['#jacksfork', '#jacksforkriver'],
  niangua: ['#nianguariver'],
  'big-piney': ['#bigpineyriver'],
  huzzah: ['#huzzahcreek'],
  courtois: ['#courtoiscreek'],
};

// Condition-specific hashtags (IG only)
const CONDITION_HASHTAGS: Record<string, string[]> = {
  flowing: ['#perfectconditions', '#getonthewater'],
  good: ['#floatable', '#riverday'],
  low: ['#lowwater'],
  too_low: ['#waitforrain'],
  high: ['#highwater', '#swiftwater'],
  dangerous: ['#floodwarning', '#stayoffthewater'],
};

// Seasonal hashtags based on month
function getSeasonalHashtags(): string[] {
  const month = new Date().getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return ['#springfloat', '#springpaddling'];
  if (month >= 5 && month <= 7) return ['#summerfloat', '#summerontheriver'];
  if (month >= 8 && month <= 10) return ['#fallfloat', '#fallpaddling'];
  return ['#winterpaddling'];
}

// ---------------------------------------------------------------------------
// Hook templates — condition-specific, rotated for variety
// ---------------------------------------------------------------------------

const HIGHLIGHT_HOOKS: Record<string, string[]> = {
  flowing: [
    '{river} is running perfect right now.',
    '{river} just hit the sweet spot \u2014 {gauge} ft and dialed in.',
    'If you\u2019ve been waiting for the right time on {river}, this is it.',
    'Green light on {river}. Conditions are locked in.',
  ],
  good: [
    '{river} is looking good \u2014 {gauge} ft and floatable.',
    '{river} is in solid shape right now.',
    'Good news: {river} is running and ready at {gauge} ft.',
  ],
  low: [
    '{river} is getting skinny \u2014 {gauge} ft. Here\u2019s what to expect.',
    'Low water heads up on {river}. You\u2019ll want to read this before launching.',
    '{river} at {gauge} ft \u2014 expect some scraping in the shallows.',
  ],
  too_low: [
    '{river} is too low to float right now.',
    'Hold off on {river} \u2014 it\u2019s at {gauge} ft and scraping bottom.',
    'Not the day for {river}. Way too skinny at {gauge} ft.',
  ],
  high: [
    '{river} is running hot \u2014 {gauge} ft. Know before you go.',
    'Heads up: {river} is high and fast right now.',
    '{river} at {gauge} ft \u2014 use caution out there.',
  ],
  dangerous: [
    'Stay off {river} right now. Here\u2019s why.',
    'Flood stage on {river}. Do not launch.',
    '{river} is in flood. Stay off the water.',
  ],
};

const DIGEST_HOOKS: string[] = [
  'Here\u2019s your Ozarks river rundown for {day}.',
  '{count} rivers checked \u2014 here\u2019s where to float {timeframe}.',
  'Which Ozarks rivers are floating good right now? Let\u2019s find out.',
  'Your {day} river report is in. Here\u2019s the rundown.',
];

const CONDITION_CHANGE_HOOKS: Record<string, string[]> = {
  flowing: [
    '{river} just hit ideal conditions \u2014 it\u2019s go time.',
    'The wait is over. {river} is running perfect.',
  ],
  dangerous: [
    'Flood warning: {river}. Stay off the water.',
    '{river} just hit flood stage. Do not launch.',
  ],
  high: [
    '{river} is running high now \u2014 use caution.',
    'Heads up: {river} just moved to high water.',
  ],
  from_dangerous: [
    'Flood warning lifted on {river}. Conditions are improving.',
    'Good news \u2014 {river} is dropping out of flood stage.',
  ],
  default: [
    'Conditions just changed on {river}.',
    '{river} conditions are shifting \u2014 here\u2019s the update.',
  ],
};

// Weekend engagement questions (appended to flowing/good posts Thu-Sun)
const ENGAGEMENT_QUESTIONS: string[] = [
  'Where are you putting in this weekend?',
  'Who\u2019s hitting the water this week?',
  'What\u2019s your favorite stretch?',
  'Tag your float crew.',
];

// ---------------------------------------------------------------------------
// CTA templates — deep-linked, varied
// ---------------------------------------------------------------------------

const RIVER_CTAS: string[] = [
  'Check live conditions \u2192 https://eddy.guide/rivers/{slug}',
  'Plan your float \u2192 https://eddy.guide/rivers/{slug}',
  'See the full report \u2192 https://eddy.guide/rivers/{slug}',
];

const DIGEST_CTAS: string[] = [
  'Check all rivers \u2192 https://eddy.guide',
  'See live conditions for every river \u2192 https://eddy.guide',
  'Plan your next float \u2192 https://eddy.guide',
];

const CHANGE_CTAS: string[] = [
  'See what changed \u2192 https://eddy.guide/rivers/{slug}',
  'Check the latest \u2192 https://eddy.guide/rivers/{slug}',
];

// ---------------------------------------------------------------------------
// Utility: deterministic template selection for variety without randomness
// ---------------------------------------------------------------------------

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function pickTemplate(templates: string[], seed: string): string {
  const idx = simpleHash(seed) % templates.length;
  return templates[idx];
}

function formatGauge(ft: number | null): string {
  return ft !== null ? ft.toFixed(1) : '?';
}

function interpolate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

// Trim quote to a reasonable caption length, prefer summary_text
function trimQuote(update: EddyUpdate, maxLen: number): string | null {
  const text = update.summary_text || update.quote_text;
  if (!text) return null;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function isWeekendWindow(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  // Thu after 22 UTC through Mon 04 UTC
  if (utcDay === 4 && utcHour >= 22) return true;
  if (utcDay === 5 || utcDay === 6) return true;
  if (utcDay === 0) return true;
  if (utcDay === 1 && utcHour < 4) return true;
  return false;
}

function buildInstagramHashtags(
  riverSlug: string | null,
  conditionCode: string,
  extras: string[] = []
): string[] {
  return [
    ...IG_BASE_HASHTAGS,
    ...(riverSlug ? (RIVER_HASHTAGS[riverSlug] || []) : []),
    ...(CONDITION_HASHTAGS[conditionCode] || []),
    ...getSeasonalHashtags(),
    ...extras,
  ];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EddyUpdate {
  river_slug: string;
  condition_code: string;
  gauge_height_ft: number | null;
  quote_text: string;
  summary_text: string | null;
}

// ---------------------------------------------------------------------------
// River Highlight Caption
// ---------------------------------------------------------------------------

export function formatRiverHighlightCaption(
  update: EddyUpdate,
  customContent: SocialCustomContent[],
  platform: SocialPlatform
): { caption: string; hashtags: string[] } {
  const riverName = RIVER_SHORT_NAMES[update.river_slug] || update.river_slug;
  const condition = update.condition_code;
  const emoji = CONDITION_EMOJI[condition] || '';
  const gauge = formatGauge(update.gauge_height_ft);
  const seed = `${update.river_slug}-${new Date().toISOString().split('T')[0]}`;

  const lines: string[] = [];

  // 1. Hook line (first thing visible before "See more")
  const hookTemplates = HIGHLIGHT_HOOKS[condition] || HIGHLIGHT_HOOKS.good;
  const hook = interpolate(pickTemplate(hookTemplates, seed), {
    river: riverName,
    gauge,
  });
  lines.push(hook);
  lines.push('');

  // 2. Condition + gauge as a clean one-liner
  const shortLabel = SHORT_CONDITION_LABELS[condition] || 'Unknown';
  if (update.gauge_height_ft !== null) {
    lines.push(`${emoji} ${shortLabel} at ${gauge} ft`);
  } else {
    lines.push(`${emoji} ${shortLabel}`);
  }
  lines.push('');

  // 3. Eddy quote — both platforms (video teaser points viewers to caption)
  const quote = trimQuote(update, 280);
  if (quote) {
    lines.push(`Eddy says: \u201C${quote}\u201D`);
    lines.push('');
  }

  // 4. Weekend engagement question (only for floatable conditions)
  if (
    isWeekendWindow() &&
    (condition === 'flowing' || condition === 'good')
  ) {
    lines.push(pickTemplate(ENGAGEMENT_QUESTIONS, seed + '-q'));
    lines.push('');
  }

  // 5. CTA with deep link
  const cta = interpolate(pickTemplate(RIVER_CTAS, seed + '-cta'), {
    slug: update.river_slug,
  });
  lines.push(cta);

  // 6. Custom content snippets
  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  // Build hashtags (Instagram only in caption; Facebook gets none)
  const hashtags = buildInstagramHashtags(update.river_slug, condition);

  let caption = lines.join('\n');
  if (platform === 'instagram') {
    caption += '\n\n\n\n\n' + hashtags.join(' ');
  }

  return { caption, hashtags };
}

// ---------------------------------------------------------------------------
// Daily Digest Caption
// ---------------------------------------------------------------------------

export function formatDailyDigestCaption(
  updates: EddyUpdate[],
  globalSummary: string | null,
  customContent: SocialCustomContent[],
  platform: SocialPlatform
): { caption: string; hashtags: string[] } {
  const lines: string[] = [];
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const seed = `digest-${new Date().toISOString().split('T')[0]}`;
  const isWeekend = isWeekendWindow();
  const timeframe = isWeekend ? 'this weekend' : 'today';

  // 1. Hook line
  const hook = interpolate(pickTemplate(DIGEST_HOOKS, seed), {
    day: dayName,
    count: String(updates.length),
    timeframe,
  });
  lines.push(hook);
  lines.push('');

  // 2. Global summary from Eddy — shown on both platforms
  if (globalSummary) {
    const trimmed = globalSummary.length > 200
      ? globalSummary.slice(0, 197) + '...'
      : globalSummary;
    lines.push(`\u201C${trimmed}\u201D`);
    lines.push('');
  }

  // 3. Per-river conditions — clean, scannable format with emoji
  for (const update of updates) {
    const riverName = RIVER_NAMES[update.river_slug] || update.river_slug;
    const shortLabel = SHORT_CONDITION_LABELS[update.condition_code] || '?';
    const emoji = CONDITION_EMOJI[update.condition_code] || '';
    const gauge = update.gauge_height_ft !== null
      ? ` (${update.gauge_height_ft.toFixed(1)} ft)`
      : '';
    lines.push(`${emoji} ${riverName} \u2014 ${shortLabel}${gauge}`);
  }

  lines.push('');

  // 4. CTA
  lines.push(pickTemplate(DIGEST_CTAS, seed + '-cta'));

  // 5. Custom content
  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  const hashtags = buildInstagramHashtags(null, 'flowing', [
    '#ozarksriverreport',
    '#riverconditions',
  ]);

  let caption = lines.join('\n');
  if (platform === 'instagram') {
    caption += '\n\n\n\n\n' + hashtags.join(' ');
  }

  return { caption, hashtags };
}

// ---------------------------------------------------------------------------
// Condition Change Caption
// ---------------------------------------------------------------------------

export function formatConditionChangeCaption(params: {
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
  platform: SocialPlatform;
}): { caption: string; hashtags: string[] } {
  const riverName = RIVER_SHORT_NAMES[params.riverSlug] || params.riverSlug;
  const oldShort = SHORT_CONDITION_LABELS[params.oldCondition] || params.oldCondition;
  const newShort = SHORT_CONDITION_LABELS[params.newCondition] || params.newCondition;
  const newEmoji = CONDITION_EMOJI[params.newCondition] || '';
  const seed = `change-${params.riverSlug}-${new Date().toISOString().split('T')[0]}`;

  const lines: string[] = [];

  // 1. Hook line
  let hookPool: string[];
  if (params.newCondition === 'flowing') {
    hookPool = CONDITION_CHANGE_HOOKS.flowing;
  } else if (params.newCondition === 'dangerous') {
    hookPool = CONDITION_CHANGE_HOOKS.dangerous;
  } else if (params.newCondition === 'high') {
    hookPool = CONDITION_CHANGE_HOOKS.high;
  } else if (params.oldCondition === 'dangerous') {
    hookPool = CONDITION_CHANGE_HOOKS.from_dangerous;
  } else {
    hookPool = CONDITION_CHANGE_HOOKS.default;
  }
  lines.push(interpolate(pickTemplate(hookPool, seed), { river: riverName }));
  lines.push('');

  // 2. Transition line
  lines.push(`${oldShort} \u2192 ${newEmoji} ${newShort}`);

  if (params.gaugeHeightFt !== null) {
    lines.push(`Currently at ${params.gaugeHeightFt.toFixed(1)} ft`);
  }

  lines.push('');

  // 3. CTA with deep link
  const cta = interpolate(pickTemplate(CHANGE_CTAS, seed + '-cta'), {
    slug: params.riverSlug,
  });
  lines.push(cta);

  const hashtags = buildInstagramHashtags(
    params.riverSlug,
    params.newCondition,
    ['#conditionalert']
  );

  let caption = lines.join('\n');
  if (params.platform === 'instagram') {
    caption += '\n\n\n\n\n' + hashtags.join(' ');
  }

  return { caption, hashtags };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
