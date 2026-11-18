'use client';

// One row per group of releases: every release as a dot, the 10th–90th percentiles as
// a bar, the typical value as a tick with its value in the row heading. Shared by the
// two findings charts so they read the same way.

import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { hoursText } from '@/lib/release-timing/findings';
import { typicalDuration } from '@/lib/release-timing/presentation';
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
const GRID = [6, 8, 10, 12, 14, 16, 18, 20];
const PLOT_HEIGHT = 30;

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
  const [frame, width] = useMeasuredWidth<HTMLDivElement>(720, 180);
  const inset = 12;
  const x = (hours: number) => inset + ((Math.max(FROM_HOURS, Math.min(TO_HOURS, hours)) - FROM_HOURS) / (TO_HOURS - FROM_HOURS)) * (width - 2 * inset);
  const mid = PLOT_HEIGHT / 2;
  const Row = onPick ? 'button' : 'div';

  return (
    <div ref={frame} className={styles.chart} role="group" aria-label={label}>
      {rows.map((row, i) => {
        const on = i === emphasis;
        const stroke = on ? 'var(--rt-emph)' : 'var(--rt-series)';
        const typical = typicalDuration(row.median);
        const summary = `Typically ${typical}. Typical window ${hoursText(row.p10)} to ${hoursText(row.p90)} hours. ${row.n} releases.`;
        return (
          <Row key={row.label} className={styles.chartRow}
            type={onPick ? 'button' : undefined} onClick={onPick ? () => onPick(i) : undefined}
            aria-pressed={onPick ? on : undefined} aria-label={onPick ? row.label : undefined}
            aria-description={onPick ? summary : undefined} title={summary}>
            <span className={styles.rowHead}>
              <span><strong>{row.label}</strong><small>{row.n.toLocaleString('en-US')} releases</small></span>
              <span className={styles.rowValue}>Typically <strong>{typical}</strong></span>
            </span>
            <svg viewBox={`0 0 ${width} ${PLOT_HEIGHT}`} aria-hidden="true">
              {GRID.map((hours) => <line key={hours} x1={x(hours)} x2={x(hours)} y1={0} y2={PLOT_HEIGHT} stroke="var(--rt-grid)" />)}
              {row.values.map((value, k) => (
                <circle key={k} cx={x(value)} cy={mid + (((k * 7919) % 11) - 5) * 1.1} r={2.4} fill={stroke} opacity={0.32} />
              ))}
              <rect x={x(row.p10)} y={mid - 5} width={Math.max(x(row.p90) - x(row.p10), 3)} height={10} rx={5} fill={on ? 'var(--rt-emph-soft)' : 'var(--rt-series-soft)'} opacity={0.9} />
              <rect x={x(row.median) - 2.5} y={mid - 11} width={5} height={22} rx={2.5} fill={stroke} stroke="var(--color-surface)" strokeWidth={1.5} />
            </svg>
            {!onPick && <span className="sr-only">{summary}</span>}
          </Row>
        );
      })}
      <svg viewBox={`0 0 ${width} 40`} aria-hidden="true">
        {GRID.map((hours) => <text key={hours} x={x(hours)} y={12} textAnchor="middle">{hours === TO_HOURS ? `${hours}+` : hours}</text>)}
        <text x={inset} y={34}>Hours to first rise at the gauge</text>
      </svg>
    </div>
  );
}
