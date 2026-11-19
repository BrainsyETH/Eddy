// src/lib/eddy/generation-record.ts
// One row of evidence per attempt to write a river Read or a gauge Read: what the generator
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
import type { ParsedEddyResponse } from './parse-response';
import type { ReportFacts, ReportFallbackReason } from './report-facts';

/** What started the attempt. The first is the daily pass; the last two are
 * the gauge cron reacting to a change (regenerate.ts's TriggerReason). */
export type GenerationTrigger = 'scheduled' | 'on_demand' | 'condition_change' | 'rapid_change';

/** `model` published the model's text. `fallback` published code-written text.
 * `error` published nothing. */
export type GenerationOutcome = 'model' | 'fallback' | 'error';

export type GenerationErrorReason = 'missing_api_key' | 'empty_response' | 'incomplete_response' | 'model_error';

/** The model fields a generation record keeps. */
export interface CapturedModel {
  id: string;
  provider?: string;
  maxTokens: number;
  thinking?: unknown;
  reasoningEffort?: string;
  cacheSystemPrompt: boolean;
  source: string;
}

/**
 * Picks those fields from a resolved model. Named field by field, because the
 * resolved model also carries its fallback and the pass's health record, and
 * neither belongs in a row of evidence about one attempt.
 */
export function captureModel(model: CapturedModel): CapturedModel {
  return {
    id: model.id,
    provider: model.provider,
    maxTokens: model.maxTokens,
    thinking: model.thinking,
    reasoningEffort: model.reasoningEffort,
    cacheSystemPrompt: model.cacheSystemPrompt,
    source: model.source,
  };
}

/** Everything the generator gathered. Filled in as it goes, so an early exit
 * records what it had reached and nulls for the rest. */
export interface GenerationCapture {
  target: UpdateTarget;
  trigger: GenerationTrigger;
  /** The model this attempt asks. Replaced when an attempt falls back to another. */
  model: CapturedModel;
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
  /** `river_update`: a river's Read (generate-update.ts). `gauge_update`: a
   * secondary gauge's Read (generate-gauge-update.ts). */
  workload: 'river_update' | 'gauge_update';
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
 * 'river', 'gauge:<site>' for the reporting gauge's own block,
 * 'section:<slug>', and 'elsewhere' for the one-line-per-other-gauge list. Read back from the block headings it writes,
 * so this reports what was injected rather than what was asked for. A river
 * with no section in the file gets ['general'] here, which is the Gasconade
 * failure made visible per row.
 */
export function knowledgeBlocks(text: string | null): string[] {
  if (!text) return [];
  const blocks: string[] = [];
  if (/^=== General Ozarks Knowledge ===$/m.test(text)) blocks.push('general');
  if (/^=== .+ River Knowledge ===$/m.test(text)) blocks.push('river');
  for (const match of text.matchAll(/^=== This gauge: .+ \((.+)\) ===$/gm)) blocks.push(`gauge:${match[1]}`);
  for (const match of text.matchAll(/^=== Section: (.+) ===$/gm)) blocks.push(`section:${match[1]}`);
  if (/^=== Elsewhere on this river\b/m.test(text)) blocks.push('elsewhere');
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
    alerts: c.alerts.map(captureAlert),
    weather: c.weather,
    forecast: c.forecast,
    precipitation: c.precipitation,
    trajectory: c.trajectory,
  };
}

export function buildGenerationRecord(
  c: GenerationCapture,
  r: GenerationResult,
  env: { gitSha?: string | null } = {},
): GenerationLogRow {
  return {
    workload: 'river_update',
    trigger: c.trigger,
    river_slug: c.target.riverSlug,
    section_slug: c.target.sectionSlug,
    usgs_site_id: c.usgsSiteId,
    condition_code: c.facts.conditionCode,
    ...resultColumns(c.model.id, r),
    git_sha: env.gitSha ?? null,
    system_prompt_hash: sha256(c.systemPrompt),
    knowledge_hash: c.localKnowledge ? sha256(c.localKnowledge) : null,
    knowledge_blocks: knowledgeBlocks(c.localKnowledge),
    user_prompt: c.userPrompt,
    inputs: captureInputs(c),
    ...publishedColumns(r),
  };
}

/** What a secondary gauge's generator gathered. Filled in as it goes, like
 * GenerationCapture. Narrower: a gauge Read has no current weather, rain
 * total, rain lag or river note, and its knowledge is the river's block plus
 * the reach notes that name the gauge's town. */
export interface GaugeGenerationCapture {
  target: {
    riverSlug: string;
    riverName: string;
    usgsSiteId: string;
    gaugeName: string;
    coordinates: { lat: number; lon: number } | null;
  };
  trigger: GenerationTrigger;
  /** The model this attempt asks. Replaced when an attempt falls back to another. */
  model: CapturedModel;
  facts: ReportFacts;
  readingTimestamp: string | null;
  alerts: NWSAlert[];
  forecast: ForecastData | null;
  trajectory: GaugeTrajectory | null;
  /** False when a reach overrides the river's type, so river-wide behaviour
   * guidance was left out of the prompt. Null until it is decided. */
  riverBehaviorApplies: boolean | null;
  /** The text getRiverKnowledgeForGauge() returned, or null if none. */
  riverKnowledge: string | null;
  systemPrompt: string;
  /** The user message, or null when no prompt was built. */
  userPrompt: string | null;
}

/**
 * Which knowledge blocks getRiverKnowledgeForGauge() returned: 'river' for the
 * river's main block, 'gauge:<site>' for the gauge's own block and
 * 'section:<slug>' for each reach note it attached.
 * Read back from the text, so it reports what was sent. A gauge that got the
 * river block and no reach note is the common case, and the one the knowledge
 * file's gauge tags are meant to end.
 */
export function gaugeKnowledgeBlocks(text: string | null): string[] {
  if (!text?.trim()) return [];
  const own = [...text.matchAll(/^This gauge: .+ \((.+)\)$/gm)].map((match) => `gauge:${match[1]}`);
  const sections = [...text.matchAll(/^Section (.+):$/gm)].map((match) => `section:${match[1]}`);
  // The river block, when present, comes first and has no header of its own.
  const hasRiverBlock = !/^(?:Section .+:|This gauge: .+)$/.test(text.trimStart().split('\n')[0]);
  return [...(hasRiverBlock ? ['river'] : []), ...own, ...sections];
}

export function buildGaugeGenerationRecord(
  c: GaugeGenerationCapture,
  r: GenerationResult,
  env: { gitSha?: string | null } = {},
): GenerationLogRow {
  return {
    workload: 'gauge_update',
    trigger: c.trigger,
    river_slug: c.target.riverSlug,
    section_slug: null,
    usgs_site_id: c.target.usgsSiteId,
    condition_code: c.facts.conditionCode,
    ...resultColumns(c.model.id, r),
    git_sha: env.gitSha ?? null,
    system_prompt_hash: sha256(c.systemPrompt),
    knowledge_hash: c.riverKnowledge ? sha256(c.riverKnowledge) : null,
    knowledge_blocks: gaugeKnowledgeBlocks(c.riverKnowledge),
    user_prompt: c.userPrompt,
    inputs: {
      target: c.target,
      model: c.model,
      facts: c.facts,
      readingTimestamp: c.readingTimestamp,
      alerts: c.alerts.map(captureAlert),
      forecast: c.forecast,
      trajectory: c.trajectory,
      riverBehaviorApplies: c.riverBehaviorApplies,
    },
    ...publishedColumns(r),
  };
}

function captureAlert(a: NWSAlert) {
  return {
    event: a.event,
    severity: a.severity,
    headline: a.headline,
    areaDesc: a.areaDesc,
    expires: a.expires ?? null,
    description: a.description ? a.description.slice(0, ALERT_DESCRIPTION_MAX) : null,
  };
}

/** The columns that say how the attempt ended, shared by both workloads. */
function resultColumns(modelId: string, r: GenerationResult) {
  // A model id is recorded only when a model was actually asked. A fallback
  // decided from the facts never called one, and saying otherwise would make
  // the fallback rate look like a property of the model.
  const calledModel = r.outcome === 'model' || r.rawResponse != null || r.reason === 'model_error' || r.reason === 'empty_response';
  return {
    outcome: r.outcome,
    reason: r.reason,
    contradictions: r.contradictions ?? [],
    model_used: calledModel ? modelId : null,
    stop_reason: r.stopReason ?? null,
    input_tokens: r.usage?.inputTokens ?? null,
    output_tokens: r.usage?.outputTokens ?? null,
    cache_read_tokens: r.usage?.cacheReadTokens ?? null,
    cache_creation_tokens: r.usage?.cacheCreationTokens ?? null,
  };
}

function publishedColumns(r: GenerationResult) {
  return {
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
