// USD per million tokens, standard direct API.
//
// Anthropic rows verified 2026-09-26 and unchanged since:
// https://platform.claude.com/docs/en/about-claude/pricing
// OpenAI rows verified 2026-11-17, standard tier, prompts under 272K tokens:
// https://developers.openai.com/api/docs/pricing
//
// Versioned separately from the model allowlist so historic estimates retain a named basis.
//
// Every model carries its own cache rates because they are not one rule. An
// Anthropic cache read is a tenth of input and a write is 1.25x; OpenAI's
// GPT-6 cache read is a twentieth to a tenth of input and its write is 1.25x.
// A single multiplier applied to both would misprice whichever provider it was
// not written for.

import { MODELS } from '@/lib/ai/model-registry';
import type { UsageRow } from './model';
export const PRICE_VERSION = '2026-11-17-standard';

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Anthropic's published cache multipliers on the default five-minute cache. */
const anthropic = (input: number, output: number): Price => ({
  input,
  output,
  cacheRead: input * 0.1,
  cacheWrite: input * 1.25,
});

const PRICES: Record<string, Price> = {
  'claude-sonnet-4-6': anthropic(3, 15),
  'claude-sonnet-5': anthropic(2, 10),
  'claude-haiku-4-5-20251001': anthropic(1, 5),
  // Cache writes at the default 30-minute lifetime, the only one Eddy requests.
  'gpt-6.2-sol': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'gpt-6.1-terra': { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25 },
  'gpt-6-luna': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Just the token counts a price applies to. */
export type PricedTokens = Pick<
  UsageRow,
  'model' | 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_write_tokens'
>;

/**
 * List-price estimate for recorded tokens, or null for a model with no price
 * here. The four counts are disjoint: input_tokens excludes both cache buckets
 * for every provider (src/lib/ai/usage.ts normalises OpenAI's to match).
 *
 * This is what the tokens would cost at list price. It does not know about a
 * prepaid credit balance, so usage paid from one still shows a dollar figure.
 */
export function estimatedCost(row: PricedTokens): number | null {
  const p = MODELS[row.model] && PRICES[row.model];
  if (!p) return null;
  // Region modifiers, provider discounts, retries without usage, and unrecorded calls are excluded.
  return (
    (row.input_tokens * p.input +
      row.output_tokens * p.output +
      row.cache_read_tokens * p.cacheRead +
      row.cache_write_tokens * p.cacheWrite) /
    1e6
  );
}
