import type { StartFix } from './floatStart';

/** Serialize lookups, cancel superseded fixes, and ignore late native/cache answers. */
export function createGpsRiverLookup(lookup: (fix: StartFix, signal: AbortSignal) => Promise<string | null>) {
  let current: AbortController | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  let stopped = false;
  return {
    run(fix: StartFix) {
      if (stopped) return Promise.resolve(null);
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const result = tail.then(async () => {
        if (controller.signal.aborted || stopped) return null;
        const slug = await lookup(fix, controller.signal);
        if (controller.signal.aborted || stopped) return null;
        // The first accepted match belongs to the draft for the rest of this visit.
        if (slug) stopped = true;
        return slug;
      });
      tail = result.catch(() => {});
      return result;
    },
    cancel() { current?.abort(); },
    stop() { stopped = true; current?.abort(); },
  };
}
