'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PERCENTILE_CLASSES,
  STAGE_VERDICTS,
  THEME,
  classifyPercentile,
  classifyStageFromThresholds,
  type MORiver,
  type MOCampground,
  type MOAccessPoint,
  type MOPoi,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import type { MoHistoryResponse } from '@/app/api/usgs/mo-history/route';
import type { MoForecastEntry } from '@/app/api/usgs/mo-forecast/route';
import type { GaugeUpdateResponse } from '@/app/api/gauge-update/[siteId]/route';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import type { ConditionCode } from '@/types/api';
import { getEddyImageForCondition } from '@/constants';

const MONO = 'var(--font-mono), ui-monospace, monospace';
const SANS = 'var(--font-body), system-ui, sans-serif';
const DISPLAY = 'var(--font-display), system-ui, sans-serif';

// ─── Header ──────────────────────────────────────────────────────────────

export function HeaderBar({
  generatedAt,
  riverCount,
  gaugeCount,
  campgroundCount,
}: {
  generatedAt: string | null;
  riverCount: number;
  gaugeCount: number;
  campgroundCount: number;
}) {
  const stamp = generatedAt
    ? new Date(generatedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
      <div
        className="pointer-events-auto rounded-md border-2 px-4 py-2.5"
        style={{
          background: THEME.cardBg,
          borderColor: THEME.cardBorder,
          color: THEME.ink,
          boxShadow: `3px 3px 0 ${THEME.cardShadow}`,
        }}
      >
        <div
          className="font-bold"
          style={{
            fontFamily: DISPLAY,
            fontSize: 18,
            letterSpacing: '-0.01em',
            color: THEME.primaryDark,
          }}
        >
          USGS · Missouri Surface Water
        </div>
        <div
          className="mt-0.5 uppercase"
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.12em',
            color: THEME.inkDim,
          }}
        >
          {riverCount} floatable rivers · {gaugeCount} active gauges · {campgroundCount} campgrounds
        </div>
      </div>
      <div
        className="pointer-events-auto rounded-md border-2 px-3 py-2.5"
        style={{
          background: THEME.cardBg,
          borderColor: THEME.cardBorder,
          color: THEME.ink,
          boxShadow: `3px 3px 0 ${THEME.cardShadow}`,
        }}
      >
        <div
          className="uppercase"
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.18em',
            color: THEME.inkDim,
          }}
        >
          Live snapshot
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: THEME.live, boxShadow: `0 0 6px ${THEME.live}` }}
          />
          <span
            className="font-bold"
            style={{ fontFamily: MONO, fontSize: 13, color: THEME.ink }}
          >
            {stamp}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Layer toggles ──────────────────────────────────────────────────────

export function LayerToggles({
  showGauges,
  setShowGauges,
}: {
  showGauges: boolean;
  setShowGauges: (v: boolean) => void;
}) {
  const toggleStyle = (active: boolean) => ({
    background: active ? THEME.primaryDark : THEME.cardBg,
    color: active ? '#F2EAD8' : THEME.ink,
    borderColor: THEME.cardBorder,
    boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
    fontFamily: MONO,
  });
  return (
    <div className="absolute right-3 top-[88px] z-10 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setShowGauges(!showGauges)}
        className="rounded-md border-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:opacity-90"
        style={toggleStyle(showGauges)}
      >
        ◎ Gauges ({showGauges ? 'on' : 'off'})
      </button>
    </div>
  );
}

// ─── Percentile legend ──────────────────────────────────────────────────

// River-condition legend — single source of truth across the page,
// /plan, /rivers/[slug], embeds. Maps each ConditionCode to the same
// CONDITION_COLORS painting the curated rivers and gauge dots.
export function PercentileLegend() {
  // Display order = readability order (driest → wettest).
  // Language matches the per-condition titles on /about so the legend and
  // the explanatory page agree on what each condition means.
  const items: Array<{ code: ConditionCode; short: string; label: string }> = [
    { code: 'too_low',   short: 'Too Low',    label: 'Not recommended' },
    { code: 'low',       short: 'Low',        label: 'Scraping likely' },
    { code: 'good',      short: 'Good',       label: 'Floatable' },
    { code: 'flowing',   short: 'Flowing',    label: 'Ideal conditions' },
    { code: 'high',      short: 'High Water', label: 'Use caution' },
    { code: 'dangerous', short: 'Flood',      label: 'Do not float' },
  ];
  return (
    <div
      className="absolute left-3 z-10 rounded-md border-2 px-3 py-2.5"
      style={{
        top: 96,
        background: THEME.cardBg,
        borderColor: THEME.cardBorder,
        color: THEME.ink,
        boxShadow: `3px 3px 0 ${THEME.cardShadow}`,
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      <div
        className="uppercase font-bold"
        style={{
          fontSize: 9,
          letterSpacing: '0.15em',
          color: THEME.inkDim,
          marginBottom: 6,
        }}
      >
        River conditions
      </div>
      {items.map((it) => (
        <div key={it.code} className="mb-0.5 flex items-center gap-2">
          <span style={{ width: 18, height: 4, background: STAGE_VERDICTS[it.code].color, borderRadius: 2 }} />
          <span className="font-semibold" style={{ width: 74 }}>{it.short}</span>
          <span style={{ color: THEME.inkDim }}>{it.label}</span>
        </div>
      ))}
      <div
        className="mt-2 border-t pt-2"
        style={{
          borderColor: '#DBD5CA',
          fontSize: 9,
          color: THEME.inkDim,
          letterSpacing: '0.05em',
        }}
      >
        Each river segment fades into the next gauge&apos;s color along the line.
      </div>
    </div>
  );
}

// ─── Statewide summary ──────────────────────────────────────────────────

export function StatewideSummary({
  rivers,
  percentileByRiver,
  verdictByRiver,
}: {
  rivers: MORiver[];
  percentileByRiver: Record<string, number | null>;
  verdictByRiver: Record<string, StageVerdict>;
}) {
  const verdictCounts = useMemo(() => {
    const c: Record<StageVerdict, number> = {
      too_low: 0, low: 0, good: 0, flowing: 0, high: 0, dangerous: 0, unknown: 0,
    };
    for (const r of rivers) c[verdictByRiver[r.slug] ?? 'unknown']++;
    return c;
  }, [rivers, verdictByRiver]);

  const percentileCounts = useMemo(() => {
    const c = { low: 0, below: 0, normal: 0, above: 0, high: 0, unknown: 0 };
    for (const r of rivers) {
      const p = percentileByRiver[r.slug];
      if (p == null) c.unknown++;
      else if (p < 10) c.low++;
      else if (p < 25) c.below++;
      else if (p < 75) c.normal++;
      else if (p < 90) c.above++;
      else c.high++;
    }
    return c;
  }, [rivers, percentileByRiver]);

  // Order matches the ConditionCode display order used elsewhere in the
  // app (CONDITION_COLORS / CONDITION_LABELS in src/constants).
  const items = [
    { label: 'Too low',  n: verdictCounts.too_low,   color: STAGE_VERDICTS.too_low.color },
    { label: 'Low',      n: verdictCounts.low,       color: STAGE_VERDICTS.low.color },
    { label: 'Good',     n: verdictCounts.good,      color: STAGE_VERDICTS.good.color },
    { label: 'Flowing',  n: verdictCounts.flowing,   color: STAGE_VERDICTS.flowing.color },
    { label: 'High',     n: verdictCounts.high,      color: STAGE_VERDICTS.high.color },
    { label: 'Flood',    n: verdictCounts.dangerous, color: STAGE_VERDICTS.dangerous.color },
  ];

  return (
    <div
      className="absolute left-3 z-10 rounded-md border-2 px-3.5 py-3"
      style={{
        bottom: 156,
        background: THEME.cardBg,
        borderColor: THEME.cardBorder,
        color: THEME.ink,
        boxShadow: `3px 3px 0 ${THEME.cardShadow}`,
        fontFamily: MONO,
      }}
    >
      <div
        className="uppercase font-bold"
        style={{
          fontSize: 9,
          letterSpacing: '0.15em',
          color: THEME.inkDim,
          marginBottom: 8,
        }}
      >
        Floater verdict · right now
      </div>
      <div className="flex gap-3.5">
        {items.map((it) => (
          <div key={it.label} className="text-center">
            <div className="font-bold" style={{ fontSize: 22, lineHeight: 1, color: it.color }}>
              {it.n}
            </div>
            <div
              className="mt-1 uppercase font-semibold"
              style={{ fontSize: 8.5, letterSpacing: '0.08em', color: THEME.inkDim }}
            >
              {it.label}
            </div>
          </div>
        ))}
      </div>
      <div
        className="mt-2 border-t pt-2 flex gap-3"
        style={{ borderColor: '#DBD5CA', fontSize: 9, color: THEME.inkDim }}
      >
        <span>Hydrology:</span>
        <span style={{ color: PERCENTILE_CLASSES[0].color }}>{percentileCounts.low + percentileCounts.below} low</span>
        <span style={{ color: PERCENTILE_CLASSES[2].color }}>{percentileCounts.normal} normal</span>
        <span style={{ color: PERCENTILE_CLASSES[3].color }}>{percentileCounts.above + percentileCounts.high} high</span>
      </div>
    </div>
  );
}

// ─── Sparkline + ribbon (real history) ──────────────────────────────────

function Sparkline({
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
    const nonNullPct = daily.filter((d) => d.percentile != null).length;
    const wantPercentile = daily.length > 0 && nonNullPct / daily.length >= 0.5;
    if (wantPercentile) {
      const values = daily.map((d) => d.percentile);
      return { mode: 'percentile' as const, values, min: 0, max: 100, unit: '' };
    }
    const cfs = daily.map((d) => d.dischargeCfs);
    if (cfs.some((v) => v != null)) {
      const valid = cfs.filter((v): v is number => v != null);
      const min = Math.min(...valid);
      const max = Math.max(...valid);
      const padded = Math.max(1, max - min);
      return { mode: 'cfs' as const, values: cfs, min: min - padded * 0.05, max: max + padded * 0.05, unit: 'cfs' };
    }
    const ft = daily.map((d) => d.gaugeHeightFt);
    if (ft.some((v) => v != null)) {
      const valid = ft.filter((v): v is number => v != null);
      const min = Math.min(...valid);
      const max = Math.max(...valid);
      const padded = Math.max(0.05, max - min);
      return { mode: 'ft' as const, values: ft, min: min - padded * 0.05, max: max + padded * 0.05, unit: 'ft' };
    }
    return null;
  }, [history]);

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

  const { mode, values, min, max, unit } = series;
  const range = max - min || 1;
  const xAt = (i: number) =>
    values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
  const yAt = (v: number) => height - 8 - ((v - min) / range) * (height - 16);

  // Build the path, breaking on null gaps so a missing day doesn't draw a
  // misleading straight line across the gap.
  const linePath = (() => {
    let d = '';
    let penDown = false;
    values.forEach((v, i) => {
      if (v == null) { penDown = false; return; }
      const cmd = penDown ? 'L' : 'M';
      d += `${cmd}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `;
      penDown = true;
    });
    return d.trim();
  })();

  // Most recent non-null reading drives the current marker + colour.
  let lastIdx = values.length - 1;
  while (lastIdx >= 0 && values[lastIdx] == null) lastIdx--;
  const cur = lastIdx >= 0 ? values[lastIdx]! : null;
  const curColor = mode === 'percentile' && cur != null
    ? classifyPercentile(cur).color
    : THEME.primaryDark;

  const ribbon = mode === 'percentile'
    ? `M0 ${yAt(75)} L${width} ${yAt(75)} L${width} ${yAt(25)} L0 ${yAt(25)} Z`
    : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {ribbon && <path d={ribbon} fill="rgba(45,120,137,0.14)" />}
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
            <text x={width - 3} y={yAt(cur) - 6} textAnchor="end"
              fontSize="9" fontWeight="700" fill={curColor} style={{ fontFamily: MONO }}>
              P{Math.round(cur)}
            </text>
          )}
        </>
      ) : (
        <>
          <text x="3" y={11} fontSize="8" fill={THEME.inkDim} style={{ fontFamily: MONO }}>
            {mode === 'cfs' ? `${Math.round(max)} ${unit}` : `${max.toFixed(2)} ${unit}`}
          </text>
          <text x="3" y={height - 3} fontSize="8" fill={THEME.inkDim} style={{ fontFamily: MONO }}>
            {mode === 'cfs' ? `${Math.round(min)} ${unit}` : `${min.toFixed(2)} ${unit}`}
          </text>
          {cur != null && (
            <text x={width - 3} y={yAt(cur) - 6} textAnchor="end"
              fontSize="9" fontWeight="700" fill={curColor} style={{ fontFamily: MONO }}>
              {mode === 'cfs' ? `${Math.round(cur)} ${unit}` : `${cur.toFixed(2)} ${unit}`}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────────

function useHistory(siteId: string | null, days = 30): MoHistoryResponse | null {
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

// ─── Threshold provenance + 72h forecast peak block ────────────────────

function ThresholdProvenance({
  thresholds,
  forecast,
  currentValueFt,
}: {
  thresholds: {
    flood_stage_ft: number | null;
    action_stage_ft: number | null;
    threshold_source: string | null;
    threshold_source_url: string | null;
  };
  forecast: MoForecastEntry | null;
  currentValueFt: number | null;
}) {
  const hasStages = thresholds.flood_stage_ft != null || thresholds.action_stage_ft != null;
  const hasForecast = forecast?.peakFt != null && forecast.peakAt != null;
  if (!hasStages && !hasForecast) return null;

  const sourceLabel = (() => {
    switch (thresholds.threshold_source) {
      case 'usgs': return 'USGS';
      case 'nws_ahps': return 'NWS AHPS';
      case 'outfitter': return 'Outfitter';
      case 'editorial': return 'Editorial';
      default: return null;
    }
  })();

  const peakFlooding =
    forecast?.peakFt != null &&
    thresholds.flood_stage_ft != null &&
    forecast.peakFt >= thresholds.flood_stage_ft;
  const peakAction =
    forecast?.peakFt != null &&
    thresholds.action_stage_ft != null &&
    forecast.peakFt >= thresholds.action_stage_ft &&
    !peakFlooding;
  const liveFlooding =
    currentValueFt != null &&
    thresholds.flood_stage_ft != null &&
    currentValueFt >= thresholds.flood_stage_ft;

  const hazardTone = STAGE_VERDICTS.dangerous.color;
  const cautionTone = STAGE_VERDICTS.high.color;

  return (
    <div
      className="mt-2 rounded-md border-2 px-3 py-2"
      style={{
        background: '#F4EFE7',
        borderColor: '#A49C8E',
        fontFamily: MONO,
      }}
    >
      {hasStages && (
        <div
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          style={{ fontSize: 10.5, color: THEME.ink }}
        >
          {thresholds.flood_stage_ft != null && (
            <span style={{ color: liveFlooding ? hazardTone : THEME.ink, fontWeight: liveFlooding ? 700 : 500 }}>
              Flood {thresholds.flood_stage_ft.toFixed(1)} ft
            </span>
          )}
          {thresholds.action_stage_ft != null && (
            <span>Action {thresholds.action_stage_ft.toFixed(1)} ft</span>
          )}
          {sourceLabel && (
            <span style={{ color: THEME.inkDim, marginLeft: 'auto' }}>
              Source:{' '}
              {thresholds.threshold_source_url ? (
                <a
                  href={thresholds.threshold_source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: THEME.primary, textDecoration: 'underline' }}
                >
                  {sourceLabel}
                </a>
              ) : (
                sourceLabel
              )}
            </span>
          )}
        </div>
      )}
      {hasForecast && (
        <div
          className="mt-1 flex items-baseline gap-2"
          style={{
            fontSize: 10,
            color: peakFlooding ? hazardTone : peakAction ? cautionTone : THEME.inkDim,
            fontWeight: peakFlooding || peakAction ? 700 : 500,
          }}
        >
          <span className="uppercase" style={{ letterSpacing: '0.1em' }}>
            72h peak
          </span>
          <span>
            {forecast!.peakFt!.toFixed(2)} ft ·{' '}
            {new Date(forecast!.peakAt!).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
            })}
          </span>
          {peakFlooding && <span style={{ marginLeft: 'auto' }}>Above flood stage</span>}
          {peakAction && !peakFlooding && (
            <span style={{ marginLeft: 'auto' }}>Above action stage</span>
          )}
        </div>
      )}
    </div>
  );
}

function KV({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-md border-2 px-2 py-1.5"
      style={{ background: '#F4EFE7', borderColor: '#A49C8E' }}
    >
      <div
        className="uppercase font-bold"
        style={{ fontSize: 8.5, letterSpacing: '0.1em', color: THEME.inkDim, fontFamily: MONO }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 font-bold"
        style={{ fontSize: 13, color: THEME.ink, fontFamily: MONO }}
      >
        {value}{sub && (
          <span style={{ fontSize: 10, fontWeight: 500, color: THEME.inkDim, marginLeft: 4 }}>{sub}</span>
        )}
      </div>
    </div>
  );
}

// ─── Right rail: river / gauge / campground / POI / access detail ──────

export function RightRail({
  river,
  primaryGauge,
  primaryHistory,
  focusedGauge,
  focusedGaugeVerdict,
  campground,
  accessPoint,
  poi,
  forecastBySite,
  onClose,
  onCloseGauge,
  onAccessPointClick,
}: {
  river: MORiver | null;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
  focusedGauge: MoStatewideGauge | null;
  /** Editorial-thresholds verdict computed in the parent. Falls back to
   *  the percentile/USGS label when null (e.g. statewide gauges with no
   *  curated river binding). */
  focusedGaugeVerdict: StageVerdict | null;
  campground: MOCampground | null;
  accessPoint: { ap: MOAccessPoint; river: MORiver } | null;
  poi: { poi: MOPoi; river: MORiver | null } | null;
  forecastBySite: Record<string, MoForecastEntry>;
  /** Closes the rail entirely (river + gauge). Used by RiverCard's ×. */
  onClose: () => void;
  /** Closes JUST the gauge focus, falling back to the river card.
   *  Without this, "Close" on a gauge collapses the river too, which
   *  felt like a broken navigation step. */
  onCloseGauge?: () => void;
  onAccessPointClick?: (id: string) => void;
}) {
  if (focusedGauge) {
    return (
      <GaugeDetail
        gauge={focusedGauge}
        verdict={focusedGaugeVerdict}
        forecast={forecastBySite[focusedGauge.site_no] ?? null}
        onClose={onCloseGauge ?? onClose}
      />
    );
  }
  if (campground) {
    return <CampgroundCard campground={campground} onClose={onClose} />;
  }
  if (accessPoint) {
    return <AccessPointCard ap={accessPoint.ap} river={accessPoint.river} onClose={onClose} />;
  }
  if (poi) {
    return <PoiCard poi={poi.poi} river={poi.river} onClose={onClose} />;
  }
  if (river) {
    const primary = (river.gauges ?? []).find((g) => g.is_primary);
    const forecast = primary ? forecastBySite[primary.site_id] ?? null : null;
    return (
      <RiverCard
        river={river}
        primaryGauge={primaryGauge}
        primaryHistory={primaryHistory}
        forecast={forecast}
        onClose={onClose}
        onAccessPointClick={onAccessPointClick}
      />
    );
  }
  return null;
}

const RAIL_BASE_STYLE: React.CSSProperties = {
  background: THEME.cardBg,
  borderColor: THEME.cardBorder,
  fontFamily: SANS,
  boxShadow: `4px 4px 0 ${THEME.cardShadow}`,
};

function RiverCard({
  river,
  primaryGauge,
  primaryHistory,
  forecast,
  onClose,
  onAccessPointClick,
}: {
  river: MORiver;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
  forecast: MoForecastEntry | null;
  onClose?: () => void;
  /** When set, access-point rows in the rail become clickable buttons
   *  that open the detail modal for that access point. */
  onAccessPointClick?: (id: string) => void;
}) {
  const primaryThresholds = (river.gauges ?? []).find((x) => x.is_primary) ?? null;
  // Use the canonical classifier so this badge matches /rivers/[slug] for
  // the same gauge reading. Falls back to forecast peak when the live
  // value is below flood stage but the next 72h forecast crosses it.
  const verdict: StageVerdict = (() => {
    if (!primaryGauge || !primaryThresholds) return 'unknown';
    const value = primaryThresholds.threshold_unit === 'cfs'
      ? primaryGauge.dischargeCfs
      : primaryGauge.gaugeHeightFt;
    if (value == null) return 'unknown';
    if (
      primaryThresholds.threshold_unit === 'ft' &&
      primaryThresholds.flood_stage_ft != null &&
      Math.max(value, forecast?.peakFt ?? Number.NEGATIVE_INFINITY) >= primaryThresholds.flood_stage_ft
    ) {
      return 'dangerous';
    }
    return classifyStageFromThresholds(value, primaryThresholds.threshold_unit, primaryThresholds);
  })();
  const tone = STAGE_VERDICTS[verdict];

  const allAccess = river.access_points ?? [];
  const [showAllAccess, setShowAllAccess] = useState(false);
  const accessSummary = showAllAccess ? allAccess : allAccess.slice(0, 4);

  return (
    <div
      className="absolute right-3 z-20 w-[360px] overflow-auto rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 96, bottom: 156 }}
    >
      {onClose && (
        <div className="absolute right-3 top-3">
          <CloseBtn onClose={onClose} />
        </div>
      )}
      <div
        className="uppercase font-bold pr-9"
        style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}
      >
        {river.region ?? '—'} · {river.length_miles?.toFixed(0) ?? '—'} mi
      </div>
      <div className="mt-1 font-bold leading-tight pr-9"
        style={{ fontSize: 22, color: THEME.primaryDark, fontFamily: DISPLAY }}>
        {river.name}
      </div>

      <div
        className="mt-3 flex items-baseline gap-2.5 rounded-md px-3 py-2.5"
        style={{ background: tone.color, color: '#FAF8F4' }}
      >
        <span className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22 }}>
          {primaryGauge?.gaugeHeightFt != null
            ? `${primaryGauge.gaugeHeightFt.toFixed(2)} ft`
            : '— ft'}
        </span>
        <span className="font-bold uppercase"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>
          {tone.label}
        </span>
        <span className="ml-auto" style={{ fontSize: 11, opacity: 0.9 }}>{tone.desc}</span>
      </div>

      {primaryThresholds && (
        <ThresholdProvenance
          thresholds={primaryThresholds}
          forecast={forecast}
          currentValueFt={primaryGauge?.gaugeHeightFt ?? null}
        />
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <KV label="Flow"
          value={primaryGauge?.dischargeCfs != null ? `${Math.round(primaryGauge.dischargeCfs)}` : '—'}
          sub="cfs" />
        <KV label="Percentile"
          value={primaryGauge?.percentile != null ? `P${Math.round(primaryGauge.percentile)}` : '—'} />
        <KV label="Gauges" value={`${(river.gauges ?? []).length}`} />
      </div>

      <div className="mt-4">
        <div
          className="uppercase font-bold"
          style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: THEME.inkDim,
            marginBottom: 4,
          }}
        >
          30-day CFS · primary gauge
        </div>
        <div
          className="rounded-md border-2 p-2.5"
          style={{ background: '#F4EFE7', borderColor: '#A49C8E' }}
        >
          {primaryHistory ? (
            <Sparkline history={primaryHistory} width={310} height={90} />
          ) : (
            <div
              style={{
                height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 10, color: THEME.inkDim,
              }}
            >
              Loading history…
            </div>
          )}
        </div>
        {primaryHistory?.band && (
          <div
            className="mt-1.5"
            style={{ fontFamily: MONO, fontSize: 9.5, color: THEME.inkDim }}
          >
            Period-of-record envelope (P25–P75) shaded.
            {primaryHistory.band.p50 != null && (
              <> Median for today: {Math.round(primaryHistory.band.p50)} cfs.</>
            )}
          </div>
        )}
      </div>

      {allAccess.length > 0 && (
        <div className="mt-4">
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: THEME.inkDim,
              marginBottom: 6,
            }}
          >
            Access points · {allAccess.length}
          </div>
          <div className="space-y-1">
            {accessSummary.map((a) => {
              const clickable = !!onAccessPointClick;
              const Row = clickable ? 'button' : 'div';
              return (
                <Row
                  key={a.id}
                  type={clickable ? 'button' : undefined}
                  onClick={clickable ? () => onAccessPointClick(a.id) : undefined}
                  className={`flex w-full items-center justify-between rounded-sm px-2 py-1 text-left ${clickable ? 'hover:bg-[#EAE0CC] cursor-pointer' : ''}`}
                  style={{ background: '#F4EFE7', fontFamily: MONO, fontSize: 11, transition: 'background 120ms' }}
                >
                  <span className="truncate" style={{ color: THEME.ink }}>{a.name}</span>
                  <span style={{ color: THEME.inkDim, marginLeft: 6, whiteSpace: 'nowrap' }}>
                    mi {a.river_mile_downstream != null ? a.river_mile_downstream.toFixed(1) : '—'}
                    {clickable && <span aria-hidden style={{ marginLeft: 6, color: THEME.inkDim }}>›</span>}
                  </span>
                </Row>
              );
            })}
          </div>
          {allAccess.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllAccess((v) => !v)}
              className="mt-1 cursor-pointer hover:underline"
              style={{ fontFamily: MONO, fontSize: 10, color: THEME.inkDim, letterSpacing: '0.05em' }}
            >
              {showAllAccess ? `Show top 4` : `Show all ${allAccess.length}`}
            </button>
          )}
        </div>
      )}

      {river.pois && river.pois.length > 0 && (
        <div className="mt-4">
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: THEME.inkDim,
              marginBottom: 6,
            }}
          >
            On-river highlights
          </div>
          <div className="space-y-1">
            {river.pois.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-sm px-2 py-1"
                style={{ background: '#F4EFE7', fontFamily: MONO, fontSize: 11 }}
              >
                <span className="truncate" style={{ color: THEME.ink }}>
                  {p.name}
                </span>
                <span style={{ color: THEME.inkDim, marginLeft: 6, textTransform: 'capitalize' }}>
                  {p.type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="cursor-pointer rounded-md border-2 bg-white"
      style={{
        width: 26, height: 26, borderColor: THEME.cardBorder,
        fontFamily: MONO, fontSize: 14, color: THEME.ink,
        boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
      }}
    >
      ×
    </button>
  );
}

function GaugeDetail({
  gauge,
  verdict,
  forecast,
  onClose,
}: {
  gauge: MoStatewideGauge;
  verdict: StageVerdict | null;
  forecast: MoForecastEntry | null;
  onClose: () => void;
}) {
  const cls = gauge.percentile != null ? classifyPercentile(gauge.percentile) : null;
  const history = useHistory(gauge.site_no);
  const eddy = useGaugeRailReport(gauge);
  // Prefer the editorial verdict (matches the marker color + the rest of
  // the app); fall back to the USGS percentile classification when the
  // gauge has no curated thresholds.
  const verdictInfo = verdict ? STAGE_VERDICTS[verdict] : null;
  const headlineColor = verdictInfo?.color ?? cls?.color ?? '#857D70';
  const headlineLabel = verdictInfo?.label ?? cls?.label ?? 'No condition data';
  const headlineValue = verdict
    ? (gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : '—')
    : (gauge.percentile != null ? `P${Math.round(gauge.percentile)}` : '—');
  return (
    <div
      className="absolute right-3 z-30 w-[360px] overflow-auto rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 96, bottom: 156 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim,
            }}
          >
            USGS Site #{gauge.site_no}
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {gauge.river_name}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <div
        className="mt-3 flex items-baseline gap-3 rounded-md px-3 py-2.5"
        style={{ background: headlineColor, color: '#FAF8F4' }}
      >
        <div className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22 }}>
          {headlineValue}
        </div>
        <div style={{ fontSize: 13, opacity: 0.95, fontWeight: 600 }}>{headlineLabel}</div>
      </div>

      <EddyReportCard report={eddy} />

      <ThresholdProvenance
        thresholds={{
          flood_stage_ft: gauge.flood_stage_ft,
          action_stage_ft: gauge.action_stage_ft,
          threshold_source: gauge.threshold_source,
          threshold_source_url: gauge.threshold_source_url,
        }}
        forecast={forecast}
        currentValueFt={gauge.gaugeHeightFt}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <KV label="Flow"
          value={gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)}` : '—'} sub="cfs" />
        <KV label="Stage"
          value={gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)}` : '—'} sub="ft" />
        <KV label="Percentile"
          value={gauge.percentile != null ? `P${Math.round(gauge.percentile)}` : '—'} />
        <KV label="Years on record"
          value={gauge.stats?.yearsOfRecord != null ? `${Math.round(gauge.stats.yearsOfRecord)}` : '—'} />
      </div>

      <div className="mt-3 uppercase font-bold"
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: THEME.inkDim }}>
        30-day CFS
      </div>
      <div
        className="mt-1 rounded-md border-2 p-2.5"
        style={{ background: '#F4EFE7', borderColor: '#A49C8E' }}
      >
        {history ? <Sparkline history={history} width={310} height={120} /> : (
          <div style={{
            height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO, fontSize: 10, color: THEME.inkDim,
          }}>Loading…</div>
        )}
      </div>

      <div
        className="mt-3 border-t pt-2.5"
        style={{
          borderTop: `1px dashed ${THEME.cardBorder}`,
          fontFamily: MONO, fontSize: 10, lineHeight: 1.5, color: THEME.inkDim,
        }}
      >
        Source: USGS NWIS · IV/DV/STAT endpoints. Percentile rank is computed against
        this gauge&apos;s daily period of record for today&apos;s calendar date.
      </div>
    </div>
  );
}

// "Eddy says" payload rendered in the gauge rail. Both endpoints feed
// the same card, so we normalize to a minimal shape that matches what
// EddyReportCard reads.
export type EddyReport = {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
  generatedAt: string;
};

// Module-level cache so a gauge fetched once (rail open or first hover)
// stays warm for subsequent hovers. Cleared on full reload; that's fine —
// reports refresh daily and the cron writes a new row, not a delta.
const reportCache = new Map<string, EddyReport | null>();
const inflight = new Map<string, Promise<EddyReport | null>>();

function fetchReport(gauge: MoStatewideGauge): Promise<EddyReport | null> {
  const key = `${gauge.is_primary ? 'p' : 's'}:${gauge.is_primary ? gauge.river_slug : gauge.site_no}`;
  if (reportCache.has(key)) return Promise.resolve(reportCache.get(key) ?? null);
  const existing = inflight.get(key);
  if (existing) return existing;
  const url = gauge.is_primary
    ? `/api/eddy-update/${encodeURIComponent(gauge.river_slug)}`
    : `/api/gauge-update/${encodeURIComponent(gauge.site_no)}`;
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: EddyUpdateResponse | GaugeUpdateResponse | null) => {
      if (!j?.available || !j.update) {
        reportCache.set(key, null);
        return null;
      }
      const norm: EddyReport = {
        quoteText: j.update.quoteText,
        summaryText: j.update.summaryText,
        conditionCode: j.update.conditionCode,
        generatedAt: j.update.generatedAt,
      };
      reportCache.set(key, norm);
      return norm;
    })
    .catch(() => { reportCache.set(key, null); return null; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

// Primary gauges share the river-level Sonnet update from /api/eddy-update
// (one canonical narrative per river). Secondary gauges have their own
// Haiku update from /api/gauge-update. The card looks identical either way;
// only the source endpoint differs.
function useGaugeRailReport(gauge: MoStatewideGauge | null): EddyReport | null | undefined {
  const cached = useMemo(() => {
    if (!gauge) return undefined;
    const key = `${gauge.is_primary ? 'p' : 's'}:${gauge.is_primary ? gauge.river_slug : gauge.site_no}`;
    return reportCache.has(key) ? reportCache.get(key) ?? null : undefined;
    // Same rationale as the effect below: depend on identifying fields,
    // not the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gauge?.site_no, gauge?.is_primary, gauge?.river_slug]);
  const [report, setReport] = useState<EddyReport | null | undefined>(cached);
  useEffect(() => {
    if (!gauge) { setReport(undefined); return; }
    if (cached !== undefined) { setReport(cached); return; }
    let cancelled = false;
    setReport(undefined);
    fetchReport(gauge).then((r) => { if (!cancelled) setReport(r); });
    return () => { cancelled = true; };
    // Refetch only when the identifying fields change. Re-running on every
    // new `gauge` object reference would re-fire on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gauge?.site_no, gauge?.is_primary, gauge?.river_slug]);
  return report;
}

function EddyReportCard({ report }: { report: EddyReport | null | undefined }) {
  const [showFull, setShowFull] = useState(false);
  if (report === undefined) {
    return (
      <div
        className="mt-3 rounded-md border-2 p-3"
        style={{ background: '#F4EFE7', borderColor: '#A49C8E', fontFamily: MONO, fontSize: 11, color: THEME.inkDim }}
      >
        Loading Eddy&apos;s read on this gauge…
      </div>
    );
  }
  if (report === null) {
    // No update yet (cron hasn't run for this gauge, or it's a primary
    // covered by the river-level Sonnet update). Skip silently — the rest
    // of the card already explains the reading.
    return null;
  }
  const verdict = STAGE_VERDICTS[report.conditionCode as StageVerdict] ?? STAGE_VERDICTS.unknown;
  return (
    <div
      className="mt-3 rounded-md border-2 p-3"
      style={{
        background: '#FAF8F4',
        borderColor: THEME.cardBorder,
        boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="uppercase font-bold"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}
        >
          Eddy says
        </span>
        <span
          style={{
            background: verdict.color,
            color: '#FAF8F4',
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.1em',
            padding: '1px 6px',
            borderRadius: 3,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          {verdict.label}
        </span>
      </div>
      {report.summaryText && (
        <p
          className="mt-2 leading-snug"
          style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: THEME.primaryDark }}
        >
          “{report.summaryText}”
        </p>
      )}
      {(showFull || !report.summaryText) && (
        <p
          className="mt-2 leading-snug"
          style={{ fontFamily: SANS, fontSize: 12, color: THEME.ink }}
        >
          {report.quoteText}
        </p>
      )}
      {report.summaryText && (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="mt-2 uppercase font-bold transition-opacity hover:opacity-70"
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.15em',
            color: THEME.inkDim,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {showFull ? 'Show less' : 'Show full report'}
        </button>
      )}
    </div>
  );
}

function CampgroundCard({
  campground, onClose,
}: { campground: MOCampground; onClose: () => void }) {
  return (
    <div
      className="absolute right-3 z-30 w-[330px] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 96 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}>
            NPS · Ozark Riverways
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {campground.name}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <KV label="Total" value={`${campground.total_sites ?? 0}`} sub="sites" />
        <KV label="Reservable" value={`${campground.sites_reservable ?? 0}`} />
        <KV label="First-come" value={`${campground.sites_first_come ?? 0}`} />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {campground.reservation_url && (
          <a
            href={campground.reservation_url}
            target="_blank" rel="noreferrer"
            className="rounded-md border-2 px-3 py-2 text-center text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: THEME.live, color: '#FAF8F4', borderColor: THEME.cardBorder,
              fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
            }}
          >
            Reserve · recreation.gov
          </a>
        )}
        {campground.nps_url && (
          <a
            href={campground.nps_url}
            target="_blank" rel="noreferrer"
            className="rounded-md border-2 px-3 py-2 text-center text-[11px] uppercase tracking-[0.1em]"
            style={{
              background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
              fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
            }}
          >
            NPS page →
          </a>
        )}
      </div>
    </div>
  );
}

function AccessPointCard({
  ap, river, onClose,
}: { ap: MOAccessPoint; river: MORiver; onClose: () => void }) {
  return (
    <div
      className="absolute right-3 z-30 w-[330px] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 96 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}>
            {ap.ownership ?? 'Public'} · access
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {ap.name}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 11, marginTop: 2, color: THEME.inkDim,
          }}>
            {river.name} · mile {ap.river_mile_downstream?.toFixed(1) ?? '—'}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <a
        href={`/rivers/${river.slug}`}
        className="mt-3 inline-block rounded-md border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{
          background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
          fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
        }}
      >
        Plan a float on {river.name} →
      </a>
    </div>
  );
}

function PoiCard({
  poi, river, onClose,
}: { poi: MOPoi; river: MORiver | null; onClose: () => void }) {
  return (
    <div
      className="absolute right-3 z-30 w-[330px] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 96 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}>
            {poi.type.replace('_', ' ')}
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {poi.name}
          </div>
          {river && (
            <div style={{
              fontFamily: MONO, fontSize: 11, marginTop: 2, color: THEME.inkDim,
            }}>
              {river.name}{poi.river_mile != null ? ` · mile ${poi.river_mile.toFixed(1)}` : ''}
            </div>
          )}
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      {poi.description && (
        <div className="mt-3" style={{ fontSize: 12, lineHeight: 1.5, color: THEME.ink }}>
          {poi.description.length > 280 ? `${poi.description.slice(0, 280)}…` : poi.description}
        </div>
      )}
      {poi.nps_url && (
        <a
          href={poi.nps_url}
          target="_blank" rel="noreferrer"
          className="mt-3 inline-block rounded-md border-2 px-3 py-2 text-[11px] uppercase tracking-[0.1em]"
          style={{
            background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
            fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
          }}
        >
          Read on NPS.gov →
        </a>
      )}
    </div>
  );
}

// ─── Time scrubber driven by real per-day percentile array ──────────────

export function TimeScrubber({
  dayOffset,
  setDayOffset,
  history,
  rivers,
}: {
  dayOffset: number;
  setDayOffset: (v: number) => void;
  history: MoHistoryBundleEntry[];
  rivers: MORiver[];
}) {
  const RANGE = 30;

  // Aggregate statewide-mean percentile per day for the trendline.
  const trend = useMemo(() => {
    if (!history.length) return [] as Array<{ x: number; y: number }>;
    const byDay = new Map<string, number[]>();
    for (const e of history) {
      for (const d of e.daily) {
        if (d.percentile == null) continue;
        const arr = byDay.get(d.date) ?? [];
        arr.push(d.percentile);
        byDay.set(d.date, arr);
      }
    }
    const dates = Array.from(byDay.keys()).sort();
    return dates.map((date, i) => {
      const arr = byDay.get(date)!;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return { x: i, y: mean };
    });
  }, [history]);

  const dayCount = trend.length || RANGE;

  // Look up the verdict-band for each day across all rivers, for tiny
  // segmented stripes underneath the trendline.
  const dailyBands = useMemo(() => {
    if (!history.length) return [] as Array<{ x: number; counts: { p25: number; normal: number; p75: number; p90: number; low: number } }>;
    const days = history[0].daily.map((d) => d.date);
    return days.map((_date, i) => {
      const counts = { low: 0, p25: 0, normal: 0, p75: 0, p90: 0 };
      for (const e of history) {
        const p = e.daily[i]?.percentile;
        if (p == null) continue;
        if (p < 10) counts.low++;
        else if (p < 25) counts.p25++;
        else if (p < 75) counts.normal++;
        else if (p < 90) counts.p75++;
        else counts.p90++;
      }
      return { x: i, counts };
    });
  }, [history]);

  const W = 1500, H = 64;
  const xAt = (i: number) => (i / Math.max(1, dayCount - 1)) * W;
  const yAt = (p: number) => H - 6 - (p / 100) * (H - 12);

  const linePath = trend.length
    ? trend.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xAt(pt.x).toFixed(1)} ${yAt(pt.y).toFixed(1)}`).join(' ')
    : '';
  const fillPath = trend.length
    ? linePath + ` L ${xAt(trend[trend.length - 1].x)} ${H} L 0 ${H} Z`
    : '';

  // dayOffset is negative (-30..0). Map to 0..dayCount-1.
  const indexFromOffset = (off: number) =>
    Math.round(((dayCount - 1) * (RANGE + off)) / RANGE);
  const offsetFromIndex = (idx: number) =>
    Math.round((idx / Math.max(1, dayCount - 1)) * RANGE) - RANGE;

  void rivers;

  return (
    <div
      className="absolute inset-x-3 z-20 rounded-md border-2 px-4 pb-3 pt-2.5"
      style={{
        bottom: 12, height: 130,
        background: THEME.primaryDark,
        borderColor: THEME.cardBorder,
        color: THEME.parchment,
        boxShadow: `4px 4px 0 ${THEME.cardShadow}`,
      }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <span
            className="font-bold uppercase"
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.15em', color: '#F2EAD8' }}
          >
            30-day timeline
          </span>
          <span
            className="ml-3"
            style={{
              fontFamily: MONO, fontSize: 10, color: 'rgba(242,234,216,0.6)',
            }}
          >
            {history.length
              ? 'drag to replay how every river ran across the past month'
              : 'historical readings still loading…'}
          </span>
        </div>
        <div
          className="uppercase font-bold"
          style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: THEME.live,
          }}
        >
          {dayOffset === 0 ? 'TODAY' : `${Math.abs(dayOffset)}d ago`}
        </div>
      </div>

      <div className="relative" style={{ height: 80 }}>
        <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full">
          <line x1="0" y1={yAt(50)} x2={W} y2={yAt(50)}
            stroke="rgba(242,234,216,0.18)" strokeDasharray="3 4" />
          <line x1="0" y1={yAt(75)} x2={W} y2={yAt(75)}
            stroke="rgba(242,234,216,0.10)" />
          <line x1="0" y1={yAt(25)} x2={W} y2={yAt(25)}
            stroke="rgba(242,234,216,0.10)" />

          {fillPath && <path d={fillPath} fill="rgba(74,154,173,0.20)" />}
          {linePath && <path d={linePath} stroke="#A3D1DB" strokeWidth="2.2" fill="none" />}

          {/* Color stripe along the bottom — counts of rivers per band per day */}
          {dailyBands.map((b) => {
            const total =
              b.counts.low + b.counts.p25 + b.counts.normal + b.counts.p75 + b.counts.p90;
            if (!total) return null;
            const xc = xAt(b.x);
            const w = W / Math.max(1, dayCount) - 1;
            let acc = 0;
            const segs: Array<{ start: number; len: number; color: string }> = [];
            const ratios: Array<{ k: keyof typeof b.counts; color: string }> = [
              { k: 'low',    color: PERCENTILE_CLASSES[0].color },
              { k: 'p25',    color: PERCENTILE_CLASSES[1].color },
              { k: 'normal', color: PERCENTILE_CLASSES[2].color },
              { k: 'p75',    color: PERCENTILE_CLASSES[3].color },
              { k: 'p90',    color: PERCENTILE_CLASSES[4].color },
            ];
            for (const { k, color } of ratios) {
              const ratio = b.counts[k] / total;
              if (ratio === 0) continue;
              segs.push({ start: acc, len: ratio * w, color });
              acc += ratio * w;
            }
            return (
              <g key={b.x} transform={`translate(${xc - w / 2} ${H + 1})`}>
                {segs.map((s, i) => (
                  <rect key={i} x={s.start} y={0} width={s.len} height={5} fill={s.color} opacity="0.9" />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Scrubber line */}
        {dayCount > 0 && (
          <div
            className="pointer-events-none absolute"
            style={{
              top: 0, bottom: 0,
              left: `${(indexFromOffset(dayOffset) / Math.max(1, dayCount - 1)) * 100}%`,
              width: 2, background: THEME.live,
              boxShadow: `0 0 10px ${THEME.live}`,
              transform: 'translateX(-50%)',
            }}
          >
            <div style={{
              position: 'absolute', top: -6, left: '50%',
              transform: 'translateX(-50%)',
              width: 12, height: 12, background: THEME.live,
              borderRadius: 99, border: `2px solid ${THEME.cardBorder}`,
            }} />
          </div>
        )}
        <input
          type="range" min={0} max={dayCount - 1} step={1}
          value={indexFromOffset(dayOffset)}
          aria-label="Scrub days"
          onChange={(e) => setDayOffset(offsetFromIndex(parseInt(e.target.value, 10)))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'ew-resize', margin: 0,
          }}
        />
      </div>
      <div className="mt-1 flex justify-between"
        style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(242,234,216,0.5)' }}>
        <span>30d</span><span>22d</span><span>15d</span><span>7d</span><span>today</span>
      </div>
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────
//
// Centered popup with feature details + outbound links. Used for access
// points, campgrounds, and POIs. The right rail keeps showing the river
// the feature belongs to so the modal doesn't lose the river context.

export type ModalSelection =
  | { kind: 'access'; ap: MOAccessPoint; river: MORiver }
  | { kind: 'campground'; camp: MOCampground; nearestRiverName: string | null }
  | { kind: 'poi'; poi: MOPoi; river: MORiver };

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: 'rgba(15,45,53,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(560px,92vw)] max-h-[80vh] overflow-y-auto rounded-md border-2"
        style={{
          background: THEME.cardBg,
          borderColor: THEME.cardBorder,
          color: THEME.ink,
          boxShadow: `5px 5px 0 ${THEME.cardShadow}`,
          fontFamily: 'var(--font-body), system-ui, sans-serif',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 grid place-items-center w-8 h-8 rounded-md border-2"
          style={{ background: '#FAF8F4', borderColor: THEME.cardBorder, fontSize: 16, lineHeight: 1, fontWeight: 700, color: THEME.ink }}
        >×</button>
        <div className="p-5 pr-12">
          <div
            className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: THEME.inkDim, marginBottom: 4 }}
          >
            {subtitle ?? '—'}
          </div>
          <h2 className="font-bold" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 12 }}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}

function LinkRow({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border-2 hover:bg-[#F4ECDB] transition-colors"
      style={{
        borderColor: THEME.cardBorder,
        background: '#FAF8F4',
        fontFamily: MONO,
        fontSize: 12,
        color: THEME.ink,
      }}
    >
      <span className="flex flex-col">
        <span style={{ fontWeight: 700 }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: THEME.inkDim, letterSpacing: '0.05em' }}>{hint}</span>}
      </span>
      <span aria-hidden style={{ fontSize: 14, color: THEME.inkDim }}>↗</span>
    </a>
  );
}

// Compact photo strip for the access-point modal. Pulls from
// access_points.image_urls (00022) — surfaced via the dataset RPC by
// 00123. Renders the first image as a hero with a horizontally
// scrollable thumbnail row when more are available; nothing renders if
// the row has no photos.
function ImageGallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (!urls.length) return null;
  const active = urls[Math.min(activeIdx, urls.length - 1)];
  return (
    <div className="mb-4 -mx-1">
      <div
        className="rounded-md overflow-hidden border-2"
        style={{ borderColor: THEME.cardBorder, background: '#0F2D35', aspectRatio: '16 / 9' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active}
          alt={alt}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      {urls.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 px-1">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Photo ${i + 1} of ${urls.length}`}
              className="flex-shrink-0 rounded-sm overflow-hidden border-2"
              style={{
                width: 60, height: 40,
                borderColor: i === activeIdx ? THEME.primary : THEME.cardBorder,
                opacity: i === activeIdx ? 1 : 0.7,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: THEME.inkDim, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: THEME.ink, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function DetailModal({
  selection,
  onClose,
}: {
  selection: ModalSelection | null;
  onClose: () => void;
}) {
  if (!selection) return null;

  if (selection.kind === 'access') {
    const { ap, river } = selection;
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${ap.lat},${ap.lon}`;
    const images = ap.image_urls ?? [];
    return (
      <ModalShell title={ap.name} subtitle={`Access · ${river.name}`} onClose={onClose}>
        <ImageGallery urls={images} alt={ap.name} />
        <div className="space-y-1 mb-4">
          <FactRow label="Type" value={ap.type.replace(/_/g, ' ')} />
          {ap.river_mile_downstream != null && (
            <FactRow label="River mile" value={`${ap.river_mile_downstream.toFixed(1)} mi from headwaters`} />
          )}
          {ap.ownership && <FactRow label="Ownership" value={ap.ownership} />}
          <FactRow label="Coordinates" value={`${ap.lat.toFixed(4)}, ${ap.lon.toFixed(4)}`} />
        </div>
        <div className="grid gap-2">
          <LinkRow href={`/rivers/${river.slug}/access`} label="Open in Eddy float planner" hint={`All access on the ${river.name}`} />
          <LinkRow href={mapsHref} label="Open in Google Maps" hint="Driving directions" />
        </div>
      </ModalShell>
    );
  }

  if (selection.kind === 'campground') {
    const { camp, nearestRiverName } = selection;
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${camp.lat},${camp.lon}`;
    return (
      <ModalShell
        title={camp.name}
        subtitle={nearestRiverName ? `Campground · near ${nearestRiverName}` : 'Campground'}
        onClose={onClose}
      >
        <div className="space-y-1 mb-4">
          {camp.total_sites != null && <FactRow label="Total sites" value={camp.total_sites} />}
          {camp.sites_reservable != null && <FactRow label="Reservable" value={camp.sites_reservable} />}
          {camp.sites_first_come != null && <FactRow label="First come" value={camp.sites_first_come} />}
          <FactRow label="Coordinates" value={`${camp.lat.toFixed(4)}, ${camp.lon.toFixed(4)}`} />
        </div>
        <div className="grid gap-2">
          {camp.reservation_url && (
            <LinkRow href={camp.reservation_url} label="Reserve a site" hint="Recreation.gov" />
          )}
          {camp.nps_url && (
            <LinkRow href={camp.nps_url} label="View on NPS.gov" hint="Park information" />
          )}
          <LinkRow href={mapsHref} label="Open in Google Maps" hint="Driving directions" />
        </div>
      </ModalShell>
    );
  }

  if (selection.kind === 'poi') {
    const { poi, river } = selection;
    const typeLabel = poi.type.replace(/_/g, ' ');
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`;
    return (
      <ModalShell title={poi.name} subtitle={`${typeLabel} · ${river.name}`} onClose={onClose}>
        {poi.description && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: THEME.ink, marginBottom: 12 }}>
            {poi.description}
          </p>
        )}
        <div className="space-y-1 mb-4">
          <FactRow label="Type" value={typeLabel} />
          {poi.river_mile != null && (
            <FactRow label="River mile" value={`${poi.river_mile.toFixed(1)} mi`} />
          )}
          <FactRow label="Coordinates" value={`${poi.lat.toFixed(4)}, ${poi.lon.toFixed(4)}`} />
        </div>
        <div className="grid gap-2">
          {poi.nps_url && <LinkRow href={poi.nps_url} label="View on NPS.gov" hint="Park information" />}
          <LinkRow href={`/rivers/${river.slug}`} label={`Open ${river.name} in Eddy`} hint="River overview + access points" />
          <LinkRow href={mapsHref} label="Open in Google Maps" hint="Driving directions" />
        </div>
      </ModalShell>
    );
  }

  return null;
}

// ─── Hover overlay ──────────────────────────────────────────────────────
//
// Small floating card pinned to the hovered gauge. When Eddy has a report
// for the gauge it shows the avatar + verdict badge + summary + source line;
// otherwise it falls back to a compact live-reading card (verdict + flow/
// stage) so every gauge gives feedback on hover. This is the single hover
// affordance — the right rail only opens on click (GaugeDetail).

const OVERLAY_W = 360;
const OVERLAY_GAP = 18;

export function GaugeHoverOverlay({
  gauge,
  gaugeName,
  verdict: verdictCode,
  pos,
}: {
  gauge: MoStatewideGauge | null;
  /** USGS station name like "Current River near Van Buren MO". */
  gaugeName: string | null;
  /** Editorial condition for this gauge, used for the fallback card when
   *  Eddy has no written report yet. */
  verdict: StageVerdict | null;
  pos: { x: number; y: number } | null;
}) {
  const report = useGaugeRailReport(gauge);

  if (!gauge || !pos) return null;

  // Prefer Eddy's written report; fall back to the live reading + editorial
  // condition while the report is loading or when none exists.
  const conditionCode = report ? report.conditionCode : verdictCode ?? 'unknown';
  const verdict = STAGE_VERDICTS[conditionCode as StageVerdict] ?? STAGE_VERDICTS.unknown;
  const eddyImg = getEddyImageForCondition(conditionCode);
  const place = extractPlace(gaugeName);
  const readingLine = [
    gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : null,
    gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)} cfs` : null,
  ].filter(Boolean).join(' · ') || 'No live reading';

  // Anchor: prefer right of the marker, flip if it would clip; same for top.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const overflowsRight = pos.x + OVERLAY_GAP + OVERLAY_W > viewportW - 12;
  const left = overflowsRight ? Math.max(12, pos.x - OVERLAY_GAP - OVERLAY_W) : pos.x + OVERLAY_GAP;
  // Estimate height ~120; flip if it would clip the bottom.
  const overflowsBottom = pos.y + 130 > viewportH - 12;
  const top = overflowsBottom ? Math.max(12, pos.y - 130) : Math.max(12, pos.y - 20);

  return (
    <div
      className="pointer-events-none fixed z-40 rounded-md border-2 p-3"
      style={{
        top, left, width: OVERLAY_W,
        background: THEME.cardBg,
        borderColor: THEME.cardBorder,
        boxShadow: `4px 4px 0 ${THEME.cardShadow}`,
        fontFamily: SANS,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 rounded-md border-2"
          style={{ width: 48, height: 48, borderColor: THEME.cardBorder, background: '#F2EAD8', overflow: 'hidden' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={eddyImg} alt="" width={44} height={44} style={{ display: 'block', margin: '2px auto' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="uppercase font-bold"
              style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}
            >
              {report ? 'Eddy says' : 'Live reading'}
            </span>
            <span
              style={{
                background: verdict.color,
                color: '#FAF8F4',
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: '0.1em',
                padding: '2px 7px',
                borderRadius: 3,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {verdict.label}
            </span>
          </div>
          <p
            className="mt-1.5 leading-snug"
            style={{ fontSize: 13.5, fontWeight: 600, color: THEME.primaryDark }}
          >
            {report?.summaryText
              ? report.summaryText.replace(/^["“]|["”]$/g, '')
              : readingLine}
          </p>
          <div
            className="mt-2 rounded-sm px-2 py-1.5"
            style={{
              background: '#F4EFE7',
              border: `1px solid ${THEME.cardBorder}`,
              fontFamily: MONO,
              fontSize: 10,
              color: THEME.inkDim,
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ color: THEME.ink, fontWeight: 700 }}>SOURCE</span>{' '}
            USGS #{gauge.site_no}{place ? ` · ${place}` : ''} · {report ? relativeTime(report.generatedAt) : 'live'}
          </div>
        </div>
      </div>
    </div>
  );
}

// "Current River near Van Buren MO" → "Van Buren, MO". Falls back to the
// raw river name when the station label doesn't follow the USGS convention.
function extractPlace(stationName: string | null): string | null {
  if (!stationName) return null;
  const m = stationName.match(/\b(?:near|at|nr|abv|blw)\s+(.+?)\s+(MO|MISSOURI)\b/i);
  if (m) return `${m[1].trim()}, MO`;
  return null;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
