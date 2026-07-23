/** Structured Eddy commentary shared by generation, APIs, and the river report. */
export interface EddyTakeSections {
  bottomLine: string;
  eddyRead: string;
  watchFor: string;
}

/** JSONB is untyped at runtime, so validate every stored value before exposing it. */
export function parseEddyTakeSections(value: unknown): EddyTakeSections | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const bottomLine = typeof candidate.bottomLine === 'string' ? candidate.bottomLine.trim() : '';
  const eddyRead = typeof candidate.eddyRead === 'string' ? candidate.eddyRead.trim() : '';
  const watchFor = typeof candidate.watchFor === 'string' ? candidate.watchFor.trim() : '';
  return bottomLine && eddyRead && watchFor ? { bottomLine, eddyRead, watchFor } : null;
}
