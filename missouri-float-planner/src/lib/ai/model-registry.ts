// src/lib/ai/model-registry.ts
// The allowlist. Which Anthropic models may serve which workload, and the
// request parameters each pairing must carry.
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
// SDK-free and DB-free on purpose: the compatibility rules are the part worth
// testing, and nothing in this repo mocks the Anthropic SDK or Supabase.

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

export interface ModelProfile {
  /** Exact API model id. */
  id: string;
  /** Shown in the admin dropdown. */
  label: string;
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

export const MODELS: Record<string, ModelProfile> = {
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    minCacheablePrefixTokens: 1024,
  },
  'claude-sonnet-5': {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    // Not optional. Omitting `thinking` on Sonnet 5 runs adaptive thinking
    // inside the same max_tokens budget as the answer.
    thinking: { type: 'disabled' },
    minCacheablePrefixTokens: 1024,
  },
  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    minCacheablePrefixTokens: 4096,
  },
};

export interface WorkloadSpec {
  /** Shown as the row heading in the admin UI. */
  label: string;
  /** One-line description of what this workload writes. */
  description: string;
  /** Used when llm_config holds NULL for this workload. Must match production today. */
  default: string;
  /**
   * Models an operator may select. APPROVED, not merely API-compatible: a model
   * belongs here once someone has read its output for THIS workload. Widening
   * the list is a code change on purpose.
   */
  approved: string[];
  /** Output cap per model id. Every approved model needs an entry. */
  maxTokens: Record<string, number>;
  /**
   * Whether this workload attaches a cache_control breakpoint to its system
   * prompt. A property of the prompt, not of the model — only the river update
   * has a system prompt long and stable enough to be worth caching.
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
export const WORKLOAD_SPECS: Record<Workload, WorkloadSpec> = {
  river_update: {
    label: 'River and section updates',
    description: 'The per-river condition report, generated daily and on condition changes.',
    default: 'claude-sonnet-4-6',
    // Haiku is deliberately absent. This is the longest-form output of the four,
    // and its 4096-token cache floor would make the system-prompt breakpoint
    // below a silent no-op at the ~1.9k prompt this workload sends.
    approved: ['claude-sonnet-4-6', 'claude-sonnet-5'],
    maxTokens: {
      'claude-sonnet-4-6': 800,
      'claude-sonnet-5': 1040, // provisional
    },
    cacheSystemPrompt: true,
    systemPromptTokens: 1900,
  },
  gauge_update: {
    label: 'Secondary gauge updates',
    description: 'Per-gauge commentary for gauges other than a river’s primary.',
    default: 'claude-haiku-4-5-20251001',
    // Haiku is approved here because it is what this workload already runs.
    approved: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-sonnet-5'],
    maxTokens: {
      'claude-haiku-4-5-20251001': 600,
      'claude-sonnet-4-6': 600,
      'claude-sonnet-5': 780, // provisional
    },
    cacheSystemPrompt: false,
  },
  global_summary: {
    label: 'Statewide summary',
    description: 'The one-paragraph overview across all covered rivers.',
    default: 'claude-sonnet-4-6',
    // Haiku is deliberately absent: this is the copy that leads with flood and
    // safety framing when conditions are dangerous, and no one has read Haiku
    // output for it.
    approved: ['claude-sonnet-4-6', 'claude-sonnet-5'],
    maxTokens: {
      'claude-sonnet-4-6': 200,
      'claude-sonnet-5': 260, // provisional
    },
    cacheSystemPrompt: false,
  },
  social_caption: {
    label: 'Social captions',
    description: 'Instagram captions for clip posts, behind the deterministic accuracy lint.',
    default: 'claude-sonnet-4-6',
    // Haiku is deliberately absent for now. The accuracy lint would catch
    // fabrication, but nobody has read Haiku captions, and "the lint will catch
    // it" is not the same as having looked.
    approved: ['claude-sonnet-4-6', 'claude-sonnet-5'],
    maxTokens: {
      'claude-sonnet-4-6': 400,
      'claude-sonnet-5': 520, // provisional
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
