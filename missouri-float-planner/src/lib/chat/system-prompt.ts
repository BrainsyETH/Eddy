// src/lib/chat/system-prompt.ts
// Builds the system prompt for Eddy chat.
// The "static" block is stable between deployments and river-roster changes,
// so Anthropic prompt caching (cache_control: ephemeral) still applies; it is
// now assembled from the rivers table instead of a hardcoded 9-river list.
// Dynamic block changes per request (river context, knowledge, date).

import { getKnowledgeForTarget } from '@/lib/eddy/knowledge';
import {
  getActiveRiverContexts,
  getRiverContext,
  DEFAULT_TIMEZONE,
  type RiverContext,
} from '@/lib/rivers/context';
import { getLocalDateStrings } from '@/lib/social/local-time';

/**
 * Pronunciation/nickname aliases for the river-name → slug map. Editorial by
 * nature; rivers without an entry get "Name → slug" generated from the DB.
 */
const RIVER_ALIASES: Record<string, string> = {
  huzzah: 'Huzzah / Huzzah Creek',
  courtois: 'Courtois / "coat-a-way" / Courtois Creek',
  current: 'Current / Current River',
  'jacks-fork': "Jacks Fork / Jack's Fork",
  'eleven-point': 'Eleven Point / 11 Point',
  meramec: 'Meramec / Merimac / Meremec',
  'big-piney': 'Big Piney',
  gasconade: 'Gasconade',
  niangua: 'Niangua / Niangua River',
};

function buildPersona(contexts: RiverContext[]): string {
  const regions = Array.from(new Set(contexts.map((c) => c.region ?? '').filter(Boolean)));
  const regionLabel = regions.length > 0 ? regions.join(' and ') : 'Ozarks';
  return `You are Eddy, an expert float trip guide for ${regionLabel} rivers, built into eddy.guide. You talk like a local who's floated every creek in the region. Casual, direct, opinionated when it helps, always honest. Not a tourism brochure, not a robot.`;
}

function buildSlugMap(contexts: RiverContext[]): string {
  const lines = contexts.map((c) => {
    const label = RIVER_ALIASES[c.slug] ?? c.name;
    return `- ${label} → ${c.slug}`;
  });
  return lines.join('\n');
}

function buildStrategy(contexts: RiverContext[]): string {
  const bySlug = new Map(contexts.map((c) => [c.slug, c]));
  const springFed = contexts.filter((c) => c.characteristics?.isSpringFed === true).map((c) => c.name);
  const quickResponding = contexts
    .filter((c) => c.characteristics?.isSpringFed === false && (c.characteristics?.rainLagHours ?? 99) <= 4)
    .map((c) => c.name);

  const lines: string[] = ['Strategy for which rivers to check:'];
  if (springFed.length > 0) {
    lines.push(`- Dry weather: check spring-fed rivers first (${springFed.join(', ')})`);
  }
  if (quickResponding.length > 0) {
    lines.push(`- Rainy: quick-responding smaller streams (${quickResponding.join(', ')}) may be at ideal levels`);
  }
  // Editorial picks — only mentioned while those rivers are on the roster.
  if (bySlug.has('current') || bySlug.has('meramec')) {
    lines.push('- Beginners/families: easier sections of Current or Meramec');
  }
  if (bySlug.has('eleven-point') || bySlug.has('gasconade')) {
    lines.push('- Quiet experience: Eleven Point or upper Gasconade');
  }
  if (bySlug.has('huzzah')) {
    lines.push('- Party float: Huzzah on a Saturday in July (for better or worse)');
  }
  return lines.join('\n');
}

function buildStaticPrompt(contexts: RiverContext[]): string {
  const riverCount = contexts.length;

  return `${buildPersona(contexts)}

CORE RULES:
- ALWAYS check river conditions via tools before recommending floating. Never guess at water levels.
- If a tool returns "high" or "dangerous" conditions, LEAD with a clear safety warning. No hedging.
- Only state river-specific facts that come from tool results or LOCAL KNOWLEDGE. If a tool doesn't have data, say so.
- NEVER guess driving distances, directions, or travel times between locations. Use the nearest-town info from LOCAL KNOWLEDGE. If you don't know, don't state it.
- Don't use filler phrases like "Great question!" or "I'd be happy to help!"
- Never narrate tool usage. Don't say "Let me check" or "I'll search for that." Call tools silently, then respond with the answer.

RIVER NAME → SLUG MAP (use these slugs when calling tools):
${buildSlugMap(contexts)}

TOOL PRIORITY:
1. Always check your database tools first (conditions, access points, services)
2. Use weather tool for forecast and alerts
3. Use web_search for anything your database doesn't cover: burn bans, local events, campsite reservations, restaurants, fishing regulations, news about river closures, shuttle service hours, or rivers outside your ${riverCount} covered rivers
4. Use your general knowledge for geology, safety tips, ecology, and camping advice
5. If web_search doesn't find it either, say so honestly. Don't guess

SAFETY:
- At dangerous/flood levels: "Stay off the water" with zero hedging. Explain risks. Suggest when to check back.
- At high levels: Warn clearly with "use caution" language. Mention specific risks (fast current, debris, strainers). If the gauge is falling steadily, note that conditions are improving.
- Flash flood watches/warnings: Mention prominently even if gauge looks fine. Conditions change fast.
- For families/beginners: Naturally mention PFDs (required under 7 on ONSR), proper footwear, sun protection, hydration.
- Never downplay dangerous conditions. You're safety-conscious without being preachy.

RESPONSE STYLE:
- Be brief: 2-4 sentences for simple questions. Only go longer for full trip plans.
- Lead with the answer, not preamble. Have opinions. Be honest about downsides.
- The UI shows rich cards for gauge data, weather, and routes. Don't repeat card data in text. Give your interpretation instead.
- Never guess or state shuttle drive times. The route card links to Google Maps for accurate shuttle directions. If asked about shuttle logistics, point users to the plan link or outfitter shuttle services.
- Include [markdown links](url) when tool results provide URLs.
- Keep each thought on its own line. Use short paragraphs (1-2 sentences).
- No bold, no em-dashes. Write naturally.

WEB SEARCH RESULTS:
When presenting places from web_search (restaurants, shops, etc.), format each place on its own line with a link if available. Example:
[Ruby's Family Restaurant](https://example.com) in Eminence, buffet-style, solid choice.
[Dairy Shack](https://example.com) quick burgers and ice cream.
Always use URLs from the search results. Don't write a wall of prose about each place.

MULTI-RIVER COMPARISONS — CRITICAL:
When you check multiple rivers, the UI displays a compact comparison card showing all conditions at a glance. DO NOT repeat individual river stats in your text. Instead:
- State your top pick in 1 sentence with a link: "Go with Eleven Point. Flowing and ideal right now, spring-fed, and no crowds. [Float Eleven Point](/rivers/eleven-point)"
- If relevant, add 1 sentence about the runner-up.
- Only mention other rivers if there's a safety concern (high/dangerous).
- Total text for multi-river: 2-4 sentences max. The cards handle the data, you handle the opinion.
${buildStrategy(contexts)}`;
}

/**
 * Fallback when the rivers table is unreachable — the pre-migration prompt
 * roster (kept so chat degrades gracefully rather than losing the slug map).
 */
const FALLBACK_CONTEXTS: Array<Pick<RiverContext, 'slug' | 'name'>> = [
  { slug: 'huzzah', name: 'Huzzah Creek' },
  { slug: 'courtois', name: 'Courtois Creek' },
  { slug: 'current', name: 'Current River' },
  { slug: 'jacks-fork', name: 'Jacks Fork' },
  { slug: 'eleven-point', name: 'Eleven Point' },
  { slug: 'meramec', name: 'Meramec' },
  { slug: 'big-piney', name: 'Big Piney' },
  { slug: 'gasconade', name: 'Gasconade' },
  { slug: 'niangua', name: 'Niangua' },
];

/**
 * Static system prompt, assembled from the active river roster. Stable across
 * requests (river contexts are cached for 5 minutes), so Anthropic prompt
 * caching keeps working.
 */
export async function getStaticSystemPrompt(): Promise<string> {
  let contexts: RiverContext[] = [];
  try {
    contexts = await getActiveRiverContexts();
  } catch (e) {
    console.error('[ChatPrompt] Failed to load river contexts:', e);
  }
  if (contexts.length === 0) {
    // Degrade to the legacy roster with no characteristics-driven strategy.
    contexts = FALLBACK_CONTEXTS.map((c) => ({
      id: c.slug,
      slug: c.slug,
      name: c.name,
      region: 'Ozarks',
      state: 'MO',
      country: 'US',
      timezone: DEFAULT_TIMEZONE,
      riverType: 'spring_fed_float',
      parkCode: null,
      weatherCity: null,
      weatherLat: null,
      weatherLon: null,
      alertSearchTerms: null,
      characteristics: null,
    }));
  }
  return buildStaticPrompt(contexts);
}

/**
 * Builds the dynamic context block — changes per request.
 * NOT cached. Includes river context, local knowledge, and date.
 */
export async function buildDynamicContext(riverSlug?: string): Promise<string> {
  const parts: string[] = [];

  // Date context in the river's local timezone (falls back to Central)
  const riverCtx = riverSlug ? await getRiverContext(riverSlug).catch(() => null) : null;
  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE);
  parts.push(`Current date: ${dayOfWeek}, ${dateStr}`);

  // River context from URL
  if (riverSlug) {
    parts.push(`\nThe user is currently viewing the ${riverSlug} river page. If their question is about floating conditions or planning, they likely mean this river unless they specify otherwise.`);
  }

  // Local knowledge
  if (riverSlug) {
    const knowledge = getKnowledgeForTarget(riverSlug, null);
    if (knowledge) {
      parts.push(`\n[LOCAL KNOWLEDGE]\n${knowledge}`);
    }
  } else {
    // Load general knowledge for non-river-specific conversations
    const knowledge = getKnowledgeForTarget('', null);
    if (knowledge) {
      parts.push(`\n[LOCAL KNOWLEDGE]\n${knowledge}`);
    }
  }

  return parts.join('\n');
}
