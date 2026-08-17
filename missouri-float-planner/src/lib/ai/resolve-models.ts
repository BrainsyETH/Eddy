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
// Sonnet calls — but so that a switch landing mid-pass cannot split one run
// across two models, leaving half the rows recording one model_used and half
// another with nothing marking the boundary.

import { createAdminClient } from '@/lib/supabase/admin';
import {
  MODELS,
  WORKLOADS,
  WORKLOAD_SPECS,
  isApproved,
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
  /** Output cap for this (workload, model) pairing. */
  maxTokens: number;
  /** Passed through as `thinking`; undefined means omit the parameter. */
  thinking?: ThinkingConfig;
  /** Whether the id came from llm_config or from the registry default. */
  source: 'override' | 'default';
  /**
   * Set when llm_config held a value that was not honoured. The row keeps the
   * bad value (so it is visible in the admin UI and fixable) while production
   * runs the default. resolveModels() logs these.
   */
  rejected?: { value: string; reason: OverrideRejection };
}

export type ResolvedModels = Record<Workload, ResolvedModel>;

function resolveOne(workload: Workload, override: string | null | undefined): ResolvedModel {
  const spec = WORKLOAD_SPECS[workload];

  const base = (id: string, source: ResolvedModel['source']): ResolvedModel => {
    const profile = MODELS[id];
    return {
      workload,
      id,
      maxTokens: spec.maxTokens[id],
      thinking: profile?.thinking,
      source,
    };
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
 * Pure resolution. A null row — no config, or a read that failed — yields the
 * registry defaults for every workload, which is exactly what production ran
 * before this feature existed.
 */
export function resolveConfiguredModels(row: LlmConfigRow | null): ResolvedModels {
  const out = {} as ResolvedModels;
  for (const workload of WORKLOADS) {
    out[workload] = resolveOne(workload, row?.[workload]);
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
