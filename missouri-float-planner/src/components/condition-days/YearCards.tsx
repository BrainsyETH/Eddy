'use client';

import { useState } from 'react';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import type { ConditionThresholds } from '@shared/condition-ladder';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { closingStreak, dayLabel, grade, median, MONTHS, type Season, type SeasonHistory, type Summary } from '@/lib/condition-days/study';
import styles from './report.module.css';

export interface Reading { cfs: number; at: string; level: ConditionCode }
const numeric = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function axisStep(maximum: number, intervals: number) {
  const target = Math.max(1, maximum) / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= target) ?? 10) * magnitude;
}

export function TodayCard({ years, reading, today }: { years: Summary['years']; reading: Reading | null; today: string }) {
  const [picked, setPicked] = useState('');
  const [frame, width] = useMeasuredWidth<HTMLDivElement>(480, 200);
  const known = years.filter(y => y.cfs != null && y.level !== 'unknown').sort((a, b) => a.cfs! - b.cfs!);
  const typical = median(known.map(y => y.cfs!));
  const same = known.filter(y => y.level === reading?.level).length;
  const selected = years.find(y => String(y.year) === picked);
  const step = axisStep(Math.max(...known.map(y => y.cfs!), reading?.cfs ?? 0), width < 400 ? 3 : 5);
  const ceiling = Math.max(step, Math.ceil(Math.max(known.at(-1)?.cfs ?? 0, reading?.cfs ?? 0) / step) * step);
  const x = (value: number) => 10 + value / ceiling * (width - 20);
  const lanes: number[] = [];
  const dots = known.map(y => {
    const px = x(y.cfs!);
    let lane = lanes.findIndex(last => px - last >= 11);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = px;
    return { year: y.year, px, lane };
  });
  const base = Math.max(56, 28 + lanes.length * 10);
  return <section className={styles.panel} aria-labelledby="today-heading">
    <h2 id="today-heading">How does today compare?</h2>
    <div className={styles.todayLayout}>
      <div>{reading ? <>
        <div className={styles.reading}><strong>{numeric.format(reading.cfs)}</strong> cfs <span style={{ color: CONDITION_SYSTEM[reading.level].ink, background: CONDITION_SYSTEM[reading.level].bg }}>{CONDITION_SYSTEM[reading.level].label}</span></div>
        {known.length > 0 && <p>{CONDITION_SYSTEM[reading.level].label} around this date in <b>{same} of {known.length} years</b>.</p>}
        <small>Observed {new Date(reading.at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })} CT · {dayLabel(today)}</small>
      </> : <p>A fresh reading is unavailable. Here’s the record around {dayLabel(today)}.</p>}</div>
      <div ref={frame} className={styles.chartFrame}>{typical != null ? <>
        <div className={styles.keys}><span><i className={styles.dotKey}/>Past years</span><span><i className={styles.dashKey}/>Median {numeric.format(typical)} cfs</span>
          {reading && <span><i className={styles.diamondKey}/>Today</span>}</div>
        <svg className={styles.flowPlot} viewBox={`0 0 ${width} ${base + 25}`} role="img" aria-label={`Flow around ${dayLabel(today)} in ${known.length} past years, from ${known[0].cfs} to ${known.at(-1)?.cfs} cfs. Median ${numeric.format(typical)} cfs.`}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = (e.clientX - rect.left) * width / rect.width;
            const py = (e.clientY - rect.top) * (base + 25) / rect.height;
            const dist = (d: typeof dots[number]) => Math.hypot(px - d.px, py - (base - 7 - d.lane * 10));
            const near = dots.reduce((a, b) => dist(a) < dist(b) ? a : b);
            if (dist(near) <= 22) setPicked(String(near.year));
          }}>
          <line className={styles.gridLine} x1={10} x2={width - 10} y1={base} y2={base}/>
          <line className={styles.medianLine} x1={x(typical)} x2={x(typical)} y1={12} y2={base}/>
          {dots.map(d => <circle key={d.year} className={d.year === selected?.year ? styles.selectedDot : styles.dot} cx={d.px} cy={base - 7 - d.lane * 10} r={4}/>)}
          {reading && <g className={styles.todayMark} transform={`translate(${x(reading.cfs)} 0)`}><line y1={12} y2={base}/><path d="M0 1 l5 5 -5 5 -5 -5 Z"/></g>}
          {Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => i * step).map(v =>
            <text key={v} x={x(v)} y={base + 17} textAnchor={v === 0 ? 'start' : v === ceiling ? 'end' : 'middle'}>{numeric.format(v)}</text>)}
        </svg>
        <div className={styles.explore}><label className={styles.monthPicker}>Past year<select className="select" value={picked} onChange={e => setPicked(e.target.value)}>
          <option value="">Choose year</option>{years.map(y => <option key={y.year}>{y.year}</option>)}
        </select></label><small aria-live="polite">{selected ? selected.cfs == null ? 'No reading for this year.' : numeric.format(selected.cfs) + ' cfs · ' + CONDITION_SYSTEM[selected.level].label : 'One dot per year around ' + dayLabel(today) + '.'}</small></div>
      </> : <small>There are too few readings around this date for a historical comparison.</small>}</div>
    </div>
  </section>;
}

export function SeasonCard({ season, thresholds, history }: { season: Season; thresholds: ConditionThresholds; history: SeasonHistory }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [frame, width] = useMeasuredWidth<HTMLDivElement>(640, 200);
  const { days, through, year } = season;
  const { months, years } = history;
  const index = selected ?? months.length - 1;
  const point = months[index];
  const period = months.slice(0, index + 1);
  const recorded = period.reduce((count, m) => count + m.recorded, 0);
  const lastFloat = period.filter(m => m.lastFloat).at(-1)?.lastFloat;
  const streak = point && closingStreak(days, point.end, thresholds);
  let bestStart = 0, bestDays = 0;
  for (let start = 0; start + 3 < period.length; start++) {
    const span = period.slice(start, start + 4);
    const count = span.reduce((sum, m) => sum + m.floatDays, 0);
    if (count > bestDays && span.every(m => m.recorded > 0)) { bestStart = start; bestDays = count; }
  }
  const total = point?.total ?? 0;
  const max = Math.max(1, ...months.map(m => Math.max(m.total, m.typical ?? 0)));
  const step = Math.max(1, axisStep(max, 3)), top = Math.ceil(max / step) * step;
  const elapsed = (date: string) => (Date.parse(date) - Date.UTC(year, 0, 1)) / 86400000 + 1;
  const x = (i: number) => 32 + elapsed(months[i].end) / Math.max(1, elapsed(through)) * (width - 45);
  const y = (n: number) => 133 - n / top * 115;
  function line(key: 'total' | 'typical') {
    let continuous = false;
    return months.map((m, i) => {
      const value = m[key];
      if (!m.recorded || value == null) { continuous = false; return ''; }
      const segment = `${continuous ? 'L' : 'M'}${x(i)} ${y(value)}`;
      continuous = true;
      return segment;
    }).join(' ');
  }
  const prefix = year + '-' + String(index + 1).padStart(2, '0');
  return <section className={styles.panel} aria-labelledby="season-heading">
    <div className={styles.panelTop}><h2 id="season-heading">How has {year} shaped up?</h2>
      {point && <label className={styles.monthPicker}>Through<select className="select" value={index} onChange={e => setSelected(Number(e.target.value))}>
        {months.map((m, i) => <option key={m.end} value={i}>{dayLabel(m.end)}</option>)}</select></label>}</div>
    {point ? <>
      <div className={styles.keys} aria-live="polite"><span><i className={styles.solidKey}/><b>{point.total}</b> Good or Flowing days</span>
        {point.typical != null && <span><i className={styles.dashKey}/><b>{numeric.format(point.typical)}</b> typical by {dayLabel(point.end)}</span>}</div>
      <div ref={frame} className={styles.chartFrame}><svg className={styles.flowPlot} viewBox={`0 0 ${width} 163`} role="img" aria-label={`Cumulative Good or Flowing days through ${dayLabel(through)}. ${months.at(-1)?.total} days in ${year}.`}
        onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - rect.left) * width / rect.width;
          setSelected(months.reduce((a, _, i) => Math.abs(x(a) - px) < Math.abs(x(i) - px) ? a : i, 0)); }}>
        {Array.from({ length: top / step + 1 }, (_, i) => i * step).map(v => <g key={v}>
          <line className={styles.gridLine} x1={32} x2={width - 13} y1={y(v)} y2={y(v)}/><text x={25} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        <line className={styles.gridLine} x1={x(index)} x2={x(index)} y1={14} y2={133}/>
        <path className={styles.medianLine} d={line('typical')}/><path className={styles.seasonLine} d={line('total')}/>
        {months.map((m, i) => <g key={m.end}>{m.recorded > 0 && <>
          {m.typical != null && <circle className={styles.dot} cx={x(i)} cy={y(m.typical)} r={i === index ? 4 : 2}/>}
          <circle className={styles.selectedDot} cx={x(i)} cy={y(m.total)} r={i === index ? 5 : 2.5}/></>}
          {(i === index || (i % (width < 420 ? 3 : 2) === 0 && Math.abs(x(i) - x(index)) > 36))
            && <text x={x(i)} y={154} textAnchor={i === months.length - 1 ? 'end' : 'middle'}>{MONTHS[i].slice(0, 3)}</text>}</g>)}
      </svg></div>
      <p>{!point.recorded && <>No readings in {MONTHS[index]}. </>}{period.length >= 5 && bestDays > total / 2 && <>{MONTHS[bestStart]} through {MONTHS[bestStart + 3]} accounted for <b>{bestDays} of {total}</b> Good or Flowing days. </>}
        {lastFloat && <>The last recorded Good or Flowing day was <b>{dayLabel(lastFloat)}</b>.</>}</p>
      <small>{recorded} recorded days through {dayLabel(point.end)}{years >= 3 ? ` · Median of ${years} years on the same dates` : ' · Too few matching years for a historical median'}
        {streak && streak.length >= 3 && <> · {streak.length} days in a row rated {CONDITION_SYSTEM[streak.level].label}</>}</small>
      <details className={styles.details}><summary>{MONTHS[index]} daily readings</summary><div className={styles.dayList} tabIndex={0} aria-label={MONTHS[index] + ' daily readings'}>
        {Array.from({ length: Number(point.end.slice(8)) }, (_, d) => {
          const key = prefix + '-' + String(d + 1).padStart(2, '0'), cfs = days[key];
          return <div key={key}><span>{dayLabel(key)}</span><span>{cfs == null ? 'No reading' : numeric.format(cfs) + ' cfs'}</span><b>{cfs == null ? '—' : CONDITION_SYSTEM[grade(cfs, thresholds)].label}</b></div>;
        })}</div></details>
    </> : <p>No completed days with Eddy readings are available for this year.</p>}
  </section>;
}
