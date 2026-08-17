import assert from 'node:assert/strict';
import test from 'node:test';

import { MODELS, WORKLOADS, WORKLOAD_SPECS } from './model-registry';
import { resolveConfiguredModels, type LlmConfigRow } from './resolve-models';

// resolveConfiguredModels is the whole ruleset — what a NULL means, what a bad
// stored value does, which parameters a pairing carries. It is pure precisely so
// this can be tested without a Supabase harness, which this repo does not have.

const emptyRow = (): LlmConfigRow => ({
  river_update: null,
  gauge_update: null,
  global_summary: null,
  social_caption: null,
});

test('a null row resolves every workload to its code default', () => {
  // The no-config case must be identical to how production behaved before
  // llm_config existed. This is the rollback path and the disaster path at once.
  const resolved = resolveConfiguredModels(null);
  for (const workload of WORKLOADS) {
    assert.equal(resolved[workload].id, WORKLOAD_SPECS[workload].default);
    assert.equal(resolved[workload].source, 'default');
    assert.equal(resolved[workload].rejected, undefined);
  }
});

test('an all-null row is the same as no row', () => {
  const resolved = resolveConfiguredModels(emptyRow());
  for (const workload of WORKLOADS) {
    assert.equal(resolved[workload].id, WORKLOAD_SPECS[workload].default);
    assert.equal(resolved[workload].source, 'default');
  }
});

test('a valid override applies, and carries that pairing’s parameters', () => {
  const resolved = resolveConfiguredModels({ ...emptyRow(), global_summary: 'claude-sonnet-5' });

  assert.equal(resolved.global_summary.id, 'claude-sonnet-5');
  assert.equal(resolved.global_summary.source, 'override');
  // Not the 4.6 budget: Sonnet 5's tokenizer runs denser, so the pairing carries
  // its own number rather than inheriting the workload's.
  assert.equal(resolved.global_summary.maxTokens, WORKLOAD_SPECS.global_summary.maxTokens['claude-sonnet-5']);
  assert.deepEqual(resolved.global_summary.thinking, { type: 'disabled' });

  // Untouched workloads are unaffected.
  assert.equal(resolved.river_update.source, 'default');
});

test('a model with no thinking requirement omits the parameter entirely', () => {
  // Sending `thinking` where it is not needed is not free — it is a request-shape
  // difference on a model that does not think by default.
  const resolved = resolveConfiguredModels({ ...emptyRow(), river_update: 'claude-sonnet-4-6' });
  assert.equal(resolved.river_update.thinking, undefined);
  assert.equal(MODELS['claude-sonnet-4-6'].thinking, undefined);
});

test('an unknown model falls back to the default and reports why', () => {
  const resolved = resolveConfiguredModels({ ...emptyRow(), river_update: 'gpt-4o' });

  assert.equal(resolved.river_update.id, WORKLOAD_SPECS.river_update.default);
  assert.equal(resolved.river_update.source, 'default');
  assert.deepEqual(resolved.river_update.rejected, { value: 'gpt-4o', reason: 'unknown_model' });
});

test('a real model that is not approved for THIS workload falls back', () => {
  // Haiku is a legitimate model and is the default for gauge updates. That must
  // not make it usable for the statewide summary.
  const resolved = resolveConfiguredModels({
    ...emptyRow(),
    global_summary: 'claude-haiku-4-5-20251001',
  });

  assert.equal(resolved.global_summary.id, WORKLOAD_SPECS.global_summary.default);
  assert.equal(resolved.global_summary.source, 'default');
  assert.deepEqual(resolved.global_summary.rejected, {
    value: 'claude-haiku-4-5-20251001',
    reason: 'not_approved',
  });
});

test('whitespace-only and empty overrides read as “use the default”', () => {
  const resolved = resolveConfiguredModels({
    ...emptyRow(),
    social_caption: '   ',
    gauge_update: '',
  });
  assert.equal(resolved.social_caption.source, 'default');
  assert.equal(resolved.social_caption.rejected, undefined);
  assert.equal(resolved.gauge_update.source, 'default');
});

test('a surrounding-whitespace override still resolves', () => {
  const resolved = resolveConfiguredModels({ ...emptyRow(), river_update: ' claude-sonnet-5 ' });
  assert.equal(resolved.river_update.id, 'claude-sonnet-5');
  assert.equal(resolved.river_update.source, 'override');
});

test('one bad workload does not disturb the others', () => {
  // The daily pass must survive a single fat-fingered row.
  const resolved = resolveConfiguredModels({
    ...emptyRow(),
    river_update: 'not-a-model',
    gauge_update: 'claude-sonnet-4-6',
  });
  assert.equal(resolved.river_update.source, 'default');
  assert.equal(resolved.gauge_update.id, 'claude-sonnet-4-6');
  assert.equal(resolved.gauge_update.source, 'override');
});

test('every resolved workload reports a usable budget', () => {
  const resolved = resolveConfiguredModels(null);
  for (const workload of WORKLOADS) {
    assert.equal(typeof resolved[workload].maxTokens, 'number');
    assert.ok(resolved[workload].maxTokens > 0);
  }
});
