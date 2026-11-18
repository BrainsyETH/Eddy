import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { WORKLOADS, WORKLOAD_SPECS, type Workload } from './model-registry';

// A static guard, in the style of src/lib/eddy/reach-gauge-wiring.test.ts.
//
// Nothing in this repo mocks a model SDK, so there is no behavioural test
// that catches a generator quietly going back to a literal model id. The failure
// would be silent in the worst way: /admin/ai-models would keep accepting
// switches, llm_config would keep recording them, and one workload would keep
// running whatever was hardcoded — with model_used on the row reporting the
// hardcoded value, so even the audit trail would agree with itself.
//
// The check is narrow on purpose. It does not care how a generator obtains its
// model, only that it does not name one.

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * The provider adapter. The one file that phrases a request for each provider,
 * and so the one place the resolved parameters have to be applied.
 */
const ADAPTER = 'src/lib/ai/generate-text.ts';

/** Generators whose model call goes through the adapter, by workload. */
const ADAPTER_GENERATORS: Partial<Record<Workload, string>> = {
  river_update: 'src/lib/eddy/generate-update.ts',
  gauge_update: 'src/lib/eddy/generate-gauge-update.ts',
  global_summary: 'src/lib/eddy/generate-global-update.ts',
  social_caption: 'src/lib/social/caption-generator.ts',
};

/**
 * Generators that build one provider's request themselves. None today. The
 * list stays so that a new workload written that way has somewhere to be
 * declared, and is then held to Anthropic-only by the check below.
 */
const DIRECT_GENERATORS: Partial<Record<Workload, string>> = {};

/**
 * A quoted model id from either provider. Prose mentions in comments are fine
 * and common ("Sonnet 4.6's floor is 1024"); a quoted id is what gets passed
 * to the API.
 */
const QUOTED_MODEL_ID = /['"`](?:claude|gpt)-[a-z0-9][a-z0-9.-]*['"`]/g;

const withoutComments = (file: string) =>
  src(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const file of [ADAPTER, ...Object.values(ADAPTER_GENERATORS), ...Object.values(DIRECT_GENERATORS)]) {
  test(`${file} names no model id`, () => {
    const found = withoutComments(file).match(QUOTED_MODEL_ID) ?? [];
    assert.deepEqual(
      found,
      [],
      `${file} hardcodes ${found.join(', ')} — the model must come from the resolved ` +
        `profile the caller threads in (src/lib/ai/resolve-models.ts)`,
    );
  });
}

test('every switchable workload has exactly one generator accounted for here', () => {
  // A new workload has to be placed in one list or the other, which is what
  // makes the provider check below cover it.
  for (const workload of WORKLOADS) {
    assert.equal(
      Number(workload in ADAPTER_GENERATORS) + Number(workload in DIRECT_GENERATORS),
      1,
      `${workload} must be listed as an adapter generator or a direct one`,
    );
  }
});

test('a workload offers another provider only once its generator uses the adapter', () => {
  // A direct generator sends whatever id it is handed to Anthropic. The
  // registry's `providers` is the declaration; this checks it against the code.
  for (const [workload, file] of Object.entries(DIRECT_GENERATORS)) {
    assert.deepEqual(
      WORKLOAD_SPECS[workload as Workload].providers,
      ['anthropic'],
      `${workload} offers a provider ${file} cannot call`,
    );
  }
  for (const file of Object.values(ADAPTER_GENERATORS)) {
    const text = withoutComments(file);
    assert.match(text, /generateText\(\{/, `${file} must call the provider adapter`);
    assert.doesNotMatch(
      text,
      /@anthropic-ai\/sdk|from 'openai'|messages\.create|responses\.create/,
      `${file} must not build a provider request itself`,
    );
    // Every attempt, including the fallback, is a model the resolver chose,
    // and comes from the shared loop: that loop is what drops a failing
    // provider for the rest of the pass. A generator with its own loop would
    // fall back, and would also wait out a timeout on every target.
    assert.match(text, /await tryModels(?:<[^>]*>)?\(\s*(?:params\.)?model,/, `${file} must run its attempts through tryModels`);
    assert.match(text, /model:\s*attempt,/, `${file} must hand the adapter the resolved model unchanged`);
    assert.doesNotMatch(text, /for \(const \w+ of modelAttempts\(/, `${file} must not run its own attempt loop`);
  }
});

test('an OpenAI call cannot outlast a pass', () => {
  // The fallback only starts once the first call gives up. The SDK's defaults
  // are ten minutes and two retries, which is longer than any cron here runs.
  const text = withoutComments(ADAPTER);
  const timeout = Number(text.match(/OPENAI_TIMEOUT_MS = ([\d_]+)/)?.[1].replace(/_/g, ''));
  const retries = Number(text.match(/OPENAI_MAX_RETRIES = (\d+)/)?.[1]);
  assert.ok(timeout > 0 && timeout <= 30_000, `OpenAI timeout is ${timeout} ms`);
  assert.equal(retries, 0);
  assert.match(text, /new OpenAI\(\{ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES \}\)/);
});

test('the adapter applies every resolved parameter for both providers', () => {
  const text = src(ADAPTER);
  // Anthropic.
  assert.match(text, /model:\s*model\.id/);
  assert.match(text, /max_tokens:\s*model\.maxTokens/);
  assert.match(text, /\.\.\.\(model\.thinking\s*\?/);
  assert.match(text, /model\.cacheSystemPrompt\s*\?/);
  // OpenAI. The cap covers reasoning, so the effort is not optional, and a
  // response nobody will retrieve is not stored.
  assert.match(text, /max_output_tokens:\s*model\.maxTokens/);
  assert.match(text, /reasoning:\s*\{\s*effort:\s*model\.reasoningEffort\s*\}/);
  assert.match(text, /store:\s*false/);
});

for (const file of Object.values(DIRECT_GENERATORS)) {
  test(`${file} sends the resolved model and its budget`, () => {
    const text = src(file);
    assert.match(
      text,
      /model:\s*(params\.)?model\.id/,
      `${file} must pass the resolved model id to messages.create`,
    );
    assert.match(
      text,
      /max_tokens:\s*(params\.)?model\.maxTokens/,
      `${file} must pass the resolved per-pairing max_tokens, not a literal`,
    );
    // Omitted when the profile carries none, so a non-thinking model's request
    // shape is unchanged. Spreading is what makes that conditional.
    assert.match(
      text,
      /\.\.\.\((params\.)?model\.thinking\s*\?/,
      `${file} must forward the profile's thinking configuration`,
    );
  });
}

test('the registry itself is allowed to name models', () => {
  // Sanity check on the guard above: if this stops matching, the regex has
  // drifted and the generator assertions are passing for the wrong reason.
  assert.ok(src('src/lib/ai/model-registry.ts').match(QUOTED_MODEL_ID));
});
