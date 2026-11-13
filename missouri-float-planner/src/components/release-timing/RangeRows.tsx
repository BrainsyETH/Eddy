'use client';

// One row per group of releases: every release as a dot, the middle 8 in 10 as
// a bar, the typical value as a tick with its number beside it. Shared by the
// two findings charts so they read the same way.

import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { hoursText } from '@/lib/release-timing/findings';
import styles from './release-timing.module.css';

export interface RangeRow {
  label: string;
  n: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  values: number[];
}

const FROM_HOURS = 5;
const TO_HOURS = 20;
const ROW = 56;
const TOP = 6;
const BOTTOM = 44;

export default function RangeRows({
  rows,
  label,
  emphasis,
  onPick,
}: {
  rows: RangeRow[];
  /** What the chart shows, for screen readers. */
  label: string;
  /** The row drawn in the accent colour. */
  emphasis: number | null;
  onPick?: (index: number) => void;
}) {
  const [frame, W] = useMeasuredWidth<HTMLDivElement>(720);
  const narrow = W < 520;
  const left = 8;
  const right = narrow ? 52 : 64;
  const H = TOP + rows.length * ROW + BOTTOM;
  const x = (hours: number) => left + ((Math.max(FROM_HOURS, Math.min(TO_HOURS, hours)) - FROM_HOURS) / (TO_HOURS - FROM_HOURS)) * (W - left - right);
  const grid = [6, 8, 10, 12, 14, 16, 18, 20];

  return (
    <div ref={frame} className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {grid.map((hours) => (
          <g key={hours}>
            <line x1={x(hours)} x2={x(hours)} y1={TOP} y2={H - BOTTOM} stroke="var(--rt-grid)" />
            <text x={x(hours)} y={H - BOTTOM + 18} textAnchor="middle">{hours}</text>
          </g>
        ))}
        <text x={left} y={H - 6}>{narrow ? 'Hours from release to first rise near Norfork' : 'Hours from the release rising to the river coming up near Norfork'}</text>
        {rows.map((row, i) => {
          const y = TOP + i * ROW;
          const mid = y + ROW - 20;
          const on = i === emphasis;
          const stroke = on ? 'var(--rt-emph)' : 'var(--rt-series)';
          return (
            <g key={row.label} className={onPick ? styles.pick : undefined} onClick={onPick ? () => onPick(i) : undefined}>
              <title>{`${row.label}: typically ${hoursText(row.median)} hours. 8 in 10 took ${hoursText(row.p10)} to ${hoursText(row.p90)}. Earliest ${hoursText(row.min)}. ${row.n.toLocaleString('en-US')} releases.`}</title>
              <rect x={0} y={y} width={W} height={ROW} fill="transparent" />
              <text x={left} y={y + 18} className={styles.rowLabel}>{row.label}</text>
              {!narrow && <text x={W} y={y + 18} textAnchor="end">{row.n.toLocaleString('en-US')} releases</text>}
              {row.values.map((value, k) => (
                <circle key={k} cx={x(value)} cy={mid + (((k * 7919) % 11) - 5) * 1.1} r={2.4} fill={stroke} opacity={0.32} />
              ))}
              <rect x={x(row.p10)} y={mid - 5} width={Math.max(x(row.p90) - x(row.p10), 3)} height={10} rx={5} fill={on ? 'var(--rt-emph-soft)' : 'var(--rt-series-soft)'} opacity={0.9} />
              <rect x={x(row.median) - 2.5} y={mid - 11} width={5} height={22} rx={2.5} fill={stroke} stroke="var(--color-surface)" strokeWidth={1.5} />
              <text x={x(row.p90) + 10} y={mid + 5} className={styles.rowValue}>{hoursText(row.median)} h</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
