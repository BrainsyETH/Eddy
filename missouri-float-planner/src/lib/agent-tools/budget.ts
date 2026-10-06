/** Stop waiting AND signal the underlying HTTP/database reads to stop. */
export function searchBudget(milliseconds: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const signal = parent
    ? AbortSignal.any([parent, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () => controller.abort(new Error('Search deadline reached')),
    milliseconds,
  );
  return { signal, dispose: () => clearTimeout(timer) };
}

export function abortable<T>(
  work: PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return Promise.resolve(work);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Request cancelled'));
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    // Attach rejection handling even if cancellation happened before this call.
    Promise.resolve(work).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) {
      cleanup();
      abort();
    }
  });
}
