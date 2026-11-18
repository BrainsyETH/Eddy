'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import { buildZones, formatZoneRange } from '@shared/threshold-zones';
import type { ConditionThresholds } from '@shared/condition-ladder';
import { FIRST_YEAR, LAST_YEAR, LEVELS, MONTHS, dayLabel, levelName, type Station, type Summary } from '@/lib/condition-days/study';
import { FLOAT_LEVELS, MonthResult, MonthTable, SeasonalChart, type Highlight } from './SeasonalChart';
import { SeasonCard, TodayCard, type Reading, type Season } from './YearCards';
import styles from './report.module.css';

export interface Comparison {
  site: string; label: string; data: Summary;
  paired: { low: number; floatable: number }[];
}
function percent(n: number, total: number) { return Math.round(100 * n / total) + '%'; }
export default function ConditionDaysReport({ station, summary, thresholds, reading, season, today, compare, archived }: {
  station: Station; summary: Summary; thresholds: ConditionThresholds; reading: Reading | null;
  season: Season; today: string; compare: Comparison | null; archived: boolean;
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
  const zones = buildZones(thresholds);
  const maxDays = Math.max(1, ...Object.values(summary.annual));
  const pair = compare?.paired[month];
  const recorded = all.reduce((sum, m) => sum + m.total, 0);
  return <div className={styles.report}>
    <section className={styles.panel} id="seasons">
      <div className={styles.panelTop}><h2>When does it float well?</h2><span className={styles.period}>{FIRST_YEAR}–{LAST_YEAR}</span></div>
      {peak.total > 0 && <p><b>{MONTHS[best]}</b> had the highest share of Good or Flowing days{compare && <> at {station.label}</>} ({percent(peak.levels.good + peak.levels.flowing, peak.total)}).</p>}
      <div className={styles.chartTools}>
        <div className={styles.segment} aria-label="Highlight conditions" role="group">
          <button type="button" aria-pressed={highlight === 'float'} onClick={() => setHighlight('float')}>Good + Flowing</button>
          <button type="button" aria-pressed={highlight === 'all'} onClick={() => setHighlight('all')}>All levels</button>
        </div>
        <label className={styles.monthPicker}>Month <select className="select" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select></label>
      </div>
      {compare && <h3>{station.label}</h3>}
      <SeasonalChart name={station.label} data={summary} month={month} setMonth={setMonth} highlight={highlight}/>
      {compare && <><h3 className={styles.compareName}>{compare.label}</h3>
        <SeasonalChart name={compare.label} data={compare.data} month={month} setMonth={setMonth} highlight={highlight}/></>}
      <div className={styles.legend} role="group" aria-label="Show a single level">{(highlight === 'float' ? FLOAT_LEVELS : LEVELS).map(l =>
        <button key={l} type="button" aria-pressed={highlight === l} onClick={() => setHighlight(highlight === l ? 'all' : l)}>
          <i style={{ background: CONDITION_SYSTEM[l].solid }} />{levelName(l)}</button>)}</div>
      <div className={styles.finding} aria-live="polite">
        {compare && <h3>{MONTHS[month]} by stretch</h3>}
        <div className={styles.results}>
          <MonthResult data={all[month]} label={compare ? station.label : MONTHS[month] + ' at this gauge'} highlight={highlight}/>
          {compare && <MonthResult data={compare.data.months[month]} label={compare.label} highlight={highlight}/>}
        </div>
        {compare && pair && <p className={styles.paired}>{pair.low
          ? <>On {pair.floatable} of {pair.low} shared dates when {station.label} was Too Low, {compare.label} was Good or Flowing.</>
          : <>No shared {MONTHS[month]} dates had a Too Low reading at {station.label}.</>}
          {' '}<Link href={'/gauges/' + compare.site}>Check {compare.label} now →</Link>
        </p>}
      </div>
      <MonthTable data={summary} name={compare ? station.label : undefined}/>
      {compare && <MonthTable data={compare.data} name={compare.label}/>}
    </section>
    <div className={styles.twins}><TodayCard years={summary.years} reading={reading} today={today}/>
      <SeasonCard season={season} thresholds={thresholds}/></div>
    <section className={styles.panel}><div className={styles.panelTop}><h2>How often does each level happen?</h2></div>
      {summary.fullYears ? <><p>Average days in a year at this gauge, based on {summary.fullYears} years with enough readings.</p>
      <div className={styles.frequency}>{LEVELS.map(l => {
        const zone = zones.find(z => z.key === l);
        const annualDays = summary.annual[l];
        const daysLabel = annualDays > 0 && annualDays < 0.5 ? '<1 day' : Math.round(annualDays).toLocaleString('en-US') + (Math.round(annualDays) === 1 ? ' day' : ' days');
        const noRange = l === 'good' && zone != null && zone.min === zone.max;
        return <button type="button" key={l} disabled={noRange} aria-pressed={highlight === l} onClick={() => setHighlight(highlight === l ? 'all' : l)}>
          <span><i style={{ background: CONDITION_SYSTEM[l].solid }}/>{levelName(l)}</span>
          <span className={styles.track}><i style={{ background: CONDITION_SYSTEM[l].solid, width: summary.annual[l] / maxDays * 100 + '%' }}/></span>
          <b>{noRange ? 'No separate range' : daysLabel}</b>
          {highlight === l && zone && !noRange && <small>{formatZoneRange(zone, 'cfs')} · highlighted on the monthly chart</small>}
        </button>;
      })}</div></> : <p>There are too few complete years for an annual comparison.</p>}
    </section>
    <details className={styles.method}><summary>About the data</summary>
      <p><b>{station.gauge}</b> · USGS {station.site}. {recorded.toLocaleString('en-US')} approved daily mean flows from {FIRST_YEAR}–{LAST_YEAR}. We include USGS revisions and skip estimates and other flagged readings. A daily average can hide a short rise.</p>
      <p>We apply {archived ? 'the November 17, 2026 study copy of' : 'the current'} Eddy flow ranges to the measurements. “Flood” in the historical charts means a flow reached Eddy’s upper threshold. Official flood stage is measured in feet.</p>
      <p>Each year square uses the median flow in the seven days centered on {dayLabel(today)}, with at least four readings. Today’s rating uses a fresh observation and includes official flood stage where available.</p>
      <p>The {season.year} strip uses each completed Central day’s median Eddy reading. A missing day breaks a streak. Annual counts scale each year with at least 90% coverage to 365 days, then average those years.</p>
      <a href={`https://waterdata.usgs.gov/monitoring-location/USGS-${station.site}/`}>USGS gauge record ↗</a>
    </details>
    <Link className={styles.gaugeLink} href={`/gauges/${station.site}`}>See current gauge conditions →</Link>
  </div>;
}
