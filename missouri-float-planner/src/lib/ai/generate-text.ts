// src/lib/ai/generate-text.ts
// One system prompt and one user message in, text out, on whichever provider
// the resolved model belongs to.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// A generator that builds its own Anthropic request can only ever call
// Anthropic. This is the one place that knows how each provider wants the same
// call phrased, so a workload becomes switchable across providers by calling
// this instead, and the request parameters the registry worked out (thinking,
// reasoning effort, the cache marker, the output cap) are applied in one place
// rather than re-derived at each call site.
//
// ── What it deliberately does not do ───────────────────────────────────────
//
// Fall back. It calls exactly the model it is handed and throws when that
// fails. Whether a failure should be retried on another model is the caller's
// decision (resolve-models.ts explains when), and the admin test panel needs
// the opposite: a failure reported as a failure.
//
// Clean the text. `text` is the model's output exactly as returned, because
// the generation log records it as evidence.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { trackedAnthropic, trackedOpenAI } from '@/lib/telemetry/upstream';
import { PROVIDERS, type Provider } from '@/lib/ai/model-registry';
import type { ResolvedModel } from '@/lib/ai/resolve-models';
import { extractOpenAIUsage, extractUsage, openAIReasoningTokens, type UsageStats } from '@/lib/ai/usage';

/** The provider's API key is not in the environment. Nothing was sent. */
export class MissingApiKeyError extends Error {
  readonly provider: Provider;
  constructor(provider: Provider) {
    super(`${PROVIDERS[provider].envVar} not configured`);
    this.name = 'MissingApiKeyError';
    this.provider = provider;
  }
}

export interface TextRequest {
  /** Telemetry operation name: the workload, or `model_test` from the admin panel. */
  feature: string;
  model: Pick<ResolvedModel, 'id' | 'provider' | 'maxTokens' | 'thinking' | 'reasoningEffort' | 'cacheSystemPrompt'>;
  system: string;
  user: string;
}

export interface TextResult {
  /** The model's text exactly as returned, or null when it returned none. */
  text: string | null;
  /**
   * Why the model stopped, in the provider's own words: Anthropic's
   * stop_reason, or for OpenAI `completed` or the reason it was incomplete
   * (`max_output_tokens` is the one that matters: the cap was spent, possibly
   * on reasoning, before the answer finished).
   */
  stopReason: string | null;
  usage: UsageStats;
  /** OpenAI only: reasoning tokens inside usage.outputTokens. Null when not reported. */
  reasoningTokens: number | null;
}

/**
 * A stalled OpenAI call must not hold a cron slot until the function is
 * killed, because the fallback to the code default only runs if this one
 * gives up first. The SDK's own default is ten minutes with two retries.
 */
const OPENAI_TIMEOUT_MS = 60_000;
const OPENAI_MAX_RETRIES = 1;

/** True when the provider's key is present. The admin UI reports this; it never sees the key. */
export function providerConfigured(provider: Provider): boolean {
  return Boolean(process.env[PROVIDERS[provider].envVar]);
}

export async function generateText(request: TextRequest): Promise<TextResult> {
  const { model } = request;
  const apiKey = process.env[PROVIDERS[model.provider].envVar];
  if (!apiKey) throw new MissingApiKeyError(model.provider);
  return model.provider === 'openai' ? callOpenAI(request, apiKey) : callAnthropic(request, apiKey);
}

async function callAnthropic({ feature, model, system, user }: TextRequest, apiKey: string): Promise<TextResult> {
  const client = new Anthropic({ apiKey });
  const message = await trackedAnthropic(feature, model.id, () => client.messages.create({
    model: model.id,
    max_tokens: model.maxTokens,
    // Omitted entirely unless the model needs it. Sonnet 5 thinks by default
    // and would spend max_tokens doing it; Sonnet 4.6 does not.
    ...(model.thinking ? { thinking: model.thinking } : {}),
    messages: [{ role: 'user', content: user }],
    // A marker on a prompt shorter than the model's cache floor is silently a
    // no-op, so the resolver decides per pairing whether to attach one.
    system: model.cacheSystemPrompt
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system,
  }));

  const textBlock = message.content.find((block) => block.type === 'text');
  return {
    text: textBlock?.text ?? null,
    stopReason: message.stop_reason ?? null,
    usage: extractUsage(model.id, message.usage),
    reasoningTokens: null,
  };
}

async function callOpenAI({ feature, model, system, user }: TextRequest, apiKey: string): Promise<TextResult> {
  if (!model.reasoningEffort) {
    // The registry types make this unreachable. Checked anyway because the
    // alternative is a request that reasons at `medium` inside a cap sized for
    // none, which returns no text and bills for the reasoning.
    throw new Error(`${model.id} has no reasoning effort configured`);
  }
  const client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });
  const response = await trackedOpenAI(feature, model.id, () => client.responses.create({
    model: model.id,
    // `instructions` leads the prompt, so the static system prompt is the
    // prefix OpenAI's automatic cache matches on.
    instructions: system,
    input: user,
    // Covers reasoning tokens and visible text together.
    max_output_tokens: model.maxTokens,
    reasoning: { effort: model.reasoningEffort },
    // The Responses API keeps each response for later retrieval unless told
    // not to. Nothing here retrieves one.
    store: false,
  }));

  return {
    text: response.output_text || null,
    stopReason: response.incomplete_details?.reason ?? response.status ?? null,
    usage: extractOpenAIUsage(model.id, response.usage),
    reasoningTokens: openAIReasoningTokens(response.usage),
  };
}
