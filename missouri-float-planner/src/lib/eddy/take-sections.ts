/** Structured Eddy commentary shared by generation, APIs, and the river report. */
export interface EddyTakeSections {
  bottomLine: string;
  why: string;
  watchFor: string;
}

/** JSONB is untyped at runtime, so validate every stored value before exposing it. */
export function parseEddyTakeSections(value: unknown): EddyTakeSections | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const bottomLine = typeof candidate.bottomLine === 'string' ? candidate.bottomLine.trim() : '';
  const why = typeof candidate.why === 'string' ? candidate.why.trim() : '';
  const watchFor = typeof candidate.watchFor === 'string' ? candidate.watchFor.trim() : '';
  return bottomLine && why && watchFor ? { bottomLine, why, watchFor } : null;
}
