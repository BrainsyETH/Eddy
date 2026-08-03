// src/lib/eddy/generate-global-update.ts
// Generates a global "overall Ozarks" Eddy quote by summarizing per-river updates.
// Called by the cron job after per-river updates are generated.

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveRiverContexts, DEFAULT_TIMEZONE } from '@/lib/rivers/context';
import { getLocalDateStrings } from '@/lib/social/local-time';
import { SONNET_MODEL, extractUsage, type UsageStats } from '@/lib/eddy/generate-update';

export interface GlobalUpdate {
  quoteText: string;
  sourcesUsed: string[];
  /** Token usage for this generation (null if the response had none). */
  usage: UsageStats | null;
}

const GLOBAL_SYSTEM_PROMPT = `You are Eddy, an AI otter mascot for a float trip planning app. You are writing a brief overall summary of conditions across all covered rivers.

VOICE: Friendly, knowledgeable, concise. Like a local outfitter giving a quick morning briefing.

RULES:
- Write 2-3 sentences maximum. This is a quick overview, not a detailed report.
- Mention how many rivers are in good shape and call out any that are problematic.
- If most rivers are optimal, be encouraging. If most are low or high, set expectations.
- If there are active weather alerts or dangerous conditions, lead with safety.
- Reference water trend patterns when useful (e.g. "Most rivers are holding steady this week, though smaller creeks are dropping after Monday's rain"). Do not classify rivers as "spring-fed" or "rain-fed" in the output.
- Cite specific river names when highlighting standouts (best or worst conditions).
- Do NOT use em dashes. Use commas, periods, or "and" instead.
- Do NOT use emojis, hashtags, or exclamation marks.
- Do NOT include a greeting or sign-off.
- Do NOT say "I" or refer to yourself.
- Output ONLY the quote text. No labels, no formatting, no quotes around it.`;

/**
 * How far back to look for the per-river rows this summarises.
 *
 * ── Why this is hours and not minutes ──────────────────────────────────────
 *
 * It was thirty minutes, which was correct while this ran at the tail of the
 * per-river pass that had just written them. It no longer does: the statewide
 * summary is its own scheduled invocation, half an hour after the rivers, for
 * reasons the cron route's header sets out at length. Thirty minutes would now
 * miss the very rows it exists to read.
 *
 * Six hours is wide enough to absorb a late or slow per-river pass and narrow
 * enough that it can only ever summarise rivers looked at THIS MORNING. A
 * summary of yesterday's water written under today's date is the one output
 * this must never produce, and that is the boundary this number defends.
 *
 * The dedupe below is what makes a wide window safe: one row per river, newest
 * first, so reaching back further never doubles a river or resurrects a reading
 * that has since been replaced.
 */
export const GLOBAL_INPUT_WINDOW_MINUTES = 6 * 60;

export interface GlobalUpdateOptions {
  /**
   * How far back to look for per-river rows. Defaults to the daily pass's
   * window; the repair pass widens it.
   */
  windowMinutes?: number;
}

/**
 * Generates an overall Ozarks summary by reading recently generated per-river updates
 * and asking Sonnet to synthesize them into a brief overview.
 *
 * Returns null when there is nothing honest to write — no key, no inputs, or a
 * model call that failed. The CALLER decides how loud that is; on the daily
 * pass it is now a failed cron rather than a line in a JSON body nobody reads.
 * See the route.
 */
export async function generateGlobalUpdate(
  options: GlobalUpdateOptions = {},
): Promise<GlobalUpdate | null> {
  const windowMinutes = options.windowMinutes ?? GLOBAL_INPUT_WINDOW_MINUTES;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('[EddyGlobal] ANTHROPIC_API_KEY not configured');
    return null;
  }

  const supabase = createAdminClient();

  // Per-river whole-river rows from inside the window — written by the same
  // cron pass on the daily path, or earlier this morning on the repair one.
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: recentUpdates, error } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft, quote_text, generated_at')
    .is('section_slug', null)
    .neq('river_slug', 'global')
    .gte('generated_at', cutoff)
    // Newest first, so the dedupe below keeps the current row per river.
    .order('generated_at', { ascending: false });

  if (error) {
    console.error('[EddyGlobal] Failed to fetch recent updates:', error);
    return null;
  }

  if (!recentUpdates || recentUpdates.length === 0) {
    console.warn('[EddyGlobal] No recent per-river updates found to summarize');
    return null;
  }

  // ONE ROW PER RIVER, newest wins.
  //
  // The query used to take every row in the window, which was harmless only
  // because the window was thirty minutes wide and the pass that had just run
  // wrote exactly one row per river. It is not harmless now: an event-driven
  // regen firing during the pass would put the same river in the prompt twice,
  // in two different conditions, and the repair window is hours wide by design.
  //
  // Sorted by slug after deduping so the prompt is stable across runs — the
  // model sees the same rivers in the same order whichever path called it.
  const latestBySlug = new Map<string, (typeof recentUpdates)[number]>();
  for (const row of recentUpdates) {
    if (!row.river_slug || latestBySlug.has(row.river_slug)) continue;
    latestBySlug.set(row.river_slug, row);
  }
  const summaryInputs = Array.from(latestBySlug.values()).sort((a, b) =>
    (a.river_slug ?? '').localeCompare(b.river_slug ?? ''),
  );

  // Build the prompt with per-river summaries. Region label and timezone
  // come from the active rivers rather than assuming the Missouri Ozarks.
  const contexts = await getActiveRiverContexts().catch(() => []);
  const regions = Array.from(new Set(contexts.map((c) => c.region ?? '').filter(Boolean)));
  const regionLabel = regions.length > 0 ? regions.join(' and ') : 'Ozarks';
  const timezone = contexts[0]?.timezone ?? DEFAULT_TIMEZONE;

  const lines: string[] = [];

  const { dayOfWeek, dateStr } = getLocalDateStrings(timezone);
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');
  lines.push(`Generate a brief overall ${regionLabel} river conditions summary based on these per-river updates:`);
  lines.push('');

  for (const update of summaryInputs) {
    const gauge = update.gauge_height_ft !== null ? `${Number(update.gauge_height_ft).toFixed(1)} ft` : 'N/A';
    lines.push(`${update.river_slug}: ${update.condition_code} (${gauge})`);
    lines.push(`  "${update.quote_text.slice(0, 200)}"`);
    lines.push('');
  }

  const prompt = lines.join('\n');

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
      system: GLOBAL_SYSTEM_PROMPT,
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const quoteText = textBlock?.text?.trim().replace(/\u2014/g, ',') || null;

    if (!quoteText) {
      console.error('[EddyGlobal] Empty response from model');
      return null;
    }

    return {
      quoteText,
      sourcesUsed: ['per-river updates', 'USGS gauge'],
      usage: extractUsage(SONNET_MODEL, message.usage),
    };
  } catch (e) {
    console.error('[EddyGlobal] Sonnet call failed:', e);
    return null;
  }
}
