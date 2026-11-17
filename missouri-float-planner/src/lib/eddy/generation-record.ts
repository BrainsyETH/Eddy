// src/lib/eddy/generation-record.ts
// One row of evidence per attempt to write a river Read: what the generator
// was handed, what came back, and what was published in its place if anything.
//
// WHY THIS EXISTS. eddy_updates is the serving table. It holds the published
// text only, and the cron deletes rows after 48 hours. So when a Read says
// something wrong there is nothing to check it against: not the prompt, not
// the gauge facts, not the knowledge it was given, not the model's own words
// before the guard replaced them. A review on 2026-11-16 had three days of
// output to look at and no inputs for any of it.
//
// A row is written for every attempt, including the ones that publish nothing
// (a failed model call) and the ones that never reach the model (a fallback
// decided from the facts). Those are the cases with no other trace.
//
// Pure: builds the row, touches no database. generation-log.ts writes it.
// Columns are defined in 20261117041752_eddy_generation_log.sql, and
// generation-record.test.ts holds the two in step.

import { createHash } from 'node:crypto';
import type { UpdateTarget } from '@/data/river-sections';
import type { NWSAlert } from '@/lib/nws/alerts';
import type { WeatherData, ForecastData, PrecipitationSummary } from '@/lib/weather/openweather';
import type { RiverContext } from '@/lib/rivers/context';
import type { GaugeTrajectory } from './gauge-trajectory';
import type { RainLagInfo } from './rain-lag';
import type { ParsedEddyResponse } from './parse-response';
import type { ReportFacts, ReportFallbackReason } from './report-facts';

/** What started the attempt. The first is the daily pass; the last two are
 * the gauge cron reacting to a change (regenerate.ts's TriggerReason). */
export type GenerationTrigger = 'scheduled' | 'on_demand' | 'condition_change' | 'rapid_change';

/** `model` published the model's text. `fallback` published code-written text.
 * `error` published nothing. */
export type GenerationOutcome = 'model' | 'fallback' | 'error';

export type GenerationErrorReason = 'missing_api_key' | 'empty_response' | 'model_error';

/** Everything the generator gathered. Filled in as it goes, so an early exit
 * records what it had reached and nulls for the rest. */
export interface GenerationCapture {
  target: UpdateTarget;
  trigger: GenerationTrigger;
  /** The model this attempt asks. Replaced when an attempt falls back to another. */
  model: { id: string; provider?: string; maxTokens: number; thinking?: unknown; reasoningEffort?: string; cacheSystemPrompt: boolean; source: string };
  facts: ReportFacts;
  usgsSiteId: string | null;
  readingTimestamp: string | null;
  gaugeNotes: string | null;
  riverCtx: RiverContext | null;
  alerts: NWSAlert[];
  weather: WeatherData | null;
  forecast: ForecastData | null;
  precipitation: PrecipitationSummary | null;
  trajectory: GaugeTrajectory | null;
  rainLag: RainLagInfo | null;
  /** The knowledge text injected into the prompt, or null if not loaded. */
  localKnowledge: string | null;
  systemPrompt: string;
  /** The user message, or null when no prompt was built. */
  userPrompt: string | null;
}

export interface GenerationResult {
  outcome: GenerationOutcome;
  reason: ReportFallbackReason | GenerationErrorReason | null;
  contradictions?: string[];
  /** The model's text exactly as returned, before any cleanup. */
  rawResponse?: string | null;
  stopReason?: string | null;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheCreationTokens: number | null;
  } | null;
  /** What was stored for readers, when anything was. */
  published?: (ParsedEddyResponse & { sourcesUsed: string[] }) | null;
  errorMessage?: string | null;
}

/** The insert shape for public.eddy_generation_log. */
export interface GenerationLogRow {
  workload: 'river_update';
  trigger: GenerationTrigger;
  river_slug: string;
  section_slug: string | null;
  usgs_site_id: string | null;
  condition_code: string;
  outcome: GenerationOutcome;
  reason: string | null;
  contradictions: string[];
  model_used: string | null;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  git_sha: string | null;
  system_prompt_hash: string;
  knowledge_hash: string | null;
  knowledge_blocks: string[];
  user_prompt: string | null;
  inputs: Record<string, unknown>;
  raw_response: string | null;
  published: Record<string, unknown> | null;
  error_message: string | null;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Which knowledge blocks getKnowledgeForTarget() put in the text: 'general',
 * 'river', and 'section:<slug>'. Read back from the block headings it writes,
 * so this reports what was injected rather than what was asked for. A river
 * with no section in the file gets ['general'] here, which is the Gasconade
 * failure made visible per row.
 */
export function knowledgeBlocks(text: string | null): string[] {
  if (!text) return [];
  const blocks: string[] = [];
  if (/^=== General Ozarks Knowledge ===$/m.test(text)) blocks.push('general');
  if (/^=== .+ River Knowledge ===$/m.test(text)) blocks.push('river');
  for (const match of text.matchAll(/^=== Section: (.+) ===$/gm)) blocks.push(`section:${match[1]}`);
  return blocks;
}

const ERROR_MESSAGE_MAX = 500;
/** The prompt carries 300 characters of an alert's description; keep the same. */
const ALERT_DESCRIPTION_MAX = 300;

/**
 * The structured inputs, separate from the prompt text built out of them.
 * A check that a quoted number is the right value for the right station at
 * the right time needs the values with their units and timestamps attached,
 * not a rendered sentence to parse them back out of.
 */
function captureInputs(c: GenerationCapture): Record<string, unknown> {
  return {
    target: c.target,
    model: c.model,
    facts: c.facts,
    readingTimestamp: c.readingTimestamp,
    gaugeNotes: c.gaugeNotes,
    river: c.riverCtx && {
      riverType: c.riverCtx.riverType,
      state: c.riverCtx.state,
      timezone: c.riverCtx.timezone,
      weatherCity: c.riverCtx.weatherCity,
      weatherLat: c.riverCtx.weatherLat,
      weatherLon: c.riverCtx.weatherLon,
      characteristics: c.riverCtx.characteristics,
    },
    alerts: c.alerts.map((a) => ({
      event: a.event,
      severity: a.severity,
      headline: a.headline,
      areaDesc: a.areaDesc,
      expires: a.expires ?? null,
      description: a.description ? a.description.slice(0, ALERT_DESCRIPTION_MAX) : null,
    })),
    weather: c.weather,
    forecast: c.forecast,
    precipitation: c.precipitation,
    trajectory: c.trajectory,
    rainLag: c.rainLag,
  };
}

export function buildGenerationRecord(
  c: GenerationCapture,
  r: GenerationResult,
  env: { gitSha?: string | null } = {},
): GenerationLogRow {
  // A model id is recorded only when a model was actually asked. A fallback
  // decided from the facts never called one, and saying otherwise would make
  // the fallback rate look like a property of the model.
  const calledModel = r.outcome === 'model' || r.rawResponse != null || r.reason === 'model_error' || r.reason === 'empty_response';
  return {
    workload: 'river_update',
    trigger: c.trigger,
    river_slug: c.target.riverSlug,
    section_slug: c.target.sectionSlug,
    usgs_site_id: c.usgsSiteId,
    condition_code: c.facts.conditionCode,
    outcome: r.outcome,
    reason: r.reason,
    contradictions: r.contradictions ?? [],
    model_used: calledModel ? c.model.id : null,
    stop_reason: r.stopReason ?? null,
    input_tokens: r.usage?.inputTokens ?? null,
    output_tokens: r.usage?.outputTokens ?? null,
    cache_read_tokens: r.usage?.cacheReadTokens ?? null,
    cache_creation_tokens: r.usage?.cacheCreationTokens ?? null,
    git_sha: env.gitSha ?? null,
    system_prompt_hash: sha256(c.systemPrompt),
    knowledge_hash: c.localKnowledge ? sha256(c.localKnowledge) : null,
    knowledge_blocks: knowledgeBlocks(c.localKnowledge),
    user_prompt: c.userPrompt,
    inputs: captureInputs(c),
    raw_response: r.rawResponse ?? null,
    published: r.published
      ? {
          summaryText: r.published.summaryText,
          eddyRead: r.published.eddyRead,
          quoteText: r.published.quoteText,
          sourcesUsed: r.published.sourcesUsed,
        }
      : null,
    error_message: r.errorMessage ? r.errorMessage.slice(0, ERROR_MESSAGE_MAX) : null,
  };
}
