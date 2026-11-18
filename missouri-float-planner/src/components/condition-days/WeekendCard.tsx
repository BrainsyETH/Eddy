import type { ConditionThresholds } from '@shared/condition-ladder';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import { buildZones } from '@shared/threshold-zones';
import { LEVELS, MONTHS, levelName, type Summary } from '@/lib/condition-days/study';
import styles from './report.module.css';

export function WeekendCard({ summary, thresholds, month, setMonth }: {
  summary: Summary; thresholds: ConditionThresholds; month: number; setMonth: (i: number) => void;
}) {
  const { starts, held, dipped, rose } = summary.weekends[month];
  const zones = buildZones(thresholds);
  return <section className={styles.panel} aria-labelledby="weekend-heading">
    <div className={styles.panelTop}><h2 id="weekend-heading">Did good conditions last the weekend?</h2>
      <label className={styles.monthPicker}><span>Month</span><select aria-label="Weekend month" className="select" value={month} onChange={e => setMonth(Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label></div>
    <div aria-live="polite">{starts > 0 ? <>
      <div className={styles.weekendResult}><strong>{Math.round(100 * held / starts)}%</strong>
        <p><b>{held} of {starts} {MONTHS[month]} {starts === 1 ? 'weekend' : 'weekends'}</b> that started Good or Flowing on Friday held that rating on both Saturday and Sunday.</p></div>
      {dipped + rose > 0 && <small>Of the weekends that changed, {[
        dipped > 0 && `${dipped} first dipped below Good`,
        rose > 0 && `${rose} first rose above Flowing`,
      ].filter(Boolean).join(' and ')}.</small>}
    </> : <p>No {MONTHS[month]} weekends had a Good or Flowing Friday and readings for all three days.</p>}</div>
    <details className={styles.details}><summary>Flow ranges &amp; days per year</summary>
      <div className={styles.tableScroll}><table><caption className="sr-only">Eddy flow ranges and average days per year</caption>
        <thead><tr><th>Level</th><th>Flow (cfs)</th><th>Avg. days/year</th></tr></thead>
        <tbody>{LEVELS.map(level => {
          const zone = zones.find(z => z.key === level);
          // The classifier includes optimalMax in Flowing. Flood begins at its lower bound.
          const n = (v: number) => v.toLocaleString('en-US');
          const empty = level === 'good' && zone?.min === zone?.max;
          let range = '—';
          if (empty) range = 'No separate range';
          else if (zone) {
            if (level === 'too_low') range = 'Under ' + n(zone.max);
            else if (zone.openEnded) range = n(zone.min) + '+';
            else range = (level === 'high' ? '>' : '') + n(zone.min) + ' to ' + (level === 'flowing' ? '' : '<') + n(zone.max);
          }
          const freq = summary.annual[level];
          return <tr key={level}><th scope="row"><i className={styles.levelDot} style={{ background: CONDITION_SYSTEM[level].solid }}/>{levelName(level)}</th>
            <td>{range}</td><td>{!summary.fullYears || empty ? '—' : freq > 0 && freq < 0.5 ? '<1' : Math.round(freq)}</td></tr>;
        })}</tbody></table></div>
      <small>{summary.fullYears ? `USGS daily averages · ${summary.fullYears} years with at least 90% coverage.` : 'Too few complete years for annual averages.'}</small>
    </details>
  </section>;
}
