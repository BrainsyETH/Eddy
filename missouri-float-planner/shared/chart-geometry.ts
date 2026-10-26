import { chartSegments, niceValueTicks, timeTicks, type ChartPoint } from './chart-model';
import type { chartView } from './chart-view';

/** Pure geometry: no browser, canvas, native dependency or chart library. */
export function chartGeometry(
  view: ReturnType<typeof chartView>,
  unit: 'ft' | 'cfs',
  width: number,
  height: number,
) {
  const domain = view.domain;
  if (!domain) return null;
  const x = (t: number) => ((t - domain.t0) / (domain.t1 - domain.t0 || 1)) * width;
  const y = (v: number) => height - ((v - domain.min) / (domain.max - domain.min || 1)) * height;
  const path = (rows: readonly { t: number; v: number }[]) =>
    rows.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const series = (points: ChartPoint[]) => {
    const s = chartSegments(points);
    return { paths: s.lines.map(path), dots: s.isolated.map((p) => ({ x: x(p.t), y: y(p.v) })) };
  };
  const band = view.typical.filter((r) => r.low !== null && r.high !== null);
  const area =
    band.length > 1
      ? path(band.map((r) => ({ t: r.t, v: r.high! }))) +
        [...band]
          .reverse()
          .map((r) => ` L${x(r.t).toFixed(2)},${y(r.low!).toFixed(2)}`)
          .join('') +
        ' Z'
      : '';
  return {
    x,
    y,
    observed: series(view.observed),
    forecast: series(view.forecast),
    prior: series(view.prior),
    area,
    median: view.typical.length > 1 ? path(view.typical.map((r) => ({ t: r.t, v: r.median }))) : '',
    xTicks: timeTicks(domain.t0, domain.t1, 4),
    yTicks: niceValueTicks(domain.min, domain.max, 4, 5, unit === 'cfs' ? { minStep: 1 } : {}),
  };
}
