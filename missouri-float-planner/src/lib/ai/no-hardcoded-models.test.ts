import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A static guard, in the style of src/lib/eddy/reach-gauge-wiring.test.ts.
//
// Nothing in this repo mocks the Anthropic SDK, so there is no behavioural test
// that catches a generator quietly going back to a literal model id. The failure
// would be silent in the worst way: /admin/ai-models would keep accepting
// switches, llm_config would keep recording them, and one workload would keep
// running whatever was hardcoded — with model_used on the row reporting the
// hardcoded value, so even the audit trail would agree with itself.
//
// The check is narrow on purpose. It does not care how a generator obtains its
// model, only that it does not name one.

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Every file that calls client.messages.create for a switchable workload. */
const GENERATORS = [
  'src/lib/eddy/generate-update.ts',
  'src/lib/eddy/generate-gauge-update.ts',
  'src/lib/eddy/generate-global-update.ts',
  'src/lib/social/caption-generator.ts',
];

/**
 * A quoted `claude-…` id. Prose mentions in comments are fine and common
 * ("Sonnet 4.6's floor is 1024"); a quoted id is what gets passed to the API.
 */
const QUOTED_MODEL_ID = /['"`]claude-[a-z0-9][a-z0-9.-]*['"`]/g;

for (const file of GENERATORS) {
  test(`${file} names no model id`, () => {
    const withoutComments = src(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const found = withoutComments.match(QUOTED_MODEL_ID) ?? [];
    assert.deepEqual(
      found,
      [],
      `${file} hardcodes ${found.join(', ')} — the model must come from the resolved ` +
        `profile the caller threads in (src/lib/ai/resolve-models.ts)`,
    );
  });

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
