// src/lib/ai/model-registry.ts
// The allowlist. Which models, from which provider, may serve which workload,
// and the request parameters each pairing must carry.
//
// ── Why an allowlist rather than a free-text model field ────────────────────
//
// /admin/ai-models writes a model id into llm_config, and llm_config is
// read by four production generators. A free-text field there is a way to point
// the daily cron at an arbitrarily expensive model, or at one whose request
// shape these call sites do not satisfy, from a browser. This file is the set
// of models someone has deliberately approved, per workload, and the API route
// rejects anything not in it.
//
// ── Why the request parameters live here and not at the call sites ─────────
//
// Because they are not uniform across models, and the differences are silent.
// Claude Sonnet 5 runs adaptive thinking when `thinking` is omitted, and
// max_tokens caps thinking and visible text TOGETHER — so the statewide summary
// at max_tokens 200, which is correct for Sonnet 4.6, returns a truncated or
// empty quote on Sonnet 5 unless thinking is explicitly disabled. A registry
// that carried only the id would move that failure into production the first
// time someone used the dropdown.
//
// OpenAI's models have the same trap under a different name: max_output_tokens
// covers reasoning tokens and visible text together, the default effort is
// `medium`, and a response that spends its budget reasoning comes back
// `incomplete` with no text at all. So an OpenAI profile must name its
// reasoning effort; there is no "omit it" form.
//
// ── Approved, and testable ─────────────────────────────────────────────────
//
// `approved` is what an operator may select for production. `testable` is what
// /admin/ai-models may call from its test panel and nothing else: the panel
// replays a recorded prompt and publishes nothing, so it is how a model's
// output gets read BEFORE it is approved. Moving an id from `testable` to
// `approved` is the code change that says someone did, or that the owner chose
// to approve it on another basis; the note above WORKLOAD_SPECS says which.
// Every `testable` list is empty today. The tier is kept for the next model.
//
// SDK-free and DB-free on purpose: the compatibility rules are the part worth
// testing, and nothing in this repo mocks a model SDK or Supabase.

/** Who serves a model. Decides the SDK, the API key and the request shape. */
export type Provider = 'anthropic' | 'openai';

export const PROVIDERS: Record<Provider, { label: string; envVar: string }> = {
  anthropic: { label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  openai: { label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
};

/** A workload whose model is switchable from /admin/ai-models. */
export type Workload = 'river_update' | 'gauge_update' | 'global_summary' | 'social_caption';

export const WORKLOADS: readonly Workload[] = [
  'river_update',
  'gauge_update',
  'global_summary',
  'social_caption',
] as const;

/**
 * Thinking configuration passed straight through to messages.create.
 * Only the disabled form is used here: every one of these workloads produces
 * short-form output under a tight max_tokens, and adaptive thinking spends that
 * budget before any prose is written.
 */
export interface ThinkingConfig {
  type: 'disabled';
}

/**
 * `reasoning.effort` on an OpenAI request. Only the two lowest forms are used
 * here, for the reason ThinkingConfig gives: short-form output under a tight
 * cap. `none` where the model accepts it, `low` where it does not.
 */
export type OpenAIReasoningEffort = 'none' | 'low';

interface ProfileBase {
  /** Exact API model id. */
  id: string;
  /** Shown in the admin dropdown. */
  label: string;
}

export interface AnthropicProfile extends ProfileBase {
  provider: 'anthropic';
  /**
   * Sent as `thinking` on every request for this model. Undefined means "omit
   * the parameter", which is correct for models that do not think by default.
   */
  thinking?: ThinkingConfig;
  /**
   * Shortest prefix this model will cache, in tokens. A model fact, not a
   * workload one — a cache_control breakpoint on a prompt shorter than this is
   * silently a no-op. model-registry.test.ts asserts every model approved for a
   * prompt-cached workload clears that workload's prompt size.
   */
  minCacheablePrefixTokens: number;
}

export interface OpenAIProfile extends ProfileBase {
  provider: 'openai';
  /**
   * Sent as `reasoning.effort` on every request. Required: every current
   * OpenAI model reasons at `medium` when it is omitted. `none` is rejected
   * with a 400 by the models that cannot switch reasoning off, so the value is
   * a fact about the model, taken from its model page.
   */
  reasoningEffort: OpenAIReasoningEffort;
  // No cache field. OpenAI caches a repeated prefix of 1,024 tokens or more on
  // its own; there is no marker for a call site to attach or to get wrong.
}

export type ModelProfile = AnthropicProfile | OpenAIProfile;

export const MODELS: Record<string, ModelProfile> = {
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    minCacheablePrefixTokens: 1024,
  },
  'claude-sonnet-5': {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    // Not optional. Omitting `thinking` on Sonnet 5 runs adaptive thinking
    // inside the same max_tokens budget as the answer.
    thinking: { type: 'disabled' },
    minCacheablePrefixTokens: 1024,
  },
  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    minCacheablePrefixTokens: 4096,
  },

  // OpenAI. Ids and supported reasoning efforts read from each model's page on
  // developers.openai.com on 2026-11-17.
  'gpt-6.2-sol': {
    id: 'gpt-6.2-sol',
    label: 'GPT-6.2 Sol',
    provider: 'openai',
    // Rejects `none`. `low` is the lowest effort its family is documented to
    // share, so its budgets below carry room for reasoning tokens.
    reasoningEffort: 'low',
  },
  'gpt-6.1-terra': {
    id: 'gpt-6.1-terra',
    label: 'GPT-6.1 Terra',
    provider: 'openai',
    reasoningEffort: 'none',
  },
  'gpt-6-luna': {
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    provider: 'openai',
    reasoningEffort: 'none',
  },
};

export interface WorkloadSpec {
  /** Shown as the row heading in the admin UI. */
  label: string;
  /** One-line description of what this workload writes. */
  description: string;
  /**
   * Providers this workload's generator can call. A workload joins a provider
   * when its call site goes through src/lib/ai/generate-text.ts. All four do
   * now. The field stays because the rule does: a new workload whose generator
   * builds one provider's request itself must say so here, or handing it
   * another provider's model id would send that id to the wrong API.
   */
  providers: Provider[];
  /** Used when llm_config holds NULL for this workload. Must match production today. */
  default: string;
  /**
   * Models an operator may select. APPROVED, not merely API-compatible: a model
   * belongs here once someone has read its output for THIS workload. Widening
   * the list is a code change on purpose.
   */
  approved: string[];
  /**
   * Models the admin test panel may call for this workload, in addition to the
   * approved ones. Never selectable for production. See the header.
   */
  testable: string[];
  /** Output cap per model id. Every approved or testable model needs an entry. */
  maxTokens: Record<string, number>;
  /**
   * Whether this workload may attach a cache_control breakpoint to its system
   * prompt. The selected model must also support caching a prefix this short.
   */
  cacheSystemPrompt: boolean;
  /** Rough system-prompt size, in tokens. Only meaningful when cacheSystemPrompt. */
  systemPromptTokens?: number;
}

// ── Output budgets ──────────────────────────────────────────────────────────
//
// The Sonnet 4.6 numbers are the values these call sites have run in production.
// The Sonnet 5 numbers are PROVISIONAL: Sonnet 5 uses a newer tokenizer that
// runs roughly 30% denser on the same text, so a budget tuned for 4.6 can
// truncate on 5 even with thinking disabled. They are the 4.6 value scaled and
// rounded, not limits validated against real output.
//
// Before treating them as product limits, run each workload once on Sonnet 5 and
// compare the recorded output_tokens against the cap. Adjust here, and delete
// this paragraph when they have actually been checked.
//
// The OpenAI numbers are PROVISIONAL in the same way. With reasoning off the cap
// is the Sonnet 4.6 value with margin for an unmeasured tokenizer. GPT-6.2 Sol
// cannot switch reasoning off, and its cap has to hold the reasoning tokens as
// well as the report, so it is several times larger; a cap is a ceiling, not a
// spend. The test panel reports output and reasoning tokens for every run,
// which is the measurement these numbers are waiting on.
//
// ── The OpenAI models are approved on the owner's decision ─────────────────
//
// On 2026-11-18 the three OpenAI models were approved for all four workloads at
// the owner's request, so each can be selected and judged in production rather
// than only replayed in the test panel. That is a different basis from the
// Claude entries, which were approved after someone read their output for that
// workload, and the difference is recorded here so the list does not imply
// more than happened. What stands behind an OpenAI selection instead: every one
// falls back to the workload's Claude default when its call fails or returns
// nothing usable, and a failing provider is dropped for the rest of the pass
// (src/lib/ai/pass-health.ts).
//
// GPT-6 Luna is OpenAI's smallest tier. Haiku, Anthropic's, is still absent
// from the statewide summary and the captions for the reason given at each;
// Luna is listed there because the owner asked for no gaps, not because that
// reasoning was found wrong.
export const WORKLOAD_SPECS: Record<Workload, WorkloadSpec> = {
  river_update: {
    label: 'River and section updates',
    description: 'The per-river condition report, generated daily and on condition changes.',
    providers: ['anthropic', 'openai'],
    default: 'claude-sonnet-4-6',
    // Haiku cannot cache this workload's ~1.6k-token system prompt because its
    // cache floor is 4096 tokens. resolve-models disables the breakpoint for
    // that pairing while preserving prompt caching for Sonnet.
    approved: [
      'claude-sonnet-4-6',
      'claude-sonnet-5',
      'claude-haiku-4-5-20251001',
      'gpt-6.2-sol',
      'gpt-6.1-terra',
      'gpt-6-luna',
    ],
    testable: [],
    maxTokens: {
      'claude-sonnet-4-6': 800,
      'claude-sonnet-5': 1040, // provisional
      'claude-haiku-4-5-20251001': 800,
      'gpt-6.2-sol': 4000, // provisional; includes reasoning tokens
      'gpt-6.1-terra': 1000, // provisional
      'gpt-6-luna': 1000, // provisional
    },
    cacheSystemPrompt: true,
    systemPromptTokens: 1900,
  },
  gauge_update: {
    label: 'Secondary gauge updates',
    description: 'Per-gauge commentary for gauges other than a river’s primary.',
    providers: ['anthropic', 'openai'],
    default: 'claude-haiku-4-5-20251001',
    // Haiku is approved here because it is what this workload already runs.
    approved: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-sonnet-5',
      'gpt-6.2-sol',
      'gpt-6.1-terra',
      'gpt-6-luna',
    ],
    testable: [],
    maxTokens: {
      'claude-haiku-4-5-20251001': 600,
      'claude-sonnet-4-6': 600,
      'claude-sonnet-5': 780, // provisional
      'gpt-6.2-sol': 3000, // provisional; includes reasoning tokens
      'gpt-6.1-terra': 750, // provisional
      'gpt-6-luna': 750, // provisional
    },
    cacheSystemPrompt: false,
  },
  global_summary: {
    label: 'Statewide summary',
    description: 'The one-paragraph overview across all covered rivers.',
    providers: ['anthropic', 'openai'],
    default: 'claude-sonnet-4-6',
    // Haiku is deliberately absent: this is the copy that leads with flood and
    // safety framing when conditions are dangerous, and no one has read Haiku
    // output for it.
    approved: ['claude-sonnet-4-6', 'claude-sonnet-5', 'gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna'],
    testable: [],
    maxTokens: {
      'claude-sonnet-4-6': 200,
      'claude-sonnet-5': 260, // provisional
      'gpt-6.2-sol': 1500, // provisional; includes reasoning tokens
      'gpt-6.1-terra': 300, // provisional
      'gpt-6-luna': 300, // provisional
    },
    cacheSystemPrompt: false,
  },
  social_caption: {
    label: 'Social captions',
    description: 'Captions for clip reels and the weekday river-guide Facebook post, behind the deterministic accuracy lint.',
    providers: ['anthropic', 'openai'],
    default: 'claude-sonnet-4-6',
    // Haiku is deliberately absent for now. The accuracy lint would catch
    // fabrication, but nobody has read Haiku captions, and "the lint will catch
    // it" is not the same as having looked.
    approved: ['claude-sonnet-4-6', 'claude-sonnet-5', 'gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna'],
    testable: [],
    maxTokens: {
      'claude-sonnet-4-6': 400,
      'claude-sonnet-5': 520, // provisional
      'gpt-6.2-sol': 2000, // provisional; includes reasoning tokens
      'gpt-6.1-terra': 500, // provisional
      'gpt-6-luna': 500, // provisional
    },
    cacheSystemPrompt: false,
  },
};

/** True when `modelId` is approved for `workload`. */
export function isApproved(workload: Workload, modelId: string): boolean {
  return WORKLOAD_SPECS[workload].approved.includes(modelId);
}

/** Approved profiles for a workload, in registry order, for the admin dropdown. */
export function approvedProfiles(workload: Workload): ModelProfile[] {
  return WORKLOAD_SPECS[workload].approved.map((id) => MODELS[id]).filter(Boolean);
}

/** True when the admin test panel may call `modelId` for `workload`. */
export function isTestable(workload: Workload, modelId: string): boolean {
  const spec = WORKLOAD_SPECS[workload];
  return spec.approved.includes(modelId) || spec.testable.includes(modelId);
}

/** Everything the test panel may call for a workload: approved first, then test-only. */
export function testableProfiles(workload: Workload): ModelProfile[] {
  const spec = WORKLOAD_SPECS[workload];
  return [...spec.approved, ...spec.testable].map((id) => MODELS[id]).filter(Boolean);
}

/**
 * Whether this workload/model pairing attaches a cache marker to its system
 * prompt. Anthropic only: the marker is Anthropic's mechanism, and OpenAI
 * caches a long enough prefix without being asked.
 */
export function shouldCacheSystemPrompt(workload: Workload, modelId: string): boolean {
  const spec = WORKLOAD_SPECS[workload];
  const profile = MODELS[modelId];
  return Boolean(
    spec.cacheSystemPrompt &&
      spec.systemPromptTokens &&
      profile &&
      profile.provider === 'anthropic' &&
      profile.minCacheablePrefixTokens <= spec.systemPromptTokens,
  );
}

/** Shortest prefix OpenAI caches, for every model registered here. */
export const OPENAI_MIN_CACHEABLE_PREFIX_TOKENS = 1024;

/** How a pairing's system prompt is cached, for the admin UI. */
export function promptCacheMode(workload: Workload, modelId: string): 'marker' | 'automatic' | 'off' {
  if (shouldCacheSystemPrompt(workload, modelId)) return 'marker';
  const spec = WORKLOAD_SPECS[workload];
  return MODELS[modelId]?.provider === 'openai' && (spec.systemPromptTokens ?? 0) >= OPENAI_MIN_CACHEABLE_PREFIX_TOKENS
    ? 'automatic'
    : 'off';
}

