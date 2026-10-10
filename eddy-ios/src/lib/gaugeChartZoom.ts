export interface ChartWindow { start: number; end: number }

/** Keep the initial time under the moving pinch focal point, bounded to data. */
export function pinchChartWindow(full: ChartWindow, initial: ChartWindow, anchor: number, scale: number, fraction: number): ChartWindow | null {
  if (![full.start, full.end, initial.start, initial.end, anchor, scale, fraction].every(Number.isFinite) || scale <= 0) return null;
  const fullSpan = full.end - full.start;
  if (fullSpan <= 0 || initial.end <= initial.start) return null;
  const span = Math.max(fullSpan / 20, Math.min(fullSpan, (initial.end - initial.start) / scale));
  const start = Math.max(full.start, Math.min(full.end - span, anchor - Math.max(0, Math.min(1, fraction)) * span));
  return { start, end: start + span };
}
