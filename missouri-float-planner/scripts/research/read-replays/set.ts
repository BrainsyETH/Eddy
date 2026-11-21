// scripts/research/read-replays/set.ts
// The saved mornings: their file shape, how they are read, and the outputs
// production actually published on them.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RiverContext } from '../../../src/lib/rivers/context';
import type { ReplayOutcome, ReplayOutput, ReplayWorkload } from './score';

export const SET_DIR = __dirname;
export const MORNINGS_DIR = join(SET_DIR, 'mornings');
export const RESULTS_DIR = join(SET_DIR, 'results');

/**
 * The eddy_generation_log row, as production recorded it. Every column the
 * replay or the scorer reads, and the ones a person needs to place it
 * (model, prompt hash, knowledge blocks, git sha).
 */
export interface MorningRecord {
  id: string;
  created_at: string;
  workload: ReplayWorkload;
  trigger: string;
  river_slug: string;
  section_slug: string | null;
  usgs_site_id: string | null;
  condition_code: string;
  /** Null on a derived morning: it was never generated. */
  outcome: ReplayOutcome | null;
  reason: string | null;
  contradictions: string[];
  model_used: string | null;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  git_sha: string | null;
  system_prompt_hash: string;
  knowledge_hash: string | null;
  knowledge_blocks: string[];
  user_prompt: string | null;
  inputs: Record<string, unknown>;
  raw_response: string | null;
  published: { summaryText?: string | null; eddyRead?: string | null; quoteText?: string | null; sourcesUsed?: string[] } | null;
  error_message: string | null;
}

export interface Morning {
  /** The file's name without .json: r01-james-2026-11-20. */
  key: string;
  /** Why this morning is in the set. */
  why: string;
  /**
   * Set when the morning is a recorded one with its inputs changed, because
   * production recorded none of its kind (no flood warning and no stale
   * reading was logged before the set was saved). It has no stored output and
   * is scored only in a replay.
   */
  derived: { from: string; change: string } | null;
  record: MorningRecord;
  /**
   * The river's context as the rivers table held it when the set was saved.
   * Frozen so a replay changes only what is being tested: the prompts and the
   * knowledge file.
   */
  riverContext: RiverContext | null;
}

export function loadMornings(dir = MORNINGS_DIR): Morning[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Morning);
}

/** What production published on each recorded morning, as scorer input. Derived mornings have none. */
export function storedOutputs(mornings: readonly Morning[]): ReplayOutput[] {
  return mornings.flatMap((m): ReplayOutput[] => {
    if (m.derived || !m.record.outcome) return [];
    const p = m.record.published;
    return [{
      key: m.key,
      workload: m.record.workload,
      outcome: m.record.outcome,
      reason: m.record.reason,
      published: p ? { summaryText: p.summaryText ?? null, eddyRead: p.eddyRead ?? null, quoteText: p.quoteText ?? null } : null,
      prompt: m.record.user_prompt,
    }];
  });
}
