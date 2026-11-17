import assert from 'node:assert/strict';
import test from 'node:test';

import { MODELS } from '@/lib/ai/model-registry';
import { estimatedCost, PRICE_VERSION } from './pricing';

const row = (model: string, input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_tokens: cacheRead,
  cache_write_tokens: cacheWrite,
});

const close = (actual: number | null, expected: number) => {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
};

test('every registered model has a price', () => {
  // A model without one reports "Unknown model pricing" for its whole feature
  // in the admin dashboard, and null in the test panel. Registering a model
  // means recording what it costs.
  for (const id of Object.keys(MODELS)) {
    assert.notEqual(estimatedCost(row(id, 1000, 1000)), null, `${id} has no price in pricing.ts`);
  }
});

test('a model outside the registry is unpriced rather than guessed', () => {
  assert.equal(estimatedCost(row('gpt-4o', 1000, 1000)), null);
});

test('Anthropic prices keep their 0.1x read and 1.25x write cache rates', () => {
  // $3 in, $15 out, $0.30 cache read, $3.75 cache write, per million.
  close(estimatedCost(row('claude-sonnet-4-6', 1e6, 0)), 3);
  close(estimatedCost(row('claude-sonnet-4-6', 0, 1e6)), 15);
  close(estimatedCost(row('claude-sonnet-4-6', 0, 0, 1e6)), 0.3);
  close(estimatedCost(row('claude-sonnet-4-6', 0, 0, 0, 1e6)), 3.75);
});

test('OpenAI prices carry their own cache rates, not Anthropic’s multipliers', () => {
  // GPT-6.1 Terra: $1 in, $5 out, $0.05 cache read (a twentieth, not a tenth).
  close(estimatedCost(row('gpt-6.1-terra', 1e6, 0)), 1);
  close(estimatedCost(row('gpt-6.1-terra', 0, 1e6)), 5);
  close(estimatedCost(row('gpt-6.1-terra', 0, 0, 1e6)), 0.05);
  close(estimatedCost(row('gpt-6.1-terra', 0, 0, 0, 1e6)), 1.25);
  close(estimatedCost(row('gpt-6.2-sol', 0, 0, 1e6)), 0.1);
  close(estimatedCost(row('gpt-6-luna', 1e6, 1e6)), 0.6);
});

test('one river report on GPT-6.1 Terra with a cached system prompt', () => {
  // 400 uncached + 1,900 cached in, 240 out.
  close(estimatedCost(row('gpt-6.1-terra', 400, 240, 1900)), (400 * 1 + 240 * 5 + 1900 * 0.05) / 1e6);
});

test('the price basis is named', () => {
  assert.match(PRICE_VERSION, /^\d{4}-\d{2}-\d{2}-standard$/);
});
