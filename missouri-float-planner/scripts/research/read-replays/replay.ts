#!/usr/bin/env npx tsx
/**
 * replay.ts — writes a Read for every saved morning with today's prompts.
 *
 * For each morning in mornings/ it does what the admin model test panel does
 * for one (src/app/api/admin/ai-models/test/route.ts): rebuilds the user
 * message with today's prompt builder and today's EDDY_KNOWLEDGE.md over the
 * recorded inputs, sends it with today's system prompt to the model
 * production would use, and judges the answer with production's checks
 * (evaluateReport). The river context is the one frozen in the morning file.
 *
 * What it decides per morning is what production would have published:
 *   - a morning whose facts call for a preflight fallback (no gauge, no
 *     rating) is not sent; it gets the code-written report, as in production;
 *   - a passing answer is `model`; one the guard replaces or that is
 *     incomplete is `fallback`, with the code-written report;
 *   - an empty answer, or a failed call, is `error`: nothing is published.
 *
 * The models are production's: llm_config read from the linked project and
 * resolved with resolveConfiguredModels(). If a model's provider key is not
 * set, it stops before any call. It never substitutes another model: a replay
 * on a different model is not a baseline for this one.
 *
 * Read-only toward the database. Each non-preflight morning is one billed
 * model call; nothing is published or logged, and upstream telemetry is
 * switched off for the run.
 *
 * Usage (from missouri-float-planner/):
 *   npx tsx scripts/research/read-replays/replay.ts --dry-run   # build every prompt, call nothing
 *   npx tsx scripts/research/read-replays/replay.ts [--label after-brief-change]
 * Then score it: npx tsx scripts/research/read-replays/score-set.ts results/replay-<...>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../../lib/db';
import { evaluateReport, rebuildGaugePrompt, rebuildUserPrompt, recordedFacts } from '../../../src/lib/ai/model-test';
import { generateText, providerConfigured } from '../../../src/lib/ai/generate-text';
import { PROVIDERS } from '../../../src/lib/ai/model-registry';
import { resolveConfiguredModels, type LlmConfigRow, type ResolvedModel } from '../../../src/lib/ai/resolve-models';
import { getKnowledgeForTarget, getRiverKnowledgeForGauge } from '../../../src/lib/eddy/knowledge';
import { EDDY_SYSTEM_PROMPT } from '../../../src/lib/eddy/generate-update';
import { GAUGE_READ_BRIEF } from '../../../src/lib/eddy/read-brief';
import { factualReportFallback, preflightFallbackReason } from '../../../src/lib/eddy/report-facts';
import { stripEddyMarkers } from '../../../src/lib/eddy/parse-response';
import { sha256 } from '../../../src/lib/eddy/generation-record';
import { estimatedCost } from '../../../src/lib/telemetry/pricing';
import { loadMornings, RESULTS_DIR, type Morning } from './set';
import type { PublishedText, ReplayOutput, ReplayWorkload } from './score';

const SYSTEM_PROMPT: Record<ReplayWorkload, string> = {
  river_update: EDDY_SYSTEM_PROMPT,
  gauge_update: GAUGE_READ_BRIEF,
};

interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

export interface ReplayRecord extends ReplayOutput {
  model: string | null;
  /** `rebuilt` with today's builder and knowledge, or `recorded` when the record could not be rebuilt. */
  promptSource: 'rebuilt' | 'recorded' | null;
  rawText: string | null;
  stopReason: string | null;
  usage: Usage | null;
  error: string | null;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const clean = (p: { summaryText: string | null; eddyRead: string | null; quoteText: string }): PublishedText => ({
  summaryText: p.summaryText ? stripEddyMarkers(p.summaryText) : null,
  eddyRead: p.eddyRead ? stripEddyMarkers(p.eddyRead) : null,
  quoteText: stripEddyMarkers(p.quoteText),
});

function buildPrompt(m: Morning): { prompt: string | null; source: 'rebuilt' | 'recorded' | null } {
  const r = m.record;
  const rebuilt = r.workload === 'gauge_update'
    ? rebuildGaugePrompt(r.inputs, {
        createdAt: r.created_at,
        riverCtx: m.riverContext,
        riverKnowledge: getRiverKnowledgeForGauge(r.river_slug, ((r.inputs.target as { gaugeName?: string } | undefined)?.gaugeName) ?? null, r.usgs_site_id),
      })
    : rebuildUserPrompt(r.inputs, {
        createdAt: r.created_at,
        riverCtx: m.riverContext,
        localKnowledge: getKnowledgeForTarget(r.river_slug, r.section_slug, r.usgs_site_id),
      });
  if (rebuilt) return { prompt: rebuilt, source: 'rebuilt' };
  return r.user_prompt ? { prompt: r.user_prompt, source: 'recorded' } : { prompt: null, source: null };
}

async function replayOne(m: Morning, model: ResolvedModel, dryRun: boolean): Promise<ReplayRecord> {
  const r = m.record;
  const base = { key: m.key, workload: r.workload, model: null, promptSource: null, rawText: null, stopReason: null, usage: null, error: null };
  const facts = recordedFacts(r.inputs);
  if (!facts) throw new Error(`${m.key}: the record holds no facts`);

  const preflight = preflightFallbackReason(facts);
  if (preflight) {
    return { ...base, outcome: 'fallback', reason: preflight, published: clean(factualReportFallback(facts)), prompt: null };
  }

  const { prompt, source } = buildPrompt(m);
  if (!prompt) throw new Error(`${m.key}: no prompt could be built`);
  if (dryRun) {
    const changed = r.user_prompt ? (prompt === r.user_prompt ? 'same as recorded' : 'differs from recorded') : 'no recorded prompt';
    console.log(`  ${m.key}: ${source}, ${prompt.length} chars, ${changed}`);
    return { ...base, outcome: 'error', reason: 'dry_run', published: null, prompt, promptSource: source };
  }

  try {
    const result = await generateText({
      feature: 'model_test',
      model,
      system: SYSTEM_PROMPT[r.workload],
      messages: [{ role: 'user', content: prompt }],
    });
    const usage: Usage = {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cacheReadTokens: result.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: result.usage.cacheCreationTokens ?? 0,
    };
    const evaluation = evaluateReport(result.text, facts, result.finished, r.workload);
    const common = { ...base, model: model.id, promptSource: source, prompt, rawText: result.text, stopReason: result.stopReason, usage };
    if (evaluation.verdict === 'empty') return { ...common, outcome: 'error', reason: 'empty_response', published: null };
    if (evaluation.verdict === 'passed') {
      const w = evaluation.written!;
      return { ...common, outcome: 'model', reason: null, published: { summaryText: w.summaryText, eddyRead: w.eddyRead, quoteText: w.quoteText } };
    }
    return { ...common, outcome: 'fallback', reason: evaluation.reason, published: clean(factualReportFallback(facts)) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...base, model: model.id, promptSource: source, prompt, outcome: 'error', reason: 'model_error', published: null, error: message.slice(0, 400) };
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const label = arg('--label') ?? 'current';
  // Nothing from this run belongs in production's upstream counters.
  process.env.UPSTREAM_TELEMETRY_ENABLED = 'false';

  const supabase = getScriptClient({ script: 'read-replays-replay', write: false });
  const { data, error } = await supabase
    .from('llm_config')
    .select('river_update, gauge_update, global_summary, social_caption')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`llm_config read failed: ${error.message}`);
  const resolved = resolveConfiguredModels((data?.[0] as LlmConfigRow | undefined) ?? null);
  const models: Record<ReplayWorkload, ResolvedModel> = { river_update: resolved.river_update, gauge_update: resolved.gauge_update };
  console.log(`Models: river ${models.river_update.id} (${models.river_update.source}), gauge ${models.gauge_update.id} (${models.gauge_update.source}).`);

  const mornings = loadMornings();
  if (!dryRun) {
    const missing = [...new Set(Object.values(models).filter((m) => !providerConfigured(m.provider)).map((m) => PROVIDERS[m.provider].envVar))];
    if (missing.length) {
      console.error(`Blocked: ${missing.join(', ')} is not set. Nothing was sent. Not substituting another model.`);
      process.exit(2);
    }
  }

  const records: ReplayRecord[] = [];
  for (const m of mornings) {
    const record = await replayOne(m, models[m.record.workload], dryRun);
    records.push(record);
    if (!dryRun) console.log(`  ${m.key}: ${record.outcome}${record.reason ? ` (${record.reason})` : ''}`);
  }
  if (dryRun) {
    console.log(`Dry run: ${records.filter((r) => r.prompt).length} prompts built, ${records.filter((r) => !r.prompt).length} preflight fallbacks. Nothing sent.`);
    return;
  }

  const total = records.reduce<Usage & { costUsd: number }>((sum, r) => {
    if (!r.usage || !r.model) return sum;
    const cost = estimatedCost({
      model: r.model,
      input_tokens: r.usage.inputTokens,
      output_tokens: r.usage.outputTokens,
      cache_read_tokens: r.usage.cacheReadTokens,
      cache_write_tokens: r.usage.cacheWriteTokens,
    }) ?? 0;
    return {
      inputTokens: sum.inputTokens + r.usage.inputTokens,
      outputTokens: sum.outputTokens + r.usage.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + r.usage.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + r.usage.cacheWriteTokens,
      costUsd: sum.costUsd + cost,
    };
  }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = join(RESULTS_DIR, `replay-${label}-${stamp}.json`);
  writeFileSync(file, `${JSON.stringify({
    meta: {
      label,
      ranAt: new Date().toISOString(),
      models: { river_update: models.river_update.id, gauge_update: models.gauge_update.id },
      systemPromptHash: { river_update: sha256(SYSTEM_PROMPT.river_update), gauge_update: sha256(SYSTEM_PROMPT.gauge_update) },
      tokens: total,
    },
    outputs: records,
  }, null, 2)}\n`);
  console.log(`Tokens: input ${total.inputTokens}, output ${total.outputTokens}, cache read ${total.cacheReadTokens}, cache write ${total.cacheWriteTokens}. Estimated $${total.costUsd.toFixed(4)}.`);
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
