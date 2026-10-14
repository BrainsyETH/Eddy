// eddy-ios/src/lib/serialQueue.ts
// Run async operations one at a time, in the order they were requested.
//
// Background tracking needs this because its start and stop are both several
// native awaits long. Without ordering, a float ended while tracking was still
// starting ran stop first — which found nothing started and did nothing — and
// then the start completed, leaving GPS running after End until the task's
// first delivery noticed. Queued, the stop runs after the start and undoes it.
//
// A failed operation does not block the ones behind it. Pure, so the web test
// runner covers it.

export type SerialQueue = <T>(operation: () => Promise<T>) => Promise<T>;

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.catch(() => undefined);
    return next;
  };
}
