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
