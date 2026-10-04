export interface ChartSelection {
  time: number;
  kind: 'observed' | 'forecast';
}

/** Match the chart scale's 4pt inset on each side. A touch is translated once;
 * selection thereafter belongs to a reading, never to the old viewport. */
export function chartTimeAtX(x: number, left: number, width: number, start: number, end: number): number | null {
  if (width <= 8 || ![x, left, width, start, end].every(Number.isFinite)) return null;
  return start + Math.max(0, Math.min(1, (x - left - 4) / (width - 8))) * (end - start);
}

/** Controls are measured at the user's actual text size. Very large text can
 * scroll instead of collapsing the graph to nothing in landscape. */
export function expandedChartHeight(available: number, controls: number, actions: number, fontScale: number): number {
  return Math.max(160 * Math.max(1, fontScale), available - controls - actions - 12);
}
