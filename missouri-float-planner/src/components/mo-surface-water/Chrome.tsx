'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PERCENTILE_CLASSES,
  STAGE_VERDICTS,
  THEME,
  classifyPercentile,
  type MORiver,
  type MOCampground,
  type MOAccessPoint,
  type MOPoi,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import type { MoHistoryResponse } from '@/app/api/usgs/mo-history/route';

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
  showCampgrounds,
  showAccessPoints,
  showPOIs,
  setShowCampgrounds,
  setShowAccessPoints,
  setShowPOIs,
}: {
  showCampgrounds: boolean;
  showAccessPoints: boolean;
  showPOIs: boolean;
  setShowCampgrounds: (v: boolean) => void;
  setShowAccessPoints: (v: boolean) => void;
  setShowPOIs: (v: boolean) => void;
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
        onClick={() => setShowAccessPoints(!showAccessPoints)}
        className="rounded-md border-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:opacity-90"
        style={toggleStyle(showAccessPoints)}
      >
        ● Access ({showAccessPoints ? 'on' : 'off'})
      </button>
      <button
        type="button"
        onClick={() => setShowCampgrounds(!showCampgrounds)}
        className="rounded-md border-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:opacity-90"
        style={toggleStyle(showCampgrounds)}
      >
        ⛺ Camps ({showCampgrounds ? 'on' : 'off'})
      </button>
      <button
        type="button"
        onClick={() => setShowPOIs(!showPOIs)}
        className="rounded-md border-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:opacity-90"
        style={toggleStyle(showPOIs)}
      >
        ◉ Springs ({showPOIs ? 'on' : 'off'})
      </button>
    </div>
  );
}

// ─── Percentile legend ──────────────────────────────────────────────────

export function PercentileLegend() {
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
        Discharge percentile
      </div>
      {PERCENTILE_CLASSES.map((c) => (
        <div key={c.short} className="mb-0.5 flex items-center gap-2">
          <span style={{ width: 18, height: 4, background: c.color, borderRadius: 2 }} />
          <span className="font-semibold" style={{ width: 56 }}>{c.short}</span>
          <span style={{ color: THEME.inkDim }}>{c.label}</span>
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
        Vs. period of record · USGS NWIS STAT
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
    const c = { bony: 0, prime: 0, pushy: 0, hazard: 0, unknown: 0 };
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

  const items = [
    { label: 'Bony', n: verdictCounts.bony, color: STAGE_VERDICTS.bony.color },
    { label: 'Prime', n: verdictCounts.prime, color: STAGE_VERDICTS.prime.color },
    { label: 'Pushy', n: verdictCounts.pushy, color: STAGE_VERDICTS.pushy.color },
    { label: 'Hazard', n: verdictCounts.hazard, color: STAGE_VERDICTS.hazard.color },
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
  const points = useMemo(() => {
    if ('points' in history) {
      return history.points.map((p) => p.percentile ?? 50);
    }
    return history.daily.map((d) => d.percentile ?? 50);
  }, [history]);

  if (!points.length) return null;
  const xAt = (i: number) =>
    points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
  const yAt = (p: number) => height - 8 - (p / 100) * (height - 16);
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(p).toFixed(1)}`)
    .join(' ');
  const cur = points[points.length - 1];
  const curColor = classifyPercentile(cur).color;

  // Ribbon: P25–P75 (period-of-record envelope)
  let ribbon: string | null = null;
  const yHi = yAt(75), yLo = yAt(25);
  ribbon = `M0 ${yHi} L${width} ${yHi} L${width} ${yLo} L0 ${yLo} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {/* P25–P75 ribbon (history envelope) */}
      <path d={ribbon} fill="rgba(45,120,137,0.14)" />
      {/* baseline */}
      <line x1="0" y1={yAt(50)} x2={width} y2={yAt(50)}
        stroke="rgba(45,42,36,0.18)" strokeDasharray="2 3" />
      <line x1="0" y1={yAt(75)} x2={width} y2={yAt(75)} stroke="rgba(45,42,36,0.10)" />
      <line x1="0" y1={yAt(25)} x2={width} y2={yAt(25)} stroke="rgba(45,42,36,0.10)" />
      {/* line */}
      <path d={linePath} stroke={curColor} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      {/* current marker */}
      <circle cx={xAt(points.length - 1)} cy={yAt(cur)} r="3.5"
        fill={curColor} stroke="#fff" strokeWidth="1.5" />
      {/* labels */}
      <text x="3" y={yAt(75) - 2} fontSize="8" fill={THEME.inkDim} style={{ fontFamily: MONO }}>P75</text>
      <text x="3" y={yAt(25) - 2} fontSize="8" fill={THEME.inkDim} style={{ fontFamily: MONO }}>P25</text>
      <text x={width - 3} y={yAt(cur) - 6} textAnchor="end"
        fontSize="9" fontWeight="700" fill={curColor} style={{ fontFamily: MONO }}>
        P{Math.round(cur)}
      </text>
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
  hoveredGauge,
  focusedGauge,
  campground,
  accessPoint,
  poi,
  onClose,
}: {
  river: MORiver | null;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
  hoveredGauge: MoStatewideGauge | null;
  focusedGauge: MoStatewideGauge | null;
  campground: MOCampground | null;
  accessPoint: { ap: MOAccessPoint; river: MORiver } | null;
  poi: { poi: MOPoi; river: MORiver | null } | null;
  onClose: () => void;
}) {
  if (focusedGauge) {
    return <GaugeDetail gauge={focusedGauge} onClose={onClose} />;
  }
  if (hoveredGauge && !river) {
    return <GaugeHover gauge={hoveredGauge} />;
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
    return (
      <RiverCard
        river={river}
        primaryGauge={primaryGauge}
        primaryHistory={primaryHistory}
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
}: {
  river: MORiver;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
}) {
  const verdict: StageVerdict = (() => {
    if (!primaryGauge?.gaugeHeightFt) return 'unknown';
    const g = (river.gauges ?? []).find((x) => x.is_primary);
    if (!g) return 'unknown';
    const v = primaryGauge.gaugeHeightFt;
    if (g.level_optimal_min != null && v < g.level_optimal_min) return 'bony';
    if (g.level_optimal_max != null && v <= g.level_optimal_max) return 'prime';
    if (g.level_dangerous != null && v >= g.level_dangerous) return 'hazard';
    if (g.level_high != null && v >= g.level_high) return 'pushy';
    return 'unknown';
  })();
  const tone = STAGE_VERDICTS[verdict];

  const accessSummary = (river.access_points ?? []).slice(0, 4);

  return (
    <div
      className="absolute right-3 z-20 w-[360px] overflow-auto rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 96, bottom: 156 }}
    >
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

      <div className="mt-3 grid grid-cols-3 gap-2">
        <KV label="Discharge"
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
          30-day percentile · primary gauge
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

      {accessSummary.length > 0 && (
        <div className="mt-4">
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: THEME.inkDim,
              marginBottom: 6,
            }}
          >
            Top access points · click on map for detail
          </div>
          <div className="space-y-1">
            {accessSummary.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-sm px-2 py-1"
                style={{ background: '#F4EFE7', fontFamily: MONO, fontSize: 11 }}
              >
                <span className="truncate" style={{ color: THEME.ink }}>{a.name}</span>
                <span style={{ color: THEME.inkDim, marginLeft: 6 }}>
                  mi {a.river_mile_downstream != null ? a.river_mile_downstream.toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
          {(river.access_points?.length ?? 0) > accessSummary.length && (
            <div
              className="mt-1"
              style={{ fontFamily: MONO, fontSize: 9.5, color: THEME.inkDim }}
            >
              + {(river.access_points!.length - accessSummary.length)} more
            </div>
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

function GaugeHover({ gauge }: { gauge: MoStatewideGauge }) {
  const cls = gauge.percentile != null ? classifyPercentile(gauge.percentile) : null;
  const history = useHistory(gauge.site_no);
  return (
    <div
      className="absolute right-3 z-20 w-[300px] rounded-md border-2 p-3"
      style={{ ...RAIL_BASE_STYLE, top: 96 }}
    >
      <div
        className="uppercase font-bold"
        style={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.15em', color: THEME.inkDim,
        }}
      >
        USGS #{gauge.site_no}
      </div>
      <div className="mt-1 font-bold leading-tight" style={{ fontSize: 14, color: THEME.ink }}>
        {gauge.river_name}
      </div>
      {cls && gauge.percentile != null ? (
        <div
          className="mt-2 inline-flex items-center gap-2 rounded-md px-2.5 py-1"
          style={{
            background: cls.color, color: '#FAF8F4',
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          }}
        >
          <span>P{Math.round(gauge.percentile)}</span>
          <span style={{ opacity: 0.85, fontWeight: 500 }}>{cls.label}</span>
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <KV label="Discharge"
          value={gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)}` : '—'} sub="cfs" />
        <KV label="Stage"
          value={gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)}` : '—'} sub="ft" />
      </div>
      {history && (
        <div
          className="mt-2 rounded-md border-2 p-2"
          style={{ background: '#F4EFE7', borderColor: '#A49C8E' }}
        >
          <Sparkline history={history} width={280} height={64} />
        </div>
      )}
      <div
        className="mt-1.5 uppercase"
        style={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: THEME.inkDim,
        }}
      >
        Click to lock detail panel →
      </div>
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

function GaugeDetail({ gauge, onClose }: { gauge: MoStatewideGauge; onClose: () => void }) {
  const cls = gauge.percentile != null ? classifyPercentile(gauge.percentile) : null;
  const history = useHistory(gauge.site_no);
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
        style={{ background: cls?.color ?? '#857D70', color: '#FAF8F4' }}
      >
        <div className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 28 }}>
          {gauge.percentile != null ? `P${Math.round(gauge.percentile)}` : '—'}
        </div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>{cls?.label ?? 'No history available'}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <KV label="Discharge"
          value={gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)}` : '—'} sub="cfs" />
        <KV label="Stage"
          value={gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)}` : '—'} sub="ft" />
        <KV label="Median (DOY)"
          value={gauge.stats?.p50 != null ? `${Math.round(gauge.stats.p50)}` : '—'} sub="cfs" />
        <KV label="Years on record"
          value={gauge.stats?.yearsOfRecord != null ? `${Math.round(gauge.stats.yearsOfRecord)}` : '—'} />
      </div>

      <div className="mt-3 uppercase font-bold"
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: THEME.inkDim }}>
        30-day percentile
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
            Statewide gauge tape · 30 days
          </span>
          <span
            className="ml-3"
            style={{
              fontFamily: MONO, fontSize: 10, color: 'rgba(242,234,216,0.6)',
            }}
          >
            scrub to replay how every river painted across the past month
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
