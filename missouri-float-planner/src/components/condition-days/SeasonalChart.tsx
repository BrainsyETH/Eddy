'use client';

import { CONDITION_SYSTEM } from '@shared/condition-system';
import { LEVELS, MONTHS, levelName, type Summary, type Level } from '@/lib/condition-days/study';
import styles from './report.module.css';

export type Highlight = 'all' | 'float' | Level;
export function SeasonalChart({ data, month, setMonth, highlight, name }: {
  data: Summary; month: number; setMonth: (month: number) => void; highlight: Highlight; name: string;
}) {
  return <div className={styles.plot} role="group" aria-label={name + ' monthly conditions'}>
    <div className={styles.axis} aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
    <div className={styles.columns}>
      {data.months.map(({ levels, total }, i) => <button key={i} type="button" className={styles.column}
        aria-label={name + ', ' + MONTHS[i] + ', ' + total + ' recorded days'} aria-pressed={month === i} onClick={() => setMonth(i)}>
        <span className={styles.stack}>
          {LEVELS.filter(level => levels[level] > 0).map(level => {
            const active = highlight === 'all' || highlight === level || (highlight === 'float' && (level === 'good' || level === 'flowing'));
            return <span key={level} style={{ height: levels[level] / total * 100 + '%', background: CONDITION_SYSTEM[level].solid, opacity: active ? 1 : 0.16 }} />;
          })}
        </span>
        <span className={styles.monthName}>{MONTHS[i].slice(0, 3)}</span>
      </button>)}
    </div>
  </div>;
}

export function MonthTable({ data }: { data: Summary }) {
  return <details className={styles.details}><summary>Monthly counts</summary>
    <div className={styles.tableScroll}><table><caption className="sr-only">Recorded days by month and condition</caption>
      <thead><tr><th>Month</th>{LEVELS.map(l => <th key={l}>{levelName(l)}</th>)}<th>Total</th></tr></thead>
      <tbody>{data.months.map((m, i) => <tr key={i}><th scope="row">{MONTHS[i]}</th>{LEVELS.map(l => <td key={l}>{m.levels[l]}</td>)}<td>{m.total}</td></tr>)}</tbody>
    </table></div>
  </details>;
}
