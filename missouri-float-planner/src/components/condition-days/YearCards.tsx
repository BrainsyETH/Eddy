'use client';

import { useState } from 'react';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import type { ConditionThresholds } from '@shared/condition-ladder';
import { closingStreak, dayLabel, grade, isFloatDay, MONTHS, type Summary } from '@/lib/condition-days/study';
import styles from './report.module.css';

export interface Reading { cfs: number; at: string; level: ConditionCode }
export interface Season { days: Record<string, number>; through: string; year: number }
export function TodayCard({ years, reading, today }: { years: Summary['years']; reading: Reading | null; today: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const known = years.filter(y => y.level !== 'unknown');
  const same = known.filter(y => y.level === reading?.level).length;
  const selected = years.find(y => y.year === picked);
  return <section className={styles.panel}>
    <h2>Is today unusual?</h2>
    {reading ? <>
      <div className={styles.reading}><strong>{reading.cfs.toLocaleString('en-US')}</strong> cfs <span style={{ color: CONDITION_SYSTEM[reading.level].ink, background: CONDITION_SYSTEM[reading.level].bg }}>{CONDITION_SYSTEM[reading.level].label}</span></div>
      <p>{known.length ? `${CONDITION_SYSTEM[reading.level].label} around this date in ${same} of ${known.length} years with readings.` : 'The seasonal comparison has too few readings.'}</p>
      <small>Observed {new Date(reading.at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })} CT · {dayLabel(today)}</small>
    </> : <p>A fresh reading is unavailable. Explore past years around {dayLabel(today)}.</p>}
    <div className={styles.yearGrid} role="group" aria-label="Conditions by historical year">
      {years.map(y => <button key={y.year} type="button" aria-pressed={picked === y.year}
        aria-label={y.year + ', ' + (y.level === 'unknown' ? 'No reading' : CONDITION_SYSTEM[y.level].label)} onClick={() => setPicked(y.year)}>
        <i style={y.level === 'unknown' ? undefined : { background: CONDITION_SYSTEM[y.level].solid }} />
        <span>{String(y.year).slice(-2)}</span>
      </button>)}
    </div>
    <small aria-live="polite">{selected ? selected.year + ' · ' + (selected.cfs == null ? 'No reading' : selected.cfs.toLocaleString('en-US') + ' cfs · ' + CONDITION_SYSTEM[selected.level].label) : 'Each square shows one year. Tap to see its flow.'}</small>
  </section>;
}

export function SeasonCard({ season, thresholds }: { season: Season; thresholds: ConditionThresholds }) {
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const { days, through, year } = season;
  const values = Object.values(days);
  const percent = values.filter(v => isFloatDay(grade(v, thresholds))).length;
  const streak = closingStreak(days, through, thresholds);
  const months = MONTHS.map((name, index) => {
    const prefix = year + '-' + String(index + 1).padStart(2, '0');
    const length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const dates = Array.from({ length }, (_, i) => prefix + '-' + String(i + 1).padStart(2, '0'));
    return { name, dates };
  });
  return <section className={styles.panel}>
    <h2>{year} so far</h2>
    {values.length ? <>
      <p className={styles.leadStat}><strong>{percent}</strong> Good or Flowing days</p>
      <p>Of {values.length} recorded days through {dayLabel(through)}.{streak && streak.length >= 3 && ' ' + CONDITION_SYSTEM[streak.level].label + ' since ' + dayLabel(streak.start) + '.'}</p>
      <div className={styles.stripe} role="group" aria-label="Explore daily readings by month">
        {months.filter(m => m.dates[0] <= through).map(({ name, dates }, i) => <button key={name} type="button" style={{ flexGrow: dates.filter(key => key <= through).length }} aria-label={name + ' daily readings'} aria-expanded={openMonth === i} onClick={() => setOpenMonth(openMonth === i ? null : i)}>
          <span>{dates.filter(key => key <= through).map(key => <i key={key} style={days[key] == null ? undefined : { background: CONDITION_SYSTEM[grade(days[key], thresholds)].solid }} />)}</span><small>{name.slice(0, 1)}</small>
        </button>)}
      </div>
      {openMonth == null ? <small>Tap a month for daily readings. Stripes mark gaps.</small> :
        <details open className={styles.daysDetail} key={openMonth}><summary>{MONTHS[openMonth]} readings</summary>
          <div tabIndex={0} aria-label="Daily readings" className={styles.dayList}>{months[openMonth].dates.filter(d => d <= through).map(key =>
            <div key={key}><span>{dayLabel(key)}</span><span>{days[key] == null ? 'No reading' : days[key].toLocaleString('en-US') + ' cfs'}</span>
            <b>{days[key] == null ? '—' : CONDITION_SYSTEM[grade(days[key], thresholds)].label}</b></div>)}</div>
        </details>}
    </> : <p>No completed days with Eddy readings are available for this year.</p>}
  </section>;
}
