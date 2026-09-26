// USD per million tokens, standard direct API, verified 2026-09-26:
// https://platform.claude.com/docs/en/about-claude/pricing
// Versioned separately from the model allowlist so historic estimates retain a named basis.

import { MODELS } from '@/lib/ai/model-registry';
import type { UsageRow } from './model';
export const PRICE_VERSION = '2026-09-26-standard';
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};
export function estimatedCost(row: UsageRow): number | null {
  const p = MODELS[row.model] && PRICES[row.model];
  if (!p) return null;
  // Current Eddy call sites use the default five-minute ephemeral cache.
  // Region modifiers, provider discounts, retries without usage, and unrecorded calls are excluded.
  return (
    (row.input_tokens * p.input +
      row.output_tokens * p.output +
      row.cache_read_tokens * p.input * 0.1 +
      row.cache_write_tokens * p.input * 1.25) /
    1e6
  );
}
