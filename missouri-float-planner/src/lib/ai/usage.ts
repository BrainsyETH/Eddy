// src/lib/ai/usage.ts
// One token-accounting shape for every provider.
//
// ── Why this is not just a rename of the provider's usage block ────────────
//
// The two providers count the same call differently. Anthropic's input_tokens
// EXCLUDES cache reads and cache writes; they are separate fields that add to
// it. OpenAI's input_tokens INCLUDES both, with the cached parts broken out
// underneath. Stored as returned, an OpenAI row would count its cached prefix
// twice in every cost estimate, once at the full rate and once at the cached
// one, and the estimate would be wrong in the direction that hides a saving.
//
// So everything downstream of this file (the eddy_updates and
// eddy_generation_log token columns, the telemetry counters, pricing.ts) holds
// Anthropic's convention: four disjoint buckets that sum to what was billed.
//
// SDK-free on purpose, so the arithmetic is unit-testable.

/**
 * Token/cost accounting for a single model call, persisted alongside the update
 * so spend and prompt-cache hit rates are queryable. Fields are nullable to
 * tolerate SDK responses that omit a usage block.
 */
export interface UsageStats {
  modelUsed: string;
  /** Uncached input only. Never includes the two cache buckets below. */
  inputTokens: number | null;
  /** Everything billed as output, which for OpenAI includes reasoning tokens. */
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
}

/** The four disjoint buckets, as telemetry counts them. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Anthropic's `usage` block, as far as this repo reads it. */
export interface AnthropicUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** OpenAI's Responses API `usage` block, as far as this repo reads it. */
export interface OpenAIUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_tokens_details?: {
    cached_tokens?: number | null;
    cache_write_tokens?: number | null;
  } | null;
  output_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/** Extracts a UsageStats from a Claude message's `usage` block. */
export function extractUsage(modelUsed: string, usage: AnthropicUsage | null | undefined): UsageStats {
  return {
    modelUsed,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    cacheReadTokens: usage?.cache_read_input_tokens ?? null,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? null,
  };
}

/**
 * The four buckets from an OpenAI usage block. Uncached input is what is left
 * of input_tokens once the cached read and the cache write are taken out, and
 * is floored at zero so a response that breaks that identity cannot produce a
 * negative count.
 */
export function openAITokenCounts(usage: OpenAIUsage): TokenCounts {
  const cacheRead = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = usage.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    input: Math.max(0, (usage.input_tokens ?? 0) - cacheRead - cacheWrite),
    output: usage.output_tokens ?? 0,
    cacheRead,
    cacheWrite,
  };
}

/** Extracts a UsageStats from an OpenAI response's `usage` block. */
export function extractOpenAIUsage(modelUsed: string, usage: OpenAIUsage | null | undefined): UsageStats {
  if (!usage) {
    return { modelUsed, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null };
  }
  const counts = openAITokenCounts(usage);
  return {
    modelUsed,
    inputTokens: counts.input,
    outputTokens: counts.output,
    cacheReadTokens: counts.cacheRead,
    cacheCreationTokens: counts.cacheWrite,
  };
}

/**
 * Reasoning tokens inside an OpenAI response's output count, or null when the
 * response does not say. Already included in outputTokens; reported separately
 * because it is the part of a budget the reader never sees.
 */
export function openAIReasoningTokens(usage: OpenAIUsage | null | undefined): number | null {
  return usage?.output_tokens_details?.reasoning_tokens ?? null;
}
