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

/** Compare layers and draft date fields do not identify the loaded request. */
export function chartZoomKey(siteId: string | null, unit: 'ft' | 'cfs', days: number,
  selected: { from: string; to: string } | undefined,
  loaded: { from: string; to: string } | null | undefined, loadedDays: number): string {
  return JSON.stringify([siteId, unit, days, selected?.from, selected?.to, loaded?.from, loaded?.to, loadedDays]);
}

/** VoiceOver must only visit readings that can be drawn in the viewport. */
export function visibleChartTimes(times: number[], window: ChartWindow | null): number[] {
  if (!window) return [];
  return [...new Set(times.filter(time => Number.isFinite(time) && time >= window.start && time <= window.end))].sort((a, b) => a - b);
}
