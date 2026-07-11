'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { THEME, classifyPercentile } from '@/lib/usgs/mo-statewide-data';
import type { MoHistoryResponse } from '@/app/api/usgs/mo-history/route';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import { MONO } from './shared';

// ─── Sparkline + ribbon (real history) ──────────────────────────────────

export function Sparkline({
  history,
  width = 290,
  height = 80,
}: {
  history: MoHistoryResponse | MoHistoryBundleEntry;
  width?: number;
  height?: number;
}) {
  // Three render modes:
  //  1. Most points have a percentile → plot percentile vs. P25/P50/P75
  //     ribbon. This is the canonical view for established gauges.
  //  2. No percentiles available but discharge is → plot raw CFS. Used by
  //     newer gauges and the secondary curated-river gauges that USGS
  //     hasn't published daily stats for. This is what "river report
  //     data" means in practice for those rows.
  //  3. Stage-only → plot raw ft. Last resort.
  const series = useMemo(() => {
    const daily = 'points' in history ? history.points : history.daily;
    // MoHistoryResponse points carry `timestamp`; the bundle's daily rows use
    // `date` (YYYY-MM-DD). Support both so the hover readout shows a date.
    const dates: (string | null)[] = daily.map((d) => {
      const p = d as { timestamp?: string; date?: string };
      return p.timestamp ?? p.date ?? null;
    });
    const nonNullPct = daily.filter((d) => d.percentile != null).length;
    const wantPercentile = daily.length > 0 && nonNullPct / daily.length >= 0.5;
    if (wantPercentile) {
      const values = daily.map((d) => d.percentile);
      return { mode: 'percentile' as const, values, dates, min: 0, max: 100, unit: '' };
    }
    const cfs = daily.map((d) => d.dischargeCfs);
    if (cfs.some((v) => v != null)) {
      const valid = cfs.filter((v): v is number => v != null);
      const min = Math.min(...valid);
      const max = Math.max(...valid);
      const padded = Math.max(1, max - min);
      // Flow can't go negative — clamp the padded floor at 0 so the axis
      // never shows a nonsense "-511 cfs". (Stage CAN sit below the gauge
      // datum, so the ft mode keeps its symmetric padding.)
      return { mode: 'cfs' as const, values: cfs, dates, min: Math.max(0, min - padded * 0.05), max: max + padded * 0.05, unit: 'cfs' };
    }
    const ft = daily.map((d) => d.gaugeHeightFt);
    if (ft.some((v) => v != null)) {
      const valid = ft.filter((v): v is number => v != null);
      const min = Math.min(...valid);
      const max = Math.max(...valid);
      const padded = Math.max(0.05, max - min);
      return { mode: 'ft' as const, values: ft, dates, min: min - padded * 0.05, max: max + padded * 0.05, unit: 'ft' };
    }
    return null;
  }, [history]);

  // Unique gradient id per instance — multiple sparklines share the DOM.
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  // Hovered data index — drives the crosshair + value/date readout.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!series || series.values.length === 0) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: 10, color: THEME.inkDim,
      }}>
        No readings in the last 30 days
      </div>
    );
  }

  const { mode, values, min, max, unit, dates } = series;
  const range = max - min || 1;
  const xAt = (i: number) =>
    values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
  const yAt = (v: number) => height - 8 - ((v - min) / range) * (height - 16);

  // Build the path, breaking on null gaps so a missing day doesn't draw a
  // misleading straight line across the gap.
  // Split the series into contiguous non-null runs (breaking on gaps), then
  // build the line and a matching filled area from them. The area closes each
  // run down to the baseline so a missing day never fills across the gap.
  const runs: { x: number; y: number }[][] = [];
  {
    let current: { x: number; y: number }[] = [];
    values.forEach((v, i) => {
      if (v == null) {
        if (current.length) { runs.push(current); current = []; }
        return;
      }
      current.push({ x: xAt(i), y: yAt(v) });
    });
    if (current.length) runs.push(current);
  }
  const runToLine = (run: { x: number; y: number }[]) =>
    run.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const linePath = runs.map(runToLine).join(' ');
  const areaPath = runs
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      return `${runToLine(run)} L${last.x.toFixed(1)} ${height} L${first.x.toFixed(1)} ${height} Z`;
    })
    .join(' ');

  // Most recent non-null reading drives the current marker + colour.
  let lastIdx = values.length - 1;
  while (lastIdx >= 0 && values[lastIdx] == null) lastIdx--;
  const cur = lastIdx >= 0 ? values[lastIdx]! : null;
  const curColor = mode === 'percentile' && cur != null
    ? classifyPercentile(cur).color
    : THEME.primary;

  const ribbon = mode === 'percentile'
    ? `M0 ${yAt(75)} L${width} ${yAt(75)} L${width} ${yAt(25)} L0 ${yAt(25)} Z`
    : null;

  // Format a value for the current mode — shared by the corner labels and the
  // hover readout.
  const fmtVal = (v: number) =>
    mode === 'percentile' ? `P${Math.round(v)}`
      : mode === 'cfs' ? `${Math.round(v).toLocaleString()} ${unit}`
        : `${v.toFixed(2)} ${unit}`;

  // Current-value label position. Above the dot by default; when the latest
  // reading IS the 30-day high (a flood spike at the right edge) that puts
  // the baseline above the viewBox and the text renders cut in half — flip
  // it below the dot instead, clamped inside the chart.
  const curLabelY = cur != null
    ? (yAt(cur) - 6 >= 10 ? yAt(cur) - 6 : Math.min(height - 3, yAt(cur) + 14))
    : 0;

  // Map the pointer to the nearest day, snapping past null gaps.
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    let idx = Math.max(0, Math.min(values.length - 1, Math.round(frac * (values.length - 1))));
    if (values[idx] == null) {
      for (let d = 1; d < values.length; d++) {
        if (values[idx - d] != null) { idx -= d; break; }
        if (values[idx + d] != null) { idx += d; break; }
      }
    }
    setHoverIdx(values[idx] != null ? idx : null);
  };

  const hv = hoverIdx != null ? values[hoverIdx] : null;
  const hx = hoverIdx != null ? xAt(hoverIdx) : 0;
  const hColor = mode === 'percentile' && hv != null ? classifyPercentile(hv).color : curColor;
  const hoverDate = hoverIdx != null && dates[hoverIdx]
    ? new Date(dates[hoverIdx] as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const hoverLabel = hv != null ? `${fmtVal(hv)}${hoverDate ? ` · ${hoverDate}` : ''}` : '';

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={curColor} stopOpacity="0.26" />
          <stop offset="100%" stopColor={curColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ribbon && <path d={ribbon} fill="rgba(45,120,137,0.14)" />}
      {mode !== 'percentile' && areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
      {mode === 'percentile' && (
        <>
          <line x1="0" y1={yAt(50)} x2={width} y2={yAt(50)}
            stroke="rgba(45,42,36,0.18)" strokeDasharray="2 3" />
          <line x1="0" y1={yAt(75)} x2={width} y2={yAt(75)} stroke="rgba(45,42,36,0.10)" />
          <line x1="0" y1={yAt(25)} x2={width} y2={yAt(25)} stroke="rgba(45,42,36,0.10)" />
        </>
      )}
      {linePath && <path d={linePath} stroke={curColor} strokeWidth="2.2" fill="none" strokeLinejoin="round" />}
      {cur != null && (
        <circle cx={xAt(lastIdx)} cy={yAt(cur)} r="3.5"
          fill={curColor} stroke="#fff" strokeWidth="1.5" />
      )}
      {mode === 'percentile' ? (
        <>
          <text x="3" y={yAt(75) - 2} fontSize="8" fill={THEME.inkDim} style={{ fontFamily: MONO }}>P75</text>
          <text x="3" y={yAt(25) - 2} fontSize="8" fill={THEME.inkDim} style={{ fontFamily: MONO }}>P25</text>
          {cur != null && (
            <text x={width - 3} y={curLabelY} textAnchor="end"
              fontSize="9" fontWeight="700" fill={curColor}
              stroke="#fff" strokeWidth="3" paintOrder="stroke"
              style={{ fontFamily: MONO }}>
              P{Math.round(cur)}
            </text>
          )}
        </>
      ) : (
        <>
          <text x="3" y={11} fontSize="8" fill={THEME.inkDim}
            stroke="#fff" strokeWidth="2.5" paintOrder="stroke" style={{ fontFamily: MONO }}>
            {fmtVal(max)}
          </text>
          <text x="3" y={height - 3} fontSize="8" fill={THEME.inkDim}
            stroke="#fff" strokeWidth="2.5" paintOrder="stroke" style={{ fontFamily: MONO }}>
            {fmtVal(min)}
          </text>
          {cur != null && (
            <text x={width - 3} y={curLabelY} textAnchor="end"
              fontSize="9" fontWeight="700" fill={curColor}
              stroke="#fff" strokeWidth="3" paintOrder="stroke"
              style={{ fontFamily: MONO }}>
              {fmtVal(cur)}
            </text>
          )}
        </>
      )}
      {hv != null && (
        <g pointerEvents="none">
          <line x1={hx} y1={0} x2={hx} y2={height} stroke="rgba(45,42,36,0.28)" strokeDasharray="2 2" />
          <circle cx={hx} cy={yAt(hv)} r="3.2" fill={hColor} stroke="#fff" strokeWidth="1.5" />
          <text
            x={hx < width / 2 ? hx + 5 : hx - 5}
            y={11}
            textAnchor={hx < width / 2 ? 'start' : 'end'}
            fontSize="9" fontWeight="700" fill={hColor}
            stroke="#fff" strokeWidth="3" paintOrder="stroke"
            style={{ fontFamily: MONO }}
          >
            {hoverLabel}
          </text>
        </g>
      )}
      {/* Transparent hit layer on top captures the pointer for the readout. */}
      <rect
        x="0" y="0" width={width} height={height}
        fill="transparent"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{ cursor: 'crosshair' }}
      />
    </svg>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export function useHistory(siteId: string | null, days = 30): MoHistoryResponse | null {
  const [data, setData] = useState<MoHistoryResponse | null>(null);
  useEffect(() => {
    if (!siteId) { setData(null); return; }
    let aborted = false;
    setData(null);
    fetch(`/api/usgs/mo-history?siteId=${encodeURIComponent(siteId)}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!aborted) setData(j); })
      .catch(() => {});
    return () => { aborted = true; };
  }, [siteId, days]);
  return data;
}

