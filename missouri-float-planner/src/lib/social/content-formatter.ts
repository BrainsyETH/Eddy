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
  const shortLabel = SHORT_CONDITION_LABELS[condition] || 'Unknown';

  // 0. Headline (the first ~125 chars Instagram shows before the "more" fold).
  // Keep this deterministic — river name, condition, gauge — so every post's
  // feed preview reads the same shape and the factual summary never gets hidden
  // behind variable hook copy.
  if (update.gauge_height_ft !== null) {
    lines.push(`${riverName} — ${shortLabel} at ${gauge} ft ${emoji}`.trim());
  } else {
    lines.push(`${riverName} — ${shortLabel} ${emoji}`.trim());
  }
  lines.push('');

  // 1. Hook line
  const hookTemplates = HIGHLIGHT_HOOKS[condition] || HIGHLIGHT_HOOKS.good;
  const hook = interpolate(pickTemplate(hookTemplates, seed), {
    river: riverName,
    gauge,
  });
  lines.push(hook);
  lines.push('');

  // 3. Eddy Says full report — both platforms
  // The video shows a teaser with "Full report below ▼" directing viewers here
  const fullQuote = update.quote_text || update.summary_text;
  if (fullQuote) {
    lines.push(`Eddy says: \u201C${fullQuote}\u201D`);
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

  const caption = lines.join('\n');

  return { caption, hashtags: [] };
}

// ---------------------------------------------------------------------------
// Weekly Forecast Caption
// ---------------------------------------------------------------------------

export function formatWeeklyForecastCaption(
  topRivers: EddyUpdate[],
  customContent: SocialCustomContent[],
  platform: SocialPlatform,
): { caption: string; hashtags: string[] } {
  const lines: string[] = [];

  // Deterministic headline for the feed-preview fold.
  const names = topRivers
    .slice(0, 3)
    .map((r) => RIVER_SHORT_NAMES[r.river_slug] || r.river_slug)
    .join(', ');
  lines.push(`This Weekend — ${names} 🛶`);
  lines.push('');

  // Per-river one-liner: "🟢 Current River — Flowing at 3.2 ft"
  for (const river of topRivers.slice(0, 3)) {
    const name = RIVER_SHORT_NAMES[river.river_slug] || river.river_slug;
    const emoji = CONDITION_EMOJI[river.condition_code] || '';
    const label = SHORT_CONDITION_LABELS[river.condition_code] || 'Unknown';
    const gauge = formatGauge(river.gauge_height_ft);
    if (river.gauge_height_ft !== null) {
      lines.push(`${emoji} ${name} — ${label} at ${gauge} ft`);
    } else {
      lines.push(`${emoji} ${name} — ${label}`);
    }
  }
  lines.push('');

  // CTA
  lines.push('Pick your float at eddy.guide — live conditions, maps, and outfitters.');

  // Custom content snippets
  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  return { caption: lines.join('\n'), hashtags: [] };
}

// ---------------------------------------------------------------------------
// Section Guide Caption
// ---------------------------------------------------------------------------

export function formatSectionGuideCaption(
  section: {
    riverSlug: string;
    riverName: string;
    putInName: string;
    putInMile: number;
    takeOutName: string;
    takeOutMile: number;
    distanceMi: number;
    hoursCanoe: number;
  },
  customContent: SocialCustomContent[],
  platform: SocialPlatform,
): { caption: string; hashtags: string[] } {
  const lines: string[] = [];

  lines.push(
    `Float of the Week — ${section.riverName}: ${section.putInName} → ${section.takeOutName}`,
  );
  lines.push('');
  lines.push(`🛶 ${section.distanceMi.toFixed(1)} mi · ~${section.hoursCanoe.toFixed(1)} hrs canoe`);
  lines.push(`📍 Put-in: ${section.putInName} (MM ${section.putInMile.toFixed(1)})`);
  lines.push(`🏁 Take-out: ${section.takeOutName} (MM ${section.takeOutMile.toFixed(1)})`);
  lines.push('');
  lines.push(`Plan this float at eddy.guide/${section.riverSlug}`);

  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  return { caption: lines.join('\n'), hashtags: [] };
}

// ---------------------------------------------------------------------------
// Weekly Trend Caption
// ---------------------------------------------------------------------------

export function formatWeeklyTrendCaption(
  trend: {
    riverSlug: string;
    riverName: string;
    currentHeightFt: number | null;
    sevenDayFirstFt: number | null;
    sevenDayMinFt: number | null;
    sevenDayMaxFt: number | null;
    deltaFt: number;
    direction: 'rising' | 'falling' | 'flat';
  },
  customContent: SocialCustomContent[],
  platform: SocialPlatform,
): { caption: string; hashtags: string[] } {
  const lines: string[] = [];
  const arrow = trend.direction === 'rising' ? '↑' : trend.direction === 'falling' ? '↓' : '→';
  const deltaSign = trend.deltaFt > 0 ? '+' : trend.deltaFt < 0 ? '−' : '';
  const deltaAbs = Math.abs(trend.deltaFt).toFixed(1);

  lines.push(
    `${trend.riverName} · 7-day ${trend.direction} ${arrow} ${deltaSign}${deltaAbs} ft`,
  );
  lines.push('');
  if (trend.currentHeightFt !== null) {
    lines.push(`Current: ${trend.currentHeightFt.toFixed(1)} ft`);
  }
  if (trend.sevenDayMinFt !== null && trend.sevenDayMaxFt !== null) {
    lines.push(`Week range: ${trend.sevenDayMinFt.toFixed(1)}–${trend.sevenDayMaxFt.toFixed(1)} ft`);
  }
  lines.push('');
  if (trend.direction === 'rising') {
    lines.push('Levels are climbing — check back midweek for updated conditions.');
  } else if (trend.direction === 'falling') {
    lines.push('Levels are dropping — good timing if you were waiting for high water to clear.');
  } else {
    lines.push('Holding steady — predictable conditions for planning.');
  }
  lines.push('');
  lines.push(`Full 7-day chart: eddy.guide/${trend.riverSlug}`);

  const snippets = getActiveSnippets(customContent, platform);
  if (snippets.length > 0) {
    lines.push('');
    lines.push(snippets.join('\n'));
  }

  return { caption: lines.join('\n'), hashtags: [] };
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

  const caption = lines.join('\n');

  return { caption, hashtags: [] };
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
  const newShort = SHORT_CONDITION_LABELS[params.newCondition] || params.newCondition;
  const severity =
    params.newCondition === 'dangerous' ? 'DANGEROUS' :
    params.newCondition === 'high' ? 'HIGH WATER' :
    newShort.toUpperCase();
  const gaugeText = params.gaugeHeightFt !== null
    ? ` · ${params.gaugeHeightFt.toFixed(1)} ft`
    : '';

  const lines: string[] = [];

  // 0. Warning headline — the first ~125 chars IG shows before "more".
  // Warning-first so the feed preview reads as a safety alert, not news.
  lines.push(`⚠️ ${severity} — ${riverName}${gaugeText}`);
  lines.push('');

  // 1. What changed + what to do
  if (params.newCondition === 'dangerous') {
    lines.push(
      `${riverName} has crossed into dangerous water. Rising levels bring strainers, submerged hazards, and fast current that can overwhelm even experienced paddlers.`,
    );
    lines.push('');
    lines.push('DO NOT FLOAT until levels drop. Check back in 24–48 hours or wait for the all-clear.');
  } else if (params.newCondition === 'high') {
    lines.push(
      `${riverName} has risen into high water. Stronger current, faster travel, and more hazards than normal — floatable only for experienced paddlers in appropriate boats.`,
    );
    lines.push('');
    lines.push('Beginners and families should wait it out. If you go: PFDs on everyone, scout access points, plan a shorter float.');
  }
  lines.push('');

  // 2. Live-conditions CTA — the core value
  lines.push(`Live gauge + conditions: eddy.guide/${params.riverSlug}`);
  lines.push(`Share this alert with anyone planning to float ${riverName} this week.`);

  return { caption: lines.join('\n'), hashtags: [] };
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
