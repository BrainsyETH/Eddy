// src/lib/social/caption-generator.ts
// AI-powered caption generation using Anthropic Claude.
// Ported from ClawsifiedInfo generate-caption.sh
//
// Two callers share one model call, one accuracy lint and one dedup pass:
//   - clip reels (Instagram/Facebook): hook <125 chars, "knowledgeable local"
//     tone, creator attribution, no live-data claims;
//   - the weekday river-guide post (Facebook link post): the same Eddy voice
//     as the river updates, grounded ONLY on the published guide's points.
// Pass `guide` for the second; everything else is the clip path.

import { trackedAnthropic } from '@/lib/telemetry/upstream';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { EDDY_VOICE } from '@/lib/eddy/voice';
import { clipCreditLine } from './clip-credit';
import { getLocalParts, getLocalDateStrings } from './local-time';
import type { HookStyle, ContentCategory } from './types';
import type { ResolvedModel } from '@/lib/ai/resolve-models';

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
  /** Resolved by the caller from llm_config, so a switch cannot land mid-post. */
  model: ResolvedModel;
  contentType: ContentCategory;
  hookStyle: HookStyle;
  riverName: string;
  conditionCode?: string;
  gaugeHeight?: number;
  // False when the clip's location is NOT confirmed to be a known Missouri river
  // (Tier 2 reposts may be out of state). Suppresses Missouri/location-specific
  // claims and hashtags. Defaults to true for callers that pass a known river.
  allowLocationHashtags?: boolean;
  /**
   * The creator credit for a reposted clip, already worded ("🎥 Clip via
   * @handle"). The model must keep it verbatim: an "@handle" is the creator's
   * Instagram account and the mention is what tags them. Built by
   * clip-credit.ts; prefer this over clipMetadata.sourceCreator.
   */
  creditLine?: string;
  /**
   * The exact call-to-action line to end on. Absent → the generic "point to
   * eddy.guide" instruction. Clips pass the app download CTA.
   */
  ctaLine?: string;
  clipMetadata?: {
    /** Legacy: a bare creator credit ("@handle" or channel name); worded by clipCreditLine. */
    sourceCreator?: string;
    sourceUrl?: string;
    description?: string;
  };
  /**
   * Present for the weekday river-guide Facebook post. Switches the prompt to
   * the guide rules (evergreen, grounded on the published points, no hashtags,
   * no URL) and lets the lint accept figures and seasonal patterns that the
   * guide itself states.
   */
  guide?: GuideCaptionContext;
}

export interface GuideCaptionContext {
  /** The article title (shown by the link card, so the caption must not repeat it). */
  title: string;
  /** Eddy's curated one-line opening for this river, when one exists. */
  opening?: string;
  /** Complete, published points from the guide — the only facts allowed. */
  points: string[];
}

export interface GeneratedCaption {
  caption: string;
  hook: string;
  hashtags: string[];
  /** Whether the model wrote this or the deterministic template did. */
  source: 'model' | 'template';
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
 * (tagging their Instagram when the credit is an @handle) and link back to the
 * source video when a URL is given. Returned as separate lines so the same
 * citation is used by both the AI prompt and the template fallback.
 */
function buildAttributionLines(params: Pick<CaptionParams, 'creditLine' | 'clipMetadata'>): string[] {
  const lines: string[] = [];
  const credit =
    params.creditLine?.trim() ||
    (params.clipMetadata?.sourceCreator?.trim()
      ? clipCreditLine({ source_creator: params.clipMetadata.sourceCreator.trim() })
      : null);
  const url = params.clipMetadata?.sourceUrl?.trim();
  if (credit) lines.push(credit);
  if (url) lines.push(url);
  return lines;
}

/** The closing CTA instruction: the caller's exact line, or the generic one. */
function ctaRule(ctaLine: string | undefined): string {
  return ctaLine?.trim()
    ? `- End with this call to action, verbatim, on its own line: ${ctaLine.trim()}`
    : '- End with a call to action pointing to eddy.guide';
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

  const now = new Date();
  const season = getCurrentSeason(now);
  const { dateStr } = getLocalDateStrings(MISSOURI_TZ, now);

  if (params.guide) {
    // Dedup against the last few GUIDE posts only. The unfiltered list is
    // mostly Float Pick spec sheets, and a model shown five of those writes a
    // sixth; its own recent guide posts are what it must not repeat.
    const recentGuides = await getRecentCaptions(4, 'blog_feature');
    const prompt = buildGuidePrompt(params.guide, params.riverName, params.ctaLine, recentGuides, dateStr, season);
    const ctx: AccuracyContext = {
      season,
      hasLiveData: false,
      allowLocation: true,
      grounding: [params.guide.opening ?? '', ...params.guide.points].join('\n'),
    };
    return draftWithLint(prompt, ctx, params.model, () => generateTemplateFallback(params));
  }

  // Get recent captions for dedup
  const recentCaptions = await getRecentCaptions(5);

  const hookExamples = HOOK_EXAMPLES[params.hookStyle].join('\n- ');

  const attributionLines = buildAttributionLines(params);
  const attributionPrompt = attributionLines.length
    ? `ATTRIBUTION (required): this clip is sourced from another creator. Include these lines verbatim, each on its own line, directly before the call to action, and do not omit or reword them (an @handle is the creator's Instagram account — keep it exactly as written):\n${attributionLines.join('\n')}`
    : '';

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
${ctaRule(params.ctaLine)}

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
  return draftWithLint(prompt, ctx, params.model, () => generateTemplateFallback(params));
}

/**
 * The prompt for the weekday river-guide Facebook post. Exported so a test can
 * pin what the model is told without a model call: the voice, the grounding,
 * the evergreen rule, and that nothing clip-specific leaks in.
 */
export function buildGuidePrompt(
  guide: GuideCaptionContext,
  riverName: string,
  ctaLine: string | undefined,
  recentCaptions: string[],
  dateStr: string,
  season: AccuracyContext['season'],
): string {
  const points = guide.points.map((p, i) => `${i + 1}. ${p}`).join('\n');
  return `Write a Facebook post for Eddy (eddy.guide), the Ozarks float trip planner. It links to Eddy's river guide for ${riverName}; Facebook shows the article card (title and photo) under your text.

WHO IS TALKING: ${EDDY_VOICE}

HOW IT SHOULD SOUND: like a friend who knows this river answering "so what's the deal with ${riverName}?" out loud. Say your draft in your head. If a sentence is something nobody would say to a friend, rewrite it.
- Lead with what a person would actually care about: why go, what surprises people, what trips people up. Then the one or two practical things that follow from it.
- Mix short sentences and longer ones. Use contractions. Plain words: "stretch" not "reach", "trip" not "outing", "the water's cold" not "cold water is part of the character".
- At most one instruction per paragraph. A post that is a string of commands (walk this, keep that, know this) is the failure mode.
- One question is fine. No exclamation pileups, no dashes as a crutch, no tidy three-part parallel sentences, no sentence that is just a label.

The difference, with made-up generic examples (do not reuse their details):
ROBOTIC: "The spring itself is a land stop. Keep the dam and spillway out of your paddling plan entirely. They're not part of the float."
HUMAN: "The spring is the kind of place you walk around for an hour, not something you paddle. The dam below it isn't part of any float, so save the river for after."
ROBOTIC: "The upper trips and the lower floats are different outings, not interchangeable."
HUMAN: "Up top you're hopping ledges. Lower down it's a lazy float. Figure out which one you're signing up for before you book a shuttle."

FACTS (critical):
- Use only the ANGLE and the GUIDE POINTS below. Put them in your own words. Do not copy a sentence, a phrase, or a label from them; a draft that repeats the guide's wording is rejected.
- Pick the two or three points a person would bring up and skip the rest. Keep the meaning of any warning you use (a "not the same trip", a "check first", a "stay off") and say it like a person.
- Nothing else: no place, access, spring, outfitter, mile, distance, number, rating, or history that is not in the points, however plausible.
- This is an evergreen guide, NOT today's conditions. Do NOT state or imply current water levels, flow, temperature, or that the river is running well right now. Do NOT manufacture urgency ("this weekend", "before it drops", "catch it now").
- Never tell the reader they are "cleared", "good to go", or that it is "safe to launch". Eddy shows the live gauge; the reader decides.
- SEASON: Today is ${dateStr}, so it is ${season} in Missouri. Do not claim or imply that any other season is happening now. Mentioning a seasonal pattern that a GUIDE POINT states (for example what a stretch does in late summer) is fine.
- NO INVENTED PERSONAL HISTORY: no "we were just out there", no "I've floated this a hundred times". Knowledgeable guide, not a fake anecdote.
- No marketing buzzwords: "unlock", "discover", "hidden gem", "adventure awaits", "bucket list".

SHAPE:
- 45 to 100 words, in 2 or 3 short paragraphs separated by a blank line.
- The first line is under 125 characters and specific to this river. It should make someone who knows the river nod and someone who doesn't want to read on.
- Do not repeat the article title (the card shows it). No URL, no hashtags, no "link in bio", no emoji in the body.
${ctaRule(ctaLine)}

RIVER: ${riverName}
ARTICLE TITLE (do not repeat): ${guide.title}
ANGLE (the idea to open on, in your own words, not this sentence): ${guide.opening ?? '(none; pick the angle from the points)'}
GUIDE POINTS (the only facts allowed; use two or three):
${points || '(none; use only the angle)'}

YOUR LAST FEW GUIDE POSTS (do not repeat their openings or their structure):
${recentCaptions.map((c) => `- ${c.slice(0, 160).replace(/\s+/g, ' ')}`).join('\n') || '- (none)'}

FORMAT YOUR RESPONSE AS:
HOOK: [the first line, under 125 chars]
CAPTION: [the full post text including the hook as the first line, paragraphs separated by blank lines, ending on the call to action]
HASHTAGS: none`;
}

/**
 * Draft, lint, and retry once with the lint's complaints fed back. If both
 * drafts trip the lint, or the API fails, return the caller's deterministic
 * fallback — never a caption we know is inaccurate.
 */
async function draftWithLint(
  prompt: string,
  ctx: AccuracyContext,
  model: ResolvedModel,
  fallback: () => GeneratedCaption,
): Promise<GeneratedCaption> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback();

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

      const response = await trackedAnthropic('social_caption', model.id, () => client.messages.create({
        model: model.id,
        max_tokens: model.maxTokens,
        // Omitted entirely unless the model needs it. A thinking model left
        // un-disabled would spend this budget reasoning about a caption.
        ...(model.thinking ? { thinking: model.thinking } : {}),
        messages,
      }));

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
    return fallback();
  } catch (error) {
    console.error(`${LOG_PREFIX} Claude API error:`, error);
    return fallback();
  }
}

/** Parse the HOOK/CAPTION/HASHTAGS block the model is asked to return. */
export function parseDraft(text: string): GeneratedCaption {
  const hookMatch = text.match(/HOOK:\s*(.+)/);
  const captionMatch = text.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/);
  const hashtagsMatch = text.match(/HASHTAGS:\s*(.+)/);

  const hook = hookMatch?.[1]?.trim() || '';
  const caption = captionMatch?.[1]?.trim() || text.trim();
  const hashtags = hashtagsMatch?.[1]
    ?.split(',')
    .map((h) => h.trim())
    .filter((h: string) => h.length > 0 && h.toLowerCase() !== 'none')
    .map((h: string) => (h.startsWith('#') ? h : `#${h}`)) || [];

  return { caption, hook, hashtags, source: 'model' };
}

/** Re-serialize a draft back into the HOOK/CAPTION/HASHTAGS format for a retry. */
function renderDraft(d: GeneratedCaption): string {
  return `HOOK: ${d.hook}\nCAPTION: ${d.caption}\nHASHTAGS: ${d.hashtags.join(', ')}`;
}

export interface AccuracyContext {
  season: 'winter' | 'spring' | 'summer' | 'fall';
  hasLiveData: boolean;
  allowLocation: boolean;
  /**
   * Text the caption is allowed to repeat even where a rule would otherwise
   * fire: the published guide points. "310 ft" or "late summer" is a
   * fabrication in a clip caption and a quotation in a guide caption.
   */
  grounding?: string;
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

// Words that mark text as copied from a guide rather than said by a person.
// Short and deliberate: each one appeared in a published post that read
// robotic, or is the kind of hedge nobody says out loud.
const STIFF_PHRASES =
  /\b(interchangeable|outings?|land stop|focal point|prior to|ensure|utilize|it is important|note that|keep in mind|be sure to|planning conversation)\b/i;

/** How many consecutive words in a row count as copying rather than reusing a name. */
const COPIED_RUN_WORDS = 7;

const normalizeWords = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * The first run of COPIED_RUN_WORDS consecutive words in `draft` that also
 * appears, in order, in `grounding`; null when the draft is in its own words.
 * Place names are a few words long, so a seven-word window never flags one.
 */
export function copiedRun(draft: string, grounding: string): string | null {
  const haystack = ` ${normalizeWords(grounding).join(' ')} `;
  const words = normalizeWords(draft);
  for (let i = 0; i + COPIED_RUN_WORDS <= words.length; i++) {
    const run = words.slice(i, i + COPIED_RUN_WORDS).join(' ');
    if (haystack.includes(` ${run} `)) return run;
  }
  return null;
}

/**
 * Deterministic accuracy lint for a generated caption. Returns a list of
 * human-readable violations (empty = clean). This is the backstop that turns
 * the prompt's "do not" rules into something that actually catches a bad draft
 * before it publishes — dedup never checked accuracy, only novelty.
 */
export function findAccuracyViolations(draft: Pick<GeneratedCaption, 'caption' | 'hashtags'>, ctx: AccuracyContext): string[] {
  const violations: string[] = [];
  const text = `${draft.caption}\n${draft.hashtags.join(' ')}`;
  const grounding = (ctx.grounding ?? '').toLowerCase();
  // A match that the supplied grounding text itself contains is a quotation,
  // not an invention. Only the guide path supplies grounding.
  const grounded = (m: string) => grounding.length > 0 && grounding.includes(m.toLowerCase());
  // A season word is grounded only as the phrase the guide used: "late summer"
  // quoted from a point is fine, "this summer" built around the same word is
  // still a claim about now.
  const groundedPhrase = (m: RegExpMatchArray) => {
    const before = text.slice(0, m.index ?? 0).trimEnd().split(/\s+/).pop() ?? '';
    return grounded(`${before} ${m[0]}`.trim());
  };

  // Out-of-season references (any season that is not the current one).
  for (const [name, patterns] of Object.entries(SEASON_PATTERNS)) {
    if (name === ctx.season) continue;
    for (const re of patterns) {
      const m = text.match(re);
      if (m && !groundedPhrase(m)) {
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
    if (numeric && !grounded(numeric[0])) violations.push(`states a specific figure "${numeric[0]}" with no live data provided`);

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

  if (grounding) {
    // Copied wording. The guide points are the facts, not the prose: a run of
    // several words lifted from them (or from the curated opening) is what
    // makes a post read like the bullets it came from.
    const copied = copiedRun(draft.caption, grounding);
    if (copied) violations.push(`copies the guide's wording instead of saying it in its own words: "${copied}"`);

    // Guidebook diction a person would not use out loud.
    const stiff = text.match(STIFF_PHRASES);
    if (stiff) violations.push(`uses brochure wording "${stiff[0]}" — say it the way a person would`);
  }

  // Go / no-go language. Eddy is a planning input, not the safety authority
  // (docs/river-guide-style.md, "Go / no-go guidance"): show the gauge, let
  // the reader decide. Never grounded — a guide point would not say it either.
  const clearance = text.match(/\b(good to go|safe to (launch|float|paddle)|you'?re cleared|cleared to (launch|float|go))\b/i);
  if (clearance) violations.push(`tells the reader they are "${clearance[0]}" — Eddy never clears a float`);

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
  const { hookStyle, riverName, conditionCode } = params;
  const allowLocation = params.allowLocationHashtags !== false;

  // The guide poster owns its own deterministic caption (buildBlogCaption);
  // an empty template draft tells it to use that rather than a clip template.
  if (params.guide) return { caption: '', hook: '', hashtags: [], source: 'template' };

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

  // Credit first, then the call to action — the same order the prompt asks
  // the model for, so a templated caption reads like a generated one.
  const attributionLines = buildAttributionLines(params);
  if (attributionLines.length) {
    caption += `${attributionLines.join('\n')}\n\n`;
  }
  caption += params.ctaLine?.trim() || 'Check the current gauge and plan your float at eddy.guide';

  const riverTag = `#${riverName.replace(/[^A-Za-z0-9]/g, '')}`;
  const hashtags = allowLocation
    ? ['#MissouriFloat', '#FloatTrip', riverTag, '#RiverLife', '#Kayaking']
    : ['#FloatTrip', '#Paddling', '#Ozarks', '#RiverLife', '#Kayaking'];

  return { caption, hook, hashtags, source: 'template' };
}

/**
 * Fetch recent captions for deduplication, optionally of one post type.
 */
async function getRecentCaptions(count: number, postType?: string): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    let query = supabase
      .from('social_posts')
      .select('caption')
      .eq('status', 'published');
    if (postType) query = query.eq('post_type', postType);
    const { data } = await query
      .order('created_at', { ascending: false })
      .limit(count);

    return (data || []).map((p: { caption: string }) => p.caption).filter(Boolean);
  } catch {
    return [];
  }
}
