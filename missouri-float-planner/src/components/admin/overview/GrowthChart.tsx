'use client';
import { useState } from 'react';
import {
  comparePeriod,
  type GrowthSeries,
} from '@/lib/admin/dashboard/overview-model';
import { useInspectMetric } from './MetricDetails';
import { Change, Panel } from './bits';
import styles from './overview.module.css';

const dayLabel = (day: string) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
export default function GrowthChart({
  series,
  days,
  measure,
  onMeasure,
}: {
  series: GrowthSeries;
  days: 7 | 30;
  measure: 'plans' | 'accounts';
  onMeasure: (value: 'plans' | 'accounts') => void;
}) {
  const inspect = useInspectMetric();
  const [selected, setSelected] = useState<number | null>(null);
  const period = comparePeriod(series, days);
  const max = period
    ? Math.max(
        1,
        ...period.current.map((p) => p.count),
        ...period.previous.map((p) => p.count),
      )
    : 1;
  const x = (i: number) => 42 + (i / (days - 1)) * 596;
  const y = (n: number) => 200 - (n / max) * 164;
  const path = (points: Array<{ count: number }>) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.count)}`).join(' ');
  const active = selected === null ? days - 1 : Math.min(selected, days - 1);
  const noun = measure === 'plans' ? 'trip plans saved' : 'new accounts';
  return (
    <Panel
      question="Is Eddy growing?"
      hint="Each day compared with the period before (dashed)"
      action={
        <div className={styles.segment} aria-label="Chart measure">
          {(['plans', 'accounts'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={measure === value}
              onClick={() => {
                onMeasure(value);
                setSelected(null);
              }}
            >
              {value === 'plans' ? 'Trip plans' : 'New accounts'}
            </button>
          ))}
        </div>
      }
    >
      {period ? (
        <>
          <div className={styles.bigLine}>
            <strong>{period.total.toLocaleString()}</strong>
            <span>
              {noun}
              <small>
                <Change total={period.total} prior={period.prior} days={days} />
              </small>
            </span>
          </div>
          <svg
            viewBox="0 0 660 230"
            className={styles.chart}
            role="img"
            aria-label={`${period.total} ${noun} in the last ${days} days, ${period.prior} in the ${days} days before.`}
            onMouseLeave={() => setSelected(null)}
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1="42"
                  x2="638"
                  y1={y(max * f)}
                  y2={y(max * f)}
                  className={styles.gridLine}
                />
                <text x="32" y={y(max * f) + 4} textAnchor="end">
                  {Math.round(max * f)}
                </text>
              </g>
            ))}
            <path
              d={`${path(period.current)} L638,200 L42,200 Z`}
              className={styles.chartArea}
            />
            <path d={path(period.previous)} className={styles.previousLine} />
            <path d={path(period.current)} className={styles.currentLine} />
            {period.current.map((p, i) => (
              <g key={p.day} onMouseEnter={() => setSelected(i)}>
                <rect
                  x={x(i) - 10}
                  y="30"
                  width="20"
                  height="175"
                  fill="transparent"
                />
                <circle
                  cx={x(i)}
                  cy={y(p.count)}
                  r={active === i ? 5 : 2.5}
                  className={styles.chartPoint}
                >
                  <title>
                    {dayLabel(p.day)}: {p.count} (period before:{' '}
                    {period.previous[i].count})
                  </title>
                </circle>
              </g>
            ))}
            <text x="42" y="224">
              {dayLabel(period.current[0].day)}
            </text>
            <text x="638" y="224" textAnchor="end">
              {dayLabel(period.current[days - 1].day)}
            </text>
          </svg>
          <div className={styles.chartLegend}>
            <span>
              {dayLabel(period.current[active].day)}:{' '}
              <b>{period.current[active].count}</b> {noun}
            </span>
            <button
              className={styles.textButton}
              onClick={() => inspect({ key: measure })}
            >
              Day-by-day numbers ›
            </button>
          </div>
        </>
      ) : (
        <p className={styles.empty}>Growth history did not load.</p>
      )}
    </Panel>
  );
}
