import { observationContext } from './buffer';
import { after } from 'next/server';
import { makeTrackedFetch, measure } from './core';
import { recordBatch, telemetryConfig } from './redis';
import type { Observation } from './model';
import { noteUsgsQuota } from './usgs-quota';
/** Request-lifetime scheduling. No raw URLs, query strings, arguments, or bodies leave the caller. */
export function recordObservation(event: Observation): void {
  const config = telemetryConfig();
  if (!config.enabled) return;
  const buffer = observationContext.getStore();
  const rate =
    buffer ||
    event.provider === 'anthropic' ||
    ['4xx', '5xx', '429', 'network', 'timeout'].includes(event.outcome)
      ? 1
      : config.sampleRate;
  if (rate <= 0 || Math.random() >= rate) return;
  if (buffer) {
    if (buffer.events.length < 2000) buffer.events.push({ event, rate });
    else buffer.dropped++;
    return;
  }
  try {
    after(() => recordBatch([{ event, rate }]));
  } catch {
    /* CLI scripts have no request lifetime; excluded from coverage. */
  }
}
const observedFetch = makeTrackedFetch(recordObservation);
/** Every provider fetch. USGS responses also report their rate allowance. */
export const trackedFetch: typeof observedFetch = async (provider, operation, input, init) => {
  const response = await observedFetch(provider, operation, input, init);
  if (provider === 'usgs') noteUsgsQuota(response);
  return response;
};
export function trackedAnthropic<T>(
  feature: string,
  model: string,
  run: () => PromiseLike<T>,
): Promise<T> {
  return measure('anthropic', feature, model, run, recordObservation);
}
export function trackedMcp<T>(
  tool: string,
  run: () => PromiseLike<T>,
): Promise<T> {
  return measure('mcp', tool, undefined, run, recordObservation);
}
