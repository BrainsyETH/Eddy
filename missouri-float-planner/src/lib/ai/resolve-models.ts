// src/lib/ai/resolve-models.ts
// Turns the llm_config row into the request parameters each generator uses.
//
// Split in two on purpose. resolveConfiguredModels() is pure and holds every
// rule worth testing — what a NULL means, what an unrecognised id does, which
// parameters a pairing carries. resolveModels() is the thin part that reads the
// row, and nothing in this repo mocks the Supabase client, so keeping it thin
// is what makes the rules testable at all.
//
// ── No caching, and resolve once per pass ──────────────────────────────────
//
// Callers resolve ONCE at the entry point of a run and thread the result down.
// Not for the saved reads — 24 indexed single-row reads are noise beside 24
// model calls — but so that a switch landing mid-pass cannot split one run
// across two models, leaving half the rows recording one model_used and half
// another with nothing marking the boundary.
//
// ── The fallback ───────────────────────────────────────────────────────────
//
// An override served by a different provider than the code default carries
// that default as `fallback`. The reason is specific: the OpenAI account runs
// on a prepaid balance with auto-reload off, so when the balance reaches zero
// every request fails until the next grant. Without a fallback, selecting an
// OpenAI model would mean a river pass that writes nothing for the rest of the
// month. With it, the generator retries once on the default and the row
// records which model actually wrote it.
//
// Same-provider overrides get no fallback on purpose. If Sonnet 5 fails because
// Anthropic is failing, Sonnet 4.6 fails too, and the retry only doubles the
// time a pass spends finding that out.

import { createAdminClient } from '@/lib/supabase/admin';
import { PassHealth } from '@/lib/ai/pass-health';
import {
  MODELS,
  WORKLOADS,
  WORKLOAD_SPECS,
  isApproved,
  isTestable,
  shouldCacheSystemPrompt,
  type OpenAIReasoningEffort,
  type Provider,
  type ThinkingConfig,
  type Workload,
} from '@/lib/ai/model-registry';

/**
 * The llm_config row. Column names match the Workload keys exactly, so there is
 * no mapping table to keep in sync. NULL means "use the registry default".
 */
export interface LlmConfigRow {
  river_update: string | null;
  gauge_update: string | null;
  global_summary: string | null;
  social_caption: string | null;
}

/** Why a stored override was not honoured. */
export type OverrideRejection = 'unknown_model' | 'not_approved';

export interface ResolvedModel {
  workload: Workload;
  /** Exact API model id to send. */
  id: string;
  /** Which API the id belongs to. */
  provider: Provider;
  /** Output cap for this (workload, model) pairing. */
  maxTokens: number;
  /** Anthropic: passed through as `thinking`; undefined means omit the parameter. */
  thinking?: ThinkingConfig;
  /** OpenAI: sent as `reasoning.effort`. Always set for an OpenAI model. */
  reasoningEffort?: OpenAIReasoningEffort;
  /** Whether this pairing can attach a live cache marker to its system prompt. */
  cacheSystemPrompt: boolean;
  /**
   * Whether the id came from llm_config, from the registry default, or from the
   * admin test panel. `test` never reaches a generator that publishes.
   */
  source: 'override' | 'default' | 'test';
  /**
   * The workload's code default, set only when this model is served by a
   * different provider. Tried once if this model's call fails. See the header.
   */
  fallback?: ResolvedModel;
  /**
   * This pass's record of which providers have stopped answering, shared by
   * every model resolved for the pass. Set by resolveModels(); absent from a
   * model resolved for the test panel, which never falls back.
   */
  health?: PassHealth;
  /**
   * Set when llm_config held a value that was not honoured. The row keeps the
   * bad value (so it is visible in the admin UI and fixable) while production
   * runs the default. resolveModels() logs these.
   */
  rejected?: { value: string; reason: OverrideRejection };
}

export type ResolvedModels = Record<Workload, ResolvedModel>;

/** The request parameters one (workload, model) pairing carries. */
function pairing(workload: Workload, id: string, source: ResolvedModel['source']): ResolvedModel {
  const profile = MODELS[id];
  return {
    workload,
    id,
    provider: profile.provider,
    maxTokens: WORKLOAD_SPECS[workload].maxTokens[id],
    ...(profile.provider === 'anthropic' && profile.thinking ? { thinking: profile.thinking } : {}),
    ...(profile.provider === 'openai' ? { reasoningEffort: profile.reasoningEffort } : {}),
    cacheSystemPrompt: shouldCacheSystemPrompt(workload, id),
    source,
  };
}

function resolveOne(workload: Workload, override: string | null | undefined): ResolvedModel {
  const spec = WORKLOAD_SPECS[workload];

  const base = (id: string, source: ResolvedModel['source']): ResolvedModel => {
    const resolved = pairing(workload, id, source);
    const fallback = pairing(workload, spec.default, 'default');
    return fallback.provider === resolved.provider ? resolved : { ...resolved, fallback };
  };

  const trimmed = typeof override === 'string' ? override.trim() : '';
  if (!trimmed) return base(spec.default, 'default');

  // An id nobody approved, or one approved for a different workload, falls back
  // rather than throwing: a bad row must not take the daily cron down with it.
  if (!MODELS[trimmed]) {
    return { ...base(spec.default, 'default'), rejected: { value: trimmed, reason: 'unknown_model' } };
  }
  if (!isApproved(workload, trimmed)) {
    return { ...base(spec.default, 'default'), rejected: { value: trimmed, reason: 'not_approved' } };
  }

  return base(trimmed, 'override');
}

/**
 * The pairing the admin test panel may call, or null when the model is not one
 * it is allowed to. Wider than resolveOne on purpose: it admits the workload's
 * test-only models, which is the point of the panel. No fallback, because a
 * test that quietly answered from a different model would be reporting on the
 * wrong one.
 */
export function resolveTestModel(workload: Workload, modelId: string): ResolvedModel | null {
  if (!MODELS[modelId] || !isTestable(workload, modelId)) return null;
  return pairing(workload, modelId, 'test');
}

/**
 * The models a generator should try, in order: the resolved one, then its
 * fallback. Just the fallback once this pass has stopped calling the resolved
 * model's provider (see pass-health.ts), so a provider that is down costs the
 * pass a couple of timeouts rather than one per river.
 */
export function modelAttempts(model: ResolvedModel): ResolvedModel[] {
  if (!model.fallback) return [model];
  return model.health?.skips(model.provider) ? [model.fallback] : [model, model.fallback];
}

/**
 * Pure resolution. A null row — no config, or a read that failed — yields the
 * registry defaults for every workload, which is exactly what production ran
 * before this feature existed.
 */
export function resolveConfiguredModels(row: LlmConfigRow | null): ResolvedModels {
  // One per call, and callers resolve once per pass, so this is the pass's.
  const health = new PassHealth();
  const out = {} as ResolvedModels;
  for (const workload of WORKLOADS) {
    out[workload] = { ...resolveOne(workload, row?.[workload]), health };
  }
  return out;
}

/**
 * Reads llm_config and resolves. Never throws: a missing table, a failed read,
 * a missing row and a garbage override all degrade to the registry defaults,
 * because the alternative is a cron that writes nothing.
 */
export async function resolveModels(): Promise<ResolvedModels> {
  let row: LlmConfigRow | null = null;

  try {
    const supabase = createAdminClient();
    // Ordered + limited rather than .single(): social_config accumulated
    // duplicate rows once (see 00060_fix_social_config_singleton.sql) and
    // .single() masked it by erroring instead of picking one. Newest wins.
    const { data, error } = await supabase
      .from('llm_config')
      .select('river_update, gauge_update, global_summary, social_caption')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[LlmConfig] Read failed, using code defaults:', error.message);
    } else {
      row = (data?.[0] as LlmConfigRow | undefined) ?? null;
    }
  } catch (e) {
    console.error('[LlmConfig] Read threw, using code defaults:', e);
  }

  const resolved = resolveConfiguredModels(row);

  for (const workload of WORKLOADS) {
    const { rejected } = resolved[workload];
    if (rejected) {
      console.warn(
        `[LlmConfig] Ignoring ${workload} override "${rejected.value}" (${rejected.reason}); ` +
          `falling back to ${resolved[workload].id}`,
      );
    }
  }

  return resolved;
}
