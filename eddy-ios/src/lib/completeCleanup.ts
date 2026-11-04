export class CleanupError extends Error {
  constructor(readonly errors: unknown[]) {
    super('Some saved data could not be removed from this device.');
    this.name = 'CleanupError';
  }
}

/** Preserve cleanup order, attempt every step, and let the caller retry failures. */
export async function completeCleanup(steps: readonly (() => unknown | Promise<unknown>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try { await step(); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new CleanupError(errors);
}
