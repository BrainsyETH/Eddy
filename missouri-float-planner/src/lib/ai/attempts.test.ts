import assert from 'node:assert/strict';
import test from 'node:test';

import { tryModels } from './attempts';
import { MissingApiKeyError } from './errors';
import { PassHealth, TRIP_AFTER_FAILURES } from './pass-health';
import { resolveConfiguredModels, type LlmConfigRow, type ResolvedModel } from './resolve-models';

// The attempt loop and the per-pass cut-off, exercised without a model. The
// generators hand tryModels a function that calls the provider; here that
// function is a stand-in that fails or answers on demand.

const row = (river: string | null): LlmConfigRow => ({
  river_update: river,
  gauge_update: null,
  global_summary: null,
  social_caption: null,
});

/** A fresh pass with an OpenAI model selected for river updates. */
const openAIPass = () => resolveConfiguredModels(row('gpt-6.1-terra')).river_update;

const quiet = () => {};

// ── The loop ────────────────────────────────────────────────────────────────

test('the selected model answers and the fallback is never asked', async () => {
  const asked: string[] = [];
  const value = await tryModels(openAIPass(), async ({ model }) => (asked.push(model.id), model.id), quiet);
  assert.equal(value, 'gpt-6.1-terra');
  assert.deepEqual(asked, ['gpt-6.1-terra']);
});

test('a failed call falls back, and the failure is reported under the model that was asked', async () => {
  const errors: string[] = [];
  const value = await tryModels(
    openAIPass(),
    async ({ model }) => {
      if (model.provider === 'openai') throw new Error('timeout');
      return model.id;
    },
    (model, error) => void errors.push(`${model.id}: ${(error as Error).message}`),
  );
  assert.equal(value, 'claude-sonnet-4-6');
  assert.deepEqual(errors, ['gpt-6.1-terra: timeout']);
});

test('an unusable answer falls back too, and the attempt is told whether another model waits', async () => {
  const seen: Array<[string, boolean]> = [];
  const value = await tryModels(
    openAIPass(),
    async ({ model, hasNext }) => {
      seen.push([model.id, hasNext]);
      // Refuse a poor answer only while there is someone else to ask.
      return hasNext ? null : model.id;
    },
    quiet,
  );
  assert.equal(value, 'claude-sonnet-4-6');
  assert.deepEqual(seen, [['gpt-6.1-terra', true], ['claude-sonnet-4-6', false]]);
});

test('when every model fails the result is null, not a throw', async () => {
  const errors: string[] = [];
  const value = await tryModels(
    openAIPass(),
    async () => {
      throw new Error('down');
    },
    (model) => void errors.push(model.id),
  );
  assert.equal(value, null);
  assert.deepEqual(errors, ['gpt-6.1-terra', 'claude-sonnet-4-6']);
});

test('a default with no fallback is asked once', async () => {
  const asked: string[] = [];
  const model = resolveConfiguredModels(null).river_update;
  assert.equal(await tryModels(model, async ({ model: m, hasNext }) => (asked.push(`${m.id}:${hasNext}`), null), quiet), null);
  assert.deepEqual(asked, ['claude-sonnet-4-6:false']);
});

// ── The cut-off ─────────────────────────────────────────────────────────────

test('a provider is dropped after consecutive failed calls, and a completed call resets the count', () => {
  const health = new PassHealth();
  for (let i = 1; i < TRIP_AFTER_FAILURES; i++) health.failed('openai');
  assert.equal(health.skips('openai'), false);
  health.succeeded('openai');
  // One short of the limit again: the earlier failures no longer count.
  for (let i = 1; i < TRIP_AFTER_FAILURES; i++) health.failed('openai');
  assert.equal(health.skips('openai'), false);
  health.failed('openai');
  assert.equal(health.skips('openai'), true);
  // The other provider is unaffected.
  assert.equal(health.skips('anthropic'), false);
  // And it stays dropped: nothing in a pass brings it back.
  health.succeeded('openai');
  assert.equal(health.skips('openai'), true);
});

test('an unusable answer is not an outage and never drops the provider', async () => {
  // Empty, cut off, or missing a block: the provider answered. Ten rivers of
  // poor answers cost ten fallbacks, and the eleventh is still asked.
  const model = openAIPass();
  for (let i = 0; i < 10; i++) {
    await tryModels(model, async ({ model: m }) => (m.provider === 'openai' ? null : m.id), quiet);
  }
  assert.equal(model.health?.skips('openai'), false);
});

test('a missing key drops the provider at once', async () => {
  const model = openAIPass();
  const asked: string[] = [];
  const call = async ({ model: m }: { model: ResolvedModel }) => {
    asked.push(m.id);
    if (m.provider === 'openai') throw new MissingApiKeyError('openai');
    return m.id;
  };
  assert.equal(await tryModels(model, call, quiet), 'claude-sonnet-4-6');
  assert.equal(await tryModels(model, call, quiet), 'claude-sonnet-4-6');
  // Asked once. It cannot fix itself mid-pass.
  assert.deepEqual(asked, ['gpt-6.1-terra', 'claude-sonnet-4-6', 'claude-sonnet-4-6']);
});

// ── A simulated outage ──────────────────────────────────────────────────────

/** The cron's own limiter: at most `limit` targets in flight. */
async function withConcurrency<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

test('an OpenAI outage costs a daily pass about one timeout, not one per river', async () => {
  // The daily pass: thirty-one targets, three at a time, five minutes. OpenAI
  // hangs, so every call to it runs to the adapter's timeout and throws. The
  // clock is simulated: what is measured is how many timeouts the pass waits
  // through, since each wave of calls waits together.
  const TARGETS = 31;
  const CONCURRENCY = 3;
  const TIMEOUT_S = 30;
  const CLAUDE_S = 6;
  const LIMIT_S = 300;

  const model = openAIPass();
  let openAICalls = 0;
  let written = 0;
  const writers = new Set<string>();
  // Each worker's own elapsed time; the pass ends when the slowest finishes.
  const elapsed = new Array<number>(CONCURRENCY).fill(0);
  let worker = 0;

  await withConcurrency(Array.from({ length: TARGETS }, (_, i) => i), CONCURRENCY, async () => {
    const lane = worker++ % CONCURRENCY;
    const value = await tryModels(
      model,
      async ({ model: m }) => {
        // Yield, so the calls in flight together really are in flight together.
        await new Promise((resolve) => setImmediate(resolve));
        if (m.provider === 'openai') {
          openAICalls++;
          elapsed[lane] += TIMEOUT_S;
          throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
        }
        elapsed[lane] += CLAUDE_S;
        return m.id;
      },
      quiet,
    );
    if (value) {
      written++;
      writers.add(value);
    }
  });

  // Every river is written, all by the code default.
  assert.equal(written, TARGETS);
  assert.deepEqual([...writers], ['claude-sonnet-4-6']);
  // Only the calls already in flight when the second failure landed.
  assert.ok(openAICalls <= TRIP_AFTER_FAILURES + CONCURRENCY - 1, `OpenAI was called ${openAICalls} times`);
  assert.equal(model.health?.skips('openai'), true);
  // And the pass finishes well inside its limit.
  const passSeconds = Math.max(...elapsed);
  assert.ok(passSeconds < LIMIT_S / 2, `the pass took ${passSeconds}s of ${LIMIT_S}s`);

  // The counterfactual this replaces: a timeout on every river.
  const withoutCutOff = (TARGETS / CONCURRENCY) * (TIMEOUT_S + CLAUDE_S);
  assert.ok(withoutCutOff > LIMIT_S, 'without the cut-off this pass would not finish');
});

test('one transient failure costs one fallback, and OpenAI keeps writing the rest', async () => {
  const model = openAIPass();
  const writers: string[] = [];
  for (let river = 0; river < 8; river++) {
    const value = await tryModels(
      model,
      async ({ model: m }) => {
        if (m.provider === 'openai' && river === 2) throw new Error('503');
        return m.id;
      },
      quiet,
    );
    if (value) writers.push(value);
  }
  assert.equal(writers.filter((id) => id === 'claude-sonnet-4-6').length, 1);
  assert.equal(writers.filter((id) => id === 'gpt-6.1-terra').length, 7);
  assert.equal(model.health?.skips('openai'), false);
});

test('the next pass tries the provider again', async () => {
  const first = openAIPass();
  first.health?.failed('openai');
  first.health?.failed('openai');
  assert.equal(first.health?.skips('openai'), true);
  assert.equal(await tryModels(openAIPass(), async ({ model }) => model.id, quiet), 'gpt-6.1-terra');
});
