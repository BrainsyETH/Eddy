import { AsyncLocalStorage } from 'node:async_hooks';
import { after } from 'next/server';
import { recordBatch } from './redis';
import type { Observation } from './model';
export const observationContext = new AsyncLocalStorage<{
  events: Array<{ event: Observation; rate: number }>;
  dropped: number;
}>();
/** Isolated per cron invocation, never a process-global queue. Flushes only recorded events. */
export async function withTelemetryBuffer<T>(
  run: () => Promise<T>,
): Promise<T> {
  return observationContext.run({ events: [], dropped: 0 }, async () => {
    try {
      return await run();
    } finally {
      const { events, dropped } = observationContext.getStore()!;
      if (events.length)
        try {
          after(async () => {
            for (let i = 0; i < events.length; i += 50)
              await recordBatch(
                events.slice(i, i + 50),
                i + 50 >= events.length ? dropped : 0,
              );
          });
        } catch {
          /* No request lifetime: do not start detached work. */
        }
    }
  });
}
