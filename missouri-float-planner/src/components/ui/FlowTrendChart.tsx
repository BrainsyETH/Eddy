'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Expand, ExternalLink, Minimize2, Plus, X } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import {
  chartDomain,
  chartPoints,
  nearestChartPoint,
  niceValueTicks,
  splitAtGaps,
  timeTicks,
  type ChartPoint,
} from '@shared/chart-model';

export interface ChartThresholdLines {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

interface FlowTrendChartProps {
  gaugeSiteId: string;
  days: number;
  thresholds?: ChartThresholdLines | null;
  latestValue?: number | null;
  displayUnit?: 'ft' | 'cfs';
  chartClassName?: string;
}

interface Marker { label: string; value: number; color: string; dash: string }

const PLOT = { left: 62, right: 916, top: 18, bottom: 222 };
const SVG_WIDTH = 1000;
const SVG_HEIGHT = 260;

function numberLabel(value: number, unit: 'ft' | 'cfs', exact = false): string {
  if (unit === 'ft') return exact ? value.toFixed(2) : value.toFixed(1);
  if (!exact && Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (!exact && Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

function timeLabel(ms: number, days: number): string {
  const date = new Date(ms);
  return days <= 1
    ? date.toLocaleTimeString(undefined, { hour: 'numeric' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fullTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function ageLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Update time unavailable';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 2) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours} hr${hours === 1 ? '' : 's'} ago`;
}

function pathFor(points: ChartPoint[], x: (t: number) => number, y: (v: number) => number): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.t)} ${y(point.v)}`).join(' ');
}

export default function FlowTrendChart({
  gaugeSiteId,
  days,
  thresholds,
  latestValue,
  displayUnit = 'cfs',
  chartClassName,
}: FlowTrendChartProps) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId, days);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [context, setContext] = useState<'conditions' | 'typical'>('conditions');
  const [expanded, setExpanded] = useState(false);
  const [addingLevel, setAddingLevel] = useState(false);
  const [customLevel, setCustomLevel] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const unit = displayUnit;
  const compact = chartClassName?.includes('h-32') ?? false;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`eddy:chart-level:${gaugeSiteId}:${unit}`);
      setCustomLevel(saved === null ? null : Number(saved));
    } catch { setCustomLevel(null); }
  }, [gaugeSiteId, unit]);

  const model = useMemo(() => {
    if (!history?.readings.length) return null;
    const observed = chartPoints(history.readings, unit);
    if (observed.length < 2) return null;
    const forecast = unit === 'ft' ? chartPoints(history.forecast ?? [], unit) : [];
    const typical = unit === 'cfs' ? (history.typical ?? []).flatMap((row) => {
      const t = new Date(`${row.date}T12:00:00Z`).getTime();
      return Number.isFinite(t) && row.p50Cfs !== null
        ? [{ t, median: row.p50Cfs, low: row.p25Cfs, high: row.p75Cfs, years: row.yearsOfRecord }]
        : [];
    }) : [];
    const markers: Marker[] = thresholds ? [
      { label: 'Too low', value: thresholds.levelTooLow, color: '#b45309', dash: '4 4' },
      { label: 'Good', value: thresholds.levelLow, color: '#65a30d', dash: '4 4' },
      { label: 'Flowing', value: thresholds.levelOptimalMin, color: '#059669', dash: '3 3' },
      { label: 'Top of flowing', value: thresholds.levelOptimalMax, color: '#059669', dash: '3 3' },
      { label: 'High', value: thresholds.levelHigh, color: '#ea580c', dash: '5 4' },
      { label: 'Flood', value: thresholds.levelDangerous, color: '#dc2626', dash: '6 3' },
    ].flatMap((marker) => marker.value !== null ? [{ ...marker, value: marker.value }] : []) : [];
    if (customLevel !== null && Number.isFinite(customLevel)) {
      markers.push({ label: 'My level', value: customLevel, color: '#7c3aed', dash: '2 3' });
    }
    const contextPoints: ChartPoint[] = context === 'typical'
      ? typical.flatMap((point) => [point.low, point.median, point.high].flatMap((value) =>
          value === null ? [] : [{ t: point.t, v: value, timestamp: '', qualifiers: [] }]))
      : [];
    const plotted = [...observed, ...forecast, ...contextPoints].sort((a, b) => a.t - b.t);
    const domain = chartDomain(plotted, unit, context === 'conditions' ? markers.map((m) => m.value) : []);
    if (!domain) return null;
    const x = (t: number) => PLOT.left + ((t - domain.t0) / Math.max(1, domain.t1 - domain.t0)) * (PLOT.right - PLOT.left);
    const y = (value: number) => PLOT.bottom - ((value - domain.min) / Math.max(1e-9, domain.max - domain.min)) * (PLOT.bottom - PLOT.top);
    const typicalMedian = typical.map((point) => ({ t: point.t, v: point.median, timestamp: '', qualifiers: [] }));
    const typicalLow = typical.flatMap((point) => point.low === null ? [] : [{ t: point.t, v: point.low, timestamp: '', qualifiers: [] }]);
    const typicalHigh = typical.flatMap((point) => point.high === null ? [] : [{ t: point.t, v: point.high, timestamp: '', qualifiers: [] }]);
    const typicalArea = typicalLow.length > 1 && typicalHigh.length > 1
      ? `${pathFor(typicalHigh, x, y)} ${[...typicalLow].reverse().map((p) => `L ${x(p.t)} ${y(p.v)}`).join(' ')} Z`
      : '';
    return {
      observed, forecast, typical, markers, domain, x, y,
      observedPaths: splitAtGaps(observed).filter((segment) => segment.length > 1).map((segment) => pathFor(segment, x, y)),
      forecastPath: forecast.length > 1 ? pathFor(forecast, x, y) : '',
      typicalPath: typicalMedian.length > 1 ? pathFor(typicalMedian, x, y) : '',
      typicalArea,
      yTicks: niceValueTicks(domain.min, domain.max, compact ? 3 : 5),
      xTicks: timeTicks(domain.t0, domain.t1, compact ? 3 : 5),
    };
  }, [history, unit, thresholds, compact, context, customLevel]);

  const selected = useMemo(() => {
    if (hoverX === null || !model) return null;
    const time = model.domain.t0 + hoverX * (model.domain.t1 - model.domain.t0);
    return nearestChartPoint(model.observed, time);
  }, [hoverX, model]);

  const onPointer = useCallback((clientX: number) => {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    const plotLeft = bounds.left + bounds.width * (PLOT.left / SVG_WIDTH);
    const plotWidth = bounds.width * ((PLOT.right - PLOT.left) / SVG_WIDTH);
    setHoverX(Math.max(0, Math.min(1, (clientX - plotLeft) / plotWidth)));
  }, []);

  const current = model?.observed.at(-1) ?? null;
  const previous = model?.observed.find((point) => current && point.t >= current.t - Math.min(days, 1) * 86_400_000) ?? model?.observed[0] ?? null;
  const delta = current && previous && previous.v !== 0 ? ((current.v - previous.v) / Math.abs(previous.v)) * 100 : null;

  const downloadCsv = () => {
    if (!history) return;
    const rows = ['timestamp,gauge_height_ft,discharge_cfs,qualifiers', ...history.readings.map((reading) =>
      [reading.timestamp, reading.gaugeHeightFt ?? '', reading.dischargeCfs ?? '', (reading.qualifiers ?? []).join('|')].join(','))];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${gaugeSiteId}-${days}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveLevel = (raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setCustomLevel(value);
    setAddingLevel(false);
    try { localStorage.setItem(`eddy:chart-level:${gaugeSiteId}:${unit}`, String(value)); } catch { /* optional */ }
  };

  if (isLoading) return <div className="p-5 h-48 flex items-center justify-center text-sm text-neutral-500">Loading hydrograph…</div>;
  if (error || !model || !history) return <div className="p-5 h-48 flex items-center justify-center text-sm text-neutral-500">No recent {unit === 'ft' ? 'stage' : 'flow'} history available.</div>;

  const visibleMarkers = model.markers.filter((marker) => marker.value >= model.domain.min && marker.value <= model.domain.max);
  const hiddenAbove = model.markers.filter((marker) => marker.value > model.domain.max);
  const hiddenBelow = model.markers.filter((marker) => marker.value < model.domain.min);
  const chart = (
    <div className={expanded ? 'h-[min(72vh,620px)]' : chartClassName ?? 'h-52 md:h-60'}>
      <div
        ref={container}
        className="relative h-full touch-none select-none"
        onPointerMove={(event) => onPointer(event.clientX)}
        onPointerDown={(event) => onPointer(event.clientX)}
        onPointerLeave={() => setHoverX(null)}
      >
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full h-full" role="img"
          aria-label={`${unit === 'ft' ? 'Gauge height' : 'Discharge'} hydrograph. Current value ${numberLabel(latestValue ?? current!.v, unit, true)} ${unit}. ${ageLabel(history.observedThrough)}.`}>
          <rect x={PLOT.left} y={PLOT.top} width={PLOT.right - PLOT.left} height={PLOT.bottom - PLOT.top} fill="transparent" />
          {model.yTicks.map((tick) => {
            const y = model.y(tick.value);
            return <g key={`y-${tick.value}`}><line x1={PLOT.left} x2={PLOT.right} y1={y} y2={y} stroke="currentColor" className="text-neutral-200" strokeWidth="1" /><text x={PLOT.left - 10} y={y + 4} textAnchor="end" className="fill-neutral-500 text-[11px] tabular-nums">{numberLabel(tick.value, unit)}</text></g>;
          })}
          {model.xTicks.map((tick, index) => {
            const x = PLOT.left + tick.position * (PLOT.right - PLOT.left);
            return <g key={`x-${index}`}><line x1={x} x2={x} y1={PLOT.top} y2={PLOT.bottom} stroke="currentColor" className="text-neutral-100" /><text x={x} y={PLOT.bottom + 23} textAnchor={index === 0 ? 'start' : index === model.xTicks.length - 1 ? 'end' : 'middle'} className="fill-neutral-500 text-[11px]">{timeLabel(tick.value, days)}</text></g>;
          })}
          {context === 'conditions' && visibleMarkers.map((marker) => <g key={`${marker.label}-${marker.value}`}><line x1={PLOT.left} x2={PLOT.right} y1={model.y(marker.value)} y2={model.y(marker.value)} stroke={marker.color} strokeWidth="1.5" strokeDasharray={marker.dash} opacity="0.65" /><text x={PLOT.right + 8} y={model.y(marker.value) + 4} fill={marker.color} className="text-[10px] font-semibold">{marker.label} {numberLabel(marker.value, unit)}</text></g>)}
          {context === 'typical' && model.typicalArea && <path d={model.typicalArea} fill="#2d7889" opacity="0.12" />}
          {context === 'typical' && model.typicalPath && <path d={model.typicalPath} fill="none" stroke="#2d7889" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.65" />}
          {model.observedPaths.map((path, index) => <path key={index} d={path} fill="none" stroke="#16758a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {model.forecastPath && <><line x1={model.x(model.observed.at(-1)!.t)} x2={model.x(model.observed.at(-1)!.t)} y1={PLOT.top} y2={PLOT.bottom} stroke="#64748b" strokeDasharray="3 4" /><text x={model.x(model.observed.at(-1)!.t) + 5} y={PLOT.top + 12} className="fill-slate-500 text-[10px] font-semibold">NOW</text><path d={model.forecastPath} fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /><text x={PLOT.right - 4} y={PLOT.top + 12} textAnchor="end" className="fill-violet-700 text-[10px] font-semibold">OFFICIAL NWS FORECAST</text></>}
          <circle cx={model.x(current!.t)} cy={model.y(current!.v)} r="5" fill="#16758a" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {selected && <><line x1={model.x(selected.t)} x2={model.x(selected.t)} y1={PLOT.top} y2={PLOT.bottom} stroke="#0f172a" opacity="0.35" /><circle cx={model.x(selected.t)} cy={model.y(selected.v)} r="6" fill="white" stroke="#16758a" strokeWidth="3" vectorEffect="non-scaling-stroke" /></>}
          <text x={PLOT.left} y={12} className="fill-neutral-500 text-[10px] font-semibold">{unit === 'ft' ? 'GAUGE HEIGHT (FT)' : 'DISCHARGE (CFS)'}</text>
        </svg>
        {selected && <div className="absolute pointer-events-none rounded-lg bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" style={{ left: `${Math.min(78, Math.max(8, hoverX! * 100))}%`, top: '8px', transform: hoverX! > 0.62 ? 'translateX(-100%)' : undefined }}><div className="font-bold tabular-nums">{numberLabel(selected.v, unit, true)} {unit}</div><div className="text-slate-300">{fullTime(selected.t)}</div>{selected.qualifiers.length ? <div className="mt-1 text-amber-300">{selected.qualifiers.join(', ')}</div> : null}</div>}
      </div>
    </div>
  );

  return <div className={expanded ? 'fixed inset-0 z-50 overflow-auto bg-white p-4 sm:p-8' : 'p-4'}>
    <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums text-neutral-900">{numberLabel(latestValue ?? current!.v, unit, true)} {unit}</span>{delta !== null && <span className={`text-xs font-semibold ${delta > 0 ? 'text-sky-700' : delta < 0 ? 'text-amber-700' : 'text-neutral-500'}`}>{delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta).toFixed(0)}%</span>}</div><div className="text-xs text-neutral-500">{ageLabel(history.observedThrough)} · {days === 1 ? 'last 24 hours' : `last ${days} days`}{history.sampled ? ' · detail preserved' : ''}</div></div>
      {!compact && <div className="flex flex-wrap items-center gap-1.5"><button onClick={() => setContext('conditions')} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${context === 'conditions' ? 'bg-primary-100 text-primary-800' : 'text-neutral-600 hover:bg-neutral-100'}`}>Conditions</button>{unit === 'cfs' && history.typical.length > 0 && <button onClick={() => setContext('typical')} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${context === 'typical' ? 'bg-primary-100 text-primary-800' : 'text-neutral-600 hover:bg-neutral-100'}`}>Typical range</button>}<button onClick={() => setAddingLevel(true)} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100" title="Mark a custom level"><Plus className="h-4 w-4" /></button><button onClick={downloadCsv} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100" title="Download chart data"><Download className="h-4 w-4" /></button>{history.sourceUrl && <a href={history.sourceUrl} target="_blank" rel="noreferrer" className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100" title="Open publisher data"><ExternalLink className="h-4 w-4" /></a>}<button onClick={() => setExpanded(!expanded)} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100" title={expanded ? 'Close full screen' : 'Open detailed chart'}>{expanded ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</button></div>}
    </div>
    {addingLevel && <div className="mb-2 flex items-center gap-2 rounded-lg bg-violet-50 p-2 text-xs"><label htmlFor={`custom-${gaugeSiteId}`}>Mark level ({unit})</label><input id={`custom-${gaugeSiteId}`} type="number" step={unit === 'ft' ? '0.1' : '1'} defaultValue={customLevel ?? ''} className="w-28 rounded border border-violet-200 bg-white px-2 py-1" onKeyDown={(event) => { if (event.key === 'Enter') saveLevel(event.currentTarget.value); }} /><button onClick={(event) => { const input = event.currentTarget.parentElement?.querySelector('input'); if (input) saveLevel(input.value); }} className="rounded bg-violet-700 px-2 py-1 font-semibold text-white">Save</button>{customLevel !== null && <button onClick={() => { setCustomLevel(null); setAddingLevel(false); try { localStorage.removeItem(`eddy:chart-level:${gaugeSiteId}:${unit}`); } catch {} }} className="p-1 text-violet-800" title="Remove custom level"><X className="h-4 w-4" /></button>}</div>}
    {(hiddenAbove.length > 0 || hiddenBelow.length > 0) && context === 'conditions' && <div className="mb-1 flex flex-wrap gap-2 text-[10px] font-semibold text-neutral-500">{hiddenAbove.map((marker) => <span key={`up-${marker.label}`}>↑ {marker.label} {numberLabel(marker.value, unit)} {unit}</span>)}{hiddenBelow.map((marker) => <span key={`down-${marker.label}`}>↓ {marker.label} {numberLabel(marker.value, unit)} {unit}</span>)}</div>}
    {chart}
    {!compact && <details className="mt-2 text-xs text-neutral-600"><summary className="cursor-pointer font-semibold">Accessible data table</summary><div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-left"><thead className="sticky top-0 bg-white"><tr><th className="py-1">Time</th><th>Stage</th><th>Flow</th><th>Quality</th></tr></thead><tbody>{history.readings.map((reading) => <tr key={reading.timestamp} className="border-t border-neutral-100"><td className="py-1 pr-3">{fullTime(new Date(reading.timestamp).getTime())}</td><td>{reading.gaugeHeightFt === null ? '—' : `${reading.gaugeHeightFt.toFixed(2)} ft`}</td><td>{reading.dischargeCfs === null ? '—' : `${Math.round(reading.dischargeCfs).toLocaleString()} cfs`}</td><td>{(reading.qualifiers ?? []).join(', ') || 'Reported'}</td></tr>)}</tbody></table></div></details>}
  </div>;
}
