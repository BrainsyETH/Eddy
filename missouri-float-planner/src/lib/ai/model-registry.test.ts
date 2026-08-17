import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODELS,
  WORKLOADS,
  WORKLOAD_SPECS,
  approvedProfiles,
  isApproved,
  type Workload,
} from './model-registry';

// The registry is the allowlist. These are the invariants that make it one:
// without them it is a lookup table that happens to be right today.

test('every workload default is a model the registry knows', () => {
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    assert.ok(MODELS[spec.default], `${workload} defaults to unknown model ${spec.default}`);
  }
});

test('every workload default is itself approved for that workload', () => {
  // Otherwise the fallback path resolves to something the API route would
  // reject, and the two halves of the system disagree about what is allowed.
  for (const workload of WORKLOADS) {
    assert.ok(
      isApproved(workload, WORKLOAD_SPECS[workload].default),
      `${workload}'s default is not in its own approved list`,
    );
  }
});

test('defaults match the models production ran before this feature existed', () => {
  // Day one must be a provable no-op. If a default is changed, this is the test
  // that should make someone say it out loud.
  const shipped: Record<Workload, string> = {
    river_update: 'claude-sonnet-4-6',
    gauge_update: 'claude-haiku-4-5-20251001',
    global_summary: 'claude-sonnet-4-6',
    social_caption: 'claude-sonnet-4-6',
  };
  for (const workload of WORKLOADS) {
    assert.equal(WORKLOAD_SPECS[workload].default, shipped[workload], `${workload} default drifted`);
  }
});

test('every approved model exists and carries an output budget', () => {
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    for (const modelId of spec.approved) {
      assert.ok(MODELS[modelId], `${workload} approves unknown model ${modelId}`);
      assert.equal(
        typeof spec.maxTokens[modelId],
        'number',
        `${workload} approves ${modelId} with no max_tokens entry`,
      );
      assert.ok(spec.maxTokens[modelId] > 0, `${workload}/${modelId} has a non-positive budget`);
    }
  }
});

test('Sonnet 5 always disables thinking', () => {
  // It runs adaptive thinking when `thinking` is omitted, and max_tokens caps
  // thinking and visible text together — so on the statewide summary's 200-token
  // budget an un-disabled Sonnet 5 spends the allowance reasoning and returns
  // nothing publishable.
  assert.deepEqual(MODELS['claude-sonnet-5'].thinking, { type: 'disabled' });

  for (const [id, profile] of Object.entries(MODELS)) {
    if (id.startsWith('claude-sonnet-5') || id.startsWith('claude-opus-5') || id.startsWith('claude-fable')) {
      assert.deepEqual(
        profile.thinking,
        { type: 'disabled' },
        `${id} thinks by default and must disable it for these short-form workloads`,
      );
    }
  }
});

test('every model approved for a prompt-cached workload clears its cache floor', () => {
  // generate-update.ts attaches a cache_control breakpoint unconditionally. That
  // is only correct while every model it can run has a cacheable-prefix floor at
  // or under the prompt size — otherwise the breakpoint is a silent no-op and
  // the cost model quietly changes. Approving Haiku 4.5 (floor 4096) for the
  // river update is exactly what this catches.
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    if (!spec.cacheSystemPrompt) continue;

    const promptTokens = spec.systemPromptTokens;
    assert.equal(
      typeof promptTokens,
      'number',
      `${workload} caches its system prompt but declares no systemPromptTokens`,
    );

    for (const modelId of spec.approved) {
      assert.ok(
        MODELS[modelId].minCacheablePrefixTokens <= (promptTokens as number),
        `${modelId} cannot cache ${workload}'s ~${promptTokens}-token prompt ` +
          `(floor ${MODELS[modelId].minCacheablePrefixTokens})`,
      );
    }
  }
});

test('Haiku is not approved where nobody has read its output', () => {
  // Approved is narrower than API-compatible. The statewide summary leads with
  // flood and safety framing, and the river update is the longest-form output of
  // the four; both are Sonnet-tier until someone has actually looked.
  assert.equal(isApproved('global_summary', 'claude-haiku-4-5-20251001'), false);
  assert.equal(isApproved('river_update', 'claude-haiku-4-5-20251001'), false);
});

test('approvedProfiles returns real profiles in registry order', () => {
  for (const workload of WORKLOADS) {
    const profiles = approvedProfiles(workload);
    assert.equal(profiles.length, WORKLOAD_SPECS[workload].approved.length);
    assert.deepEqual(
      profiles.map((p) => p.id),
      WORKLOAD_SPECS[workload].approved,
    );
  }
});
