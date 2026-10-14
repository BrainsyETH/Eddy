export interface ChartWindow { start: number; end: number }

/** Geometry for value-axis fitting only, never readings for scrubbing/export.
 * Each series is a continuous plotted segment. Include its intersections with
 * the window edges so a line crossing the viewport is not vertically clipped,
 * without pulling in offscreen peaks or bridging telemetry gaps. */
export function visibleChartGeometry(
  series: readonly (readonly { t: number; v: number }[])[],
  window: ChartWindow,
): { t: number; v: number }[] {
  if (![window.start, window.end].every(Number.isFinite) || window.end <= window.start) return [];
  const visible: { t: number; v: number }[] = [];
  for (const segment of series) {
    for (let i = 0; i < segment.length; i++) {
      const point = segment[i];
      if (!Number.isFinite(point.t) || !Number.isFinite(point.v)) continue;
      if (point.t >= window.start && point.t <= window.end) visible.push({ t: point.t, v: point.v });
      const previous = segment[i - 1];
      if (!previous || !Number.isFinite(previous.t) || !Number.isFinite(previous.v) || previous.t >= point.t) continue;
      for (const t of [window.start, window.end]) {
        if (previous.t < t && point.t > t) {
          const fraction = (t - previous.t) / (point.t - previous.t);
          visible.push({ t, v: previous.v + (point.v - previous.v) * fraction });
        }
      }
    }
  }
  return visible.sort((a, b) => a.t - b.t);
}

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
