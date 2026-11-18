// src/app/api/admin/ai-models/test/route.ts
// GET + POST for the model test panel on /admin/ai-models.
//
// GET lists the recorded river Reads a test can replay and the models it may
// call. POST replays one of them on one model and reports what came back and
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
// sent is the one that row holds. A free-text prompt field would make this a
// general-purpose model console behind the admin cookie, billed to Eddy.
//
// Call a model outside the registry. The model must be approved or test-only
// FOR THE WORKLOAD, the same rule the save route applies, one tier wider.
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
  evaluateRiverReport,
  latestPerTarget,
  recordedFacts,
  recordedReport,
  type SampleRow,
} from '@/lib/ai/model-test';
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

/**
 * The one workload the panel can replay. The generation log records river
 * Reads only, so there is nothing to replay for the others yet.
 */
const TEST_WORKLOAD: Workload = 'river_update';

/** How many recent rows to read when building the one-per-river sample list. */
const SAMPLE_SCAN_ROWS = 400;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CACHE_HEADERS });

export async function GET(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const models = testableProfiles(TEST_WORKLOAD).map((profile) => ({
    id: profile.id,
    label: profile.label,
    provider: PROVIDERS[profile.provider].label,
    approved: isApproved(TEST_WORKLOAD, profile.id),
    // Whether the key is present, never the key. A model whose provider has
    // no key is listed but cannot be run, so the reason is visible.
    configured: providerConfigured(profile.provider),
    envVar: PROVIDERS[profile.provider].envVar,
  }));

  // Resolve the saved selection exactly as production does, including its
  // safe default for missing or invalid config. Both models answer today's
  // instructions; the published text may have used older ones.
  const baselineId = (await resolveModels())[TEST_WORKLOAD].id;
  const baseline = models.find((m) => m.id === baselineId) ?? null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('eddy_generation_log')
    .select('id, created_at, river_slug, section_slug, condition_code, outcome, model_used, target:inputs->target')
    .eq('workload', TEST_WORKLOAD)
    // Only attempts that got as far as building a prompt can be replayed.
    .not('user_prompt', 'is', null)
    .order('created_at', { ascending: false })
    .limit(SAMPLE_SCAN_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Sample read failed: ${error.message}`);
    // The models are still worth returning: the panel can say what it would
    // run and why it cannot, rather than rendering as broken.
    return json({
      workload: TEST_WORKLOAD,
      workloadLabel: WORKLOAD_SPECS[TEST_WORKLOAD].label,
      models,
      baseline,
      samples: [],
      samplesError: 'Recorded river reports could not be read.',
    });
  }

  return json({
    workload: TEST_WORKLOAD,
    workloadLabel: WORKLOAD_SPECS[TEST_WORKLOAD].label,
    models,
    baseline,
    samples: latestPerTarget((data ?? []) as unknown as SampleRow[]),
    samplesError: null,
  });
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

  const model = resolveTestModel(TEST_WORKLOAD, modelId);
  if (!model) {
    return json(
      {
        error:
          `Model "${modelId}" cannot be tested for ${TEST_WORKLOAD}. ` +
          `Testable: ${testableProfiles(TEST_WORKLOAD).map((p) => p.id).join(', ')}`,
      },
      400,
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('eddy_generation_log')
    .select(
      'id, created_at, river_slug, section_slug, condition_code, outcome, reason, model_used, system_prompt_hash, user_prompt, inputs, published',
    )
    .eq('id', sampleId)
    .eq('workload', TEST_WORKLOAD)
    .limit(1);

  if (error) {
    console.error(`${LOG_PREFIX} Sample ${sampleId} read failed: ${error.message}`);
    return json({ error: 'The recorded report could not be read.' }, 500);
  }

  const row = data?.[0];
  if (!row) return json({ error: 'That recorded report no longer exists. Reload and choose another.' }, 404);

  const facts = recordedFacts(row.inputs);
  if (typeof row.user_prompt !== 'string' || !row.user_prompt || !facts) {
    return json({ error: 'That record holds no prompt to replay. Choose another.' }, 422);
  }

  const profile = MODELS[model.id];
  const base = {
    model: {
      id: model.id,
      label: profile.label,
      provider: PROVIDERS[model.provider].label,
      approved: isApproved(TEST_WORKLOAD, model.id),
      maxTokens: model.maxTokens,
      reasoningEffort: model.reasoningEffort ?? null,
    },
    sample: {
      id: row.id,
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
      systemPromptChanged: row.system_prompt_hash !== sha256(EDDY_SYSTEM_PROMPT),
    },
  };

  const started = performance.now();
  try {
    const result = await generateText({
      feature: 'model_test',
      model,
      system: EDDY_SYSTEM_PROMPT,
      user: row.user_prompt,
    });
    const latencyMs = Math.round(performance.now() - started);
    const evaluation = evaluateRiverReport(result.text, facts, result.finished);
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
