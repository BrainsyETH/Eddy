/** Bound an optional source even when its shared reader cannot be cancelled. */
export async function withinBudget<T>(work: PromiseLike<T>, milliseconds: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work).catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), milliseconds); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
