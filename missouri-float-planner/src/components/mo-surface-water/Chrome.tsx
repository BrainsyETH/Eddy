'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { computeDailyConditionSeries } from './derive';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { MoContextSite } from '@/lib/usgs/mo-sites';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import type { MoHistoryResponse } from '@/app/api/usgs/mo-history/route';
import type { MoForecastEntry } from '@/app/api/usgs/mo-forecast/route';
import type { GaugeUpdateResponse } from '@/app/api/gauge-update/[siteId]/route';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { getEddyImageForCondition } from '@/constants';
import { conditionChip } from '@shared/condition-system';

const MONO = 'var(--font-mono), ui-monospace, monospace';
const SANS = 'var(--font-body), system-ui, sans-serif';
const DISPLAY = 'var(--font-display), system-ui, sans-serif';

/** Small uppercase verdict pill in the shared system's approved surface —
 *  tint background + dark ink + mid-tint border. White text on the solid
 *  condition fills fails AA on the light levels (low/good). */
function VerdictChipSpan({ code, label }: { code: string; label: string }) {
  const chip = conditionChip(code);
  return (
    <span
      style={{
        background: chip.background,
        color: chip.color,
        border: `1px solid ${chip.borderColor}`,
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.1em',
        padding: '1px 6px',
        borderRadius: 3,
        textTransform: 'uppercase',
        fontWeight: 700,
      }}
    >
      {label}
    </span>
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
  sharedGauge,
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
  onSheetExpandedChange,
}: {
  river: MORiver | null;
  /** Set when the river's primary gauge also rates other rivers
   *  (e.g. USGS 07017200 covers both Courtois and Huzzah). */
  sharedGauge?: { siteId: string; others: string[] } | null;
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
  /** Mobile sheet peek↔expanded signal, forwarded to whichever card renders. */
  onSheetExpandedChange?: (expanded: boolean) => void;
}) {
  if (focusedGauge) {
    return (
      <GaugeDetail
        gauge={focusedGauge}
        verdict={focusedGaugeVerdict}
        forecast={forecastBySite[focusedGauge.site_no] ?? null}
        onClose={onCloseGauge ?? onClose}
        onSheetExpandedChange={onSheetExpandedChange}
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
        sharedGauge={sharedGauge ?? null}
        primaryGauge={primaryGauge}
        primaryHistory={primaryHistory}
        forecast={forecast}
        onClose={onClose}
        onAccessPointClick={onAccessPointClick}
        onSheetExpandedChange={onSheetExpandedChange}
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

// The peek sheet covers this fraction of the viewport bottom; MOMap imports
// it to know how much of the stage a fresh selection's sheet will cover.
export const SHEET_PEEK_FRACTION = 0.44;

// Responsive container for the detail cards: a right-side panel on desktop
// (md+), a bottom sheet on phones. At PEEK there is deliberately NO backdrop
// — the map stays visible and interactive above the sheet (tapping another
// feature switches the selection; tapping empty map closes). Only EXPANDED
// gets a plain scrim, and nothing here uses backdrop-filter: a blur over the
// animating flow canvas forces iOS to re-blur the viewport every frame,
// which was the page's single biggest jank source.
function RailSheet({
  onClose,
  onExpandedChange,
  className = 'md:w-[min(360px,calc(100vw-24px))]',
  tall = true,
  z = 'z-40',
  ariaLabel,
  children,
}: {
  onClose?: () => void;
  /** Fires when the mobile sheet crosses peek↔expanded (used to pause the
   *  flow animation while the sheet covers the map). */
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
  tall?: boolean;
  z?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  // Mobile is a two-snap bottom sheet: opens at a small PEEK (headline only)
  // and swipes up to EXPANDED for the full card; swiping the handle below
  // peek dismisses. Desktop (md+) stays the right-side panel — the height
  // logic only applies on phones. (MOMap is ssr:false, so reading matchMedia
  // at init is safe — no hydration mismatch.)
  const [isMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const PEEK = Math.round(vh * SHEET_PEEK_FRACTION);
  const EXPANDED = Math.round(vh * 0.88);
  const [height, setHeight] = useState(PEEK);
  const [snap, setSnapState] = useState<'peek' | 'expanded'>('peek');
  const [dragging, setDragging] = useState(false);
  // lastH mirrors the in-flight height so onHandleEnd never reads a stale
  // render closure — touch events can arrive faster than React re-renders.
  const dragRef = useRef<{ startY: number; startH: number; lastH: number } | null>(null);
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;
  const setSnap = (s: 'peek' | 'expanded') => {
    setSnapState(s);
    onExpandedChangeRef.current?.(s === 'expanded');
  };

  // Slide up from the bottom on mount instead of popping in fully open.
  // Two rAFs guarantee one painted frame at translateY(100%) first.
  const [entered, setEntered] = useState(!isMobile || reducedMotion);
  useEffect(() => {
    if (entered) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [entered]);

  // Each new selection (ariaLabel changes) reopens at peek; unmount always
  // reports collapsed so the flow animation resumes.
  useEffect(() => { setHeight(PEEK); setSnap('peek'); }, [ariaLabel, PEEK]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onExpandedChangeRef.current?.(false), []);

  const onHandleStart = (e: React.TouchEvent) => {
    dragRef.current = { startY: e.touches[0].clientY, startH: height, lastH: height };
    setDragging(true);
  };
  const onHandleMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.touches[0].clientY; // up = grow
    const h = Math.max(80, Math.min(EXPANDED, dragRef.current.startH + dy));
    dragRef.current.lastH = h;
    setHeight(h);
  };
  const onHandleEnd = () => {
    setDragging(false);
    if (!dragRef.current) return;
    const h = dragRef.current.lastH;
    dragRef.current = null;
    if (h < PEEK * 0.6) { onClose?.(); return; } // dragged well below peek → dismiss
    const toExpanded = Math.abs(h - EXPANDED) < Math.abs(h - PEEK);
    setHeight(toExpanded ? EXPANDED : PEEK);
    setSnap(toExpanded ? 'expanded' : 'peek');
  };

  return (
    <>
      {/* Scrim only when EXPANDED — a plain tint (no backdrop-filter), and a
          tap collapses back to peek rather than closing outright. */}
      {isMobile && snap === 'expanded' && (
        <button
          type="button"
          aria-label="Collapse detail"
          onClick={() => { setHeight(PEEK); setSnap('peek'); }}
          className={`fixed inset-0 md:hidden ${z}`}
          style={{ background: 'rgba(4,20,26,0.45)' }}
        />
      )}
      <div
        role="dialog"
        aria-modal={!isMobile || snap === 'expanded'}
        aria-label={ariaLabel}
        className={`${z} overflow-auto border-2 fixed inset-x-0 bottom-0 rounded-t-2xl md:absolute md:inset-x-auto md:right-3 md:top-12 md:h-auto md:rounded-md ${tall ? 'md:bottom-[156px]' : ''} ${className}`}
        style={{
          ...RAIL_BASE_STYLE,
          // Explicit height only on phones (peek/expanded); desktop lets the
          // md: inset classes govern.
          ...(isMobile ? { height: `calc(${height}px + env(safe-area-inset-bottom, 0px))` } : {}),
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: dragging
            ? 'none'
            : 'height 260ms cubic-bezier(0.4,0,0.2,1), transform 260ms cubic-bezier(0.4,0,0.2,1)',
          paddingBottom: isMobile ? undefined : 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle — mobile only; drag up to expand, down to peek/dismiss. */}
        <div
          data-testid="sheet-handle"
          className="md:hidden sticky top-0 z-10 flex justify-center pt-2.5 pb-1"
          style={{ background: THEME.cardBg, touchAction: 'none' }}
          onTouchStart={onHandleStart}
          onTouchMove={onHandleMove}
          onTouchEnd={onHandleEnd}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(45,42,36,0.28)' }} />
        </div>
        {children}
      </div>
    </>
  );
}

function RiverCard({
  river,
  sharedGauge,
  primaryGauge,
  primaryHistory,
  forecast,
  onClose,
  onAccessPointClick,
  onSheetExpandedChange,
}: {
  river: MORiver;
  /** Set when the primary gauge also rates other rivers. */
  sharedGauge: { siteId: string; others: string[] } | null;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
  forecast: MoForecastEntry | null;
  onClose?: () => void;
  /** When set, access-point rows in the rail become clickable buttons
   *  that open the detail modal for that access point. */
  onAccessPointClick?: (id: string) => void;
  onSheetExpandedChange?: (expanded: boolean) => void;
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
  const bannerChip = conditionChip(verdict);

  const allAccess = river.access_points ?? [];
  const [showAllAccess, setShowAllAccess] = useState(false);
  const accessSummary = showAllAccess ? allAccess : allAccess.slice(0, 4);

  return (
    <RailSheet onClose={onClose} onExpandedChange={onSheetExpandedChange} z="z-40" ariaLabel={river.name}>
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}
          >
            {river.region ?? '—'} · {river.length_miles?.toFixed(0) ?? '—'} mi
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 22, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {river.name}
          </div>
        </div>
        {onClose && <CloseBtn onClose={onClose} />}
      </div>

      {/* Tint + dark ink + solid inset accent — the shared system's approved
          chip surface (white on the light condition fills fails AA). */}
      <div
        className="mt-3 flex items-baseline gap-2.5 rounded-md px-3 py-2.5"
        style={{
          background: bannerChip.background,
          color: bannerChip.color,
          border: `1.5px solid ${bannerChip.borderColor}`,
          boxShadow: `inset 3px 0 0 ${bannerChip.solid}`,
        }}
      >
        <span className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22 }}>
          {primaryGauge?.gaugeHeightFt != null
            ? `${primaryGauge.gaugeHeightFt.toFixed(2)} ft`
            : primaryThresholds
              ? '— ft'
              : 'no live gauge'}
        </span>
        <span className="font-bold uppercase"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>
          {tone.label}
        </span>
        <span className="ml-auto" style={{ fontSize: 11, opacity: 0.9 }}>{tone.desc}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <DataAgeChip iso={primaryGauge?.readingTimestamp} />
        <UnchangedChip days={flatlineDays(primaryHistory, primaryGauge)} />
      </div>
      {sharedGauge && (
        <div
          className="mt-1"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', color: THEME.inkDim, lineHeight: 1.5 }}
        >
          Reading via shared gauge #{sharedGauge.siteId} — also rates{' '}
          {sharedGauge.others.join(', ')}; thresholds calibrated per river.
        </div>
      )}

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
          30-day trend · primary gauge
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
    </RailSheet>
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
  onSheetExpandedChange,
}: {
  gauge: MoStatewideGauge;
  verdict: StageVerdict | null;
  forecast: MoForecastEntry | null;
  onClose: () => void;
  onSheetExpandedChange?: (expanded: boolean) => void;
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
    <RailSheet onClose={onClose} onExpandedChange={onSheetExpandedChange} z="z-40" ariaLabel={`Gauge ${gauge.site_no}`}>
    <div className="p-4">
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
      <div className="mt-1.5"><DataAgeChip iso={gauge.readingTimestamp} /></div>

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
        30-day trend
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
    </RailSheet>
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
        <VerdictChipSpan code={report.conditionCode} label={verdict.label} />
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
      className="absolute right-3 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 12 }}
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
      className="absolute right-3 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 12 }}
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
      className="absolute right-3 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 12 }}
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
  expanded,
  onToggle,
}: {
  dayOffset: number;
  setDayOffset: (v: number) => void;
  history: MoHistoryBundleEntry[];
  rivers: MORiver[];
  /** Collapsed on mobile by default to reclaim map height; always true on md+. */
  expanded: boolean;
  onToggle: () => void;
}) {
  const RANGE = 30;

  // Per-river primary condition for each of the past 30 days, derived from
  // stage history. These gauges report stage (not always discharge), so a
  // percentile-based trend was empty for most of them — the timeline read as
  // broken. Instead: the trendline is the share of rivers that were
  // floatable per day, and the stripe is the full condition distribution.
  // Computation is shared with the scroll-story month chart (./derive) so
  // the two timelines can never disagree.
  const { trend, dailyBands, dayCount } = useMemo(() => {
    const s = computeDailyConditionSeries(history, rivers);
    // Anchor the axis to RANGE while history is still loading so the header
    // copy renders; the range input stays disabled until real days exist.
    return { trend: s.trend, dailyBands: s.dailyBands, dayCount: s.dayCount || RANGE };
  }, [history, rivers, RANGE]);
  const hasDays = trend.length > 0;

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

  return (
    <div
      className="absolute inset-x-3 z-20 rounded-md border-2 px-4 pb-3 pt-2.5"
      style={{
        bottom: 12, height: expanded ? 130 : 44,
        background: THEME.primaryDark,
        borderColor: THEME.cardBorder,
        color: THEME.parchment,
        boxShadow: `4px 4px 0 ${THEME.cardShadow}`,
        transition: 'height 220ms cubic-bezier(0.4,0,0.2,1)',
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
          {/* Hidden on phones: the wrapped hint pushed the chart past the
              card's fixed height. */}
          <span
            className="ml-3 hidden sm:inline"
            style={{
              fontFamily: MONO, fontSize: 10, color: 'rgba(242,234,216,0.6)',
            }}
          >
            {history.length
              ? 'drag to replay the past month · line = share of rivers floatable'
              : 'historical readings still loading…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: THEME.live,
            }}
          >
            {dayOffset === 0 ? 'TODAY' : `${Math.abs(dayOffset)}d ago`}
          </div>
          {/* Mobile-only collapse toggle — reclaims map height. Desktop keeps
              the timeline always open. */}
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Collapse timeline' : 'Expand timeline'}
            aria-expanded={expanded}
            className="grid place-items-center md:hidden"
            style={{ width: 28, height: 28, color: THEME.parchment, fontSize: 13, lineHeight: 1 }}
          >
            {expanded ? '▾' : '▴'}
          </button>
        </div>
      </div>
      {expanded && (
        <>

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

          {/* Color stripe along the bottom — distribution of river conditions
              per day, in the same vocabulary as the map and legend. */}
          {dailyBands.map((b) => {
            const order: StageVerdict[] = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'];
            const total = order.reduce((s, k) => s + b.counts[k], 0);
            if (!total) return null;
            const xc = xAt(b.x);
            const w = W / Math.max(1, dayCount) - 1;
            let acc = 0;
            const segs: Array<{ start: number; len: number; color: string }> = [];
            for (const k of order) {
              const ratio = b.counts[k] / total;
              if (ratio === 0) continue;
              segs.push({ start: acc, len: ratio * w, color: STAGE_VERDICTS[k].color });
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
          type="range" min={0} max={Math.max(0, dayCount - 1)} step={1}
          value={indexFromOffset(dayOffset)}
          aria-label="Scrub days"
          disabled={!hasDays}
          onChange={(e) => setDayOffset(offsetFromIndex(parseInt(e.target.value, 10)))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: hasDays ? 'ew-resize' : 'default', margin: 0,
          }}
        />
      </div>
      <div className="mt-1 flex justify-between"
        style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(242,234,216,0.5)' }}>
        <span>30d</span><span>22d</span><span>15d</span><span>7d</span><span>today</span>
      </div>
        </>
      )}
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
      style={{ background: 'rgba(15,45,53,0.55)' }}
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
  sharedRiverNames,
  unchangedDays,
  pos,
}: {
  gauge: MoStatewideGauge | null;
  /** USGS station name like "Current River near Van Buren MO". */
  gaugeName: string | null;
  /** Editorial condition for this gauge, used for the fallback card when
   *  Eddy has no written report yet. */
  verdict: StageVerdict | null;
  /** Set (≥2 names) when this one physical gauge is the primary rating
   *  for multiple rivers — disclosed on the SOURCE line. */
  sharedRiverNames?: string[] | null;
  /** Days the reading has sat byte-identical (see flatlineDays), or null. */
  unchangedDays?: number | null;
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
          <img
            src={eddyImg}
            alt=""
            width={44}
            height={44}
            style={{ display: 'block', margin: '2px auto' }}
            // Blob-store avatar can be blocked (offline, strict proxies) —
            // hide the frame instead of showing a broken-image glyph.
            onError={(e) => {
              const frame = e.currentTarget.parentElement;
              if (frame) frame.style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="uppercase font-bold"
              style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}
            >
              {report ? 'Eddy says' : 'Live reading'}
            </span>
            <VerdictChipSpan code={conditionCode} label={verdict.label} />
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
            {/* The reading's age (and its STALE flag) always shows — a fresh
                Eddy report must never mask an old number underneath it. */}
            <span style={{ color: THEME.ink, fontWeight: 700 }}>SOURCE</span>{' '}
            USGS #{gauge.site_no}{place ? ` · ${place}` : ''} · reading{' '}
            {readingAge(gauge.readingTimestamp)?.label ?? 'no timestamp'}
            {readingAge(gauge.readingTimestamp)?.stale && (
              <span
                className="ml-1.5 rounded-sm px-1 py-px font-bold uppercase"
                style={{ background: '#E5A000', color: '#3D2E00', fontSize: 8, letterSpacing: '0.1em' }}
              >
                Stale
              </span>
            )}
            {unchangedDays != null && (
              <span className="ml-1.5"><UnchangedChip days={unchangedDays} /></span>
            )}
            {gauge.percentile != null && (
              <> · P{Math.round(gauge.percentile)} {classifyPercentile(gauge.percentile).label.toLowerCase()}</>
            )}
            {report && <> · report {relativeTime(report.generatedAt)}</>}
            {sharedRiverNames && sharedRiverNames.length >= 2 && (
              <> · serves {sharedRiverNames.join(' + ')}</>
            )}
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

// ─── Data age ────────────────────────────────────────────────────────────
//
// Every reading on the page discloses its age; anything older than two
// hours is flagged loudly. Data honesty over polish: a stale number
// styled as live is how someone puts a canoe on flood water.

const STALE_AFTER_MS = 2 * 3600e3;

export function readingAge(iso: string | null | undefined): {
  label: string;
  stale: boolean;
} | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return { label: relativeTime(iso), stale: Date.now() - t > STALE_AFTER_MS };
}

/**
 * Soft stuck-sensor heuristic from data already on the page: the trailing
 * run of daily medians that are ALL identical (both height and discharge —
 * discharge varies naturally, so an identical run is the strong signal),
 * confirmed by the live reading still matching. Returns the run length in
 * days (≥3), or null. Deliberately descriptive, not diagnostic: a stable
 * pool CAN sit flat, so the UI says "unchanged N days", never "broken".
 * The cron logs the same condition server-side at 15-min granularity
 * (update-gauges flatline counter); this is its user-facing counterpart.
 */
export function flatlineDays(
  history: MoHistoryBundleEntry | null | undefined,
  live: { gaugeHeightFt: number | null; dischargeCfs: number | null } | null | undefined,
): number | null {
  const daily = history?.daily ?? [];
  if (daily.length < 3 || !live) return null;
  const last = daily[daily.length - 1];
  if (last.dischargeCfs == null && last.gaugeHeightFt == null) return null;
  let run = 1;
  for (let i = daily.length - 2; i >= 0; i--) {
    const d = daily[i];
    if (d.dischargeCfs === last.dischargeCfs && d.gaugeHeightFt === last.gaugeHeightFt) run++;
    else break;
  }
  if (run < 3) return null;
  const liveMatches =
    (last.dischargeCfs == null || live.dischargeCfs === last.dischargeCfs) &&
    (last.gaugeHeightFt == null || live.gaugeHeightFt === last.gaugeHeightFt);
  return liveMatches ? run : null;
}

/** Soft amber "unchanged N days" disclosure next to a reading's age. */
export function UnchangedChip({ days }: { days: number | null }) {
  if (days == null) return null;
  return (
    <span
      className="rounded-sm px-1 py-px font-bold uppercase"
      title="This gauge has reported the identical value for several days — the sensor may be stuck."
      style={{
        border: '1px solid #E5A000',
        color: '#8A6100',
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: '0.1em',
      }}
    >
      unchanged {days} days
    </span>
  );
}

/** Small mono age line with an amber STALE chip when the reading is old. */
export function DataAgeChip({ iso }: { iso: string | null | undefined }) {
  const age = readingAge(iso);
  if (!age) {
    return (
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: THEME.inkDim, letterSpacing: '0.06em' }}>
        no timestamp
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: THEME.inkDim }}>
      reading {age.label}
      {age.stale && (
        <span
          className="rounded-sm px-1 py-px font-bold uppercase"
          style={{ background: '#E5A000', color: '#3D2E00', fontSize: 8, letterSpacing: '0.1em' }}
        >
          Stale
        </span>
      )}
    </span>
  );
}

// ─── Context-site card ──────────────────────────────────────────────────
//
// Statewide sites are context, not product: name, live flow, freshness,
// and a link out to USGS. Deliberately NO condition dressing — they have
// no curated thresholds (see docs/mo-surface-water-observatory.md).

export function ContextSiteCard({
  site,
  onClose,
  onSheetExpandedChange,
}: {
  site: MoContextSite;
  onClose: () => void;
  onSheetExpandedChange?: (expanded: boolean) => void;
}) {
  return (
    <RailSheet onClose={onClose} onExpandedChange={onSheetExpandedChange} z="z-40" tall={false} className="md:w-[min(330px,calc(100vw-24px))]" ariaLabel={`USGS site ${site.site_no}`}>
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: THEME.inkDim }}>
            USGS Site #{site.site_no}
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 16, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {site.name ?? 'Unnamed monitoring site'}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <div className="mt-3 flex items-baseline gap-2 rounded-md border-2 px-3 py-2.5"
        style={{ background: '#F4EFE7', borderColor: '#A49C8E' }}>
        <span className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22, color: THEME.primary }}>
          {Math.round(site.dischargeCfs).toLocaleString()}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: THEME.inkDim }}>cfs discharge</span>
        <span className="ml-auto"><DataAgeChip iso={site.readingTimestamp} /></span>
      </div>

      <p className="mt-2.5" style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.55, color: THEME.inkDim }}>
        Statewide context site — Eddy has no float rating here. Flow shown
        for hydrologic context only.
      </p>

      <a
        href={`https://waterdata.usgs.gov/monitoring-location/${site.site_no}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block rounded-md border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{
          background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
          fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
        }}
      >
        Full record on USGS →
      </a>
    </div>
    </RailSheet>
  );
}
