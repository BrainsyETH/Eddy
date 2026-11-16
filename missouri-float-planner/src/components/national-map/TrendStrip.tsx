'use client';

// The national flooding trend: how many NWS forecast points were in minor,
// moderate or major flood, hour by hour, over the recorded last 24 h — the
// "is it getting worse?" answer the map alone cannot give. Counted from the
// recorded frames with the map's own rules (src/lib/national-map/trend.ts).
//
// A capture whose NOAA read failed is drawn as a gap (a short tick on the
// baseline), never as a zero bar. Action stage is not flooding and is not
// stacked. With fewer than two points the strip says the trend is building.

import type { ReactNode } from 'react';
import { trendFlooding, type TrendPoint } from '@/lib/national-map/trend';
import type { MapPalette } from '@/lib/national-map/theme';
import { formatTime } from './Legend';
import styles from './national-map.module.css';

const nf = new Intl.NumberFormat('en-US');
const HOUR = 3_600_000;

export function TrendStrip({ points, palette, wall }: { points: TrendPoint[] | null; palette: MapPalette; wall: boolean }) {
  if (points === null) return null;
  if (points.length < 2) {
    return (
      <TrendFrame wall={wall}>
        <p className={styles.trendTitle}>Gauges in flood</p>
        <p className={styles.wallStoryFine}>The trend builds as history is recorded.</p>
      </TrendFrame>
    );
  }
  const newest = points[points.length - 1];
  const end = newest.t;
  const W = 240;
  const H = 60;
  const slot = W / 24;
  const bar = slot * 0.72;
  const max = Math.max(1, ...points.filter((p) => p.ok).map(trendFlooding));
  const y = (v: number) => (v / max) * (H - 2);
  const okPoints = points.filter((p) => p.ok);
  const first = okPoints[0];
  const last = okPoints[okPoints.length - 1];
  const gaps = points.length - okPoints.length;
  const label = first && last
    ? `Gauges in flood over the last 24 hours: ${nf.format(trendFlooding(first))} at ${formatTime(first.t)}, ` +
      `${nf.format(trendFlooding(last))} at ${formatTime(last.t)}` +
      (gaps ? `; ${gaps} hour${gaps === 1 ? '' : 's'} without a NOAA reading.` : '.')
    : 'Gauges in flood over the last 24 hours: NOAA could not be read.';
  return (
    <TrendFrame wall={wall}>
      <p className={styles.trendTitle}>
        <span>Gauges in flood</span>
        {newest.ok && <span className={styles.trendNow}>{nf.format(trendFlooding(newest))} now</span>}
      </p>
      <figure className={styles.trendChart}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={palette.flood.below} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {points.map((p) => {
            // Slot by hours back from the newest capture, so the newest bar sits at the right edge.
            const i = 23 - Math.min(23, Math.max(0, Math.round((end - p.t) / HOUR)));
            const x = i * slot + (slot - bar) / 2;
            if (!p.ok) {
              return <rect key={p.t} x={x} y={H - 3} width={bar} height={3} fill={palette.flood.notCurrent} opacity={0.6} />;
            }
            let base = H;
            return (['minor', 'moderate', 'major'] as const).map((k) => {
              const h = y(p[k]);
              if (h <= 0) return null;
              base -= h;
              return <rect key={`${p.t}${k}`} x={x} y={base} width={bar} height={h} fill={palette.flood[k]} />;
            });
          })}
        </svg>
        <figcaption>
          <span>24 h ago</span>
          <span>now</span>
        </figcaption>
      </figure>
      {gaps > 0 && <p className={styles.wallStoryFine}>Gaps: hours NOAA could not be read.</p>}
    </TrendFrame>
  );
}

function TrendFrame({ wall, children }: { wall: boolean; children: ReactNode }) {
  return wall ? (
    <section className={styles.wallStory} aria-label="Flooding trend">
      {children}
    </section>
  ) : (
    <div className={styles.trendExplore}>{children}</div>
  );
}
