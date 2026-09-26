'use client';
import { useState } from 'react';
import {
  comparePeriod,
  type GrowthSeries,
} from '@/lib/admin/dashboard/overview-model';
import styles from './overview.module.css';

const dayLabel = (day: string) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
export function changeLabel(
  total: number,
  prior: number,
  percent: number | null,
) {
  if (percent === null)
    return prior === 0 && total > 0
      ? `${total.toLocaleString()} more than the previous period`
      : 'No change from the previous period';
  return `${percent > 0 ? '+' : ''}${Math.round(percent)}% vs previous period`;
}
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
  return (
    <section className={styles.panel} aria-labelledby="growth-title">
      <div className={styles.panelHead}>
        <div>
          <h2 id="growth-title">Is Eddy growing?</h2>
          <p>Daily activity, with the previous period for context.</p>
        </div>
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
              {value === 'plans' ? 'Trip plans' : 'Accounts'}
            </button>
          ))}
        </div>
      </div>
      {period ? (
        <>
          <div className={styles.chartSummary}>
            <strong>{period.total.toLocaleString()}</strong>
            <span>
              {measure === 'plans' ? 'plans saved' : 'accounts created'}
              <br />
              <small>
                {changeLabel(period.total, period.prior, period.percent)}
              </small>
            </span>
          </div>
          <svg
            viewBox="0 0 660 230"
            className={styles.chart}
            role="img"
            aria-label={`${measure}: ${period.total} in the last ${days} complete UTC days; ${period.prior} in the preceding ${days} days. Daily values available below.`}
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
                    {dayLabel(p.day)}: {p.count}; previous period:{' '}
                    {period.previous[i].count}
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
            <span>● This period</span>
            <span>┄ Previous period</span>
            <span>
              {dayLabel(period.current[active].day)}:{' '}
              <b>{period.current[active].count}</b>
            </span>
          </div>
          <p className={styles.note}>
            Last {days} complete UTC days. Today is excluded so both periods
            have equal coverage. Saved plans are not completed trips; accounts
            are not active users.
          </p>
          <details className={styles.chartTable}>
            <summary>View daily numbers</summary>
            <table>
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>This period</th>
                  <th>Previous date</th>
                  <th>Previous period</th>
                </tr>
              </thead>
              <tbody>
                {period.current.map((p, i) => (
                  <tr key={p.day}>
                    <td>{dayLabel(p.day)}</td>
                    <td>{p.count}</td>
                    <td>{dayLabel(period.previous[i].day)}</td>
                    <td>{period.previous[i].count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <div className={styles.empty}>
          {series.reason ?? 'Growth history is unavailable.'}
        </div>
      )}
    </section>
  );
}
