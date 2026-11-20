// src/app/api/admin/ai-models/test/route.ts
// GET + POST for the model test panel on /admin/ai-models.
//
// GET lists the recorded Reads a test can replay and the models it may call,
// for one workload: river Reads (the default) or, with ?workload=gauge_update,
// secondary-gauge Reads. POST replays one of them on one model, under that
// row's own workload, and reports what came back and
// what production's automated checks would have done with it. Those checks are
// narrow (see TestVerdict in src/lib/ai/model-test.ts): a pass is not a
// finding that the report is true.
//
// ── What this route will not do ────────────────────────────────────────────
//
// Publish. Nothing here writes to eddy_updates, eddy_generation_log or
// llm_config; a test changes no reader's page and no workload's model.
//
// Accept a prompt. The body names a recorded generation by id, and the prompt
// sent is built from what that row holds: today's prompt builder and today's
// knowledge file over the recorded morning's inputs (rebuildUserPrompt), or
// the row's own stored message when it cannot be rebuilt. A free-text prompt
// field would make this a general-purpose model console behind the admin
// cookie, billed to Eddy.
//
// Call a model outside the registry. The model must be approved or test-only
// FOR THE WORKLOAD THE ROW WAS RECORDED UNDER, the same rule the save route
// applies, one tier wider. A gauge Read is judged as the gauge generator
// judges it, under the gauge brief and the gauge workload's output cap.
//
// Fall back. A model that fails here reports the failure. Answering from the
// code default would be a test of the wrong model.
//
// Each POST is one real, billed model call. It is recorded in telemetry under
// its own operation name (model_test), so test spend is visible and is never
// counted as river-update spend.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID } from '@/lib/admin-auth';
import { withAdminMutation } from '@/lib/admin/mutation-audit';
import {
  MODELS,
  PROVIDERS,
  WORKLOAD_SPECS,
  isApproved,
  testableProfiles,
  type Workload,
} from '@/lib/ai/model-registry';
import { resolveModels, resolveTestModel } from '@/lib/ai/resolve-models';
import { generateText, MissingApiKeyError, providerConfigured } from '@/lib/ai/generate-text';
import {
  evaluateReport,
  isTestWorkload,
  latestPerTarget,
  rebuildGaugePrompt,
  rebuildUserPrompt,
  recordedFacts,
  recordedReport,
  TEST_WORKLOADS,
  type SampleRow,
  type TestWorkload,
} from '@/lib/ai/model-test';
import { getKnowledgeForTarget, getRiverKnowledgeForGauge } from '@/lib/eddy/knowledge';
import { GAUGE_READ_BRIEF } from '@/lib/eddy/read-brief';
import { getRiverContext } from '@/lib/rivers/context';
import { EDDY_SYSTEM_PROMPT } from '@/lib/eddy/generate-update';
import { sha256 } from '@/lib/eddy/generation-record';
import { estimatedCost } from '@/lib/telemetry/pricing';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
// One model call, capped by the adapter's own timeout and single retry.
export const maxDuration = 150;

const LOG_PREFIX = '[AiModelTest]';

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

/** The workload a GET lists when it names none. */
const DEFAULT_WORKLOAD: TestWorkload = 'river_update';

/** Each Read's system prompt, as its generator sends it. */
const SYSTEM_PROMPT: Record<TestWorkload, string> = {
  river_update: EDDY_SYSTEM_PROMPT,
  gauge_update: GAUGE_READ_BRIEF,
};

/** How many recent rows to read when building the one-per-river sample list. */
const SAMPLE_SCAN_ROWS = 400;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CACHE_HEADERS });

export async function GET(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const requested = request.nextUrl.searchParams.get('workload');
  if (requested != null && !isTestWorkload(requested)) {
    return json({ error: `Workload "${requested}" cannot be replayed. Replayable: ${TEST_WORKLOADS.join(', ')}` }, 400);
  }
  const workload: TestWorkload = requested ?? DEFAULT_WORKLOAD;

  const models = testableProfiles(workload).map((profile) => ({
    id: profile.id,
    label: profile.label,
    provider: PROVIDERS[profile.provider].label,
    approved: isApproved(workload, profile.id),
    // Whether the key is present, never the key. A model whose provider has
    // no key is listed but cannot be run, so the reason is visible.
    configured: providerConfigured(profile.provider),
    envVar: PROVIDERS[profile.provider].envVar,
  }));

  // Resolve the saved selection exactly as production does, including its
  // safe default for missing or invalid config. Both models answer today's
  // instructions; the published text may have used older ones.
  const baselineId = (await resolveModels())[workload].id;
  const baseline = models.find((m) => m.id === baselineId) ?? null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('eddy_generation_log')
    .select('id, created_at, workload, river_slug, section_slug, usgs_site_id, condition_code, outcome, model_used, target:inputs->target')
    .eq('workload', workload)
    // Only attempts that got as far as building a prompt can be replayed.
    .not('user_prompt', 'is', null)
    .order('created_at', { ascending: false })
    .limit(SAMPLE_SCAN_ROWS);

  const shared = {
    workload,
    workloadLabel: WORKLOAD_SPECS[workload].label,
    workloads: TEST_WORKLOADS.map((id) => ({ id, label: WORKLOAD_SPECS[id].label })),
    models,
    baseline,
  };

  if (error) {
    console.error(`${LOG_PREFIX} Sample read failed: ${error.message}`);
    // The models are still worth returning: the panel can say what it would
    // run and why it cannot, rather than rendering as broken.
    return json({ ...shared, samples: [], samplesError: 'Recorded reports could not be read.' });
  }

  return json({ ...shared, samples: latestPerTarget((data ?? []) as unknown as SampleRow[]), samplesError: null });
}

async function handlePOST(request: NextRequest) {
  // Covers 401 and the same-origin check for a cookie-authenticated write.
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const sampleId = typeof body.sampleId === 'string' ? body.sampleId : '';
  const modelId = typeof body.model === 'string' ? body.model.trim() : '';

  if (!isValidUUID(sampleId)) return json({ error: 'Choose a recorded report to test on.' }, 400);

  // The row first: the workload it was recorded under decides which models
  // may be asked, which brief is sent and how the answer is judged.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('eddy_generation_log')
    .select(
      'id, created_at, workload, river_slug, section_slug, usgs_site_id, condition_code, outcome, reason, model_used, system_prompt_hash, user_prompt, inputs, published',
    )
    .eq('id', sampleId)
    .in('workload', [...TEST_WORKLOADS])
    .limit(1);

  if (error) {
    console.error(`${LOG_PREFIX} Sample ${sampleId} read failed: ${error.message}`);
    return json({ error: 'The recorded report could not be read.' }, 500);
  }

  const row = data?.[0];
  if (!row || !isTestWorkload(row.workload)) {
    return json({ error: 'That recorded report no longer exists. Reload and choose another.' }, 404);
  }
  const workload: Workload & TestWorkload = row.workload;

  const model = resolveTestModel(workload, modelId);
  if (!model) {
    return json(
      {
        error:
          `Model "${modelId}" cannot be tested for ${workload}. ` +
          `Testable: ${testableProfiles(workload).map((p) => p.id).join(', ')}`,
      },
      400,
    );
  }

  const facts = recordedFacts(row.inputs);
  if (typeof row.user_prompt !== 'string' || !row.user_prompt || !facts) {
    return json({ error: 'That record holds no prompt to replay. Choose another.' }, 422);
  }

  // Today's inputs over the recorded water, so a change to what the prompt
  // hands the model can be read here before it ships. A failed context lookup
  // is not a failed test: the builder then uses what the record kept.
  let riverCtx = null;
  try {
    riverCtx = await getRiverContext(row.river_slug);
  } catch (e) {
    console.warn(`${LOG_PREFIX} River context lookup failed for ${row.river_slug}:`, e);
  }
  const gaugeName = (row.inputs as { target?: { gaugeName?: unknown } } | null)?.target?.gaugeName;
  const rebuilt = workload === 'gauge_update'
    ? rebuildGaugePrompt(row.inputs, {
        createdAt: row.created_at,
        riverCtx,
        riverKnowledge: getRiverKnowledgeForGauge(row.river_slug, typeof gaugeName === 'string' ? gaugeName : null, row.usgs_site_id),
      })
    : rebuildUserPrompt(row.inputs, {
        createdAt: row.created_at,
        riverCtx,
        localKnowledge: getKnowledgeForTarget(row.river_slug, row.section_slug, row.usgs_site_id),
      });
  const userPrompt = rebuilt ?? row.user_prompt;
  const systemPrompt = SYSTEM_PROMPT[workload];

  const profile = MODELS[model.id];
  const base = {
    model: {
      id: model.id,
      label: profile.label,
      provider: PROVIDERS[model.provider].label,
      approved: isApproved(workload, model.id),
      maxTokens: model.maxTokens,
      reasoningEffort: model.reasoningEffort ?? null,
    },
    sample: {
      id: row.id,
      workload,
      createdAt: row.created_at,
      riverSlug: row.river_slug,
      sectionSlug: row.section_slug,
      conditionCode: row.condition_code,
      outcome: row.outcome,
      reason: row.reason,
      modelUsed: row.model_used,
      modelLabel: row.model_used ? MODELS[row.model_used]?.label ?? row.model_used : null,
      published: recordedReport(row.published),
      // The replay sends TODAY's system prompt. When it has changed since the
      // record was written, the two texts answer different instructions and
      // the comparison is weaker than it looks; the panel says so.
      systemPromptChanged: row.system_prompt_hash !== sha256(systemPrompt),
      // `rebuilt`: today's builder and knowledge over the recorded inputs.
      // `recorded`: the stored message, because the row could not be rebuilt.
      promptSource: rebuilt ? 'rebuilt' : 'recorded',
      inputsChanged: rebuilt != null && rebuilt !== row.user_prompt,
    },
  };

  const started = performance.now();
  try {
    const result = await generateText({
      feature: 'model_test',
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const latencyMs = Math.round(performance.now() - started);
    const evaluation = evaluateReport(result.text, facts, result.finished, workload);
    const { usage } = result;

    console.log(
      `${LOG_PREFIX} ${model.id} on ${row.river_slug}/${row.section_slug ?? 'whole'}: ${evaluation.verdict} in ${latencyMs} ms`,
    );

    return json({
      ...base,
      ok: true,
      verdict: evaluation.verdict,
      reason: evaluation.reason,
      contradictions: evaluation.contradictions,
      incomplete: evaluation.incomplete,
      // The model stopped before finishing. A verdict for a river Read; a
      // warning beside the verdict for a gauge Read (see evaluateReport).
      cutOff: evaluation.cutOff,
      written: evaluation.written,
      // Exactly as returned, markers and claims line included. A partial or
      // malformed response is only fully visible here.
      rawText: result.text,
      stopReason: result.stopReason,
      latencyMs,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheCreationTokens,
        reasoningTokens: result.reasoningTokens,
      },
      // List price for these tokens. Null for a model with no price recorded.
      estimatedCostUsd: estimatedCost({
        model: model.id,
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
        cache_read_tokens: usage.cacheReadTokens ?? 0,
        cache_write_tokens: usage.cacheCreationTokens ?? 0,
      }),
    });
  } catch (e) {
    const latencyMs = Math.round(performance.now() - started);
    const missingKey = e instanceof MissingApiKeyError;
    // The provider's own message is shown to the operator: it is the reason
    // the test failed (an exhausted balance, a rejected parameter), and this
    // route is admin-only. It is bounded because it is rendered.
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} ${model.id} failed: ${message}`);
    // 200 with ok:false. The request was handled correctly; the model call is
    // the thing that failed, and that is a result, not a broken endpoint.
    return json({
      ...base,
      ok: false,
      latencyMs,
      error: missingKey
        ? `${PROVIDERS[model.provider].envVar} is not set in this environment.`
        : message.slice(0, 400),
    });
  }
}

export const POST = withAdminMutation(handlePOST);
