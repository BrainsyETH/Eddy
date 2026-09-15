/** Order local writes and deletion; a slow earlier save must never restore deleted data. */
export function createStorageQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const pending = tail.then(operation);
      tail = pending.catch(() => {});
      return pending;
    },
  };
}
