/** Browser-compatible deadline; parent cancellation remains distinct from timeout. */
export async function withCampingTimeout<T>(
  load: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) {
    throw parent.reason ?? new DOMException('Cancelled', 'AbortError');
  }
  parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), milliseconds);
  try {
    // Include reading the response body in the deadline, not just its headers.
    return await load(controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
