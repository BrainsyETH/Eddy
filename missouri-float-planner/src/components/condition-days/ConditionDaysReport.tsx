'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import type { ConditionThresholds } from '@shared/condition-ladder';
import { FIRST_YEAR, LAST_YEAR, LEVELS, MONTHS, dayLabel, levelName, type Season, type SeasonHistory, type Station, type Summary } from '@/lib/condition-days/study';
import { FLOAT_LEVELS, MonthResult, MonthTable, SeasonalChart, type Highlight } from './SeasonalChart';
import { SeasonCard, TodayCard, type Reading } from './YearCards';
import { WeekendCard } from './WeekendCard';
import styles from './report.module.css';

export interface Comparison {
  site: string; label: string; data: Summary;
  paired: { low: number; floatable: number }[];
}
function Coverage({ data }: { data: Summary }) {
  const years = data.measuredYears;
  if (!years.length) return null;
  return <span className={styles.period}>{years[0]}{years.length > 1 && <>–{years.at(-1)}</>}{years.at(-1)! - years[0] + 1 > years.length && <> · {years.length} measured years</>}</span>;
}
function percent(n: number, total: number) { return Math.round(100 * n / total) + '%'; }
export default function ConditionDaysReport({ station, summary, thresholds, reading, season, history, today, compare, archived }: {
  station: Station; summary: Summary; thresholds: ConditionThresholds; reading: Reading | null;
  season: Season; history: SeasonHistory; today: string; compare: Comparison | null; archived: boolean;
}) {
  const params = useSearchParams();
  const monthParam = Number(params.get('month'));
  const setMonth = (i: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('month', String(i + 1));
    window.history.replaceState(null, '', url);
  };
  const [highlight, setHighlight] = useState<Highlight>('float');
  const all = summary.months;
  const best = all.reduce((winner, m, i) =>
    (m.levels.good + m.levels.flowing) / (m.total || 1) > (all[winner].levels.good + all[winner].levels.flowing) / (all[winner].total || 1) ? i : winner, 0);
  const peak = all[best];
  const month = monthParam >= 1 && monthParam <= 12 && Number.isInteger(monthParam) ? monthParam - 1 : best;
  const pair = compare?.paired[month];
  const gaugeName = station.label.split(' (')[0];
  const otherName = compare?.label.split(' (')[0];
  const metric = highlight === 'all' || highlight === 'float' ? 'Good or Flowing' : levelName(highlight);
  const recorded = all.reduce((sum, m) => sum + m.total, 0);
  return <div className={styles.report}>
    <section className={styles.panel} id="seasons">
      <div className={styles.panelTop}><h2>When does it float well?</h2>{!compare && <Coverage data={summary}/>}</div>
      {peak.total > 0 && <p><b>{MONTHS[best]}</b> had the highest share of Good or Flowing days{compare && <> at {gaugeName}</>} ({percent(peak.levels.good + peak.levels.flowing, peak.total)}).</p>}
      <div className={styles.chartTools}>
        <div className={styles.segment} aria-label="Highlight conditions" role="group">
          <button type="button" aria-pressed={highlight === 'float'} onClick={() => setHighlight('float')}>Good + Flowing</button>
          <button type="button" aria-pressed={highlight === 'all'} onClick={() => setHighlight('all')}>All levels</button>
        </div>
        <label className={styles.monthPicker}><span>Month</span><select className="select" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i} aria-label={m}>{m.slice(0, 3)}</option>)}
        </select></label>
      </div>
      {compare && <div className={styles.panelTop}><h3>{station.label}</h3><Coverage data={summary}/></div>}
      <SeasonalChart name={station.label} data={summary} month={month} setMonth={setMonth} highlight={highlight}/>
      {compare && <><div className={styles.panelTop}><h3 className={styles.compareName}>{compare.label}</h3><Coverage data={compare.data}/></div>
        <SeasonalChart name={compare.label} data={compare.data} month={month} setMonth={setMonth} highlight={highlight}/></>}
      <div className={styles.legend} role="group" aria-label="Show a single level">{(highlight === 'float' ? FLOAT_LEVELS : LEVELS).map(l =>
        <button key={l} type="button" aria-pressed={highlight === l} onClick={() => setHighlight(highlight === l ? 'all' : l)}>
          <i style={{ background: CONDITION_SYSTEM[l].solid }} />{levelName(l)}</button>)}</div>
      <div className={styles.finding} aria-live="polite">
        {compare && <h3>{metric} in {MONTHS[month]}</h3>}
        <div className={styles.results}>
          <MonthResult data={all[month]} label={compare ? gaugeName : MONTHS[month] + ' at this gauge'} highlight={highlight} showMetric={!compare}/>
          {compare && <MonthResult data={compare.data.months[month]} label={otherName ?? compare.label} highlight={highlight} showMetric={false}/>}
        </div>
        {compare && pair && <p className={styles.paired}>{pair.low
          ? <>On {pair.floatable} of {pair.low} shared dates when {gaugeName} was Too Low, {otherName} was Good or Flowing.</>
          : <>No shared {MONTHS[month]} dates had a Too Low reading at {gaugeName}.</>}
          {' '}<Link href={'/gauges/' + compare.site}>Check {otherName} now →</Link>
        </p>}
      </div>
      <MonthTable data={summary} name={compare ? station.label : undefined}/>
      {compare && <MonthTable data={compare.data} name={compare.label}/>}
    </section>
    <TodayCard years={summary.years} reading={reading} today={today}/>
    <SeasonCard season={season} thresholds={thresholds} history={history}/>
    <WeekendCard summary={summary} thresholds={thresholds} month={month} setMonth={setMonth}/>
    <details className={styles.method}><summary>About the data</summary>
      <p><b>{station.gauge}</b> · USGS {station.site}. {recorded.toLocaleString('en-US')} approved daily mean flows from {FIRST_YEAR}–{LAST_YEAR}. We include USGS revisions and skip estimates and other flagged readings. A daily average can hide a short rise.</p>
      <p>We apply {archived ? 'the November 17, 2026 study copy of' : 'the current'} Eddy flow ranges to the measurements. “Flood” in the historical charts means a flow reached Eddy’s upper threshold. Official flood stage is measured in feet.</p>
      <p>Each dot uses the median flow in the seven days centered on {dayLabel(today)}, with at least four readings. Today’s rating uses a fresh observation and includes official flood stage where available.</p>
      <p>The {season.year} curve counts Good or Flowing days using each completed Central day’s median Eddy reading. The historical line uses only years with USGS readings on every matching calendar date. Gaps break streaks. Weekends belong to the month of their Friday and require readings on Friday, Saturday and Sunday. Annual counts scale each year with at least 90% coverage to 365 days, then average those years.</p>
      <a href={`https://waterdata.usgs.gov/monitoring-location/USGS-${station.site}/`}>USGS gauge record ↗</a>
    </details>
    <Link className={styles.gaugeLink} href={`/gauges/${station.site}`}>See current gauge conditions →</Link>
  </div>;
}
