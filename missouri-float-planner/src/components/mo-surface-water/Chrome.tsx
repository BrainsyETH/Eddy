'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  MO_RIVERS,
  MO_FLOATER,
  STAGE_VERDICTS,
  PERCENTILE_CLASSES,
  classifyPercentile,
  stageToVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { MoHistoryResponse } from '@/app/api/usgs/mo-history/route';

const MONO = 'var(--font-mono), ui-monospace, monospace';
const SANS = 'var(--font-body), system-ui, sans-serif';

// ─── Header ──────────────────────────────────────────────────────────────

export function HeaderBar({
  generatedAt,
  reachCount,
  gaugeCount,
}: {
  generatedAt: string | null;
  reachCount: number;
  gaugeCount: number;
}) {
  const stamp = generatedAt
    ? new Date(generatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : '—';
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
      <div
        className="pointer-events-auto rounded-sm border px-4 py-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.5)]"
        style={{
          background: 'rgba(31,26,20,0.92)',
          borderColor: 'rgba(242,234,216,0.18)',
          color: '#F2EAD8',
          fontFamily: MONO,
        }}
      >
        <div
          className="font-bold uppercase"
          style={{ fontSize: 14, letterSpacing: '0.22em', color: '#E6DCBE' }}
        >
          USGS · NWIS · Missouri
        </div>
        <div
          className="mt-0.5 uppercase"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.15em',
            color: 'rgba(242,234,216,0.65)',
          }}
        >
          Surface water · stream order ≥4 · {reachCount} reaches · {gaugeCount} active gauges
        </div>
      </div>
      <div
        className="pointer-events-auto rounded-sm border px-3.5 py-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.5)]"
        style={{
          background: 'rgba(31,26,20,0.92)',
          borderColor: 'rgba(242,234,216,0.18)',
          color: '#F2EAD8',
          fontFamily: MONO,
        }}
      >
        <div
          className="uppercase"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.18em',
            color: 'rgba(242,234,216,0.55)',
          }}
        >
          Snapshot
        </div>
        <div className="mt-0.5 font-bold" style={{ fontSize: 13, color: '#E6DCBE' }}>
          {stamp}
          <span className="ml-2" style={{ color: '#3E8FB8' }}>
            · LIVE
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Percentile legend ──────────────────────────────────────────────────

export function PercentileLegend() {
  return (
    <div
      className="absolute left-3 z-10 rounded-sm border px-3 py-2.5 shadow-[3px_3px_0_rgba(45,42,36,0.35)]"
      style={{
        top: 100,
        background: 'rgba(247,246,243,0.96)',
        borderColor: 'rgba(45,42,36,0.4)',
        color: '#1F1A14',
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      <div
        className="uppercase"
        style={{
          fontSize: 9,
          letterSpacing: '0.15em',
          color: 'rgba(45,42,36,0.6)',
          marginBottom: 6,
        }}
      >
        Discharge percentile
      </div>
      {PERCENTILE_CLASSES.map((c) => (
        <div key={c.short} className="mb-0.5 flex items-center gap-2">
          <span
            style={{ width: 16, height: 4, background: c.color, borderRadius: 2 }}
          />
          <span className="font-semibold" style={{ width: 56 }}>
            {c.short}
          </span>
          <span style={{ color: 'rgba(45,42,36,0.7)' }}>{c.label}</span>
        </div>
      ))}
      <div
        className="mt-2 border-t pt-2"
        style={{
          borderColor: 'rgba(45,42,36,0.18)',
          fontSize: 9,
          color: 'rgba(45,42,36,0.55)',
          letterSpacing: '0.05em',
        }}
      >
        Period of record varies by site
      </div>
    </div>
  );
}

// ─── Statewide summary chip ──────────────────────────────────────────────

export function StatewideSummary({ gauges }: { gauges: MoStatewideGauge[] }) {
  const counts = useMemo(() => {
    const c = { low: 0, below: 0, normal: 0, above: 0, high: 0, unknown: 0 };
    // Aggregate by river (mean of its gauges) so the chip reflects rivers,
    // not individual gauges.
    const byRiver = new Map<string, number[]>();
    for (const g of gauges) {
      if (g.percentile == null) continue;
      const arr = byRiver.get(g.river_id);
      if (arr) arr.push(g.percentile); else byRiver.set(g.river_id, [g.percentile]);
    }
    for (const r of MO_RIVERS) {
      const list = byRiver.get(r.id);
      if (!list || !list.length) { c.unknown++; continue; }
      const p = list.reduce((a, b) => a + b, 0) / list.length;
      if (p < 10) c.low++;
      else if (p < 25) c.below++;
      else if (p < 75) c.normal++;
      else if (p < 90) c.above++;
      else c.high++;
    }
    return c;
  }, [gauges]);

  const items = [
    { k: 'low',     label: 'Much below', color: '#8B2C1B', n: counts.low },
    { k: 'below',   label: 'Below',      color: '#C36A4A', n: counts.below },
    { k: 'normal',  label: 'Normal',     color: '#2D7889', n: counts.normal },
    { k: 'above',   label: 'Above',      color: '#3E8FB8', n: counts.above },
    { k: 'high',    label: 'Much above', color: '#1A4F5C', n: counts.high },
    { k: 'unknown', label: 'No data',    color: '#857D70', n: counts.unknown },
  ];

  return (
    <div
      className="absolute left-3 z-10 rounded-sm border px-3.5 py-2.5 shadow-[3px_3px_0_rgba(45,42,36,0.35)]"
      style={{
        bottom: 140,
        background: 'rgba(247,246,243,0.96)',
        borderColor: 'rgba(45,42,36,0.4)',
        color: '#1F1A14',
        fontFamily: MONO,
        fontSize: 11,
      }}
    >
      <div
        className="uppercase"
        style={{
          fontSize: 9,
          letterSpacing: '0.15em',
          color: 'rgba(45,42,36,0.6)',
          marginBottom: 8,
        }}
      >
        Statewide right now
      </div>
      <div className="flex gap-3.5">
        {items.map((it) => (
          <div key={it.k} className="text-center">
            <div
              className="font-bold"
              style={{ fontSize: 22, lineHeight: 1, color: it.color }}
            >
              {it.n}
            </div>
            <div
              className="mt-1 uppercase"
              style={{
                fontSize: 8.5,
                letterSpacing: '0.08em',
                color: 'rgba(45,42,36,0.6)',
              }}
            >
              {it.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sparkline (used by hover + detail) ──────────────────────────────────

function Sparkline({
  history,
  width = 290,
  height = 80,
}: {
  history: MoHistoryResponse;
  width?: number;
  height?: number;
}) {
  if (!history.points.length) return null;
  const points = history.points.map((p) => p.percentile ?? 50);
  const minP = 0, maxP = 100;
  const xAt = (i: number) =>
    points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
  const yAt = (p: number) =>
    height - 8 - ((p - minP) / (maxP - minP)) * (height - 16);
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(p).toFixed(1)}`)
    .join(' ');
  const cur = points[points.length - 1];
  const curColor = classifyPercentile(cur).color;

  // P25–P75 ribbon — use the band returned by the API.
  let ribbon: string | null = null;
  if (history.band?.p25 != null && history.band?.p75 != null) {
    // Plot horizontal band; for now the API only returns today's band, so we
    // render a flat horizontal ribbon.
    const yHi = yAt(75);
    const yLo = yAt(25);
    ribbon = `M0 ${yHi} L${width} ${yHi} L${width} ${yLo} L0 ${yLo} Z`;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block' }}
    >
      <line
        x1="0" y1={yAt(50)} x2={width} y2={yAt(50)}
        stroke="rgba(45,42,36,0.15)" strokeDasharray="2 3"
      />
      <line x1="0" y1={yAt(75)} x2={width} y2={yAt(75)} stroke="rgba(45,42,36,0.10)" />
      <line x1="0" y1={yAt(25)} x2={width} y2={yAt(25)} stroke="rgba(45,42,36,0.10)" />
      {ribbon && <path d={ribbon} fill="rgba(45,120,137,0.14)" />}
      <path
        d={linePath} stroke={curColor} strokeWidth="2"
        fill="none" strokeLinejoin="round"
      />
      <circle
        cx={xAt(points.length - 1)} cy={yAt(cur)} r="3.5"
        fill={curColor} stroke="#fff" strokeWidth="1.5"
      />
      <text
        x="3" y={yAt(75) - 2}
        fontSize="8" fill="rgba(45,42,36,0.55)"
        style={{ fontFamily: MONO }}
      >
        P75
      </text>
      <text
        x="3" y={yAt(25) - 2}
        fontSize="8" fill="rgba(45,42,36,0.55)"
        style={{ fontFamily: MONO }}
      >
        P25
      </text>
      <text
        x={width - 3} y={yAt(cur) - 6} textAnchor="end"
        fontSize="9" fontWeight="700" fill={curColor}
        style={{ fontFamily: MONO }}
      >
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
      .then((j) => {
        if (!aborted) setData(j);
      })
      .catch(() => {});
    return () => { aborted = true; };
  }, [siteId, days]);
  return data;
}

// ─── Gauge hover card ───────────────────────────────────────────────────

export function GaugeHover({
  hoveredGaugeId,
  gauges,
}: {
  hoveredGaugeId: string | null;
  gauges: MoStatewideGauge[];
}) {
  const gauge = gauges.find((g) => g.site_no === hoveredGaugeId) ?? null;
  const history = useHistory(gauge?.site_no ?? null, 30);
  if (!gauge) return null;

  const cls = gauge.percentile != null ? classifyPercentile(gauge.percentile) : null;
  const siteName =
    MO_RIVERS.flatMap((r) => r.gauges).find((g) => g.site_no === gauge.site_no)?.name ??
    gauge.river_name;

  return (
    <div
      className="absolute right-3 z-20 w-[320px] rounded-sm border p-3.5 shadow-[3px_3px_0_rgba(45,42,36,0.4)]"
      style={{
        top: 100,
        background: 'rgba(247,246,243,0.97)',
        borderColor: 'rgba(45,42,36,0.5)',
        fontFamily: SANS,
      }}
    >
      <div
        className="uppercase"
        style={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.15em',
          color: 'rgba(45,42,36,0.6)',
        }}
      >
        USGS #{gauge.site_no}
      </div>
      <div
        className="font-bold leading-tight"
        style={{ fontSize: 16, color: '#1F1A14', marginTop: 3 }}
      >
        {siteName}
      </div>
      <div
        style={{
          fontFamily: MONO, fontSize: 10, marginTop: 4,
          color: 'rgba(45,42,36,0.65)',
        }}
      >
        {gauge.river_name} · {gauge.basin} basin · order {gauge.order}
      </div>

      {cls && gauge.percentile != null ? (
        <div
          className="mt-2.5 inline-flex items-center gap-2 rounded-sm px-2.5 py-1.5"
          style={{
            background: cls.color, color: '#fff',
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em',
          }}
        >
          <span>P{Math.round(gauge.percentile)}</span>
          <span style={{ opacity: 0.85, fontWeight: 500 }}>{cls.label}</span>
        </div>
      ) : (
        <div
          className="mt-2.5 inline-block rounded-sm px-2.5 py-1.5 uppercase"
          style={{
            background: '#857D70', color: '#fff',
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em',
          }}
        >
          No percentile available
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2" style={{ fontFamily: MONO, fontSize: 11 }}>
        <KV label="Discharge" value={gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)} cfs` : '—'} />
        <KV label="Stage" value={gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : '—'} />
      </div>

      <div className="mt-3">
        {history ? (
          <Sparkline history={history} width={290} height={70} />
        ) : (
          <div
            className="rounded-sm border"
            style={{
              height: 70,
              background: '#F4EFE7',
              borderColor: 'rgba(45,42,36,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontSize: 10, color: 'rgba(45,42,36,0.5)',
            }}
          >
            Loading 30-day curve…
          </div>
        )}
      </div>
      <div
        className="mt-2 uppercase"
        style={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em',
          color: 'rgba(45,42,36,0.55)',
        }}
      >
        Click to lock detail panel →
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-sm border px-2 py-1.5"
      style={{ background: '#F4EFE7', borderColor: 'rgba(45,42,36,0.15)' }}
    >
      <div
        className="uppercase"
        style={{ fontSize: 8.5, letterSpacing: '0.1em', color: 'rgba(45,42,36,0.55)' }}
      >
        {label}
      </div>
      <div className="mt-0.5 font-bold" style={{ fontSize: 13, color: '#1F1A14' }}>
        {value}
      </div>
    </div>
  );
}

// ─── Gauge detail panel ────────────────────────────────────────────────

export function GaugeDetail({
  focusedGaugeId,
  gauges,
  onClose,
}: {
  focusedGaugeId: string | null;
  gauges: MoStatewideGauge[];
  onClose: () => void;
}) {
  const gauge = gauges.find((g) => g.site_no === focusedGaugeId) ?? null;
  const history = useHistory(gauge?.site_no ?? null, 30);
  if (!gauge) return null;
  const cls = gauge.percentile != null ? classifyPercentile(gauge.percentile) : null;
  const siteName =
    MO_RIVERS.flatMap((r) => r.gauges).find((g) => g.site_no === gauge.site_no)?.name ??
    gauge.river_name;

  return (
    <div
      className="absolute right-3 z-30 w-[360px] overflow-auto rounded-sm border p-4 shadow-[4px_4px_0_rgba(45,42,36,0.45)]"
      style={{
        top: 100, bottom: 140,
        background: 'rgba(247,246,243,0.98)',
        borderColor: 'rgba(45,42,36,0.5)',
        fontFamily: SANS,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="uppercase"
            style={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em',
              color: 'rgba(45,42,36,0.55)',
            }}
          >
            USGS Site #{gauge.site_no}
          </div>
          <div
            className="font-bold leading-tight"
            style={{ fontSize: 19, color: '#1F1A14', marginTop: 3 }}
          >
            {siteName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer rounded-sm border bg-white"
          style={{
            width: 26, height: 26,
            borderColor: 'rgba(45,42,36,0.4)',
            fontFamily: MONO, fontSize: 14,
            color: 'rgba(45,42,36,0.7)',
          }}
        >
          ×
        </button>
      </div>

      <div
        className="mt-2.5"
        style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em',
          color: 'rgba(45,42,36,0.7)',
        }}
      >
        {gauge.river_name} · {gauge.basin} basin · stream order {gauge.order}
      </div>

      <div
        className="mt-3 flex items-baseline gap-3 rounded-sm px-3.5 py-2.5"
        style={{
          background: cls?.color ?? '#857D70', color: '#fff',
        }}
      >
        <div className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 32 }}>
          {gauge.percentile != null ? `P${Math.round(gauge.percentile)}` : '—'}
        </div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>{cls?.label ?? 'No history available'}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <KV label="Discharge" value={gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)} cfs` : '—'} />
        <KV label="Stage" value={gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : '—'} />
        <KV label="Median (DOY)" value={gauge.stats?.p50 != null ? `${Math.round(gauge.stats.p50)} cfs` : '—'} />
        <KV
          label="Years on record"
          value={gauge.stats?.yearsOfRecord != null ? `${Math.round(gauge.stats.yearsOfRecord)}` : '—'}
        />
      </div>

      <div
        className="mt-3.5 uppercase"
        style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em',
          color: 'rgba(45,42,36,0.6)',
        }}
      >
        30-day discharge percentile
      </div>
      <div
        className="mt-2 rounded-sm border p-2.5"
        style={{ background: '#F4EFE7', borderColor: 'rgba(45,42,36,0.15)' }}
      >
        {history ? (
          <Sparkline history={history} width={310} height={120} />
        ) : (
          <div
            style={{
              height: 120,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontSize: 10, color: 'rgba(45,42,36,0.5)',
            }}
          >
            Loading…
          </div>
        )}
      </div>

      <div
        className="mt-3.5 border-t pt-3"
        style={{
          borderTop: '1px dashed rgba(45,42,36,0.25)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.05em',
          lineHeight: 1.5, color: 'rgba(45,42,36,0.55)',
        }}
      >
        Source: USGS National Water Information System · waterservices.usgs.gov · IV/DV/STAT
        endpoints. Percentile rank is computed against the gauge&apos;s daily period of record
        for this calendar date.
      </div>
    </div>
  );
}

// ─── Floater card ───────────────────────────────────────────────────────

export function FloaterCard({
  riverId,
  gauges,
}: {
  riverId: string | null;
  gauges: MoStatewideGauge[];
}) {
  if (!riverId) return null;
  const fp = MO_FLOATER[riverId];
  if (!fp) return null;
  const riverGauges = gauges.filter((g) => g.river_id === riverId);
  const stage = riverGauges.find((g) => g.gaugeHeightFt != null)?.gaugeHeightFt ?? null;
  const verdict = stageToVerdict(stage, fp.stageBands);
  const tone = STAGE_VERDICTS[verdict];
  const max = fp.stageBands.hazard * 1.2;
  const pct = (v: number) => Math.min(100, (v / max) * 100);

  const meanP = (() => {
    const ps = riverGauges.map((g) => g.percentile).filter((p): p is number => p != null);
    if (!ps.length) return null;
    return ps.reduce((a, b) => a + b, 0) / ps.length;
  })();

  return (
    <div
      className="absolute right-3 z-20 w-[340px] rounded-sm border p-4 shadow-[4px_4px_0_rgba(45,42,36,0.45)]"
      style={{
        top: 100,
        background: 'rgba(247,246,243,0.97)',
        borderColor: 'rgba(45,42,36,0.5)',
        fontFamily: SANS,
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="uppercase"
          style={{
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em',
            color: 'rgba(45,42,36,0.55)',
          }}
        >
          Floater profile
        </div>
        {fp.damControlled && (
          <span
            className="rounded-sm px-1.5 py-0.5 uppercase"
            style={{
              background: '#1F1A14', color: '#E6DCBE',
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em',
            }}
          >
            ▲ Dam-controlled
          </span>
        )}
      </div>
      <div className="font-bold" style={{ fontSize: 19, color: '#1F1A14', marginTop: 4 }}>
        {fp.label}
      </div>
      <div
        style={{
          fontFamily: MONO, fontSize: 10.5, marginTop: 2,
          color: 'rgba(45,42,36,0.65)',
        }}
      >
        Class {fp.classRating} · {fp.milesTypical} mi typical · {fp.popularPutIn} →{' '}
        {fp.popularTakeOut}
      </div>

      <div
        className="mt-3 flex items-baseline gap-2.5 rounded-sm px-3 py-2"
        style={{ background: tone.color, color: '#fff' }}
      >
        <span className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22 }}>
          {stage != null ? `${stage.toFixed(2)} ft` : '— ft'}
        </span>
        <span
          className="font-bold uppercase"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}
        >
          {tone.label}
        </span>
        <span className="ml-auto" style={{ fontSize: 11, opacity: 0.85 }}>
          {tone.desc}
        </span>
      </div>

      <div className="mt-3">
        <div
          className="uppercase"
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em',
            color: 'rgba(45,42,36,0.6)',
            marginBottom: 4,
          }}
        >
          Stage bands (ft)
        </div>
        <div
          className="relative rounded-sm border"
          style={{ height: 22, background: '#F4EFE7', borderColor: 'rgba(45,42,36,0.18)' }}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${pct(fp.stageBands.bony)}%`,
              background: 'rgba(184,157,114,0.5)',
            }}
          />
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(fp.stageBands.bony)}%`,
              width: `${pct(fp.stageBands.pushy) - pct(fp.stageBands.bony)}%`,
              background: 'rgba(78,184,107,0.5)',
            }}
          />
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(fp.stageBands.pushy)}%`,
              width: `${pct(fp.stageBands.hazard) - pct(fp.stageBands.pushy)}%`,
              background: 'rgba(62,143,184,0.5)',
            }}
          />
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(fp.stageBands.hazard)}%`, right: 0,
              background: 'rgba(220,38,38,0.5)',
            }}
          />
          {stage != null && (
            <div
              style={{
                position: 'absolute', top: -2, bottom: -2,
                left: `${pct(stage)}%`, width: 2,
                background: '#1F1A14',
              }}
            />
          )}
        </div>
        <div
          className="mt-1 flex justify-between"
          style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(45,42,36,0.55)' }}
        >
          <span>0</span>
          <span>{fp.stageBands.bony}</span>
          <span>{fp.stageBands.pushy}</span>
          <span>{fp.stageBands.hazard}+</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <KV label="Discharge" value={
          (() => {
            const cfs = riverGauges.find((g) => g.dischargeCfs != null)?.dischargeCfs ?? null;
            return cfs != null ? `${Math.round(cfs)} cfs` : '—';
          })()
        } />
        <KV label="Mean P" value={meanP != null ? `P${Math.round(meanP)}` : '—'} />
        <KV label="Gauges" value={`${riverGauges.length}`} />
      </div>

      <div
        className="mt-2.5 italic"
        style={{
          fontSize: 11.5, lineHeight: 1.4, color: 'rgba(45,42,36,0.75)',
        }}
      >
        {fp.note}
      </div>
    </div>
  );
}

// ─── Time scrubber ──────────────────────────────────────────────────────

export function TimeScrubber({
  dayOffset,
  setDayOffset,
}: {
  dayOffset: number;
  setDayOffset: (v: number) => void;
}) {
  const RANGE = 30;
  return (
    <div
      className="absolute inset-x-3 z-20 rounded-sm border px-4 pb-3.5 pt-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.5)]"
      style={{
        bottom: 12,
        height: 110,
        background: 'rgba(31,26,20,0.94)',
        borderColor: 'rgba(242,234,216,0.2)',
        color: '#F2EAD8',
      }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <span
            className="font-bold uppercase"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
              color: '#E6DCBE',
            }}
          >
            Statewide gauge tape
          </span>
          <span
            className="ml-3"
            style={{
              fontFamily: MONO, fontSize: 10,
              color: 'rgba(242,234,216,0.55)',
            }}
          >
            scrub the last 30 days · selecting an older day shows the percentile envelope only
          </span>
        </div>
        <div
          className="uppercase"
          style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: '#3E8FB8',
          }}
        >
          {dayOffset === 0 ? 'TODAY' : `${Math.abs(dayOffset)}d ago`}
        </div>
      </div>

      <div className="relative" style={{ height: 60 }}>
        <ScrubberRail />
        <div
          className="pointer-events-none absolute"
          style={{
            top: 0, bottom: 0,
            left: `${((RANGE + dayOffset) / RANGE) * 100}%`,
            width: 2, background: '#F2EAD8',
            boxShadow: '0 0 8px rgba(242,234,216,0.6)',
            transform: 'translateX(-50%)',
          }}
        >
          <div
            style={{
              position: 'absolute', top: -6, left: '50%',
              transform: 'translateX(-50%)',
              width: 10, height: 10, background: '#F2EAD8',
              borderRadius: 99, border: '1.5px solid #1F1A14',
            }}
          />
        </div>
        <input
          type="range" min={-RANGE} max={0} step={1} value={dayOffset}
          aria-label="Days ago"
          onChange={(e) => setDayOffset(parseInt(e.target.value, 10))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'ew-resize', margin: 0,
          }}
        />
      </div>
      <div
        className="mt-1 flex justify-between"
        style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em',
          color: 'rgba(242,234,216,0.5)',
        }}
      >
        <span>30d</span><span>22d</span><span>15d</span><span>7d</span><span>today</span>
      </div>
    </div>
  );
}

function ScrubberRail() {
  return (
    <svg
      viewBox="0 0 1500 60" preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <line
        x1="0" y1="30" x2="1500" y2="30"
        stroke="rgba(242,234,216,0.2)" strokeDasharray="3 4"
      />
      {/* Tick marks at each day. */}
      {Array.from({ length: 31 }).map((_, i) => {
        const x = (i / 30) * 1500;
        return (
          <line
            key={i}
            x1={x} y1={i % 7 === 0 ? 18 : 24}
            x2={x} y2={i % 7 === 0 ? 42 : 36}
            stroke="rgba(242,234,216,0.18)"
            strokeWidth={i % 7 === 0 ? 1.2 : 0.6}
          />
        );
      })}
    </svg>
  );
}
