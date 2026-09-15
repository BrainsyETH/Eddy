/** Cancels superseded work and rejects late answers even when a transport ignores abort. */
export function createLatestRequest() {
  let current: AbortController | null = null;
  return {
    start() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller && !controller.signal.aborted,
      };
    },
    invalidate() {
      current?.abort();
      current = null;
    },
  };
}
