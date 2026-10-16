import type { StartFix } from './floatStart';

/** Serialize lookups, cancel superseded fixes, and ignore late native/cache answers. */
export function createGpsRiverLookup(lookup: (fix: StartFix, signal: AbortSignal) => Promise<string | null>) {
  let current: AbortController | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run(fix: StartFix) {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const result = tail.then(async () => {
        if (controller.signal.aborted) return null;
        const slug = await lookup(fix, controller.signal);
        return controller.signal.aborted ? null : slug;
      });
      tail = result.catch(() => {});
      return result;
    },
    cancel() { current?.abort(); },
  };
}
