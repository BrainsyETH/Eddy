import assert from 'node:assert/strict';
import test from 'node:test';

import { extractOpenAIUsage, extractUsage, openAIReasoningTokens, openAITokenCounts } from './usage';

// The two providers count one call differently. These pin the conversion that
// makes a stored token row mean the same thing whichever one wrote it.

test('Anthropic usage is stored as returned: its buckets are already disjoint', () => {
  assert.deepEqual(
    extractUsage('claude-sonnet-4-6', {
      input_tokens: 400,
      output_tokens: 210,
      cache_read_input_tokens: 1900,
      cache_creation_input_tokens: 0,
    }),
    {
      modelUsed: 'claude-sonnet-4-6',
      inputTokens: 400,
      outputTokens: 210,
      cacheReadTokens: 1900,
      cacheCreationTokens: 0,
    },
  );
});

test('OpenAI input_tokens includes the cached prefix, so it is taken back out', () => {
  // 2,300 tokens went in; 1,900 of them were a cache hit. Stored as returned,
  // the row would bill 2,300 at the full rate AND 1,900 at the cached one.
  const usage = {
    input_tokens: 2300,
    input_tokens_details: { cached_tokens: 1900, cache_write_tokens: 0 },
    output_tokens: 240,
    output_tokens_details: { reasoning_tokens: 0 },
  };
  assert.deepEqual(openAITokenCounts(usage), { input: 400, output: 240, cacheRead: 1900, cacheWrite: 0 });
  assert.deepEqual(extractOpenAIUsage('gpt-6.1-terra', usage), {
    modelUsed: 'gpt-6.1-terra',
    inputTokens: 400,
    outputTokens: 240,
    cacheReadTokens: 1900,
    cacheCreationTokens: 0,
  });
});

test('an OpenAI cache write is separated from uncached input too', () => {
  const counts = openAITokenCounts({
    input_tokens: 2300,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1900 },
    output_tokens: 240,
  });
  assert.deepEqual(counts, { input: 400, output: 240, cacheRead: 0, cacheWrite: 1900 });
  // The four buckets add back up to what was billed as input.
  assert.equal(counts.input + counts.cacheRead + counts.cacheWrite, 2300);
});

test('reasoning tokens stay inside the output count and are reported beside it', () => {
  const usage = { input_tokens: 2300, output_tokens: 900, output_tokens_details: { reasoning_tokens: 640 } };
  // Billed as output, so the stored output count must not drop them.
  assert.equal(extractOpenAIUsage('gpt-6.2-sol', usage).outputTokens, 900);
  assert.equal(openAIReasoningTokens(usage), 640);
  assert.equal(openAIReasoningTokens({ input_tokens: 1, output_tokens: 1 }), null);
  assert.equal(openAIReasoningTokens(null), null);
});

test('a usage block that breaks the input identity cannot produce a negative count', () => {
  const counts = openAITokenCounts({ input_tokens: 100, input_tokens_details: { cached_tokens: 500 } });
  assert.equal(counts.input, 0);
});

test('a missing usage block is null, not zero', () => {
  // Zero would read as a free call in every cost total.
  assert.deepEqual(extractOpenAIUsage('gpt-6-luna', null), {
    modelUsed: 'gpt-6-luna',
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheCreationTokens: null,
  });
  assert.equal(extractUsage('claude-sonnet-4-6', undefined).inputTokens, null);
});
