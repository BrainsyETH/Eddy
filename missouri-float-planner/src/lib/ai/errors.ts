// src/lib/ai/errors.ts
// Errors the provider adapter raises, kept free of the provider SDKs so the
// code that reacts to them (src/lib/ai/attempts.ts) can be tested without one.

import { PROVIDERS, type Provider } from '@/lib/ai/model-registry';

/** The provider's API key is not in the environment. Nothing was sent. */
export class MissingApiKeyError extends Error {
  readonly provider: Provider;
  constructor(provider: Provider) {
    super(`${PROVIDERS[provider].envVar} not configured`);
    this.name = 'MissingApiKeyError';
    this.provider = provider;
  }
}
