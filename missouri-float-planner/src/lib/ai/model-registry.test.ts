import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODELS,
  OPENAI_MIN_CACHEABLE_PREFIX_TOKENS,
  PROVIDERS,
  WORKLOADS,
  WORKLOAD_SPECS,
  approvedProfiles,
  isApproved,
  isTestable,
  promptCacheMode,
  shouldCacheSystemPrompt,
  testableProfiles,
  type AnthropicProfile,
  type Workload,
} from './model-registry';

/** The Anthropic-only fields of a profile, or a failure naming the model. */
function anthropic(id: string): AnthropicProfile {
  const profile = MODELS[id];
  assert.equal(profile?.provider, 'anthropic', `${id} is not an Anthropic model`);
  return profile as AnthropicProfile;
}

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
  assert.deepEqual(anthropic('claude-sonnet-5').thinking, { type: 'disabled' });

  for (const id of Object.keys(MODELS)) {
    if (id.startsWith('claude-sonnet-5') || id.startsWith('claude-opus-5') || id.startsWith('claude-fable')) {
      assert.deepEqual(
        anthropic(id).thinking,
        { type: 'disabled' },
        `${id} thinks by default and must disable it for these short-form workloads`,
      );
    }
  }
});

test('system-prompt caching is enabled only when the model clears the cache floor', () => {
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    if (spec.cacheSystemPrompt) {
      assert.equal(
        typeof spec.systemPromptTokens,
        'number',
        `${workload} may cache its system prompt but declares no systemPromptTokens`,
      );
    }

    for (const modelId of spec.approved) {
      const expected = Boolean(
        spec.cacheSystemPrompt &&
          spec.systemPromptTokens &&
          anthropic(modelId).minCacheablePrefixTokens <= spec.systemPromptTokens,
      );
      assert.equal(shouldCacheSystemPrompt(workload, modelId), expected);
    }
  }

  assert.equal(shouldCacheSystemPrompt('river_update', 'claude-sonnet-4-6'), true);
  assert.equal(shouldCacheSystemPrompt('river_update', 'claude-haiku-4-5-20251001'), false);
});

test('Haiku is approved for river reports but not the statewide safety summary', () => {
  assert.equal(isApproved('river_update', 'claude-haiku-4-5-20251001'), true);
  assert.equal(isApproved('global_summary', 'claude-haiku-4-5-20251001'), false);
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

// ── Providers ───────────────────────────────────────────────────────────────

test('every model names a provider the registry knows', () => {
  for (const [id, profile] of Object.entries(MODELS)) {
    assert.ok(PROVIDERS[profile.provider], `${id} names unknown provider ${profile.provider}`);
    assert.equal(profile.id, id, `${id} is keyed under a different id than it carries`);
  }
});

test('a workload only lists models from providers its generator can call', () => {
  // The three generators that still build an Anthropic request directly would
  // send an OpenAI id to Anthropic. Their `providers` says so, and this is what
  // stops an id being added to their lists before the call site can serve it.
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    for (const modelId of [...spec.approved, ...spec.testable]) {
      assert.ok(
        spec.providers.includes(MODELS[modelId].provider),
        `${workload} lists ${modelId}, but its generator cannot call ${MODELS[modelId].provider}`,
      );
    }
  }
});

test('every OpenAI model states its reasoning effort', () => {
  // Omitted, every current OpenAI model reasons at `medium` inside the same
  // cap as the answer. The type requires the field; this pins the two values
  // that were read off the model pages.
  for (const [id, profile] of Object.entries(MODELS)) {
    if (profile.provider !== 'openai') continue;
    assert.ok(['none', 'low'].includes(profile.reasoningEffort), `${id} has effort ${profile.reasoningEffort}`);
  }
  const sol = MODELS['gpt-6.2-sol'];
  // GPT-6.2 Sol answers `none` with a 400.
  assert.ok(sol.provider === 'openai' && sol.reasoningEffort === 'low');
});

test('a model that cannot switch reasoning off gets a cap with room to reason', () => {
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    for (const modelId of [...spec.approved, ...spec.testable]) {
      const profile = MODELS[modelId];
      if (profile.provider !== 'openai' || profile.reasoningEffort === 'none') continue;
      assert.ok(
        spec.maxTokens[modelId] >= 4 * spec.maxTokens[spec.default],
        `${workload}/${modelId} reasons inside its cap but has no more room than a model that does not`,
      );
    }
  }
});

test('OpenAI models never get a cache marker, and report automatic caching instead', () => {
  for (const workload of WORKLOADS) {
    for (const profile of testableProfiles(workload)) {
      if (profile.provider !== 'openai') continue;
      assert.equal(shouldCacheSystemPrompt(workload, profile.id), false);
      const long = (WORKLOAD_SPECS[workload].systemPromptTokens ?? 0) >= OPENAI_MIN_CACHEABLE_PREFIX_TOKENS;
      assert.equal(promptCacheMode(workload, profile.id), long ? 'automatic' : 'off');
    }
  }
  assert.equal(promptCacheMode('river_update', 'claude-sonnet-4-6'), 'marker');
  assert.equal(promptCacheMode('river_update', 'claude-haiku-4-5-20251001'), 'off');
  assert.equal(promptCacheMode('river_update', 'gpt-6.1-terra'), 'automatic');
});

// ── Test-only models ────────────────────────────────────────────────────────

test('test-only models exist, carry a budget, and are not also approved', () => {
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    for (const modelId of spec.testable) {
      assert.ok(MODELS[modelId], `${workload} lists unknown test-only model ${modelId}`);
      assert.ok(spec.maxTokens[modelId] > 0, `${workload}/${modelId} is testable with no max_tokens entry`);
      assert.equal(isApproved(workload, modelId), false, `${workload}/${modelId} is both approved and test-only`);
      assert.equal(isTestable(workload, modelId), true);
    }
    for (const modelId of spec.approved) assert.equal(isTestable(workload, modelId), true);
  }
});

test('testableProfiles lists approved models first, then test-only ones', () => {
  for (const workload of WORKLOADS) {
    const spec = WORKLOAD_SPECS[workload];
    assert.deepEqual(
      testableProfiles(workload).map((p) => p.id),
      [...spec.approved, ...spec.testable],
    );
  }
});

test('OpenAI models are test-only for river updates until someone has read them', () => {
  // Approving one is moving its id from `testable` to `approved`. This test is
  // the one that should make someone say they have read its reports.
  for (const modelId of ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna']) {
    assert.equal(isTestable('river_update', modelId), true);
    assert.equal(isApproved('river_update', modelId), false, `${modelId} was approved for river updates`);
  }
  assert.equal(isTestable('global_summary', 'gpt-6.1-terra'), false);
});
