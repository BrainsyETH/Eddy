// src/lib/ai/attempts.ts
// The one loop every generator runs: ask the resolved model, and if it yields
// nothing usable, ask its fallback.
//
// It lives here rather than in each generator because the policy has three
// parts that have to agree, and four copies would not: which models to try and
// in what order (resolve-models.ts), when to stop trying a provider for the
// rest of the pass (pass-health.ts), and what counts as a failed call versus an
// unusable answer. The generator supplies only what is specific to it: how to
// call, what it accepts, and what it records.
//
// SDK-free, so the outage behaviour can be simulated in a test.

import { MissingApiKeyError } from '@/lib/ai/errors';
import { modelAttempts, type ResolvedModel } from '@/lib/ai/resolve-models';

export interface Attempt {
  /** The model to ask this time. */
  model: ResolvedModel;
  /**
   * Whether another model will be asked if this one yields nothing. An answer
   * that is poor but publishable should be refused when this is true and may
   * be the best available when it is false.
   */
  hasNext: boolean;
}

/**
 * Runs `attempt` for each model in turn and returns the first value it
 * accepts, or null when every model failed.
 *
 * `attempt` returns the accepted value, or null to say this model's answer was
 * not usable (and that it has recorded why). A throw means the call itself
 * failed; it is passed to `onError` and counted against the provider.
 */
export async function tryModels<T>(
  model: ResolvedModel,
  attempt: (attempt: Attempt) => Promise<T | null>,
  onError: (model: ResolvedModel, error: unknown) => Promise<void> | void,
): Promise<T | null> {
  const attempts = modelAttempts(model);
  for (let i = 0; i < attempts.length; i++) {
    const current = attempts[i];
    try {
      const value = await attempt({ model: current, hasNext: i < attempts.length - 1 });
      // The call completed. An unusable answer is not an outage.
      model.health?.succeeded(current.provider);
      if (value !== null) return value;
    } catch (error) {
      if (error instanceof MissingApiKeyError) model.health?.unavailable(current.provider);
      else model.health?.failed(current.provider);
      await onError(current, error);
    }
  }
  return null;
}
