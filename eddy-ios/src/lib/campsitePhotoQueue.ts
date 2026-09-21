/** Optional photos get at most three network slots, independent of core reads. */
export function createCampsitePhotoQueue(limit = 3) {
  let active = 0;
  const pending: (() => void)[] = [];
  const drain = () => { while (active < limit && pending.length) pending.shift()!(); };
  return <T>(load: () => Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    let started = false;
    const abort = () => {
      if (started) return; // The request receives the same signal and cancels itself.
      const index = pending.indexOf(start);
      if (index >= 0) pending.splice(index, 1);
      signal.removeEventListener('abort', abort);
      reject(Object.assign(new Error('Photo request cancelled'), { name: 'AbortError' }));
    };
    const start = () => {
      started = true;
      signal.removeEventListener('abort', abort);
      active++;
      void Promise.resolve().then(load).then(resolve, reject).finally(() => { active--; drain(); });
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    pending.push(start);
    drain();
  });
}

export const queueCampsitePhoto = createCampsitePhotoQueue();
