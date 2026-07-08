// src/lib/social/caption-generator.ts
// AI-powered caption generation using Anthropic Claude.
// Ported from ClawsifiedInfo generate-caption.sh
//
// Generates Instagram captions with hook <125 chars, "knowledgeable local" tone,
// source attribution for YouTube clips, and recent caption deduplication.

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocalParts, getLocalDateStrings } from './local-time';
import type { HookStyle, ContentCategory } from './types';

const LOG_PREFIX = '[CaptionGen]';

// Missouri is Central time; anchor "today" to the same zone the rest of the
// social pipeline uses so seasonal language matches the calendar, not UTC.
const MISSOURI_TZ = 'America/Chicago';

/**
 * Current Missouri season, derived from the local month. Captions must stay
 * honest: clips are frequently reposted from other creators and may have been
 * filmed in a different season, so seasonal language has to be anchored to the
 * real calendar date — never inferred from how the footage happens to look.
 */
function getCurrentSeason(now: Date = new Date()): 'winter' | 'spring' | 'summer' | 'fall' {
  const { month } = getLocalParts(MISSOURI_TZ, now);
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}

interface CaptionParams {
  contentType: ContentCategory;
  hookStyle: HookStyle;
  riverName: string;
  conditionCode?: string;
  gaugeHeight?: number;
  // False when the clip's location is NOT confirmed to be a known Missouri river
  // (Tier 2 reposts may be out of state). Suppresses Missouri/location-specific
  // claims and hashtags. Defaults to true for callers that pass a known river.
  allowLocationHashtags?: boolean;
  clipMetadata?: {
    sourceCreator?: string;
    sourceUrl?: string;
    description?: string;
  };
}

interface GeneratedCaption {
  caption: string;
  hook: string;
  hashtags: string[];
}

// Hook style examples. Kept honest on purpose: the model imitates these, so none
// of them may model fabrication (invented gauge numbers, invented personal
// history, or manufactured scarcity). The stat/urgency examples reference data
// only in the abstract because those styles are only offered when real
// conditions data is supplied to the prompt.
const HOOK_EXAMPLES: Record<HookStyle, string[]> = {
  question: [
    'Think you know the Current River?',
    'Ever floated the Meramec at a level like this?',
    'What makes Huzzah Creek worth the drive?',
  ],
  stat: [
    'That reading changes the whole float.',
    'The gauge tells you everything you need to know here.',
    'Numbers like this are why locals watch the gauge.',
  ],
  urgency: [
    'Windows like this are the reason to keep the gear packed.',
    'When the level lines up, you go.',
    "If you've been waiting on the right water — pay attention.",
  ],
  story: [
    'The locals call this stretch the sweet spot.',
    'This is the kind of water that rewards a little river-reading.',
    'Some sections you float once; this one you come back to.',
  ],
};

/**
 * Build the source-attribution lines for a clip: credit the original creator
 * and link back to the source video. Returned as separate lines so the same
 * citation is used by both the AI prompt and the template fallback.
 */
function buildAttributionLines(clip?: CaptionParams['clipMetadata']): string[] {
  const lines: string[] = [];
  const creator = clip?.sourceCreator?.trim();
  const url = clip?.sourceUrl?.trim();
  if (creator) lines.push(`📹 Clip: ${creator}`);
  if (url) lines.push(url);
  return lines;
}

/**
 * Generate a caption using Claude.
 *
 * Accuracy is enforced in two layers: the prompt states hard rules (season,
 * conditions data, location, no invented specifics), and every draft is then
 * run through findAccuracyViolations() — a deterministic lint. A draft that
 * trips the lint is regenerated once with the violations fed back in; if it
 * still fails, we fall back to the (safe, deterministic) template rather than
 * publish an inaccurate caption. Also falls back if the API errors.
 */
export async function generateCaption(params: CaptionParams): Promise<GeneratedCaption> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn(`${LOG_PREFIX} ANTHROPIC_API_KEY not set, using template fallback`);
    return generateTemplateFallback(params);
  }

  // Get recent captions for dedup
  const recentCaptions = await getRecentCaptions(5);

  const hookExamples = HOOK_EXAMPLES[params.hookStyle].join('\n- ');

  const attributionLines = buildAttributionLines(params.clipMetadata);
  const attributionPrompt = attributionLines.length
    ? `ATTRIBUTION (required): this clip is sourced from another creator. End the caption with these lines verbatim, each on its own line, and do not omit them:\n${attributionLines.join('\n')}`
    : '';

  const now = new Date();
  const season = getCurrentSeason(now);
  const { dateStr } = getLocalDateStrings(MISSOURI_TZ, now);

  // Live data is only present when the caller supplies a condition code or a
  // gauge reading. Clip reposts do not, so those captions must never state a
  // number or claim conditions are "good/optimal/running well".
  const hasLiveData = Boolean(params.conditionCode || params.gaugeHeight);
  const allowLocation = params.allowLocationHashtags !== false;

  const conditionsRule = hasLiveData
    ? `- CONDITIONS: You are given real, current data below (CONDITION / GAUGE HEIGHT). You may reference it, but do NOT invent any figure that is not provided (no made-up water temperature, flow/cfs, or a gauge height other than the one given).`
    : `- CONDITIONS (critical — do not violate): You have NOT been given any live conditions data for this clip. Do NOT state or imply ANY specific number — no gauge height in feet, no water temperature, no flow/cfs. Do NOT claim conditions are "optimal", "perfect", "running well", "cooperative", "prime", or otherwise rate the current water. Do NOT manufacture time-sensitive scarcity ("last weekend", "won't last", "before it drops", "catch it now"). Talk about the river in general terms and send people to eddy.guide to check the live gauge themselves.`;

  const locationRule = allowLocation
    ? ''
    : `\n- LOCATION (critical — do not violate): This clip's location is NOT confirmed to be in Missouri. Do NOT use #Missouri or any Missouri-specific or river-specific place name/claim/hashtag. Keep it to general Ozark / paddling framing.`;

  const prompt = `Generate an Instagram caption for the Eddy.guide account (Missouri float trip / river conditions guide).

REQUIREMENTS:
- Hook (first line): Under 125 characters. This is what shows before "...more"
- Tone: Sound like a knowledgeable local who paddles every weekend — NOT a tourism board
- DO NOT use marketing buzzwords like "unlock", "discover", "hidden gem", "adventure awaits"
- Be specific about the river and what's actually happening, but every specific must be grounded in the data below — do NOT fabricate to sound specific
- When "CLIP SHOWS" is provided, anchor the caption in what the footage actually depicts (the craft, water, and scenery described). Do NOT invent visual details that aren't listed
- NO INVENTED SPECIFICS: Do NOT invent geology, rock/bluff types, named rapids, landmarks, distances, mile markers, or place details that are not in CLIP SHOWS or the data below
- FOOTAGE IS NOT LIVE: This is a reposted clip that may have been filmed on any past date. Do NOT claim or imply the footage was shot recently, today, or "right now", and do not claim it shows current conditions
${conditionsRule}${locationRule}
- SEASONAL ACCURACY (critical — do not violate): Today is ${dateStr}, so it is currently ${season} in Missouri. Only reference the CURRENT season (${season}). Do NOT claim, imply, or hint at any other season, month, or foliage/weather state — no "fall color", "peak leaves", "one more fall float", "spring runoff", "before the season shifts", etc. — unless it genuinely matches ${season}. These clips are often reposted from other creators and may have been filmed in a different season, so NEVER infer the season from the footage's colors, foliage, light, or the CLIP SHOWS text; anchor every seasonal reference to today's date. This rule also governs the hashtags — do not output seasonal hashtags (e.g. #FallFloating) that contradict ${season}.
- NO INVENTED PERSONAL HISTORY: Do NOT claim first-person experience that didn't happen ("I've floated this 50 times", "we were just out here"). Write as a knowledgeable guide, not with a fake personal anecdote.
- 2-3 relevant keywords woven naturally
- Minimal emojis (0-2 max)
- End with a call to action pointing to eddy.guide

CONTENT TYPE: ${params.contentType}
HOOK STYLE: ${params.hookStyle}
Examples of this hook style:
- ${hookExamples}

TODAY: ${dateStr} (current season in Missouri: ${season})
RIVER: ${params.riverName}
${params.conditionCode ? `CONDITION: ${params.conditionCode}` : ''}
${params.gaugeHeight ? `GAUGE HEIGHT: ${params.gaugeHeight} ft` : ''}
${params.clipMetadata?.description ? `CLIP SHOWS: ${params.clipMetadata.description}` : ''}

${attributionPrompt}

RECENT CAPTIONS (avoid repeating these hooks):
${recentCaptions.map((c) => `- ${c.slice(0, 100)}`).join('\n')}

FORMAT YOUR RESPONSE AS:
HOOK: [the hook line, under 125 chars]
CAPTION: [full caption including the hook as the first line]
HASHTAGS: [5-8 hashtags, comma-separated]`;

  const ctx: AccuracyContext = { season, hasLiveData, allowLocation };

  try {
    const client = new Anthropic({ apiKey });

    // Up to two attempts: draft, then a single regeneration that feeds the
    // lint's complaints back to the model. If both trip the lint, use the
    // deterministic template — never ship a caption we know is inaccurate.
    let lastDraft: GeneratedCaption | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
      if (attempt > 0 && lastDraft) {
        const violations = findAccuracyViolations(lastDraft, ctx);
        messages.push(
          { role: 'assistant', content: renderDraft(lastDraft) },
          {
            role: 'user',
            content: `That draft violates these accuracy rules:\n- ${violations.join(
              '\n- ',
            )}\nRewrite the caption so none of these occur. Keep the same format (HOOK / CAPTION / HASHTAGS).`,
          },
        );
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const draft = parseDraft(text);
      const violations = findAccuracyViolations(draft, ctx);

      if (draft.hook.length > 125) {
        console.warn(`${LOG_PREFIX} Hook exceeds 125 chars (${draft.hook.length})`);
      }

      if (violations.length === 0) {
        console.log(
          `${LOG_PREFIX} Generated caption (attempt ${attempt + 1}): hook="${draft.hook.slice(0, 60)}..." (${draft.hook.length} chars)`,
        );
        return draft;
      }

      console.warn(
        `${LOG_PREFIX} Draft failed accuracy lint (attempt ${attempt + 1}): ${violations.join('; ')}`,
      );
      lastDraft = draft;
    }

    console.warn(`${LOG_PREFIX} Caption failed accuracy lint twice, using template fallback`);
    return generateTemplateFallback(params);
  } catch (error) {
    console.error(`${LOG_PREFIX} Claude API error:`, error);
    return generateTemplateFallback(params);
  }
}

/** Parse the HOOK/CAPTION/HASHTAGS block the model is asked to return. */
function parseDraft(text: string): GeneratedCaption {
  const hookMatch = text.match(/HOOK:\s*(.+)/);
  const captionMatch = text.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/);
  const hashtagsMatch = text.match(/HASHTAGS:\s*(.+)/);

  const hook = hookMatch?.[1]?.trim() || '';
  const caption = captionMatch?.[1]?.trim() || text.trim();
  const hashtags = hashtagsMatch?.[1]
    ?.split(',')
    .map((h) => h.trim())
    .filter((h: string) => h.length > 0)
    .map((h: string) => (h.startsWith('#') ? h : `#${h}`)) || [];

  return { caption, hook, hashtags };
}

/** Re-serialize a draft back into the HOOK/CAPTION/HASHTAGS format for a retry. */
function renderDraft(d: GeneratedCaption): string {
  return `HOOK: ${d.hook}\nCAPTION: ${d.caption}\nHASHTAGS: ${d.hashtags.join(', ')}`;
}

interface AccuracyContext {
  season: 'winter' | 'spring' | 'summer' | 'fall';
  hasLiveData: boolean;
  allowLocation: boolean;
}

// Seasonal words/phrases/hashtags that are a lie when it is NOT that season.
// "spring" and "fall" are deliberately handled with care: bare "spring" is
// skipped (Ozark rivers are full of literal springs) and "\bfall\b" won't match
// "waterfall" (no word boundary), so only genuine season references are caught.
const SEASON_PATTERNS: Record<AccuracyContext['season'], RegExp[]> = {
  winter: [/\bwinter(y|time)?\b/i, /\bsnow(y|fall|melt)?\b/i, /\bfrozen\b/i, /#winter\w*/i],
  spring: [/\bspringtime\b/i, /spring (runoff|melt|thaw|bloom)/i, /#spring\w*/i],
  summer: [/\bsummer(time)?\b/i, /#summer\w*/i],
  fall: [
    // "fall" as the season, but not the verb ("fall out of the boat", "fall in").
    /\bfall\b(?!\s+(?:out|in|into|off|over|behind|back|asleep|apart|short|through|down)\b)/i,
    /\bautumn(al)?\b/i,
    /\bfoliage\b/i,
    /peak (color|colors|leaves|foliage)/i,
    /fall (color|colors|float|foliage|leaves)/i,
    /leaves (are )?(chang|drop|turn|fall)/i,
    /#fall\w*/i,
    /#autumn\w*/i,
  ],
};

/**
 * Deterministic accuracy lint for a generated caption. Returns a list of
 * human-readable violations (empty = clean). This is the backstop that turns
 * the prompt's "do not" rules into something that actually catches a bad draft
 * before it publishes — dedup never checked accuracy, only novelty.
 */
export function findAccuracyViolations(draft: GeneratedCaption, ctx: AccuracyContext): string[] {
  const violations: string[] = [];
  const text = `${draft.caption}\n${draft.hashtags.join(' ')}`;

  // Out-of-season references (any season that is not the current one).
  for (const [name, patterns] of Object.entries(SEASON_PATTERNS)) {
    if (name === ctx.season) continue;
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        violations.push(`references "${m[0]}" but the current season is ${ctx.season}`);
        break;
      }
    }
  }

  if (!ctx.hasLiveData) {
    // Fabricated numeric conditions.
    const numeric =
      text.match(/\b\d+(\.\d+)?\s?(ft|feet|foot)\b/i) ||
      text.match(/\b\d+(\.\d+)?\s?°/) ||
      text.match(/\b\d+(\.\d+)?\s?(degrees?|cfs)\b/i);
    if (numeric) violations.push(`states a specific figure "${numeric[0]}" with no live data provided`);

    // Rating the water or manufacturing scarcity with no data behind it.
    const claim = text.match(
      /\b(running|conditions?)\s+(optimal|perfect|prime|great|ideal|cooperative)\b/i,
    ) || text.match(/\b(optimal|perfect|prime|ideal)\s+(level|levels|flow|water|conditions?)\b/i);
    if (claim) violations.push(`rates conditions "${claim[0]}" with no live data provided`);

    const scarcity =
      text.match(/last (weekend|chance|call|days?)/i) ||
      text.match(/won'?t (last|stay)/i) ||
      text.match(/before (it drops|it's gone|the season|conditions? change)/i) ||
      text.match(/catch it (now|while)/i);
    if (scarcity) violations.push(`manufactures urgency "${scarcity[0]}" with no live data provided`);
  }

  if (!ctx.allowLocation) {
    const loc = text.match(/#missouri\w*/i) || text.match(/\bmissouri\b/i);
    if (loc) violations.push(`claims Missouri ("${loc[0]}") but the clip location is unconfirmed`);
  }

  // Marketing buzzwords and fabricated personal history.
  const buzz = text.match(/\b(unlock|hidden gem|adventure awaits|bucket[- ]?list)\b/i);
  if (buzz) violations.push(`uses banned marketing phrase "${buzz[0]}"`);

  const personal = text.match(/\bI'?ve (floated|paddled|run|been (out|here))\b[^.!?\n]*\b\d+\b/i) ||
    text.match(/\b(floated|paddled|run) (this|it|here) \d+ times\b/i);
  if (personal) violations.push(`claims invented personal history "${personal[0].slice(0, 40)}"`);

  return violations;
}

/**
 * Template-based fallback when API is unavailable.
 */
function generateTemplateFallback(params: CaptionParams): GeneratedCaption {
  const { hookStyle, riverName, conditionCode, clipMetadata } = params;
  const allowLocation = params.allowLocationHashtags !== false;

  // Honest by construction: no manufactured scarcity, no "right now" recency
  // claim over reposted footage, and conditions are only stated when real data
  // (conditionCode) is actually present.
  const hooks: Record<HookStyle, (river: string) => string> = {
    question: (r) => `Ever floated the ${r}?`,
    stat: (r) => (conditionCode ? `The ${r} is running ${conditionCode}.` : `The ${r} is worth a look.`),
    urgency: (r) => `Keep the ${r} on your list.`,
    story: (r) => `A look at the ${r}.`,
  };

  const hook = hooks[hookStyle](riverName);

  let caption = `${hook}\n\n`;
  if (conditionCode) {
    caption += `Conditions: ${conditionCode}. `;
  }
  caption += `Check the current gauge and plan your float at eddy.guide`;

  const attributionLines = buildAttributionLines(clipMetadata);
  if (attributionLines.length) {
    caption += `\n\n${attributionLines.join('\n')}`;
  }

  const riverTag = `#${riverName.replace(/[^A-Za-z0-9]/g, '')}`;
  const hashtags = allowLocation
    ? ['#MissouriFloat', '#FloatTrip', riverTag, '#RiverLife', '#Kayaking']
    : ['#FloatTrip', '#Paddling', '#Ozarks', '#RiverLife', '#Kayaking'];

  return { caption, hook, hashtags };
}

/**
 * Fetch recent captions for deduplication.
 */
async function getRecentCaptions(count: number): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('social_posts')
      .select('caption')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(count);

    return (data || []).map((p: { caption: string }) => p.caption).filter(Boolean);
  } catch {
    return [];
  }
}
