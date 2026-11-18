'use client';

import { CONDITION_SYSTEM } from '@shared/condition-system';
import { LEVELS, MONTHS, levelName, type Summary, type Level } from '@/lib/condition-days/study';
import styles from './report.module.css';

export type Highlight = 'all' | 'float' | Level;
export const FLOAT_LEVELS = ['good', 'flowing'] as const;
type MonthData = Summary['months'][number];

export function MonthResult({ data, label, highlight }: { data: MonthData; label: string; highlight: Highlight }) {
  const isFloat = highlight === 'float' || highlight === 'all';
  const count = isFloat ? data.levels.good + data.levels.flowing : data.levels[highlight];
  return <div className={styles.monthResult}>
    <h4>{label}</h4>
    {data.total ? <>
      <p><strong>{Math.round(100 * count / data.total)}%</strong> {isFloat ? 'Good or Flowing' : levelName(highlight)}</p>
      <small>{count.toLocaleString('en-US')} of {data.total.toLocaleString('en-US')} recorded days · {data.years} {data.years === 1 ? 'year' : 'years'}</small>
    </> : <small>No recorded days.</small>}
  </div>;
}

export function SeasonalChart({ data, month, setMonth, highlight, name }: {
  data: Summary; month: number; setMonth: (month: number) => void; highlight: Highlight; name: string;
}) {
  const levelsShown = highlight === 'all' ? LEVELS : highlight === 'float' ? FLOAT_LEVELS : [highlight];
  return <div className={styles.plot} role="group" aria-label={name + ' monthly conditions'}>
    <div className={styles.axis} aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
    <div className={styles.columns}>
      {data.months.map(({ levels, total }, i) => {
        const individual = highlight !== 'all' && highlight !== 'float';
        const count = individual ? levels[highlight] : levels.good + levels.flowing;
        const reading = total ? Math.round(100 * count / total) + '% ' + (individual ? levelName(highlight) : 'Good or Flowing') : 'No recorded days';
        const label = name + ', ' + MONTHS[i] + ', ' + reading;
        return <button key={i} type="button" className={styles.column}
          aria-label={label} title={label} aria-pressed={month === i} onClick={() => setMonth(i)}>
          <span className={styles.stack} data-missing={!total || undefined}>
            {levelsShown.filter(level => levels[level] > 0).map(level =>
              <span key={level} style={{ height: levels[level] / total * 100 + '%', background: CONDITION_SYSTEM[level].solid }} />)}
          </span>
          <span className={styles.monthName}>{MONTHS[i].slice(0, 3)}</span>
        </button>;
      })}
    </div>
  </div>;
}

export function MonthTable({ data, name }: { data: Summary; name?: string }) {
  return <details className={styles.details}><summary>Monthly counts{name && ' · ' + name}</summary>
    <div className={styles.tableScroll}><table><caption className="sr-only">Recorded days by month and condition{name && ' at ' + name}</caption>
      <thead><tr><th>Month</th>{LEVELS.map(l => <th key={l}>{levelName(l)}</th>)}<th>Total</th></tr></thead>
      <tbody>{data.months.map((m, i) => <tr key={i}><th scope="row">{MONTHS[i]}</th>{LEVELS.map(l => <td key={l}>{m.levels[l]}</td>)}<td>{m.total}</td></tr>)}</tbody>
    </table></div>
  </details>;
}
